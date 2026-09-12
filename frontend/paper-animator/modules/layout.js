import { translations } from './translations.js';
import { state, userDesktopPanelWidth, setUserDesktopPanelWidth, savePreferences } from './state.js';
import { updateCanvasDisplaySize, resizeAndRedrawAll, requestRedraw, invalidateCanvasPaddingCache } from './renderer.js';

const tabScrollPositions = {};

export function showTab(tabName) {
    const controlsPanel = document.querySelector('.controls-panel');
    const currentActiveTab = state.activeTab;
    if (controlsPanel) {
        tabScrollPositions[currentActiveTab] = controlsPanel.scrollTop;
    }

    if (state.object.animation.isPlaying) {
        state.object.animation.previewTime = null;
    }
    const lang = state.language;
    const tabTitles = {
        background: translations[lang].tabTitleBackground,
        object: translations[lang].tabTitleObject,
        animasi: translations[lang].tabTitleAnimasi,
        info: translations[lang].tabTitleInfo
    };

    const titleText = tabTitles[tabName] || translations[lang].settings;
    const panelTitle = document.getElementById('panel-title');
    const mobileHeader = document.getElementById('mobile-panel-header');
    if (panelTitle) panelTitle.textContent = titleText;
    if (mobileHeader) mobileHeader.textContent = titleText.toUpperCase();

    document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
    document.querySelectorAll('.tab-handle').forEach(handle => handle.classList.remove('active'));
    document.querySelectorAll('.mobile-tab-btn').forEach(handle => handle.classList.remove('active'));

    const newTabContent = document.getElementById(`${tabName}-tab-content`);
    if (newTabContent) {
        newTabContent.classList.remove('hidden');
    }

    document.getElementById(`handle-${tabName}`)?.classList.add('active');
    document.querySelector(`.mobile-tab-btn[data-tab="${tabName}"]`)?.classList.add('active');
    state.activeTab = tabName;

    if (controlsPanel) {
        controlsPanel.scrollTop = tabScrollPositions[tabName] || 0;
    }
}

let smoothResizeRafId = null;
export function animateCanvasResize(duration = 310) {
    // track CSS transition per frame, updateCanvasDisplaySize is cached
    if (smoothResizeRafId) {
        cancelAnimationFrame(smoothResizeRafId);
        smoothResizeRafId = null;
    }

    const startTime = performance.now();

    function loop(currentTime) {
        const elapsedTime = currentTime - startTime;

        updateCanvasDisplaySize();
        if (elapsedTime < duration) {
            smoothResizeRafId = requestAnimationFrame(loop);
        } else {
            smoothResizeRafId = null;
        }
    }

    smoothResizeRafId = requestAnimationFrame(loop);
}

export function togglePanel() {
    const panelWrapper = document.getElementById('settings-panel-wrapper');
    const body = document.body;
    if (!panelWrapper) return;

    const isOpen = panelWrapper.classList.contains('panel-open');
    if (isOpen) {
        if (history.state && history.state.panel === 'open') {
            history.back();
        } else {
            panelWrapper.classList.remove('panel-open');
            body.classList.remove('desktop-panel-open');
        }
    } else {
        history.pushState({ panel: 'open' }, 'Panel Open');
        panelWrapper.classList.add('panel-open');
        body.classList.add('desktop-panel-open');
    }
    animateCanvasResize();
}

export function syncBackgroundTransformModeUI() {
    const isDisabled = state.background.transform.mode === 'stretch';
    ['background-size-control', 'background-offset-x-control', 'background-offset-y-control'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('is-disabled', isDisabled);
    });
    document.querySelectorAll('#background-mode-btns button').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === state.background.transform.mode));
}

export function syncDisplayModeUI() {
    const body = document.body;
    document.querySelectorAll('#display-mode-btns button').forEach(button => {
        button.classList.toggle('active', button.dataset.mode === state.displayMode);
    });
    const warningElement = document.getElementById('display-mode-warning');
    if (warningElement) {
        warningElement.classList.toggle('hidden', state.displayMode === 'auto');
    }
    body.classList.remove('force-mobile', 'force-desktop');

    if (state.displayMode === 'mobile') {
        body.classList.add('force-mobile');
    } else if (state.displayMode === 'desktop') {
        body.classList.add('force-desktop');
        if (userDesktopPanelWidth) {
            body.style.setProperty('--panel-width', `${userDesktopPanelWidth}px`);
        }
    }
    invalidateCanvasPaddingCache();
    resizeAndRedrawAll();
}

