/* Motion Studio — runtime determinista (preview e render comparten este archivo).
 *
 * Construye el DOM y una timeline GSAP `paused:true` a partir del JSON de la
 * composición (inyectado como window.__COMP). El render busca cada frame con
 * __seek(t); el preview reproduce con rAF pero la fuente de verdad SIEMPRE es
 * __seek(t). Sin Date.now/Math.random no sembrados: seek(t) es puro.
 */
(function () {
  'use strict';

  var COMP = window.__COMP || { width: 1080, height: 1920, fps: 30, duration: 4, layers: [] };
  var stage = document.getElementById('stage');
  var tl = null;
  var NODES = [];   // registro {id, layer, info} para hit-testing del editor

  function px(n) { return (Math.round(n * 1000) / 1000) + 'px'; }

  // Distancia por defecto para slides, relativa al lienzo.
  function slideDist(tween, horizontal) {
    if (tween && typeof tween.distance === 'number') return tween.distance;
    return Math.round(0.6 * (horizontal ? COMP.width : COMP.height));
  }

  function isHorizontal(dir) { return dir === 'left' || dir === 'right'; }

  // Offset de entrada (desde dónde llega) / salida (hacia dónde va) por dirección.
  function slideOffset(dir, tween) {
    var d = slideDist(tween, isHorizontal(dir));
    switch (dir) {
      case 'left': return { x: -d, y: 0 };
      case 'right': return { x: d, y: 0 };
      case 'up': return { x: 0, y: -d };
      case 'down': return { x: 0, y: d };
      default: return { x: d, y: 0 };
    }
  }

  function restingVars(layer) {
    return {
      x: 0, y: 0,
      scale: layer.scale != null ? layer.scale : 1,
      rotation: layer.rotation || 0,
      autoAlpha: layer.opacity != null ? layer.opacity : 1,
    };
  }

  // {from, to} de un tween de ENTRADA respecto al estado en reposo.
  function entranceVars(tween, resting) {
    var from = { autoAlpha: 0 };
    switch (tween.type) {
      case 'fade': break;
      case 'slide': { var o = slideOffset(tween.direction, tween); from.x = o.x; from.y = o.y; break; }
      case 'scale': from.scale = (tween.from_scale != null ? tween.from_scale : 0.6) * resting.scale; break;
      case 'zoom': from.scale = (tween.from_scale != null ? tween.from_scale : 1.6) * resting.scale; break;
      case 'rotate': from.rotation = resting.rotation + (tween.degrees != null ? tween.degrees : -90); break;
      default: return null;
    }
    return { from: from, to: Object.assign({}, resting) };
  }

  // {to} de un tween de SALIDA (parte del estado en reposo).
  function exitVars(tween, resting) {
    var to = { autoAlpha: 0 };
    switch (tween.type) {
      case 'fade': break;
      case 'slide': { var o = slideOffset(tween.direction, tween); to.x = o.x; to.y = o.y; break; }
      case 'scale': to.scale = (tween.from_scale != null ? tween.from_scale : 0.6) * resting.scale; break;
      case 'zoom': to.scale = (tween.from_scale != null ? tween.from_scale : 1.6) * resting.scale; break;
      case 'rotate': to.rotation = resting.rotation + (tween.degrees != null ? tween.degrees : 90); break;
      default: return null;
    }
    return to;
  }

  function styleText(anim, layer) {
    var s = layer.style || {};
    var el = document.createElement('div');
    el.className = 'mg-text';
    el.textContent = layer.content || '';
    el.style.fontFamily = s.font || 'Anton, Arial, sans-serif';
    el.style.fontSize = px(s.fontSize != null ? s.fontSize : 96);
    el.style.color = s.color || '#ffffff';
    el.style.fontWeight = s.fontWeight || '700';
    el.style.textAlign = s.align || 'center';
    el.style.lineHeight = s.lineHeight != null ? String(s.lineHeight) : '1.1';
    el.style.letterSpacing = s.letterSpacing != null ? px(s.letterSpacing) : '0';
    if (s.textTransform) el.style.textTransform = s.textTransform;
    if (s.background) { el.style.background = s.background; el.style.padding = px(s.padding != null ? s.padding : 16); }
    if (s.borderRadius) el.style.borderRadius = px(s.borderRadius);
    if (s.shadow) el.style.textShadow = s.shadow;
    if (layer.width) el.style.width = px(layer.width);
    anim.appendChild(el);
  }

  function shapeColor(s, prefer) {
    if (prefer === 'stroke') return (s.stroke && s.stroke !== 'none') ? s.stroke : (s.fill || '#39d0ff');
    return (s.fill && s.fill !== 'none') ? s.fill : (s.stroke && s.stroke !== 'none' ? s.stroke : '#39d0ff');
  }

  function styleCircle(anim, layer) {
    var s = layer.shape || {};
    var r = s.radius != null ? s.radius : 40;
    var el = document.createElement('div');
    el.className = 'mg-circle';
    el.style.width = px(2 * r);
    el.style.height = px(2 * r);
    el.style.background = (s.fill && s.fill !== 'none') ? s.fill : 'transparent';
    if (s.stroke && s.stroke !== 'none') el.style.border = px(s.thickness || 3) + ' solid ' + s.stroke;
    if (s.glow) el.style.boxShadow = '0 0 ' + px(s.glow) + ' ' + shapeColor(s);
    anim.appendChild(el);
  }

  function styleRect(anim, layer) {
    var s = layer.shape || {};
    var el = document.createElement('div');
    el.className = 'mg-rect';
    el.style.width = px(s.width != null ? s.width : 80);
    el.style.height = px(s.height != null ? s.height : 80);
    el.style.background = (s.fill && s.fill !== 'none') ? s.fill : 'transparent';
    if (s.stroke && s.stroke !== 'none') el.style.border = px(s.thickness || 3) + ' solid ' + s.stroke;
    if (s.glow) el.style.boxShadow = '0 0 ' + px(s.glow) + ' ' + shapeColor(s);
    anim.appendChild(el);
  }

  // Línea de (x,y) a (x2,y2): outer en el origen; wrap rotado; bar escalable.
  function buildLine(outer, layer) {
    var s = layer.shape || {};
    var dx = (s.x2 != null ? s.x2 : layer.x) - (layer.x || 0);
    var dy = (s.y2 != null ? s.y2 : layer.y) - (layer.y || 0);
    var length = Math.sqrt(dx * dx + dy * dy);
    var angle = Math.atan2(dy, dx) * 180 / Math.PI;
    var thick = s.thickness || 3;

    var wrap = document.createElement('div');    // visibilidad + rotación (GSAP: autoAlpha)
    wrap.className = 'mg-anim mg-linewrap';
    var bar = document.createElement('div');      // barra escalable (GSAP: scaleX en "draw")
    bar.className = 'mg-line';
    bar.style.width = px(length);
    bar.style.height = px(thick);
    bar.style.marginTop = px(-thick / 2);
    bar.style.background = shapeColor(s, 'stroke');
    if (s.glow) bar.style.boxShadow = '0 0 ' + px(s.glow) + ' ' + shapeColor(s, 'stroke');
    wrap.appendChild(bar);
    outer.appendChild(wrap);
    stage.appendChild(outer);
    return { anim: wrap, bar: bar, isLine: true, length: length, angle: angle, thick: thick };
  }

  function buildLayer(layer) {
    var outer = document.createElement('div');   // ancla en (x,y)
    outer.className = 'mg-layer';
    outer.style.left = px(layer.x || 0);
    outer.style.top = px(layer.y || 0);
    outer.style.zIndex = String(layer.z_index || 0);

    if (layer.type === 'shape' && (layer.shape || {}).kind === 'line') {
      return buildLine(outer, layer);
    }

    var center = document.createElement('div');   // centra el bloque sobre el ancla
    center.className = 'mg-center';
    var anim = document.createElement('div');      // GSAP anima esto
    anim.className = 'mg-anim';

    if (layer.type === 'text') styleText(anim, layer);
    else if (layer.type === 'shape') {
      var kind = (layer.shape || {}).kind;
      if (kind === 'rect') styleRect(anim, layer);
      else styleCircle(anim, layer);
    }

    center.appendChild(anim);
    outer.appendChild(center);
    stage.appendChild(outer);
    return { anim: anim, bar: null, isLine: false, length: 0, angle: 0 };
  }

  // Efecto continuo (loop) determinista: repeticiones FINITAS que cubren la vida
  // de la capa (mantiene la timeline con duración finita y seek exacto).
  function applyEffect(info, layer, start, end, resting) {
    var eff = layer.effect || {};
    if (!eff.type || eff.type === 'none') return;
    var period = eff.duration || 1.0;
    var life = Math.max(0.1, end - start);
    var reps = Math.max(1, Math.ceil(life / period));
    var at = start + (eff.delay || 0);
    if (eff.type === 'pulse') {
      var amt = eff.amount != null ? eff.amount : 0.25;
      var base = info.isLine ? 1 : (resting.scale || 1);
      tl.fromTo(info.anim, { scale: base }, { scale: base * (1 + amt), duration: period / 2,
        ease: 'sine.inOut', repeat: reps * 2, yoyo: true }, at);
    } else if (eff.type === 'glow') {
      var minA = eff.amount != null ? eff.amount : 0.45;
      var full = resting.autoAlpha != null ? resting.autoAlpha : 1;
      tl.fromTo(info.anim, { autoAlpha: full }, { autoAlpha: minA, duration: period / 2,
        ease: 'sine.inOut', repeat: reps * 2, yoyo: true }, at);
    } else if (eff.type === 'flow' && info.isLine) {
      var sz = Math.max(7, (info.thick || 3) * 2.4);
      var dot = document.createElement('div');
      dot.className = 'mg-dot';
      dot.style.width = px(sz);
      dot.style.height = px(sz);
      dot.style.marginTop = px(-sz / 2);
      info.anim.appendChild(dot);
      gsap.set(dot, { x: 0, xPercent: -50 });
      tl.fromTo(dot, { x: 0 }, { x: info.length, duration: period,
        ease: 'none', repeat: reps }, at);
    }
  }

  // (Re)construye DOM + timeline desde una composición. Llamable en vivo desde el
  // editor (__rebuild) sin recargar GSAP/fuente. El render solo usa la 1ª build.
  function buildAll(comp) {
    COMP = comp || COMP;
    if (tl) { try { tl.kill(); } catch (e) { /* noop */ } }
    stage.innerHTML = '';
    stage.style.width = COMP.width + 'px';
    stage.style.height = COMP.height + 'px';
    if (COMP.background && COMP.background !== 'transparent') stage.style.background = COMP.background;
    else stage.style.background = 'transparent';

    tl = gsap.timeline({ paused: true });
    NODES = [];

    (COMP.layers || []).forEach(function (layer) {
      if (layer.visible === false) return;
      var info = buildLayer(layer);
      NODES.push({ id: layer.id, layer: layer, info: info });
      var anim = info.anim;
      var resting = restingVars(layer);
      var start = layer.start || 0;
      var end = layer.end != null ? layer.end : COMP.duration;
      var animation = layer.animation || {};
      var ent = animation.entrance;
      var ex = animation.exit;
      var opacity = layer.opacity != null ? layer.opacity : 1;

      if (info.isLine) {
        // Línea: la visibilidad va en el wrap (rotado); "draw" escala la barra.
        gsap.set(anim, { transformOrigin: '0% 50%', rotation: info.angle, autoAlpha: 0 });
        gsap.set(info.bar, { transformOrigin: '0% 50%' });
        tl.set(anim, { autoAlpha: 0 }, 0);
        if (ent && ent.type === 'draw') {
          tl.set(anim, { autoAlpha: opacity }, start);
          tl.fromTo(info.bar, { scaleX: 0 }, { scaleX: 1,
            duration: ent.duration || 0.6, ease: ent.ease || 'power2.out' }, start + (ent.delay || 0));
        } else if (ent && ent.type && ent.type !== 'none') {
          tl.fromTo(anim, { autoAlpha: 0 }, { autoAlpha: opacity,
            duration: ent.duration || 0.5, ease: ent.ease || 'power2.out' }, start + (ent.delay || 0));
        } else {
          tl.set(anim, { autoAlpha: opacity }, start);
        }
        applyEffect(info, layer, start, end, resting);
        if (ex && ex.type && ex.type !== 'none') {
          var ldur = ex.duration || 0.4;
          tl.to(anim, { autoAlpha: 0, duration: ldur, ease: ex.ease || 'power2.in' },
            Math.max(start, end - ldur - (ex.delay || 0)));
        }
        tl.set(anim, { autoAlpha: 0 }, end);
        return;
      }

      gsap.set(anim, { transformOrigin: '50% 50%', autoAlpha: 0 });
      tl.set(anim, { autoAlpha: 0 }, 0);

      var entV = ent && ent.type && ent.type !== 'none' && ent.type !== 'draw'
        ? entranceVars(ent, resting) : null;
      if (entV) {
        var at = start + (ent.delay || 0);
        tl.fromTo(anim, entV.from,
          Object.assign({ duration: ent.duration || 0.6, ease: ent.ease || 'power3.out' }, entV.to), at);
      } else {
        tl.set(anim, resting, start);
      }

      applyEffect(info, layer, start, end, resting);

      var exV = ex && ex.type && ex.type !== 'none' && ex.type !== 'draw'
        ? exitVars(ex, resting) : null;
      if (exV) {
        var dur = ex.duration || 0.4;
        var at2 = Math.max(start, end - dur - (ex.delay || 0));
        tl.fromTo(anim, Object.assign({}, resting),
          Object.assign({ duration: dur, ease: ex.ease || 'power2.in' }, exV), at2);
      }
      tl.set(anim, { autoAlpha: 0 }, end);
    });

    tl.pause(0);
    window.__duration = COMP.duration;
    window.__fps = COMP.fps;
    window.__seek(0);
    notify();
  }

  function notify() {
    try {
      window.parent && window.parent.postMessage(
        { type: 'motion', event: 'time', time: tl ? tl.time() : 0, duration: COMP.duration }, '*');
    } catch (e) { /* noop */ }
  }

  // --- API pública (render y preview) ---
  window.__duration = COMP.duration;
  window.__fps = COMP.fps;

  // Cajas de cada capa en coords de #stage (sin escalar), para seleccionar/arrastrar
  // desde el editor. Devuelve el tamaño REAL renderizado (resuelve el ancho del texto).
  // `on` indica si la capa es visible en el instante actual (autoAlpha).
  window.__hitboxes = function () {
    if (!stage) return [];
    var sr = stage.getBoundingClientRect();
    var out = [];
    NODES.forEach(function (n) {
      var el = n.info && n.info.anim;
      if (!el) return;
      var r = el.getBoundingClientRect();
      var cs = window.getComputedStyle(el);
      var on = cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') > 0.02;
      var layer = n.layer || {};
      out.push({
        id: n.id,
        type: layer.type,
        kind: (layer.shape || {}).kind || null,
        left: r.left - sr.left,
        top: r.top - sr.top,
        width: r.width,
        height: r.height,
        on: on,
      });
    });
    return out;
  };

  window.__seek = function (t) {
    var clamped = Math.max(0, Math.min(COMP.duration, t));
    if (tl) { tl.seek(clamped, false); gsap.ticker.tick(); }
    notify();
    return clamped;
  };

  // Reproducción de preview (no usada por el render).
  var raf = null, playStart = 0, playFrom = 0, playing = false;
  window.__isPlaying = function () { return playing; };
  window.__play = function (fromT) {
    window.__pause();
    playFrom = fromT != null ? fromT : (tl.time() >= COMP.duration - 1e-3 ? 0 : tl.time());
    playStart = performance.now();
    playing = true;
    var loop = function (now) {
      if (!playing) return;
      var t = playFrom + (now - playStart) / 1000;
      if (t >= COMP.duration) {
        if (window.__loop) { playFrom = 0; playStart = now; t = 0; }
        else { window.__seek(COMP.duration); playing = false; return; }
      }
      window.__seek(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  };
  window.__pause = function () {
    playing = false;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
  };
  window.__loop = false;
  window.__time = function () { return tl ? tl.time() : 0; };
  window.__rebuild = function (comp) { buildAll(comp); };

  buildAll(COMP);
  window.__motionReady = true;
  document.documentElement.setAttribute('data-motion-ready', '1');
})();
