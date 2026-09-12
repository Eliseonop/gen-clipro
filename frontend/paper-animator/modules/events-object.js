import { state } from './state.js';
import {
    requestRedraw, generateTornEdgeCache, setIsAdjustingTornEdge,
    setIsLiveTornEdgePreview, setOriginalOverlaySpeed,
    originalOverlaySpeed, isAdjustingTornEdge
} from './renderer.js';
import { syncSliderAndInput, syncInputOnly, initContinuousSlider } from './ui-controls.js';
import { updateUIFromState } from './ui-sync.js';
import { setupDropZone } from './image-handler.js';
import { initEraser, disableEraser } from './eraser.js';
import { initEditMode } from './edit-mode.js';

export function initObjectEventListeners() {
    setupDropZone('drop-zone', 'image-upload', 'foreground');
    initEraser();
    initEditMode();

    const delImgBtn = document.getElementById('delete-image-btn');
    if (delImgBtn) {
        delImgBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            disableEraser();
            state.object.image.element = null;
            state.object.image.uneditedElement = null;
            state.object.image.originalElement = null;
            state.object.image.originalSVGSrc = null;
            state.object.image.cropFrac = null;
            state.object.image.file = null;
            state.object.eraser.dirty = false;
            const imgUpload = document.getElementById('image-upload');
            if (imgUpload) imgUpload.value = '';
            updateUIFromState();
            requestRedraw();
        });
    }

    const getActiveObject = () => state.object;

    syncSliderAndInput('image-size', 'image-size-input', (val) => getActiveObject().image.size = val);
    syncSliderAndInput('image-offset-x', 'image-offset-x-input', (val) => getActiveObject().image.offset.x = val);
    syncSliderAndInput('image-offset-y', 'image-offset-y-input', (val) => getActiveObject().image.offset.y = val);
    initContinuousSlider(
        document.getElementById('image-rotation'),
        document.getElementById('image-rotation-input'),
        document.getElementById('image-rotation-label'),
        () => getActiveObject().image.rotation,
        (val) => { getActiveObject().image.rotation = val; }
    );

    const setupTornEdgeSlider = (sliderId, inputId, stateUpdater, isDetail = false) => {
        const slider = document.getElementById(sliderId);
        const input = document.getElementById(inputId);
        if (!slider || !input) return;

        let cacheDebounceTimeout;
        let finalDebounceTimeout;

        const startAdjusting = () => {
            if (isAdjustingTornEdge) return;
            if (!state.object.image.element) return;
            setOriginalOverlaySpeed(getActiveObject().paperFoldOverlay.speed);
            getActiveObject().paperFoldOverlay.speed = 0;
            setIsAdjustingTornEdge(true);
            setIsLiveTornEdgePreview(true);
        };

        const stopAdjustingAndFinalize = () => {
            if (!isAdjustingTornEdge) return;
            setIsAdjustingTornEdge(false);
            setIsLiveTornEdgePreview(false);
            getActiveObject().paperFoldOverlay.speed = originalOverlaySpeed;
            requestRedraw();
        };

        slider.addEventListener('input', (e) => {
            startAdjusting();

            const numericValue = parseFloat(e.target.value) || 0;
            input.value = numericValue;
            stateUpdater(isDetail ? numericValue / 1000 : numericValue);
            requestRedraw();

            clearTimeout(cacheDebounceTimeout);
            clearTimeout(finalDebounceTimeout);
            cacheDebounceTimeout = setTimeout(generateTornEdgeCache, 500);
            finalDebounceTimeout = setTimeout(stopAdjustingAndFinalize, 1000);
        });

        input.addEventListener('change', (e) => {
            clearTimeout(cacheDebounceTimeout);
            clearTimeout(finalDebounceTimeout);

            const finalValue = parseFloat(e.target.value) || 0;
            slider.value = finalValue;
            stateUpdater(isDetail ? finalValue / 1000 : finalValue);

            startAdjusting();
            generateTornEdgeCache().then(() => {
                stopAdjustingAndFinalize();
            });
        });
    };

    setupTornEdgeSlider('stroke-width', 'stroke-width-input', (val) => getActiveObject().stroke.width = val);
    setupTornEdgeSlider('stroke-roughness', 'stroke-roughness-input', (val) => getActiveObject().stroke.roughness = val);
    setupTornEdgeSlider('stroke-detail', 'stroke-detail-input', (val) => getActiveObject().stroke.detail = val, true);

    syncSliderAndInput('shadow-blur', 'shadow-blur-input', (val) => getActiveObject().shadow.blur = val);
    syncSliderAndInput('shadow-opacity', 'shadow-opacity-input', (val) => getActiveObject().shadow.opacity = val);
    syncInputOnly('shadow-offset-x-input', (val) => getActiveObject().shadow.offsetX = val);
    syncInputOnly('shadow-offset-y-input', (val) => getActiveObject().shadow.offsetY = val);

    const shdColor = document.getElementById('shadow-color');
    if (shdColor) {
        shdColor.addEventListener('input', (e) => {
            getActiveObject().shadow.color = e.target.value;
            requestRedraw();
        });
    }

    syncSliderAndInput('color-hue', 'color-hue-input', (val) => getActiveObject().color.hue = val);
    syncSliderAndInput('color-saturation', 'color-saturation-input', (val) => getActiveObject().color.saturation = val);
    syncSliderAndInput('color-brightness', 'color-brightness-input', (val) => getActiveObject().color.brightness = val);

    const colorizeSwitch = document.getElementById('colorize-switch');
    if (colorizeSwitch) {
        colorizeSwitch.addEventListener('change', (e) => {
            getActiveObject().color.colorize = e.target.checked;
            updateUIFromState();
        });
    }

    const mvtModeBtns = document.getElementById('movement-mode-btns');
    if (mvtModeBtns) {
        mvtModeBtns.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (button) { getActiveObject().movement.mode = button.dataset.mode; updateUIFromState(); }
        });
    }
    syncSliderAndInput('movement-simpel-speed', 'movement-simpel-speed-input', (val) => getActiveObject().movement.simpelSpeed = val);
    syncSliderAndInput('movement-simpel-strength', 'movement-simpel-strength-input', (val) => getActiveObject().movement.simpelStrength = val);
    syncSliderAndInput('movement-rotation-speed', 'movement-rotation-speed-input', (val) => getActiveObject().movement.rotationSpeed = val);
    syncSliderAndInput('movement-rotation-strength', 'movement-rotation-strength-input', (val) => getActiveObject().movement.rotationStrength = val);
    syncSliderAndInput('movement-position-speed-x', 'movement-position-speed-x-input', (val) => getActiveObject().movement.positionSpeed.x = val);
    syncSliderAndInput('movement-position-speed-y', 'movement-position-speed-y-input', (val) => getActiveObject().movement.positionSpeed.y = val);
    syncSliderAndInput('movement-position-strength-x', 'movement-position-strength-x-input', (val) => getActiveObject().movement.positionStrength.x = val);
    syncSliderAndInput('movement-position-strength-y', 'movement-position-strength-y-input', (val) => getActiveObject().movement.positionStrength.y = val);

    syncSliderAndInput('overlay-opacity', 'overlay-opacity-input', (val) => { getActiveObject().paperFoldOverlay.opacity = val; });
    syncSliderAndInput('overlay-speed', 'overlay-speed-input', (val) => getActiveObject().paperFoldOverlay.speed = val);
}
