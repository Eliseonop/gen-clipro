import { overlayImageUrls, MASK_IMAGE_URLS, LAYER_IMAGE_URLS } from './constants.js';
import {
    state, setPauseStartTime, setAnimationStartTime, loadPreferences
} from './state.js';
import {
    initRendererElements, maskImages, layerImages, originalOverlayImages,
    requestRedraw, resizeAndRedrawAll
} from './renderer.js';
import { startAnimationLoop, fpsLoop } from './animation.js';
import { updateUIFromState } from './ui-sync.js';
import { animateCanvasResize } from './layout.js';
import { initBackgroundEventListeners } from './events-background.js';
import { initObjectEventListeners } from './events-object.js';
import { initAnimationEventListeners } from './events-animation.js';
import { initGlobalEventListeners } from './events-global.js';

document.addEventListener('DOMContentLoaded', function () {
    initRendererElements();
    loadPreferences();

    if (!localStorage.getItem('paperaMeUserPreferences')) {
        state.displayMode = 'auto';
        state.uiSize = window.innerWidth < 1280 ? 'compact' : 'normal';

        const screenWidth = window.innerWidth;
        if (screenWidth <= 480) {
            state.previewResolution = '360';
        } else if (screenWidth > 480 && screenWidth < 1440) {
            state.previewResolution = '540';
        } else {
            state.previewResolution = '720';
        }
    }

    setAnimationStartTime(performance.now());
    setPauseStartTime(0);

    resizeAndRedrawAll();
    startAnimationLoop();
    requestAnimationFrame(fpsLoop);

    const bgTransformAccordion = document.getElementById('background-transform-accordion');
    if (bgTransformAccordion) {
        bgTransformAccordion.classList.add('accordion-open');
        const bgBody = bgTransformAccordion.querySelector('.accordion-body');
        if (bgBody) bgBody.classList.remove('hidden');
    }

    let loadedOriginalOverlays = 0;
    const totalOverlays = overlayImageUrls.length;
    overlayImageUrls.forEach((url, index) => {
        const img = new Image();
        img.onload = () => {
            originalOverlayImages[index] = img;
            loadedOriginalOverlays++;
            if (loadedOriginalOverlays === totalOverlays) {
                updateUIFromState();
                requestRedraw();
            }
        };
        img.onerror = () => { console.error(`Failed to load overlay image: ${url}`); };
        img.src = url;
    });

    function loadImageAsset(url, targetArray, index) {
        const img = new Image();
        img.onload = () => {
            targetArray[index] = img;
        };
        img.onerror = () => console.error(`Gagal memuat aset: ${url}`);
        img.src = url;
    }

    MASK_IMAGE_URLS.forEach((url, index) => loadImageAsset(url, maskImages, index));
    LAYER_IMAGE_URLS.forEach((url, index) => loadImageAsset(url, layerImages, index));

    // Register all modular event listeners
    initBackgroundEventListeners();
    initObjectEventListeners();
    initAnimationEventListeners();
    initGlobalEventListeners();

    updateUIFromState();
});

window.addEventListener('load', () => {
    const panelWrapper = document.getElementById('settings-panel-wrapper');
    const body = document.body;
    if (!window.matchMedia('(max-width: 768px)').matches) {
        if (panelWrapper) panelWrapper.classList.add('panel-open');
        body.classList.add('desktop-panel-open');
        animateCanvasResize();
    }
});