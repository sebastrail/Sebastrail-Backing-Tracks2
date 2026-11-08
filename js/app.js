import { Motor, calcularPicos } from './motor.js';

const $ = (s) => document.querySelector(s);
const motor = new Motor();

const vistas = { catalogo: $('#vista-catalogo'), reproductor: $('#vista-reproductor') };
const transporte = $('#transporte');
const botonPlay = $('#boton-play');
const lineaTiempo = $('#linea-tiempo');
const columnaOndas = $('#columna-ondas');

let catalogo = null;
let canciones = [];       // [{id, base, datos}]
let cancionActual = null; // id
let picosPorPista = new Map();
let cargaId = 0;

// ---------------------------------------------------------------- paleta
// Tonos de negro, rosa y blanco (identidad sebastrail.com). Los instrumentos
// alternan tinta y rosa; las guías y la mezcla de referencia van en grises claros.
const PALETA_INSTRUMENTOS = ['#1a1a1a', '#b76478', '#4a4043', '#d48a9e', '#7a6d70', '#8e3f57'];
const PALETA_GRUPO = { 'Guías': '#c9bcbc', 'Referencia': '#9a8f91' };

function asignarColores(pistas) {
  let i = 0;
  return pistas.map(p => ({
    ...p,
    color: p.color || PALETA_GRUPO[p.grupo] || PALETA_INSTRUMENTOS[i++ % PALETA_INSTRUMENTOS.length],
  }));
}

// ---------------------------------------------------------------- utilidades
const formatear = (s) => {
  if (!isFinite(s)) s = 0;
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
};
const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function json(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`No se pudo leer ${url}`);
  return r.json();
}

// ---------------------------------------------------------------- catálogo
async function cargarCatalogo() {
  if (catalogo) return;
  catalogo = await json('canciones/catalogo.json');
  $('#nombre-proyecto').textContent = catalogo.proyecto || 'Repertorio';
  $('#descripcion-proyecto').textContent = catalogo.descripcion || '';
  document.title = 'Repertorio · Sebastrail';
  canciones = await Promise.all(catalogo.canciones.map(async (id) => {
    const base = `canciones/${id}/`;
    try { return { id, base, datos: await json(base + 'cancion.json') }; }
    catch (e) { console.warn(e); return null; }
  }));
  canciones = canciones.filter(Boolean);
}

function pintarCatalogo(filtro = '') {
  const lista = $('#lista-canciones');
  const f = filtro.trim().toLowerCase();
  const visibles = canciones.filter(c => !f || [c.datos.titulo, c.datos.subtitulo, c.datos.artista].join(' ').toLowerCase().includes(f));
  $('#conteo-canciones').textContent = `${canciones.length} ${canciones.length === 1 ? 'canción' : 'canciones'}`;
  if (!visibles.length) { lista.innerHTML = `<li class="vacio">No hay canciones que coincidan.</li>`; return; }
  lista.innerHTML = visibles.map(c => {
    const d = c.datos;
    const meta = [d.artista, d.tonalidad && `Tono ${d.tonalidad}`, d.bpm && `${d.bpm} BPM`, d.duracion && formatear(d.duracion), `${d.pistas.length} pistas`].filter(Boolean).join(' · ');
    const chips = d.pistas.filter(p => p.grupo !== 'Referencia' && p.grupo !== 'Guías').map(p => `<span class="chip">${escapar(p.nombre)}</span>`).join('');
    const iniciales = (d.titulo || '?').slice(0, 3).toUpperCase();
    return `<li><a class="tarjeta" href="#/cancion/${encodeURIComponent(c.id)}">
      <span class="tarjeta-portada">${escapar(iniciales)}</span>
      <span class="tarjeta-texto"><h3>${escapar(d.titulo)}${d.subtitulo ? ` <small>— ${escapar(d.subtitulo)}</small>` : ''}</h3>
      <p>${escapar(meta)}</p></span>
      <span class="chips">${chips}</span>
      <span class="tarjeta-flecha" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span></a></li>`;
  }).join('');
}

