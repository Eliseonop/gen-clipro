# Paper Animator (motor de Paperima, recortado)

Copia **vendorizada** del motor de [Paperima](https://github.com/nurimator/paperima)
(v2.1.0), recortada para funcionar *solo* como herramienta embebida del editor:
el modal `PaperAnimatorModal.jsx` la carga en un `<iframe>` desde
`/paper-animator/index.html?embed=1`, le pasa la imagen por `postMessage` y
recibe de vuelta el vídeo exportado (mediabunny) para subirlo a Material.

El puente está en [`src/modules/embed.js`](src/modules/embed.js).

## Build

```bash
npm install          # solo la primera vez
npm run build        # sale directo a ../../frontend/public/paper-animator/
```

o, desde la raíz del repo, `bash scripts/build-paper-animator.sh` (hace las dos
cosas). La carpeta `frontend/public/paper-animator/` es el build commiteado que
sirve el frontend; no se edita a mano.

Para trabajar solo en la herramienta: `npm run dev` y abrir
`http://localhost:3100/?embed=1` (sin host no llega ninguna imagen: se importa
a mano desde el panel de Objeto).

## Qué se quitó del upstream

Nada de la lógica de animación/render/export. Fuera solo el envoltorio de app
independiente:

- **PWA**: `pwa-module.js`, `vite-plugin-pwa`, service worker, manifest e iconos
  (`public/assets/icon/`). Dentro del iframe el SW solo servía para cachear de
  más.
- **Fuente Inter variable** (856 KB): se usa la pila de fuentes del sistema, la
  misma idea que el editor anfitrión. Para recuperarla basta con volver a poner
  el `@font-face` en `src/assets/styles.css`.
- **Idioma `id`** (indonesio) de `translations.js`: el embed fuerza `es` y `en`
  queda como *fallback*.
- `dist/`, `node_modules/`, `package-lock.json`, `tsconfig.json` (no hay
  TypeScript en el proyecto) y los assets de la web independiente.

El HTML, el CSS y el resto de `src/modules/` van tal cual vienen de upstream
(más los cambios de embed ya descritos en `embed.js` y `export-module.js`).

## Licencia

Paperima es **AGPL-3.0** (ver [`LICENSE`](LICENSE)). Al vendorizar este motor,
esta parte del repo queda sujeta a esa licencia: si el editor se ofrece por red
a terceros hay que publicar el código correspondiente de esta carpeta.
