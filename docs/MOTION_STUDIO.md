# Motion Studio

Motion graphics **editables** por IA integrados en el editor. La composición (JSON)
es la fuente de verdad; se compila a HTML/CSS/GSAP para el **preview en navegador** y
para el **render determinista**, garantizando paridad. No genera MP4 cerrados.

## Flujo

```
IA / plantilla / manual
   → MotionComposition (JSON editable)
   → HTML/CSS/GSAP (generator.py + runtime.js, GSAP inline)
   → preview inmediato (iframe, __rebuild en vivo)  ó  render (HyperFrames/Playwright)
   → "Agregar al proyecto" → clip kind="motion" (overlay con alfa) en la timeline
   → export final (compose.py compone el WebM con alfa)
```

## Backend (`backend/app/motion/`)

- `models.py` — `MotionComposition` / `MotionLayer` / `MotionTween`. MVP: layer `text`;
  animaciones `fade|slide|scale|zoom|rotate` (entrada/salida) con ease GSAP.
- `validator.py` — reglas semánticas → errores legibles (la IA los corrige).
- `generator.py` — composición → HTML autocontenido (GSAP + `runtime.js` + fuente Anton, todo inline).
- `runtime.js` — construye DOM + timeline GSAP `paused`; expone `window.__seek(t)` (render),
  `__play/__pause`, y `__rebuild(comp)` (preview en vivo, sin recargar). **Mismo archivo en
  preview y render → paridad.**
- `renderer/adapter.py` — `RendererAdapter` (capa de abstracción). `renderer/hyperframes.py` —
  motor Playwright: seek frame a frame → PNG con alfa (`omit_background`) → WebM VP9 `yuva420p`.
- `service.py` — CRUD + render cacheado por `(id, version)` en `clips/<pid>/motion/`.
- `templates/` — subscribe, lower-third, title (parametrizables).

## Integración

- Persistencia: `Project.motion_compositions`. Clip: `TimelineClip.composition_id`,
  `kind="motion"` (→ pista de vídeo, `clip_kind.py`).
- `compose.py::_clip_path` resuelve el WebM del motion; el clip se inserta con
  `layout="overlay"` (ruta de overlay con alfa ya existente). `jobs._run_export`
  pre-renderiza los motion graphics antes de componer.
- REST (`main.py`): `/api/projects/{pid}/motion*` (list/create/get/update/delete,
  `preview.html`, `render`, `add-to-timeline`).
- MCP (`tools_motion.py`): `motion_list_templates`, `motion_get/create/update_composition`,
  `motion_add_to_timeline`. El agente (`ai/agent.py`) trabaja a nivel de composición.

## Frontend (`frontend/src/features/motion/`)

- `MotionStudio.jsx` — tab "Motion Studio" en `VideoEditor.jsx` (junto a Main/Clip Editor).
  Paneles Elementos | Preview | Propiedades + mini-timeline + chat IA + "Agregar al proyecto".
  Autosave con debounce. Doble-clic en un clip `motion` de la timeline lo reabre aquí.
- `MotionCanvas.jsx` — iframe con el `preview.html` del backend; `__rebuild` en vivo; controles seek/play/pause/loop.
- `MotionAIChat.jsx` — chat SSE (mismo agente); al recibir `composition_id` recarga el preview.
- `motionModel.js` — helpers/factorías (espejo del backend).

## Requisito de render

El preview no requiere nada extra. El **render** (y `add-to-timeline`) necesita Playwright:

```bash
.venv/Scripts/python.exe -m pip install playwright && .venv/Scripts/python.exe -m playwright install chromium
```

Sin él, `render`/`add_to_timeline` fallan con un mensaje claro; el resto (crear/editar/preview) funciona.

## Pendiente (Fase 2)

image / shape / svg / video / lottie · variables `{{name}}` · transiciones · export WebM/PNG-seq/alpha · efectos avanzados.
