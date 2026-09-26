// Temas de subtítulos para la pista de texto (look + animación en un clic).

const sub = {
  size: 0.048,
  bold: true,
  align: 'center',
  x: 0.5,
  y: 0.86,
  w: 0.88,
  bg: 'none',
  bg_opacity: 0.55,
  shadow: false,
  glow: false,
  inactive_opacity: 0.5,
  active_opacity: 1,
  max_words: 8,
}

// Estilos de las capturas de CapCut (Estilo preestablecido) como temas de subtítulo:
// el mismo look, todas las palabras visibles y la palabra activa en un color que contrasta.
const look = (id, name, style) => ({
  id,
  name,
  sample: 'hola mundo',
  style: {
    ...sub,
    font: 'Arial Black',
    border_width: 0,
    border_color: '#000000',
    word_fx: 'highlight',
    block_appear: 'fade',
    inactive_opacity: 1,
    ...style,
  },
})

const CAPCUT_LOOKS = [
  look('yellow', 'Amarillo', { color: '#ffe400', border_width: 5, border_color: '#000000', highlight_color: '#ffffff' }),
  look('ink', 'Tinta', { color: '#111111', border_width: 5, border_color: '#ffffff', highlight_color: '#ff2d2d' }),
  look('red', 'Rojo', { color: '#ff2d2d', border_width: 5, border_color: '#ffffff', highlight_color: '#ffe400' }),
  look('orange', 'Naranja', { color: '#ff8a00', border_width: 5, border_color: '#ffffff', highlight_color: '#111111' }),
  look('blue', 'Azul', { color: '#1e90ff', border_width: 5, border_color: '#ffffff', highlight_color: '#ffe400' }),
  look('green', 'Verde', { color: '#2ee83f', border_width: 5, border_color: '#000000', highlight_color: '#ffffff' }),
  look('pink', 'Rosa', { color: '#ff3d8b', border_width: 5, border_color: '#ffffff', highlight_color: '#ffe400' }),
  look('yellow-box', 'Caja amarilla', { color: '#111111', bg: '#ffd400', bg_opacity: 1, highlight_color: '#e0202a' }),
  look('purple-box', 'Caja morada', { color: '#ffffff', bg: '#7b2cff', bg_opacity: 1, highlight_color: '#ffe400' }),
  look('white-box', 'Caja blanca', { color: '#111111', bg: '#ffffff', bg_opacity: 1, highlight_color: '#7b2cff' }),
  look('green-glow', 'Brillo verde', { color: '#111111', shadow: true, glow: true, shadow_color: '#2ee83f', highlight_color: '#ffffff' }),
  look('fire-glow', 'Brillo naranja', { color: '#ffc21a', shadow: true, glow: true, shadow_color: '#ff4d00', highlight_color: '#ffffff' }),
  look('gold-glow', 'Dorado', { color: '#fffbe6', shadow: true, glow: true, shadow_color: '#ffd400', highlight_color: '#ffd400' }),
]

export const SUBTITLE_THEMES = [
  {
    id: 'classic',
    name: 'Clásico',
    sample: 'hola mundo',
    style: {
      ...sub,
      font: 'Arial Black',
      color: '#ffffff',
      border_width: 5,
      border_color: '#111111',
      highlight_color: '#ffe566',
      word_fx: 'highlight',
      block_appear: 'fade',
      inactive_opacity: 0.55,
    },
  },
  {
    id: 'neon',
    name: 'Neón',
    sample: 'hola mundo',
    style: {
      ...sub,
      font: 'Segoe UI Black',
      color: '#f4fbff',
      border_width: 2,
      border_color: '#063a48',
      shadow: true,
      glow: true,
      shadow_color: '#00e5ff',
      highlight_color: '#00f0ff',
      word_fx: 'glow',
      block_appear: 'fade',
      inactive_opacity: 0.42,
    },
  },
  {
    id: 'fire',
    name: 'Fuego',
    sample: 'hola mundo',
    style: {
      ...sub,
      font: 'Impact',
      size: 0.056,
      color: '#fff6e8',
      border_width: 7,
      border_color: '#1a0a00',
      highlight_color: '#ff4b1f',
      word_fx: 'pop',
      block_appear: 'slide_up',
      inactive_opacity: 0.5,
    },
  },
  {
    id: 'ice',
    name: 'Hielo',
    sample: 'hola mundo',
    style: {
      ...sub,
      font: 'Calibri',
      color: '#f2f7ff',
      border_width: 3,
      border_color: '#12324a',
      shadow: true,
      glow: true,
      shadow_color: '#7ee8ff',
      highlight_color: '#7ee8ff',
      word_fx: 'glow',
      block_appear: 'fade',
      inactive_opacity: 0.4,
    },
  },
  {
    id: 'karaoke',
    name: 'Karaoke',
    sample: 'hola mundo',
    style: {
      ...sub,
      font: 'Arial Black',
      color: '#ffffff',
      border_width: 5,
      border_color: '#14060a',
      shadow: true,
      glow: true,
      shadow_color: '#ff3b5c',
      highlight_color: '#ff3b5c',
      word_fx: 'glow',
      block_appear: 'fade',
      inactive_opacity: 0.35,
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    sample: 'hola mundo',
    style: {
      ...sub,
      font: 'Segoe UI',
      color: '#ffffff',
      border_width: 0,
      border_color: '#000000',
      highlight_color: '#ffffff',
      word_fx: 'highlight',
      block_appear: 'fade',
      inactive_opacity: 0.28,
    },
  },
  {
    id: 'box',
    name: 'Caja',
    sample: 'hola mundo',
    style: {
      ...sub,
      font: 'Tahoma',
      color: '#ffffff',
      border_width: 0,
      border_color: '#000000',
      bg: '#111318',
      bg_opacity: 0.72,
      highlight_color: '#ffe566',
      word_fx: 'highlight',
      block_appear: 'pop',
      inactive_opacity: 0.45,
    },
  },
  {
    id: 'shorts',
    name: 'Shorts',
    sample: 'hola mundo',
    style: {
      ...sub,
      font: 'Anton',
      size: 0.05,
      color: '#ffffff',
      bold: true,
      border_width: 6,
      border_color: '#000000',
      highlight_color: '#ffffff',
      word_fx: 'highlight',
      block_appear: 'none',
      inactive_opacity: 1,
      glow: false,
      shadow: false,
    },
  },
  ...CAPCUT_LOOKS,
]

export function themeById(id) {
  return SUBTITLE_THEMES.find((t) => t.id === id) || null
}

export const WORD_FX_OPTIONS = [
  { value: 'highlight', label: 'Color' },
  { value: 'glow', label: 'Brillo' },
  { value: 'pop', label: 'Pop' },
]

export const WORDS_PER_BOX = [4, 6, 8, 10, 12]

export const BLOCK_APPEAR_OPTIONS = [
  { value: 'none', label: 'Nada' },
  { value: 'fade', label: 'Fade' },
  { value: 'pop', label: 'Pop' },
  { value: 'slide_up', label: 'Slide up' },
  { value: 'typing', label: 'Escritura' },
]
