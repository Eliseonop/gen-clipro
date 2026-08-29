"""Modelos Pydantic: definen la forma de los datos que entran y salen de la API."""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class CropMode(str, Enum):
    """Modos de recorte a formato vertical."""
    center = "center"          # recorte centrado fijo
    smart_face = "smart_face"  # recorte fijo colocado sobre la cara (Fase 1 auto-reframe)
    split_left = "split_left"   # arriba: centro / abajo: facecam abajo-izquierda
    split_right = "split_right"  # arriba: centro / abajo: facecam abajo-derecha


class Segment(BaseModel):
    """Un tramo de alto interés detectado en el heatmap."""
    index: int
    start: float          # segundo de inicio (ya con padding aplicado)
    end: float            # segundo de fin (ya con padding aplicado)
    score: float          # intensidad máxima del heatmap en este tramo (0-1)
    duration: float
    label: Optional[str] = None
    description: Optional[str] = None


class AnalyzeRequest(BaseModel):
    url: str
    min_score: float = Field(default=0.40, ge=0.0, le=1.0)
    max_clips: int = Field(default=10, ge=1, le=50)
    max_duration: int = Field(default=60, ge=5, le=600)
    padding: int = Field(default=10, ge=0, le=60)


class VideoInfo(BaseModel):
    id: str
    title: str
    duration: float
    thumbnail: Optional[str] = None
    uploader: Optional[str] = None


class AnalyzeResponse(BaseModel):
    video: VideoInfo
    segments: list[Segment]
    has_heatmap: bool


# --- Reencuadre con keyframes (auto-tracking + corrección manual) ------

class Keyframe(BaseModel):
    """Posición del centro de la ventana de recorte en un instante.

    ``t`` es el segundo RELATIVO al inicio del clip. ``cx``/``cy`` son el
    centro en coordenadas normalizadas (0-1) respecto al fotograma fuente.
    """
    t: float
    cx: float = Field(ge=0.0, le=1.0)
    cy: float = Field(default=0.5, ge=0.0, le=1.0)
    zoom: Optional[float] = Field(default=None, ge=0.1, le=1.0)
    pan_mode: Optional[str] = None


class TrackPoint(Keyframe):
    """Un punto del tracking automático: centro + caja de la cara (normalizada)."""
    w: float = 0.0
    h: float = 0.0


class Reframe(BaseModel):
    """Animación de reencuadre aplicada a un clip.

    ``zoom`` = fracción de la altura del fotograma que ocupa la ventana 9:16
    (1.0 = altura completa → solo paneo horizontal; <1 permite mover en X e Y).
    """
    zoom: float = Field(default=1.0, ge=0.1, le=1.0)
    keyframes: list[Keyframe] = []
    pan_mode: str = "smooth"            # "smooth" | "direct"
    dual_crop: bool = False
    split_orientation: str = "vertical"  # "vertical" | "horizontal"
    zoom2: Optional[float] = None
    keyframes2: list[Keyframe] = []


class ReframePrep(BaseModel):
    """Resultado de preparar el editor: proxy + tracking + keyframes semilla."""
    proxy_url: str
    duration: float
    width: int
    height: int
    fps: float = 25.0
    track: list[TrackPoint] = []
    keyframes: list[Keyframe] = []


class ReframePrepareRequest(BaseModel):
    url: str
    start: float
    end: float
    samples: int = 0        # 0 = automático (~2/seg)


class ClipRequest(BaseModel):
    url: str
    project_id: str
    segments: list[Segment]
    crop_mode: CropMode = CropMode.center
    reframe: Optional[Reframe] = None   # solo si un único segmento y modo smart_face


class CompLayer(BaseModel):
    """Una capa de una composición: fuente + tramo + paneo + hueco en el 9:16."""
    url: str
    start: float
    end: float
    zoom: float = Field(default=1.0, ge=0.1, le=1.0)
    pan_mode: str = "smooth"
    keyframes: list[Keyframe] = []
    slot: str = "full"
    custom_rect: Optional[dict] = None
    label: Optional[str] = None
    delay: float = 0.0  # inicio en la composición (segundos)


class ComposeClipRequest(BaseModel):
    project_id: str
    layers: list[CompLayer]
    label: Optional[str] = None
    description: Optional[str] = None
    index: Optional[int] = None


class ClipInfo(BaseModel):
    index: int
    filename: str
    url: str            # ruta relativa para descargar/reproducir
    start: float
    end: float
    source_url: Optional[str] = None
    created_at: Optional[str] = None
    label: Optional[str] = None
    description: Optional[str] = None
    reframe: Optional[Reframe] = None
    transcript: Optional["Transcript"] = None   # guion del fragmento (relativo al clip)


