import { RESOLUTION_MAPS, MASK_IMAGE_URLS } from './constants.js';
import { hexToRgba } from './utils.js';
import { state } from './state.js';

// main canvas and context references
export let canvas = null;
export let ctx = null;
export let canvasContainer = null;

// SVG filter elements
export let tornDilate = null;
export let tornTurbulence = null;
export let tornDisplacement = null;
export let tornFlood = null;

// image asset collections
export const maskImages = [];
export const layerImages = [];
export const originalOverlayImages = [];

// offscreen canvases for processing
export const objectCanvas = document.createElement('canvas');
export const objectCtx = objectCanvas.getContext('2d');

export const finalObjectCanvas = document.createElement('canvas');
export const finalObjectCtx = finalObjectCanvas.getContext('2d');

export const contentCanvas = document.createElement('canvas');
export const contentCtx = contentCanvas.getContext('2d');

export const tempOverlayCanvas = document.createElement('canvas');

// memoize whitened overlays per index
const whitenedOverlayCache = new Map();

function getWhitenedOverlayCanvas(overlayImage, index, effectStrength) {
    const strength = (100 - effectStrength) / 100;
    const cached = whitenedOverlayCache.get(index);
    if (cached && cached.img === overlayImage && cached.strength === strength &&
        cached.canvas.width === overlayImage.naturalWidth &&
        cached.canvas.height === overlayImage.naturalHeight) {
        return cached.canvas;
    }
    let whitened = cached ? cached.canvas : null;
    if (!whitened) {
        whitened = document.createElement('canvas');
    }
    if (whitened.width !== overlayImage.naturalWidth || whitened.height !== overlayImage.naturalHeight) {
        whitened.width = overlayImage.naturalWidth;
        whitened.height = overlayImage.naturalHeight;
    }
    const whitenedCtx = whitened.getContext('2d');
    whitenedCtx.drawImage(overlayImage, 0, 0);
    const imageData = whitenedCtx.getImageData(0, 0, whitened.width, whitened.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        data[i] += (255 - data[i]) * strength;
        data[i + 1] += (255 - data[i + 1]) * strength;
        data[i + 2] += (255 - data[i + 2]) * strength;
    }
    whitenedCtx.putImageData(imageData, 0, 0);
    whitenedOverlayCache.set(index, { img: overlayImage, strength, canvas: whitened });
    return whitened;
}

// cache padding and wrapper state for updateCanvasDisplaySize
let cachedContainerPadding = null;
let cachedWrapper = null;
let lastWrapperW = -1;
let lastWrapperH = -1;

export function invalidateCanvasPaddingCache() {
    cachedContainerPadding = null;
    cachedWrapper = null;
}
export let tornEdgeCache = [];
export function setTornEdgeCache(val) { tornEdgeCache = val; }

export let isCacheGenerationNeeded = true;
export function setIsCacheGenerationNeeded(val) { isCacheGenerationNeeded = val; }

export let isLiveTornEdgePreview = false;
export function setIsLiveTornEdgePreview(val) { isLiveTornEdgePreview = val; }

export let originalOverlaySpeed = 0;
export function setOriginalOverlaySpeed(val) { originalOverlaySpeed = val; }

export let isAdjustingTornEdge = false;
export function setIsAdjustingTornEdge(val) { isAdjustingTornEdge = val; }

export let isGeneratingCache = false;
export function setIsGeneratingCache(val) { isGeneratingCache = val; }

export let needsRedraw = true;
export function setNeedsRedraw(val) { needsRedraw = val; }
export function requestRedraw() { needsRedraw = true; }

export let isExporting = false;

export function initRendererElements() {
    canvas = document.getElementById('main-canvas');
    ctx = canvas.getContext('2d');
    canvasContainer = document.getElementById('canvas-container');

    tornDilate = document.getElementById('torn-dilate');
    tornTurbulence = document.getElementById('torn-turbulence');
    tornDisplacement = document.getElementById('torn-displacement');
    tornFlood = document.getElementById('torn-flood');
}

