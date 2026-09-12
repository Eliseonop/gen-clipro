import { state, setAnimationStartTime, setPauseStartTime } from './state.js';
import { setIsCacheGenerationNeeded, requestRedraw } from './renderer.js';
import { updateUIFromState, updatePlayPauseButton } from './ui-sync.js';
import { disableEraser } from './eraser.js';
import { DEFAULT_OBJECT_STATE } from './constants.js';

export function handleImageFile(file, target) {
    if (!file || !file.type.startsWith('image/')) return;

    const isSVG = file.type === 'image/svg+xml';
    const reader = new FileReader();
    reader.onload = (event) => {
        const highResImg = new Image();
        highResImg.onload = () => {
            if (target === 'background') {
                if (isSVG) {
                    const previewRes = parseInt(state.previewResolution) || 540;
                    const aspectRatio = highResImg.width / highResImg.height;
                    let targetWidth, targetHeight;
                    if (aspectRatio > 1) {
                        targetWidth = previewRes * aspectRatio;
                        targetHeight = previewRes;
                    } else {
                        targetWidth = previewRes;
                        targetHeight = previewRes / aspectRatio;
                    }

                    const svgCanvas = document.createElement('canvas');
                    const svgCtx = svgCanvas.getContext('2d');
                    svgCanvas.width = targetWidth;
                    svgCanvas.height = targetHeight;
                    svgCtx.drawImage(highResImg, 0, 0, targetWidth, targetHeight);

                    const scaledImg = new Image();
                    scaledImg.onload = () => {
                        state.background.element = scaledImg;
                        state.background.file = file;
                        updateUIFromState();
                        requestRedraw();
                    };
                    scaledImg.src = svgCanvas.toDataURL();
                } else {
                    state.background.element = highResImg;
                    state.background.file = file;
                    updateUIFromState();
                    requestRedraw();
                }
                return;
            }

            state.object.eraser = JSON.parse(JSON.stringify(DEFAULT_OBJECT_STATE.eraser));
            state.object.image.uneditedElement = null;
            state.object.image.cropFrac = null;
            disableEraser();

            state.object.image.originalElement = highResImg;
            state.object.image.file = file;
            state.object.image.isSVG = isSVG;
            if (isSVG) {
                state.object.image.originalSVGSrc = event.target.result;
            } else {
                state.object.image.originalSVGSrc = null;
            }

            const MAX_PREVIEW_SIZE = 800;
            let previewWidth, previewHeight;

            if (isSVG) {
                const ratio = highResImg.width / highResImg.height;
                if (ratio > 1) {
                    previewWidth = MAX_PREVIEW_SIZE;
                    previewHeight = MAX_PREVIEW_SIZE / ratio;
                } else {
                    previewHeight = MAX_PREVIEW_SIZE;
                    previewWidth = MAX_PREVIEW_SIZE * ratio;
                }
            } else {
                previewWidth = highResImg.width;
                previewHeight = highResImg.height;

                if (previewWidth > MAX_PREVIEW_SIZE || previewHeight > MAX_PREVIEW_SIZE) {
                    const ratio = previewWidth / previewHeight;
                    if (ratio > 1) {
                        previewWidth = MAX_PREVIEW_SIZE;
                        previewHeight = MAX_PREVIEW_SIZE / ratio;
                    } else {
                        previewHeight = MAX_PREVIEW_SIZE;
                        previewWidth = MAX_PREVIEW_SIZE * ratio;
                    }
                }
            }

            const resampleCanvas = document.createElement('canvas');
            const resampleCtx = resampleCanvas.getContext('2d');
            resampleCanvas.width = previewWidth;
            resampleCanvas.height = previewHeight;
            resampleCtx.drawImage(highResImg, 0, 0, previewWidth, previewHeight);

            const previewImg = new Image();
            previewImg.onload = () => {
                const paddedCanvas = document.createElement('canvas');
                const paddedCtx = paddedCanvas.getContext('2d');
                const paddingX = previewImg.width * 0.25;
                const paddingY = previewImg.height * 0.25;
                paddedCanvas.width = previewImg.width + paddingX * 2;
                paddedCanvas.height = previewImg.height + paddingY * 2;
                paddedCtx.drawImage(previewImg, paddingX, paddingY);

                const finalPaddedImg = new Image();
                finalPaddedImg.onload = () => {
                    state.object.image.element = finalPaddedImg;
                    state.object.image.uneditedElement = finalPaddedImg;
                    setIsCacheGenerationNeeded(true);
                    state.object.animation.isPlaying = true;
                    setAnimationStartTime(performance.now());
                    setPauseStartTime(0);
                    state.object.paperFoldOverlay.lastImageSwitchTime = performance.now();
                    updatePlayPauseButton();
                    updateUIFromState();
                    requestRedraw();
                };
                finalPaddedImg.src = paddedCanvas.toDataURL();
            };
            previewImg.src = resampleCanvas.toDataURL();
        };
        highResImg.onerror = () => {
            console.error(`Gagal memuat gambar ${target}`);
        };
        highResImg.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

export function setupDropZone(zoneId, inputId, target) {
    const dropZone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    if (!dropZone || !input) return;
    input.addEventListener('change', (e) => handleImageFile(e.target.files[0], target));
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); });
        document.body.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); });
    });
    ['dragenter', 'dragover'].forEach(eventName => dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over')));
    ['dragleave', 'drop'].forEach(eventName => dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over')));
    dropZone.addEventListener('drop', (e) => {
        handleImageFile(e.dataTransfer.files[0], target);
        input.files = e.dataTransfer.files;
    });
}
