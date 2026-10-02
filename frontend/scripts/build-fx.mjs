// Genera lo que el backend necesita de los efectos (docs/EFECTOS_ANIMADOS.md):
//   backend/app/fx_assets/catalog.json    categorías, efectos (manifiesto) y animaciones
//   backend/app/fx_assets/runtime.bundle.js  runtime + registro + mediabunny para
//                                          la página de horneado del export
// Uso: `npm run fx:build` (tras añadir o cambiar un efecto). Con `--catalog` solo
// escribe el catálogo (no hace falta Vite).

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const outDir = resolve(root, '../backend/app/fx_assets')

const { EFFECTS, FX_CATEGORIES } = await import('../src/fx/registry.js')
const { effectManifest } = await import('../src/fx/core/define.js')
const { ANIMS, ANIM_SLOTS } = await import('../src/fx/anims.js')

export function buildCatalog() {
  return {
    version: 1,
    categories: FX_CATEGORIES,
    effects: EFFECTS.map((e) => ({ ...effectManifest(e), assets: e.assets || [] })),
    slots: ANIM_SLOTS,
    anims: ANIMS,
  }
}

mkdirSync(outDir, { recursive: true })
writeFileSync(resolve(outDir, 'catalog.json'), `${JSON.stringify(buildCatalog(), null, 1)}\n`)
console.log(`catalog.json: ${EFFECTS.length} efectos, ${ANIMS.length} animaciones`)

if (!process.argv.includes('--catalog')) {
  const { build } = await import('vite')
  await build({
    configFile: false,
    root,
    logLevel: 'warn',
    build: {
      outDir,
      emptyOutDir: false,
      copyPublicDir: false,
      minify: true,
      lib: {
        entry: resolve(root, 'src/fx/render/entry.js'),
        formats: ['es'],
        fileName: () => 'runtime.bundle.js',
      },
    },
  })
  console.log('runtime.bundle.js listo')
}
