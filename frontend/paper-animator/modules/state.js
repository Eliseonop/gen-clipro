import { DEFAULT_STATE, DEFAULT_OBJECT_STATE, PREFERENCES_KEY } from './constants.js';
import { applyAccentColor } from './utils.js';
import { translations, updateUIText } from './translations.js';

export const state = JSON.parse(JSON.stringify(DEFAULT_STATE));

export let keyframeClipboard = null;
export function setKeyframeClipboard(val) { keyframeClipboard = val; }

export let pauseStartTime = 0;
export function setPauseStartTime(val) { pauseStartTime = val; }

export let animationStartTime = 0;
export function setAnimationStartTime(val) { animationStartTime = val; }

export const timingRef = {
    get pauseStartTime() { return pauseStartTime; },
    set pauseStartTime(v) { pauseStartTime = v; },
    get animationStartTime() { return animationStartTime; },
    set animationStartTime(v) { animationStartTime = v; }
};

export let userDesktopPanelWidth = null;
export function setUserDesktopPanelWidth(val) { userDesktopPanelWidth = val; }

export function savePreferences() {
    try {
        const prefsToSave = {
            language: state.language,
            uiSize: state.uiSize,
            previewResolution: state.previewResolution,
            accentColor: state.accentColor,
            desktopPanelWidth: userDesktopPanelWidth,
        };
        localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefsToSave));
    } catch (e) {
        console.error("Gagal menyimpan preferensi:", e);
    }
}

export function loadPreferences() {
    try {
        const savedPrefsString = localStorage.getItem(PREFERENCES_KEY);
        if (savedPrefsString) {
            const savedPrefs = JSON.parse(savedPrefsString);
            state.language = savedPrefs.language || state.language;
            state.uiSize = savedPrefs.uiSize || state.uiSize;
            state.previewResolution = savedPrefs.previewResolution || state.previewResolution;
            state.accentColor = savedPrefs.accentColor || state.accentColor;
            userDesktopPanelWidth = savedPrefs.desktopPanelWidth || null;
        }
    } catch (e) {
        console.error("Failed to load preferences:", e);
        localStorage.removeItem(PREFERENCES_KEY);
    }
}

export function resetPreferences(callbacks = {}) {
    localStorage.removeItem(PREFERENCES_KEY);
    userDesktopPanelWidth = null;
    document.body.style.removeProperty('--panel-width');

    const panelWrapper = document.getElementById('settings-panel-wrapper');
    const canvasContainer = document.getElementById('canvas-container');
    if (panelWrapper) panelWrapper.style.removeProperty('flex-basis');
    if (canvasContainer) canvasContainer.style.removeProperty('flex-basis');

    const isCurrentlyMobile = !window.matchMedia('(min-width: 769px)').matches;
    state.language = 'es';
    state.displayMode = 'auto';
    state.uiSize = isCurrentlyMobile ? 'compact' : 'normal';
    state.accentColor = DEFAULT_STATE.accentColor;

    const screenWidth = window.innerWidth;
    if (screenWidth <= 480) {
        state.previewResolution = '360';
    } else if (screenWidth > 480 && screenWidth < 1440) {
        state.previewResolution = '540';
    } else {
        state.previewResolution = '720';
    }

    applyAccentColor(state.accentColor);
    if (callbacks.syncDisplayModeUI) callbacks.syncDisplayModeUI();
    if (callbacks.syncUISizeUI) callbacks.syncUISizeUI();
    updateUIText(state.language);
    if (callbacks.updateUIFromState) callbacks.updateUIFromState();
    if (callbacks.autoAdjustMobileLayout) callbacks.autoAdjustMobileLayout();
}

export function resetMainSettings(deleteImages = false, callbacks = {}) {
    const currentPreferences = {
        language: state.language,
        displayMode: state.displayMode,
        uiSize: state.uiSize
    };

    const currentBgImg = state.background.element;
    const currentBgFile = state.background.file;
    const currentObjectImg = state.object.image.element;
    const currentObjectFile = state.object.image.file;
    const currentOriginalElement = state.object.image.originalElement;
    const currentUneditedElement = state.object.image.uneditedElement;
    const currentCropFrac = state.object.image.cropFrac ? { ...state.object.image.cropFrac } : null;
    const currentIsSVG = state.object.image.isSVG;
    const currentOriginalSVGSrc = state.object.image.originalSVGSrc;
    const wasEraserDirty = state.object.eraser.dirty;

    const newDefaults = JSON.parse(JSON.stringify(DEFAULT_STATE));
    Object.assign(state, newDefaults);

    state.language = currentPreferences.language;
    state.displayMode = currentPreferences.displayMode;
    state.uiSize = currentPreferences.uiSize;

    if (!deleteImages) {
        state.background.element = currentBgImg;
        state.background.file = currentBgFile;
        state.object.image.element = currentObjectImg;
        state.object.image.file = currentObjectFile;
        state.object.image.originalElement = currentOriginalElement;
        state.object.image.uneditedElement = currentUneditedElement;
        state.object.image.cropFrac = currentCropFrac;
        state.object.image.isSVG = currentIsSVG;
        state.object.image.originalSVGSrc = currentOriginalSVGSrc;
        state.object.eraser.dirty = wasEraserDirty;
    }

    if (callbacks.disableEraser) callbacks.disableEraser();

    if (callbacks.updateUIFromState) callbacks.updateUIFromState();
    if (callbacks.resizeAndRedrawAll) callbacks.resizeAndRedrawAll();
}

export function resetSectionSettings(sectionKey, callbacks = {}) {
    const defaultObjectState = DEFAULT_OBJECT_STATE;

    if (sectionKey === 'image' || ['stroke', 'shadow', 'color', 'movement', 'paperFoldOverlay'].includes(sectionKey)) {
        if (sectionKey === 'image') {
            state.object.image.size = defaultObjectState.image.size;
            state.object.image.offset = JSON.parse(JSON.stringify(defaultObjectState.image.offset));
            state.object.image.rotation = defaultObjectState.image.rotation;

            const rotSlider = document.getElementById('image-rotation');
            const rotInput = document.getElementById('image-rotation-input');
            const rotLabel = document.getElementById('image-rotation-label');

            if (rotSlider) rotSlider.value = 0;
            if (rotInput) rotInput.value = 0;
            if (rotLabel) rotLabel.textContent = translations[state.language]?.rotation || 'Rotation';
        } else {
            state.object[sectionKey] = JSON.parse(JSON.stringify(defaultObjectState[sectionKey]));
            if (sectionKey === 'stroke' && callbacks.setIsCacheGenerationNeeded) {
                callbacks.setIsCacheGenerationNeeded(true);
            }
        }
    } else {
        const keys = sectionKey.split('.');
        let defaultSection = DEFAULT_STATE;
        let currentSection = state;
        for (let i = 0; i < keys.length - 1; i++) {
            defaultSection = defaultSection[keys[i]];
            currentSection = currentSection[keys[i]];
        }
        const finalKey = keys[keys.length - 1];
        currentSection[finalKey] = JSON.parse(JSON.stringify(defaultSection[finalKey]));
    }

    if (callbacks.updateUIFromState) callbacks.updateUIFromState();
    if (callbacks.requestRedraw) callbacks.requestRedraw();
}
