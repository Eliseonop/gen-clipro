import { translations } from './translations.js';
import { state } from './state.js';
import { requestRedraw } from './renderer.js';

export const skinnedSliders = new Set();
export let isSliderSyncLoopStarted = false;

export function skinSlider(sliderEl) {
    if (!sliderEl || sliderEl.__sliderSkin) return sliderEl.__sliderSkin;

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-slider';

    const track = document.createElement('div');
    track.className = 'custom-slider__track';

    const fill = document.createElement('div');
    fill.className = 'custom-slider__fill';

    const thumb = document.createElement('div');
    thumb.className = 'custom-slider__thumb';

    const parent = sliderEl.parentNode;
    if (parent) {
        parent.insertBefore(wrapper, sliderEl);
        wrapper.appendChild(track);
        wrapper.appendChild(fill);
        wrapper.appendChild(thumb);
        wrapper.appendChild(sliderEl);
    }

    sliderEl.classList.add('custom-slider-input');

    const paint = () => {
        const min = parseFloat(sliderEl.min) || 0;
        const max = parseFloat(sliderEl.max) || 100;
        const val = parseFloat(sliderEl.value) || 0;
        const pct = max === min ? 0 : Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
        wrapper.style.setProperty('--custom-range-pct', `${pct}%`);
    };

    const skin = {
        sliderEl,
        wrapper,
        track,
        fill,
        thumb,
        paint,
        lastVal: sliderEl.value,
        lastMin: sliderEl.min,
        lastMax: sliderEl.max
    };

    sliderEl.__sliderSkin = skin;
    skinnedSliders.add(skin);
    paint();

    sliderEl.addEventListener('input', paint);
    sliderEl.addEventListener('change', paint);

    thumb.addEventListener('pointerdown', (e) => {
        if (sliderEl.__isContinuous) return;
        if (e.button !== 0) return;
        e.preventDefault();
        thumb.setPointerCapture(e.pointerId);
        document.body.classList.add('grabbing');
        document.body.style.cursor = 'ew-resize';

        const updateFromPointer = (moveEv) => {
            const rect = wrapper.getBoundingClientRect();
            if (rect.width <= 0) return;
            const offsetX = moveEv.clientX - rect.left;
            let pct = offsetX / rect.width;
            pct = Math.max(0, Math.min(1, pct));

            const min = parseFloat(sliderEl.min) || 0;
            const max = parseFloat(sliderEl.max) || 100;
            const step = parseFloat(sliderEl.step) || 1;

            let rawVal = min + pct * (max - min);
            let steps = Math.round((rawVal - min) / step);
            let clampedVal = min + steps * step;

            const decimalPlaces = (String(step).split('.')[1] || '').length;
            clampedVal = parseFloat(clampedVal.toFixed(decimalPlaces));
            clampedVal = Math.max(min, Math.min(max, clampedVal));

            if (parseFloat(sliderEl.value) !== clampedVal) {
                sliderEl.value = clampedVal;
                sliderEl.dispatchEvent(new Event('input', { bubbles: true }));
                paint();
            }
        };

        updateFromPointer(e);

        const onPointerMove = (moveEv) => {
            updateFromPointer(moveEv);
        };

        const onPointerUp = (upEv) => {
            try {
                thumb.releasePointerCapture(upEv.pointerId);
            } catch (err) {}
            document.body.classList.remove('grabbing');
            document.body.style.cursor = '';
            thumb.removeEventListener('pointermove', onPointerMove);
            thumb.removeEventListener('pointerup', onPointerUp);
            thumb.removeEventListener('pointercancel', onPointerUp);
        };

        thumb.addEventListener('pointermove', onPointerMove);
        thumb.addEventListener('pointerup', onPointerUp);
        thumb.addEventListener('pointercancel', onPointerUp);
    });

    if (!isSliderSyncLoopStarted) {
        isSliderSyncLoopStarted = true;
        startSliderSyncLoop();
    }

    return skin;
}

