import assert from 'node:assert/strict'
import { recipeReady } from './recipeReady.js'

// Mismo criterio que recipes._need del backend (#21).
const text = { id: 't', kind: 'text' }
const vid = { id: 'v', kind: 'video' }
const img = { id: 'i', kind: 'image' }
assert.equal(recipeReady({ needs: null }, []).ok, true, 'etalonaje: sin selección')
assert.equal(recipeReady({ needs: 'text' }, [vid]).ok, false)
assert.equal(recipeReady({ needs: 'text' }, [vid, text]).ok, true)
assert.equal(recipeReady({ needs: 'video' }, [img]).ok, false)
assert.equal(recipeReady({ needs: 'media2' }, [vid]).ok, false)
assert.equal(recipeReady({ needs: 'media2' }, [vid, img]).ok, true)
assert.match(recipeReady({ needs: 'media2' }, []).why, /2 o más/)
console.log('recipeReady ok')
