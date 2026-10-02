"""Miniaturas de la biblioteca de efectos: ``python -m app.fx_thumbs``.

Pinta cada efecto del catálogo sobre una escena de muestra (dibujada en la
propia página, sin imágenes con licencia) con el MISMO runtime que el export y
guarda ``frontend/public/fx-thumbs/<id>.webp``. Los efectos con margen (papel,
pegatina, sombra) se prueban sobre un sujeto recortado (fondo transparente).
Volver a ejecutarlo tras añadir efectos o tras ``npm run fx:build``.
"""
from __future__ import annotations

import base64
import sys
from pathlib import Path

from . import fx_bake, fx_catalog

OUT_DIR = fx_bake.PUBLIC_DIR / "fx-thumbs"
TW, TH = 120, 160

_JS = r"""
async ([ids, tw, th]) => {
  const W = 360, H = 480
  function scene(cut) {
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const g = c.getContext('2d')
    if (!cut) {
      const sky = g.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#ff9a5a'); sky.addColorStop(0.55, '#ff5e7e'); sky.addColorStop(1, '#2b1055')
      g.fillStyle = sky; g.fillRect(0, 0, W, H)
      g.fillStyle = '#ffe08a'; g.beginPath(); g.arc(W * 0.7, H * 0.32, 46, 0, Math.PI * 2); g.fill()
      g.fillStyle = '#3a1f5c'
      g.beginPath(); g.moveTo(0, H * 0.72); g.lineTo(W * 0.3, H * 0.52); g.lineTo(W * 0.55, H * 0.7)
      g.lineTo(W * 0.8, H * 0.5); g.lineTo(W, H * 0.66); g.lineTo(W, H); g.lineTo(0, H); g.fill()
    }
    // sujeto: una figura sencilla (cabeza + cuerpo)
    g.fillStyle = cut ? '#2d9cdb' : '#1b1030'
    g.beginPath(); g.arc(W * 0.42, H * 0.47, 34, 0, Math.PI * 2); g.fill()
    g.beginPath(); g.ellipse(W * 0.42, H * 0.72, 62, 96, 0, 0, Math.PI * 2); g.fill()
    if (cut) {
      g.fillStyle = '#ffd166'; g.beginPath(); g.arc(W * 0.42, H * 0.47, 22, 0, Math.PI * 2); g.fill()
    }
    return c
  }
  const plain = scene(false), cut = scene(true)
  const out = {}
  for (const id of ids) {
    const src = window.__fxPad?.[id] ? cut : plain
    const th0 = window.__fxThumb?.[id] || {}
    const r = window.__fx.renderVfx({ source: src, w: W, h: H, t: th0.t ?? 0.6, clipDur: 2,
      entries: [{ uid: 't', effect: id, v: 1, enabled: true, params: th0.params || {}, from: 0, to: null }],
      padAllowed: true, key: 'thumb', maxSide: 480, target: document.createElement('canvas') })
    const t = document.createElement('canvas'); t.width = tw; t.height = th
    const g = t.getContext('2d')
    g.fillStyle = '#16161c'; g.fillRect(0, 0, tw, th)
    const k = Math.min(tw / r.canvas.width, th / r.canvas.height)
    const dw = r.canvas.width * k, dh = r.canvas.height * k
    g.drawImage(r.canvas, (tw - dw) / 2, (th - dh) / 2, dw, dh)
    out[id] = t.toDataURL('image/webp', 0.82)
  }
  return out
}
"""


def generate(only: list[str] | None = None) -> list[Path]:
    effects = [e for e in fx_catalog.effects() if e.get("engine") != "generator"]
    if only:
        effects = [e for e in effects if e["id"] in only]
    ids = [e["id"] for e in effects]
    padded = {e["id"]: True for e in effects if float(e.get("pad") or 0) > 0}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    with fx_bake.FxBaker() as b:
        b._ensure()
        b._page.evaluate("([p, t]) => { window.__fxPad = p; window.__fxThumb = t }",
                         [padded, {e["id"]: e["thumb"] for e in effects if e.get("thumb")}])
        # Las texturas (papel) tienen que estar cargadas antes de pintar.
        assets = sorted({a for e in effects for a in e.get("assets") or []})
        b._page.evaluate("async (list) => { window.__fx.setAssetBase('/assets/'); await window.__fx.preload(list) }",
                         assets)
        data = b._page.evaluate(_JS, [ids, TW, TH])
    for eid, url in data.items():
        raw = base64.b64decode(url.split(",", 1)[1])
        p = OUT_DIR / f"{eid}.webp"
        p.write_bytes(raw)
        written.append(p)
    return written


if __name__ == "__main__":
    files = generate(sys.argv[1:] or None)
    print(f"{len(files)} miniaturas en {OUT_DIR}")
