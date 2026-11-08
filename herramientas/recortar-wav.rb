# Recorta un WAV PCM a N segundos (copia el encabezado y ajusta tamaños).
# uso: ruby herramientas/recortar-wav.rb entrada.wav salida.wav segundos
ent, sal, seg = ARGV
File.open(ent, 'rb') do |f|
  riff = f.read(12)
  partes = []; fmt = nil
  loop do
    id = f.read(4); tam = f.read(4).unpack1('V')
    if id == 'data'
      bloque = fmt[12, 2].unpack1('v'); tasa = fmt[4, 4].unpack1('V')
      n = [(seg.to_f * tasa).round * bloque, tam].min
      File.open(sal, 'wb') do |o|
        cuerpo = partes.join
        o.write('RIFF' + [4 + cuerpo.bytesize + 8 + n].pack('V') + 'WAVE' + cuerpo + 'data' + [n].pack('V'))
        restante = n
        while restante > 0
          trozo = f.read([restante, 8 << 20].min); o.write(trozo); restante -= trozo.bytesize
        end
      end
      break
    end
    datos = f.read(tam + (tam & 1))
    fmt = datos if id == 'fmt '
    partes << id + [tam].pack('V') + datos
  end
end
