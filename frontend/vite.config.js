import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Durante el desarrollo, /api y /clips se redirigen al backend FastAPI (puerto 8000).
// Así el frontend y el backend conviven sin problemas de CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/clips': 'http://127.0.0.1:8000',
    },
  },
})
