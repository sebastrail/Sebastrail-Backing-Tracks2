# encoding: utf-8
# Convierte la exportación de MuseScore de UNA parte (páginas .svg + .mpos)
# en el formato que usa el reproductor:
#   <destino>/<id>.json      compases (posición en la página) y tiempos
#   <destino>/<id>-N.svg     páginas
#
# Uso:
#   ruby preparar-partitura.rb <parte.mpos> <desfase-seg> <carpeta-destino> <id> pagina-1.svg [pagina-2.svg …]
#
# <desfase-seg>: segundos entre el inicio del stem y el compás 1 de la partitura
# (en 703: 6 pulsos de cuenta a 108 BPM = 3.3333 s).
# Los tiempos del .mpos ya vienen con las repeticiones desplegadas.
require 'json'
require 'fileutils'

mpos, desfase, destino, id, *paginas = ARGV
abort 'Faltan argumentos (ver cabecera del script)' if paginas.empty?
desfase = desfase.to_f
x = File.read(mpos, encoding: 'UTF-8')

# Las coordenadas del .mpos están en 1/12 de las unidades del viewBox del SVG.
FACTOR = 12.0
compases = x.scan(/<element id="(\d+)" x="([\d.]+)" y="([\d.]+)" sx="([\d.]+)" sy="([\d.]+)" page="(\d+)"/).map do |i, cx, cy, w, h, pg|
  [pg.to_i, *[cx, cy, w, h].map { |v| (v.to_f / FACTOR).round(1) }]
end
# Segundo argumento: un número (desfase fijo, tempo idéntico en MuseScore y
# Ableton) o un mapa .json de mapa-tiempos.rb (tempo real del set).
if File.file?(ARGV[1])
  mapa = JSON.parse(File.read(ARGV[1]))
  a_audio = lambda do |t|
    i = mapa.rindex { |m, _| m <= t + 1e-6 } || 0
    m0, a0 = mapa[i]
    m1, a1 = mapa[i + 1] || [m0 + 1, a0 + 1]
    a0 + (t - m0) * (a1 - a0) / (m1 - m0)
  end
  desfase = mapa.first[1] - mapa.first[0]
else
  a_audio = ->(t) { t + desfase }
end
eventos = x.scan(/<event elid="(\d+)" position="(\d+)"/).map { |e, ms| [e.to_i, a_audio.(ms.to_i / 1000.0).round(3)] }

svg1 = File.read(paginas.first, encoding: 'UTF-8')
vb = svg1[/viewBox="([^"]+)"/, 1].split.map(&:to_f)

FileUtils.mkdir_p(destino)
nombres = paginas.each_with_index.map do |p, i|
  n = "#{id}-#{i + 1}.svg"
  # Sin saltos de línea ni comentarios: pesa menos.
  # Coordenadas con 1 decimal (1/12000 de pulgada): invisible y ~20 % más liviano.
  s = File.read(p, encoding: 'UTF-8').gsub(/<!--.*?-->/m, '').gsub(/>\s+</, '><').gsub(/(\d\.\d)\d+/, '\1')
  File.write(File.join(destino, n), s)
  n
end

File.write(File.join(destino, "#{id}.json"), JSON.generate({
  ancho: vb[2], alto: vb[3], desfase: desfase,
  paginas: nombres, compases: compases, eventos: eventos
}))
puts "#{id}: #{nombres.size} páginas, #{compases.size} compases, #{eventos.size} eventos"
