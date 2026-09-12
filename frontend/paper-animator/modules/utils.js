export function hexToRgba(hex, opacity) {
    let r = 0, g = 0, b = 0;
    if (hex.length === 7) {
        r = parseInt(hex.substring(1, 3), 16);
        g = parseInt(hex.substring(3, 5), 16);
        b = parseInt(hex.substring(5, 7), 16);
    }
    return `rgba(${r},${g},${b},${opacity})`;
}

export function darkenHexColor(hex, amount) {
    let [r, g, b] = hex.match(/\w\w/g).map(x => parseInt(x, 16));
    const factor = 1 - amount / 100;
    r = Math.floor(r * factor);
    g = Math.floor(g * factor);
    b = Math.floor(b * factor);
    return "#" + [r, g, b].map(x => {
        const hexVal = x.toString(16);
        return hexVal.length === 1 ? '0' + hexVal : hexVal;
    }).join('');
}

export function applyAccentColor(hexColor) {
    if (!hexColor) return;
    const hoverColor = darkenHexColor(hexColor, 15);
    document.body.style.setProperty('--accent-color', hexColor);
    document.body.style.setProperty('--accent-color-hover', hoverColor);
    const picker = document.getElementById('accent-color-picker');
    if (picker) {
        picker.value = hexColor;
    }
}

export function throttle(func, delay) {
    let inProgress = false;
    return (...args) => {
        if (inProgress) {
            return;
        }
        inProgress = true;
        setTimeout(() => {
            func(...args);
            inProgress = false;
        }, delay);
    };
}

export function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function truncateFilename(filename, maxLength = 12) {
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1) {
        return filename.length > maxLength ? filename.substring(0, maxLength) + '...' : filename;
    }
    const name = filename.substring(0, lastDotIndex);
    const ext = filename.substring(lastDotIndex);
    if (name.length > maxLength) {
        return name.substring(0, maxLength) + '...' + ext;
    }
    return filename;
}
