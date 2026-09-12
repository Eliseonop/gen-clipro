import { DEFAULT_OBJECT_STATE } from './constants.js';
import { translations, updateUIText } from './translations.js';
import { state, keyframeClipboard, setKeyframeClipboard, animationStartTime } from './state.js';
import { requestRedraw } from './renderer.js';
import { getVisualStateAtTime } from './transforms.js';
import { skinSlider, syncSliderAndInput, initContinuousSlider } from './ui-controls.js';

export let isScrubbing = false;
export function setIsScrubbing(val) { isScrubbing = val; }

let cachedTimelineSlider = null;
let cachedTimelineCurrentTime = null;

export function updateTimelineUI() {
    if (isScrubbing) return;

    const elapsed = performance.now() - animationStartTime;
    const totalDuration = state.export.duration;
    const currentTime = (elapsed / 1000) % totalDuration;

    // cache static nodes to avoid per-frame lookup
    if (!cachedTimelineSlider || !cachedTimelineSlider.isConnected) {
        cachedTimelineSlider = document.getElementById('timeline-slider');
    }
    if (!cachedTimelineCurrentTime || !cachedTimelineCurrentTime.isConnected) {
        cachedTimelineCurrentTime = document.getElementById('timeline-current-time');
    }

    if (cachedTimelineSlider) cachedTimelineSlider.value = currentTime;
    if (cachedTimelineCurrentTime) cachedTimelineCurrentTime.textContent = `${currentTime.toFixed(2)}s`;
}

export function syncDurationInputs(newValue) {
    const newDuration = Math.max(1, parseFloat(newValue) || 1);
    state.export.duration = newDuration;

    const exportInput = document.getElementById('export-duration-input');
    const timelineInput = document.getElementById('timeline-duration-input');
    if (exportInput) exportInput.value = newDuration.toFixed(1);
    if (timelineInput) timelineInput.value = newDuration.toFixed(1);

    const timelineSlider = document.getElementById('timeline-slider');
    if (timelineSlider) {
        timelineSlider.max = newDuration;
        if (parseFloat(timelineSlider.value) > newDuration) {
            timelineSlider.value = newDuration;
        }
    }
    requestRedraw();
    renderKeyframeMarkers();
    renderSimpleAnimationMarkers();
}

export function checkAndExtendDuration(keyframeTime) {
    if (keyframeTime > state.export.duration) {
        const newDuration = Math.ceil(keyframeTime * 2) / 2;
        syncDurationInputs(newDuration);
    }
}

export function renderKeyframeMarkers() {
    const markersContainer = document.getElementById('keyframe-markers-container');
    if (!markersContainer) return;

    markersContainer.innerHTML = '';

    if (state.object.animation.mode !== 'advanced') {
        return;
    }

    const totalDuration = state.export.duration;
    if (totalDuration <= 0) return;

    const keyframes = state.object.animation.keyframes;

    keyframes.forEach(kf => {
        const marker = document.createElement('div');
        marker.className = 'keyframe-marker';

        const keyframePosition = kf.time / totalDuration;
        if (keyframePosition >= 0 && keyframePosition <= 1) {
            marker.style.setProperty('--kf-pos', keyframePosition);
            markersContainer.appendChild(marker);
        }
    });
}

