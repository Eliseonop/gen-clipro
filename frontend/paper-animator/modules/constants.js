export const overlayImageUrls = [
    './assets/texture/paper_overlay_0.webp',
    './assets/texture/paper_overlay_1.webp',
    './assets/texture/paper_overlay_2.webp',
    './assets/texture/paper_overlay_3.webp'
];

export const MASK_IMAGE_URLS = [
    './assets/texture/paper_mask_0.webp',
    './assets/texture/paper_mask_1.webp',
    './assets/texture/paper_mask_2.webp',
    './assets/texture/paper_mask_3.webp',
    './assets/texture/paper_mask_4.webp',
    './assets/texture/paper_mask_5.webp'
];

export const LAYER_IMAGE_URLS = [
    './assets/texture/paper_fold_0.webp',
    './assets/texture/paper_fold_1.webp',
    './assets/texture/paper_fold_2.webp',
    './assets/texture/paper_fold_3.webp',
    './assets/texture/paper_fold_4.webp',
    './assets/texture/paper_fold_5.webp'
];

export const DEFAULT_OBJECT_STATE = {
    image: { element: null, originalElement: null, uneditedElement: null, cropFrac: null, size: 80, offset: { x: 0, y: 0 }, rotation: 0, file: null, isSVG: false, originalSVGSrc: null },
    stroke: { enabled: true, width: 25, roughness: 25, detail: 0.020, seed: 0 },
    shadow: { enabled: true, offsetX: 5, offsetY: -5, blur: 5, color: '#000000', opacity: 50 },
    color: { enabled: false, hue: 0, saturation: 0, brightness: 0, colorize: false },
    movement: {
        enabled: true,
        mode: 'simpel',
        simpelSpeed: 1,
        simpelStrength: 1,
        rotationSpeed: 4,
        rotationStrength: 0.5,
        positionSpeed: { x: 2, y: 4 },
        positionStrength: { x: 1, y: 5 },
        lastRotationUpdateTime: 0,
        lastPositionUpdateTime: { x: 0, y: 0 },
        rotation: 0,
        positionOffset: { x: 0, y: 0 }
    },
    paperFoldOverlay: {
        enabled: true,
        currentImageIndex: 0,
        opacity: 75,
        speed: 4,
        blendMode: 'multiply',
        lastImageSwitchTime: 0
    },
    eraser: {
        enabled: false,
        mode: 'brush',
        brushSize: 20,
        colorTolerance: 32,
        dirty: false
    },
    animation: {
        mode: 'simple',
        simple: {
            open: false,
            close: false
        },
        isPlaying: true,
        activeKeyframeId: null,
        previewTime: null,
        keyframes: [
            {
                id: Date.now(),
                time: 0,
                x: 0,
                y: 0,
                scale: 50,
                rotation: 0,
                easing: 'linear',
                paperAnim: 'none'
            },
            {
                id: Date.now() + 1,
                time: 1,
                x: 0,
                y: 0,
                scale: 80,
                rotation: 0,
                easing: 'linear',
                paperAnim: 'none'
            }
        ]
    }
};

export const DEFAULT_STATE = {
    activeTab: 'object',
    language: 'en',
    displayMode: 'auto',
    uiSize: 'normal',
    previewResolution: '540',
    accentColor: '#3b82f6',
    debugScreenEnabled: false,
    background: {
        element: null, color: '#00ff00', file: null,
        transform: { enabled: true, mode: 'fill', size: 100, rotation: 0, offset: { x: 0, y: 0 } },
        effects: {
            colorCorrection: { enabled: false, hue: 0, saturation: 0, brightness: 0, colorize: false },
            blur: { enabled: false, intensity: 10 },
            vignette: { enabled: false, opacity: 100, radius: 50, feather: 100, color: '#000000' }
        }
    },
    aspectRatio: '16/9',
    canvasDisplayResolution: 720,
    export: {
        duration: 5, fps: 24, filename: 'paperima', format: 'mp4', jpgQuality: 95, transparentBackground: true
    },
    object: JSON.parse(JSON.stringify(DEFAULT_OBJECT_STATE))
};

export const RESOLUTION_MAPS = {
    '360': { '16/9': { w: 640, h: 360 }, '9/16': { w: 360, h: 640 }, '4/3': { w: 480, h: 360 }, '3/4': { w: 360, h: 480 }, '1/1': { w: 360, h: 360 } },
    '540': { '16/9': { w: 960, h: 540 }, '9/16': { w: 540, h: 960 }, '4/3': { w: 720, h: 540 }, '3/4': { w: 540, h: 720 }, '1/1': { w: 540, h: 540 } },
    '720': { '16/9': { w: 1280, h: 720 }, '9/16': { w: 720, h: 1280 }, '4/3': { w: 960, h: 720 }, '3/4': { w: 720, h: 960 }, '1/1': { w: 720, h: 720 } },
    '1080': { '16/9': { w: 1920, h: 1080 }, '9/16': { w: 1080, h: 1920 }, '4/3': { w: 1440, h: 1080 }, '3/4': { w: 1080, h: 1440 }, '1/1': { w: 1080, h: 1080 } },
    '1440': { '16/9': { w: 2560, h: 1440 }, '9/16': { w: 1440, h: 2560 }, '4/3': { w: 1920, h: 1440 }, '3/4': { w: 1440, h: 1920 }, '1/1': { w: 1440, h: 1440 } }
};

export const EASING = {
    linear: t => t,
    easeIn: t => t * t,
    easeOut: t => t * (2 - t),
    easeInOut: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    backIn: t => {
        const s = 1.70158;
        return t * t * ((s + 1) * t - s);
    },
    backOut: t => {
        const s = 1.70158;
        return (t = t - 1) * t * ((s + 1) * t + s) + 1;
    },
    backInOut: t => {
        const s = 1.70158 * 1.525;
        if ((t /= 0.5) < 1) return 0.5 * (t * t * (((s) + 1) * t - s));
        return 0.5 * ((t -= 2) * t * (((s) + 1) * t + s) + 2);
    }
};

export const PREFERENCES_KEY = 'paperaMeUserPreferences';