export function startSliderSyncLoop() {
    function tick() {
        for (const skin of skinnedSliders) {
            const el = skin.sliderEl;
            if (!el || !el.isConnected) {
                skinnedSliders.delete(skin);
                continue;
            }
            const val = el.value;
            const min = el.min;
            const max = el.max;
            if (skin.lastVal !== val || skin.lastMin !== min || skin.lastMax !== max) {
                skin.lastVal = val;
                skin.lastMin = min;
                skin.lastMax = max;
                skin.paint();
            }
        }
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

export function initContinuousSlider(sliderEl, inputEl, labelEl, getValue, stateUpdater) {
    if (!sliderEl || !inputEl || !labelEl) return;

    if (!sliderEl.__sliderSkin) {
        skinSlider(sliderEl);
    }
    sliderEl.__isContinuous = true;

    sliderEl.min = -180;
    sliderEl.max = 180;

    let isDragging = false;
    let startX = 0;
    let startValue = 0;
    const sensitivity = 2.0;

    const syncUI = (newValue) => {
        const value = Math.round(newValue);
        stateUpdater(value);
        inputEl.value = value;
        sliderEl.value = (value % 360 + 540) % 360 - 180;
        const loop = Math.floor((value + 180) / 360);
        const baseText = translations[state.language]?.rotation || 'Rotation';
        labelEl.textContent = loop === 0 ? baseText : `${baseText} (${loop > 0 ? '+' : ''}${loop})`;
        requestRedraw();
    };

    const handleDragStart = (clientX) => {
        isDragging = true;
        startX = clientX;
        startValue = getValue();
        document.body.style.cursor = 'ew-resize';
        const hitEl = sliderEl.__sliderSkin?.thumb || sliderEl;
        hitEl.classList.add('grabbing');
        document.body.classList.add('grabbing');
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleDragEnd);
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleDragEnd);
    };

    const handleDragMove = (clientX) => {
        if (!isDragging) return;
        const deltaX = clientX - startX;
        const newValue = startValue + (deltaX / sensitivity);
        syncUI(newValue);
    };

    const handleDragEnd = () => {
        isDragging = false;
        document.body.style.cursor = 'default';
        const hitEl = sliderEl.__sliderSkin?.thumb || sliderEl;
        hitEl.classList.remove('grabbing');
        document.body.classList.remove('grabbing');
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleDragEnd);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleDragEnd);
    };

    const handleMouseDown = (e) => handleDragStart(e.clientX);
    const handleMouseMove = (e) => handleDragMove(e.clientX);
    const handleTouchStart = (e) => { e.preventDefault(); handleDragStart(e.touches[0].clientX); };
    const handleTouchMove = (e) => { e.preventDefault(); handleDragMove(e.touches[0].clientX); };

    const updateFromInput = () => syncUI(parseFloat(inputEl.value) || 0);

    const hitEl = sliderEl.__sliderSkin?.thumb || sliderEl;
    hitEl.addEventListener('mousedown', handleMouseDown);
    hitEl.addEventListener('touchstart', handleTouchStart, { passive: false });
    inputEl.addEventListener('change', updateFromInput);
    inputEl.addEventListener('wheel', (e) => {
        e.preventDefault();
        const step = e.deltaY < 0 ? 1 : -1;
        const currentValue = parseFloat(inputEl.value) || 0;
        syncUI(currentValue + step);
    });

    syncUI(getValue());
}

export function syncSliderAndInput(sliderId, inputId, stateUpdater) {
    const slider = document.getElementById(sliderId);
    const input = document.getElementById(inputId);
    if (!slider || !input) return;

    function updateValue(value, trigger) {
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        const step = parseFloat(slider.step) || 1;
        const decimalPlaces = (String(step).split('.')[1] || []).length;
        let valueToUpdate = parseFloat(value);
        let clampedValue = Math.max(min, Math.min(max, valueToUpdate || 0));

        if (trigger !== 'slider') slider.value = clampedValue;
        if (trigger !== 'input') input.value = clampedValue.toFixed(decimalPlaces);

        stateUpdater(clampedValue);
        requestRedraw();
    }

    slider.addEventListener('input', (e) => updateValue(e.target.value, 'slider'));
    input.addEventListener('change', (e) => updateValue(e.target.value, 'input'));
    input.addEventListener('wheel', (e) => {
        e.preventDefault();
        const step = parseFloat(input.step) || 1;
        const direction = e.deltaY < 0 ? 1 : -1;
        const newValue = parseFloat(input.value) + (direction * step);
        input.value = newValue;
        updateValue(newValue, 'input');
    });
}