export async function generateTornEdgeCache() {
    if (isGeneratingCache || !state.object.image.element || !state.object.stroke.enabled) {
        return;
    }
    isGeneratingCache = true;
    isCacheGenerationNeeded = false;
    console.log("Starting progressive cache generation...");
    tornEdgeCache = [];
    console.log("Old cache cleared, starting new cache generation...");

    const objectState = state.object;
    const seeds = [20, 30, 40, 10];
    const sourceImg = objectState.image.element;
    const newCache = [];

    const BASE_RENDER_WIDTH = 1080.0;
    const renderScaleFactor = sourceImg.width / BASE_RENDER_WIDTH;

    for (let i = 0; i < seeds.length; i++) {
        const seed = seeds[i];
        const cacheCanvas = document.createElement('canvas');
        const cacheCtx = cacheCanvas.getContext('2d');
        cacheCanvas.width = sourceImg.width;
        cacheCanvas.height = sourceImg.height;

        const adjustedStrokeWidth = objectState.stroke.width * renderScaleFactor;
        const adjustedRoughness = objectState.stroke.roughness * renderScaleFactor;
        const adjustedDetail = objectState.stroke.detail / renderScaleFactor;

        if (tornDilate) tornDilate.setAttribute('radius', adjustedStrokeWidth);
        if (tornDisplacement) tornDisplacement.setAttribute('scale', adjustedRoughness);
        if (tornTurbulence) tornTurbulence.setAttribute('baseFrequency', adjustedDetail);
        if (tornTurbulence) tornTurbulence.setAttribute('seed', seed);
        if (tornFlood) tornFlood.setAttribute('flood-color', '#FFFFFF');

        cacheCtx.filter = 'url(#combined-filter)';
        cacheCtx.drawImage(sourceImg, 0, 0);

        const img = new Image();
        img.src = cacheCanvas.toDataURL();
        await img.decode();

        newCache[i] = img;
        tornEdgeCache = [...newCache];
        requestRedraw();

        await new Promise(resolve => setTimeout(resolve, 16));
    }

    isGeneratingCache = false;
    console.log("Progressive cache generation completed.");
}

