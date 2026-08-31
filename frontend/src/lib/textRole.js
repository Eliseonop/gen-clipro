export function textRole(clip) {
  if (!clip || clip.kind !== 'text') return null
  if (clip.text_role === 'caption' || clip.text_role === 'free') return clip.text_role
  if (clip.origin || (Array.isArray(clip.words) && clip.words.length > 0)) return 'caption'
  return 'free'
}

export const isCaptionText = (clip) => textRole(clip) === 'caption'
export const isFreeText = (clip) => textRole(clip) === 'free'
export const isGeneratedClip = (clip) => clip?.kind === 'text'