export function syncInputOnly(inputId, stateUpdater) {
    const input = document.getElementById(inputId);
    if (!input) return;
    function updateValue(value) {
        const min = parseFloat(input.min) || -Infinity;
        const max = parseFloat(input.max) || Infinity;
        let clampedValue = Math.max(min, Math.min(max, parseFloat(value) || 0));
        input.value = clampedValue;
        stateUpdater(clampedValue);
        requestRedraw();
    }
    input.addEventListener('change', (e) => updateValue(e.target.value));
    input.addEventListener('wheel', (e) => {
        e.preventDefault();
        const step = parseFloat(input.step) || 1;
        const direction = e.deltaY < 0 ? 1 : -1;
        const newValue = parseFloat(input.value) + (direction * step);
        input.value = newValue;
        updateValue(newValue);
    });
}

let notificationTimeout;
export function showTopNotification(messageKey, duration = 3000) {
    const topNotificationPopup = document.getElementById('top-notification-popup');
    const topNotificationMessage = document.getElementById('top-notification-message');
    if (!topNotificationPopup || !topNotificationMessage) return;

    clearTimeout(notificationTimeout);
    topNotificationMessage.textContent = translations[state.language][messageKey] || messageKey;
    topNotificationPopup.classList.remove('hidden');
    setTimeout(() => topNotificationPopup.classList.add('show'), 10);
    notificationTimeout = setTimeout(() => {
        topNotificationPopup.classList.remove('show');
        setTimeout(() => topNotificationPopup.classList.add('hidden'), 300);
    }, duration);
}

export function showConfirmationPopup(titleKey, messageKey, options = {}) {
    return new Promise(resolve => {
        const confirmationTitle = document.getElementById('confirmation-title');
        const confirmationMessage = document.getElementById('confirmation-message');
        const resetImagesOption = document.getElementById('reset-images-option');
        const deleteImagesCheckbox = document.getElementById('confirm-delete-images-checkbox');
        const confirmationPopup = document.getElementById('confirmation-popup');
        const confirmContinueBtn = document.getElementById('confirm-continue-btn');
        const confirmCancelBtn = document.getElementById('confirm-cancel-btn');

        if (!confirmationPopup) { resolve({ confirmed: false, deleteImages: false }); return; }

        confirmationTitle.textContent = translations[state.language][titleKey] || titleKey;
        confirmationMessage.textContent = translations[state.language][messageKey] || messageKey;

        if (options.showDeleteImagesCheckbox) {
            resetImagesOption.style.display = 'flex';
            deleteImagesCheckbox.checked = false;
        } else {
            resetImagesOption.style.display = 'none';
        }

        confirmationPopup.classList.remove('hidden');

        const handleConfirm = () => closeAndResolve(true);
        const handleCancel = () => closeAndResolve(false);

        function closeAndResolve(isConfirmed) {
            confirmationPopup.classList.add('hidden');
            confirmContinueBtn.removeEventListener('click', handleConfirm);
            confirmCancelBtn.removeEventListener('click', handleCancel);
            const result = {
                confirmed: isConfirmed,
                deleteImages: options.showDeleteImagesCheckbox ? deleteImagesCheckbox.checked : false
            };
            resolve(result);
        }

        confirmContinueBtn.addEventListener('click', handleConfirm, { once: true });
        confirmCancelBtn.addEventListener('click', handleCancel, { once: true });
    });
}
