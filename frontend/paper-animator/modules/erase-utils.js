export function parseClampedInt(raw, min, max, fallback) {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

export function paintDot(ctx2d, x, y, radius) {
    ctx2d.beginPath();
    ctx2d.arc(x, y, radius, 0, Math.PI * 2);
    ctx2d.fill();
}

// Copy source and punch a destination-out stroke. Returns a new canvas,
// or null when inputs are invalid.
export function brushErase(source, x, y, prevX, prevY, radius) {
    if (!source || !source.width || !source.height) return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (!Number.isFinite(radius) || radius <= 0) return null;

    const out = document.createElement('canvas');
    out.width = source.width;
    out.height = source.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(source, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = radius * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (Number.isFinite(prevX) && Number.isFinite(prevY)) {
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, y);
        ctx.stroke();
    }
    paintDot(ctx, x, y, radius);
    ctx.globalCompositeOperation = 'source-over';
    return out;
}

// Copy source and clear every pixel within RGB distance of the tapped
// pixel. Returns a new canvas, or null when inputs are invalid.
export function colorErase(source, x, y, tolerance) {
    if (!source || !source.width || !source.height) return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    const out = document.createElement('canvas');
    out.width = source.width;
    out.height = source.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(source, 0, 0);

    const ix = Math.floor(Math.max(0, Math.min(source.width - 1, x)));
    const iy = Math.floor(Math.max(0, Math.min(source.height - 1, y)));
    const imageData = ctx.getImageData(0, 0, source.width, source.height);
    const data = imageData.data;
    const pixelIndex = (iy * source.width + ix) * 4;
    const targetR = data[pixelIndex];
    const targetG = data[pixelIndex + 1];
    const targetB = data[pixelIndex + 2];

    for (let i = 0; i < data.length; i += 4) {
        const dr = data[i] - targetR;
        const dg = data[i + 1] - targetG;
        const db = data[i + 2] - targetB;
        const distance = Math.sqrt(dr * dr + dg * dg + db * db);
        if (distance <= tolerance) {
            data[i + 3] = 0;
        }
    }
    ctx.putImageData(imageData, 0, 0);
    return out;
}
