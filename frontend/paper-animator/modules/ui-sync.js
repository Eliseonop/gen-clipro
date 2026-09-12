import { translations, updateUIText } from './translations.js';
import { truncateFilename } from './utils.js';
import { state } from './state.js';
import { originalOverlayImages, requestRedraw } from './renderer.js';
import { renderKeyframeList } from './keyframes.js';
import { syncBackgroundTransformModeUI, syncDisplayModeUI, syncUISizeUI, showTab } from './layout.js';
import { updateExportFormatUI } from './exportBridge.js';
import { syncEraserUI } from './eraser.js';

export function updatePlayPauseButton() {
    const isPlaying = state.object.animation.isPlaying;
    const playIcon = document.getElementById('play-icon');
    const pauseIcon = document.getElementById('pause-icon');
    if (playIcon) playIcon.classList.toggle('hidden', isPlaying);
    if (pauseIcon) pauseIcon.classList.toggle('hidden', !isPlaying);
}

export function updateUIFromState() {
    updateUIText(state.language);

    const activeObjectState = state.object;
    const animMode = activeObjectState.animation.mode;
    const animSimpleCtrl = document.getElementById('animation-simple-controls');
    const animAdvCtrl = document.getElementById('animation-advanced-controls');

    if (animSimpleCtrl) animSimpleCtrl.classList.toggle('hidden', animMode !== 'simple');
    if (animAdvCtrl) animAdvCtrl.classList.toggle('hidden', animMode !== 'advanced');

    document.querySelectorAll('#animation-mode-btns button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === animMode);
    });

    const openSwitch = document.getElementById('simple-anim-open-switch');
    const closeSwitch = document.getElementById('simple-anim-close-switch');
    if (openSwitch) openSwitch.checked = activeObjectState.animation.simple.open;
    if (closeSwitch) closeSwitch.checked = activeObjectState.animation.simple.close;

    const transformAccordion = document.getElementById('foreground-transform-accordion');
    if (transformAccordion) {
        if (animMode === 'advanced') {
            transformAccordion.classList.add('is-disabled');
            if (transformAccordion.classList.contains('accordion-open')) {
                transformAccordion.classList.remove('accordion-open');
                const bodyEl = transformAccordion.querySelector('.accordion-body');
                if (bodyEl) bodyEl.classList.add('hidden');
            }
        } else {
            transformAccordion.classList.remove('is-disabled');
        }
    }

    const imageSpecificControls = document.getElementById('image-specific-controls');
    const dropZonePrompt = document.getElementById('drop-zone-prompt');
    const dropZoneFilenameContainer = document.getElementById('drop-zone-filename');
    const deleteImageBtn = document.getElementById('delete-image-btn');

    if (activeObjectState.image.element) {
        if (imageSpecificControls) imageSpecificControls.classList.remove('is-disabled');
        if (dropZonePrompt) dropZonePrompt.classList.add('hidden');
        if (dropZoneFilenameContainer) {
            dropZoneFilenameContainer.classList.remove('hidden');
            if (dropZoneFilenameContainer.querySelector('p') && activeObjectState.image.file) {
                dropZoneFilenameContainer.querySelector('p').textContent = truncateFilename(activeObjectState.image.file.name);
            }
        }
        if (deleteImageBtn) deleteImageBtn.classList.remove('hidden');
    } else {
        if (imageSpecificControls) imageSpecificControls.classList.add('is-disabled');
        if (dropZonePrompt) dropZonePrompt.classList.remove('hidden');
        if (dropZoneFilenameContainer) dropZoneFilenameContainer.classList.add('hidden');
        if (deleteImageBtn) deleteImageBtn.classList.add('hidden');
    }

    syncEraserUI();

    const backgroundDropZonePrompt = document.getElementById('background-drop-zone-prompt');
    const backgroundDropZoneFilename = document.getElementById('background-drop-zone-filename');
    const removeBackgroundImageBtn = document.getElementById('remove-background-image');
    const bgDependentAccordions = ['background-transform-accordion', 'background-blur-accordion'];

    const hasBgImage = !!state.background.element;

    if (backgroundDropZonePrompt) backgroundDropZonePrompt.classList.toggle('hidden', hasBgImage);
    if (backgroundDropZoneFilename) {
        backgroundDropZoneFilename.classList.toggle('hidden', !hasBgImage);
        if (hasBgImage && backgroundDropZoneFilename.querySelector('p') && state.background.file) {
            backgroundDropZoneFilename.querySelector('p').textContent = truncateFilename(state.background.file.name);
        }
    }
    if (removeBackgroundImageBtn) removeBackgroundImageBtn.classList.toggle('hidden', !hasBgImage);

    bgDependentAccordions.forEach(id => {
        const acc = document.getElementById(id);
        if (acc) acc.classList.toggle('controls-disabled-for-bg', !hasBgImage);
    });

    const paperFoldOverlayControls = document.getElementById('overlay-controls');
    const anyOverlayImageLoaded = originalOverlayImages.length > 0 && originalOverlayImages.some(img => img !== null);
    if (paperFoldOverlayControls) {
        if (activeObjectState.paperFoldOverlay.enabled && anyOverlayImageLoaded) {
            paperFoldOverlayControls.classList.remove('controls-disabled-for-overlay');
        } else {
            paperFoldOverlayControls.classList.add('controls-disabled-for-overlay');
        }
    }

    const bgColor = document.getElementById('background-color');
    if (bgColor) bgColor.value = state.background.color;
    document.querySelectorAll('#aspect-ratio-btns button').forEach(btn => btn.classList.toggle('active', btn.dataset.ratio === state.aspectRatio));
    document.querySelectorAll('#canvas-resolution-btns button').forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.res) === state.canvasDisplayResolution));

    const inputsToUpdate = [
        { id: 'background-size-input', value: state.background.transform.size },
        { id: 'background-offset-x-input', value: state.background.transform.offset.x },
        { id: 'background-offset-y-input', value: state.background.transform.offset.y },
        { id: 'background-color-hue-input', value: state.background.effects.colorCorrection.hue },
        { id: 'background-color-saturation-input', value: state.background.effects.colorCorrection.saturation },
        { id: 'background-color-brightness-input', value: state.background.effects.colorCorrection.brightness },
        { id: 'background-colorize-switch', checked: state.background.effects.colorCorrection.colorize },
        { id: 'background-blur-intensity-input', value: state.background.effects.blur.intensity },
        { id: 'background-vignette-opacity-input', value: state.background.effects.vignette.opacity },
        { id: 'background-vignette-radius-input', value: state.background.effects.vignette.radius },
        { id: 'background-vignette-feather-input', value: state.background.effects.vignette.feather },
        { id: 'background-vignette-color', value: state.background.effects.vignette.color },
        { id: 'image-size-input', value: activeObjectState.image.size },
        { id: 'image-offset-x-input', value: activeObjectState.image.offset.x },
        { id: 'image-offset-y-input', value: activeObjectState.image.offset.y },
        { id: 'stroke-width-input', value: activeObjectState.stroke.width },
        { id: 'stroke-roughness-input', value: activeObjectState.stroke.roughness },
        { id: 'stroke-detail-input', value: activeObjectState.stroke.detail * 1000 },
        { id: 'shadow-offset-x-input', value: activeObjectState.shadow.offsetX },
        { id: 'shadow-offset-y-input', value: activeObjectState.shadow.offsetY },
        { id: 'shadow-blur-input', value: activeObjectState.shadow.blur },
        { id: 'shadow-opacity-input', value: activeObjectState.shadow.opacity },
        { id: 'shadow-color', value: activeObjectState.shadow.color },
        { id: 'color-hue-input', value: activeObjectState.color.hue },
        { id: 'color-saturation-input', value: activeObjectState.color.saturation },
        { id: 'color-brightness-input', value: activeObjectState.color.brightness },
        { id: 'colorize-switch', checked: activeObjectState.color.colorize },
        { id: 'movement-simpel-speed-input', value: activeObjectState.movement.simpelSpeed },
        { id: 'movement-simpel-strength-input', value: activeObjectState.movement.simpelStrength },
        { id: 'movement-rotation-speed-input', value: activeObjectState.movement.rotationSpeed },
        { id: 'movement-rotation-strength-input', value: activeObjectState.movement.rotationStrength },
        { id: 'movement-position-speed-x-input', value: activeObjectState.movement.positionSpeed.x },
        { id: 'movement-position-speed-y-input', value: activeObjectState.movement.positionSpeed.y },
        { id: 'movement-position-strength-x-input', value: activeObjectState.movement.positionStrength.x },
        { id: 'movement-position-strength-y-input', value: activeObjectState.movement.positionStrength.y },
        { id: 'overlay-opacity-input', value: activeObjectState.paperFoldOverlay.opacity },
        { id: 'overlay-speed-input', value: activeObjectState.paperFoldOverlay.speed },
        { id: 'export-duration-input', value: state.export.duration },
        { id: 'export-filename-input', value: state.export.filename }
    ];

    inputsToUpdate.forEach(item => {
        const el = document.getElementById(item.id);
        const sliderEl = document.getElementById(item.id.replace('-input', ''));
        if (el) {
            if (el.type === 'checkbox') {
                el.checked = item.checked;
            } else if (item.value !== undefined) {
                el.value = item.value;
            }
        }
        if (sliderEl && sliderEl.type === 'range' && item.value !== undefined) {
            sliderEl.value = item.value;
        }
    });

    const fpsSelect = document.getElementById('export-fps-select');
    if (fpsSelect) {
        fpsSelect.value = state.export.fps;
    }

    document.querySelectorAll('.accordion-section').forEach(section => {
        const switchInput = section.querySelector('.accordion-header .switch input');
        if (!switchInput) return;
        let isEnabled;
        const sectionId = section.id;
        if (sectionId.includes('foreground-stroke')) isEnabled = activeObjectState.stroke.enabled;
        else if (sectionId.includes('foreground-shadow')) isEnabled = activeObjectState.shadow.enabled;
        else if (sectionId.includes('foreground-color')) isEnabled = activeObjectState.color.enabled;
        else if (sectionId.includes('movement')) isEnabled = activeObjectState.movement.enabled;
        else if (sectionId.includes('background-color-correction')) isEnabled = state.background.effects.colorCorrection.enabled;
        else if (sectionId.includes('background-blur')) isEnabled = state.background.effects.blur.enabled;
        else if (sectionId.includes('background-vignette')) isEnabled = state.background.effects.vignette.enabled;
        else if (sectionId.includes('paper-fold-overlay')) isEnabled = activeObjectState.paperFoldOverlay.enabled;
        if (typeof isEnabled !== 'undefined') switchInput.checked = isEnabled;
    });

    const isSimpelMode = activeObjectState.movement.mode === 'simpel';
    const ctrlSimpel = document.getElementById('movement-controls-simpel');
    const ctrlLengkap = document.getElementById('movement-controls-lengkap');
    if (ctrlSimpel) ctrlSimpel.classList.toggle('hidden', !isSimpelMode);
    if (ctrlLengkap) ctrlLengkap.classList.toggle('hidden', isSimpelMode);
    document.querySelectorAll('#movement-mode-btns button').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === activeObjectState.movement.mode));

    const ccStdCtrl = document.getElementById('color-correction-standard-controls');
    const bgCcStdCtrl = document.getElementById('background-color-correction-standard-controls');
    if (ccStdCtrl) ccStdCtrl.classList.remove('hidden');
    if (bgCcStdCtrl) bgCcStdCtrl.classList.remove('hidden');

    syncBackgroundTransformModeUI();
    syncDisplayModeUI();
    syncUISizeUI();

    document.querySelectorAll('#language-btns button').forEach(button => {
        button.classList.toggle('active', button.dataset.lang === state.language);
    });

    document.querySelectorAll('.accordion-section').forEach(section => {
        const bodyEl = section.querySelector('.accordion-body');
        const isEnabledBySwitch = section.querySelector('.switch input')?.checked ?? true;
        const isOpen = isEnabledBySwitch || section.classList.contains('accordion-open');
        section.classList.toggle('accordion-open', isOpen);
        if (bodyEl) {
            bodyEl.classList.toggle('hidden', !isOpen);
        }
    });

    document.querySelectorAll('#preview-resolution-btns button').forEach(button => {
        button.classList.toggle('active', button.dataset.res === state.previewResolution);
    });
    const langLinks = translations[state.language];
    if (langLinks) {
        const infoLinkEl = document.getElementById('info-link');
        if (infoLinkEl && langLinks.infoLink) {
            infoLinkEl.href = langLinks.infoLink;
        }

        const supportLinkEl = document.getElementById('support-link');
        if (supportLinkEl && langLinks.supportLink) {
            supportLinkEl.href = langLinks.supportLink;
        }
    }
    const debugSwitch = document.getElementById('debug-screen-switch');
    const debugScreen = document.getElementById('debug-screen');
    if (debugSwitch) debugSwitch.checked = state.debugScreenEnabled;
    if (debugScreen) debugScreen.classList.toggle('hidden', !state.debugScreenEnabled);

    showTab(state.activeTab);
    requestRedraw();
    renderKeyframeList();
    updateExportFormatUI(state.export.format);
}
