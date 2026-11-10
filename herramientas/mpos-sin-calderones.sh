#!/bin/bash
# Exporta el .mpos (posición y tiempo de cada compás) de una partitura de
# MuseScore quitando antes los calderones, que MuseScore alarga al reproducir
# pero Ableton no. Así la partitura general y todas las partes comparten la
# misma base de tiempo. Las páginas .svg se exportan del archivo original.
#
# Uso: herramientas/mpos-sin-calderones.sh <archivo.mscz> <salida.mpos>
set -e
ENTRADA="$1"; SALIDA="$2"
[ -f "$ENTRADA" ] && [ -n "$SALIDA" ] || { echo "Uso: $0 <archivo.mscz> <salida.mpos>"; exit 1; }
MSCORE="/Applications/MuseScore 4.app/Contents/MacOS/mscore"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/mpos.XXXXXX")
mkdir "$TMP/x"
unzip -q "$ENTRADA" -d "$TMP/x"
find "$TMP/x" -name '*.mscx' -exec ruby -e 'ARGV.each { |f| s = File.binread(f); File.binwrite(f, s.gsub(/<Fermata>.*?<\/Fermata>\s*/m, "")) }' {} +
(cd "$TMP/x" && zip -q -r -X ../sin.mscz .)
# mscore termina con un error al cerrarse (exit 134) aunque el archivo se escribe bien.
"$MSCORE" -o "$SALIDA" "$TMP/sin.mscz" >/dev/null 2>&1 || true
[ -s "$SALIDA" ] || { echo "No se generó $SALIDA"; exit 1; }
echo "$SALIDA: $(grep -c '<event' "$SALIDA") eventos"
