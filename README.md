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
   título, pistas, colores y grupos. `"mute": true` hace que la pista empiece
   silenciada (útil para la mezcla completa, metrónomo y cues).
4. Agrega el `<id>` a la lista en `canciones/catalogo.json`.

> No subas los WAV: pesan ~110 MB cada uno y GitHub rechaza archivos de más de
> 100 MB. El `.gitignore` ya los excluye.

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