// ---------------------------------------------------------------- reproductor
async function abrirCancion(id) {
  const c = canciones.find(x => x.id === id);
  if (!c) { location.hash = '#/'; return; }
  if (cancionActual === id && motor.pistas.length) return;
  cancionActual = id;
  const mio = ++cargaId;
  const d = c.datos;

  $('#titulo-cancion').innerHTML = escapar(d.titulo) + (d.subtitulo ? ` <small>${escapar(d.subtitulo)}</small>` : '');
  $('#meta-cancion').textContent = [d.artista, d.tonalidad && `Tono ${d.tonalidad}`, d.bpm && `${d.bpm} BPM`, `${d.pistas.length} pistas`, d.notas].filter(Boolean).join(' · ');
  document.title = `${d.titulo} · Repertorio · Sebastrail`;

  $('#mezclador-marco').hidden = true;
  const carga = $('#carga');
  carga.hidden = false; carga.classList.remove('error');
  $('#carga-relleno').style.width = '0%';
  $('#carga-texto').textContent = 'Cargando pistas…';
  botonPlay.disabled = true;

  try {
    await motor.cargar(
      asignarColores(d.pistas).map(p => ({ ...p, url: new URL(p.archivo, new URL(c.base, location.href)).href })),
      (f, texto) => {
        if (mio !== cargaId) return;
        $('#carga-relleno').style.width = `${(f * 100).toFixed(1)}%`;
        $('#carga-texto').textContent = texto;
      }
    );
  } catch (e) {
    if (mio !== cargaId) return;
    console.error(e);
    carga.classList.add('error');
    $('#carga-texto').textContent = `Error: ${e.message}`;
    return;
  }
  if (mio !== cargaId) return;

  picosPorPista = new Map(motor.pistas.map(p => [p.id, calcularPicos(p.buffer)]));
  construirMezclador();
  carga.hidden = true;
  $('#mezclador-marco').hidden = false;
  botonPlay.disabled = false;
  lineaTiempo.setAttribute('aria-valuemax', Math.round(motor.duracion));
  $('#tiempo-total').textContent = formatear(motor.duracion);
  dibujarTodo();
  actualizarCabezal();
}

function construirMezclador() {
  const controles = $('#controles-pistas');
  const ondas = $('#ondas-pistas');
  controles.innerHTML = '';
  ondas.innerHTML = '';
  const plantilla = $('#plantilla-control');

  for (const p of motor.pistas) {
    const nodo = plantilla.content.firstElementChild.cloneNode(true);
    nodo.dataset.id = p.id;
    nodo.style.setProperty('--c', p.color);
    const nombre = nodo.querySelector('.nombre-pista');
    nombre.innerHTML = `${p.grupo ? `<span class="grupo-etiqueta">${escapar(p.grupo)}</span>` : ''}${escapar(p.nombre)}`;
    nombre.title = p.nombre;
    nodo.querySelector('.boton-m').addEventListener('click', () => motor.alternarMute(p.id));
    nodo.querySelector('.boton-s').addEventListener('click', (e) => motor.alternarSolo(p.id, e.altKey));
    const vol = nodo.querySelector('.volumen-pista');
    vol.setAttribute('aria-label', `Volumen de ${p.nombre}`);
    const pintarVol = () => vol.style.setProperty('--v', `${(vol.value / vol.max) * 100}%`);
    vol.addEventListener('input', () => { motor.fijarVolumen(p.id, Number(vol.value)); pintarVol(); });
    vol.addEventListener('dblclick', () => { vol.value = 1; motor.fijarVolumen(p.id, 1); pintarVol(); });
    pintarVol();
    controles.appendChild(nodo);

    const carril = document.createElement('div');
    carril.className = 'onda-pista';
    carril.dataset.id = p.id;
    carril.appendChild(document.createElement('canvas'));
    ondas.appendChild(carril);
  }
  actualizarEstadoMezcla();
}

function actualizarEstadoMezcla() {
  for (const p of motor.pistas) {
    const audible = motor.audible(p);
    const ctrl = document.querySelector(`.control-pista[data-id="${p.id}"]`);
    const carril = document.querySelector(`.onda-pista[data-id="${p.id}"]`);
    if (!ctrl) continue;
    ctrl.querySelector('.boton-m').setAttribute('aria-pressed', p.mute);
    ctrl.querySelector('.boton-s').setAttribute('aria-pressed', p.solo);
    ctrl.classList.toggle('inaudible', !audible);
    carril.classList.toggle('inaudible', !audible);
  }
}

