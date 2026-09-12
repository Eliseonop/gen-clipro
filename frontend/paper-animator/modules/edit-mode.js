import { state } from './state.js';
import { requestRedraw, setIsCacheGenerationNeeded } from './renderer.js';
import { enableEraser, disableEraser, resetEraserImage, EDIT_MODE_EVENT } from './eraser.js';
import { parseClampedInt, brushErase, colorErase } from './erase-utils.js';
import { skinSlider } from './ui-controls.js';
import { translations } from './translations.js';

const BRUSH_MIN = 5;
const BRUSH_MAX = 100;
const TOL_MIN = 0;
const TOL_MAX = 255;

let editOpen = false;
let editCanvas = null;
let editWrap = null;
let overlay = null;
let modeButtons = null;
let brushSlider = null;
let brushInput = null;
let toleranceSlider = null;
let toleranceInput = null;
let toleranceControl = null;
let hintEl = null;
let cropApplyBtn = null;

const CROP_MIN_PX = 8;
const CROP_HANDLE_PX = 12;
let pendingCrop = null;
let cropDrag = null;

let view = { scale: 1, offsetX: 0, offsetY: 0 };
let cursorSX = -100;
let cursorSY = -100;
let cursorVisible = false;
let dragging = false;
let lastIX = null;
let lastIY = null;

let preEditBackup = null;
let preEditDirty = false;
let preEditCropFrac = null;
let wasPlaying = true;
let wasPreviewTime = null;
let isInitialized = false;

export function isEditModeOpen() {
    return editOpen;
}

function clearStroke() {
    lastIX = null;
    lastIY = null;
}

export function initEditMode() {
    if (isInitialized) return;
    isInitialized = true;

    overlay = document.getElementById('edit-mode-overlay');
    editCanvas = document.getElementById('edit-canvas');
    editWrap = document.getElementById('edit-canvas-wrap');
    modeButtons = document.getElementById('edit-mode-btns');
    brushSlider = document.getElementById('edit-brush-size');
    brushInput = document.getElementById('edit-brush-size-input');
    toleranceSlider = document.getElementById('edit-tolerance');
    toleranceInput = document.getElementById('edit-tolerance-input');
    toleranceControl = document.getElementById('edit-tolerance-control');
    hintEl = document.getElementById('edit-mode-hint');
    cropApplyBtn = document.getElementById('edit-crop-apply-btn');
    if (!overlay || !editCanvas) return;

    if (brushSlider) skinSlider(brushSlider);
    if (toleranceSlider) skinSlider(toleranceSlider);

    if (modeButtons) {
        modeButtons.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button || !button.dataset.mode) return;
            if (state.object.eraser.mode === 'crop' && button.dataset.mode !== 'crop') {
                commitCrop();
            }
            state.object.eraser.mode = button.dataset.mode;
            refreshEditToolbar();
            drawEditCanvas();
        });
    }

    if (brushSlider && brushInput) {
        brushSlider.addEventListener('input', (e) => {
            const next = parseClampedInt(e.target.value, BRUSH_MIN, BRUSH_MAX, state.object.eraser.brushSize);
            state.object.eraser.brushSize = next;
            brushInput.value = String(next);
            e.target.value = String(next);
            drawEditCanvas();
        });
        brushInput.addEventListener('change', (e) => {
            const next = parseClampedInt(e.target.value, BRUSH_MIN, BRUSH_MAX, state.object.eraser.brushSize);
            state.object.eraser.brushSize = next;
            brushSlider.value = String(next);
            brushInput.value = String(next);
            drawEditCanvas();
        });
    }

    if (toleranceSlider && toleranceInput) {
        toleranceSlider.addEventListener('input', (e) => {
            const next = parseClampedInt(e.target.value, TOL_MIN, TOL_MAX, state.object.eraser.colorTolerance);
            state.object.eraser.colorTolerance = next;
            toleranceInput.value = String(next);
            e.target.value = String(next);
        });
        toleranceInput.addEventListener('change', (e) => {
            const next = parseClampedInt(e.target.value, TOL_MIN, TOL_MAX, state.object.eraser.colorTolerance);
            state.object.eraser.colorTolerance = next;
            toleranceSlider.value = String(next);
            toleranceInput.value = String(next);
        });
    }

    const resetBtn = document.getElementById('edit-reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetEraserImage();
            pendingCrop = null;
            cropDrag = null;
            refreshEditToolbar();
            drawEditCanvas();
        });
    }

    const openEditorBtn = document.getElementById('open-editor-btn');
    if (openEditorBtn) {
        openEditorBtn.addEventListener('click', () => openEditMode());
    }

    const saveBtn = document.getElementById('edit-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', () => closeEditMode(true));
    const cancelBtn = document.getElementById('edit-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => closeEditMode(false));
    if (cropApplyBtn) cropApplyBtn.addEventListener('click', () => {
        if (commitCrop()) {
            refreshEditToolbar();
            drawEditCanvas();
        }
    });

    window.addEventListener(EDIT_MODE_EVENT, (e) => {
        openEditMode(e.detail && e.detail.mode);
    });

    window.addEventListener('keydown', (e) => {
        if (editOpen && e.key === 'Escape') closeEditMode(false);
    });

    window.addEventListener('resize', () => {
        if (editOpen) drawEditCanvas();
    });

    if (editWrap && typeof ResizeObserver !== 'undefined') {
        const wrapObserver = new ResizeObserver(() => {
            if (editOpen) drawEditCanvas();
        });
        wrapObserver.observe(editWrap);
    }

    bindEditCanvasEvents();
}

