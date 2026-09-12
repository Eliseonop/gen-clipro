import { state } from './state.js';
import { requestRedraw, setIsCacheGenerationNeeded } from './renderer.js';
import { parseClampedInt } from './erase-utils.js';

export let isEraserActive = false;

const BRUSH_MIN = 5;
const BRUSH_MAX = 100;
const TOL_MIN = 0;
const TOL_MAX = 255;

let eraserModeButtons = null;
let eraserControls = null;
let eraserBrushSizeSlider = null;
let eraserBrushSizeInput = null;
let eraserToleranceSlider = null;
let eraserToleranceInput = null;
let eraserResetBtn = null;

let isInitialized = false;

export const EDIT_MODE_EVENT = 'paperima:open-edit-mode';

function openEditor(mode) {
    window.dispatchEvent(new CustomEvent(EDIT_MODE_EVENT, { detail: { mode } }));
}

export function initEraser() {
    if (isInitialized) return;
    isInitialized = true;

    eraserModeButtons = document.getElementById('eraser-mode-btns');
    eraserControls = document.getElementById('eraser-controls');
    eraserBrushSizeSlider = document.getElementById('eraser-brush-size');
    eraserBrushSizeInput = document.getElementById('eraser-brush-size-input');
    eraserToleranceSlider = document.getElementById('eraser-tolerance');
    eraserToleranceInput = document.getElementById('eraser-tolerance-input');
    eraserResetBtn = document.getElementById('eraser-reset-btn');

    if (eraserModeButtons) {
        eraserModeButtons.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;
            const mode = button.dataset.mode;
            if (mode && (mode === 'brush' || mode === 'color' || mode === 'crop')) {
                state.object.eraser.mode = mode;
                updateEraserUI();
                requestRedraw();
            }
        });
    }

    if (eraserBrushSizeSlider && eraserBrushSizeInput) {
        eraserBrushSizeSlider.addEventListener('input', (e) => {
            const next = parseClampedInt(e.target.value, BRUSH_MIN, BRUSH_MAX, state.object.eraser.brushSize);
            state.object.eraser.brushSize = next;
            eraserBrushSizeInput.value = String(next);
            e.target.value = String(next);
            requestRedraw();
        });
        eraserBrushSizeInput.addEventListener('change', (e) => {
            const next = parseClampedInt(e.target.value, BRUSH_MIN, BRUSH_MAX, state.object.eraser.brushSize);
            state.object.eraser.brushSize = next;
            eraserBrushSizeSlider.value = String(next);
            eraserBrushSizeInput.value = String(next);
            requestRedraw();
        });
    }

    if (eraserToleranceSlider && eraserToleranceInput) {
        eraserToleranceSlider.addEventListener('input', (e) => {
            const next = parseClampedInt(e.target.value, TOL_MIN, TOL_MAX, state.object.eraser.colorTolerance);
            state.object.eraser.colorTolerance = next;
            eraserToleranceInput.value = String(next);
            e.target.value = String(next);
        });
        eraserToleranceInput.addEventListener('change', (e) => {
            const next = parseClampedInt(e.target.value, TOL_MIN, TOL_MAX, state.object.eraser.colorTolerance);
            state.object.eraser.colorTolerance = next;
            eraserToleranceSlider.value = String(next);
            eraserToleranceInput.value = String(next);
        });
    }

    if (eraserResetBtn) {
        eraserResetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetEraserImage();
        });
    }

    const eraserToggleBtn = document.getElementById('eraser-mode-btn');
    if (eraserToggleBtn) {
        eraserToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            openEditor('brush');
        });
    }
}

function regenerateTornEdgeCache() {
    if (state.object.stroke.enabled) {
        setIsCacheGenerationNeeded(true);
    }
}

export function enableEraser() {
    if (!state.object.image.element) return;
    isEraserActive = true;
    state.object.eraser.enabled = true;
    syncEraserUI();
    requestRedraw();
}

export function disableEraser() {
    isEraserActive = false;
    state.object.eraser.enabled = false;
    syncEraserUI();
    requestRedraw();
}

export function resetEraserImage() {
    const objectState = state.object;
    const pristine = objectState.image.uneditedElement || objectState.image.originalElement;
    if (!pristine || !pristine.width || !pristine.height) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = pristine.width;
    tempCanvas.height = pristine.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(pristine, 0, 0);

    objectState.image.element = tempCanvas;
    objectState.image.cropFrac = null;
    objectState.eraser.dirty = false;
    requestRedraw();
    regenerateTornEdgeCache();
}

export function syncEraserUI() {
    const hasImage = !!state.object.image.element;
    const eraserToggleBtn = document.getElementById('eraser-mode-btn');

    if (eraserToggleBtn) {
        eraserToggleBtn.classList.toggle('hidden', !hasImage);
    }

    if (!eraserControls) eraserControls = document.getElementById('eraser-controls');
    if (eraserControls) {
        eraserControls.classList.toggle('hidden', !hasImage);
    }

    updateEraserUI();
}

function updateEraserUI() {
    const hasImage = !!state.object.image.element;
    if (!eraserModeButtons) eraserModeButtons = document.getElementById('eraser-mode-btns');
    if (eraserModeButtons) {
        const currentMode = state.object.eraser.mode;
        eraserModeButtons.querySelectorAll('button').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.mode === currentMode);
        });
    }

    if (!eraserBrushSizeSlider) eraserBrushSizeSlider = document.getElementById('eraser-brush-size');
    if (!eraserBrushSizeInput) eraserBrushSizeInput = document.getElementById('eraser-brush-size-input');
    if (!eraserToleranceSlider) eraserToleranceSlider = document.getElementById('eraser-tolerance');
    if (!eraserToleranceInput) eraserToleranceInput = document.getElementById('eraser-tolerance-input');
    if (!eraserControls) eraserControls = document.getElementById('eraser-controls');

    if (eraserBrushSizeSlider) {
        eraserBrushSizeSlider.value = String(state.object.eraser.brushSize);
    }
    if (eraserBrushSizeInput) {
        eraserBrushSizeInput.value = String(state.object.eraser.brushSize);
    }
    if (eraserToleranceSlider) {
        eraserToleranceSlider.value = String(state.object.eraser.colorTolerance);
    }
    if (eraserToleranceInput) {
        eraserToleranceInput.value = String(state.object.eraser.colorTolerance);
    }

    const showTolerance = hasImage && state.object.eraser.mode === 'color';
    const toleranceControl = document.getElementById('eraser-tolerance-control');
    if (toleranceControl) toleranceControl.classList.toggle('hidden', !showTolerance);

    const brushControl = document.getElementById('eraser-brush-size-control');
    if (brushControl) brushControl.classList.toggle('hidden', hasImage && state.object.eraser.mode === 'crop');

    if (eraserControls) {
        eraserControls.classList.toggle('hidden', !hasImage);
    }
}