export function drawFinalObject(objectState, imgW, imgH, totalOffsetX, totalOffsetY, tornEdgesEnabled, layerImage = null, maskImage = null) {
    const centerX = contentCanvas.width / 2;
    const centerY = contentCanvas.height / 2;

    objectCtx.clearRect(0, 0, objectCanvas.width, objectCanvas.height);
    contentCtx.clearRect(0, 0, contentCanvas.width, contentCanvas.height);
    finalObjectCtx.clearRect(0, 0, finalObjectCanvas.width, finalObjectCanvas.height);

    let fgColorFilterString = '';
    if (objectState.color.enabled) {
        let filterParts = [];
        if (objectState.color.colorize) filterParts.push('sepia(1)');
        filterParts.push(`hue-rotate(${objectState.color.hue}deg)`);
        filterParts.push(`saturate(${100 + objectState.color.saturation}%)`);
        filterParts.push(`brightness(${100 + objectState.color.brightness}%)`);
        fgColorFilterString = filterParts.join(' ');
    }

    contentCtx.save();
    contentCtx.filter = fgColorFilterString;
    contentCtx.translate(centerX, centerY);
    contentCtx.drawImage(objectState.image.element, -imgW / 2, -imgH / 2, imgW, imgH);
    contentCtx.restore();

    const overlayIndex = objectState.paperFoldOverlay.currentImageIndex;
    const overlayImage = originalOverlayImages[overlayIndex];
    if (overlayImage && overlayImage.complete && overlayImage.naturalWidth > 0) {
        const effectStrength = objectState.paperFoldOverlay.enabled ? objectState.paperFoldOverlay.opacity : 0;
        const whitenedCanvas = getWhitenedOverlayCanvas(overlayImage, overlayIndex, effectStrength);
        contentCtx.save();
        contentCtx.translate(centerX, centerY);
        contentCtx.globalCompositeOperation = objectState.paperFoldOverlay.blendMode;
        contentCtx.drawImage(whitenedCanvas, -imgW / 2, -imgH / 2, imgW, imgH);
        contentCtx.restore();
    }

    if (layerImage) {
        const layerSize = Math.max(imgW, imgH);
        contentCtx.save();
        contentCtx.translate(centerX, centerY);
        contentCtx.drawImage(layerImage, -layerSize / 2, -layerSize / 2, layerSize, layerSize);
        contentCtx.restore();
    }

    if (tornEdgesEnabled && objectState.stroke.width > 0) {
        objectCtx.clearRect(0, 0, objectCanvas.width, objectCanvas.height);
        objectCtx.save();

        if (isLiveTornEdgePreview) {
            const previewCanvas = tempOverlayCanvas;
            const previewCtx = previewCanvas.getContext('2d');

            const sourceImg = objectState.image.element;
            previewCanvas.width = sourceImg.width;
            previewCanvas.height = sourceImg.height;

            const BASE_RENDER_WIDTH = 1080.0;
            const renderScaleFactor = sourceImg.width / BASE_RENDER_WIDTH;
            const adjustedStrokeWidth = objectState.stroke.width * renderScaleFactor;
            const adjustedRoughness = objectState.stroke.roughness * renderScaleFactor;
            const adjustedDetail = objectState.stroke.detail / renderScaleFactor;

            if (tornDilate) tornDilate.setAttribute('radius', adjustedStrokeWidth);
            if (tornDisplacement) tornDisplacement.setAttribute('scale', adjustedRoughness);
            if (tornTurbulence) tornTurbulence.setAttribute('baseFrequency', adjustedDetail);
            if (tornTurbulence) tornTurbulence.setAttribute('seed', 10);
            if (tornFlood) tornFlood.setAttribute('flood-color', '#FFFFFF');

            previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
            previewCtx.filter = 'url(#combined-filter)';
            previewCtx.drawImage(sourceImg, 0, 0);

            objectCtx.filter = 'none';
            objectCtx.translate(centerX, centerY);
            objectCtx.drawImage(previewCanvas, -imgW / 2, -imgH / 2, imgW, imgH);
        } else {
            let cachedImage = tornEdgeCache[objectState.paperFoldOverlay.currentImageIndex];

            if (!cachedImage && tornEdgeCache.length > 0) {
                cachedImage = tornEdgeCache[0];
            }

            if (cachedImage && cachedImage.complete) {
                objectCtx.translate(centerX, centerY);
                objectCtx.drawImage(cachedImage, -imgW / 2, -imgH / 2, imgW, imgH);
            } else {
                objectCtx.translate(centerX, centerY);
                objectCtx.drawImage(objectState.image.element, -imgW / 2, -imgH / 2, imgW, imgH);
            }
        }

        objectCtx.restore();
        contentCtx.save();
        contentCtx.globalCompositeOperation = 'destination-in';
        contentCtx.drawImage(objectCanvas, 0, 0);
        contentCtx.restore();
    } else {
        objectCtx.save();
        objectCtx.translate(centerX, centerY);
        objectCtx.drawImage(objectState.image.element, -imgW / 2, -imgH / 2, imgW, imgH);
        objectCtx.restore();

        contentCtx.save();
        contentCtx.globalCompositeOperation = 'destination-in';
        contentCtx.drawImage(objectCanvas, 0, 0);
        contentCtx.restore();
    }

    let finalSourceCanvas = contentCanvas;
    if (maskImage) {
        const maskSize = Math.max(imgW, imgH);
        finalObjectCtx.save();
        finalObjectCtx.translate(centerX, centerY);
        finalObjectCtx.drawImage(maskImage, -maskSize / 2, -maskSize / 2, maskSize, maskSize);
        finalObjectCtx.restore();
        finalObjectCtx.save();
        finalObjectCtx.globalCompositeOperation = 'source-in';
        finalObjectCtx.drawImage(contentCanvas, 0, 0);
        finalObjectCtx.restore();
        finalSourceCanvas = finalObjectCanvas;
    }

    return finalSourceCanvas;
}

