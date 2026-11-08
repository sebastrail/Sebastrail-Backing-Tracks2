// Motor de audio multipista basado en Web Audio API.
// Todas las pistas se decodifican en memoria y arrancan con el mismo
// instante de reloj, así quedan sincronizadas a nivel de muestra.

const RAMPA = 0.015; // segundos, evita clics al mutear/solear

export class Motor extends EventTarget {
  constructor() {
    super();
    this.ctx = null;
    this.maestro = null;
    this.pistas = [];
    this.duracion = 0;
    this.reproduciendo = false;
    this._offset = 0;      // posición (s) cuando está pausado
    this._inicio = 0;      // ctx.currentTime en que arrancó la reproducción
    this._fin = null;
  }

  _asegurarContexto() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'playback' });
      this.maestro = this.ctx.createGain();
      this.maestro.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /**
   * Descarga y decodifica todas las pistas.
   * @param {Array} defs  [{id, nombre, url, color, mute, ...}]
   * @param {(fraccion:number, texto:string)=>void} onProgreso
   */
  async cargar(defs, onProgreso = () => {}) {
    this.descargar();
    const ctx = this._asegurarContexto();
    const total = defs.length;
    const bytes = new Array(total).fill(0);
    const tamanos = new Array(total).fill(0);
    let decodificadas = 0;

    const informar = () => {
      const conocidos = tamanos.reduce((a, b) => a + b, 0);
      const recibidos = bytes.reduce((a, b) => a + b, 0);
      const fDescarga = conocidos ? recibidos / conocidos : 0;
      const f = fDescarga * 0.85 + (decodificadas / total) * 0.15;
      onProgreso(Math.min(1, f), `Cargando pistas… ${Math.round(f * 100)}%`);
    };

    const cargarUna = async (def, i) => {
      const resp = await fetch(def.url);
      if (!resp.ok) throw new Error(`No se pudo cargar ${def.nombre} (${resp.status})`);
      tamanos[i] = Number(resp.headers.get('content-length')) || 8e6;
      let datos;
      if (resp.body && resp.body.getReader) {
        const lector = resp.body.getReader();
        const trozos = [];
        for (;;) {
          const { done, value } = await lector.read();
          if (done) break;
          trozos.push(value);
          bytes[i] += value.byteLength;
          informar();
        }
        datos = new Uint8Array(bytes[i]);
        let p = 0;
        for (const t of trozos) { datos.set(t, p); p += t.byteLength; }
        datos = datos.buffer;
      } else {
        datos = await resp.arrayBuffer();
        bytes[i] = datos.byteLength;
      }
      const buffer = await new Promise((ok, mal) => {
        const r = ctx.decodeAudioData(datos, ok, mal);
        if (r && r.then) r.then(ok, mal);
      });
      decodificadas++;
      informar();
      return buffer;
    };

    // Descarga en paralelo limitada para no saturar conexiones móviles.
    const buffers = new Array(total);
    let siguiente = 0;
    const trabajador = async () => {
      while (siguiente < total) {
        const i = siguiente++;
        buffers[i] = await cargarUna(defs[i], i);
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, total) }, trabajador));

    this.pistas = defs.map((def, i) => {
      const salida = ctx.createGain();     // mute / solo
      const volumen = ctx.createGain();    // fader
      const paneo = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      salida.connect(volumen);
      if (paneo) { volumen.connect(paneo); paneo.connect(this.maestro); }
      else volumen.connect(this.maestro);
      return {
        ...def,
        buffer: buffers[i],
        mute: !!def.mute,
        muteInicial: !!def.mute,
        solo: false,
        volumen: 1,
        nodos: { salida, volumen, paneo },
        fuente: null,
      };
    });
    this.duracion = Math.max(...buffers.map(b => b.duration));
    this._offset = 0;
    this._aplicarMezcla(true);
    onProgreso(1, 'Listo');
  }

  descargar() {
    this.stop();
    for (const p of this.pistas) {
      p.nodos.salida.disconnect();
      p.nodos.volumen.disconnect();
      p.nodos.paneo && p.nodos.paneo.disconnect();
      p.buffer = null;
    }
    this.pistas = [];
    this.duracion = 0;
  }

  // ---- Transporte -------------------------------------------------------

  get tiempo() {
    if (!this.reproduciendo) return this._offset;
    return Math.min(this.duracion, this._offset + (this.ctx.currentTime - this._inicio));
  }

  async play() {
    if (this.reproduciendo || !this.pistas.length) return;
    const ctx = this._asegurarContexto();
    if (ctx.state !== 'running') await ctx.resume();
    if (this._offset >= this.duracion - 0.01) this._offset = 0;

    const cuando = ctx.currentTime + 0.06;
    for (const p of this.pistas) {
      const f = ctx.createBufferSource();
      f.buffer = p.buffer;
      f.connect(p.nodos.salida);
      f.start(cuando, Math.min(this._offset, p.buffer.duration));
      p.fuente = f;
    }
    this._inicio = cuando;
    this.reproduciendo = true;
    this._programarFin();
    this._emitir('estado');
  }

  pause() {
    if (!this.reproduciendo) return;
    this._offset = this.tiempo;
    this._detenerFuentes();
    this.reproduciendo = false;
    this._emitir('estado');
  }

  stop() {
    if (this.reproduciendo) this._detenerFuentes();
    this.reproduciendo = false;
    this._offset = 0;
    this._emitir('estado');
  }

  alternar() { this.reproduciendo ? this.pause() : this.play(); }

  async buscar(segundos) {
    const t = Math.max(0, Math.min(this.duracion, segundos));
    if (this.reproduciendo) {
      this._detenerFuentes();
      this.reproduciendo = false;
      this._offset = t;
      await this.play();
    } else {
      this._offset = t;
      this._emitir('estado');
    }
  }

  _detenerFuentes() {
    clearTimeout(this._fin);
    for (const p of this.pistas) {
      if (p.fuente) {
        try { p.fuente.stop(); } catch (_) {}
        p.fuente.disconnect();
        p.fuente = null;
      }
    }
  }

  _programarFin() {
    clearTimeout(this._fin);
    const restante = this.duracion - this.tiempo;
    this._fin = setTimeout(() => {
      if (this.reproduciendo && this.tiempo >= this.duracion - 0.05) {
        this._detenerFuentes();
        this.reproduciendo = false;
        this._offset = this.duracion;
        this._emitir('estado');
        this._emitir('fin');
      } else if (this.reproduciendo) {
        this._programarFin();
      }
    }, Math.max(50, restante * 1000 + 80));
  }

  // ---- Mezcla -------------------------------------------------------------

  /** Una pista suena si no está muteada y, cuando hay solos activos, está en solo. */
  audible(p) {
    const haySolo = this.pistas.some(x => x.solo);
    return !p.mute && (!haySolo || p.solo);
  }

  alternarMute(id) { const p = this._p(id); p.mute = !p.mute; this._aplicarMezcla(); }
  alternarSolo(id, exclusivo = false) {
    const p = this._p(id);
    const nuevo = !p.solo;
    if (exclusivo) this.pistas.forEach(x => (x.solo = false));
    p.solo = nuevo;
    this._aplicarMezcla();
  }
  fijarVolumen(id, v) {
    const p = this._p(id);
    p.volumen = v;
    p.nodos.volumen.gain.setTargetAtTime(v, this.ctx.currentTime, RAMPA);
  }
  fijarMaestro(v) {
    this._asegurarContexto();
    this.maestro.gain.setTargetAtTime(v, this.ctx.currentTime, RAMPA);
  }
  restablecer() {
    for (const p of this.pistas) { p.solo = false; p.mute = !!p.muteInicial; }
    this._aplicarMezcla();
  }

  _p(id) { return this.pistas.find(p => p.id === id); }

  _aplicarMezcla(inmediato = false) {
    const t = this.ctx.currentTime;
    for (const p of this.pistas) {
      const g = this.audible(p) ? 1 : 0;
      if (inmediato) p.nodos.salida.gain.value = g;
      else p.nodos.salida.gain.setTargetAtTime(g, t, RAMPA);
    }
    this._emitir('mezcla');
  }

  _emitir(tipo) { this.dispatchEvent(new Event(tipo)); }
}

/** Reduce un AudioBuffer a picos (máx. absoluto) para dibujar la forma de onda. */
export function calcularPicos(buffer, n = 2400) {
  const canales = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) canales.push(buffer.getChannelData(c));
  const largo = canales[0].length;
  const paso = Math.max(1, Math.floor(largo / n));
  const picos = new Float32Array(n);
  let max = 0;
  for (let i = 0; i < n; i++) {
    const ini = i * paso, fin = Math.min(largo, ini + paso);
    let m = 0;
    for (const d of canales) {
      for (let j = ini; j < fin; j += 4) { const v = d[j] < 0 ? -d[j] : d[j]; if (v > m) m = v; }
    }
    picos[i] = m;
    if (m > max) max = m;
  }
  return { picos, max };
}
