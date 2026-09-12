import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const resolve = (p) => fileURLToPath(new URL(p, import.meta.url))

// Durante el desarrollo, /api y /clips se redirigen al backend FastAPI (puerto 8000).
// Así el frontend y el backend conviven sin problemas de CORS.
//
// Nota: hasta la migración de Paper Animator a `src/features/paper/` había aquí una
// segunda entrada (`paper-animator/index.html`, que el editor cargaba en un iframe)
// y un plugin para procesar su CSS con Tailwind. Paper Animator es ahora un modo del
// editor y usa `editor.css`, así que no queda nada de eso: una sola entrada y cero
// Tailwind en el proyecto.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { main: resolve('./index.html') },
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/clips': 'http://127.0.0.1:8000',
    },
  },
})