export function openEditMode(mode) {
    if (editOpen) return;
    const imgElement = state.object.image.element;
    if (!imgElement || !imgElement.width || !imgElement.height) return;

    if (mode === 'brush' || mode === 'color' || mode === 'crop') {
        state.object.eraser.mode = mode;
    }

    preEditBackup = document.createElement('canvas');
    preEditBackup.width = imgElement.width;
    preEditBackup.height = imgElement.height;
    preEditBackup.getContext('2d').drawImage(imgElement, 0, 0);
    preEditDirty = state.object.eraser.dirty;
    preEditCropFrac = state.object.image.cropFrac ? { ...state.object.image.cropFrac } : null;

    wasPlaying = state.object.animation.isPlaying;
    wasPreviewTime = state.object.animation.previewTime;
    state.object.animation.isPlaying = false;

    enableEraser();

    editOpen = true;
    clearStroke();
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    document.body.classList.add('edit-mode-open');
    refreshEditToolbar();
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (editOpen) drawEditCanvas();
    }));
}

export function closeEditMode(save) {
    if (!editOpen) return;
    if (save) {
        commitCrop();
    } else if (preEditBackup) {
        state.object.image.element = preEditBackup;
        state.object.eraser.dirty = preEditDirty;
        state.object.image.cropFrac = preEditCropFrac;
    }
    preEditBackup = null;
    preEditCropFrac = null;
    pendingCrop = null;
    cropDrag = null;

    state.object.animation.isPlaying = wasPlaying;
    state.object.animation.previewTime = wasPreviewTime;

    editOpen = false;
    dragging = false;
    cursorVisible = false;
    clearStroke();
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
    document.body.classList.remove('edit-mode-open');
    disableEraser();
    if (state.object.stroke.enabled) {
        setIsCacheGenerationNeeded(true);
    }
    requestRedraw();
}

