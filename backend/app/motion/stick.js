/* Motor de HISTORIAS CON STICKMAN para Motion Studio.
 *
 * Se usa desde una capa type:'html' cuyo js es `StickScene.mount(tl, root, gsap, ctx)`.
 * La escena (storyboard) vive en `ctx.meta.stick` (metadata de la composición), así
 * el editor la cambia en vivo con __rebuild sin reescribir JS.
 *
 * Todo es una FUNCIÓN PURA del tiempo: un único tween proxy recorre la vida de la
 * capa y en cada update se redibuja el SVG entero para ese instante. Sin
 * Math.random ni Date → seek hacia delante/atrás y render Playwright idénticos.
 *
 * Convenciones del rig (espacio "cuerpo", unidades U = altura de la figura, y hacia
 * abajo, x = hacia donde MIRA el personaje):
 *  - torso `t`: grados desde la vertical hacia arriba; + = se inclina hacia delante.
 *  - brazos/piernas: grados desde la vertical hacia abajo; + = hacia delante.
 *  - codos (`*el`) suman al brazo; rodillas (`*kn`) suman a la pierna (negativo = flexión).
 *  - `rot`: giro del cuerpo entero (+ adelante, -90 = tumbado boca arriba); `lift`: salto.
 */
(function () {
  'use strict';

  var D2R = Math.PI / 180;

  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function smooth(k) { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); }
  function easeOut(k) { k = clamp(k, 0, 1); return 1 - Math.pow(1 - k, 3); }
  function sineInOut(k) { k = clamp(k, 0, 1); return 0.5 - 0.5 * Math.cos(Math.PI * k); }
  function osc(t, hz, ph) { return Math.sin((t * hz + (ph || 0)) * 2 * Math.PI); }
  function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function f1(v) { return (Math.round(v * 10) / 10).toString(); }

  // --- Estilos visuales -----------------------------------------------------
  var STYLES = {
    clean: { bg: '#ffffff', ink: '#0f172a', env: '#cbd5e1', envFill: '#f1f5f9', floor: '#e2e8f0',
             glass: '#f8fafc', accent: '#4f46e5', impact: '#f59e0b',
             cap: { surface: '#ffffff', border: '#e2e8f0', text: '#0f172a' } },
    paper: { bg: '#faf7f0', ink: '#1c1917', env: '#d6d3d1', envFill: '#f3ede1', floor: '#e7e0d2',
             glass: '#fdfbf6', accent: '#b45309', impact: '#dc6803',
             cap: { surface: '#fffdf8', border: '#e7e1d4', text: '#1c1917' } },
    chalk: { bg: '#1e293b', ink: '#f8fafc', env: '#475569', envFill: '#243247', floor: '#2a3a52',
             glass: '#1b2536', accent: '#fbbf24', impact: '#fbbf24',
             cap: { surface: '#0f172a', border: '#334155', text: '#f8fafc' } },
    transparent: { bg: null, ink: '#0f172a', env: '#cbd5e1', envFill: 'rgba(241,245,249,0.85)',
                   floor: 'rgba(226,232,240,0.85)', glass: 'rgba(248,250,252,0.6)', accent: '#4f46e5',
                   impact: '#f59e0b', halo: '#ffffff',
                   cap: { surface: '#ffffff', border: '#e2e8f0', text: '#0f172a' } },
  };

  // Longitudes del rig (fracción de U).
  var L = { head: 0.085, neck: 0.03, torso: 0.3, up: 0.16, fore: 0.15, thigh: 0.21, shin: 0.21 };

  // --- Biblioteca de poses ----------------------------------------------------
  var BASE = { t: 0, head: 0, lsh: -8, lel: 6, rsh: 8, rel: 6, lhp: -4, lkn: 0, rhp: 4, rkn: 0, rot: 0, lift: 0 };
  function P(o) {
    var r = {}, k;
    for (k in BASE) r[k] = BASE[k];
    for (k in o) r[k] = o[k];
    return r;
  }
  function mixPose(a, b, k) {
    var r = {};
    for (var key in BASE) r[key] = lerp(num(a[key], BASE[key]), num(b[key], BASE[key]), k);
    return r;
  }

  // c = { t: tiempo global, lt: tiempo local del plano, dur: duración del plano, cyc: ciclos de paso }
  var POSES = {
    stand: function () { return P({}); },
    idle: function (c) { var b = osc(c.t, 0.35); return P({ t: 1.5 * b, head: b, lsh: -6 + 2 * b, rsh: 6 - 2 * b }); },
    walk: function (c) {
      var s = osc(c.cyc, 1);
      return P({ t: 4, head: -2, lhp: -24 * s, rhp: 24 * s,
                 lkn: -8 - 26 * Math.max(0, s), rkn: -8 - 26 * Math.max(0, -s),
                 lsh: 22 * s, rsh: -22 * s, lel: 16, rel: 16, lift: Math.abs(s) * 0.012 });
    },
    run: function (c) {
      var s = osc(c.cyc, 1);
      return P({ t: 16, head: -8, lhp: -42 * s, rhp: 42 * s,
                 lkn: -25 - 60 * Math.max(0, s), rkn: -25 - 60 * Math.max(0, -s),
                 lsh: 42 * s, rsh: -42 * s, lel: 85, rel: 85, lift: Math.abs(Math.cos(c.cyc * Math.PI * 2)) * 0.035 });
    },
    sit: function (c) { return P({ t: -3 + osc(c.t, 0.3), lhp: 84, rhp: 90, lkn: -88, rkn: -92, lsh: 14, lel: 46, rsh: 20, rel: 52 }); },
    sit_phone: function (c) { return P({ t: 8, head: 18 + osc(c.t, 0.25), lhp: 84, rhp: 90, lkn: -88, rkn: -92, lsh: 22, lel: 100, rsh: 30, rel: 104 }); },
    sit_sleep: function (c) { return P({ t: 4, head: 34 + 3 * osc(c.t, 0.3), lhp: 84, rhp: 90, lkn: -88, rkn: -92, lsh: 10, lel: 40, rsh: 14, rel: 44 }); },
    hold_rail: function (c) { var b = osc(c.t, 0.5); return P({ t: 2 * b, head: b, rsh: 172, rel: 4, lsh: -6, lel: 8 }); },
    wave: function (c) { return P({ rsh: 150, rel: 20 + 28 * osc(c.t, 2.2), lsh: -8, head: -4 }); },
    point: function () { return P({ t: 4, rsh: 90, rel: 0, lsh: -6, lel: 10, head: -3 }); },
    talk: function (c) {
      var g = osc(c.t, 1.3);
      return P({ t: 2 + g, head: 3 * osc(c.t, 2.1), rsh: 32 + 12 * g, rel: 62 + 10 * g, lsh: -4, lel: 10 });
    },
    think: function (c) { return P({ t: 3, head: 8 + 2 * osc(c.t, 0.4), rsh: 18, rel: 148, lsh: 28, lel: 92 }); },
    laugh: function (c) {
      var b = osc(c.t, 3.2);
      return P({ t: -12 + 5 * b, head: -14 + 4 * b, rsh: 22, rel: 78, lsh: 18, lel: 76, lift: Math.max(0, b) * 0.006 });
    },
    laugh_point: function (c) {
      var b = osc(c.t, 3.2);
      return P({ t: -10 + 5 * b, head: -12 + 4 * b, rsh: 92, rel: -4, lsh: 20, lel: 78 });
    },
    giggle: function (c) { var b = osc(c.t, 4); return P({ t: 6 + 3 * b, head: 8 + 3 * b, rsh: 24, rel: 150, lsh: 14, lel: 70 }); },
    cheer: function (c) {
      var j = Math.abs(osc(c.t, 1.4));
      return P({ rsh: 160 + 10 * j, rel: 10, lsh: -160 - 10 * j, lel: -10, lhp: -8, rhp: 8,
                 lkn: -20 * j, rkn: -20 * j, lift: 0.06 * j, head: -8 });
    },
    surprised: function (c) {
      var k = easeOut(c.lt / 0.25);
      return P({ t: -8 * k, head: -6 * k, rsh: lerp(8, 140, k), rel: 30, lsh: lerp(-8, -140, k), lel: 30, lhp: -6, rhp: 10 });
    },
    scared: function (c) {
      var s = 1.5 * osc(c.t, 6);
      return P({ t: -12 + s, head: 12, rsh: 118, rel: 118, lsh: 104, lel: 124, lhp: 14, rhp: 22, lkn: -24, rkn: -30 });
    },
    hit: function (c) {
      var k = easeOut(c.lt / 0.2);
      return P({ t: -26 * k, head: -22 * k, rsh: lerp(8, 58, k), rel: 12, lsh: lerp(-8, 38, k), lel: 14,
                 lhp: 18 * k, rhp: -12 * k, lkn: -8 * k, rkn: -14 * k });
    },
    strike: function (c) {
      var k = easeOut(c.lt / 0.25);
      return P({ t: 14 * k, rsh: lerp(40, 92, k), rel: lerp(100, 0, k), lsh: -30, lel: 80, lhp: -22, rhp: 26, rkn: -10 });
    },
    push: function (c) {
      var k = easeOut(c.lt / 0.3);
      return P({ t: 18 * k, rsh: lerp(30, 86, k), rel: lerp(90, 8, k), lsh: lerp(20, 80, k), lel: lerp(90, 14, k), lhp: -24, rhp: 22, rkn: -12 });
    },
    fall: function (c) {
      var k = easeOut(c.lt / Math.min(0.7, c.dur * 0.6));
      var r = mixPose(POSES.hit({ t: c.t, lt: 1, dur: c.dur, cyc: 0 }), POSES.lie(c), k);
      r.rot = lerp(0, -90, k);
      return r;
    },
    lie: function (c) { return P({ rot: -90, head: -4 + osc(c.t, 0.2), rsh: 40, rel: 20, lsh: -30, lel: 10, lhp: 8, rhp: -6, lkn: -10, rkn: 0 }); },
    get_up: function (c) {
      var k = sineInOut(c.lt / Math.min(1.1, c.dur * 0.8));
      var r = mixPose(POSES.lie(c), POSES.stand(c), k);
      r.rot = lerp(-90, 0, k);
      return r;
    },
    crouch: function () { return P({ t: 30, head: -18, lhp: 110, lkn: -140, rhp: 96, rkn: -135, rsh: 50, rel: 40, lsh: 40, lel: 40 }); },
    sad: function (c) { return P({ t: 10, head: 26 + 2 * osc(c.t, 0.3), rsh: 2, rel: 4, lsh: -2, lel: 4 }); },
    angry: function (c) {
      var s = osc(c.t, 5);
      return P({ t: 6, head: 6, rsh: 34 + 4 * s, rel: 96, lsh: -28, lel: 60, lhp: -10, rhp: 12 });
    },
    shrug: function () { return P({ t: -2, head: 10, rsh: 30, rel: 96, lsh: -30, lel: -96 }); },
    jump: function (c) {
      var k = Math.sin(clamp(c.lt / Math.min(0.8, c.dur), 0, 1) * Math.PI);
      return P({ rsh: 60 + 80 * k, rel: 20, lsh: -60 - 80 * k, lel: -20, lkn: -50 * k, rkn: -40 * k,
                 lhp: 20 * k, rhp: 30 * k, lift: 0.22 * k });
    },
    dance: function (c) {
      var s = osc(c.t, 1.6), q = osc(c.t, 3.2);
      return P({ t: 8 * s, head: -6 * s, rsh: 120 + 30 * q, rel: 40, lsh: -40 - 30 * s, lel: 60,
                 lhp: -14 * s, rhp: 14 * s, lkn: -10 - 10 * Math.max(0, q), rkn: -10 - 10 * Math.max(0, -q),
                 lift: 0.02 * Math.abs(q) });
    },
    phone_call: function (c) { return P({ t: 2, head: 6 + 2 * osc(c.t, 1.2), rsh: 24, rel: 160, lsh: -6 }); },
    look_phone: function (c) { return P({ t: 6, head: 22 + osc(c.t, 0.3), rsh: 30, rel: 100, lsh: 24, lel: 104 }); },
  };
  var SIT_POSES = { sit: 1, sit_phone: 1, sit_sleep: 1 };

  // --- Utilidades SVG --------------------------------------------------------
  function ptsStr(pts) {
    var s = '';
    for (var i = 0; i < pts.length; i++) s += (i ? ' ' : '') + f1(pts[i][0]) + ',' + f1(pts[i][1]);
    return s;
  }
  function pl(pts, stroke, w, extra) {
    return '<polyline points="' + ptsStr(pts) + '" fill="none" stroke="' + stroke + '" stroke-width="' + f1(w) +
      '" stroke-linecap="round" stroke-linejoin="round"' + (extra || '') + '/>';
  }
  function pg(pts, fill, stroke, w) {
    return '<polygon points="' + ptsStr(pts) + '" fill="' + fill + '" stroke="' + (stroke || 'none') +
      '" stroke-width="' + f1(w || 0) + '" stroke-linejoin="round"/>';
  }
  function circ(c, r, fill, stroke, w) {
    return '<circle cx="' + f1(c[0]) + '" cy="' + f1(c[1]) + '" r="' + f1(r) + '" fill="' + fill +
      '" stroke="' + (stroke || 'none') + '" stroke-width="' + f1(w || 0) + '"/>';
  }
  function rect(x, y, w, h, fill, stroke, sw, rx) {
    return '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(Math.max(0, w)) + '" height="' + f1(Math.max(0, h)) +
      '" rx="' + f1(rx || 0) + '" fill="' + fill + '" stroke="' + (stroke || 'none') + '" stroke-width="' + f1(sw || 0) + '"/>';
  }
  function line(x1, y1, x2, y2, stroke, w) { return pl([[x1, y1], [x2, y2]], stroke, w); }
  function arcPts(cx, cy, rx, ry, a0, a1, n) {
    var out = [];
    for (var i = 0; i <= n; i++) {
      var a = lerp(a0, a1, i / n) * D2R;
      out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return out;
  }
  function textSvg(x, y, s, size, fill, weight, extra) {
    return '<text x="' + f1(x) + '" y="' + f1(y) + '" font-family="Inter, system-ui, sans-serif" font-size="' + f1(size) +
      '" font-weight="' + (weight || 800) + '" fill="' + fill + '" text-anchor="middle" dominant-baseline="middle"' +
      (extra || '') + '>' + esc(s) + '</text>';
  }

  // --- Personaje -------------------------------------------------------------
  function drawFigure(ch, st, S, halo) {
    var U = S.U, a = st.ang, f = st.f;
    var ink = halo ? S.st.halo : (ch.ink || S.st.ink);
    var sw = S.sw + (halo ? S.sw * 1.1 : 0);
    var R = L.head;
    var tR = a.t * D2R, hR = (a.t + a.head) * D2R;

    var hip = [0, 0];
    var sh = [L.torso * Math.sin(tR), -L.torso * Math.cos(tR)];
    var hc = [sh[0] + (L.neck + R) * Math.sin(hR), sh[1] - (L.neck + R) * Math.cos(hR)];
    function limb(o, a1, a2, l1, l2) {
      var r1 = a1 * D2R, r2 = (a1 + a2) * D2R;
      var m = [o[0] + l1 * Math.sin(r1), o[1] + l1 * Math.cos(r1)];
      var e = [m[0] + l2 * Math.sin(r2), m[1] + l2 * Math.cos(r2)];
      return { m: m, e: e, toe: [e[0] + 0.055 * Math.cos(r2), e[1] - 0.055 * Math.sin(r2)] };
    }
    var ra = limb(sh, a.rsh + 0.3 * a.t, a.rel, L.up, L.fore);
    var la = limb(sh, a.lsh + 0.3 * a.t, a.lel, L.up, L.fore);
    var rl = limb(hip, a.rhp, a.rkn, L.thigh, L.shin);
    var ll = limb(hip, a.lhp, a.lkn, L.thigh, L.shin);

    var rr = a.rot * D2R, cr = Math.cos(rr), sr = Math.sin(rr);
    function rot(p) { return [p[0] * cr - p[1] * sr, p[0] * sr + p[1] * cr]; }
    var probe = [hip, sh, ra.m, ra.e, la.m, la.e, rl.m, rl.e, rl.toe, ll.m, ll.e, ll.toe];
    var maxY = -1e9;
    for (var i = 0; i < probe.length; i++) maxY = Math.max(maxY, rot(probe[i])[1]);
    maxY = Math.max(maxY, rot(hc)[1] + R);
    var baseY = S.G - maxY * U - S.sw * 0.5 - num(a.lift, 0) * U;
    var X0 = st.px;
    // Tumbado/cayendo el cuerpo ocupa ~1 U en horizontal: si se sale del lienzo, se
    // desplaza lo justo para que entre (las entradas/salidas caminando no se tocan).
    var tilt = clamp((Math.abs(num(a.rot, 0)) - 20) / 50, 0, 1);
    if (tilt > 0) {
      var minX = 1e9, maxX = -1e9;
      for (var pi = 0; pi < probe.length; pi++) {
        var qx = f * rot(probe[pi])[0] * U;
        minX = Math.min(minX, qx); maxX = Math.max(maxX, qx);
      }
      var hx = f * rot(hc)[0] * U;
      minX = Math.min(minX, hx - R * U); maxX = Math.max(maxX, hx + R * U);
      var pad = U * 0.06;
      var shift = 0;
      if (X0 + minX < pad) shift = pad - (X0 + minX);
      else if (X0 + maxX > S.W - pad) shift = (S.W - pad) - (X0 + maxX);
      X0 += shift * tilt;
    }
    st.pxDrawn = X0;
    function scr(p) { var q = rot(p); return [X0 + f * q[0] * U, baseY + q[1] * U]; }
    function mid(p, q, k) { return [lerp(p[0], q[0], k), lerp(p[1], q[1], k)]; }
    function hl(lx, ly) {
      var c = Math.cos(hR), s = Math.sin(hR);
      return scr([hc[0] + (lx * c - ly * s) * R, hc[1] + (lx * s + ly * c) * R]);
    }
    function hArc(cx, cy, rx, ry, a0, a1, n) {
      var raw = arcPts(cx, cy, rx, ry, a0, a1, n), out = [];
      for (var j = 0; j < raw.length; j++) out.push(hl(raw[j][0], raw[j][1]));
      return out;
    }

    var out = '';
    var clothW = sw + S.sw * 1.35;
    var outline = S.sw * 0.5;
    var shirt = halo ? null : ch.shirt;
    var pants = halo ? null : ch.pants;
    var outfit = ch.outfit || 'shirt_pants';

    function outlined(pts, color) {
      if (!color) return '';
      return pl(pts, ink, clothW + outline * 2) + pl(pts, color, clothW);
    }
    function drawArm(A) {
      var s0 = scr(sh), m = scr(A.m), e = scr(A.e);
      var o = pl([s0, m, e], ink, sw);
      if (shirt || halo) o += outlined([s0, scr(mid(sh, A.m, 0.55))], shirt || ink);
      o += circ(e, sw * 0.62, ink);
      return o;
    }
    function drawLeg(G) {
      var h = scr(hip), m = scr(G.m), e = scr(G.e), t = scr(G.toe);
      var o = pl([h, m, e, t], ink, sw);
      if (outfit !== 'dress' && (pants || halo)) o += outlined([h, m, scr(mid(G.m, G.e, 0.86))], pants || ink);
      return o;
    }

    // Asiento para poses sentadas (antes que la figura).
    if (!halo && SIT_POSES[st.pose]) {
      var hp0 = scr(hip), kn0 = scr(rl.m);
      var seatY = hp0[1] + S.sw * 1.3;
      var sx0 = hp0[0] - f * U * 0.12, sx1 = kn0[0] + f * U * 0.02;
      var sxa = Math.min(sx0, sx1), sxb = Math.max(sx0, sx1);
      var back = f > 0 ? sxa : sxb;
      out += rect(sxa, seatY, sxb - sxa, U * 0.05, S.st.envFill, S.st.env, S.sw * 0.45, U * 0.02);
      out += line(back, seatY + U * 0.02, back, seatY - U * 0.32, S.st.env, S.sw * 0.9);
      out += line((sxa + sxb) / 2, seatY + U * 0.05, (sxa + sxb) / 2, S.G, S.st.env, S.sw * 0.7);
    }

    out += drawArm(la);
    out += drawLeg(ll);

    if (!halo && ch.accessory === 'backpack') {
      var bp = scr(mid(hip, sh, 0.62)), bpw = U * 0.1, bph = U * 0.2;
      out += rect(bp[0] - f * U * 0.07 - bpw / 2, bp[1] - bph / 2, bpw, bph, ch.accent_color || S.st.accent, ink, S.sw * 0.45, U * 0.03);
    }

    out += drawLeg(rl);

    // Torso + ropa
    var s0 = scr(sh), h0 = scr(hip);
    if (outfit === 'dress' || outfit === 'shirt_skirt') {
      var isDress = outfit === 'dress';
      var ax = [Math.sin(tR), -Math.cos(tR)];         // eje del torso (hacia arriba)
      var px = [Math.cos(tR), Math.sin(tR)];          // perpendicular (hacia delante)
      var waist = isDress ? mid(hip, sh, 0.62) : mid(hip, sh, 0.12);
      var hem = [hip[0] - ax[0] * (isDress ? 0.24 : 0.12), hip[1] - ax[1] * (isDress ? 0.24 : 0.12)];
      var ww = isDress ? 0.05 : 0.055, hw = isDress ? 0.15 : 0.11;
      var poly = [
        scr([waist[0] + px[0] * ww, waist[1] + px[1] * ww]),
        scr([hem[0] + px[0] * hw, hem[1] + px[1] * hw]),
        scr([hem[0] - px[0] * hw, hem[1] - px[1] * hw]),
        scr([waist[0] - px[0] * ww, waist[1] - px[1] * ww]),
      ];
      var dcol = halo ? S.st.halo : (isDress ? (ch.shirt || S.st.accent) : (ch.pants || ch.shirt || S.st.accent));
      out += pg(poly, dcol, ink, outline * 1.6);
    }
    out += pl([s0, h0], ink, sw);
    if (shirt || halo) out += outlined([scr(mid(sh, hip, 0.05)), scr(mid(sh, hip, outfit === 'dress' ? 0.4 : 0.97))], shirt || ink);
    if (!halo && ch.accessory === 'tie') {
      out += pl([scr(mid(sh, hip, 0.06)), scr(mid(sh, hip, 0.5))], ch.accent_color || '#dc2626', S.sw * 0.8);
    }

    // Cabeza
    var hcs = scr(hc);
    var headFill = halo ? S.st.halo : (S.st.bg || '#ffffff');
    out += circ(hcs, R * U, headFill, ink, sw * 0.85);
    if (!halo) {
      out += drawHair(ch, hl, hArc, R * U, ink, S);
      out += drawFace(st.expr, hl, hArc, R * U, ink, S);
      out += drawHeadwear(ch, hl, hArc, R * U, ink, S);
    }

    out += drawArm(ra);
    return { svg: out, head: hcs, chest: scr(mid(sh, hip, 0.25)), hip: h0, feetY: S.G, R: R * U };
  }

  function drawHair(ch, hl, hArc, Rp, ink, S) {
    var col = ch.hair_color || ink, sw = S.sw, out = '';
    switch (ch.hair) {
      case 'short':
        out += pl(hArc(0, 0, 1.02, 1.02, 165, 330, 14), col, sw * 1.5);
        break;
      case 'long':
        out += pl(hArc(0, 0, 1.02, 1.02, 150, 330, 14), col, sw * 1.5);
        out += pl([hl(-0.95, -0.2), hl(-1.2, 0.9), hl(-1.05, 2.1)], col, sw * 1.1);
        out += pl([hl(-0.6, -0.6), hl(-0.9, 0.6), hl(-0.7, 1.9)], col, sw * 0.9);
        break;
      case 'bun':
        out += pl(hArc(0, 0, 1.02, 1.02, 160, 330, 14), col, sw * 1.4);
        out += circ(hl(-0.75, -1.05), Rp * 0.42, col);
        break;
      case 'ponytail':
        out += pl(hArc(0, 0, 1.02, 1.02, 160, 330, 14), col, sw * 1.4);
        out += pl([hl(-0.95, -0.5), hl(-1.7, -0.1), hl(-1.85, 0.9)], col, sw * 1.2);
        break;
      case 'curly':
        for (var i = 0; i < 7; i++) {
          var ang = (175 + i * 26) * D2R;
          out += circ(hl(Math.cos(ang) * 1.02, Math.sin(ang) * 1.02), Rp * 0.3, col);
        }
        break;
      case 'spiky':
        out += pl([hl(-0.95, -0.35), hl(-0.9, -1.25), hl(-0.45, -0.95), hl(-0.2, -1.45), hl(0.15, -0.98),
                   hl(0.5, -1.35), hl(0.7, -0.75)], col, sw * 0.8);
        break;
      default:
        break;
    }
    return out;
  }

  function drawHeadwear(ch, hl, hArc, Rp, ink, S) {
    var sw = S.sw, out = '', acc = ch.accessory;
    var col = ch.accent_color || S.st.accent;
    if (acc === 'glasses') {
      out += circ(hl(0.62, -0.12), Rp * 0.22, 'none', ink, sw * 0.4);
      out += circ(hl(0.16, -0.12), Rp * 0.22, 'none', ink, sw * 0.4);
      out += pl([hl(0.38, -0.12), hl(0.4, -0.12)], ink, sw * 0.4);
      out += pl([hl(-0.06, -0.12), hl(-0.9, -0.2)], ink, sw * 0.4);
    } else if (acc === 'cap') {
      var capPts = hArc(0, 0, 1.08, 1.08, 180, 360, 14);
      out += pg(capPts, col, ink, sw * 0.45);
      out += pl([hl(0.4, -0.22), hl(1.55, -0.12)], ink, sw * 1.1);
    } else if (acc === 'hat') {
      out += pl([hl(-1.45, -0.55), hl(1.45, -0.55)], ink, sw * 1.0);
      out += pg([hl(-0.75, -0.55), hl(-0.7, -1.5), hl(0.7, -1.5), hl(0.75, -0.55)], col, ink, sw * 0.5);
    } else if (acc === 'headphones') {
      out += pl(hArc(0, 0, 1.2, 1.2, 190, 350, 12), ink, sw * 0.6);
      out += circ(hl(-0.2, 0.05), Rp * 0.32, col, ink, sw * 0.4);
    }
    return out;
  }

  function drawFace(expr, hl, hArc, Rp, ink, S) {
    var sw = S.sw * 0.42, out = '';
    var e1 = [0.18, -0.12], e2 = [0.62, -0.12];
    function eyes(r) { return circ(hl(e1[0], e1[1]), Rp * r, ink) + circ(hl(e2[0], e2[1]), Rp * r, ink); }
    switch (expr) {
      case 'happy':
        out += eyes(0.1) + pl(hArc(0.44, 0.26, 0.26, 0.17, 20, 160, 8), ink, sw);
        break;
      case 'laugh':
        out += pl([hl(0.08, -0.08), hl(0.18, -0.2), hl(0.28, -0.08)], ink, sw);
        out += pl([hl(0.52, -0.08), hl(0.62, -0.2), hl(0.72, -0.08)], ink, sw);
        out += pg(hArc(0.44, 0.22, 0.3, 0.3, 0, 180, 10), ink, ink, sw * 0.5);
        break;
      case 'surprised':
        out += eyes(0.13);
        out += pl([hl(0.06, -0.42), hl(0.3, -0.48)], ink, sw) + pl([hl(0.5, -0.48), hl(0.74, -0.42)], ink, sw);
        out += circ(hl(0.45, 0.42), Rp * 0.14, 'none', ink, sw);
        break;
      case 'sad':
        out += eyes(0.1) + pl(hArc(0.44, 0.56, 0.22, 0.14, 205, 335, 8), ink, sw);
        out += pl([hl(0.06, -0.3), hl(0.28, -0.4)], ink, sw) + pl([hl(0.52, -0.4), hl(0.74, -0.3)], ink, sw);
        break;
      case 'angry':
        out += eyes(0.1);
        out += pl([hl(0.04, -0.42), hl(0.3, -0.26)], ink, sw * 1.2) + pl([hl(0.5, -0.26), hl(0.78, -0.42)], ink, sw * 1.2);
        out += pl(hArc(0.44, 0.55, 0.2, 0.1, 210, 330, 6), ink, sw);
        break;
      case 'pain':
        out += pl([hl(0.08, -0.22), hl(0.24, -0.12), hl(0.08, -0.02)], ink, sw);
        out += pl([hl(0.72, -0.22), hl(0.56, -0.12), hl(0.72, -0.02)], ink, sw);
        out += pl([hl(0.22, 0.44), hl(0.32, 0.36), hl(0.42, 0.44), hl(0.52, 0.36), hl(0.62, 0.44)], ink, sw);
        break;
      case 'dizzy':
        out += pl([hl(0.08, -0.22), hl(0.28, -0.02)], ink, sw) + pl([hl(0.28, -0.22), hl(0.08, -0.02)], ink, sw);
        out += pl([hl(0.52, -0.22), hl(0.72, -0.02)], ink, sw) + pl([hl(0.72, -0.22), hl(0.52, -0.02)], ink, sw);
        out += circ(hl(0.44, 0.42), Rp * 0.09, 'none', ink, sw);
        break;
      case 'scared':
        out += eyes(0.14);
        out += pl([hl(0.06, -0.36), hl(0.3, -0.46)], ink, sw) + pl([hl(0.5, -0.46), hl(0.74, -0.36)], ink, sw);
        out += pl([hl(0.24, 0.44), hl(0.34, 0.38), hl(0.44, 0.44), hl(0.54, 0.38), hl(0.64, 0.44)], ink, sw);
        break;
      case 'smirk':
        out += eyes(0.1) + pl([hl(0.22, 0.44), hl(0.5, 0.42), hl(0.66, 0.32)], ink, sw);
        break;
      default: // neutral
        out += eyes(0.1) + pl([hl(0.26, 0.42), hl(0.64, 0.4)], ink, sw);
        break;
    }
    return out;
  }

  // --- Escenarios ------------------------------------------------------------
  function drawEnvironment(env, S, T, moving) {
    var W = S.W, H = S.H, G = S.G, U = S.U, st = S.st, sw = S.sw, out = '';
    var lineW = sw * 0.45;
    switch (env) {
      case 'street': {
        for (var i = 0; i < 4; i++) {
          var bw = W * 0.24, bx = W * (i * 0.27 - 0.03), bh = U * (1.05 + hash(i + 1) * 0.55);
          out += rect(bx, G - bh, bw, bh, st.envFill, st.env, lineW, U * 0.015);
          for (var r = 0; r < 4; r++) {
            for (var c = 0; c < 2; c++) {
              var wy = G - bh + U * (0.12 + r * 0.22);
              if (wy > G - U * 0.25) continue;
              out += rect(bx + bw * (0.2 + c * 0.38), wy, bw * 0.22, U * 0.11, st.glass, st.env, lineW * 0.8, U * 0.01);
            }
          }
        }
        out += line(W * 0.9, G, W * 0.9, G - U * 1.35, st.env, sw * 0.8);
        out += pl(arcPts(W * 0.9 - U * 0.1, G - U * 1.35, U * 0.1, U * 0.08, 180, 360, 8), st.env, sw * 0.8);
        out += rect(0, G, W, H - G, st.floor, 'none');
        out += line(0, G, W, G, st.env, lineW * 1.6);
        out += line(0, G + U * 0.07, W, G + U * 0.07, st.env, lineW);
        break;
      }
      case 'bus': {
        var sway = moving ? Math.sin(T * 2.3) * U * 0.004 : 0;
        out += '<g transform="translate(0,' + f1(sway) + ')">';
        out += rect(-W, -H, W * 3, H * 3, st.envFill, 'none');
        var n = W > H ? 4 : 3, gap = W * 0.03;
        var wy0 = G - U * 1.3, wh = U * 0.5;
        var ww = (W - gap * (n + 1)) / n;
        var clip = '';
        for (var k = 0; k < n; k++) clip += rect(gap + k * (ww + gap), wy0, ww, wh, '#000', 'none', 0, U * 0.05);
        out += '<defs><clipPath id="skBusWin">' + clip + '</clipPath></defs>';
        out += clip.replace(/fill="#000"/g, 'fill="' + st.glass + '"');
        // Paisaje que pasa por las ventanas (siluetas deterministas).
        var speed = moving ? W * 0.9 : 0, period = W * 0.34;
        var off = ((T * speed) % period + period) % period;
        var sc = '';
        for (var b = -1; b < 5; b++) {
          var sx = b * period - off + period * 0.2;
          var shh = wh * (0.35 + hash(b + Math.floor(T * speed / period) + 7) * 0.5);
          sc += rect(sx, wy0 + wh - shh, period * 0.42, shh, st.env, 'none');
          sc += line(sx + period * 0.75, wy0 + wh * 0.15, sx + period * 0.75, wy0 + wh, st.env, sw * 0.5);
        }
        out += '<g clip-path="url(#skBusWin)" opacity="0.55">' + sc + '</g>';
        for (var k2 = 0; k2 < n; k2++) out += rect(gap + k2 * (ww + gap), wy0, ww, wh, 'none', st.env, lineW * 1.4, U * 0.05);
        // Barra superior con agarraderas.
        var ry = G - U * 1.4;
        out += line(0, ry, W, ry, st.env, sw * 0.7);
        for (var q = 0; q < 6; q++) {
          var qx = W * (0.08 + q * 0.17);
          out += line(qx, ry, qx, G - U * 1.13, st.env, lineW);
          out += circ([qx, G - U * 1.09], U * 0.035, 'none', st.env, lineW);
        }
        out += '</g>';
        out += rect(0, G, W, H - G, st.floor, 'none');
        out += line(0, G, W, G, st.env, lineW * 1.6);
        break;
      }
      case 'office': {
        out += rect(W * 0.08, G - U * 1.3, W * 0.3, U * 0.6, st.glass, st.env, lineW * 1.4, U * 0.02);
        for (var bl = 1; bl < 6; bl++) out += line(W * 0.08, G - U * 1.3 + bl * U * 0.1, W * 0.38, G - U * 1.3 + bl * U * 0.1, st.env, lineW * 0.6);
        out += rect(W * 0.62, G - U * 0.42, W * 0.34, U * 0.04, st.envFill, st.env, lineW * 1.2, U * 0.01);
        out += line(W * 0.65, G - U * 0.38, W * 0.65, G, st.env, lineW * 1.2);
        out += line(W * 0.93, G - U * 0.38, W * 0.93, G, st.env, lineW * 1.2);
        out += rect(W * 0.7, G - U * 0.72, W * 0.16, U * 0.26, st.glass, st.env, lineW * 1.4, U * 0.015);
        out += line(W * 0.78, G - U * 0.46, W * 0.78, G - U * 0.42, st.env, lineW * 1.4);
        out += rect(0, G, W, H - G, st.floor, 'none');
        out += line(0, G, W, G, st.env, lineW * 1.6);
        break;
      }
      case 'room': {
        out += rect(W * 0.1, G - U * 1.3, W * 0.26, U * 0.55, st.glass, st.env, lineW * 1.4, U * 0.02);
        out += line(W * 0.23, G - U * 1.3, W * 0.23, G - U * 0.75, st.env, lineW);
        out += line(W * 0.1, G - U * 1.02, W * 0.36, G - U * 1.02, st.env, lineW);
        out += rect(W * 0.62, G - U * 1.22, W * 0.2, U * 0.3, st.envFill, st.env, lineW * 1.4, U * 0.01);
        out += line(W * 0.9, G, W * 0.9, G - U * 0.7, st.env, lineW * 1.4);
        out += pg([[W * 0.9 - U * 0.1, G - U * 0.7], [W * 0.9 + U * 0.1, G - U * 0.7], [W * 0.9 + U * 0.06, G - U * 0.86], [W * 0.9 - U * 0.06, G - U * 0.86]], st.envFill, st.env, lineW);
        out += rect(0, G, W, H - G, st.floor, 'none');
        out += line(0, G, W, G, st.env, lineW * 1.6);
        break;
      }
      case 'classroom': {
        out += rect(W * 0.12, G - U * 1.45, W * 0.76, U * 0.62, st.envFill, st.env, lineW * 1.6, U * 0.02);
        for (var cl = 0; cl < 3; cl++) {
          out += line(W * 0.2, G - U * (1.3 - cl * 0.14), W * (0.2 + 0.3 + hash(cl) * 0.3), G - U * (1.3 - cl * 0.14), st.env, lineW);
        }
        out += rect(0, G, W, H - G, st.floor, 'none');
        out += line(0, G, W, G, st.env, lineW * 1.6);
        break;
      }
      case 'park': {
        var drift = (T * W * 0.02) % (W * 1.4);
        for (var cc = 0; cc < 2; cc++) {
          var cx = (W * (0.2 + cc * 0.55) + drift) % (W * 1.4) - W * 0.2, cy = G - U * (1.5 + cc * 0.2);
          out += pl(arcPts(cx, cy, U * 0.12, U * 0.07, 180, 360, 10), st.env, lineW * 1.2);
          out += pl(arcPts(cx + U * 0.13, cy, U * 0.09, U * 0.06, 180, 360, 10), st.env, lineW * 1.2);
        }
        out += rect(W * 0.14 - U * 0.03, G - U * 0.55, U * 0.06, U * 0.55, st.envFill, st.env, lineW, U * 0.01);
        out += circ([W * 0.14, G - U * 0.78], U * 0.3, st.envFill, st.env, lineW * 1.2);
        out += line(W * 0.72, G - U * 0.2, W * 0.95, G - U * 0.2, st.env, sw * 0.7);
        out += line(W * 0.72, G - U * 0.34, W * 0.95, G - U * 0.34, st.env, sw * 0.5);
        out += line(W * 0.74, G - U * 0.2, W * 0.74, G, st.env, lineW);
        out += line(W * 0.93, G - U * 0.2, W * 0.93, G, st.env, lineW);
        out += rect(0, G, W, H - G, st.floor, 'none');
        out += line(0, G, W, G, st.env, lineW * 1.6);
        break;
      }
      default:
        break;
    }
    return out;
  }

  // --- Efectos ---------------------------------------------------------------
  function drawFx(fx, body, lt, dur, S, dir) {
    var U = S.U, st = S.st, sw = S.sw, out = '';
    var at = Math.max(0, num(fx.at, 0));
    var k, i;
    var hx = body.head[0], hy = body.head[1], R = body.R;
    var f = body.f;
    switch (fx.type) {
      case 'impact': {
        if (lt < at || lt > at + 0.6) return '';
        k = (lt - at) / 0.6;
        var cx = body.chest[0] - f * U * 0.1, cy = body.chest[1];
        var r1 = U * (0.08 + 0.12 * easeOut(k)), r2 = r1 + U * 0.16 * (1 - k);
        var op = 1 - k * k;
        for (i = 0; i < 10; i++) {
          var ang = (i / 10) * Math.PI * 2 + 0.3;
          out += pl([[cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1], [cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2]],
            st.impact, sw * 0.9, ' opacity="' + op.toFixed(2) + '"');
        }
        var star = [], sr = U * 0.07 * easeOut(Math.min(1, k * 3)) * (1 - k * 0.6);
        for (i = 0; i < 16; i++) {
          var a2 = (i / 16) * Math.PI * 2, rr = i % 2 ? sr * 0.45 : sr;
          star.push([cx + Math.cos(a2) * rr, cy + Math.sin(a2) * rr]);
        }
        out += '<g opacity="' + op.toFixed(2) + '">' + pg(star, st.impact, 'none') + '</g>';
        return out;
      }
      case 'speed': {
        var d = dir || -f;
        for (i = 0; i < 4; i++) {
          var yy = body.chest[1] + (i - 1.5) * U * 0.09;
          var len = U * (0.18 + 0.1 * (0.5 + 0.5 * osc(lt, 3, i * 0.25)));
          var x0 = body.chest[0] - d * U * (0.2 + i % 2 * 0.05);
          out += pl([[x0, yy], [x0 - d * len, yy]], st.ink, sw * 0.5, ' opacity="0.35"');
        }
        return out;
      }
      case 'exclaim':
      case 'question': {
        if (lt < at) return '';
        k = easeOut((lt - at) / 0.25);
        var size = U * 0.2 * (0.6 + 0.4 * k);
        var wob = fx.type === 'question' ? osc(lt, 1.2) * 6 : 0;
        return '<g opacity="' + k.toFixed(2) + '" transform="rotate(' + f1(wob) + ' ' + f1(hx + f * R * 0.6) + ' ' + f1(hy - R * 2.6) + ')">' +
          textSvg(hx + f * R * 0.6, hy - R * 2.6, fx.type === 'exclaim' ? '!' : '?', size, st.accent, 900) + '</g>';
      }
      case 'laugh': {
        for (i = 0; i < 6; i++) {
          var t0 = at + i * 0.45;
          if (lt < t0 || lt > t0 + 1.1) continue;
          k = (lt - t0) / 1.1;
          var tx = hx + f * R * (1.5 + (i % 2) * 0.9), ty = hy - R * 1.2 - k * U * 0.28;
          out += '<g opacity="' + Math.sin(Math.PI * k).toFixed(2) + '">' +
            textSvg(tx, ty, 'JA', U * 0.075, st.ink, 800) + '</g>';
        }
        return out;
      }
      case 'sweat': {
        k = ((lt - at) % 1.2 + 1.2) % 1.2 / 1.2;
        var dx = hx - f * R * 1.1, dy = hy - R * 0.6 + k * R * 1.2;
        return '<g opacity="' + (1 - k).toFixed(2) + '">' +
          pg([[dx, dy - R * 0.35], [dx + R * 0.22, dy + R * 0.05], [dx, dy + R * 0.3], [dx - R * 0.22, dy + R * 0.05]], '#38bdf8', 'none') + '</g>';
      }
      case 'dizzy': {
        for (i = 0; i < 3; i++) {
          var a3 = lt * 4 + i * 2.094;
          var px = hx + Math.cos(a3) * R * 1.4, py = hy - R * 1.25 + Math.sin(a3) * R * 0.35;
          var stp = [];
          for (var j = 0; j < 10; j++) {
            var aj = (j / 10) * Math.PI * 2 - Math.PI / 2, rj = j % 2 ? R * 0.14 : R * 0.32;
            stp.push([px + Math.cos(aj) * rj, py + Math.sin(aj) * rj]);
          }
          out += pg(stp, st.impact, 'none');
        }
        return out;
      }
      case 'love': {
        for (i = 0; i < 3; i++) {
          var t1 = at + i * 0.5;
          if (lt < t1) continue;
          k = ((lt - t1) % 1.5) / 1.5;
          var lx = hx + f * R * (1.2 + i * 0.5), ly = hy - R * 1.4 - k * U * 0.2, s = R * 0.28;
          out += '<g opacity="' + Math.sin(Math.PI * k).toFixed(2) + '"><path d="M' + f1(lx) + ' ' + f1(ly + s) +
            ' C ' + f1(lx - s * 2) + ' ' + f1(ly - s * 0.6) + ', ' + f1(lx - s * 0.6) + ' ' + f1(ly - s * 1.8) + ', ' + f1(lx) + ' ' + f1(ly - s * 0.5) +
            ' C ' + f1(lx + s * 0.6) + ' ' + f1(ly - s * 1.8) + ', ' + f1(lx + s * 2) + ' ' + f1(ly - s * 0.6) + ', ' + f1(lx) + ' ' + f1(ly + s) +
            ' Z" fill="#f43f5e"/></g>';
        }
        return out;
      }
      case 'zzz': {
        for (i = 0; i < 3; i++) {
          k = ((lt + i * 0.6) % 1.8) / 1.8;
          out += '<g opacity="' + Math.sin(Math.PI * k).toFixed(2) + '">' +
            textSvg(hx + f * R * (1.2 + k * 1.5), hy - R * (1.2 + k * 2.2), 'z', U * (0.05 + k * 0.04), st.ink, 800) + '</g>';
        }
        return out;
      }
      default:
        return '';
    }
  }

  // --- Escena ----------------------------------------------------------------
  var CAMERAS = { wide: 1, medium: 1.4, close: 1.9 };

  function prepScene(raw, dur) {
    var sc = raw && typeof raw === 'object' ? raw : {};
    var chars = {};
    (Array.isArray(sc.characters) ? sc.characters : []).forEach(function (c, i) {
      if (c && c.id) chars[c.id] = c;
      else if (c) chars['c' + i] = c;
    });
    var list = (Array.isArray(sc.shots) ? sc.shots : []).filter(function (s) { return s && typeof s === 'object'; });
    var total = num(sc.duration, dur) || dur;
    var shots = [], cursor = 0;
    list.forEach(function (s, i) {
      var st = s.start != null ? num(s.start, cursor) : cursor;
      var en = s.end != null ? num(s.end, st + 2) : st + num(s.duration, total / Math.max(1, list.length));
      if (en <= st) en = st + 0.5;
      shots.push({ src: s, i: i, start: st, end: en });
      cursor = en;
    });
    if (!shots.length) shots.push({ src: { actors: [] }, i: 0, start: 0, end: dur });
    return { chars: chars, shots: shots, style: sc.style || {}, environment: sc.environment || {} };
  }

  function mount(tl, root, gsap, ctx, sceneArg) {
    var W = num(ctx.width, 1080), H = num(ctx.height, 1920);
    var life = Math.max(0.1, num(ctx.life, 4));
    var scene = prepScene(sceneArg || (ctx.meta || {}).stick, life);
    var styleKey = scene.style.preset || 'clean';
    var st = {}, base = STYLES[styleKey] || STYLES.clean, key;
    for (key in base) st[key] = base[key];
    if (scene.style.accent) st.accent = scene.style.accent;
    var vertical = H > W;
    var U = Math.min(W * (vertical ? 0.56 : 0.46), H * 0.4);
    var S = {
      W: W, H: H, U: U, G: H * (vertical ? 0.72 : 0.86), sw: U * 0.026, st: st,
    };
    // En vertical el ancho visible manda: zooms más contenidos para no cortar figuras.
    var ZOOM = vertical ? { wide: 1, medium: 1.25, close: 1.6 } : CAMERAS;
    var envKey = scene.environment.preset || 'none';
    var captionsOn = scene.style.captions !== false;

    root.innerHTML =
      '<svg class="sk-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H +
      '" style="position:absolute;left:0;top:0;overflow:hidden"></svg>' +
      '<div class="sk-cap" style="position:absolute;left:50%;top:' + f1(H * 0.075) + 'px;width:max-content;max-width:86%;' +
      'transform:translateX(-50%);opacity:0;font-family:Inter,system-ui,sans-serif;font-weight:700;' +
      'font-size:' + f1(Math.min(W, H) * 0.05) + 'px;line-height:1.2;text-align:center;letter-spacing:-0.01em;' +
      'color:' + st.cap.text + ';background:' + st.cap.surface + ';border:1px solid ' + st.cap.border + ';' +
      'border-radius:' + f1(Math.min(W, H) * 0.022) + 'px;padding:0.55em 0.95em;' +
      'box-shadow:0 10px 30px -12px rgba(15,23,42,.25);white-space:pre-wrap;"></div>';
    var svg = root.querySelector('.sk-svg');
    var cap = root.querySelector('.sk-cap');
    var lastCap = null;

    function actorIn(shot, id) {
      var arr = Array.isArray(shot.src.actors) ? shot.src.actors : [];
      for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].id === id) return arr[i];
      return null;
    }

    function rawState(shot, a, lt, T) {
      var dur = shot.end - shot.start;
      var x0 = clamp(num(a.x, 0.5), -0.4, 1.4);
      var x1 = a.to_x != null ? clamp(num(a.to_x, x0), -0.4, 1.4) : x0;
      var moving = Math.abs(x1 - x0) > 0.001;
      var k = moving ? sineInOut(lt / dur) : 0;
      var x = lerp(x0, x1, k);
      var f = a.facing ? (num(a.facing, 1) < 0 ? -1 : 1) : (moving ? (x1 > x0 ? 1 : -1) : (x0 <= 0.5 ? 1 : -1));
      var dist = Math.abs(x - x0) * W;
      var pose = POSES[a.pose] ? a.pose : 'stand';
      var cyc = moving ? dist / (U * 0.62) : T * 1.3;
      var ang = POSES[pose]({ t: T, lt: lt, dur: dur, cyc: cyc });
      return { x: x, f: f, ang: ang, pose: pose, expr: a.expression || 'neutral', moving: moving, dir: x1 > x0 ? 1 : -1 };
    }

    function actorState(si, a, lt, T) {
      var shot = scene.shots[si];
      var cur = rawState(shot, a, lt, T);
      cur.alpha = 1;
      var dur = shot.end - shot.start;
      if (si > 0) {
        var prevShot = scene.shots[si - 1];
        var pa = actorIn(prevShot, a.id);
        var bw = Math.min(0.3, dur * 0.4);
        if (pa) {
          if (lt < bw) {
            var prev = rawState(prevShot, pa, prevShot.end - prevShot.start, T);
            var kb = smooth(lt / bw);
            cur.ang = mixPose(prev.ang, cur.ang, kb);
            if (Math.abs(prev.x - cur.x) < 0.12) cur.x = lerp(prev.x, cur.x, kb);
            if (kb < 0.5) cur.f = prev.f;
          }
        } else {
          cur.alpha = smooth(lt / 0.3);
        }
      }
      return cur;
    }

    function camTarget(si, lt, T) {
      var shot = scene.shots[si];
      var z = ZOOM[shot.src.camera] || 1;
      var dur = shot.end - shot.start;
      if (z === 1) return { s: 1 + 0.02 * (lt / dur), x: W / 2 };
      var actors = Array.isArray(shot.src.actors) ? shot.src.actors : [];
      var fa = actorIn(shot, shot.src.focus) || actors[0];
      var fx = fa ? rawState(shot, fa, lt, T).x * W : W / 2;
      return { s: z * (1 + 0.04 * (lt / dur)), x: fx };
    }

    function camAt(si, lt, T) {
      var cur = camTarget(si, lt, T);
      if (si > 0) {
        var shot = scene.shots[si], prevShot = scene.shots[si - 1];
        var bw = Math.min(0.45, (shot.end - shot.start) * 0.5);
        if (lt < bw) {
          var prev = camTarget(si - 1, prevShot.end - prevShot.start, T);
          var k = sineInOut(lt / bw);
          cur = { s: lerp(prev.s, cur.s, k), x: lerp(prev.x, cur.x, k) };
        }
      }
      return cur;
    }

    function fxList(shot) {
      var arr = Array.isArray(shot.src.fx) ? shot.src.fx : [];
      return arr.map(function (x) { return typeof x === 'string' ? { type: x } : (x || {}); })
        .filter(function (x) { return x.type; });
    }

    function draw(T) {
      T = clamp(T, 0, life);
      var si = 0;
      for (var i = 0; i < scene.shots.length; i++) if (T >= scene.shots[i].start) si = i;
      var shot = scene.shots[si];
      var lt = clamp(T - shot.start, 0, shot.end - shot.start);
      var dur = shot.end - shot.start;
      var fxs = fxList(shot);

      var cam = camAt(si, lt, T);
      var ox = clamp(W / 2 - cam.s * cam.x, W - cam.s * W, 0);
      // Vertical anclado al SUELO (baja un poco al acercar): sin huecos de suelo vacío
      // y con aire para el rótulo; cam.y solo decide cuánto margen queda arriba.
      var groundScreen = S.G + (H - S.G) * 0.35 * clamp(cam.s - 1, 0, 1);
      var oy = clamp(groundScreen - cam.s * S.G, H - cam.s * H, 0);
      fxs.forEach(function (fx) {
        if (fx.type !== 'shake') return;
        var at = Math.max(0, num(fx.at, 0));
        if (lt < at || lt > at + 0.55) return;
        var amp = U * 0.025 * (1 - (lt - at) / 0.55);
        ox += amp * Math.sin(lt * 70);
        oy += amp * Math.cos(lt * 53);
      });

      var envMoving = shot.src.moving != null ? !!shot.src.moving : envKey === 'bus';
      var out = '';
      if (st.bg) out += rect(0, 0, W, H, st.bg, 'none');
      out += '<g transform="translate(' + f1(ox) + ',' + f1(oy) + ') scale(' + cam.s.toFixed(4) + ')">';
      out += drawEnvironment(envKey, S, T, envMoving);

      var actors = (Array.isArray(shot.src.actors) ? shot.src.actors : []).filter(function (a) { return a && a.id; });
      var bodies = {};
      var figs = '';
      actors.forEach(function (a) {
        var ch = scene.chars[a.id] || { id: a.id };
        var s = actorState(si, a, lt, T);
        s.px = s.x * W;
        var haloSvg = st.halo ? drawFigure(ch, s, S, true).svg : '';
        var body = drawFigure(ch, s, S, false);
        var shadowK = 1 - clamp(num(s.ang.lift, 0) * 3, 0, 0.7);
        var g = '<ellipse cx="' + f1(s.pxDrawn) + '" cy="' + f1(S.G + S.sw * 0.2) + '" rx="' + f1(U * (Math.abs(s.ang.rot) > 45 ? 0.3 : 0.13) * shadowK) +
          '" ry="' + f1(U * 0.018) + '" fill="' + st.ink + '" opacity="0.08"/>';
        g += haloSvg + body.svg;
        body.f = s.f;
        body.dir = s.moving ? s.dir : 0;
        bodies[a.id] = body;
        figs += s.alpha < 1 ? '<g opacity="' + s.alpha.toFixed(3) + '">' + g + '</g>' : g;
      });
      out += figs;

      var fxOut = '', flash = 0;
      fxs.forEach(function (fx) {
        if (fx.type === 'shake') return;
        if (fx.type === 'flash') {
          var at = Math.max(0, num(fx.at, 0));
          if (lt >= at && lt <= at + 0.3) flash = Math.max(flash, 1 - (lt - at) / 0.3);
          return;
        }
        var target = bodies[fx.target] || bodies[shot.src.focus] || bodies[(actors[0] || {}).id];
        if (!target) return;
        fxOut += drawFx(fx, target, lt, dur, S, target.dir);
      });
      out += fxOut + '</g>';
      if (flash > 0) out += rect(0, 0, W, H, '#ffffff', 'none').replace('/>', ' opacity="' + (flash * 0.85).toFixed(2) + '"/>');
      svg.innerHTML = out;

      // Rótulo del plano (tarjeta HTML nítida arriba, fuera de la franja de subtítulos).
      var text = captionsOn ? String(shot.src.caption || '').trim() : '';
      if (text !== lastCap) { cap.textContent = text; lastCap = text; }
      if (!text) { cap.style.opacity = '0'; return; }
      var next = scene.shots[si + 1], prevS = scene.shots[si - 1];
      var sameNext = next && String(next.src.caption || '').trim() === text;
      var samePrev = prevS && String(prevS.src.caption || '').trim() === text;
      var kin = samePrev ? 1 : easeOut(lt / 0.3);
      var kout = sameNext ? 1 : clamp((dur - lt) / 0.2, 0, 1);
      var o = Math.min(kin, kout);
      cap.style.opacity = o.toFixed(3);
      cap.style.transform = 'translateX(-50%) translateY(' + f1((1 - kin) * 18) + 'px)';
    }

    var proxy = { t: 0 };
    tl.fromTo(proxy, { t: 0 }, {
      t: life, duration: life, ease: 'none',
      onUpdate: function () { draw(proxy.t); },
    }, 0);
    draw(0);
  }

  window.StickScene = {
    mount: mount,
    poses: Object.keys(POSES),
    styles: Object.keys(STYLES),
  };
})();
