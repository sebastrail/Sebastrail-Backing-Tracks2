# encoding: utf-8
# Genera canciones/<id>/cancion.json a partir de los .m4a que haya en stems/.
# uso: ruby herramientas/crear-cancion.rb <id> "<Título>" <bpm> ["<subtítulo>"]
# No sobrescribe un cancion.json existente (bórralo antes si quieres regenerarlo).
require 'json'
id, titulo, bpm, sub = ARGV.map { |a| a.dup.force_encoding("UTF-8") }
raiz = File.expand_path('..', __dir__)
dir = File.join(raiz, 'canciones', id)
destino = File.join(dir, 'cancion.json')
abort "Ya existe #{destino}" if File.exist?(destino)

# Orden y nombres de pista del reproductor. "fuente" = pista de Ableton de origen.
PISTAS = [
  ['bateria',            'Batería',            'Instrumentos', 'Batería'],
  ['bajo',               'Bajo',               'Instrumentos', 'Bajo / Bajo MIDI'],
  ['piano',              'Piano',              'Instrumentos', 'Piano'],
  ['guitarra-electrica', 'Guitarra eléctrica', 'Instrumentos', 'Guitarra Eléctrica'],
  ['trompeta',           'Trompeta',           'Instrumentos', 'Trpt'],
  ['secuencias',         'Secuencias',         'Instrumentos', 'Secuencias'],
  ['audio',              'Audio',              'Instrumentos', '20-Audio'],
  ['metronomo',          'Metrónomo',          'Guías',        '3-Metrónomo'],
  ['cue',                'Cues',               'Guías',        'Cue'],
  ['mezcla',             'Mezcla completa',    'Referencia',   'Main'],
]
pistas = PISTAS.select { |pid, *| File.exist?(File.join(dir, 'stems', "#{pid}.m4a")) }.map do |pid, nombre, grupo, fuente|
  h = { 'id' => pid, 'nombre' => nombre, 'archivo' => "stems/#{pid}.m4a", 'grupo' => grupo, 'fuente' => fuente, 'v' => 1 }
  h['mute'] = true if grupo != 'Instrumentos'
  h
end
dur = `afinfo "#{File.join(dir, 'stems', 'mezcla.m4a')}"`[/estimated duration: ([\d.]+)/, 1].to_f.round(2)
datos = {
  'titulo' => titulo, 'subtitulo' => sub.to_s, 'artista' => 'Sebastrail', 'tonalidad' => '',
  'bpm' => bpm.to_i, 'duracion' => dur, 'estado' => 'beta',
  'notas' => 'Versión beta del backing track.', 'pistas' => pistas,
}
# Una pista por línea, como en 703.
lineas = pistas.map { |p| '    ' + JSON.generate(p).gsub('":', '": ').gsub(',"', ', "') }
cab = datos.reject { |k, _| k == 'pistas' }.map { |k, v| "  #{JSON.generate(k)}: #{JSON.generate(v)}" }
File.write(destino, "{\n#{cab.join(",\n")},\n  \"pistas\": [\n#{lineas.join(",\n")}\n  ]\n}\n")
puts destino
