# Protocolo para reemplazar stems (fase beta)

Los backing tracks están en **beta**. Algunos stems (bajos, guitarras MIDI…)
se van a reemplazar por versiones nuevas. Este protocolo hace que un reemplazo
sea solo **cambiar un archivo y subir un número**, sin tocar el resto.

## Principios

1. **Cada stem tiene un id fijo** que no cambia nunca. El archivo se llama
   `canciones/<cancion>/stems/<id>.m4a`. Reemplazar = sobrescribir ese archivo
   con el mismo nombre.
2. **`"v"` en `cancion.json`** es la versión del stem. Al reemplazar, súbela
   (1 → 2 → 3…). El reproductor la añade a la URL (`bajo.m4a?v=2`) para que
   ningún navegador siga usando la copia vieja.
3. **Mismo punto de inicio y misma duración** que la mezcla de la canción.
   Todos los stems empiezan en el locator de la canción y duran lo mismo; si no,
   se desincronizan.
4. **Los WAV originales se guardan** en el disco Hikari:
   `Hikari Records/Artistas/Sebastrail/Live/Stems Repertorio/<cancion>/`.

## Ids de stem

| id                   | Pista en el reproductor | Pista de Ableton        | Formato               |
|----------------------|-------------------------|-------------------------|-----------------------|
| `bateria`            | Batería                 | Batería                 | AAC estéreo 96 kbps   |
| `bajo`               | Bajo                    | Bajo (grupo) / Bajo MIDI| AAC estéreo 96 kbps   |
| `piano`              | Piano                   | Piano                   | AAC estéreo 96 kbps   |
| `guitarra-electrica` | Guitarra eléctrica      | Guitarra Eléctrica      | AAC estéreo 96 kbps   |
| `trompeta`           | Trompeta                | Trpt                    | AAC estéreo 96 kbps   |
| `secuencias`         | Secuencias              | Secuencias              | AAC estéreo 96 kbps   |
| `audio`              | Audio                   | 20-Audio                | AAC estéreo 96 kbps   |
| `metronomo`          | Metrónomo (guía)        | 3-Metrónomo             | AAC mono 48 kbps      |
| `cue`                | Cues (guía)             | Cue                     | AAC mono 48 kbps      |
| `mezcla`             | Mezcla completa         | Main                    | AAC estéreo 96 kbps   |

Los retornos (A-Reverb, B-Delay) y los grupos que solo suman pistas no se usan
como stems; las pistas sin sonido en el tramo de la canción se descartan.

## Tramos de cada canción en "EN VIVO - ALS"

Valores para **Archivo → Exportar Audio/Video** (Inicio en compases reales;
Duración en unidades de 4 tiempos, que es como la mide Ableton en este set).

| Canción              | id                    | Inicio   | Duración | Exportado (s) | Stem final (s) |
|----------------------|-----------------------|----------|----------|---------------|----------------|
| Ai (愛)              | `ai`                  | 3.1.1    | 187.0.0  | 289.55        | 289.55         |
| Friends              | `friends`             | 190.1.1  | 220.0.0  | 459.13        | 361            |
| Contrastes           | `contrastes`          | 410.1.1  | 357.0.0  | 519.27        | 418            |
| Venus                | `venus`               | 985.1.1  | 274.0.0  | 440.53        | 262            |
| Little Red Sunshine  | `little-red-sunshine` | 1259.1.1 | 273.1.0  | 728.67        | 253            |
| Flood                | `flood`               | 2813.1.1 | 241.0.0  | 529.34        | 529.34         |

"Stem final": en el set, varias canciones terminan bastante antes del siguiente
locator (el resto es silencio de transición). Por eso los stems se recortaron al
último sonido de la mezcla + 3 s. Un stem de reemplazo debe tener **esa** duración:
expórtalo con el mismo Inicio/Duración y recórtalo igual:
`ruby herramientas/recortar-wav.rb entrada.wav salida.wav <segundos>`
(o pasa los segundos como 4.º argumento de `convertir-stems.sh`).

Ajustes de exportación: WAV 24 bits, 48 kHz, sin normalizar, "Incluir efectos de
retorno y del master" en Off. Para un solo stem: "Pista renderizada" = esa pista.
Para todos: "Todas las pistas individuales".

## Pasos para reemplazar un stem

1. **Exportar** desde Ableton solo la pista nueva con el tramo de la tabla
   (o entregar un WAV que empiece exactamente en el locator y dure lo mismo).
2. **Comprobar la duración** frente a la de la tabla:
   ```bash
   afinfo "nuevo-bajo.wav" | grep duration
   ```
3. **Convertir** al formato del reproductor, con el nombre del id:
   ```bash
   afconvert -f m4af -d aac@48000 -c 2 -b 96000 "nuevo-bajo.wav" canciones/venus/stems/bajo.m4a
   ```
   (guías: `-c 1 -b 48000`).
4. **Editar `canciones/<cancion>/cancion.json`:** subir `"v"` de esa pista.
   Si el stem es nuevo en esa canción (por ejemplo, Venus todavía no tiene bajo),
   añadir una línea con el id de la tabla, en el orden de la tabla.
   Si cambia el origen, actualizar `"fuente"` (por ejemplo `"Bajo grabado"`).
5. **Probar en local:** `ruby -run -e httpd . -p 8643` → http://localhost:8643/
6. **Publicar** en GitHub: subir `stems/<id>.m4a` a
   `canciones/<cancion>/stems/` y el `cancion.json` a `canciones/<cancion>/`.
7. Cuando una canción deje de ser beta, cambiar `"estado": "beta"` por
   `"estado": "final"`.

## Herramientas

- `herramientas/convertir-stems.sh <carpeta-wav> <prefijo> <id>`: convierte una
  exportación completa de Ableton (descarta silencios, retornos y grupos).
- `herramientas/crear-cancion.rb <id> "<Título>" <bpm> ["<subtítulo>"]`: crea el
  `cancion.json` inicial a partir de los stems que haya (no sobrescribe).

> Excepción: en GitHub, los stems de "703-prueba-claude" están en la raíz del
> repositorio y su `cancion.json` remoto usa rutas `../../x.m4a`.