export function syncUISizeUI() {
    document.body.dataset.uiSize = state.uiSize;
    document.querySelectorAll('#ui-size-btns button').forEach(button => {
        button.classList.toggle('active', button.dataset.size === state.uiSize);
    });
    invalidateCanvasPaddingCache();
}

export function applyUISize(size) {
    state.uiSize = size;
    syncUISizeUI();
    resizeAndRedrawAll();
    savePreferences();
}

export function autoAdjustMobileLayout() {
    const body = document.body;
    const isMobile = body.classList.contains('force-mobile') || (!body.classList.contains('force-desktop') && window.matchMedia('(max-width: 768px)').matches);
    if (!isMobile) {
        return;
    }
    const canvasContainer = document.getElementById('canvas-container');
    const panelWrapper = document.getElementById('settings-panel-wrapper');
    const mobileFooter = document.getElementById('mobile-footer');
    if (!canvasContainer || !panelWrapper || !mobileFooter) return;

    const containerWidth = canvasContainer.offsetWidth;
    const containerStyle = window.getComputedStyle(canvasContainer);
    const paddingX = parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight);
    const paddingY = parseFloat(containerStyle.paddingTop) + parseFloat(containerStyle.paddingBottom);
    const canvasContentWidth = containerWidth - paddingX;
    const [aspectW, aspectH] = state.aspectRatio.split('/').map(Number);
    const requiredCanvasContentHeight = canvasContentWidth / (aspectW / aspectH);
    const requiredContainerHeight = requiredCanvasContentHeight + paddingY;
    const totalLayoutHeight = window.innerHeight - mobileFooter.offsetHeight;

    const canvasHeightPercentage = (requiredContainerHeight / totalLayoutHeight) * 100;
    const finalCanvasPercentage = Math.min(canvasHeightPercentage, 50);

    const canvasBasis = `${finalCanvasPercentage}%`;
    const panelBasis = `${100 - finalCanvasPercentage}%`;
    // skip flex-basis work when values already correct
    if (canvasContainer.style.flexBasis === canvasBasis && panelWrapper.style.flexBasis === panelBasis) {
        return;
    }

    const transitionStyle = 'flex-basis 0.5s ease-in-out';
    canvasContainer.style.transition = transitionStyle;
    panelWrapper.style.transition = transitionStyle;

    canvasContainer.style.flexBasis = canvasBasis;
    panelWrapper.style.flexBasis = panelBasis;

    setTimeout(() => {
        canvasContainer.style.transition = '';
        panelWrapper.style.transition = '';
        resizeAndRedrawAll();
    }, 500);
}

export function desktopPanelResizer() {
    const resizer = document.getElementById('desktop-resizer');
    const panelWrapper = document.getElementById('settings-panel-wrapper');
    const canvasContainer = document.getElementById('canvas-container');
    const body = document.body;

    if (!resizer || !panelWrapper || !canvasContainer) return;

    if (userDesktopPanelWidth) {
        body.style.setProperty('--panel-width', `${userDesktopPanelWidth}px`);
    }

    let pendingPanelResize = false;
    const handleMove = (e) => {
        const currentX = e.touches ? e.touches[0].clientX : e.clientX;
        const viewportWidth = window.innerWidth;
        const newPanelWidth = viewportWidth - currentX;
        const minWidth = viewportWidth * 0.20;
        const maxWidth = viewportWidth * 0.50;

        if (newPanelWidth >= minWidth && newPanelWidth <= maxWidth) {
            setUserDesktopPanelWidth(newPanelWidth);
            body.style.setProperty('--panel-width', `${newPanelWidth}px`);
            // coalesce display-size sync to one layout pass per frame
            if (!pendingPanelResize) {
                pendingPanelResize = true;
                requestAnimationFrame(() => {
                    pendingPanelResize = false;
                    updateCanvasDisplaySize();
                });
            }
            requestRedraw();
        }
    };

    const handleMouseUp = () => {
        body.classList.remove('is-resizing');
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleMove);
        document.removeEventListener('touchend', handleMouseUp);
        canvasContainer.style.transition = 'width 0.3s ease-out';
        panelWrapper.style.transition = 'transform 0.3s ease-in-out';
        savePreferences();
    };

    const handleMouseDown = (e) => {
        e.preventDefault();
        body.classList.add('is-resizing');
        panelWrapper.style.transition = 'none';
        canvasContainer.style.transition = 'none';
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    resizer.addEventListener('mousedown', handleMouseDown);

    resizer.addEventListener('touchstart', (e) => {
        handleMouseDown(e);
        document.addEventListener('touchmove', handleMove, { passive: false });
        document.addEventListener('touchend', handleMouseUp);
    }, { passive: false });
}
