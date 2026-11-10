# encoding: utf-8
# Calcula cuándo suena cada compás de la partitura en el audio exportado de
# Ableton, usando el mapa de tempo REAL del set (rampas incluidas) en vez del
# tempo de MuseScore. Así no importan calderones, rit. ni diferencias de tempo
# entre MuseScore y Ableton: solo cuentan los pulsos.
#
# Uso:
#   ruby mapa-tiempos.rb <partitura.mscz> <completa.mpos> <set.als> <pulso-locator> <pulso-inicio-midi> <salida.json>
#
#   completa.mpos     : "mscore -o completa.mpos partitura.mscz" (partitura general, no una parte)
#   pulso-locator     : pulso del locator de la canción = inicio del stem (ej. Flood 10544)
#   pulso-inicio-midi : pulso donde empiezan los clips MIDI = compás 1 (ej. Flood 10552)
#
# Salida: [[segundos MuseScore, segundos audio], …] por compás tocado, para
#   ruby preparar-partitura.rb parte.mpos <salida.json> …
require 'json'
require 'zlib'

mscz, mpos, als, locator, inicio, salida = ARGV
abort 'Faltan argumentos (ver cabecera del script)' unless salida
locator = locator.to_f; inicio = inicio.to_f

# --- longitud de cada compás (en negras), del primer pentagrama
mscx = `unzip -p "#{mscz}" '*.mscx' -x 'Excerpts/*'`.force_encoding('UTF-8')
pentagrama = mscx[/<Staff id="1">.*?<\/Staff>/m] or abort 'No se encontró el pentagrama 1'
num, den = 4, 4
largos = pentagrama.scan(/<Measure.*?<\/Measure>/m).map do |m|
  if (n = m[/<sigN>(\d+)/, 1]) then num = n.to_i; den = m[/<sigD>(\d+)/, 1].to_i end
  m =~ /<Measure len="(\d+)\/(\d+)"/ ? $1.to_f / $2.to_f * 4 : num * 4.0 / den
end

# --- orden de reproducción (repeticiones desplegadas) desde el .mpos
x = File.read(mpos, encoding: 'UTF-8')
elementos = x.scan(/<element id=/).size
abort "El .mpos tiene #{elementos} elementos y la partitura #{largos.size} compases: exporta la partitura general sin compases de espera agrupados" if elementos != largos.size
eventos = x.scan(/<event elid="(\d+)" position="(\d+)"/).map { |e, ms| [e.to_i, ms.to_i / 1000.0] }

# --- mapa de tempo de Ableton (automatización de Tempo en MainTrack)
set = Zlib::GzipReader.open(als) { |g| g.read }.force_encoding('UTF-8')
main = set[/<MainTrack.*?<\/MainTrack>/m]
id = main[/<Tempo>.*?<AutomationTarget Id="(\d+)"/m, 1]
env = main.scan(/<AutomationEnvelope Id="\d+">.*?<\/AutomationEnvelope>/m).find { |e| e[/<PointeeId Value="(\d+)"/, 1] == id }
puntos = env.scan(/<FloatEvent Id="\d+" Time="([-\d.]+)" Value="([-\d.]+)"/).map { |t, v| [t.to_f, v.to_f] }
puntos = [[-1e9, puntos.first[1]]] + puntos.select { |t, _| t > -1e8 } + [[1e9, puntos.last[1]]]

# Segundos entre los pulsos a y b (tempo lineal entre puntos de automatización).
def segundos(puntos, a, b)
  total = 0.0
  puntos.each_cons(2) do |(t1, v1), (t2, v2)|
    next if t2 <= t1
    lo, hi = [a, t1].max, [b, t2].min
    next if hi <= lo
    va = v1 + (v2 - v1) * (lo - t1) / (t2 - t1)
    vb = v1 + (v2 - v1) * (hi - t1) / (t2 - t1)
    total += (va - vb).abs < 1e-6 ? 60.0 * (hi - lo) / va : 60.0 * (hi - lo) * Math.log(vb / va) / (vb - va)
  end
  total
end

pulso = 0.0
mapa = eventos.map do |e, t|
  par = [t.round(3), segundos(puntos, locator, inicio + pulso).round(3)]
  pulso += largos[e]
  par
end
File.write(salida, JSON.generate(mapa))
puts "#{mapa.size} compases tocados, #{pulso} pulsos; compás 1 en #{mapa.first[1]} s, último en #{mapa.last[1]} s"