export async function draw(elapsedTime = 0, animationHelpers = {}) {
    const { getVisualStateAtTime, getAdvancedTransform } = animationHelpers;
    if (isCacheGenerationNeeded && !isGeneratingCache && !isLiveTornEdgePreview) {
        generateTornEdgeCache();
    }

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // apply background filters
    let bgFilterString = '';
    const bgCC = state.background.effects.colorCorrection;
    if (bgCC.enabled) {
        let filterParts = [];
        if (bgCC.colorize) { filterParts.push('sepia(1)'); }
        filterParts.push(`hue-rotate(${bgCC.hue}deg)`);
        filterParts.push(`saturate(${100 + bgCC.saturation}%)`);
        filterParts.push(`brightness(${100 + bgCC.brightness}%)`);
        bgFilterString = filterParts.join(' ');
    }
    if (state.background.effects.blur.enabled && state.background.effects.blur.intensity > 0) {
        bgFilterString += ` blur(${state.background.effects.blur.intensity}px)`;
    }
    ctx.filter = bgFilterString.trim();

    ctx.fillStyle = state.background.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const bgOffsetX = (canvas.width * state.background.transform.offset.x) / 100;
    const bgOffsetY = (canvas.height * (state.background.transform.offset.y * -1)) / 100;
    // draw background image if present
    if (state.background.element) {
        ctx.save();
        if (state.background.transform.mode === 'fill') {
            ctx.translate(canvas.width / 2 + bgOffsetX, canvas.height / 2 + bgOffsetY);
            ctx.rotate(state.background.transform.rotation * Math.PI / 180);
            const userScale = state.background.transform.size / 100;
            const canvasAspect = canvas.width / canvas.height;
            const bgAspect = state.background.element.width / state.background.element.height;
            let fillScale = (canvasAspect > bgAspect) ? canvas.width / state.background.element.width : canvas.height / state.background.element.height;
            ctx.scale(fillScale * userScale, fillScale * userScale);
            ctx.drawImage(state.background.element, -state.background.element.width / 2, -state.background.element.height / 2);
        } else if (state.background.transform.mode === 'stretch') {
            ctx.drawImage(state.background.element, 0, 0, canvas.width, canvas.height);
        }
        ctx.restore();
    }
    ctx.filter = 'none';
    if (state.background.effects.vignette.enabled) {
        ctx.save();
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const outerRadius = 1.5 * Math.sqrt(centerX * centerX + centerY * centerY);
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, outerRadius);
        const vignetteColor = hexToRgba(state.background.effects.vignette.color, state.background.effects.vignette.opacity / 100);
        const midPoint = state.background.effects.vignette.radius / 100;
        const halfFeather = (state.background.effects.vignette.feather / 100) / 2;
        const stop1 = Math.max(0, midPoint - halfFeather);
        const stop2 = Math.min(1, midPoint + halfFeather);
        gradient.addColorStop(stop1, 'rgba(0,0,0,0)');
        gradient.addColorStop(stop2, vignetteColor);
        gradient.addColorStop(1, vignetteColor);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    // draw object
    const objectState = state.object;
    if (objectState.image.element) {
        const animState = objectState.animation;
        const isSimpleMode = animState.mode === 'simple';
        const totalDuration = state.export.duration;
        let timeInSeconds;
        if (animState.previewTime !== null) {
            timeInSeconds = animState.previewTime;
        } else if (isExporting) {
            timeInSeconds = elapsedTime / 1000;
        } else {
            timeInSeconds = (elapsedTime / 1000) % totalDuration;
        }
        let transform, isPaperAnimActive = false, paperFrameIndex = 0, currentLayer = null, currentMask = null;
        if (isSimpleMode) {
            transform = { x: objectState.image.offset.x, y: objectState.image.offset.y, scale: objectState.image.size, rotation: objectState.image.rotation };
            const animDuration = 1.0, frameDuration = animDuration / 6.0;
            if (animState.simple.previewing) {
                const timeSincePreviewStart = (performance.now() - animState.simple.previewStartTime) / 1000;
                if (timeSincePreviewStart < animDuration) {
                    isPaperAnimActive = true;
                    let frameIndex = Math.min(5, Math.floor(timeSincePreviewStart / frameDuration));
                    paperFrameIndex = (animState.simple.previewing === 'close') ? 5 - frameIndex : frameIndex;
                }
            } else {
                if (animState.simple.open && timeInSeconds >= 0 && timeInSeconds < animDuration) {
                    isPaperAnimActive = true;
                    paperFrameIndex = Math.min(5, Math.floor(timeInSeconds / frameDuration));
                }
                const closeAnimStartTime = totalDuration - animDuration;
                if (animState.simple.close && timeInSeconds >= closeAnimStartTime && timeInSeconds <= totalDuration) {
                    isPaperAnimActive = true;
                    const timeIntoClose = timeInSeconds - closeAnimStartTime;
                    const frameIndex = Math.min(5, Math.floor(timeIntoClose / frameDuration));
                    paperFrameIndex = 5 - frameIndex;
                }
            }
        } else {
            if (getAdvancedTransform) {
                const { transform: advTransform, prevKeyframe, nextKeyframe } = getAdvancedTransform(timeInSeconds, objectState);
                transform = advTransform;
                if (prevKeyframe && nextKeyframe) {
                    const paperAnimType = prevKeyframe.paperAnim;
                    const segmentDuration = nextKeyframe.time - prevKeyframe.time;
                    if (paperAnimType !== 'none' && segmentDuration > 0) {
                        isPaperAnimActive = true;
                        const progress = Math.min(1, Math.max(0, (timeInSeconds - prevKeyframe.time) / segmentDuration));
                        let frameIndex = Math.floor(progress * MASK_IMAGE_URLS.length);
                        paperFrameIndex = Math.max(0, Math.min(MASK_IMAGE_URLS.length - 1, frameIndex));
                        if (paperAnimType === 'close') paperFrameIndex = (MASK_IMAGE_URLS.length - 1) - paperFrameIndex;
                    }
                }
            }
        }
        if (isPaperAnimActive) {
            currentLayer = layerImages[paperFrameIndex];
            currentMask = maskImages[paperFrameIndex];
        }
        if (!transform) { console.error("Gagal menentukan transformasi objek."); ctx.restore(); return; }
        const canvasAspect = canvas.width / canvas.height;
        const imageAspect = objectState.image.element.width / objectState.image.element.height;
        const baseScale = (canvasAspect > imageAspect) ? canvas.height / objectState.image.element.height : canvas.width / objectState.image.element.width;
        const finalScale = baseScale * (transform.scale / 100);
        const finalW = objectState.image.element.width * finalScale;
        const finalH = objectState.image.element.height * finalScale;
        const imgBaseOffsetX = (canvas.width * transform.x) / 100;
        const imgBaseOffsetY = (canvas.height * transform.y) / 100;
        const totalOffsetX = imgBaseOffsetX + objectState.movement.positionOffset.x;
        const totalOffsetY = imgBaseOffsetY + objectState.movement.positionOffset.y;
        const isTornEdgesEnabled = objectState.stroke.enabled;
        const stateBefore = getVisualStateAtTime ? getVisualStateAtTime(timeInSeconds, animState.keyframes) : 'open';
        let finalStampSource;
        if (!isSimpleMode && !isPaperAnimActive && stateBefore === 'closed') {
            finalStampSource = drawFinalObject(objectState, finalW, finalH, totalOffsetX, totalOffsetY, isTornEdgesEnabled, layerImages[0], maskImages[0]);
        } else {
            finalStampSource = drawFinalObject(objectState, finalW, finalH, totalOffsetX, totalOffsetY, isTornEdgesEnabled, currentLayer, currentMask);
        }
        ctx.save();
        if (objectState.shadow.enabled) {
            const baseResolution = 720;
            const currentResolution = canvas.height;
            const resolutionScaleFactor = currentResolution / baseResolution;
            ctx.shadowColor = hexToRgba(objectState.shadow.color, objectState.shadow.opacity / 100);
            ctx.shadowBlur = objectState.shadow.blur * resolutionScaleFactor;
            ctx.shadowOffsetX = objectState.shadow.offsetX * resolutionScaleFactor;
            ctx.shadowOffsetY = (objectState.shadow.offsetY * -1) * resolutionScaleFactor;
        }
        ctx.translate(canvas.width / 2 + totalOffsetX, canvas.height / 2 + (totalOffsetY * -1));
        if (objectState.movement.enabled || transform.rotation !== 0) {
            const totalRotation = transform.rotation + objectState.movement.rotation;
            ctx.rotate(totalRotation * Math.PI / 180);
        }
        ctx.drawImage(finalStampSource, -finalStampSource.width / 2, -finalStampSource.height / 2);
        ctx.restore();
    }
    ctx.restore();
}