class CreateProjectRequest(BaseModel):
    name: str
    folder: Optional[str] = None


class SetFolderRequest(BaseModel):
    path: str


# --- Transcripción (guion) ---------------------------------------------

class TranscriptSegment(BaseModel):
    start: float
    end: float
    text: str


class Transcript(BaseModel):
    id: str
    source_url: Optional[str] = None
    title: Optional[str] = None
    model: str
    language: Optional[str] = None
    duration: Optional[float] = None
    created_at: Optional[str] = None
    file: Optional[str] = None         # ruta del .txt guardado en disco
    segments: list[TranscriptSegment] = []


class TranscribeRequest(BaseModel):
    url: str
    project_id: str
    model: str = "base"           # tiny | base | small | medium | large-v3
    language: Optional[str] = None  # None = autodetectar


# --- Audio / narrador (TTS) --------------------------------------------

class AudioInfo(BaseModel):
    id: str
    filename: str
    url: str
    voice: str
    voice2: Optional[str] = None
    blend: Optional[float] = None
    speed: float = 1.0
    pause: Optional[float] = None
    text: Optional[str] = None
    duration: Optional[float] = None
    created_at: Optional[str] = None
    engine: Optional[str] = None       # "kokoro" | "piper"
    label: Optional[str] = None
    description: Optional[str] = None


class TTSRequest(BaseModel):
    project_id: str
    text: str
    engine: str = "kokoro"             # "kokoro" | "piper"
    voice: str = "ef_dora"
    voice2: Optional[str] = None       # voz secundaria para mezclar (más natural/variado)
    blend: float = 0.5                 # peso de la voz principal (0-1)
    speed: float = 1.0
    pause: float = 0.4                 # pausa (s) entre frases/párrafos
    name: Optional[str] = None


class UpdateMaterialRequest(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None


class ClipTranscribeRequest(BaseModel):
    model: str = "base"
    language: Optional[str] = None


# --- Editor de vídeo (timeline multipista) -----------------------------

class TimelineTrack(BaseModel):
    """Una pista del editor (V1, V2… / A1, A2…)."""
    id: str
    kind: str                     # "video" | "audio"
    name: str
    hidden: bool = False
    muted: bool = False
    locked: bool = False


class TimelineClip(BaseModel):
    """Un elemento colocado en una pista de la timeline.

    ``start`` es la posición en la timeline (s). El fragmento usado del material
    es ``[in_point, out_point]`` del archivo fuente; su duración en la timeline
    es ``out_point - in_point``. Los keyframes de ``reframe`` son relativos al
    inicio del material fuente (0..source_duration).
    """
    id: str
    track_id: str
    kind: str                     # "video" | "audio"
    asset_kind: str               # "clips" | "audios"
    asset_id: str                 # index del clip o id del audio (como texto)
    filename: str
    name: Optional[str] = None
    start: float = 0.0
    in_point: float = 0.0
    out_point: float = 0.0
    source_duration: float = 0.0
    volume: float = 1.0
    reframe: Optional[Reframe] = None
    text: Optional[str] = None            # contenido (clips de tipo "text")
    style: Optional[dict] = None          # estilo del texto (fuente, color, borde…)


class Timeline(BaseModel):
    version: int = 1
    fps: int = 30
    width: int = 720               # tamaño de salida (formato configurable)
    height: int = 1280
    audio_target_db: float = -14.0  # nivel objetivo LUFS para el render final
    tracks: list[TimelineTrack] = []
    clips: list[TimelineClip] = []


class ExportRequest(BaseModel):
    timeline: Optional[Timeline] = None   # si falta, se usa la guardada en el proyecto


class Project(BaseModel):
    id: str
    name: str
    created_at: str
    folder: Optional[str] = None      # carpeta base en disco; None = por defecto
    clips: list[ClipInfo] = []
    transcripts: list[Transcript] = []
    audios: list[AudioInfo] = []
    timeline: Optional[Timeline] = None   # composición del editor de vídeo


class JobStatus(str, Enum):
    pending = "pending"
    running = "running"
    done = "done"
    error = "error"


class Job(BaseModel):
    id: str
    status: JobStatus = JobStatus.pending
    progress: float = 0.0          # 0.0 - 1.0
    message: str = "En cola…"
    clips: list[ClipInfo] = []
    transcript: Optional["Transcript"] = None
    audio: Optional["AudioInfo"] = None
    reframe_prep: Optional["ReframePrep"] = None
    export_url: Optional[str] = None      # URL del vídeo final exportado
    error: Optional[str] = None
