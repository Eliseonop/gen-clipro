# Paper Animator

Motor de [Paperima](https://github.com/nurimator/paperima) v2.1.0 (Vite + JS
vanilla, export por `mediabunny`) **integrado en este frontend** como una
entrada más del build: ya no es un proyecto aparte con su propio `npm install`.

- `index.html` — la página de la herramienta. En dev y en `dist` vive en
  `/paper-animator/index.html`; el editor la carga con `?embed=1` desde
  [`PaperAnimatorModal.jsx`](../src/features/editor/PaperAnimatorModal.jsx).
- `modules/` — el motor (render en canvas, keyframes, borrador, export).
- `modules/embed.js` — el puente con el editor: recibe la imagen por
  `postMessage`, reordena la UI en tres paneles fijos, fuerza el español y
  devuelve el blob exportado en vez de descargarlo.
- `styles.css` — Tailwind + el tema propio de la herramienta.
- `../public/paper-animator/assets/texture/` — las 16 texturas de papel, que el
  motor carga en runtime por URL (`./assets/texture/...`).

## Cómo se construye

No hay build propio: `npm run dev` y `npm run build` del frontend ya la
incluyen (`rollupOptions.input` en [`vite.config.js`](../vite.config.js) declara
`index.html` y `paper-animator/index.html` como entradas).

Tailwind **solo** se aplica a `styles.css`: en vez de un `postcss.config.js`
global —que pasaría también por el CSS de la app React— hay un plugin de Vite
(`paperAnimatorCss`) que procesa ese único fichero con
[`tailwind.config.js`](tailwind.config.js). `mediabunny` está en las
dependencias del frontend, pineado a la versión con la que se validó el export.

Para trabajar solo en la herramienta: `npm run dev` y abrir
`http://localhost:5173/paper-animator/index.html?embed=1` (sin editor anfitrión
no llega ninguna imagen: se importa a mano desde el panel de Objeto).

## Qué se quitó del upstream

Nada de la lógica de animación/render/export. Fuera solo el envoltorio de app
independiente:

- **PWA**: `pwa-module.js`, `vite-plugin-pwa`, service worker, manifest e iconos.
  Dentro del iframe el SW solo servía para cachear de más.
- **Fuente Inter variable** (856 KB): se usa la pila de fuentes del sistema. Para
  recuperarla basta con volver a poner el `@font-face` en `styles.css`.
- **Idioma `id`** (indonesio) de `modules/translations.js`: el embed fuerza `es`
  y `en` queda como *fallback*.
- Su `package.json`, `package-lock.json`, `vite.config.js`, `postcss.config.js`,
  `tsconfig.json` y `dist/`: todo eso lo aporta ya el frontend.

El resto de `index.html`, `styles.css` y `modules/` va tal cual viene de
upstream, con los cambios de embed documentados en `modules/embed.js` y en los
dos puntos de descarga de `modules/export-module.js`.

## Licencia

Paperima es **AGPL-3.0** (ver [`LICENSE`](LICENSE)). Al tener este motor en el
repo, esta carpeta queda sujeta a esa licencia: si el editor se ofrece por red a
terceros hay que publicar el código correspondiente.
