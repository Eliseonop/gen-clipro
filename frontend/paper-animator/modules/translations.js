const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

export const translations = {
    // Español. Lo usa el modo embebido (src/modules/embed.js fuerza 'es'), que
    // vive dentro de un editor en español; en standalone se sigue eligiendo el
    // idioma desde Preferencias como siempre.
    'es': {
        settings: 'Ajustes', export: 'Exportar', canvas: 'Lienzo', previewAspectRatio: 'Relación de aspecto',
        canvasResolution: 'Resolución', solidBackgroundColor: 'Color de fondo sólido', backgroundImage: 'Imagen de fondo',
        dropImagePrompt: '<span class="desktop-only">Suelta la imagen aquí<br>- o -<br></span>Haz clic para importar', backgroundTransform: 'Transformar fondo',
        resetBackgroundTransformTitle: 'Restablecer transformación del fondo', backgroundMode: 'Modo de fondo', fill: 'Rellenar',
        stretch: 'Estirar', backgroundSize: 'Tamaño del fondo (%)', offsetX: 'Desplazamiento X (%)', offsetY: 'Desplazamiento Y (%)',
        backgroundColorCorrection: 'Corrección de color del fondo', resetBackgroundColorCorrectionTitle: 'Restablecer corrección de color del fondo',
        hue: 'Tono', saturation: 'Saturación', brightness: 'Brillo', colorize: 'Monocromo', backgroundBlur: 'Desenfoque del fondo',
        resetBackgroundBlurTitle: 'Restablecer desenfoque del fondo', intensity: 'Intensidad', backgroundVignette: 'Viñeta del fondo',
        resetBackgroundVignetteTitle: 'Restablecer viñeta del fondo', opacity: 'Opacidad', radius: 'Radio', feather: 'Suavizado',
        vignetteColor: 'Color de la viñeta', objectImage: 'Imagen del objeto', transform: 'Transformar', resetTransformTitle: 'Restablecer transformación',
        imageSize: 'Tamaño de la imagen (%)', tornEdges: 'Bordes rasgados', resetTornEdgesTitle: 'Restablecer bordes rasgados', thickness: 'Grosor',
        roughness: 'Aspereza', detail: 'Detalle', paperTexture: 'Textura de papel',
        resetPaperTextureTitle: 'Restablecer textura de papel', speedFps: 'Velocidad', dropShadow: 'Sombra',
        resetDropShadowTitle: 'Restablecer sombra', offset: 'Desplazamiento', blur: 'Desenfoque', color: 'Color', movement: 'Movimiento',
        resetMovementTitle: 'Restablecer movimiento', controlMode: 'Modo de control', simple: 'Simple', advanced: 'Avanzado', speed: 'Velocidad',
        strength: 'Intensidad', rotationSpeed: 'Velocidad de rotación', rotationStrength: 'Intensidad de rotación',
        positionSpeedX: 'Velocidad de posición X', positionSpeedY: 'Velocidad de posición Y', positionStrengthX: 'Intensidad de posición X',
        positionStrengthY: 'Intensidad de posición Y', colorCorrection: 'Corrección de color', resetColorCorrectionTitle: 'Restablecer corrección de color',
        language: 'Idioma', displayMode: 'Modo de pantalla', auto: 'Automático', mobile: 'Móvil (forzar)', desktop: 'Escritorio (forzar)',
        uiSize: 'Tamaño de la interfaz', compact: 'Compacto', normal: 'Normal', spacious: 'Amplio', appInfo: `Paperima v${APP_VERSION}`,
        resetAll: 'Restablecer todo', exportSettings: 'Ajustes de exportación', exportFormat: 'Formato de exportación',
        videoMp4: 'Vídeo (.mp4)', videoMov: 'Vídeo (.mov)', videoMkv: 'Vídeo (.mkv)', videoWebm: 'Vídeo (.webm)',
        imagePng: 'Imagen (.png)', imageJpg: 'Imagen (.jpg)',
        fps: 'FPS', duration: 'Duración (segundos)', transparentBackground: 'Fondo transparente',
        imageQuality: 'Calidad de imagen', fileName: 'Nombre del archivo', cancel: 'Cancelar', startExport: 'Empezar exportación',
        exportingVideo: 'Exportando vídeo…', exportingImage: 'Exportando imagen…',
        exportingVideoWait: 'Espera y no cierres esta ventana.', confirmResetTitle: 'Confirmar restablecimiento',
        confirmResetMessage: '¿Seguro que quieres restablecer todos los ajustes a sus valores por defecto?',
        deleteImportedImages: 'Borrar las imágenes importadas', continue: 'Continuar', notificationWarnUpload: 'Primero sube una imagen.',
        notificationWarnObject: 'Primero sube una imagen de objeto.',
        tabTitleBackground: 'Fondo', tabTitleObject: 'Objeto', tabTitleAnimasi: 'Animación', tabTitleInfo: 'Preferencias',
        activeObject: 'Objeto activo', animationObject: 'Animación del objeto', easing: 'Suavizado', linear: 'Lineal', easeIn: 'Entrada suave',
        easeOut: 'Salida suave', backIn: 'Retroceso al entrar', backOut: 'Retroceso al salir', instant: 'Instantáneo', easeInOut: 'Entrada y salida suaves', backInOut: 'Retroceso al entrar y salir',
        keyframeProperties: 'Propiedades del fotograma', rotation: 'Rotación', easingToNext: 'Suavizado hasta el siguiente', keyframeAnim: 'Animación de papel', animNone: 'Ninguna', animOpen: 'Abrir', animClose: 'Cerrar',
        addKeyframe: 'Añadir fotograma clave', keyframePropertiesTitle: 'Propiedades del fotograma n.º ',
        openAnim: 'Animación de papel desplegándose', closeAnim: 'Animación de papel plegándose', timeline: 'Línea de tiempo',
        Info: 'Guías', sourceCode: 'Código fuente', license: 'Licencia', supportCreator: 'Apoyar al creador', installApp: 'Instalar app', appInstalled: 'Instalada',
        licenseTitle: 'Licencia Pública General Affero de GNU v3.0',
        licenseContent: `
<div class="text-sm text-slate-300 space-y-4">
    <div>
        <h4 class="font-semibold text-slate-200 mb-2">Puedes:</h4>
        <p class="text-slate-400">Usar, modificar y distribuir este software con fines personales y comerciales.</p>
    </div>
    <div>
        <h4 class="font-semibold text-slate-200 mb-2">Debes:</h4>
        <p class="text-slate-400">Incluir una copia de la licencia y de los avisos de copyright, e indicar los cambios que hayas hecho. Toda distribución debe seguir bajo la licencia AGPLv3. Si ofreces el programa como servicio en red, tienes que facilitar su código fuente a los usuarios.</p>
    </div>
    <div>
        <h4 class="font-semibold text-slate-200 mb-2">No puedes:</h4>
        <p class="text-slate-400">Añadir sublicencias ni restricciones adicionales. Tampoco puedes responsabilizar al autor original de los problemas derivados del uso de este software.</p>
    </div>
    <div>
        <h4 class="font-semibold text-slate-200 mb-2">Contenido del usuario:</h4>
        <p class="text-slate-400">Esta licencia no se aplica al contenido que generes con el software, como imágenes o vídeos. Los derechos sobre ese contenido son enteramente tuyos y, por tanto, los riesgos o responsabilidades que se deriven de lo que crees son solo tuyos como usuario.</p>
    </div>
</div>
                `,
        licenseViewFull: 'Ver la licencia completa',
        resetPreferences: 'Restablecer preferencias', preparingExportCanvas: 'Preparando el lienzo de exportación…',
        confirmResetPrefsTitle: 'Confirmar restablecimiento de preferencias', completing: 'Finalizando',
        accentColor: 'Color de acento', previewResolution: 'Resolución de la vista previa', debugScreen: 'Pantalla de depuración',
        appDescription: 'Paperima es una aplicación web que permite añadir efectos de papel a las imágenes. Funciona sin conexión porque todo el procesado ocurre en tu dispositivo, así que tus datos no salen de él.',
        appDescription2: 'Esta aplicación la creó Nurhidayat (alias nurimator). Paperima es totalmente gratuita y de código abierto. Las donaciones ayudan mucho a mantenerla disponible para todo el mundo.',
        displayModeWarning: 'Aviso: forzar un modo de pantalla puede romper el diseño o el funcionamiento si no encaja con el tamaño de tu pantalla.',
        previewResolutionWarning: 'La resolución de la vista previa no afecta a la resolución final de la exportación.',
        dropShadowTooltip: 'Recomendamos desactivar la sombra al exportar para croma. <a href="#" target="_blank" class="text-blue-400 hover:underline">Más información</a>',
        confirmResetPrefsMessage: '¿Seguro que quieres restablecer el idioma, el modo de pantalla y el tamaño de la interfaz a sus valores por defecto?',
        infoLink: 'https://dayverse.id/en/docs/?q=paperima',
        supportLink: 'https://dayverse.id/en/donate/',
        eraser: 'Borrador', eraserMode: 'Modo de borrado', brushMode: 'Pincel', colorMode: 'Borrar por color',
        brushSize: 'Tamaño del pincel', colorTolerance: 'Tolerancia de color', resetEraserTitle: 'Restablecer borrador',
        eraserTitle: 'Activar o desactivar el borrador', eraseByColorTitle: 'Borrar por color',
        openEditor: 'Editar imagen', editImageTitle: 'Editar imagen', editApply: 'Aplicar', editCancel: 'Cancelar',
        editHintBrush: 'Arrastra sobre la imagen para borrar. El lienzo se pausa para que puedas afinar.',
        editHintColor: 'Haz clic en un color de la imagen para borrarlo en todas partes. El lienzo está pausado.',
        cropMode: 'Recortar', cropApply: 'Aplicar recorte',
        editHintCrop: 'Arrastra para seleccionar un área. Arrastra dentro para moverla y por las esquinas o los lados para redimensionarla. Doble clic para recortar.'
    },
    'en': {
        settings: 'Settings', export: 'Export', canvas: 'Canvas', previewAspectRatio: 'Aspect Ratio',
        canvasResolution: 'Resolution', solidBackgroundColor: 'Solid Background Color', backgroundImage: 'Background Image',
        dropImagePrompt: '<span class="desktop-only">Drop Image Here<br>- or -<br></span>Click to Import Image', backgroundTransform: 'Background Transform',
        resetBackgroundTransformTitle: 'Reset Background Transform', backgroundMode: 'Background Mode', fill: 'Fill',
        stretch: 'Stretch', backgroundSize: 'Background Size (%)', offsetX: 'Offset X (%)', offsetY: 'Offset Y (%)',
        backgroundColorCorrection: 'Background Color Correction', resetBackgroundColorCorrectionTitle: 'Reset Background Color Correction',
        hue: 'Hue', saturation: 'Saturation', brightness: 'Brightness', colorize: 'Monochrome', backgroundBlur: 'Background Blur',
        resetBackgroundBlurTitle: 'Reset Background Blur', intensity: 'Intensity', backgroundVignette: 'Background Vignette',
        resetBackgroundVignetteTitle: 'Reset Background Vignette', opacity: 'Opacity', radius: 'Radius', feather: 'Feather',
        vignetteColor: 'Vignette Color', objectImage: 'Object Image', transform: 'Transform', resetTransformTitle: 'Reset Transform',
        imageSize: 'Image Size (%)', tornEdges: 'Torn Edges', resetTornEdgesTitle: 'Reset Torn Edges', thickness: 'Thickness',
        roughness: 'Roughness', detail: 'Detail', paperTexture: 'Paper Texture',
        resetPaperTextureTitle: 'Reset Paper Texture', speedFps: 'Speed', dropShadow: 'Drop Shadow',
        resetDropShadowTitle: 'Reset Drop Shadow', offset: 'Offset', blur: 'Blur', color: 'Color', movement: 'Movement',
        resetMovementTitle: 'Reset Movement', controlMode: 'Control Mode', simple: 'Simple', advanced: 'Advanced', speed: 'Speed',
        strength: 'Strength', rotationSpeed: 'Rotation Speed', rotationStrength: 'Rotation Strength',
        positionSpeedX: 'Position Speed X', positionSpeedY: 'Position Speed Y', positionStrengthX: 'Position Strength X',
        positionStrengthY: 'Position Strength Y', colorCorrection: 'Color Correction', resetColorCorrectionTitle: 'Reset Color Correction',
        language: 'Language', displayMode: 'Display Mode', auto: 'Auto', mobile: 'Mobile (Force)', desktop: 'Desktop (Force)',
        uiSize: 'UI Size', compact: 'Compact', normal: 'Normal', spacious: 'Spacious', appInfo: `Paperima v${APP_VERSION}`,
        resetAll: 'Reset All', exportSettings: 'Export Settings', exportFormat: 'Export Format',
        videoWebm: 'Video (.webm)', imagePng: 'Image (.png)', imageJpg: 'Image (.jpg)',
        fps: 'FPS', duration: 'Duration (seconds)', transparentBackground: 'Transparent Background',
        imageQuality: 'Image Quality', fileName: 'File Name', cancel: 'Cancel', startExport: 'Start Export',
        exportingVideo: 'Exporting Video...', exportingImage: 'Exporting Image...',
        exportingVideoWait: 'Please wait and do not close this window.', confirmResetTitle: 'Confirm Reset',
        confirmResetMessage: 'Are you sure you want to reset all settings to their default values?',
        deleteImportedImages: 'Delete imported images', continue: 'Continue', notificationWarnUpload: 'Please upload an image first!',
        notificationWarnObject: 'Please upload an object image first!',
        tabTitleBackground: 'Background Settings', tabTitleObject: 'Object Settings', tabTitleAnimasi: 'Animation Settings', tabTitleInfo: 'Preferences',
        activeObject: 'Active Object', animationObject: 'Object Animation', easing: 'Easing', linear: 'Linear', easeIn: 'Ease In',
        easeOut: 'Ease Out', backIn: 'Back In', backOut: 'Back Out', instant: 'Instant', easeInOut: 'Ease In Out', backInOut: 'Back In Out',
        keyframeProperties: 'Keyframe Properties', rotation: 'Rotation', easingToNext: 'Easing to Next', keyframeAnim: 'Paper Animation', animNone: 'None', animOpen: 'Open', animClose: 'Close',
        addKeyframe: 'Add Keyframe', keyframePropertiesTitle: 'Keyframe Properties #',
        openAnim: 'Paper Unfolding Animation', closeAnim: 'Paper Folding Animation', timeline: 'Timeline',
        Info: 'Guides', sourceCode: 'Source Code', license: 'License', supportCreator: 'Support Creator', installApp: 'Install App', appInstalled: 'Installed',
        licenseTitle: 'GNU Affero General Public License v3.0',
        licenseContent: `
<div class="text-sm text-slate-300 space-y-4">
    <div>
        <h4 class="font-semibold text-slate-200 mb-2">You May:</h4>
        <p class="text-slate-400">You may use, modify, and distribute this software for both personal and commercial purposes.</p>
    </div>
    <div>
        <h4 class="font-semibold text-slate-200 mb-2">You Must:</h4>
        <p class="text-slate-400">You must include a copy of the license and copyright notices, and state any changes you have made. Any distribution must remain under the AGPLv3 license. If you provide the program as a network service, you are required to provide its source code to users.</p>
    </div>
    <div>
        <h4 class="font-semibold text-slate-200 mb-2">You May Not:</h4>
        <p class="text-slate-400">You may not add sublicenses or additional restrictions. You also cannot hold the original author liable for any issues arising from the use of this software.</p>
    </div>
    <div>
        <h4 class="font-semibold text-slate-200 mb-2">User Content:</h4>
        <p class="text-slate-400">This license does not apply to content you generate using the software, such as images or videos. The full rights to such content belong to you. Therefore, any risks or liabilities arising from the content you create are your sole responsibility as the user.</p>
    </div>
</div>
                `,
        licenseViewFull: 'View Full License',
        resetPreferences: 'Reset Preferences', preparingExportCanvas: 'Preparing export canvas...',
        confirmResetPrefsTitle: 'Confirm Preferences Reset', completing: 'Completing',
        accentColor: 'Accent Color', previewResolution: 'Preview Resolution', debugScreen: 'Debug Screen',
        appDescription: 'Paperima is a web-based application that allows users to add paper effects to images. Users can access and use this application offline because all processing is done directly on their device, ensuring user data remains secure.',
        appDescription2: 'This application was created by Nurhidayat (a.k.a. nurimator). Paperima is completely free and open source. Donations are very helpful to keep the app available for everyone.',
        displayModeWarning: 'Warning: Forcing a display mode may break layout or functionality if it doesn\'t match your screen size.',
        previewResolutionWarning: 'Preview resolution does not affect the final export resolution.',
        dropShadowTooltip: 'We recommend turning off drop shadow when exporting for a greenscreen. <a href="#" target="_blank" class="text-blue-400 hover:underline">Learn more</a>',
        confirmResetPrefsMessage: 'Are you sure you want to reset language, display mode, and UI size to their defaults?',
        infoLink: 'https://dayverse.id/en/docs/?q=paperima',
        supportLink: 'https://dayverse.id/en/donate/',
        eraser: 'Eraser', eraserMode: 'Eraser Mode', brushMode: 'Brush', colorMode: 'Erase by Color',
        brushSize: 'Brush Size', colorTolerance: 'Color Tolerance', resetEraserTitle: 'Reset Eraser',
        eraserTitle: 'Toggle eraser', eraseByColorTitle: 'Erase by color',
        openEditor: 'Edit Image', editImageTitle: 'Edit Image', editApply: 'Apply', editCancel: 'Cancel',
        editHintBrush: 'Drag on the image to erase. The canvas is paused for precise editing.',
        editHintColor: 'Click a color on the image to erase it everywhere. The canvas is paused.',
        cropMode: 'Crop', cropApply: 'Apply crop',
        editHintCrop: 'Drag to select an area. Drag inside to move, corners or edges to resize. Double-click to crop.'
    },
};

export function updateUIText(lang) {
    const translationMap = translations[lang] || translations['en'];
    document.querySelectorAll('[data-translate-key]').forEach(el => {
        const key = el.dataset.translateKey;
        if (translationMap[key]) {
            if (key === 'dropImagePrompt' || key === 'appDescription2' || key === 'dropShadowTooltip' || key === 'licenseContent') {
                el.innerHTML = translationMap[key];
            } else {
                el.textContent = translationMap[key];
            }
        }
    });
    document.querySelectorAll('[data-translate-key-title]').forEach(el => {
        const key = el.dataset.translateKeyTitle;
        if (translationMap[key]) {
            el.title = translationMap[key];
        }
    });

    document.querySelectorAll('option[data-translate-key]').forEach(option => {
        const key = option.dataset.translateKey;
        if (translationMap[key]) {
            option.textContent = translationMap[key];
        }
    });
}
