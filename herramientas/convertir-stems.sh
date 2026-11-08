#!/bin/zsh
# Convierte una exportación de Ableton ("Todas las pistas individuales") en los
# stems del reproductor. Descarta pistas en silencio y las que son sumas/retornos.
#
# uso: herramientas/convertir-stems.sh <carpeta-wav> <prefijo> <id-cancion> [segundos]
#   <carpeta-wav>  carpeta con "<prefijo> <Pista>.wav" y "<prefijo>.wav" (mezcla)
#   <prefijo>      nombre de archivo usado al exportar (p. ej. "ai")
#   <id-cancion>   carpeta destino en canciones/ (p. ej. "ai")
#   [segundos]     opcional: recorta todas las pistas a esa duración (silencio final)
#
# Formato (igual que 703): AAC 48 kHz, 96 kbps estéreo; guías (metrónomo, cue)
# en mono a 48 kbps. Imprime las pistas convertidas como "id|archivo|pista Ableton".
set -e
SRC="$1"; PRE="$2"; ID="$3"; DUR="$4"   # opcional: recortar a DUR segundos
RAIZ="${0:A:h:h}"
DEST="$RAIZ/canciones/$ID/stems"
mkdir -p "$DEST"
TMP=$(mktemp -d)

pico() { # pico en dBFS (aprox., remuestreado a 8 kHz mono)
  afconvert -f WAVE -d LEI16@8000 -c 1 "$1" "$TMP/p.wav" 2>/dev/null
  ruby -e 'b=File.binread(ARGV[0]); d=b[(b.index("data")+8)..-1].unpack("s<*"); m=d.map(&:abs).max||0; puts m==0 ? -999 : (20*Math.log10(m/32768.0)).round(1)' "$TMP/p.wav"
}

# pista Ableton -> id de stem | modo (e = estéreo, m = mono)
typeset -A MAPA MODO
MAPA=( "Batería" bateria  "Bajo" bajo  "Bajo MIDI" bajo  "Piano" piano  "Guitarra Eléctrica" guitarra-electrica
       "Trpt" trompeta  "Secuencias" secuencias  "20-Audio" audio  "3-Metrónomo" metronomo  "Cue" cue )
MODO=( metronomo m  cue m )

convertir() { # $1 wav, $2 id
  if [[ -n "$DUR" ]]; then ruby "$RAIZ/herramientas/recortar-wav.rb" "$1" "$TMP/r.wav" "$DUR"; set -- "$TMP/r.wav" "$2"; fi
  if [[ "${MODO[$2]}" == m ]]; then
    afconvert -f m4af -d aac@48000 -c 1 -b 48000 "$1" "$DEST/$2.m4a"
  else
    afconvert -f m4af -d aac@48000 -c 2 -b 96000 "$1" "$DEST/$2.m4a"
  fi
}

for pista in "Batería" "Bajo" "Bajo MIDI" "Piano" "Guitarra Eléctrica" "Trpt" "Secuencias" "20-Audio" "3-Metrónomo" "Cue"; do
  f="$SRC/$PRE $pista.wav"
  [[ -f "$f" ]] || continue
  id="${MAPA[$pista]}"
  [[ -f "$DEST/$id.m4a" && "$pista" == "Bajo MIDI" && -n "$HAY_BAJO" ]] && continue
  p=$(pico "$f")
  if (( p < -60 )); then continue; fi
  [[ "$id" == bajo ]] && HAY_BAJO=1
  convertir "$f" "$id"
  echo "$id|stems/$id.m4a|$pista|$p"
done
convertir "$SRC/$PRE.wav" mezcla
echo "mezcla|stems/mezcla.m4a|(mezcla)|$(pico "$SRC/$PRE.wav")"
rm -rf "$TMP"
