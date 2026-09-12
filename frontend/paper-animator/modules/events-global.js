import { applyAccentColor } from './utils.js';
import {
    state, savePreferences, resetPreferences, resetMainSettings, resetSectionSettings
} from './state.js';
import { resizeAndRedrawAll, requestRedraw, setIsCacheGenerationNeeded, invalidateCanvasPaddingCache, updateCanvasDisplaySize } from './renderer.js';
import { skinSlider, showConfirmationPopup } from './ui-controls.js';
import {
    showTab, animateCanvasResize, togglePanel, syncDisplayModeUI,
    syncUISizeUI, applyUISize, autoAdjustMobileLayout, desktopPanelResizer
} from './layout.js';
import { startExport, updateExportFormatUI } from './exportBridge.js';
import { updateUIFromState } from './ui-sync.js';
import { disableEraser } from './eraser.js';

export function initGlobalEventListeners() {
    const panelHandle = document.getElementById('panel-handle');
    const panelWrapper = document.getElementById('settings-panel-wrapper');
    const body = document.body;
    const topNotificationPopup = document.getElementById('top-notification-popup');
    const topNotificationCloseBtn = topNotificationPopup ? topNotificationPopup.querySelector('.close-btn') : null;

    let pendingWindowResize = false;
    window.addEventListener('resize', () => {
        // coalesce resize bursts to one frame
        if (pendingWindowResize) return;
        pendingWindowResize = true;
        requestAnimationFrame(() => {
            pendingWindowResize = false;
            let alreadyResized = false;
            if (state.displayMode === 'auto') {
                const newSize = window.innerWidth < 1280 ? 'compact' : 'normal';
                if (newSize !== state.uiSize) {
                    // applyUISize already resizes + invalidates + saves.
                    applyUISize(newSize);
                    alreadyResized = true;
                }
            }
            if (!alreadyResized) {
                invalidateCanvasPaddingCache();
                resizeAndRedrawAll();
            }
        });
    });

    const prevResBtns = document.getElementById('preview-resolution-btns');
    if (prevResBtns) {
        prevResBtns.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (button && button.dataset.res) {
                state.previewResolution = button.dataset.res;
                updateUIFromState();
                resizeAndRedrawAll();
                savePreferences();
            }
        });
    }

    const canvasResBtns = document.getElementById('canvas-resolution-btns');
    if (canvasResBtns) {
        canvasResBtns.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (button && button.dataset.res) {
                state.canvasDisplayResolution = parseInt(button.dataset.res);
                updateUIFromState();
            }
        });
    }


    const debugSwitch = document.getElementById('debug-screen-switch');
    if (debugSwitch) {
        debugSwitch.addEventListener('change', (e) => {
            state.debugScreenEnabled = e.target.checked;
            updateUIFromState();
        });
    }

    if (panelHandle) panelHandle.addEventListener('click', togglePanel);

    const mobExportBtn = document.getElementById('mobile-export-btn');
    if (mobExportBtn) {
        mobExportBtn.addEventListener('click', () => {
            document.getElementById('export-settings-popup').classList.remove('hidden');
            updateUIFromState();
        });
    }

    window.addEventListener('popstate', (event) => {
        if (!event.state || event.state.panel !== 'open') {
            if (panelWrapper) panelWrapper.classList.remove('panel-open');
            body.classList.remove('desktop-panel-open');
            animateCanvasResize();
        }
    });

    ['handle-background', 'handle-object', 'handle-animasi', 'handle-info'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', () => showTab(id.split('-')[1]));
    });
    document.querySelectorAll('.mobile-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            showTab(btn.dataset.tab);
        });
    });

    document.querySelectorAll('.reset-all-btn').forEach(button => {
        button.addEventListener('click', async () => {
            const { confirmed, deleteImages } = await showConfirmationPopup(
                "confirmResetTitle",
                "confirmResetMessage",
                { showDeleteImagesCheckbox: true }
            );
            if (confirmed) {
                resetMainSettings(deleteImages, { updateUIFromState, resizeAndRedrawAll, disableEraser });
            }
        });
    });

    const resetPrefsBtn = document.getElementById('reset-preferences-btn');
    if (resetPrefsBtn) {
        resetPrefsBtn.addEventListener('click', async () => {
            const { confirmed } = await showConfirmationPopup(
                "confirmResetPrefsTitle",
                "confirmResetPrefsMessage"
            );
            if (confirmed) {
                resetPreferences({ syncDisplayModeUI, syncUISizeUI, updateUIFromState, autoAdjustMobileLayout });
            }
        });
    }

    const expBtnHeader = document.getElementById('export-video-btn-header');
    if (expBtnHeader) {
        expBtnHeader.addEventListener('click', () => {
            document.getElementById('export-settings-popup').classList.remove('hidden');
            updateUIFromState();
        });
    }
    const cancelExpBtn = document.getElementById('cancel-export-settings-btn');
    if (cancelExpBtn) cancelExpBtn.addEventListener('click', () => document.getElementById('export-settings-popup').classList.add('hidden'));

    const startExpBtn = document.getElementById('start-export-with-settings-btn');
    if (startExpBtn) startExpBtn.addEventListener('click', startExport);

    const licenseBtn = document.getElementById('license-btn');
    if (licenseBtn) licenseBtn.addEventListener('click', () => document.getElementById('license-popup').classList.remove('hidden'));
    const closeLicenseBtn = document.getElementById('close-license-popup');
    if (closeLicenseBtn) closeLicenseBtn.addEventListener('click', () => document.getElementById('license-popup').classList.add('hidden'));
    const licensePopup = document.getElementById('license-popup');
    if (licensePopup) {
        licensePopup.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                licensePopup.classList.add('hidden');
            }
        });
    }

    const fpsSelect = document.getElementById('export-fps-select');
    if (fpsSelect) {
        fpsSelect.addEventListener('change', (e) => {
            state.export.fps = parseInt(e.target.value);
        });
    }

    const exportDurInput = document.getElementById('export-duration-input');
    if (exportDurInput) {
        exportDurInput.addEventListener('change', (e) => {
            const val = parseInt(e.target.value, 10);
            const min = parseInt(e.target.min, 10);
            const max = parseInt(e.target.max, 10);
            state.export.duration = Math.max(min, Math.min(max, val || 1));
            e.target.value = state.export.duration;
        });
    }

    const exportFnInput = document.getElementById('export-filename-input');
    if (exportFnInput) {
        exportFnInput.addEventListener('input', (e) => {
            state.export.filename = e.target.value.trim();
        });
    }

    const exportFmtSelect = document.getElementById('export-format-select');
    if (exportFmtSelect) {
        exportFmtSelect.addEventListener('change', (e) => {
            const format = e.target.value;
            state.export.format = format;
            updateExportFormatUI(format);
        });
    }

    const jpgQualitySlider = document.getElementById('jpg-quality-slider');
    if (jpgQualitySlider) {
        jpgQualitySlider.addEventListener('input', (e) => {
            const quality = parseInt(e.target.value);
            state.export.jpgQuality = quality;
            const valEl = document.getElementById('jpg-quality-value');
            if (valEl) valEl.textContent = quality + '%';
        });
    }

    const transparentBgCb = document.getElementById('transparent-background-checkbox');
    if (transparentBgCb) {
        transparentBgCb.addEventListener('change', (e) => {
            state.export.transparentBackground = e.target.checked;
        });
    }

    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.closest('.switch') || e.target.closest('.reset-section-btn') || e.target.closest('.eraser-reset-btn')) return;
            const section = header.parentElement;
            if (section.classList.contains('controls-disabled-for-bg') && !section.id.includes('color-correction') && !section.id.includes('vignette')) {
                e.stopPropagation();
                return;
            }
            if (section.closest('#image-specific-controls')?.classList.contains('is-disabled')) {
                e.stopPropagation();
                return;
            }
            section.classList.toggle('accordion-open');
            const bodyEl = section.querySelector('.accordion-body');
            if (bodyEl) bodyEl.classList.toggle('hidden', !section.classList.contains('accordion-open'));
        });
    });

    document.querySelectorAll('.info-tooltip-trigger').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    });

    const effectSwitches = [
        { switchId: 'background-color-correction-enabled-switch', stateKey: 'background.effects.colorCorrection' },
        { switchId: 'background-blur-enabled-switch', stateKey: 'background.effects.blur' },
        { switchId: 'background-vignette-enabled-switch', stateKey: 'background.effects.vignette' },
        { switchId: 'stroke-enabled-switch', stateKey: 'stroke' },
        { switchId: 'shadow-enabled-switch', stateKey: 'shadow' },
        { switchId: 'color-enabled-switch', stateKey: 'color' },
        { switchId: 'movement-enabled-switch', stateKey: 'movement' },
        { switchId: 'paper-fold-overlay-enabled-switch', stateKey: 'paperFoldOverlay' },
    ];

    effectSwitches.forEach(({ switchId, stateKey }) => {
        const switchEl = document.getElementById(switchId);
        if (switchEl) {
            switchEl.addEventListener('change', (e) => {
                const isObjectProperty = ['stroke', 'shadow', 'color', 'movement', 'paperFoldOverlay'].includes(stateKey);

                let sectionState;
                if (isObjectProperty) {
                    sectionState = state.object;
                    sectionState[stateKey].enabled = e.target.checked;
                } else {
                    const keys = stateKey.split('.');
                    sectionState = state;
                    for (let i = 0; i < keys.length - 1; i++) {
                        sectionState = sectionState[keys[i]];
                    }
                    sectionState[keys[keys.length - 1]].enabled = e.target.checked;
                }

                const section = switchEl.closest('.accordion-section');
                const bodyEl = section.querySelector('.accordion-body');

                if (e.target.checked) {
                    section.classList.add('accordion-open');
                    if (bodyEl) bodyEl.classList.remove('hidden');
                } else {
                    section.classList.remove('accordion-open');
                    if (bodyEl) bodyEl.classList.add('hidden');
                }
                updateUIFromState();
                requestRedraw();
            });
        }
    });

    document.querySelectorAll('.reset-section-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sectionKey = btn.dataset.sectionKey;
            resetSectionSettings(sectionKey, {
                setIsCacheGenerationNeeded,
                updateUIFromState,
                requestRedraw
            });
        });
    });

    const displayModeBtns = document.getElementById('display-mode-btns');
    if (displayModeBtns) {
        displayModeBtns.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (button) {
                state.displayMode = button.dataset.mode;
                if (state.displayMode === 'mobile') { applyUISize('compact'); }
                else if (state.displayMode === 'desktop') { applyUISize('normal'); }
                syncDisplayModeUI();
            }
        });
    }

    const uiSizeBtns = document.getElementById('ui-size-btns');
    if (uiSizeBtns) {
        uiSizeBtns.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (button && button.dataset.size) { applyUISize(button.dataset.size); }
        });
    }

    const langBtns = document.getElementById('language-btns');
    if (langBtns) {
        langBtns.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (button && button.dataset.lang) {
                state.language = button.dataset.lang;
                updateUIFromState();
                savePreferences();
            }
        });
    }

    if (topNotificationCloseBtn) {
        topNotificationCloseBtn.addEventListener('click', () => {
            topNotificationPopup.classList.remove('show');
        });
    }

    const accentPicker = document.getElementById('accent-color-picker');
    if (accentPicker) {
        accentPicker.addEventListener('input', (e) => {
            const newColor = e.target.value;
            state.accentColor = newColor;
            applyAccentColor(newColor);
            savePreferences();
        });
    }

    let dragOffset = 0;
    let dragFooterHeight = 0;
    let dragCanvasContainer = null;
    let pendingDragResize = false;
    const mobilePanelHeader = document.getElementById('mobile-panel-header');

    const resizerMove = (e) => {
        e.preventDefault();
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const totalHeight = window.innerHeight;
        const minHeight = totalHeight * 0.20;

        let canvasHeight = clientY - dragOffset;
        canvasHeight = Math.max(minHeight, canvasHeight);
        canvasHeight = Math.min(totalHeight - minHeight - dragFooterHeight, canvasHeight);

        const panelHeight = totalHeight - canvasHeight;

        // keep writes synchronous for instant drag
        if (dragCanvasContainer) dragCanvasContainer.style.flexBasis = `${canvasHeight}px`;
        if (panelWrapper) panelWrapper.style.flexBasis = `${panelHeight}px`;

        // coalesce mid-drag to display-size sync, full resize on stop
        if (!pendingDragResize) {
            pendingDragResize = true;
            requestAnimationFrame(() => {
                pendingDragResize = false;
                updateCanvasDisplaySize();
            });
        }
    };

    const resizerStop = () => {
        document.removeEventListener('mousemove', resizerMove);
        document.removeEventListener('touchmove', resizerMove);
        document.removeEventListener('mouseup', resizerStop);
        document.removeEventListener('touchend', resizerStop);
        body.style.userSelect = '';
        resizeAndRedrawAll();
        savePreferences();
    };

    const resizerStart = (e) => {
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        if (mobilePanelHeader) dragOffset = clientY - mobilePanelHeader.getBoundingClientRect().top;

        // cache move handler reads to avoid reflow
        const mobileFooter = document.getElementById('mobile-footer');
        dragFooterHeight = mobileFooter ? mobileFooter.offsetHeight : 0;
        dragCanvasContainer = document.getElementById('canvas-container');

        body.style.userSelect = 'none';
        document.addEventListener('mousemove', resizerMove);
        document.addEventListener('mouseup', resizerStop);
        document.addEventListener('touchmove', resizerMove, { passive: false });
        document.addEventListener('touchend', resizerStop);
    };

    if (mobilePanelHeader) {
        mobilePanelHeader.addEventListener('mousedown', resizerStart);
        mobilePanelHeader.addEventListener('touchstart', resizerStart, { passive: false });
    }

    let activeMobileTooltip = null;
    let activeMobileTooltipOverlay = null;

    const hideMobileTooltip = () => {
        if (activeMobileTooltip) {
            activeMobileTooltip.remove();
            activeMobileTooltip = null;
        }
        if (activeMobileTooltipOverlay) {
            activeMobileTooltipOverlay.remove();
            activeMobileTooltipOverlay = null;
        }
    };

    document.querySelectorAll('.info-tooltip-trigger').forEach(trigger => {
        const tooltip = trigger.querySelector('.info-tooltip');
        if (!tooltip) return;

        let hideDesktopTimeout;

        const showDesktopTooltip = () => {
            if (window.innerWidth > 480) {
                clearTimeout(hideDesktopTimeout);
                tooltip.classList.add('tooltip-visible');

                requestAnimationFrame(() => {
                    const tooltipRect = tooltip.getBoundingClientRect();
                    const viewportWidth = window.innerWidth;
                    const margin = 16;

                    const overflowLeft = tooltipRect.left < margin ? margin - tooltipRect.left : 0;
                    const overflowRight = tooltipRect.right > viewportWidth - margin ? tooltipRect.right - (viewportWidth - margin) : 0;

                    let transformStyle = 'translateX(-50%)';
                    if (overflowRight > 0) {
                        transformStyle = `translateX(calc(-50% - ${overflowRight}px))`;
                    } else if (overflowLeft > 0) {
                        transformStyle = `translateX(calc(-50% + ${overflowLeft}px))`;
                    }
                    tooltip.style.transform = transformStyle;
                });
            }
        };

        const hideDesktopTooltip = () => {
            if (window.innerWidth > 480) {
                hideDesktopTimeout = setTimeout(() => {
                    tooltip.classList.remove('tooltip-visible');
                    tooltip.style.transform = '';
                }, 200);
            }
        };

        trigger.addEventListener('mouseenter', showDesktopTooltip);
        tooltip.addEventListener('mouseenter', showDesktopTooltip);
        trigger.addEventListener('mouseleave', hideDesktopTooltip);
        tooltip.addEventListener('mouseleave', hideDesktopTooltip);

        trigger.addEventListener('click', (e) => {
            if (window.innerWidth <= 480) {
                e.stopPropagation();

                if (activeMobileTooltip) {
                    hideMobileTooltip();
                    return;
                }

                activeMobileTooltipOverlay = document.createElement('div');
                activeMobileTooltipOverlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; z-index:9998;';
                document.body.appendChild(activeMobileTooltipOverlay);
                activeMobileTooltipOverlay.addEventListener('click', hideMobileTooltip);

                activeMobileTooltip = tooltip.cloneNode(true);
                activeMobileTooltip.classList.remove('absolute', 'bottom-full', 'left-1/2', '-translate-x-1/2', 'mb-2', 'pointer-events-none');
                document.body.appendChild(activeMobileTooltip);

                const triggerRect = trigger.getBoundingClientRect();
                const tooltipHeight = activeMobileTooltip.offsetHeight;
                const margin = 12;
                const topPosition = triggerRect.top - tooltipHeight - margin;

                activeMobileTooltip.style.position = 'fixed';
                activeMobileTooltip.style.zIndex = '9999';
                activeMobileTooltip.style.visibility = 'visible';
                activeMobileTooltip.style.opacity = '1';
                activeMobileTooltip.style.pointerEvents = 'auto';
                activeMobileTooltip.style.top = `${topPosition}px`;
                activeMobileTooltip.style.left = '50%';
                activeMobileTooltip.style.transform = 'translateX(-50%)';
            }
        });
    });

    setTimeout(autoAdjustMobileLayout, 500);
    desktopPanelResizer();
    applyAccentColor(state.accentColor);
    document.querySelectorAll('input[type="range"].slider, input[type="range"]').forEach(skinSlider);
}
