# material 🎬

Proyecto personal para gestionar tu **material de vídeo y audio** en un solo
sitio. Backend **FastAPI** + frontend **React (Vite)**.

Módulos:
- **Vídeo**: convierte los momentos más vistos ("Most Replayed" / heatmap) de un
  vídeo de YouTube en **clips verticales 9:16** para Shorts, Reels y TikTok.
- **Audio**: narrador con voz IA (TTS, Kokoro) — pega texto, elige voz, genera y descarga.
- **Proyectos** (en diseño): agrupa vídeos, clips y audios por proyecto.

> Nota: la carpeta del repo sigue llamándose `video-yt`; el nombre del producto
> es **material**. Renombrar la carpeta es opcional y se puede hacer más adelante.

## Cómo funciona

1. Pegas una URL de YouTube en la web.
2. El backend lee el heatmap del vídeo (vía `yt-dlp`, sin API key) y detecta
   los tramos de mayor interés.
3. Eliges qué tramos y el modo de recorte (centrado o split con facecam).
4. Se descarga el vídeo, se recorta cada tramo a 720x1280 con FFmpeg y se
   muestran los clips listos para descargar.

## Requisitos

- Python 3.10+ y una `venv` (ya incluida en `.venv/`)
- Node.js 18+
- FFmpeg en el PATH

## Arrancar con el botón Play de PyCharm ⭐

El proyecto incluye configuraciones listas en `.idea/runConfigurations/`:

1. Arriba a la derecha, en el selector de configuraciones, elige **`App completa`**.
2. Pulsa **▶ Play**.

Eso arranca a la vez el **backend** y el **frontend** (cada uno en su pestaña de
la consola de PyCharm). Luego abre http://localhost:5173 en el navegador.

> Si las configuraciones no aparecen la primera vez, cierra y vuelve a abrir el
> proyecto en PyCharm (las lee al abrir).
>
> La config `frontend` usa el plugin *Shell Script* (incluido en PyCharm). Si tu
> edición no lo tuviera, usa el `start.bat` de abajo.

## Arrancar sin PyCharm (doble clic)

Doble clic en **`start.bat`**. Arranca el backend y el frontend en dos ventanas
y abre el navegador en http://localhost:5173 automáticamente.
Para detener: cierra esas dos ventanas.

## Arrancar en desarrollo (manual)

**Backend** (puerto 8000):

```bash
cd backend
../.venv/Scripts/python.exe -m uvicorn app.main:app --reload
```

**Frontend** (puerto 5173):

```bash
cd frontend
npm install   # solo la primera vez
npm run dev
```

Abre http://localhost:5173

## Modos de recorte

- **Auto · sigue caras** (`smart_face`): detecta la cara con YuNet (OpenCV) a lo
  largo del tramo y coloca el recorte vertical fijo sobre ella (Fase 1 del
  auto-reframe). Si no hay cara, cae al centro. Sin movimiento todavía.
- **Centrado** (`center`): recorte central fijo.
- **Split izq./der.** (`split_left` / `split_right`): arriba el contenido,
  abajo la facecam tomada de una esquina.

> El modo `smart_face` necesita el modelo `backend/models/face_detection_yunet_2023mar.onnx`
> (~230 KB). Si falta, descárgalo del [OpenCV Zoo](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet).

## Audio (narrador TTS)

La pestaña **Audio** de un proyecto genera narración con **Kokoro** (voces
predefinidas, licencia Apache-2.0). Pegas texto (o cargas el guion), eliges voz
y velocidad, y genera un WAV en `audio/`. Necesita dos modelos en `backend/models/`:

- `kokoro-v1.0.onnx` (~310 MB) y `voices-v1.0.bin` (~27 MB), del
  [release de kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0).

Voces en español (Kokoro, acento neutro): `ef_dora`, `em_alex`, `em_santa`.

### Voces mexicanas (Piper)

Como segundo motor hay **Piper**, con voces en **español mexicano** (`es_MX`).
Se instala con un comando (descarga el binario oficial + las voces):

```
cd backend
python get_piper.py
```

Deja el binario en `backend/models/piper/` y las voces en
`backend/models/piper/voices/` (`es_MX-ald-medium`, `es_MX-claude-high`).
Reinicia el backend y elige el motor **Piper** en la pestaña Audio. Si Piper no
está instalado, la app lo indica y sigue funcionando con Kokoro.

## Estructura

```
video-yt/
├── backend/
│   ├── app/
│   │   ├── main.py       # API FastAPI (endpoints)
│   │   ├── heatmap.py    # análisis del heatmap y selección de tramos
│   │   ├── clipper.py    # descarga + recorte FFmpeg (modos de crop)
│   │   ├── jobs.py       # trabajos en segundo plano + progreso
│   │   ├── schemas.py    # modelos de datos (Pydantic)
│   │   └── config.py     # ajustes por defecto
│   ├── clips/            # clips generados (servidos como estáticos)
│   └── requirements.txt
│   ├── projects.py      # proyectos persistidos en data/projects.json
│   ├── data/            # datos de usuario (proyectos) — no versionado
│   └── clips/<id>/      # clips de cada proyecto
└── frontend/             # React + Vite
    └── src/
        ├── App.jsx       # cáscara con pestañas + estado de proyectos
        ├── ProjectsTab.jsx  # pestaña Proyectos
        ├── VideoTab.jsx     # pestaña Vídeo (heatmap → clips)
        ├── AudioTab.jsx     # pestaña Audio (en construcción)
        ├── api.js        # llamadas al backend
        ├── utils.js
        └── App.css
```

## Ideas / pendientes

- [x] Previsualizar cada tramo antes de generar (reproductor de YouTube)
- [x] Recorte inteligente Fase 1: recorte fijo colocado sobre la cara
- [x] Proyectos como panel + vista con barra lateral (Vídeo / Audio)
- [x] Transcripción de vídeo (guion con tiempos) con faster-whisper y selector de modelo
- [x] Recortador manual con línea de tiempo (rango arrastrable) + layout de escritorio a 3 columnas
- [x] Carpeta por proyecto (selector nativo), subcarpetas video/audio, nombres por título, guion en disco
- [x] Iconos de Material Design en la interfaz
- [x] Pestaña Audio: narrador TTS con Kokoro (nativo en 3.14 vía kokoro-onnx), voces ES, params guardados
- [x] Árbol de materiales en el lateral: etiquetar, describir (auto desde guion), eliminar, exportar JSON para IA
- [x] Narrador con más parámetros: mezcla de dos voces, pausas, velocidad, división por frases
- [x] Vista previa de clip: clic en un clip → reproduce el fragmento + guion sincronizado (o botón de generar)
- [ ] Auto-reframe Fase 2: paneo con seguimiento (la ventana se mueve)
- [ ] Auto-reframe Fase 2: paneo con seguimiento (la ventana se mueve)
- [ ] Subtítulos automáticos con IA (Faster-Whisper) quemados en el vídeo
- [ ] Descarga por rangos para ahorrar ancho de banda
- [ ] Historial de clips generados
- [ ] Empaquetar como app o desplegar en un servidor
```