// ---------------------------------------------------------------- dibujo
function prepararCanvas(cv) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}

function dibujarOnda(carril) {
  const p = motor.pistas.find(x => x.id === carril.dataset.id);
  const datos = picosPorPista.get(p.id);
  if (!p || !datos) return;
  const { g, w, h } = prepararCanvas(carril.querySelector('canvas'));
  const { picos, max } = datos;
  // Normaliza cada pista para que stems suaves también se vean; limita la ganancia visual.
  const escala = max > 0 ? Math.min(1 / max, 6) : 1;
  const mitad = h / 2, alto = mitad - 6;
  const relPista = p.buffer.duration / motor.duracion;
  const ancho = w * relPista;
  g.fillStyle = p.color;
  const barras = Math.max(1, Math.floor(ancho / 2));
  for (let i = 0; i < barras; i++) {
    const a = Math.floor((i / barras) * picos.length);
    const b = Math.max(a + 1, Math.floor(((i + 1) / barras) * picos.length));
    let m = 0;
    for (let j = a; j < b; j++) if (picos[j] > m) m = picos[j];
    const v = Math.max(0.5, Math.sqrt(m * escala) * alto); // raíz: más legible
    g.fillRect(i * 2, mitad - v, 1.4, v * 2);
  }
  g.fillStyle = 'rgba(155,111,120,0.10)';
  g.fillRect(0, mitad, w, 1);
}

function dibujarRegla() {
  const cv = $('#regla');
  const { g, w, h } = prepararCanvas(cv);
  const dur = motor.duracion || 1;
  const pxPorSeg = w / dur;
  const pasos = [1, 2, 5, 10, 15, 30, 60, 120];
  const paso = pasos.find(s => s * pxPorSeg >= 60) || 300;
  const sub = paso >= 10 ? paso / 5 : paso / 2;
  g.font = '500 11px Jost, Arial, sans-serif';
  g.textBaseline = 'middle';
  for (let t = 0; t <= dur; t += sub) {
    const x = Math.round(t * pxPorSeg) + 0.5;
    const mayor = Math.abs(t / paso - Math.round(t / paso)) < 1e-6;
    g.fillStyle = mayor ? '#d9c6c2' : '#ebdfdc';
    g.fillRect(x, mayor ? h - 10 : h - 5, 1, mayor ? 10 : 5);
    if (mayor) { g.fillStyle = '#9b6f78'; g.fillText(formatear(t), x + 4, h / 2 - 2); }
  }
}

function dibujarTodo() {
  if (!motor.pistas.length) return;
  dibujarRegla();
  document.querySelectorAll('.onda-pista').forEach(dibujarOnda);
}

function actualizarCabezal() {
  const t = motor.tiempo, dur = motor.duracion || 1;
  const f = Math.min(1, t / dur);
  const ancho = columnaOndas.clientWidth;
  $('#cabezal').style.transform = `translateX(${f * ancho}px)`;
  $('#atenuador').style.left = `${f * ancho}px`;
  $('#linea-progreso').style.width = `${f * 100}%`;
  $('#linea-perilla').style.left = `${f * 100}%`;
  $('#tiempo-actual').textContent = formatear(t);
  lineaTiempo.setAttribute('aria-valuenow', Math.round(t));
  lineaTiempo.setAttribute('aria-valuetext', `${formatear(t)} de ${formatear(dur)}`);
}

function bucle() {
  if (motor.reproduciendo) actualizarCabezal();
  requestAnimationFrame(bucle);
}

// ---------------------------------------------------------------- interacción
function arrastrarParaBuscar(elemento, calcular) {
  let activo = false;
  const mover = (e) => {
    const r = elemento.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    calcular(f);
  };
  elemento.addEventListener('pointerdown', (e) => {
    if (!motor.duracion || e.button !== 0) return;
    activo = true;
    elemento.setPointerCapture(e.pointerId);
    mover(e);
  });
  elemento.addEventListener('pointermove', (e) => { if (activo) mover(e); });
  const soltar = () => { activo = false; };
  elemento.addEventListener('pointerup', soltar);
  elemento.addEventListener('pointercancel', soltar);
}

