// Lienzo de Paper Animator dentro del editor.
//
// Tres cosas que antes estaban repartidas por el index.html del iframe y ahora
// viven aquí:
//   1. El <canvas> y su bucle de pintado (rAF con flag needsRedraw).
//   2. El <filter> SVG del borde rasgado. `ctx.filter = 'url(#id)'` resuelve el
//      id contra el DOCUMENTO, así que el filtro tiene que estar montado; si no,
//      el borde desaparece sin dar ningún error.
//   3. El MARCO de transformación del objeto — en el motor original solo se podía
//      mover con sliders. Mover, escalar y girar se hacen aquí directamente,
//      como con cualquier otro elemento del editor.
//
// El marco es DOM (divs sobre el lienzo), no se pinta en el canvas: el mismo
// renderer sirve al preview y al export, y lo que se dibujara aquí acabaría
// dentro del vídeo.
//
// Con una herramienta de imagen activa (recorte · pincel · por color) el stage se
// parte en dos, igual que "Recortar" en el editor: `PaperEditLayer` a la
// izquierda y este lienzo, etiquetado como Resultado, a la derecha.
//
// Con texto hay un marco por elemento (letra, grupo o frase): el seleccionado
// lleva tiradores y el resto es un contorno tenue que se selecciona con un clic.
//
// El tamaño en pantalla lo resuelve un ResizeObserver + `object-fit: contain`
// por CSS, en lugar del `updateCanvasDisplaySize` imperativo del original.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import PaperEditLayer from './PaperEditLayer'
import { LIMITS, TOOL, clamp, hasContent, isOverlayTool, selectedObject } from './paperModel'
import { objectFrame, transformAt } from './paperTransforms'

const PREVIEW_MAX = 1280 // el preview nunca pasa de aquí aunque el proyecto sea 4K
const CORNERS = ['nw', 'ne', 'sw', 'se']

function TornFilterDefs({ ids }) {
  return (
    <svg width="0" height="0" aria-hidden="true" className="paper-defs">
      <defs>
        <filter id={ids.filter} x="-50%" y="-50%" width="200%" height="200%">
          {/* engorda la silueta: es el grosor del borde */}
          <feMorphology id={ids.dilate} in="SourceGraphic" operator="dilate" radius="10" result="dilated" />
          {/* ruido fractal que rompe el contorno */}
          <feTurbulence id={ids.turbulence} type="fractalNoise" baseFrequency="0.02" numOctaves="3" result="noise" />
          <feDisplacementMap id={ids.displacement} in="dilated" in2="noise" scale="15" xChannelSelector="R" yChannelSelector="G" result="torn" />
          <feFlood id={ids.flood} floodColor="#FFFFFF" result="strokeColor" />
          <feComposite in="strokeColor" in2="torn" operator="in" result="coloredTorn" />
          <feMerge>
            <feMergeNode in="coloredTorn" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  )
}