function refreshEditToolbar() {
    const currentMode = state.object.eraser.mode;
    if (modeButtons) {
        modeButtons.querySelectorAll('button').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.mode === currentMode);
        });
    }
    if (brushSlider) brushSlider.value = String(state.object.eraser.brushSize);
    if (brushInput) brushInput.value = String(state.object.eraser.brushSize);
    if (toleranceSlider) toleranceSlider.value = String(state.object.eraser.colorTolerance);
    if (toleranceInput) toleranceInput.value = String(state.object.eraser.colorTolerance);
    const brushControl = document.getElementById('edit-brush-control');
    if (brushControl) brushControl.classList.toggle('hidden', currentMode === 'crop');
    if (toleranceControl) {
        toleranceControl.classList.toggle('hidden', currentMode !== 'color');
    }
    syncCropApplyBtn();
    if (hintEl) {
        const key = currentMode === 'color' ? 'editHintColor' : currentMode === 'crop' ? 'editHintCrop' : 'editHintBrush';
        hintEl.dataset.translateKey = key;
        const map = translations[state.language] || translations.en;
        if (map[key]) hintEl.textContent = map[key];
    }
    if (editCanvas) {
        editCanvas.style.cursor = currentMode === 'brush' ? 'none' : 'crosshair';
    }
}

function syncCropApplyBtn() {
    if (!cropApplyBtn) return;
    const inCrop = state.object.eraser.mode === 'crop';
    cropApplyBtn.classList.toggle('hidden', !inCrop);
    cropApplyBtn.disabled = !pendingCrop || pendingCrop.w < CROP_MIN_PX || pendingCrop.h < CROP_MIN_PX;
}

function fitEditCanvas() {
    const imgElement = state.object.image.element;
    if (!editCanvas || !editWrap || !imgElement) return false;
    const cssW = Math.max(50, Math.floor(editWrap.clientWidth || 0));
    if (cssW <= 50) return false;
    const cssH = Math.max(240, Math.floor(window.innerHeight * 0.56));
    if (editCanvas.width !== cssW || editCanvas.height !== cssH) {
        editCanvas.width = cssW;
        editCanvas.height = cssH;
        editCanvas.style.width = `${cssW}px`;
        editCanvas.style.height = `${cssH}px`;
    }
    const cr = getContentRect();
    const scale = Math.min(cssW / cr.w, cssH / cr.h);
    view = {
        scale,
        offsetX: (cssW - cr.w * scale) / 2,
        offsetY: (cssH - cr.h * scale) / 2
    };
    return true;
}

// Live pixels always stay padded (25% transparent margin each side), so the
// edit canvas shows and operates on the unpadded content rect only.
function getContentRect() {
    const el = state.object.image.element;
    const mx = Math.round(el.width / 6);
    const my = Math.round(el.height / 6);
    return { x: mx, y: my, w: el.width - mx * 2, h: el.height - my * 2 };
}

function inContentRect(coords) {
    const cr = getContentRect();
    return coords.x >= cr.x && coords.x <= cr.x + cr.w && coords.y >= cr.y && coords.y <= cr.y + cr.h;
}

function drawEditCanvas() {
    if (!editOpen) return;
    const imgElement = state.object.image.element;
    if (!imgElement) return;
    if (!fitEditCanvas()) return;
    const ctx = editCanvas.getContext('2d');
    ctx.clearRect(0, 0, editCanvas.width, editCanvas.height);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const cr = getContentRect();
    ctx.drawImage(
        imgElement,
        cr.x, cr.y, cr.w, cr.h,
        view.offsetX, view.offsetY,
        cr.w * view.scale, cr.h * view.scale
    );
    ctx.restore();

    if (cursorVisible && cursorSX >= 0 && cursorSY >= 0 && state.object.eraser.mode !== 'crop') {
        const isBrush = state.object.eraser.mode === 'brush';
        ctx.save();
        ctx.beginPath();
        ctx.arc(cursorSX, cursorSY, isBrush ? state.object.eraser.brushSize : 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2;
        if (isBrush) ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cursorSX, cursorSY, isBrush ? state.object.eraser.brushSize : 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
    }

    if (state.object.eraser.mode === 'crop' && pendingCrop) {
        const r = cropToScreen(pendingCrop);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, editCanvas.width, editCanvas.height);
        ctx.rect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fill('evenodd');
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(r.x + (r.w * i) / 3, r.y);
            ctx.lineTo(r.x + (r.w * i) / 3, r.y + r.h);
            ctx.moveTo(r.x, r.y + (r.h * i) / 3);
            ctx.lineTo(r.x + r.w, r.y + (r.h * i) / 3);
            ctx.stroke();
        }
        const hs = 7;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        const corners = [
            [r.x, r.y], [r.x + r.w, r.y],
            [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]
        ];
        for (const [px, py] of corners) {
            ctx.beginPath();
            ctx.rect(px - hs / 2, py - hs / 2, hs, hs);
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }
}

