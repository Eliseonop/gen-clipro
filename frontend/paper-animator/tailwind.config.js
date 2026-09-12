import { fileURLToPath } from 'node:url'

// Rutas absolutas: esta config la carga vite.config.js (raíz de frontend), así
// que los globs relativos apuntarían al sitio equivocado.
const here = fileURLToPath(new URL('.', import.meta.url))

/** @type {import('tailwindcss').Config} */
export default {
    content: [`${here}index.html`, `${here}modules/**/*.js`],
    theme: { extend: {} },
    plugins: [],
}