export default function PaperCanvas({ paper, format }) {
  const {
    st, raw, stRef, bgRef, assetsRef, renderer, clockRef, active, time, viewSize,
    patchMany, selKf, patchKeyframe, pause, renderItems, textSlots, select,
  } = paper
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const dragRef = useRef(null)

  const outW = format?.width || 1080
  const outH = format?.height || 1920
  const previewScale = st.previewScale || 0.75

  // --- resolución interna ---------------------------------------------------
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const k = Math.min(previewScale, PREVIEW_MAX / Math.max(outW, outH))
    renderer.resize(canvas, outW * k, outH * k)
  }, [outW, outH, previewScale, renderer])

  // --- bucle de pintado -----------------------------------------------------
  // Independiente del reloj: el reloj lo lleva usePaperComp; aquí solo se pinta
  // cuando hay algo nuevo que pintar (needsRedraw), como en el motor original.
  // Lo que se dibuja son los items de `renderItems`: la VISTA de la imagen (con
  // su recorte aplicado) y el bitmap de cada elemento de texto.
  useEffect(() => {
    if (!active) return undefined
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    let raf = 0
    const tick = () => {
      if (renderer.needsRedraw) {
        renderer.clearRedraw()
        renderer.draw(ctx, canvas, stRef.current, clockRef.current, {
          items: renderItems(stRef.current),
          bgEl: bgRef.current,
          assets: assetsRef.current,
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, renderer, stRef, renderItems, bgRef, assetsRef, clockRef])

  // Repinta al cambiar cualquier propiedad (el estado es la única fuente).
  useEffect(() => { renderer.requestRedraw() }, [st, renderer])

  // --- marco de transformación ----------------------------------------------
  // Dónde cae cada objeto AHORA, en fracciones del stage (el lienzo y su envoltorio
  // tienen el mismo aspecto, así que valen las mismas fracciones). Se recalcula
  // con `time` para que en modo avanzado el marco siga a los keyframes.
  const advanced = st.object.animation.mode === 'advanced'
  const frames = useMemo(() => {
    const toPct = (id, f) => ({
      id,
      left: ((f.cx - f.w / 2) / outW) * 100,
      top: ((f.cy - f.h / 2) / outH) * 100,
      width: (f.w / outW) * 100,
      height: (f.h / outH) * 100,
      rotation: f.rotation,
    })
    const out = []
    if (raw.hasImage && viewSize?.w) {
      out.push(toPct('image', objectFrame(outW, outH, viewSize.w, viewSize.h, transformAt(time, raw.object))))
    }
    for (const el of raw.text.elements) {
      const slot = textSlots.get(el.id)
      if (slot) out.push(toPct(el.id, objectFrame(outW, outH, 1, 1, transformAt(time, el.object), slot)))
    }
    return out
  }, [raw.hasImage, raw.object, raw.text.elements, textSlots, time, outW, outH, viewSize])
  const frame = frames.find((f) => f.id === raw.selected) || null
  const others = frames.filter((f) => f !== frame)
  const anything = hasContent(raw)

  // Qué se está editando al arrastrar: los sliders (simple) o el keyframe activo
  // (avanzado). Sin keyframe seleccionado no hay destino: mover "la animación
  // entera" no significaría nada.
  const target = advanced ? selKf : 'simple'
  const canEdit = !!(frame && st.edit.tool === TOOL.none && target)

  const writePose = useCallback((pose) => {
    const obj = selectedObject(stRef.current)
    if (obj.animation.mode === 'advanced') {
      const id = obj.animation.activeKeyframeId
      if (id) patchKeyframe(id, pose)
      return
    }
    const map = {
      x: 'object.image.offset.x',
      y: 'object.image.offset.y',
      scale: 'object.image.size',
      rotation: 'object.image.rotation',
    }
    patchMany(Object.fromEntries(Object.entries(pose).map(([k, v]) => [map[k], v])))
  }, [patchKeyframe, patchMany, stRef])

  const startDrag = useCallback((e, kind) => {
    if (!canEdit) return
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || !frame) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pause()
    const from = transformAt(time, selectedObject(stRef.current))
    // Centro del objeto en píxeles de pantalla: el origen de las cuentas de
    // escala y giro.
    const cx = rect.left + ((frame.left + frame.width / 2) / 100) * rect.width
    const cy = rect.top + ((frame.top + frame.height / 2) / 100) * rect.height
    dragRef.current = {
      kind,
      rect,
      from,
      cx,
      cy,
      x0: e.clientX,
      y0: e.clientY,
      dist0: Math.hypot(e.clientX - cx, e.clientY - cy),
      angle0: Math.atan2(e.clientY - cy, e.clientX - cx),
    }
  }, [canEdit, frame, pause, stRef, time])

  const onPointerMove = useCallback((e) => {
    const d = dragRef.current
    if (!d) return
    if (d.kind === 'move') {
      // El offset del motor es un % del lado del lienzo, así que el delta en
      // píxeles de pantalla se normaliza por el tamaño mostrado. Y arriba es positivo.
      const dx = ((e.clientX - d.x0) / d.rect.width) * 100
      const dy = -((e.clientY - d.y0) / d.rect.height) * 100
      const lim = selectedObject(stRef.current).animation.mode === 'advanced' ? LIMITS.kfOffset : LIMITS.imageOffset
      writePose({
        x: +clamp(d.from.x + dx, lim.min, lim.max).toFixed(1),
        y: +clamp(d.from.y + dy, lim.min, lim.max).toFixed(1),
      })
      return
    }
    if (d.kind === 'rotate') {
      const angle = Math.atan2(e.clientY - d.cy, e.clientX - d.cx)
      const deg = ((angle - d.angle0) * 180) / Math.PI
      let next = d.from.rotation + deg
      while (next > 180) next -= 360
      while (next < -180) next += 360
      // Con Shift, pasos de 15° (lo mismo que en el encuadre del editor).
      if (e.shiftKey) next = Math.round(next / 15) * 15
      writePose({ rotation: +next.toFixed(1) })
      return
    }
    // Esquina: la escala sigue a la distancia al centro, así que funciona igual
    // esté el objeto girado o no.
    if (d.dist0 < 4) return
    const k = Math.hypot(e.clientX - d.cx, e.clientY - d.cy) / d.dist0
    const lim = selectedObject(stRef.current).animation.mode === 'advanced' ? LIMITS.kfScale : LIMITS.imageSize
    writePose({ scale: Math.round(clamp(d.from.scale * k, lim.min, lim.max)) })
  }, [stRef, writePose])

  const endDrag = useCallback(() => { dragRef.current = null }, [])

  const toolOn = raw.hasImage && raw.selected === 'image' && isOverlayTool(st.edit.tool)

  return (
    <div className={`paper-stage${toolOn ? ' split' : ''}`}>
      <TornFilterDefs ids={renderer.filterIds} />
      {toolOn && <PaperEditLayer paper={paper} />}
      <div
        ref={wrapRef}
        className="paper-stage-wrap"
        style={{ aspectRatio: `${outW} / ${outH}` }}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <canvas ref={canvasRef} className="paper-canvas" />
        {toolOn && <span className="ed-result-label">Resultado</span>}

        {st.edit.tool === TOOL.none && others.map((f) => (
          <div
            key={f.id}
            className="paper-frame peer"
            title="Seleccionar"
            style={{
              left: `${f.left}%`,
              top: `${f.top}%`,
              width: `${f.width}%`,
              height: `${f.height}%`,
              transform: `rotate(${f.rotation}deg)`,
            }}
            onPointerDown={(e) => { e.stopPropagation(); select(f.id) }}
          />
        ))}

        {frame && st.edit.tool === TOOL.none && (
          <div
            className={`paper-frame${canEdit ? '' : ' locked'}`}
            style={{
              left: `${frame.left}%`,
              top: `${frame.top}%`,
              width: `${frame.width}%`,
              height: `${frame.height}%`,
              transform: `rotate(${frame.rotation}deg)`,
            }}
            onPointerDown={(e) => startDrag(e, 'move')}
          >
            {canEdit && (
              <>
                <div
                  className="paper-handle rotate"
                  title="Girar (Shift: pasos de 15°)"
                  onPointerDown={(e) => startDrag(e, 'rotate')}
                />
                {CORNERS.map((c) => (
                  <div
                    key={c}
                    className={`paper-handle corner ${c}`}
                    title="Redimensionar"
                    onPointerDown={(e) => startDrag(e, 'scale')}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {!anything && (
          <div className="paper-stage-empty">
            <p>Elige una imagen o escribe un texto en <b>Paper</b> (panel izquierdo) para animarlo.</p>
          </div>
        )}
        {frame && advanced && !selKf && st.edit.tool === TOOL.none && (
          <div className="paper-stage-note">
            Selecciona un keyframe para mover, escalar o girar el objeto.
          </div>
        )}
      </div>
    </div>
  )
}
