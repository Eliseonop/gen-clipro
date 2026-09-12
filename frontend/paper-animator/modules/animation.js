import { seededRandom, truncateFilename } from './utils.js';
import { state, animationStartTime, pauseStartTime } from './state.js';
import { canvas, requestRedraw, needsRedraw, setNeedsRedraw, draw, isLiveTornEdgePreview } from './renderer.js';
import { isScrubbing, updateTimelineUI } from './keyframes.js';
import { getVisualStateAtTime, getAdvancedTransform } from './transforms.js';
import { isEditModeOpen } from './edit-mode.js';

export let animationFrameId = null;

export let lastDebugUpdateTime = 0;
export let fps = 0;
export let frameCount = 0;
export let lastFPSTime = 0;

export function updateMovement(elapsedTime) {
    if (isLiveTornEdgePreview) return;
    let hasChanged = false;
    const objectState = state.object;

    if (!objectState.movement.enabled) {
        if (objectState.movement.rotation !== 0 || objectState.movement.positionOffset.x !== 0 || objectState.movement.positionOffset.y !== 0) {
            objectState.movement.rotation = 0;
            objectState.movement.positionOffset = { x: 0, y: 0 };
            hasChanged = true;
        }
    } else {
        const isSimpelMode = objectState.movement.mode === 'simpel';
        const speedMultiplier = isSimpelMode ? objectState.movement.simpelSpeed : 1;
        const strengthMultiplier = isSimpelMode ? objectState.movement.simpelStrength : 1;

        const effectiveRotationSpeed = objectState.movement.rotationSpeed * speedMultiplier;
        const effectiveRotationStrength = objectState.movement.rotationStrength * strengthMultiplier;
        const effectivePositionSpeedX = objectState.movement.positionSpeed.x * speedMultiplier;
        const effectivePositionSpeedY = objectState.movement.positionSpeed.y * speedMultiplier;
        const effectivePositionStrengthX = objectState.movement.positionStrength.x * strengthMultiplier;
        const effectivePositionStrengthY = objectState.movement.positionStrength.y * strengthMultiplier;

        let newRotation = 0;
        if (effectiveRotationSpeed > 0 && effectiveRotationStrength > 0) {
            const rotationInterval = 1000 / effectiveRotationSpeed;
            const cycleIndex = Math.floor(elapsedTime / rotationInterval);
            newRotation = (cycleIndex % 2 === 0) ? effectiveRotationStrength : -effectiveRotationStrength;
        }

        if (objectState.movement.rotation !== newRotation) {
            objectState.movement.rotation = newRotation;
            hasChanged = true;
        }

        let newPositionX = 0;
        if (effectivePositionSpeedX > 0 && effectivePositionStrengthX > 0) {
            const positionIntervalX = 1000 / effectivePositionSpeedX;
            const cycleIndexX = Math.floor(elapsedTime / positionIntervalX);
            newPositionX = (seededRandom(cycleIndexX * 1000) - 0.5) * effectivePositionStrengthX;
        }

        if (objectState.movement.positionOffset.x !== newPositionX) {
            objectState.movement.positionOffset.x = newPositionX;
            hasChanged = true;
        }

        let newPositionY = 0;
        if (effectivePositionSpeedY > 0 && effectivePositionStrengthY > 0) {
            const positionIntervalY = 1000 / effectivePositionSpeedY;
            const cycleIndexY = Math.floor(elapsedTime / positionIntervalY);
            newPositionY = (seededRandom(cycleIndexY * 2000 + 500) - 0.5) * effectivePositionStrengthY;
        }

        if (objectState.movement.positionOffset.y !== newPositionY) {
            objectState.movement.positionOffset.y = newPositionY;
            hasChanged = true;
        }
    }

    if (hasChanged) { requestRedraw(); }
}

export function updatePaperFoldOverlay(elapsedTime) {
    const objectState = state.object;

    if (!objectState.paperFoldOverlay.enabled && !objectState.stroke.enabled) {
        return;
    }

    const speed = objectState.paperFoldOverlay.speed;
    if (speed <= 0) return;

    const interval = 1000 / speed;
    const newIndex = Math.floor(elapsedTime / interval) % 4;

    if (objectState.paperFoldOverlay.currentImageIndex !== newIndex) {
        objectState.paperFoldOverlay.currentImageIndex = newIndex;
        requestRedraw();
    }
}

export function updateDebugScreen(timestamp) {
    if (!state.debugScreenEnabled) return;
    if (timestamp - lastDebugUpdateTime < 1000) return;
    const debugScreenEl = document.getElementById('debug-screen');
    if (!debugScreenEl) return;
    lastDebugUpdateTime = timestamp;

    let uiModeText;
    const isCurrentlyDesktop = window.matchMedia('(min-width: 769px)').matches;
    if (state.displayMode === 'auto') {
        uiModeText = isCurrentlyDesktop ? 'auto (desktop)' : 'auto (mobile)';
    } else {
        uiModeText = state.displayMode;
    }

    const resPreviewText = `${state.previewResolution}p`;
    const bgFileName = state.background.file ? truncateFilename(state.background.file.name, 20) : 'null';
    const objFileName = state.object.image.file ? truncateFilename(state.object.image.file.name, 20) : 'null';

    const debugInfo = `
FPS          : ${fps}
UI Mode      : ${uiModeText}
Res Preview  : ${resPreviewText} ${canvas?.width || 0}x${canvas?.height || 0}
Background   : ${bgFileName}
Object       : ${objFileName}
    `.trim();

    debugScreenEl.textContent = debugInfo;
}

export function fpsLoop(timestamp) {
    if (!lastFPSTime) {
        lastFPSTime = timestamp;
    }
    frameCount++;
    const delta = timestamp - lastFPSTime;

    if (delta >= 1000) {
        fps = Math.round((frameCount * 1000) / delta);
        frameCount = 0;
        lastFPSTime = timestamp;
        updateDebugScreen(timestamp);
    }

    requestAnimationFrame(fpsLoop);
}

export function animationLoop() {
    const timestamp = performance.now();
    if (isEditModeOpen()) {
        animationFrameId = requestAnimationFrame(animationLoop);
        return;
    }
    const animState = state.object.animation;

    let currentPlayheadTime;
    if (animState.previewTime !== null) {
        currentPlayheadTime = animState.previewTime * 1000;
    } else if (animState.isPlaying) {
        const elapsed = timestamp - animationStartTime;
        currentPlayheadTime = elapsed;
    } else {
        currentPlayheadTime = pauseStartTime;
    }

    if (animState.isPlaying || needsRedraw || isScrubbing) {
        updateMovement(currentPlayheadTime);
        updatePaperFoldOverlay(currentPlayheadTime);
    }

    if (animState.isPlaying && !isScrubbing && updateTimelineUI) {
        updateTimelineUI();
    }

    if (needsRedraw) {
        draw(currentPlayheadTime, { getVisualStateAtTime, getAdvancedTransform }).then(() => {
            setNeedsRedraw(false);
        });
    }

    animationFrameId = requestAnimationFrame(animationLoop);
}

export function startAnimationLoop() {
    animationFrameId = requestAnimationFrame(animationLoop);
}