export function updateInternalCanvasResolution() {
    const PREVIEW_RESOLUTION_KEY = state.previewResolution;
    const aspectRatioKey = state.aspectRatio;

    const dims = RESOLUTION_MAPS[PREVIEW_RESOLUTION_KEY]?.[aspectRatioKey];

    let targetW, targetH;
    if (!dims) {
        console.error(`Dimensi pratinjau tidak ditemukan untuk ${PREVIEW_RESOLUTION_KEY}! Kembali ke 540p.`);
        const fallbackDims = RESOLUTION_MAPS['540']?.[aspectRatioKey];
        targetW = fallbackDims ? fallbackDims.w : 960;
        targetH = fallbackDims ? fallbackDims.h : 540;
    } else {
        targetW = dims.w;
        targetH = dims.h;
    }

    // only assign canvas size on real change to avoid flicker
    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
    }

    const imageSizeSlider = document.getElementById('image-size');
    const maxScalePercent = imageSizeSlider ? parseFloat(imageSizeSlider.max) : 200;
    const offscreenMultiplier = (maxScalePercent / 100.0) + 0.1;

    const offscreenCanvasWidth = Math.round(canvas.width * offscreenMultiplier);
    const offscreenCanvasHeight = Math.round(canvas.height * offscreenMultiplier);

    if (objectCanvas.width !== offscreenCanvasWidth || objectCanvas.height !== offscreenCanvasHeight) {
        objectCanvas.width = contentCanvas.width = finalObjectCanvas.width = offscreenCanvasWidth;
        objectCanvas.height = contentCanvas.height = finalObjectCanvas.height = offscreenCanvasHeight;
    }

    requestRedraw();
}

