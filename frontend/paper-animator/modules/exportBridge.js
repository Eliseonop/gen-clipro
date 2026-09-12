import { DEFAULT_OBJECT_STATE, RESOLUTION_MAPS } from './constants.js';
import { hexToRgba } from './utils.js';
import { state, timingRef } from './state.js';
import { translations } from './translations.js';
import {
    canvas, ctx, draw, objectCanvas, contentCanvas, finalObjectCanvas,
    generateTornEdgeCache, resizeAndRedrawAll, drawFinalObject,
    isCacheGenerationNeeded, needsRedraw, layerImages, maskImages
} from './renderer.js';
import { updateMovement, updatePaperFoldOverlay, animationFrameId, animationLoop } from './animation.js';
import { getAdvancedTransform, getVisualStateAtTime } from './transforms.js';
import { showTopNotification } from './ui-controls.js';

export function updateExportFormatUI(format) {
    const videoSettings = document.getElementById('video-settings');
    const pngSettings = document.getElementById('png-settings');
    const jpgSettings = document.getElementById('jpg-settings');
    const fileExtension = document.getElementById('file-extension');
    const exportFormatSelect = document.getElementById('export-format-select');

    if (exportFormatSelect) {
        exportFormatSelect.value = format;
    }

    const isVideo = ['mp4', 'mov', 'mkv', 'webm'].includes(format);
    if (videoSettings) {
        videoSettings.classList.toggle('hidden', !isVideo);
    }
    if (pngSettings) {
        pngSettings.classList.toggle('hidden', format !== 'png');
    }
    if (jpgSettings) {
        jpgSettings.classList.toggle('hidden', format !== 'jpg');
    }

    if (fileExtension) {
        const extensions = {
            mp4: '.mp4',
            mov: '.mov',
            mkv: '.mkv',
            webm: '.webm',
            png: '.png',
            jpg: '.jpg'
        };
        fileExtension.textContent = extensions[format] || '.mp4';
    }

    if (format === 'jpg') {
        const qualitySlider = document.getElementById('jpg-quality-slider');
        const qualityValue = document.getElementById('jpg-quality-value');
        if (qualitySlider && qualityValue) {
            qualitySlider.value = state.export.jpgQuality;
            qualityValue.textContent = state.export.jpgQuality + '%';
        }
    }

    if (format === 'png') {
        const transparentBgCheckbox = document.getElementById('transparent-background-checkbox');
        if (transparentBgCheckbox) {
            transparentBgCheckbox.checked = state.export.transparentBackground;
        }
    }
}

export async function startExport() {
    if (!window.startVideoExport) {
        try {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = './assets/export-module.js';
                script.onload = resolve;
                script.onerror = () => reject(new Error('Failed to load export module'));
                document.head.appendChild(script);
            });
        } catch (error) {
            console.error('Failed to load export module:', error);
            showTopNotification("exportError");
            return;
        }
    }

    const drawWithHelpers = (elapsedTime) =>
        draw(elapsedTime, { getVisualStateAtTime, getAdvancedTransform });

    await window.startVideoExport(
        state,
        translations,
        canvas,
        ctx,
        drawWithHelpers,
        updateMovement,
        updatePaperFoldOverlay,
        animationFrameId,
        requestAnimationFrame,
        showTopNotification,
        generateTornEdgeCache,
        resizeAndRedrawAll,
        DEFAULT_OBJECT_STATE,
        RESOLUTION_MAPS,
        objectCanvas,
        contentCanvas,
        finalObjectCanvas,
        isCacheGenerationNeeded,
        needsRedraw,
        animationLoop,
        false, // isExporting handled in export module
        drawFinalObject,
        getAdvancedTransform,
        getVisualStateAtTime,
        layerImages,
        maskImages,
        hexToRgba,
        timingRef
    );
}
