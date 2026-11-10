# Repertorio

Reproductor multipista del repertorio: cada canción se abre con sus stems en
canales separados, con **Mute**, **Solo** y volumen por pista, barra de
transporte (play/pausa, stop) y línea de tiempo para navegar la canción.

Sitio 100 % estático (HTML + CSS + JavaScript, sin compilación), listo para
GitHub Pages.

## Estructura

```
index.html                 Página principal (catálogo + reproductor)
css/estilos.css            Estilos
js/app.js                  Interfaz, catálogo, rutas, forma de onda
js/motor.js                Motor de audio (Web Audio API)
canciones/catalogo.json    Lista de canciones del catálogo
canciones/<id>/cancion.json  Datos de cada canción y sus pistas
canciones/<id>/stems/*.m4a   Stems comprimidos (AAC)
```

## Cómo agregar una canción

1. Crea la carpeta `canciones/<id-de-la-cancion>/stems/`.
2. Convierte cada stem WAV a AAC (en macOS, sin instalar nada):

   ```bash
   afconvert -f m4af -d aac -b 160000 "Piano.wav" stems/piano.m4a
   ```

   Para pistas mono (click, cues), usa `-c 1 -b 96000`. Todos los stems deben
   empezar en el mismo punto (exportados desde 0:00) para quedar sincronizados.
3. Copia `canciones/703-prueba-claude/cancion.json` como plantilla y edita
   título, pistas y grupos (los colores de onda los asigna el reproductor:
   instrumentos en negro, guías y mezcla en gris rosado). `"mute": true` hace que la pista empiece
   silenciada (útil para la mezcla completa, metrónomo y cues).
4. Agrega el `<id>` a la sección que corresponda en `canciones/catalogo.json`
   (`"secciones"`: hoy **Originales** y **Arreglos**; el orden de la lista es el
   orden en pantalla).

Para exportar desde Ableton, convertir y **reemplazar stems** de la fase beta,
ver [REEMPLAZAR-STEMS.md](REEMPLAZAR-STEMS.md) y la carpeta `herramientas/`.

> No subas los WAV: pesan ~110 MB cada uno y GitHub rechaza archivos de más de
> 100 MB. El `.gitignore` ya los excluye.

## Partituras sincronizadas

Una pista con `"partitura": "partituras/<id>.json"` en su `cancion.json`
muestra el botón ♫ junto a M y S. Al pulsarlo, el área de ondas se cambia por
la partitura de ese instrumento: el compás que suena se resalta, la vista lo
sigue y un clic en un compás lleva el audio a ese punto. Metrónomo y cues
nunca llevan partitura.

Cómo preparar una canción (ejemplo con 703, sin abrir MuseScore):

```bash
M="/Applications/MuseScore 4.app/Contents/MacOS/mscore"
"$M" --score-parts cancion.mscz > partes.json   # partes en base64 (MuseScore se cierra con error al final; es normal)
"$M" -o piano.svg piano.mscz                     # páginas piano-1.svg, piano-2.svg…
"$M" -o piano.mpos piano.mscz                    # posición y tiempo de cada compás
ruby herramientas/preparar-partitura.rb piano.mpos 3.3333 canciones/<id>/partituras piano piano-*.svg
```

El segundo argumento es el **desfase**: segundos entre el inicio del stem y el
compás 1 (en el set de Ableton, el MIDI de 703 empieza 6 pulsos después del
locator: 6 × 60/108 = 3,3333 s). Los tiempos del `.mpos` siguen el tempo de
MuseScore con las repeticiones desplegadas, así que la partitura debe ser la
misma versión que el MIDI de Ableton.

**Canciones con cambios de tempo, rampas o calderones** (ej. Flood): en vez de
un desfase fijo, se usa el mapa de tempo real del set de Ableton.

```bash
herramientas/mpos-sin-calderones.sh flood.mscz sc/flood.mpos      # general, sin calderones
herramientas/mpos-sin-calderones.sh piano.mscz sc/piano.mpos      # cada parte, igual
ruby herramientas/mapa-tiempos.rb flood.mscz sc/flood.mpos "EN VIVO - ALS.als" 10544 10552 mapa.json
#   10544 = pulso del locator (inicio del stem) · 10552 = pulso donde empiezan los clips MIDI
ruby herramientas/preparar-partitura.rb piano.mpos mapa.json canciones/flood/partituras piano piano-*.svg
```

MuseScore alarga los calderones y Ableton no, y una parte puede tenerlos
mientras otra no. Por eso los tiempos salen de copias sin calderones; la
geometría y las páginas, del original (en Flood las posiciones de compás son
idénticas). Ordena las páginas por número (`-10.svg` va después de `-9.svg`).

## Ver en local

`fetch` no funciona abriendo `index.html` con doble clic; hace falta un
servidor. En macOS:

```bash
ruby -run -e httpd . -p 8000
```

y abre http://localhost:8000

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub (por ejemplo `repertorio`).
2. Sube el contenido de esta carpeta a la rama `main`.
3. En el repositorio: **Settings → Pages → Build and deployment → Source:
   Deploy from a branch**, rama `main`, carpeta `/ (root)`.
4. En uno o dos minutos queda en `https://<usuario>.github.io/repertorio/`.

## Atajos

- **Espacio**: play / pausa
- **← / →**: retroceder / avanzar 5 s
- **Inicio**: volver al principio
- **Alt/⌥ + clic en S**: solo exclusivo (apaga los demás solos)
- **Doble clic en un fader**: volumen a 100 %

## Notas técnicas

- Las pistas se decodifican completas en memoria para que suenen
  sincronizadas a nivel de muestra. Una canción de ~6 min con 7 pistas usa
  ~800 MB de RAM en el navegador; en móviles conviene no pasar de 8–10 pistas
  por canción.
- Lógica de solo/mute: una pista suena si no está en mute y, cuando hay algún
  solo activo, si ella también está en solo.