// Durante un arrastre, actualiza la vista al instante pero solo reinicia el audio cada tanto.
let busquedaPendiente = null;
function buscarFraccion(f) {
  const t = f * motor.duracion;
  if (!motor.reproduciendo) { motor.buscar(t); actualizarCabezal(); return; }
  clearTimeout(busquedaPendiente);
  busquedaPendiente = setTimeout(() => motor.buscar(t), 40);
  const ancho = columnaOndas.clientWidth;
  $('#cabezal').style.transform = `translateX(${f * ancho}px)`;
}

arrastrarParaBuscar(lineaTiempo, buscarFraccion);
arrastrarParaBuscar(columnaOndas, buscarFraccion);

columnaOndas.addEventListener('pointermove', (e) => {
  const r = columnaOndas.getBoundingClientRect();
  $('#hover').style.left = `${e.clientX - r.left}px`;
});

botonPlay.addEventListener('click', () => motor.alternar());
$('#boton-stop').addEventListener('click', () => motor.stop());
$('#boton-restablecer').addEventListener('click', () => {
  motor.restablecer();
  document.querySelectorAll('.volumen-pista').forEach((v, i) => {
    v.value = 1; motor.fijarVolumen(motor.pistas[i].id, 1);
    v.style.setProperty('--v', `${(1 / v.max) * 100}%`);
  });
});

const volMaestro = $('#volumen-maestro');
const pintarMaestro = () => volMaestro.style.setProperty('--v', `${(volMaestro.value / volMaestro.max) * 100}%`);
volMaestro.addEventListener('input', () => { motor.fijarMaestro(Number(volMaestro.value)); pintarMaestro(); });
pintarMaestro();

lineaTiempo.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault(); e.stopPropagation();
    motor.buscar(motor.tiempo + (e.key === 'ArrowLeft' ? -5 : 5));
  }
});

document.addEventListener('keydown', (e) => {
  if (vistas.reproductor.hidden || !motor.pistas.length) return;
  if (e.target.matches('input, textarea, [contenteditable]')) return;
  if (e.code === 'Space') { e.preventDefault(); motor.alternar(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); motor.buscar(motor.tiempo - 5); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); motor.buscar(motor.tiempo + 5); }
  else if (e.key === 'Home') { e.preventDefault(); motor.buscar(0); }
});

motor.addEventListener('estado', () => {
  transporte.classList.toggle('reproduciendo', motor.reproduciendo);
  botonPlay.setAttribute('aria-label', motor.reproduciendo ? 'Pausa' : 'Reproducir');
  actualizarCabezal();
});
motor.addEventListener('mezcla', actualizarEstadoMezcla);

$('#buscador').addEventListener('input', (e) => pintarCatalogo(e.target.value));

let redimension = null;
new ResizeObserver(() => {
  cancelAnimationFrame(redimension);
  redimension = requestAnimationFrame(() => { dibujarTodo(); actualizarCabezal(); });
}).observe(columnaOndas);

// ---------------------------------------------------------------- rutas
async function enrutar() {
  try { await cargarCatalogo(); }
  catch (e) {
    vistas.catalogo.hidden = false;
    $('#lista-canciones').innerHTML = `<li class="vacio">No se pudo cargar el catálogo. Si abriste el archivo directamente, sírvelo con un servidor web (ver README).</li>`;
    return;
  }
  const m = location.hash.match(/^#\/cancion\/(.+)$/);
  if (m) {
    vistas.catalogo.hidden = true;
    vistas.reproductor.hidden = false;
    transporte.hidden = false;
    abrirCancion(decodeURIComponent(m[1]));
  } else {
    if (motor.pistas.length) { motor.descargar(); cancionActual = null; cargaId++; }
    vistas.reproductor.hidden = true;
    transporte.hidden = true;
    vistas.catalogo.hidden = false;
    document.title = 'Repertorio · Sebastrail';
    pintarCatalogo($('#buscador').value);
  }
}

window.addEventListener('hashchange', enrutar);
enrutar();
requestAnimationFrame(bucle);

// Redibuja la regla cuando termine de cargar la tipografía Jost.
if (document.fonts) document.fonts.ready.then(() => dibujarTodo());
