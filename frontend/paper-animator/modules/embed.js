// Embed bridge: lets Paperima run inside an <iframe> as a tool of another
// editor. Activated with ?embed=1. It (1) hides the standalone-app chrome
// (Info/preferences tab, panel collapse handle, resizer), (2) receives the
// source image from the host via postMessage, and (3) hands the exported
// media Blob back to the host instead of triggering a browser download.
//
// Protocol (all messages are { source, type, ... }):
//   iframe -> host : { source:'paperima', type:'ready' }
//   host  -> iframe: { source:'paperima-host', type:'load-image',
//                      blob|dataUrl, name?, aspectRatio? }
//   iframe -> host : { source:'paperima', type:'result', blob, ext, mime, name }
//   iframe -> host : { source:'paperima', type:'cancel' }   (user closed)

import { handleImageFile } from './image-handler.js';
import { state } from './state.js';
import { updateUIText } from './translations.js';

export const IS_EMBED = new URLSearchParams(location.search).has('embed');

function post(msg) {
    try { parent.postMessage({ source: 'paperima', ...msg }, '*'); } catch (e) { /* noop */ }
}

// Exposed so the export module can redirect its output to the host.
window.__paperimaEmbed = IS_EMBED;
window.__paperimaOnExport = (blob, ext, mime, name) => {
    post({ type: 'result', blob, ext, mime, name });
};

function injectEmbedStyles() {
    const css = `
        body.paperima-embed #handle-info,
        body.paperima-embed .mobile-tab-btn[data-tab="info"],
        body.paperima-embed #panel-handle,
        body.paperima-embed #desktop-resizer { display: none !important; }
    `;
    const style = document.createElement('style');
    style.id = 'paperima-embed-styles';
    style.textContent = css;
    document.head.appendChild(style);
}

function relabel(el, text) {
    if (!el) return;
    // Drop the i18n key so the translation pass can't overwrite our label.
    el.removeAttribute('data-translate-key');
    el.textContent = text;
}

function relabelExportButtons() {
    relabel(document.getElementById('export-video-btn-header'), 'Guardar en el editor');
    relabel(document.getElementById('start-export-with-settings-btn'), 'Guardar');
}

// --- Reparto de las pestañas en paneles fijos ------------------------------
// En standalone las tres secciones (Fondo / Objeto / Animación) comparten un
// único panel lateral y se alternan por pestañas. Dentro del editor hay sitio
// de sobra alrededor del lienzo, así que las sacamos del panel y las dejamos
// las tres a la vista a la vez, cada una en su borde:
//
//   ┌──────────── header: acción principal ────────────┐
//   │ FONDO │          lienzo          │    OBJETO     │
//   ├───────┴─── ANIMACIÓN (una fila) ─┴───────────────┤
//
// Los nodos se MUEVEN (appendChild), no se clonan, para conservar los listeners
// que les pusieron events-*.js. showTab() sigue marcando .hidden en las que no
// son la pestaña activa; el CSS del tema embed lo neutraliza dentro de estos
// paneles para que las tres se vean siempre.
const PANELS = [
    { id: 'paperima-panel-left', content: 'background-tab-content', title: 'Fondo' },
    { id: 'paperima-panel-right', content: 'object-tab-content', title: 'Objeto' },
    { id: 'paperima-panel-bottom', content: 'animasi-tab-content', title: 'Animación' },
];

function makeDock(id, className) {
    const dock = document.createElement('div');
    dock.id = id;
    dock.className = className;
    document.body.appendChild(dock);
    return dock;
}

// Solo en anchos de escritorio. Por debajo de 769px el layout original (panel
// con pestañas + footer de pestañas móvil) ya funciona y estos paneles fijos no
// caben, así que no tocamos nada.
function canSplitPanels() {
    return window.matchMedia('(min-width: 769px)').matches;
}

function restructurePanels() {
    // Header: la acción principal, fuera del panel para tenerla siempre a mano.
    const header = makeDock('paperima-dock-top', 'paperima-dock');
    const brand = document.createElement('span');
    brand.className = 'paperima-brand';
    brand.textContent = 'Paper Animator';
    header.appendChild(brand);
    const exportBtn = document.getElementById('export-video-btn-header');
    if (exportBtn) header.appendChild(exportBtn);

    if (!canSplitPanels()) return;

    PANELS.forEach(({ id, content, title }) => {
        const tab = document.getElementById(content);
        if (!tab) return;
        const panel = makeDock(id, 'paperima-panel');
        const head = document.createElement('div');
        head.className = 'paperima-panel-title';
        head.textContent = title;
        panel.appendChild(head);
        panel.appendChild(tab);
    });
    document.body.classList.add('paperima-split');
}

function blobToFile(blob, name) {
    const type = blob.type || 'image/png';
    const ext = type.includes('png') ? 'png' : type.includes('jpeg') ? 'jpg'
        : type.includes('svg') ? 'svg' : type.split('/')[1] || 'png';
    return new File([blob], name || `imagen.${ext}`, { type });
}

async function loadImageFromMessage(data) {
    let blob = data.blob || null;
    if (!blob && data.dataUrl) {
        blob = await (await fetch(data.dataUrl)).blob();
    }
    if (!blob) return;
    handleImageFile(blobToFile(blob, data.name), 'object');
}

function applyAspectRatio(ratio) {
    if (!ratio) return;
    const btn = document.querySelector(`#aspect-ratio-btns button[data-ratio="${ratio}"]`);
    if (btn) btn.click();
}

// El editor anfitrión está en español, así que la herramienta también. Se
// aplica en dos pasadas porque scripts.js hace loadPreferences() en su propio
// DOMContentLoaded y podría pisar el idioma según el orden de los listeners:
// la segunda pasada, en 'load', va después de todas ellas.
function useSpanish() {
    state.language = 'es';
    updateUIText('es');
    relabelExportButtons();
}

function initEmbed() {
    document.body.classList.add('paperima-embed');
    injectEmbedStyles();
    useSpanish();
    restructurePanels();
    window.addEventListener('load', useSpanish);

    window.addEventListener('message', async (ev) => {
        const data = ev.data;
        if (!data || data.source !== 'paperima-host') return;
        if (data.type === 'load-image') {
            applyAspectRatio(data.aspectRatio);
            await loadImageFromMessage(data);
        }
    });

    // Tell the host we're ready to receive the image.
    post({ type: 'ready' });
}

if (IS_EMBED) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initEmbed);
    } else {
        initEmbed();
    }
}