function eventToCanvasPx(e) {
    const rect = editCanvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

function screenToImage(sx, sy) {
    const imgElement = state.object.image.element;
    if (!imgElement || view.scale <= 0) return null;
    const cr = getContentRect();
    return {
        x: cr.x + (sx - view.offsetX) / view.scale,
        y: cr.y + (sy - view.offsetY) / view.scale
    };
}

function normalizeCrop(x, y, w, h) {
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    return { x, y, w, h };
}

function clampToContent(rect) {
    const cr = getContentRect();
    const cx = Math.max(cr.x, Math.min(cr.x + cr.w, rect.x));
    const cy = Math.max(cr.y, Math.min(cr.y + cr.h, rect.y));
    const ex = Math.max(cr.x, Math.min(cr.x + cr.w, rect.x + rect.w));
    const ey = Math.max(cr.y, Math.min(cr.y + cr.h, rect.y + rect.h));
    return { x: cx, y: cy, w: Math.max(0, ex - cx), h: Math.max(0, ey - cy) };
}

function clampCropRect(rect) {
    const clamped = clampToContent(normalizeCrop(rect.x, rect.y, rect.w, rect.h));
    if (!clamped || clamped.w < CROP_MIN_PX || clamped.h < CROP_MIN_PX) return null;
    return clamped;
}

// Clip an image-space segment to the content rect (Liang-Barsky).
// Returns the visible [q0, q1] portion, or null when fully outside.
function clipSegmentToContent(p0, p1) {
    const cr = getContentRect();
    let t0 = 0;
    let t1 = 1;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const edges = [
        [-dx, p0.x - cr.x],
        [dx, cr.x + cr.w - p0.x],
        [-dy, p0.y - cr.y],
        [dy, cr.y + cr.h - p0.y]
    ];
    for (const [p, q] of edges) {
        if (p === 0) {
            if (q < 0) return null;
        } else {
            const t = q / p;
            if (p < 0) {
                if (t > t1) return null;
                if (t > t0) t0 = t;
            } else {
                if (t < t0) return null;
                if (t < t1) t1 = t;
            }
        }
    }
    if (t0 > t1) return null;
    return [
        { x: p0.x + dx * t0, y: p0.y + dy * t0 },
        { x: p0.x + dx * t1, y: p0.y + dy * t1 }
    ];
}

function cropToScreen(rect) {
    const cr = getContentRect();
    return {
        x: view.offsetX + (rect.x - cr.x) * view.scale,
        y: view.offsetY + (rect.y - cr.y) * view.scale,
        w: rect.w * view.scale,
        h: rect.h * view.scale
    };
}

function hitCropHandle(sx, sy) {
    if (!pendingCrop) return null;
    const r = cropToScreen(pendingCrop);
    const pts = {
        nw: [r.x, r.y], ne: [r.x + r.w, r.y],
        sw: [r.x, r.y + r.h], se: [r.x + r.w, r.y + r.h],
        n: [r.x + r.w / 2, r.y], s: [r.x + r.w / 2, r.y + r.h],
        w: [r.x, r.y + r.h / 2], e: [r.x + r.w, r.y + r.h / 2]
    };
    for (const key of ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e']) {
        const [px, py] = pts[key];
        if (Math.abs(sx - px) <= CROP_HANDLE_PX && Math.abs(sy - py) <= CROP_HANDLE_PX) return key;
    }
    if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return 'move';
    return null;
}

const CROP_CURSOR = {
    nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
    n: 'ns-resize', s: 'ns-resize', w: 'ew-resize', e: 'ew-resize', move: 'move'
};

function commitCrop() {
    const imgElement = state.object.image.element;
    if (!imgElement || !pendingCrop) return false;
    const r = clampCropRect(pendingCrop);
    pendingCrop = null;
    cropDrag = null;
    if (!r) {
        syncCropApplyBtn();
        return false;
    }
    const sx = Math.round(r.x);
    const sy = Math.round(r.y);
    const sw = Math.round(r.w);
    const sh = Math.round(r.h);
    if (sw < CROP_MIN_PX || sh < CROP_MIN_PX) {
        syncCropApplyBtn();
        return false;
    }
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sw;
    tempCanvas.height = sh;
    tempCanvas.getContext('2d').drawImage(imgElement, sx, sy, sw, sh, 0, 0, sw, sh);

    const base = state.object.image.cropFrac || { fx: 0, fy: 0, fw: 1, fh: 1 };
    state.object.image.cropFrac = {
        fx: base.fx + (sx / imgElement.width) * base.fw,
        fy: base.fy + (sy / imgElement.height) * base.fh,
        fw: (sw / imgElement.width) * base.fw,
        fh: (sh / imgElement.height) * base.fh
    };

    const padX = Math.round(sw * 0.25);
    const padY = Math.round(sh * 0.25);
    const paddedCanvas = document.createElement('canvas');
    paddedCanvas.width = sw + padX * 2;
    paddedCanvas.height = sh + padY * 2;
    paddedCanvas.getContext('2d').drawImage(tempCanvas, padX, padY);

    state.object.image.element = paddedCanvas;
    state.object.eraser.dirty = true;
    syncCropApplyBtn();
    return true;
}

function applyEditBrushStroke(coords, prev) {
    const imgElement = state.object.image.element;
    if (!imgElement) return;
    if (!coords || !Number.isFinite(coords.x) || !Number.isFinite(coords.y)) return;
    if (view.scale <= 0) return;

    const radius = state.object.eraser.brushSize / view.scale;
    const out = brushErase(
        imgElement,
        coords.x, coords.y,
        prev ? prev.x : null, prev ? prev.y : null,
        radius
    );
    if (!out) return;

    state.object.image.element = out;
    state.object.eraser.dirty = true;
}

function pickEditColorAndErase(coords) {
    const imgElement = state.object.image.element;
    if (!imgElement) return;
    if (!coords || !Number.isFinite(coords.x) || !Number.isFinite(coords.y)) return;

    const out = colorErase(imgElement, coords.x, coords.y, state.object.eraser.colorTolerance);
    if (!out) return;

    state.object.image.element = out;
    state.object.eraser.dirty = true;
}

function bindEditCanvasEvents() {
    if (!editCanvas) return;

    editCanvas.addEventListener('pointerdown', (e) => {
        if (!editOpen) return;
        e.preventDefault();
        try { editCanvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
        const pos = eventToCanvasPx(e);
        cursorSX = pos.x;
        cursorSY = pos.y;
        cursorVisible = true;
        const coords = screenToImage(pos.x, pos.y);
        if (!coords) return;
        const mode = state.object.eraser.mode;
        if (mode === 'crop') {
            const cr = getContentRect();
            const ax = Math.max(cr.x, Math.min(cr.x + cr.w, coords.x));
            const ay = Math.max(cr.y, Math.min(cr.y + cr.h, coords.y));
            const hit = hitCropHandle(pos.x, pos.y);
            if (hit === 'move') {
                cropDrag = { type: 'move', startIX: coords.x, startIY: coords.y, startRect: { ...pendingCrop } };
            } else if (hit) {
                cropDrag = { type: 'resize', handle: hit, startIX: coords.x, startIY: coords.y, startRect: { ...pendingCrop } };
            } else {
                cropDrag = { type: 'new', anchorIX: ax, anchorIY: ay };
                pendingCrop = null;
            }
            drawEditCanvas();
            return;
        }
        if (mode === 'brush') {
            // Track the stroke even when it starts outside the image so a
            // slide-in from the checkerboard area starts erasing on entry.
            dragging = true;
            lastIX = coords.x;
            lastIY = coords.y;
            if (inContentRect(coords)) applyEditBrushStroke(coords, null);
        } else {
            if (!inContentRect(coords)) {
                drawEditCanvas();
                return;
            }
            pickEditColorAndErase(coords);
            dragging = false;
        }
        drawEditCanvas();
    });

    editCanvas.addEventListener('pointermove', (e) => {
        if (!editOpen) return;
        const pos = eventToCanvasPx(e);
        cursorSX = pos.x;
        cursorSY = pos.y;
        cursorVisible = true;
        const mode = state.object.eraser.mode;
        if (mode === 'crop') {
            if (cropDrag) {
                const coords = screenToImage(pos.x, pos.y);
                if (coords && updateCropDrag(coords)) syncCropApplyBtn();
            } else {
                const hit = hitCropHandle(pos.x, pos.y);
                editCanvas.style.cursor = hit ? (CROP_CURSOR[hit] || 'move') : 'crosshair';
            }
            drawEditCanvas();
            return;
        }
        if (dragging && mode === 'brush') {
            const coords = screenToImage(pos.x, pos.y);
            if (coords) {
                if (lastIX !== null && lastIY !== null) {
                    const clipped = clipSegmentToContent(
                        { x: lastIX, y: lastIY }, coords
                    );
                    if (clipped) applyEditBrushStroke(clipped[1], clipped[0]);
                } else if (inContentRect(coords)) {
                    applyEditBrushStroke(coords, null);
                }
                lastIX = coords.x;
                lastIY = coords.y;
            }
        }
        drawEditCanvas();
    });

    const endStroke = () => {
        dragging = false;
        clearStroke();
        if (cropDrag) {
            cropDrag = null;
            syncCropApplyBtn();
        }
    };
    editCanvas.addEventListener('pointerup', endStroke);
    editCanvas.addEventListener('pointercancel', endStroke);
    editCanvas.addEventListener('pointerleave', () => {
        cursorVisible = false;
        if (dragging) {
            dragging = false;
            clearStroke();
        }
        cropDrag = null;
        if (editOpen) drawEditCanvas();
    });
    editCanvas.addEventListener('dblclick', (e) => {
        if (!editOpen || state.object.eraser.mode !== 'crop' || !pendingCrop) return;
        e.preventDefault();
        if (commitCrop()) {
            refreshEditToolbar();
            drawEditCanvas();
        }
    });
}

function updateCropDrag(coords) {
    if (!cropDrag) return false;
    const imgElement = state.object.image.element;
    if (!imgElement) return false;
    if (cropDrag.type === 'new') {
        pendingCrop = clampToContent(normalizeCrop(
            cropDrag.anchorIX, cropDrag.anchorIY,
            coords.x - cropDrag.anchorIX, coords.y - cropDrag.anchorIY
        ));
        return true;
    }
    const s = cropDrag.startRect;
    const dx = coords.x - cropDrag.startIX;
    const dy = coords.y - cropDrag.startIY;
    if (cropDrag.type === 'move') {
        const cr = getContentRect();
        const nx = Math.max(cr.x, Math.min(cr.x + cr.w - s.w, s.x + dx));
        const ny = Math.max(cr.y, Math.min(cr.y + cr.h - s.h, s.y + dy));
        pendingCrop = { x: nx, y: ny, w: s.w, h: s.h };
        return true;
    }
    let { x, y, w, h } = s;
    const handle = cropDrag.handle;
    if (handle.includes('e')) w = s.w + dx;
    if (handle.includes('s')) h = s.h + dy;
    if (handle.includes('w')) { x = s.x + dx; w = s.w - dx; }
    if (handle.includes('n')) { y = s.y + dy; h = s.h - dy; }
    pendingCrop = clampToContent(normalizeCrop(x, y, w, h));
    return true;
}
