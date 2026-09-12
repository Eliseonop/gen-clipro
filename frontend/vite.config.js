import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import paperAnimatorTailwind from './paper-animator/tailwind.config.js'

const resolve = (p) => fileURLToPath(new URL(p, import.meta.url))

// Paper Animator (paper-animator/) es lo único que usa Tailwind en este
// frontend. En vez de meter un postcss.config.js global —que pasaría por el CSS
// de la app React— procesamos a mano ese único fichero, antes de que lo toque
// el pipeline de CSS de Vite.
function paperAnimatorCss() {
  return {
    name: 'paper-animator-css',
    enforce: 'pre',
    async transform(code, id) {
      const file = id.split('?')[0].replace(/\\/g, '/')
      if (!file.endsWith('/paper-animator/styles.css')) return null
      const out = await postcss([tailwindcss(paperAnimatorTailwind), autoprefixer])
        .process(code, { from: file })
      return { code: out.css, map: null }
    },
  }
}

// Durante el desarrollo, /api y /clips se redirigen al backend FastAPI (puerto 8000).
// Así el frontend y el backend conviven sin problemas de CORS.
export default defineConfig({
  plugins: [react(), paperAnimatorCss()],
  define: {
    // Versión del motor de Paperima vendorizado en paper-animator/ (la muestra
    // su pestaña Info). Sin esto, translations.js cae a 'dev'.
    __APP_VERSION__: JSON.stringify('2.1.0'),
  },
  build: {
    rollupOptions: {
      input: {
        // La app y la herramienta Paper Animator, que el editor carga en un
        // iframe desde /paper-animator/index.html?embed=1.
        main: resolve('./index.html'),
        'paper-animator': resolve('./paper-animator/index.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/clips': 'http://127.0.0.1:8000',
    },
  },
})
