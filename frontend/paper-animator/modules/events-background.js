import { state } from './state.js';
import { requestRedraw } from './renderer.js';
import { syncSliderAndInput, initContinuousSlider } from './ui-controls.js';
import { syncBackgroundTransformModeUI } from './layout.js';
import { updateUIFromState } from './ui-sync.js';
import { setupDropZone } from './image-handler.js';

export function initBackgroundEventListeners() {
    setupDropZone('background-drop-zone', 'background-image-upload', 'background');

    const remBgImgBtn = document.getElementById('remove-background-image');
    if (remBgImgBtn) {
        remBgImgBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            state.background.element = null;
            state.background.file = null;
            const bgUpload = document.getElementById('background-image-upload');
            if (bgUpload) bgUpload.value = '';
            updateUIFromState();
        });
    }

    const bgColorInput = document.getElementById('background-color');
    if (bgColorInput) {
        bgColorInput.addEventListener('input', (e) => {
            state.background.color = e.target.value;
            requestRedraw();
        });
    }

    const bgModeBtns = document.getElementById('background-mode-btns');
    if (bgModeBtns) {
        bgModeBtns.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (button) {
                state.background.transform.mode = button.dataset.mode;
                syncBackgroundTransformModeUI();
                requestRedraw();
            }
        });
    }

    syncSliderAndInput('background-size', 'background-size-input', (val) => state.background.transform.size = val);
    syncSliderAndInput('background-offset-x', 'background-offset-x-input', (val) => state.background.transform.offset.x = val);
    syncSliderAndInput('background-offset-y', 'background-offset-y-input', (val) => state.background.transform.offset.y = val);
    initContinuousSlider(
        document.getElementById('background-rotation'),
        document.getElementById('background-rotation-input'),
        document.getElementById('background-rotation-label'),
        () => state.background.transform.rotation,
        (val) => { state.background.transform.rotation = val; }
    );

    syncSliderAndInput('background-color-hue', 'background-color-hue-input', (val) => state.background.effects.colorCorrection.hue = val);
    syncSliderAndInput('background-color-saturation', 'background-color-saturation-input', (val) => state.background.effects.colorCorrection.saturation = val);
    syncSliderAndInput('background-color-brightness', 'background-color-brightness-input', (val) => state.background.effects.colorCorrection.brightness = val);
    const bgColorizeSwitch = document.getElementById('background-colorize-switch');
    if (bgColorizeSwitch) {
        bgColorizeSwitch.addEventListener('change', (e) => {
            state.background.effects.colorCorrection.colorize = e.target.checked;
            updateUIFromState();
        });
    }

    syncSliderAndInput('background-blur-intensity', 'background-blur-intensity-input', (val) => state.background.effects.blur.intensity = val);
    syncSliderAndInput('background-vignette-opacity', 'background-vignette-opacity-input', (val) => state.background.effects.vignette.opacity = val);
    syncSliderAndInput('background-vignette-radius', 'background-vignette-radius-input', (val) => state.background.effects.vignette.radius = val);
    syncSliderAndInput('background-vignette-feather', 'background-vignette-feather-input', (val) => state.background.effects.vignette.feather = val);
    const bgVignetteColor = document.getElementById('background-vignette-color');
    if (bgVignetteColor) {
        bgVignetteColor.addEventListener('input', (e) => {
            state.background.effects.vignette.color = e.target.value;
            requestRedraw();
        });
    }
}