export function getIconForKeyframe(currentKeyframe, currentIndex, sortedKeyframes) {
    const iconStyle = 'fill="currentColor"';
    const openIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${iconStyle}><path d="M12.8659 3.00017L22.3922 19.5002C22.6684 19.9785 22.5045 20.5901 22.0262 20.8662C21.8742 20.954 21.7017 21.0002 21.5262 21.0002H2.47363C1.92135 21.0002 1.47363 20.5525 1.47363 20.0002C1.47363 19.8246 1.51984 19.6522 1.60761 19.5002L11.1339 3.00017C11.41 2.52187 12.0216 2.358 12.4999 2.63414C12.6519 2.72191 12.7782 2.84815 12.8659 3.00017ZM4.20568 19.0002H19.7941L11.9999 5.50017L4.20568 19.0002Z"></path></svg>`;
    const closeIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${iconStyle} style="transform: rotate(180deg);"><path d="M12.8659 3.00017L22.3922 19.5002C22.6684 19.9785 22.5045 20.5901 22.0262 20.8662C21.8742 20.954 21.7017 21.0002 21.5262 21.0002H2.47363C1.92135 21.0002 1.47363 20.5525 1.47363 20.0002C1.47363 19.8246 1.51984 19.6522 1.60761 19.5002L11.1339 3.00017C11.41 2.52187 12.0216 2.358 12.4999 2.63414C12.6519 2.72191 12.7782 2.84815 12.8659 3.00017ZM4.20568 19.0002H19.7941L11.9999 5.50017L4.20568 19.0002Z"></path></svg>`;
    const squareIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${iconStyle}><path d="M4 3H20C20.5523 3 21 3.44772 21 4V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V4C3 3.44772 3.44772 3 4 3ZM5 5V19H19V5H5Z"></path></svg>`;
    const lineIcon = `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/></svg>`;

    if (currentKeyframe.paperAnim === 'open') return openIcon;
    if (currentKeyframe.paperAnim === 'close') return closeIcon;

    if (currentKeyframe.paperAnim === 'none') {
        for (let i = currentIndex - 1; i >= 0; i--) {
            const prevAnim = sortedKeyframes[i].paperAnim;
            if (prevAnim === 'open') return squareIcon;
            if (prevAnim === 'close') return lineIcon;
        }
        return squareIcon;
    }

    return squareIcon;
}

export function renderSimpleAnimationMarkers() {
    const container = document.getElementById('keyframe-markers-container');
    if (!container) return;

    const trackWidth = container.offsetWidth;
    container.querySelectorAll('.simple-anim-marker').forEach(m => m.remove());

    if (state.object.animation.mode !== 'simple') return;

    const totalDuration = state.export.duration;
    if (totalDuration <= 0 || trackWidth <= 0) return;

    const animDuration = 1.0;
    const thumbWidth = 20;
    const borderWidth = 3;

    const oneSecondInPixels = (animDuration / totalDuration) * trackWidth;
    const markerWidthInPixels = oneSecondInPixels + thumbWidth - borderWidth;

    if (state.object.animation.simple.open) {
        const openMarker = document.createElement('div');
        openMarker.className = 'simple-anim-marker';
        openMarker.style.left = '0px';
        openMarker.style.width = `${markerWidthInPixels}px`;
        container.appendChild(openMarker);
    }

    if (state.object.animation.simple.close) {
        const closeMarker = document.createElement('div');
        closeMarker.className = 'simple-anim-marker';
        const endPosition = trackWidth;
        const startPosition = endPosition - markerWidthInPixels;

        closeMarker.style.left = `${startPosition}px`;
        closeMarker.style.width = `${markerWidthInPixels}px`;
        container.appendChild(closeMarker);
    }
}

export function renderKeyframeList() {
    const keyframeListContainer = document.getElementById('keyframe-list');
    if (!keyframeListContainer) return;
    const keyframes = state.object.animation.keyframes;
    const sortedKeyframes = [...keyframes].sort((a, b) => a.time - b.time);

    keyframeListContainer.innerHTML = '';

    sortedKeyframes.forEach((kf, index) => {
        const item = document.createElement('div');
        item.className = 'keyframe-item flex items-center gap-2 p-2 border border-slate-700 bg-slate-800 cursor-pointer transition-colors hover:bg-slate-700/50';
        item.dataset.keyframeId = kf.id;

        if (kf.id === state.object.animation.activeKeyframeId) {
            item.classList.add('border-accent-400', 'bg-slate-700');
            item.style.borderColor = 'var(--accent-color)';
        }

        const iconSVG = getIconForKeyframe(kf, index, sortedKeyframes);

        item.innerHTML = `
                    <div class="w-6 h-6 flex-shrink-0 text-white flex items-center justify-center">${iconSVG}</div>
                    <span class="font-semibold text-slate-300 flex-shrink-0">Keyframe ${index + 1}</span>
                    <div class="flex items-center gap-2 ml-auto">
                        <input type="number" min="0" step="0.1" value="${kf.time.toFixed(2)}" class="keyframe-time-input number-input-uniform bg-slate-900 border border-[var(--border-color-light)] py-1 px-2 text-sm focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]">
                        <span class="text-sm text-[var(--text-muted)]">s</span>
                        <button class="delete-keyframe-btn p-1.5 text-red-400 hover:text-white hover:bg-red-500/80 transition-all">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M7 4V2H17V4H22V6H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V6H2V4H7ZM6 6V20H18V6H6ZM9 9H11V17H9V9ZM13 9H15V17H13V9Z"></path></svg>
                        </button>
                    </div>
                `;
        keyframeListContainer.appendChild(item);
    });

    renderKeyframeProperties();
    renderKeyframeMarkers();
}

export function renderKeyframeProperties() {
    const panel = document.getElementById('keyframe-properties-panel');
    if (!panel) return;
    const activeKeyframeId = state.object.animation.activeKeyframeId;
    const keyframes = state.object.animation.keyframes;
    const keyframe = keyframes.find(kf => kf.id === activeKeyframeId);

    if (!keyframe) {
        panel.innerHTML = '';
        panel.classList.add('hidden');
        return;
    }

    const sortedKeyframes = [...keyframes].sort((a, b) => a.time - b.time);
    const currentIndex = sortedKeyframes.findIndex(kf => kf.id === activeKeyframeId);
    const stateBefore = getVisualStateAtTime(keyframe.time, keyframes);
    const isOpenDisabled = !(stateBefore === 'closed' || currentIndex === 0);
    const isCloseDisabled = !(stateBefore === 'open');

    panel.classList.remove('hidden');
    panel.innerHTML = `
            <div class="accordion-section border border-[var(--border-color)] accordion-open">
                <div class="accordion-header w-full flex items-center justify-between p-4 bg-slate-700/30">
                    <h2 id="keyframe-properties-title" class="text-base font-semibold text-slate-300"></h2>
                    <div class="flex items-center gap-2">
                        <button id="kf-reset-btn" title="Reset Properties" class="p-1.5 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M22 12C22 17.5228 17.5229 22 12 22C6.4772 22 2 17.5228 2 12C2 6.47715 6.4772 2 12 2V4C7.5817 4 4 7.58172 4 12C4 16.4183 7.5817 20 12 20C16.4183 20 20 16.4183 20 12C20 9.25022 18.6127 6.82447 16.4998 5.38451L16.5 8H14.5V2L20.5 2V4L18.0008 3.99989C20.4293 5.82434 22 8.72873 22 12Z"></path></svg>
                        </button>
                        <button id="kf-copy-btn" title="Copy Properties" class="p-1.5 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M6.9998 6V3C6.9998 2.44772 7.44752 2 7.9998 2H19.9998C20.5521 2 20.9998 2.44772 20.9998 3V17C20.9998 17.5523 20.5521 18 19.9998 18H16.9998V20.9991C16.9998 21.5519 16.5499 22 15.993 22H4.00666C3.45059 22 3 21.5554 3 20.9991L3.0026 7.00087C3.0027 6.44811 3.45264 6 4.00942 6H6.9998ZM5.00242 8L5.00019 20H14.9998V8H5.00242ZM8.9998 6H16.9998V16H18.9998V4H8.9998V6Z"></path></svg>
                        </button>
                        <button id="kf-paste-btn" title="Paste Properties" class="p-1.5 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors ${keyframeClipboard === null ? 'is-disabled' : ''}">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M7 4V2H17V4H20.0066C20.5552 4 21 4.44495 21 4.9934V21.0066C21 21.5552 20.5551 22 20.0066 22H3.9934C3.44476 22 3 21.5551 3 21.0066V4.9934C3 4.44476 3.44495 4 3.9934 4H7ZM7 6H5V20H19V6H17V8H7V6ZM9 4V6H15V4H9Z"></path></svg>
                        </button>
                    </div>
                </div>
                <div class="accordion-body space-y-4 p-4 border-t border-[var(--border-color)]">
                    <!-- scale -->
                    <div>
                        <label class="text-sm font-medium text-[var(--text-muted)] mb-2 block" data-translate-key="imageSize"></label>
                        <div class="flex items-center gap-3">
                            <input type="range" id="kf-scale" min="10" max="200" value="${keyframe.scale}" class="w-full slider">
                            <input type="number" id="kf-scale-input" min="10" max="200" value="${keyframe.scale}" class="number-input-uniform bg-slate-900 border border-[var(--border-color)] py-1 px-2 text-sm">
                        </div>
                    </div>
                    <!-- offset-x -->
                    <div>
                        <label class="text-sm font-medium text-[var(--text-muted)] mb-2 block" data-translate-key="offsetX"></label>
                        <div class="flex items-center gap-3">
                            <input type="range" id="kf-offset-x" min="-150" max="150" value="${keyframe.x}" class="w-full slider">
                            <input type="number" id="kf-offset-x-input" min="-150" max="150" value="${keyframe.x}" class="number-input-uniform bg-slate-900 border border-[var(--border-color)] py-1 px-2 text-sm">
                        </div>
                    </div>
                    <!-- offset-y -->
                    <div>
                        <label class="text-sm font-medium text-[var(--text-muted)] mb-2 block" data-translate-key="offsetY"></label>
                        <div class="flex items-center gap-3">
                            <input type="range" id="kf-offset-y" min="-150" max="150" value="${keyframe.y}" class="w-full slider">
                            <input type="number" id="kf-offset-y-input" min="-150" max="150" value="${keyframe.y}" class="number-input-uniform bg-slate-900 border border-[var(--border-color)] py-1 px-2 text-sm">
                        </div>
                    </div>
                    <!-- rotation -->
                    <div>
                        <label id="kf-rotation-label" class="text-sm font-medium text-[var(--text-muted)] mb-2 block" data-translate-key="rotation"></label>
                        <div class="flex items-center gap-3">
                            <input type="range" id="kf-rotation" min="-180" max="180" value="${(keyframe.rotation % 360 + 540) % 360 - 180}" class="w-full slider">
                            <input type="number" id="kf-rotation-input" value="${keyframe.rotation}" class="number-input-uniform bg-slate-900 border border-[var(--border-color)] py-1 px-2 text-sm">
                        </div>
                    </div>
                    <!-- easing -->
                    <div class="pt-4 border-t border-slate-700">
                        <label class="text-sm font-medium text-[var(--text-muted)] mb-2 block" data-translate-key="easingToNext"></label>
                        <div id="kf-easing-btns" class="space-y-2">
                            <div class="grid grid-cols-4 gap-2 btn-group-toggle">
                                ${['linear', 'easeIn', 'easeOut', 'easeInOut'].map(type => `
                                    <button data-easing="${type}" class="${keyframe.easing === type ? 'active' : ''} p-2.5 border-2 border-[var(--border-color)] text-[var(--text-muted)] text-sm" data-translate-key="${type}"></button>
                                `).join('')}
                            </div>
                            <div class="grid grid-cols-4 gap-2 btn-group-toggle">
                                ${['instant', 'backIn', 'backOut', 'backInOut'].map(type => `
                                    <button data-easing="${type}" class="${keyframe.easing === type ? 'active' : ''} p-2.5 border-2 border-[var(--border-color)] text-[var(--text-muted)] text-sm" data-translate-key="${type}"></button>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                    <!-- paper animation -->
                    <div class="pt-4 border-t border-slate-700">
                        <label class="text-sm font-medium text-[var(--text-muted)] mb-2 block" data-translate-key="keyframeAnim"></label>
                        <div id="kf-paper-anim-btns" class="grid grid-cols-3 gap-2 btn-group-toggle">
                            <button data-anim="none" class="${keyframe.paperAnim === 'none' ? 'active' : ''} p-2.5 border-2 border-[var(--border-color)] text-[var(--text-muted)] text-sm" data-translate-key="animNone"></button>
                            <button data-anim="open" class="${keyframe.paperAnim === 'open' ? 'active' : ''} p-2.5 border-2 border-[var(--border-color)] text-[var(--text-muted)] text-sm" ${isOpenDisabled ? 'disabled' : ''} data-translate-key="animOpen"></button>
                            <button data-anim="close" class="${keyframe.paperAnim === 'close' ? 'active' : ''} p-2.5 border-2 border-[var(--border-color)] text-[var(--text-muted)] text-sm" ${isCloseDisabled ? 'disabled' : ''} data-translate-key="animClose"></button>
                        </div>
                    </div>
                </div>
            </div>`;

    const titleTemplate = translations[state.language].keyframePropertiesTitle || 'Keyframe Properties #';
    const dynamicTitle = `${titleTemplate}${currentIndex + 1}`;
    document.getElementById('keyframe-properties-title').textContent = dynamicTitle;

    updateUIText(state.language);

    document.getElementById('kf-reset-btn').addEventListener('click', () => {
        const defaultProps = DEFAULT_OBJECT_STATE.animation.keyframes[0];
        keyframe.x = defaultProps.x;
        keyframe.y = defaultProps.y;
        keyframe.scale = defaultProps.scale;
        keyframe.rotation = defaultProps.rotation;
        renderKeyframeProperties();
        requestRedraw();
    });

    document.getElementById('kf-copy-btn').addEventListener('click', () => {
        setKeyframeClipboard({
            x: keyframe.x,
            y: keyframe.y,
            scale: keyframe.scale,
            rotation: keyframe.rotation,
        });
        renderKeyframeProperties();
    });

    document.getElementById('kf-paste-btn').addEventListener('click', (e) => {
        if (e.currentTarget.classList.contains('is-disabled')) return;
        if (keyframeClipboard) {
            keyframe.x = keyframeClipboard.x;
            keyframe.y = keyframeClipboard.y;
            keyframe.scale = keyframeClipboard.scale;
            keyframe.rotation = keyframeClipboard.rotation;
            renderKeyframeProperties();
            requestRedraw();
        }
    });

    ['kf-scale', 'kf-offset-x', 'kf-offset-y', 'kf-rotation'].forEach(id => {
        const el = document.getElementById(id);
        if (el) skinSlider(el);
    });

    syncSliderAndInput('kf-scale', 'kf-scale-input', val => keyframe.scale = val);
    syncSliderAndInput('kf-offset-x', 'kf-offset-x-input', val => keyframe.x = val);
    syncSliderAndInput('kf-offset-y', 'kf-offset-y-input', val => keyframe.y = val);
    initContinuousSlider(
        document.getElementById('kf-rotation'),
        document.getElementById('kf-rotation-input'),
        document.getElementById('kf-rotation-label'),
        () => keyframe.rotation,
        val => { keyframe.rotation = val; }
    );
    document.getElementById('kf-easing-btns').addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (btn) {
            keyframe.easing = btn.dataset.easing;
            renderKeyframeProperties();
            requestRedraw();
        }
    });
    document.getElementById('kf-paper-anim-btns').addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (btn && !btn.disabled) {
            keyframe.paperAnim = btn.dataset.anim;
            renderKeyframeProperties();
            renderKeyframeList();
            requestRedraw();
        }
    });
}