export function updateCanvasDisplaySize() {
    if (!canvasContainer || !canvas || !canvas.height) return;
    // batch layout reads before writes
    const containerW = canvasContainer.offsetWidth;
    const containerH = canvasContainer.offsetHeight;
    if (!cachedContainerPadding) {
        const containerStyle = window.getComputedStyle(canvasContainer);
        cachedContainerPadding = {
            x: parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight),
            y: parseFloat(containerStyle.paddingTop) + parseFloat(containerStyle.paddingBottom)
        };
    }
    let availableWidth = containerW - cachedContainerPadding.x;
    let availableHeight = containerH - cachedContainerPadding.y;

    availableWidth = Math.max(10, availableWidth);
    availableHeight = Math.max(10, availableHeight);

    const canvasRatio = canvas.width / canvas.height;
    let displayW = availableWidth;
    let displayH = displayW / canvasRatio;

    if (displayH > availableHeight) {
        displayH = availableHeight;
        displayW = displayH * canvasRatio;
    }

    const roundedW = Math.round(displayW);
    const roundedH = Math.round(displayH);
    if (roundedW === lastWrapperW && roundedH === lastWrapperH) return;
    lastWrapperW = roundedW;
    lastWrapperH = roundedH;

    if (!cachedWrapper) cachedWrapper = document.getElementById('canvas-wrapper');
    if (cachedWrapper) {
        cachedWrapper.style.width = `${roundedW}px`;
        cachedWrapper.style.height = `${roundedH}px`;
    }
}

export function resizeAndRedrawAll() {
    updateInternalCanvasResolution();
    updateCanvasDisplaySize();
}
