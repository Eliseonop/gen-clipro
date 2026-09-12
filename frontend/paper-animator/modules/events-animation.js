import { DEFAULT_STATE } from './constants.js';
import { throttle } from './utils.js';
import {
    state, setPauseStartTime, setAnimationStartTime,
    pauseStartTime, animationStartTime
} from './state.js';
import { requestRedraw } from './renderer.js';
import {
    isScrubbing, setIsScrubbing, syncDurationInputs, checkAndExtendDuration,
    renderKeyframeMarkers, renderSimpleAnimationMarkers, renderKeyframeList
} from './keyframes.js';
import { showTopNotification } from './ui-controls.js';
import { updateUIFromState, updatePlayPauseButton } from './ui-sync.js';

export function initAnimationEventListeners() {
    const animModeBtns = document.getElementById('animation-mode-btns');
    if (animModeBtns) {
        animModeBtns.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (button) {
                state.object.animation.mode = button.dataset.mode;
                if (state.object.animation.isPlaying) {
                    state.object.animation.previewTime = null;
                }
                updateUIFromState();
                renderKeyframeMarkers();
                renderSimpleAnimationMarkers();
                requestRedraw();
            }
        });
    }

    const simpleOpenSw = document.getElementById('simple-anim-open-switch');
    if (simpleOpenSw) {
        simpleOpenSw.addEventListener('change', (e) => {
            state.object.animation.simple.open = e.target.checked;
            renderSimpleAnimationMarkers();
            requestRedraw();
        });
    }

    const simpleCloseSw = document.getElementById('simple-anim-close-switch');
    if (simpleCloseSw) {
        simpleCloseSw.addEventListener('change', (e) => {
            state.object.animation.simple.close = e.target.checked;
            renderSimpleAnimationMarkers();
            requestRedraw();
        });
    }

    const addKfBtn = document.getElementById('add-keyframe-btn');
    if (addKfBtn) {
        addKfBtn.addEventListener('click', () => {
            const keyframes = state.object.animation.keyframes;
            const sortedKeyframes = [...keyframes].sort((a, b) => a.time - b.time);
            const lastKeyframe = sortedKeyframes.length > 0 ? sortedKeyframes[sortedKeyframes.length - 1] : DEFAULT_STATE.object.animation.keyframes[0];

            const newKeyframe = {
                ...JSON.parse(JSON.stringify(lastKeyframe)),
                id: Date.now(),
                time: Math.round((lastKeyframe.time + 1) * 10) / 10,
                easing: 'linear',
                paperAnim: 'none'
            };

            if (typeof newKeyframe.rotation !== 'number') {
                newKeyframe.rotation = 0;
            }

            keyframes.push(newKeyframe);
            state.object.animation.activeKeyframeId = newKeyframe.id;
            checkAndExtendDuration(newKeyframe.time);
            renderKeyframeList();
            requestRedraw();
        });
    }

    const kfList = document.getElementById('keyframe-list');
    if (kfList) {
        kfList.addEventListener('click', (e) => {
            if (e.target.classList.contains('keyframe-time-input')) return;

            const item = e.target.closest('.keyframe-item');
            if (!item) return;

            const id = Number(item.dataset.keyframeId);

            if (e.target.closest('.delete-keyframe-btn')) {
                state.object.animation.keyframes = state.object.animation.keyframes.filter(kf => kf.id !== id);
                if (state.object.animation.activeKeyframeId === id) {
                    state.object.animation.activeKeyframeId = null;
                }
                renderKeyframeList();
                requestRedraw();
                return;
            }

            state.object.animation.activeKeyframeId = id;
            const kf = state.object.animation.keyframes.find(k => k.id === id);

            if (kf) {
                state.object.animation.isPlaying = false;
                state.object.animation.previewTime = kf.time;
                setPauseStartTime(kf.time * 1000);

                const timelineSlider = document.getElementById('timeline-slider');
                const timelineCurrentTime = document.getElementById('timeline-current-time');
                if (timelineSlider) timelineSlider.value = kf.time;
                if (timelineCurrentTime) timelineCurrentTime.textContent = `${kf.time.toFixed(2)}s`;

                updatePlayPauseButton();
                requestRedraw();
            }
            renderKeyframeList();
        });

        kfList.addEventListener('change', e => {
            if (e.target.classList.contains('keyframe-time-input')) {
                const item = e.target.closest('.keyframe-item');
                const id = Number(item.dataset.keyframeId);
                const kf = state.object.animation.keyframes.find(k => k.id === id);
                if (kf) {
                    const newTime = Math.max(0, parseFloat(e.target.value) || 0);
                    kf.time = newTime;

                    checkAndExtendDuration(newTime);
                    renderKeyframeList();
                    requestRedraw();
                }
            }
        });
    }

    const playPauseBtn = document.getElementById('play-pause-btn');
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', () => {
            const animState = state.object.animation;
            if (!state.object.image.element && !animState.isPlaying) {
                showTopNotification("notificationWarnObject");
                return;
            }
            animState.isPlaying = !animState.isPlaying;

            if (animState.isPlaying) {
                animState.previewTime = null;
                setAnimationStartTime(performance.now() - pauseStartTime);
                state.object.paperFoldOverlay.lastImageSwitchTime = performance.now();
            } else {
                setPauseStartTime(performance.now() - animationStartTime);
                animState.previewTime = (pauseStartTime / 1000) % state.export.duration;
                requestRedraw();
            }

            updatePlayPauseButton();
        });
    }

    const timelineSlider = document.getElementById('timeline-slider');
    if (timelineSlider) {
        const timelineCurrentTime = document.getElementById('timeline-current-time');

        const startScrub = () => {
            setIsScrubbing(true);
            state.object.animation.isPlaying = false;
            updatePlayPauseButton();
        };

        const stopScrub = () => {
            if (isScrubbing) {
                setIsScrubbing(false);
                const lastScrubTime = state.object.animation.previewTime;
                if (lastScrubTime !== null) {
                    setAnimationStartTime(performance.now() - (lastScrubTime * 1000));
                    setPauseStartTime(lastScrubTime * 1000);
                }
            }
        };

        const doScrub = (e) => {
            if (!isScrubbing) return;
            const newTime = parseFloat(e.target.value);
            state.object.animation.previewTime = newTime;
            if (timelineCurrentTime) {
                timelineCurrentTime.textContent = `${newTime.toFixed(2)}s`;
            }
            requestRedraw();
        };

        timelineSlider.addEventListener('mousedown', startScrub);
        timelineSlider.addEventListener('touchstart', startScrub, { passive: true });
        timelineSlider.addEventListener('input', throttle(doScrub, 50));
        document.addEventListener('mouseup', stopScrub);
        document.addEventListener('touchend', stopScrub);
    }

    const exportDurIn = document.getElementById('export-duration-input');
    const timelineDurIn = document.getElementById('timeline-duration-input');

    if (exportDurIn) {
        exportDurIn.addEventListener('change', (e) => syncDurationInputs(e.target.value));
    }
    if (timelineDurIn) {
        timelineDurIn.addEventListener('change', (e) => syncDurationInputs(e.target.value));
    }
}
