# Graph Report - video-yt  (2026-09-12)

## Corpus Check
- 52 files · ~267,242 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5122 nodes · 11644 edges · 245 communities (192 shown, 52 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 530 edges (avg confidence: 0.89)
- Token cost: 10,496 input · 2,582 output

## Community Hubs (Navigation)
- Editor Model Tests
- FastAPI Main & Jobs API
- Heatmap Analysis & Schemas
- VideoEditor Layout & Masks
- MCP Server Core & Registry
- Clip Masks & Keyframes (backend)
- Background Removal UI
- Jobs & Clip Download
- Timeline Ops Core
- Frontend API Client & Hooks
- FFmpeg Compose & Render
- Material Tab Components
- Storage & YouTube Audio
- Clip Keyframes (frontend)
- Shapes Geometry
- Clip Masks (frontend)
- Timeline Ops Tests
- Clip Stacking
- Clip FX FFmpeg Chain
- MCP Edit Tools
- Background Matte Service
- MCP Audit & AI Agent
- Media Search & Asset Import
- Transcript Fragmentation
- Clip Layout Tests
- Media Library
- GSAP Vendor Bundle A
- Explore Tab
- Canvas Interactions & Layout
- FFmpeg Command & Matte Alignment
- Timeline Crops & Keyframe UI
- Timeline Migrations Tests
- App Shell & Icons
- Canvas Composite Render
- ASS Subtitle Builder
- Clip Mask Tests
- Shapes (backend)
- GPU Probe
- MCP DTO & Read Tools
- Recipe Layout (backend)
- SFX Tool Tests
- Property Ops Tests
- Material Tab Interactions
- Paper Model & Editor History
- AI Agent Tests
- Projects Store
- Motion Validation Tests
- Settings UI
- Paper Image Crop & Erase
- Clip Motion Builder
- ASS Style Overrides
- Timeline Scale & FPS
- Panning & Recipe Layout
- SAM Config & Timeline Store
- SFX Library
- Effects Inspector UI
- Paper Canvas Renderer
- Motion Service & Validator
- MCP Capabilities & TTS
- Frontend Build Config
- Motion Composition Hook
- Clipper Pipeline
- Image Import & Probing
- MCP Media & Render Tools
- Timeline UI & Alignment
- SFX Classify Modal
- Clip Kind Helpers
- Export Preview Parity
- Background Export Tests
- GPU Selection Tests
- Panel Layout
- Image Paste & Add Modal
- Paper Animator Model
- Clip FX (frontend)
- Clip Speed
- Karaoke Text FX
- MCP Motion Tools
- Motion Models & Templates
- Favorites
- Face Detect & Reframe
- Overlay Export Filters
- App Settings
- Background Ops Tests
- Background Cache Tests
- Gemini TTS Tests
- Transform & Mask Inspector
- Keyframe Editing Handlers
- AI Provider Run Loop
- GSAP Vendor Bundle B
- Reframe Proxy
- AI Provider Selection Tests
- MCP Capabilities Tests
- Audio Tab & Export Hooks
- Clip Background Model
- Explore Keyword Suggestions
- Matte Build Tests
- Clipper Filter Tests
- MCP Edit Tool Tests
- Multi API Key Store
- MCP Edit E45 Tests
- Text Styles Render
- AI Provider Config
- Compose Clip Filter Graph
- Timeline History & Undo
- Motion Runtime JS
- GSAP Tween Core
- Shorts Builder
- AI Conversations Store
- Clip Layout (backend)
- Whisper Transcription
- Settings Persistence & YT History
- yt-dlp Wrapper
- Background Endpoints Tests
- Clip Background Tests
- Derive Matte Tests
- Clip Motion Tests
- Text Styles Draw
- Clip Animation Pose
- ONNX Matte Provider
- Provider Registry Tests
- Clip Background Matte Spec
- HyperFrames Renderer
- Reframe Math
- Word Shaping Tests
- yt-dlp Auth Tests
- Popover & Select Components
- Background Provider Interface
- Piper TTS
- MCP Audio Tests
- MCP Audit Tests
- Timeline History Tests
- MCP Layered Discovery Design
- Workflow-as-Job Design
- Subtitle Themes UI
- Background Normalization
- Matte Derivation & LUT
- SFX Favorites Filter
- Chroma Key Parity Tests
- Timeline Store Tests
- Align Guides
- SAM 2.1 Provider
- Compose Slot Layout
- Diagnostics Probe
- Export Settings
- Gemini TTS
- TTS Engines
- Effective Text Style
- Background Composition Tests
- Background Integration Tests
- Clip Mask Tests (149)
- MCP DTO Tests
- MCP Registry Tests
- Timeline Ops Design Notes
- MCP Usage Docs
- Paper Timeline Bridge
- Gemini AI Provider
- Font Resolution & ASS Filter
- GIF Probing
- API Key Testing
- Word Window Tests
- CUDA Fallback Tests
- Async Jobs Docs
- Transcribe Settings
- HyperFrames Capture
- GSAP Vendor Bundle C
- Derived Cache Tests
- Matte Frame Index Tests
- Text Fragmentation Goldens
- Background Cache Keys
- FastAPI Lifespan & Requirements
- Motion HTML Generator
- GSAP Vendor Bundle D
- API Key Settings Tests
- Fake SAM Test Doubles
- Chroma LUT Golden Tests
- MCP Context Tests
- MCP Structured Errors Tests
- MCP Workflow Tests
- App Favicon
- SAM Encode & Decode
- Clip Audio Mixing
- Fonts & Karaoke Notes
- Clip Spec Tests
- Image Storage Tests
- MCP Access Policy Design
- MCP Capability Layer Docs
- AI Chat Panels
- Background Provider Contract
- SAM Model Readiness
- Overlay Order Tests
- Add To Timeline Tool
- GSAP Vendor Bundle E
- Fake Background Provider
- Create Clips Tests
- Subtitle Add Tests
- Transcribe Settings Tests
- YouTube History
- MCP Progress Notes
- Clip Visual Props Tests
- Paper Assets Loader
- OpenAI-Compatible Provider
- Agent Retry Tests
- SAM Assisted Tests
- Project Save Tests
- yt-dlp Retry Tests
- Manual Piloting Docs
- Oxlint Config
- Paper Export
- Text Role Helpers
- Piper Binary Fetch
- Conversation Store Tests
- GSAP Vendor Bundle F
- Chroma Filter Tests
- Chroma Morphology Tests
- Editor Docs Overview
- Audio FX Grid
- Keyframe Creation Rules
- GSAP Vendor Bundle G
- CapCut Parity Checklist
- Declarative Prop Registry
- MCP Tool Reclassification
- Frontend HTML Entry
- RuntimeError Root
- Exception Root
- BaseException Root
- Typing Any
- skipUnless Decorator
- Pydantic BaseModel
- Background Removal Doc
- TTS Dependencies
- Keyframe Copy & Paste
- Extended Keyframe Catalog
- FFmpeg Envelope Note
- Interp Items Note
- Get Frame Doc
- Reframe Clip Doc
- Project Format Doc
- Paper Animator Migration
- MotionStudio Component
- Anton Font Preload
- useEditorHistory Hook
- VideoEditor Entry Doc
- Mediabunny Library
- Playwright Engine

## God Nodes (most connected - your core abstractions)
1. `VideoEditor()` - 147 edges
2. `TimelineClip` - 115 edges
3. `Timeline` - 90 edges
4. `TimelineTrack` - 68 edges
5. `get_project()` - 52 edges
6. `Project` - 45 edges
7. `clamp()` - 44 edges
8. `ClipInfo` - 40 edges
9. `MotionComposition` - 39 edges
10. `base_tl()` - 38 edges

## Surprising Connections (you probably didn't know these)
- `Anton Font (backend, para el render/burn-in)` --semantically_similar_to--> `Anton Font (frontend, para el preview)`  [INFERRED] [semantically similar]
  backend/app/fonts/OFL.txt → frontend/public/fonts/OFL-Anton.txt
- `SIL Open Font License 1.1 (fuentes del backend)` --semantically_similar_to--> `SIL Open Font License 1.1 (fuentes del frontend)`  [INFERRED] [semantically similar]
  backend/app/fonts/OFL.txt → frontend/public/fonts/OFL-Anton.txt
- `Empaquetar como app o desplegar en servidor (pendiente)` --conceptually_related_to--> `Endpoint http://127.0.0.1:8000/mcp (streamable-HTTP)`  [AMBIGUOUS]
  README.md → docs/MCP_USO.md
- `crop_modes()` --uses--> `CropMode`  [INFERRED]
  backend/app/mcp_server/capabilities.py → backend/app/schemas.py
- `Anton Font (backend, para el render/burn-in)` --shares_data_with--> `Karaoke real en export (text_ass.word_windows)`  [INFERRED]
  backend/app/fonts/OFL.txt → docs/MCP_PROGRESO.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Capa de descubrimiento progresivo del MCP** — docs_mcp_uso_describe_capabilities, docs_mcp_auditoria_rediseno_help, docs_mcp_auditoria_rediseno_resources_mcp, docs_mcp_auditoria_rediseno_get_project_context, docs_mcp_auditoria_rediseno_meta_annotations [EXTRACTED 1.00]
- **Capa de descubrimiento del MCP** — docs_mcp_uso_describe_capabilities, docs_mcp_uso_list_projects, docs_mcp_uso_resolve_project, docs_mcp_uso_resources, docs_mcp_uso_get_project_context [EXTRACTED 1.00]
- **Pasos del flujo C (pilotaje manual YouTube → export)** — docs_mcp_uso_analyze_youtube, docs_mcp_uso_create_clips_from_segments, docs_mcp_uso_add_to_timeline, docs_mcp_uso_set_project_format, docs_mcp_uso_transcribe, docs_mcp_uso_add_subtitles, docs_mcp_uso_export_project, docs_mcp_uso_jobs_wait_for_job [EXTRACTED 1.00]
- **Keyframe System Redesign Phases** — docs_keyframes_rediseno_fase_a, docs_keyframes_rediseno_fase_b, docs_keyframes_rediseno_fase_c, docs_keyframes_rediseno_fase_d, docs_keyframes_rediseno_fase_e [EXTRACTED 1.00]
- **Protección de las 3 operaciones irreversibles** — docs_mcp_auditoria_rediseno_delete_media, docs_mcp_auditoria_rediseno_export_project, docs_mcp_auditoria_rediseno_set_project_format, docs_mcp_auditoria_rediseno_dry_run, docs_mcp_auditoria_rediseno_confirm_destructive [EXTRACTED 1.00]
- **Sistema de errores estructurados en el chokepoint** — docs_mcp_auditoria_rediseno_mcperror, docs_mcp_auditoria_rediseno_error_codes, docs_mcp_auditoria_rediseno_registry_wrap, docs_mcp_progreso_registry [EXTRACTED 1.00]
- **AI Features Integration** — docs_editor_ia_chat, docs_editor_tts, docs_editor_bg_removal [INFERRED 0.85]

## Communities (245 total, 52 thin omitted)

### Community 0 - "Editor Model Tests"
Cohesion: 0.03
Nodes (146): applyAudioSpeedToLinkedText(), applyClipVisualProps(), applyFaceTrack(), canLayerClip(), clipDur(), clipLayerInfo(), clipPlaybackMuted(), clipSaveIndex() (+138 more)

### Community 1 - "FastAPI Main & Jobs API"
Cohesion: 0.03
Nodes (120): cache_stats(), create_job(), get_job(), _run_export(), start_export_job(), start_youtube_audio_job(), add_api_key(), add_sfx() (+112 more)

### Community 2 - "Heatmap Analysis & Schemas"
Cohesion: 0.03
Nodes (58): gather_theme_text(), analyze(), _pick_segments(), Análisis del heatmap ("Most Replayed") de un vídeo de YouTube. yt-dlp ya expone…, Convierte los puntos del heatmap en tramos recortables. 1. Marca los puntos…, Punto de entrada: analiza un vídeo y devuelve info + tramos., _run_tts(), _run_youtube_audio() (+50 more)

### Community 3 - "VideoEditor Layout & Masks"
Cohesion: 0.03
Nodes (73): clipWorkspaceTracks(), needsFreeLayout(), VideoEditor(), addAsset(), addMask(), addText(), addTextTrack(), addTrack() (+65 more)

### Community 4 - "MCP Server Core & Registry"
Cohesion: 0.04
Nodes (73): Cliente MCP in-process para el agente. Usa el ``Client`` del SDK ``mcp`` 2.x…, job_dto(), Estado de un job + resumen del resultado según su tipo., MCP server: capa de control para que una IA opere el editor. Se monta en el…, _classify_value_error(), Exception, Registro de tools + capa de política + auditoría. Toda tool del MCP se declara…, Vista del registro actual (para inspección/tests). (+65 more)

### Community 5 - "Clip Masks & Keyframes (backend)"
Cohesion: 0.06
Nodes (74): clip_pose(), interp_track(), normalize_track(), _num(), Any, Animación de clip (posición / escala / rotación / opacidad). Espejo de…, static_pose(), apply_volume_fade() (+66 more)

### Community 6 - "Background Removal UI"
Cohesion: 0.06
Nodes (72): alphaCache, bgMeta(), blurCache, blurCanvasInPlace(), cutCache, cutoutDrawable(), editsSig(), evict() (+64 more)

### Community 7 - "Jobs & Clip Download"
Cohesion: 0.04
Nodes (60): clip_range(), Tramo de la FUENTE que necesita el clip, con margen., _extract_info(), Descarga solo los metadatos del vídeo (sin bajar el vídeo en sí)., all_jobs(), _find_timeline_clip_by_filename(), JobCancelled, _mmss() (+52 more)

### Community 8 - "Timeline Ops Core"
Cohesion: 0.09
Nodes (72): add_clip(), add_shape(), add_subtitles(), add_track(), animate_clip(), _apply_audio_to_clip(), _clamp01(), _clip_dur() (+64 more)

### Community 9 - "Frontend API Client & Hooks"
Cohesion: 0.06
Nodes (57): JsonEditor(), save(), extractYoutube(), generate(), ACCESS_LABEL, EdChat(), patchLast(), send() (+49 more)

### Community 10 - "FFmpeg Compose & Render"
Cohesion: 0.06
Nodes (54): _alpha_chain(), _bg_input_args(), _bg_source_chain(), _clip_duration(), _clip_path(), _color(), _drawtext(), _esc_text() (+46 more)

### Community 11 - "Material Tab Components"
Cohesion: 0.06
Nodes (38): CargarCustom(), DROP_HINT, droppedUrl(), importMedia(), onVidDrop(), isAudioFile(), isVideoFile(), MAT_NAV (+30 more)

### Community 12 - "Storage & YouTube Audio"
Cohesion: 0.06
Nodes (40): YouTubeAudioRequest, default_base(), ensure_dirs(), library_root(), pick_folder(), project_base(), Path, Gestión de dónde se guardan los archivos de cada proyecto. Cada proyecto puede… (+32 more)

### Community 13 - "Clip Keyframes (frontend)"
Cohesion: 0.07
Nodes (55): bakedReframeForCut(), cutSampleTimes(), saveClip(), applyVolumeFade(), audioStatic(), clipPropsAt(), copyKeyframeAt(), CROP_KEYS (+47 more)

### Community 14 - "Shapes Geometry"
Cohesion: 0.07
Nodes (49): ACTIONS, EdLayer(), EdShape(), EdShapes(), ARROW_TYPES, clampN(), curvedArrowPoly(), defaultShape() (+41 more)

### Community 15 - "Clip Masks (frontend)"
Cohesion: 0.07
Nodes (50): KF_PROP_KEYS, applyMasksToLayer(), beginMaskLayer(), clamp(), clipMasks(), defaultMask(), endMaskLayer(), hasMask() (+42 more)

### Community 16 - "Timeline Ops Tests"
Cohesion: 0.07
Nodes (15): Una pista del editor (V1, V2… / A1, A2… / T1)., TimelineTrack, _timeline(), _timeline(), AddClipTest, AddTrackTest, base_tl(), MoveClipTest (+7 more)

### Community 17 - "Clip Stacking"
Cohesion: 0.06
Nodes (48): clipsOverlap(), clipWidth(), clusterKey(), clusterSpan(), COVER_RATIO, coversMost(), frontClipId(), fullyCovers() (+40 more)

### Community 18 - "Clip FX FFmpeg Chain"
Cohesion: 0.09
Nodes (25): audio_fx_chain(), _audio_fx_map(), _clamp01(), clip_fx_at(), effects_ffmpeg(), _effects_map(), _field(), _fx_num() (+17 more)

### Community 19 - "MCP Edit Tools"
Cohesion: 0.08
Nodes (49): add_shape(), add_subtitles(), add_track(), animate_clip(), _apply(), checkpoint(), duplicate_clip(), _edit_result() (+41 more)

### Community 20 - "Background Matte Service"
Cohesion: 0.09
Nodes (46): BgCancelled, build_matte(), clear_cache(), _contiguous_range(), covered_range(), _embeddings(), ensure_derived(), _extract_size() (+38 more)

### Community 21 - "MCP Audit & AI Agent"
Cohesion: 0.05
Nodes (37): _access(), _is_mutating(), Agente del Chat IA: orquesta proveedor ↔ tools MCP y emite eventos. Generador…, Sondea get_job emitiendo progreso hasta que termina. Devuelve el estado final., Corre un turno de chat. Emite: start/text/tool_start/tool_result/job/…, Envuelve run_chat como stream SSE (``data: {json}\\n\\n``)., run_chat(), sse() (+29 more)

### Community 22 - "Media Search & Asset Import"
Cohesion: 0.10
Nodes (26): allowed_download_url(), AssetImportService, _download(), _filename(), Importa un resultado de Explorar al almacenamiento local del proyecto., _fetch_json(), _int(), map_giphy_gif() (+18 more)

### Community 23 - "Transcript Fragmentation"
Cohesion: 0.07
Nodes (30): chunk_caption_text(), _clip_dur(), _get(), make_text_clip(), _r3(), Fragmentación de transcripción → clips de texto. ESPEJO de la lógica JS.…, Segmentos de Whisper → clips de texto, recortados al tramo del clip fuente, con…, _rel_segment_words() (+22 more)

### Community 24 - "Clip Layout Tests"
Cohesion: 0.05
Nodes (42): destRect(), destRectOnCanvas(), destRectOnFrame(), mediaSize(), newTransform(), srcRectOn(), asFreeObject, back (+34 more)

### Community 25 - "Media Library"
Cohesion: 0.10
Nodes (21): _file(), _find_item(), infer_origin_source(), library_root(), LibraryInUseError, list_library(), _load(), material_dto() (+13 more)

### Community 26 - "GSAP Vendor Bundle A"
Cohesion: 0.06
Nodes (15): ee(), Jd(), Kd(), la(), Ld(), ma(), Md(), na() (+7 more)

### Community 27 - "Explore Tab"
Cohesion: 0.12
Nodes (34): EdExplore(), addItem(), ExploreCard(), ExplorePreview(), CLASSIC_SUGGESTIONS, cloneExploreSession(), collectThemeText(), EMPTY_EXPLORE_SESSION (+26 more)

### Community 28 - "Canvas Interactions & Layout"
Cohesion: 0.13
Nodes (38): createCanvasDownHandler(), createMainDownHandler(), handleBgPointer(), handleMaskPointer(), listenMove(), nearHandle(), startBgBrush(), startFillSourcePan() (+30 more)

### Community 29 - "FFmpeg Command & Matte Alignment"
Cohesion: 0.10
Nodes (19): Eliminar fondo: proveedores de segmentación y servicio de matte. ``clip_bg``…, build_command(), _filter_script_cmd(), Construye la lista de argumentos de ffmpeg para renderizar la timeline., Evita ``[WinError 206]`` (la línea de comandos de Windows tiene un límite de…, Project, MatteAlignmentTest, Path (+11 more)

### Community 30 - "Timeline Crops & Keyframe UI"
Cohesion: 0.10
Nodes (30): EdCrops(), kfList(), kfTime(), speedLabel(), clipCopyText(), clipKeepPitch(), clipSpeed(), displayTracks() (+22 more)

### Community 31 - "Timeline Migrations Tests"
Cohesion: 0.07
Nodes (11): Timeline, CooperativeCancelTest, ExportTest, La cancelación aborta el runner en el siguiente on_progress (best-effort)., _timeline(), KeepPitchMigrationTest, MigrateTimelineTest, Tests de la migración del JSON del timeline (forward-only, idempotente). (+3 more)

### Community 32 - "App Shell & Icons"
Cohesion: 0.10
Nodes (21): App(), confirmDeleteProject(), navigate(), onCreate(), refresh(), readHash(), ConfirmModal(), Icon() (+13 more)

### Community 33 - "Canvas Composite Render"
Cohesion: 0.13
Nodes (32): cache, decodeGif(), gifFrameAt(), gifInfo(), bgBrushRadiusPx(), boxToDest(), canvasToSourceNorm(), drawBackdrop() (+24 more)

### Community 34 - "ASS Subtitle Builder"
Cohesion: 0.13
Nodes (11): Un elemento colocado en una pista de la timeline. ``start`` es la posición en…, TimelineClip, active_word_index(), ass_time(), build_ass(), caption_dialogues(), split_words(), TimelineClipFxFieldsTest (+3 more)

### Community 35 - "Clip Mask Tests"
Cohesion: 0.10
Nodes (9): _clip(), ExportTest, GeometriaTest, _graph(), KeyframesTest, ModeloTest, PersistenciaTest, RasterizadoTest (+1 more)

### Community 36 - "Shapes (backend)"
Cohesion: 0.13
Nodes (24): Any, _bgr(), _clamp(), _curved_arrow_poly(), default_shape(), _ellipse_pts(), _heart_pts(), _hex() (+16 more)

### Community 37 - "GPU Probe"
Cohesion: 0.10
Nodes (32): _add_nvidia_dll_dirs(), cuda_available(), _cuda_libs_ok(), _dll_loads(), _encoder_args_for(), _encoder_works(), _gpu_disabled(), hw_encoder() (+24 more)

### Community 38 - "MCP DTO & Read Tools"
Cohesion: 0.10
Nodes (30): aspect_ratio(), clip_detail(), _clip_summary(), _clip_timeline_duration(), _dup_counts(), _format_dto(), _lineage_root(), _media_dto() (+22 more)

### Community 39 - "Recipe Layout (backend)"
Cohesion: 0.13
Nodes (16): contain_dest(), contain_scale_filter(), dual_slot_wh(), dual_stack_name(), _field(), is_master_reframe(), join_dual_filters(), Any (+8 more)

### Community 40 - "SFX Tool Tests"
Cohesion: 0.08
Nodes (8): AddSfxHttpTest, AddSfxNoLibraryTest, AddSfxTest, CreateSfxCategoryTest, Path, Alta de SFX: copia el audio, registra JSON y crea categoría si hace falta., UpdateSfxTest, _write_lib()

### Community 41 - "Property Ops Tests"
Cohesion: 0.13
Nodes (7): CapabilitiesTest, _clip(), LinkTracksTest, PropertyOpsTest, Etapa 4.5 — ops nuevas de propiedades por-clip / figuras (timeline_ops puro)., ShapeOpTest, _tl()

### Community 42 - "Material Tab Interactions"
Cohesion: 0.08
Nodes (20): dragMediaKind(), EdMaterial(), ingestClipboard(), loadYt(), onFileDragEnter(), onFileDragLeave(), onFileDragOver(), onFileDrop() (+12 more)

### Community 43 - "Paper Model & Editor History"
Cohesion: 0.18
Nodes (29): useEditorHistory(), ensureAsset(), decodeCanvas(), activeKeyframe(), addKeyframe(), clamp(), cropSig(), DEFAULT_BACKGROUND (+21 more)

### Community 44 - "AI Agent Tests"
Cohesion: 0.08
Nodes (15): _clean_schema(), McpToolset, Poda un JSON-Schema a lo que entiende el function-calling de los LLM., Normaliza el CallToolResult a ``{ok, data, text}``. En error, el SDK prefija el…, Sesión abierta contra el MCP in-process para un turno de chat., Declaraciones de función provider-agnósticas (name/description/parameters)., _result_data(), AgentTest (+7 more)

### Community 45 - "Projects Store"
Cohesion: 0.13
Nodes (31): create_project(), add_clips(), add_image(), add_transcript(), apply_manifest(), create_project(), delete_motion_composition(), delete_project() (+23 more)

### Community 46 - "Motion Validation Tests"
Cohesion: 0.10
Nodes (7): ClipKindTest, _comp(), GeneratorTest, Motion Studio: modelo, validación y generador HTML (Fase 0/1 MVP). Contrato: la…, ShapeLayerTest, TemplateTest, ValidatorTest

### Community 47 - "Settings UI"
Cohesion: 0.10
Nodes (24): API_PROVIDERS, AUDIO_DB_PRESETS, EdSettings(), cancel(), reload(), reloadAi(), remove(), runTest() (+16 more)

### Community 48 - "Paper Image Crop & Erase"
Cohesion: 0.13
Nodes (28): checkerPattern(), clampToContent(), clipSegment(), coversContent(), CROP_CURSOR, editingText(), HINTS, normalizeRect() (+20 more)

### Community 49 - "Clip Motion Builder"
Cohesion: 0.13
Nodes (30): audio_src_at(), build_motion_items(), downsample_envelope(), _from_amp(), hold_after_peak(), _item(), _kind(), _lerp() (+22 more)

### Community 50 - "ASS Style Overrides"
Cohesion: 0.14
Nodes (29): _active_override(), _alignment(), alpha_hex(), _alpha_tags(), _applied_style(), ass_bgr(), _clamp01(), _clip_dur() (+21 more)

### Community 51 - "Timeline Scale & FPS"
Cohesion: 0.13
Nodes (26): anchorScroll(), buildTicks(), clamp(), clampPps(), fmtRuler(), maxPps(), minPps(), pad2() (+18 more)

### Community 52 - "Panning & Recipe Layout"
Cohesion: 0.10
Nodes (27): blit(), drawReframe(), fitOf(), frameAt(), KF_COLORS, modeOf(), OUT_RATIO, posAt() (+19 more)

### Community 53 - "SAM Config & Timeline Store"
Cohesion: 0.13
Nodes (23): Proveedor SAM 2.1 para Eliminar fondo ASISTIDO (segmentación por clics). A…, Configuración central del proyecto. Todos los valores por defecto viven aquí…, timeline_checkpoint(), timeline_redo(), timeline_restore(), timeline_undo(), Guarda la composición del editor de vídeo en el proyecto., save_timeline() (+15 more)

### Community 54 - "SFX Library"
Cohesion: 0.17
Nodes (29): add_sound(), _cat_dto(), create_category(), _ensure_dir(), _entry(), _find_sonido(), get_base(), _library_from_scan() (+21 more)

### Community 55 - "Effects Inspector UI"
Cohesion: 0.12
Nodes (24): EdEffects(), patchEffects(), toggleVideo(), fxTabs(), KfTransitionSelect(), tabLabel(), VolumePanel(), EdFxLibrary() (+16 more)

### Community 56 - "Paper Canvas Renderer"
Cohesion: 0.13
Nodes (27): CORNERS, EASING, hexToRgba(), isOverlayTool(), lerp(), LIMITS, seededRandom(), TOOL (+19 more)

### Community 57 - "Motion Service & Validator"
Cohesion: 0.14
Nodes (26): motion_create(), motion_update(), Crea una composición: desde template (``template``+``params``) o desde un…, MotionComposition, Composición completa. ``id`` es estable dentro del proyecto., asset_path(), list_compositions(), _motion_dir() (+18 more)

### Community 58 - "MCP Capabilities & TTS"
Cohesion: 0.10
Nodes (26): crop_modes(), describe(), domains(), overview(), project_summary(), Capacidades descubribles del editor (fuente única para tools + resources). Fase…, Capacidades de UN dominio: verbos, valores válidos y guía. ValueError si no…, Resumen minúsculo de un proyecto para listar/desambiguar. (+18 more)

### Community 59 - "Frontend Build Config"
Cohesion: 0.07
Nodes (26): dependencies, material-icons, mediabunny, react, react-dom, devDependencies, oxlint, @types/react (+18 more)

### Community 60 - "Motion Composition Hook"
Cohesion: 0.15
Nodes (21): MotionElements(), clampComposition(), deepMerge(), EASES, EFFECT_TYPES, ENTRANCE_TYPES, EXIT_TYPES, moveLayer() (+13 more)

### Community 61 - "Clipper Pipeline"
Cohesion: 0.13
Nodes (26): _clamp(), _crop_filter(), _cut_audio_args(), _cut_clip(), _download_source(), generate_clips(), _pw_expr(), _pw_expr_direct() (+18 more)

### Community 62 - "Image Import & Probing"
Cohesion: 0.13
Nodes (14): _clean_filename(), _ext_from_magic(), fetch_image(), import_image(), _new_id(), probe_size(), Path, Importar imágenes al proyecto como PNG de trabajo (listo para alpha / quitar… (+6 more)

### Community 63 - "MCP Media & Render Tools"
Cohesion: 0.12
Nodes (24): _run(), start_job(), analyze_dto(), Resultado de analyze_youtube: info del vídeo + tramos del heatmap., MCPError, Error de tool con código estructurado (§J). Subclase de ``ValueError`` a…, analyze_youtube(), create_clips_from_segments() (+16 more)

### Community 64 - "Timeline UI & Alignment"
Cohesion: 0.14
Nodes (25): clipEnd(), resizeGeneratedClip(), trimClipPatch(), trimPreviewHead(), ALIGN_SNAP_PX, alignOthers(), alignThresholdSec(), asAlignClip() (+17 more)

### Community 65 - "SFX Classify Modal"
Cohesion: 0.17
Nodes (23): defaultMeta(), isAudioFile(), SfxCategoryCell(), cancel(), confirm(), SfxClassifyModal(), patch(), rememberCat() (+15 more)

### Community 66 - "Clip Kind Helpers"
Cohesion: 0.13
Nodes (14): clip_fits_track(), ffmpeg_input_args(), ffmpeg_trim_window(), has_generated_duration(), _in_out(), is_still_clip(), is_visual_clip(), Familias de clip ↔ pista. Permite tipos nuevos sin rehacer la timeline. Las… (+6 more)

### Community 67 - "Export Preview Parity"
Cohesion: 0.16
Nodes (16): _fill_base_cropscale(), Keyframes del reframe pasados a tiempo LOCAL del fragmento recortado. Los…, Cadena de filtros (crop+scale) para el reencuadre de un clip, sin el trim.…, Crop+scale de un clip fill: cover como el preview, no letterbox. El editor…, _reframe_cropscale(), _shifted_keyframes(), Animación de reencuadre aplicada a un clip. ``zoom`` = fracción de la altura…, Reframe (+8 more)

### Community 68 - "Background Export Tests"
Cohesion: 0.21
Nodes (13): _clip(), FilterGraphTest, _graph(), NoRegressionTest, Eliminar fondo en el export: filtergraph y composición real con FFmpeg. Lo que…, Cortar el clip solo mueve el número de arranque: nada que regenerar., chromakey y alphamerge sobreescriben el alfa: hay que multiplicar., El alfa va antes: la velocidad la aplica la cadena de siempre, una vez. (+5 more)

### Community 69 - "GPU Selection Tests"
Cohesion: 0.10
Nodes (5): GpuSelectionTest, OnnxProviderTest, _probe(), Selección de aceleración por hardware: whisper device + encoder de vídeo., Eliminar fondo: la elección de device nunca debe quedarse sin proveedor.

### Community 70 - "Panel Layout"
Cohesion: 0.16
Nodes (22): measure(), usePanelLayout(), applyPanelDrag(), clampPanelLayout(), KEYS, num(), PANEL_DEFAULTS, PANEL_LAYOUT_KEY (+14 more)

### Community 71 - "Image Paste & Add Modal"
Cohesion: 0.19
Nodes (20): ImageAddModal(), patch(), saveAll(), saveRowByKey(), takeFiles(), collectFromClipboardItems(), collectPastePayload(), dataUrlToFile() (+12 more)

### Community 72 - "Paper Animator Model"
Cohesion: 0.08
Nodes (12): BLEND_MODES, EASING_OPTIONS, EXPORT_FORMATS, imageEdited(), PAPER_ANIMS, PREVIEW_SCALES, VIDEO_FORMATS, AUTO_PROVIDERS (+4 more)

### Community 73 - "Clip FX (frontend)"
Cohesion: 0.12
Nodes (23): clamp01(), clipFxAt(), effectsCss(), FX_DUR, fxWindows(), lerp(), LOOK_CSS, lookCss() (+15 more)

### Community 74 - "Clip Speed"
Cohesion: 0.20
Nodes (13): atempo_chain(), audio_speed_filters(), clip_reverse(), clip_source_duration(), clip_speed(), clip_timeline_duration(), _field(), keep_pitch() (+5 more)

### Community 75 - "Karaoke Text FX"
Cohesion: 0.15
Nodes (22): activeWordIndex(), activeWordIndexFromWords(), activeWordsPerBox(), applyThemeToStyle(), chunkCaptionText(), clamp01(), hasWordFx(), karaokeOn() (+14 more)

### Community 76 - "MCP Motion Tools"
Cohesion: 0.16
Nodes (22): _default_times(), _montage(), motion_add_to_timeline(), motion_create_composition(), motion_get_composition(), motion_get_frame(), motion_list_templates(), motion_update_composition() (+14 more)

### Community 77 - "Motion Models & Templates"
Cohesion: 0.21
Nodes (20): Motion Studio: motion graphics editables (composición JSON) integrados en el…, MotionAnimation, MotionEffect, MotionLayer, MotionShape, MotionTween, BaseModel, Modelo de composición de Motion Studio. Una ``MotionComposition`` es la fuente… (+12 more)

### Community 78 - "Favorites"
Cohesion: 0.18
Nodes (19): useFavorites(), isClipFav(), saveTextStyle(), toggleClipFav(), toggleSfx(), audioFavKey(), clipFavRef(), emptyFavorites() (+11 more)

### Community 79 - "Face Detect & Reframe"
Cohesion: 0.14
Nodes (21): _detect_faces(), dims(), face_center_x(), face_track(), _get_detector(), _model_path(), _prep_frame(), ndarray (+13 more)

### Community 80 - "Overlay Export Filters"
Cohesion: 0.20
Nodes (11): _even(), _overlay_video_filter(), Crop de fuente (tamaño fijo) + scale/rotate del resultado. Devuelve (filtro,…, _overlay_clip(), OverlayChainOrderTest, OverlayExportTest, patch, Export de imágenes/vídeo en overlay: keyframes de pose, sin tapar el canvas. (+3 more)

### Community 81 - "App Settings"
Cohesion: 0.18
Nodes (20): delete_api_key(), get_settings(), put_settings(), put_timeline(), set_api_key(), add_key(), key_count(), keys_for() (+12 more)

### Community 82 - "Background Ops Tests"
Cohesion: 0.13
Nodes (7): BgJobTest, Eliminar fondo: operación de timeline (undo/redo) y endpoints HTTP., El job NO escribe la timeline: devuelve el resultado en el Job., Tocar la tolerancia del croma NO puede borrar el matte ya calculado., Sin registrar, ni la IA ni el undo/redo del backend lo verían., SetClipBgRemovalTest, _tl()

### Community 83 - "Background Cache Tests"
Cohesion: 0.13
Nodes (8): CacheBase, MissingRangesTest, Path, Eliminar fondo: caché en dos niveles, rango incremental y proveedores. Los…, ``%06d`` empieza en 000001, así ``-start_number`` cuadra con el índice., `Guardar clip` sobrescribe: mismo nombre y tamaño, otro contenido. Con solo…, Duplicar material idéntico no debería re-inferir... salvo por mtime., SourceIdTest

### Community 84 - "Gemini TTS Tests"
Cohesion: 0.10
Nodes (7): AvailableTest, NarrationPromptTest, PublicSettingsTest, Gemini TTS: prompt de estilo, WAV y disponibilidad sin llamar a la API., _silent_pcm(), VoicesListTest, WriteWavTest

### Community 85 - "Transform & Mask Inspector"
Cohesion: 0.15
Nodes (14): isVisualClip(), EdMask(), EdTransform(), InspSection(), InspSlider(), KF_TITLES, KfDia(), NumberStepper() (+6 more)

### Community 86 - "Keyframe Editing Handlers"
Cohesion: 0.24
Nodes (21): applyStaticMask(), applyStaticPose(), changeShape(), changeStyle(), changeTransform(), commitMask(), commitPose(), copyKeyframe() (+13 more)

### Community 87 - "AI Provider Run Loop"
Cohesion: 0.16
Nodes (17): _friendly_error(), _is_auth_or_quota(), _is_malformed_toolcall(), _payload_no_image(), Exception, Código HTTP del error (openai usa ``status_code``; google-genai ``code``)., El modelo emitió argumentos de tool que NO son JSON válido (frecuente en…, ¿Transitorio que conviene reintentar? 5xx, saturación o tool-call malformado.… (+9 more)

### Community 88 - "GSAP Vendor Bundle B"
Cohesion: 0.15
Nodes (20): _a(), ac(), Co(), db(), ea(), eb(), ga(), gb() (+12 more)

### Community 89 - "Reframe Proxy"
Cohesion: 0.17
Nodes (19): _download_proxy(), _ffmpeg_proxy(), _key(), _local_media_path(), prepare(), proxy_path(), Path, ProgressCb (+11 more)

### Community 90 - "AI Provider Selection Tests"
Cohesion: 0.10
Nodes (3): LmStudioModelsApiTest, ProviderSelectionTest, Selección de proveedor de IA (Gemini / OpenAI / OpenRouter).

### Community 91 - "MCP Capabilities Tests"
Cohesion: 0.14
Nodes (3): CapabilitiesTest, _read(), _text()

### Community 92 - "Audio Tab & Export Hooks"
Cohesion: 0.17
Nodes (18): AudioTab(), reloadEngines(), saveGeminiKey(), canCaptionClip(), useExportJob(), doExport(), useSubtitles(), buildSubtitleClips() (+10 more)

### Community 93 - "Clip Background Model"
Cohesion: 0.15
Nodes (18): chroma_alpha8(), chroma_alpha_ffmpeg(), chroma_filters(), chroma_key_uv(), chroma_morph_params(), despill_rgb(), despill_type(), frame_uv() (+10 more)

### Community 94 - "Explore Keyword Suggestions"
Cohesion: 0.20
Nodes (12): _anthropic_keywords(), extract_keywords(), _first_llm(), _gemini_keywords(), _llm_keywords(), _openai_keywords(), parse_keyword_list(), _post_json() (+4 more)

### Community 95 - "Matte Build Tests"
Cohesion: 0.21
Nodes (5): BuildMatteTest, Mover umbral/pluma/pincel NO debe volver a inferir., Un vídeo de 64 px no se sube a 512: no habría más detalle, solo coste., Pedir más allá del final del vídeo no debe sellar huecos en el meta., Vídeo sintético pequeño (necesita ffmpeg).

### Community 96 - "Clipper Filter Tests"
Cohesion: 0.13
Nodes (6): CutAudioArgsTest, OutputFormatTest, patch, El formato elegido en el editor (9:16, 16:9, 1:1…) debe llegar al recorte.…, ReframeFilterLengthTest, Keyframe

### Community 98 - "Multi API Key Store"
Cohesion: 0.11
Nodes (4): KeyTestAllTest, KeyTestClassifyTest, MultiKeyStoreTest, Varias API keys por proveedor (fallback) + prueba de claves. - Primaria en…

### Community 100 - "Text Styles Render"
Cohesion: 0.14
Nodes (17): applyPreset(), applyTrackPreset(), applyOrClearTheme(), clearTextTheme(), FONTS, selectedSubtitleThemeId(), classic, cleared (+9 more)

### Community 101 - "AI Provider Config"
Cohesion: 0.19
Nodes (16): ai_config(), _api_keys(), _auto_provider(), _default_model(), get_provider(), _has_key(), _is_local_provider(), list_lmstudio_models() (+8 more)

### Community 102 - "Compose Clip Filter Graph"
Cohesion: 0.28
Nodes (13): _filter_graph(), generate_composition(), is_http_url(), Path, ProgressCb, Genera un clip 9:16 combinando hasta 2 capas (fuentes distintas o la misma)., resolve_layer_source(), resolve_local_media() (+5 more)

### Community 103 - "Timeline History & Undo"
Cohesion: 0.24
Nodes (15): _history(), _history_summary(), can_redo(), can_undo(), checkpoint(), list_checkpoints(), _norm(), Historial del timeline: snapshot / undo / redo / checkpoints. Core PURO sobre… (+7 more)

### Community 104 - "Motion Runtime JS"
Cohesion: 0.29
Nodes (16): applyEffect(), buildAll(), buildLayer(), buildLine(), entranceVars(), exitVars(), isHorizontal(), notify() (+8 more)

### Community 105 - "GSAP Tween Core"
Cohesion: 0.15
Nodes (17): _assertThisInitialized(), Ec(), Fc(), gc(), ka(), qa(), t(), tb() (+9 more)

### Community 106 - "Shorts Builder"
Cohesion: 0.24
Nodes (16): _add_clip_to_timeline(), build_short_from_library(), build_short_from_youtube(), _clip_dict(), _export(), ProgressCb, Workflows de alto nivel: crear un short de punta a punta. Componen los…, Como el anterior pero desde un clip que YA está en el proyecto (sin descargar). (+8 more)

### Community 107 - "AI Conversations Store"
Cohesion: 0.28
Nodes (15): append(), delete(), _dir(), _find(), get_messages(), get_or_create(), history(), list_conversations() (+7 more)

### Community 108 - "Clip Layout (backend)"
Cohesion: 0.24
Nodes (10): _clamp(), dest_rect(), dest_rect_even(), _even(), is_overlay(), new_transform(), Any, Encuadre (crop de fuente) y transformación del resultado en el canvas de… (+2 more)

### Community 109 - "Whisper Transcription"
Cohesion: 0.21
Nodes (15): mark_cuda_broken(), _collect_segments(), _download_audio(), _get_model(), Path, ProgressCb, Transcripción de vídeos de YouTube con faster-whisper (STT). Descarga solo el…, Transcribe un archivo de audio/vídeo ya en disco. (+7 more)

### Community 110 - "Settings Persistence & YT History"
Cohesion: 0.23
Nodes (15): api_key(), _api_keys_map(), load(), _merge_favorites(), Clave de un proveedor (Pexels, GIPHY, Gemini…). Vacío si no está configurada., save(), _secret(), _retarget_favorite() (+7 more)

### Community 111 - "yt-dlp Wrapper"
Cohesion: 0.23
Nodes (15): auth_attempts(), call(), _configured_browser(), _cookie_file(), friendly_error(), is_auth_error(), is_cookie_source_error(), _msg() (+7 more)

### Community 113 - "Clip Background Tests"
Cohesion: 0.19
Nodes (7): _bg(), _clip(), ModelTest, TimelineClip, Eliminar fondo: modelo del clip, matte derivado y paridad del chroma key. El…, Es puramente aditivo: nada que migrar y nada que cambie., _ready_auto()

### Community 114 - "Derive Matte Tests"
Cohesion: 0.23
Nodes (3): DeriveMatteTest, La LUT se construye en float de 64 bits, igual que el JS. La entrada 96 con…, Las coordenadas son normalizadas: el resultado no depende del tamaño.

### Community 115 - "Clip Motion Tests"
Cohesion: 0.19
Nodes (5): BuildItemsTest, _clip(), MotionNormalizeTest, OverlapTest, Presets de animate_clip (keyframe generation, sin ffmpeg).

### Community 116 - "Text Styles Draw"
Cohesion: 0.19
Nodes (15): exportPayload(), base, clampN(), CUSTOM_FONTS, drawTextClip(), effectiveTextStyle(), ensureEditorFonts(), FONT_CSS (+7 more)

### Community 117 - "Clip Animation Pose"
Cohesion: 0.20
Nodes (14): applyShapePose(), interpTrack(), legacyAnimPose(), normalizeTrack(), num(), staticPose(), mid, moving (+6 more)

### Community 118 - "ONNX Matte Provider"
Cohesion: 0.18
Nodes (4): OnnxMatteProvider, ndarray, Path, Base para modelos de matte en ONNX Runtime con pre/post de U²-Net. Preproceso…

### Community 119 - "Provider Registry Tests"
Cohesion: 0.13
Nodes (7): catalog(), bg_providers(), gpu_onnx_summary(), Modelos de segmentación disponibles y device efectivo., ProviderRegistryTest, El modelo se descarga de un sitio fijo: sin URL no hay proveedor., Un modelo que devuelve todo igual no debe dividir por cero.

### Community 120 - "Clip Background Matte Spec"
Cohesion: 0.18
Nodes (15): build_clip_bg_mask(), build_timeline_bg_masks(), frame_pattern(), Especificación del matte de un clip para el filtergraph del export. ``None`` si…, Matte derivado de todos los clips de la timeline, por id de clip., auto_active(), auto_requested(), bg_active() (+7 more)

### Community 121 - "HyperFrames Renderer"
Cohesion: 0.19
Nodes (10): get_renderer(), Path, ProgressCb, Capa de abstracción del motor de render (spec §6). La UI y el servicio hablan…, (ok, motivo). ok=False si falta el motor/navegador; motivo explica., Devuelve el motor por defecto (HyperFrames sobre Playwright)., RendererAdapter, RenderResult (+2 more)

### Community 122 - "Reframe Math"
Cohesion: 0.24
Nodes (10): _clamp(), frame_at(), _kf_cx(), _kf_cy(), _kf_fit(), _kf_mode(), _kf_t(), _kf_zoom() (+2 more)

### Community 123 - "Word Shaping Tests"
Cohesion: 0.21
Nodes (8): _attr(), Lee un campo de un Word de faster-whisper (objeto) o de un dict., Normaliza las palabras de un segmento a dicts persistibles. Descarta palabras…, shape_words(), Tests del shaping de palabras (timing real por palabra de faster-whisper). No…, ShapeWordsTest, TranscriptWordsSchemaTest, _w()

### Community 124 - "yt-dlp Auth Tests"
Cohesion: 0.13
Nodes (4): AuthAttemptsTest, AuthErrorTest, CookieSourceErrorTest, FriendlyErrorTest

### Community 125 - "Popover & Select Components"
Cohesion: 0.22
Nodes (6): AnchoredMenu(), FlipPopover(), FlipSelect(), placeAnchoredMenu(), placeMenu(), react-dom

### Community 126 - "Background Provider Interface"
Cohesion: 0.19
Nodes (10): _device_setting(), get(), ProviderUnavailable, ProgressCb, RuntimeError, Proveedores de segmentación para Eliminar fondo. La app NO conoce ningún modelo…, El proveedor no puede trabajar (falta modelo, falta onnxruntime…)., Deja el proveedor listo (descargar pesos, abrir sesión…). (+2 more)

### Community 127 - "Piper TTS"
Cohesion: 0.25
Nodes (13): available(), _binary(), _label_for(), list_voices(), Path, ProgressCb, Narrador con voz IA (TTS) usando Piper — voces en español mexicano (es_MX). A…, Todos los modelos .onnx de voz disponibles (en voices/ o en la raíz). (+5 more)

### Community 130 - "Timeline History Tests"
Cohesion: 0.22
Nodes (4): CheckpointTest, Core de historial: snapshot / undo / redo / checkpoints (puro, sobre dicts)., tl(), UndoRedoTest

### Community 131 - "MCP Layered Discovery Design"
Cohesion: 0.19
Nodes (14): Agente interno in-process (ai/agent.py + ai/mcp_client.py), Arquitectura B — split en N servidores MCP (descartada), Arquitectura E — núcleo fino + router en el agente propio (recomendada), Capa de capacidades para agentes (objetivo del rediseño), current_project con alcance de conversación (nunca estado global del servidor), Descubrimiento progresivo en 3 capas (manifiesto / dominios / detalle), Fase 5 — router de intención + entrada-por-proyecto, help(domain) / guía por dominio fuera de los schemas (+6 more)

### Community 132 - "Workflow-as-Job Design"
Cohesion: 0.15
Nodes (14): W1 create_short_from_youtube, W3 create_subtitled_clip (opcional, no crear por crear), Fase 6 — seguridad + robustez de jobs, Envelope único de job (status/progress/result/error), W2 make_short_from_library, result_ref — ids en vez de volcar resultados pesados, wait_for_job (bloquea en threadpool, preferido sobre polling), Cancelación cooperativa best-effort (cancel_requested / JobCancelled) (+6 more)

### Community 133 - "Subtitle Themes UI"
Cohesion: 0.24
Nodes (11): EdText(), sizeToNearestPx(), TextFxPanel(), BLOCK_APPEAR_OPTIONS, sub, SUBTITLE_THEMES, themeById(), WORD_FX_OPTIONS (+3 more)

### Community 134 - "Background Normalization"
Cohesion: 0.28
Nodes (13): _clamp(), matte_levels(), normalize_auto(), normalize_bg(), normalize_chroma(), normalize_edit(), normalize_hex(), _num() (+5 more)

### Community 135 - "Matte Derivation & LUT"
Cohesion: 0.23
Nodes (13): derive_matte(), edits_alpha(), expand_alpha(), feather_alpha(), matte_lut(), paint_edit(), ndarray, LUT de 256 entradas con niveles + invertir. Se construye con la MISMA… (+5 more)

### Community 136 - "SFX Favorites Filter"
Cohesion: 0.22
Nodes (7): sfx_categories(), _favorite_sfx_ids(), filter_sfx_items(), Filtra por búsqueda y categoría. ``favoritos`` usa ids marcados con estrella., search(), with_favorites_category(), SfxFavoritesFilterTest

### Community 137 - "Chroma Key Parity Tests"
Cohesion: 0.18
Nodes (6): ChromaKeyParityTest, ndarray, El chroma key del modelo debe ser IDÉNTICO al de ffmpeg, píxel a píxel., ``frame_uv`` debe dar el MISMO entero que swscale, no un aproximado. Con coma…, La clave usa rango COMPLETO y el fotograma LIMITADO: diff nunca es 0., skipUnless

### Community 138 - "Timeline Store Tests"
Cohesion: 0.21
Nodes (3): _base_timeline(), Adaptador stateful: apply_op / undo / redo / checkpoints sobre un proyecto real…, TimelineStoreTest

### Community 139 - "Align Guides"
Cohesion: 0.21
Nodes (11): canvasAlignTargets(), drawAlignGuides(), SNAP_THRESHOLD, snapAlign(), canvas, clips, far, near (+3 more)

### Community 140 - "SAM 2.1 Provider"
Cohesion: 0.23
Nodes (3): Path, Segmentador asistido SAM 2.1 (encoder + decoder ONNX). INTERACTIVO: no produce…, Sam21Provider

### Community 141 - "Compose Slot Layout"
Cohesion: 0.30
Nodes (6): _even(), Geometría de huecos para componer 2 capas en 720x1280., slot_norm(), slot_pixels(), SlotLayoutTest, SlotRect

### Community 142 - "Diagnostics Probe"
Cohesion: 0.21
Nodes (11): configure_logging(), _ffmpeg_info(), log_report(), _opencv_info(), probe(), Diagnóstico de rendimiento: qué "motor" usará cada parte del pipeline. Los dos…, ¿Hay ffmpeg? ¿Qué codificadores por hardware ofrece?, Sonda cacheada de la máquina. Barata de llamar (solo se ejecuta 1 vez). (+3 more)

### Community 143 - "Export Settings"
Cohesion: 0.20
Nodes (5): encoder_quality(), load(), normalize(), FPS y calidad de export (Configuración del editor)., ExportSettingsTest

### Community 144 - "Gemini TTS"
Cohesion: 0.32
Nodes (11): api_key(), _as_bytes(), available(), _generate_pcm(), narration_prompt(), Path, ProgressCb, Narrador TTS con Gemini (audio cinematográfico, estilo por prompt). Usa el… (+3 more)

### Community 145 - "TTS Engines"
Cohesion: 0.21
Nodes (11): Motores TTS con su disponibilidad REAL en esta máquina y sus voces., tts_engines(), available(), _get_kokoro(), Path, ProgressCb, Narrador con voz IA (TTS) usando Kokoro (ONNX). Kokoro-onnx corre nativo en…, Divide en frases (por puntuación y saltos de línea) para mejor prosodia. (+3 more)

### Community 146 - "Effective Text Style"
Cohesion: 0.24
Nodes (5): effective_text_style(), Estilo efectivo de un text clip: la pista aporta la base y el clip la sobre-…, BuildAssInheritanceTest, EffectiveStyleTest, Herencia pista→texto: estilo efectivo (la pista es base, el clip override).

### Community 147 - "Background Composition Tests"
Cohesion: 0.35
Nodes (3): skipUnless, Export de verdad: el matte y el croma deben dejar ver la pista inferior., RealCompositionTest

### Community 148 - "Background Integration Tests"
Cohesion: 0.23
Nodes (6): EndToEndTest, Path, skipUnless, La condición que pedía el diseño: misma config → cero inferencias., Vídeo sintético: un óvalo claro (el "sujeto") sobre fondo oscuro., _subject_video()

### Community 150 - "MCP DTO Tests"
Cohesion: 0.24
Nodes (3): ClipIdentityDtoTest, _make_project(), ProjectContextTest

### Community 152 - "Timeline Ops Design Notes"
Cohesion: 0.18
Nodes (12): Consolidación quirúrgica, no una mega-tool, dry_run — efecto previsto sin aplicar, export_project — render caro, no deshacible, set_project_format — reescala/reencuadra todo, timeline_store.apply_op (snapshot→validar→guardar), update_clip(clip_id, patch) — tool consolidada, Etapa 4.5 — poner al día la edición MCP-only (setters escalares, effects, keyframes), Fragmentación espejo JS↔Python con golden fixtures compartidos (+4 more)

### Community 153 - "MCP Usage Docs"
Cohesion: 0.18
Nodes (12): Auditoría en backend/data/mcp_audit.jsonl, Backend FastAPI (app.main:app vía uvicorn), Catálogo de 50 tools (14 read / 33 write / 3 destructive), Coherencia: IA y usuario comparten el mismo proceso, Validación E2E manual (no automatizable en CI), Endpoint http://127.0.0.1:8000/mcp (streamable-HTTP), Errores estructurados (8 códigos), MCP del editor (video-yt) (+4 more)

### Community 154 - "Paper Timeline Bridge"
Cohesion: 0.20
Nodes (11): paperMutateClip(), baseClip(), interpOf(), isPaperFoldClip(), PAPER_FOLD_CLOSE_CLIP, PAPER_FOLD_OPEN_CLIP, PAPER_FOLD_TRACK, PAPER_OBJECT_CLIP (+3 more)

### Community 155 - "Gemini AI Provider"
Cohesion: 0.18
Nodes (5): AIProvider, GeminiProvider, Corre el loop de tool-calling, emitiendo eventos. Devuelve el texto final., CallTool, Emit

### Community 156 - "Font Resolution & ASS Filter"
Cohesion: 0.24
Nodes (7): ass_overlay_filter(), Ruta al TTF: primero fuentes embebidas (Anton…), luego Windows/Fonts., Filtro ass= de ffmpeg, con fontsdir si hay TTF embebidos (Anton…)., resolve_font_path(), ass_filter_path(), Escapa una ruta Windows para el filtro ass= de ffmpeg., BundledFontsTest

### Community 157 - "GIF Probing"
Cohesion: 0.27
Nodes (7): probe_gif(), Salta una cadena de sub-bloques GIF (``size`` byte + datos, terminada en 0)., Metadatos de un GIF leyendo su cabecera (sin dependencias externas). Recorre…, _skip_subblocks(), _mini_gif(), ProbeGifTest, GIF sintético válido en estructura de bloques (no en LZW) para probar el parser.

### Community 158 - "API Key Testing"
Cohesion: 0.27
Nodes (10): _classify(), _gemini(), _http(), _openai_compatible(), probe(), Prueba de API keys: verifica que cada clave autentica contra su proveedor. Cada…, Prueba TODAS las claves registradas (primaria + extra), en paralelo. Devuelve…, Devuelve el código HTTP (o -1 si no hubo respuesta). (+2 more)

### Community 159 - "Word Window Tests"
Cohesion: 0.31
Nodes (6): Ventana temporal absoluta ``(t0, t1)`` de cada palabra. Usa ``clip.words``…, word_windows(), CaptionDialoguesRealTimingTest, Karaoke del export con timing REAL por palabra (words[] del clip). Con words[]…, _text_clip(), WordWindowsTest

### Community 160 - "CUDA Fallback Tests"
Cohesion: 0.22
Nodes (5): _CudaThenCpu, _Info, Fallback CUDA → CPU de Whisper cuando la inferencia GPU revienta., _Seg, TranscribeCudaFallbackTest

### Community 161 - "Async Jobs Docs"
Cohesion: 0.22
Nodes (11): add_subtitles(source_clip_id, segments), add_to_timeline(project_id, kind, index), analyze_youtube(url) — tramos del heatmap, create_clips_from_segments(project_id, url, segments, crop_mode), export_project(project_id), Flujo A — create_short_from_youtube (automático), Flujo B — make_short_from_library, Auto-detección de GPU (whisper CUDA + FFmpeg NVENC) (+3 more)

### Community 162 - "Transcribe Settings"
Cohesion: 0.29
Nodes (9): extract_meta(), Copia identificadores y ajustes seguros. Omite textos largos., transcribe_models(), load(), normalize(), public_view(), Modelo de transcripción por defecto (Configuración del editor)., Usa el modelo pedido si es válido; si no, el guardado en ajustes. (+1 more)

### Community 163 - "HyperFrames Capture"
Cohesion: 0.40
Nodes (3): HyperFramesRenderer, Path, Captura PNG (con alfa) en los instantes ``times`` reutilizando UNA página.…

### Community 164 - "GSAP Vendor Bundle C"
Cohesion: 0.29
Nodes (10): be(), _d(), fa(), ia(), ie(), je(), ke(), le() (+2 more)

### Community 165 - "Derived Cache Tests"
Cohesion: 0.33
Nodes (3): DerivedTest, skipUnless, Un clip más largo que lo procesado no debe quedarse sin fotogramas.

### Community 166 - "Matte Frame Index Tests"
Cohesion: 0.20
Nodes (3): FrameIndexTest, La clave base NO depende de in/out: cortar no invalida la caché., Mover un slider NO debe re-ejecutar el modelo.

### Community 167 - "Text Fragmentation Goldens"
Cohesion: 0.20
Nodes (9): abs, allWords, caps, noWords, parent, re, segment, src (+1 more)

### Community 168 - "Background Cache Keys"
Cohesion: 0.22
Nodes (9): _embed_key(), Clave de los embeddings: fuente + backbone + cadencia/alto. SIN puntos., base_key(), derive_key(), _digest(), is_interactive_provider(), True para los proveedores guiados por puntos (SAM): el pincel = prompt., Clave del matte CRUDO: fuente + modelo + cadencia/resolución del matte. No… (+1 more)

### Community 169 - "FastAPI Lifespan & Requirements"
Cohesion: 0.22
Nodes (9): _lifespan(), Arranque/parada: diagnóstico de motores + session-manager del MCP. Montar la…, Abre el session-manager del MCP. Lo usa el lifespan de FastAPI., session_lifespan(), Backend Requirements, FastAPI, Faster Whisper, Kokoro ONNX (+1 more)

### Community 170 - "Motion HTML Generator"
Cohesion: 0.33
Nodes (8): _anton_data_uri(), _css(), generate_html(), _gsap_src(), Composition Generator: ``MotionComposition`` → HTML/CSS/GSAP autocontenido. El…, Devuelve el documento HTML completo y autocontenido de la composición., _runtime_src(), preview_html()

### Community 171 - "GSAP Vendor Bundle D"
Cohesion: 0.28
Nodes (9): Aa(), Animation(), ha(), ja(), Jc(), Lc(), Ra(), Sa() (+1 more)

### Community 174 - "Chroma LUT Golden Tests"
Cohesion: 0.22
Nodes (3): GoldenFixtureTest, ``shared/bg_chroma_golden.json`` ancla el espejo JS↔Python. El JS no puede…, Sin pluma ni correcciones, derive_matte == LUT (nada de coma flotante).

### Community 178 - "App Favicon"
Cohesion: 0.36
Nodes (9): Alpha Mask 'a' (Bolt Silhouette Clip), App Favicon (48x46 Bolt Icon), Lightning Bolt Logo Mark, Brand Palette (Violet #863bff / #7e14ff, Lilac #ede6ff, Cyan #47bfff), Display-P3 Wide-Gamut Color Fallback, Figma Export Provenance (effect1_foregroundBlur_2002_17158), Gaussian Blur Filter Set (b through p), Blurred Ellipse Glow Layer (+1 more)

### Community 179 - "SAM Encode & Decode"
Cohesion: 0.32
Nodes (4): ndarray, Fotograma RGB (uint8, HxWx3) -> embeddings (nivel 1, cacheable)., embeddings + puntos -> matte (uint8, HxW, 0..255). ``points``: lista de ``(x,…, Conveniencia: encode + decode en un paso (para imágenes/still).

### Community 180 - "Clip Audio Mixing"
Cohesion: 0.36
Nodes (4): clip_mixes_audio(), Si un clip de la timeline aporta audio al mix (preview y ffmpeg)., False si la pista o el clip están silenciados., ClipMuteTest

### Community 181 - "Fonts & Karaoke Notes"
Cohesion: 0.32
Nodes (8): Anton Font (backend, para el render/burn-in), SIL Open Font License 1.1 (fuentes del backend), Herencia pista→texto (effective_text_style / effectiveTextStyle), Karaoke real en export (text_ass.word_windows), migrations.py — schema_version=2 con migración lazy al leer, words[] reales de Whisper (Word model, word_timestamps), Anton Font (frontend, para el preview), SIL Open Font License 1.1 (fuentes del frontend)

### Community 184 - "MCP Access Policy Design"
Cohesion: 0.32
Nodes (8): Gate confirm=true para operaciones destructive (REQUIRE_CONFIRM_DESTRUCTIVE), delete_media — único destructivo sin undo (borra el archivo), Enum cerrado de 8 códigos de error MCP, MCPError (code, message, hint, retryable, param), Etiquetado meta.domain + annotations (readOnly/destructive/idempotent hints), registry._wrap — chokepoint único (audit + errores + política), audit.py — JSONL append-only, guarda claves de params nunca valores, registry.py — @tool(access=read|write|destructive) con functools.wraps

### Community 185 - "MCP Capability Layer Docs"
Cohesion: 0.29
Nodes (8): DTO semántico (project_context / clip_summary / clip_detail / job_dto), get_project_context (Capa 0, orientación inicial), Capa DTO semántica + capabilities[] para escalar entre versiones, animate_clip (zoom / giro / slide / aparecer con SFX), describe_capabilities(domain?), generate_voice(text, engine=kokoro|piper|gemini), Resources de solo lectura (capabilities:// config:// help:// project://), set_clip_keyframes(x/y/scale/rotation/opacity)

### Community 186 - "AI Chat Panels"
Cohesion: 0.39
Nodes (7): labelFor(), lastTools(), MOTION_TOOLS, MotionAIChat(), send(), patchLast(), aiChat()

### Community 187 - "Background Provider Contract"
Cohesion: 0.29
Nodes (4): BackgroundRemovalProvider, Contrato mínimo de un modelo de segmentación de fondo. ``matte`` recibe…, Libera recursos (sesión/VRAM). Debe poder llamarse siempre., register()

### Community 188 - "SAM Model Readiness"
Cohesion: 0.38
Nodes (5): _device_setting(), ProviderUnavailable, ProgressCb, ``bg_removal.device`` de Configuración (auto | cuda | dml | cpu)., SAM no puede trabajar (falta modelo, falta onnxruntime…).

### Community 189 - "Overlay Order Tests"
Cohesion: 0.48
Nodes (4): overlay_order(), IDs de clips de vídeo de fondo a frente: pista inferior primero, luego orden en…, _clip(), OverlayOrderTest

### Community 190 - "Add To Timeline Tool"
Cohesion: 0.29
Nodes (7): add_to_timeline(), _probe_duration(), _project_or_raise(), Coloca material en la timeline. asset_kind clips|audios|images|sfx + asset_id…, Duración (s) de un archivo de audio vía ffprobe. Fallback 3.0 si falla., Resuelve un asset del proyecto a los campos que necesita un clip., _resolve_asset()

### Community 191 - "GSAP Vendor Bundle E"
Cohesion: 0.29
Nodes (7): Ab(), Bb(), cb(), Context(), fb(), Gw(), zb()

### Community 197 - "MCP Progress Notes"
Cohesion: 0.29
Nodes (7): Chat IA nativo — agente sobre el MCP existente (cero tools duplicadas), Historial persistente por proyecto (data/conversations/<pid>.json), GeminiProvider (google-genai, gemini-3.6-flash) tras la interfaz AIProvider, ai/mcp_client.py — Client in-process que descubre las tools del MCP, MCP montado en el mismo proceso FastAPI (streamable-HTTP /mcp), docs/superpowers/specs/2026-08-30-mcp-server-base-design.md, Gotcha Gemini 3.x: conservar los parts originales del stream (thought_signature)

### Community 198 - "Clip Visual Props Tests"
Cohesion: 0.29
Nodes (6): out, props, source, target, CLIP_VISUAL_KEYS, pickClipVisualProps()

### Community 199 - "Paper Assets Loader"
Cohesion: 0.33
Nodes (6): EMPTY_ASSETS, loadImage(), loadPaperAssets(), LAYER_URLS, MASK_URLS, OVERLAY_URLS

### Community 200 - "OpenAI-Compatible Provider"
Cohesion: 0.40
Nodes (3): OpenAICompatibleProvider, Proveedores con API compatible con OpenAI: streaming + tool-calling. Un mismo…, Todas las claves del proveedor (para fallback). Local → una ficticia.

### Community 201 - "Agent Retry Tests"
Cohesion: 0.47
Nodes (3): _Err, Exception, RetryableTest

### Community 205 - "Manual Piloting Docs"
Cohesion: 0.33
Nodes (6): Edición transaccional (snapshot → aplicar → validar → guardar), Flujo C — pilotaje manual (control total), get_project_context(project_id), resolve_project(query), undo / redo / checkpoint / restore_checkpoint, update_clip(clip_id, patch)

### Community 206 - "Oxlint Config"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 207 - "Paper Export"
Cohesion: 0.47
Nodes (5): exportPaperFrame(), exportPaperVideo(), FORMATS, outputCanvas(), mediabunny

### Community 208 - "Text Role Helpers"
Cohesion: 0.73
Nodes (4): isCaptionText(), isFreeText(), isGeneratedClip(), textRole()

### Community 209 - "Piper Binary Fetch"
Cohesion: 0.60
Nodes (4): _download(), get_binary(), get_voices(), Descarga Piper (binario) y voces en español mexicano (es_MX). Uso: python…

### Community 211 - "GSAP Vendor Bundle F"
Cohesion: 0.50
Nodes (4): Ud(), vd(), we(), xe()

### Community 214 - "Editor Docs Overview"
Cohesion: 0.67
Nodes (4): IA Chat Assistant, Timeline, Video Editor, Motion Studio

### Community 215 - "Audio FX Grid"
Cohesion: 0.83
Nodes (4): AudioFxGrid(), setFx(), toggle(), valueOf()

### Community 216 - "Keyframe Creation Rules"
Cohesion: 0.67
Nodes (3): Fase A: Reglas de creación, shouldKeyframe, upsertKeyframeAt

## Ambiguous Edges - Review These
- `Endpoint http://127.0.0.1:8000/mcp (streamable-HTTP)` → `Empaquetar como app o desplegar en servidor (pendiente)`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Video Editor Brand Identity (Speed / Energy Motif)` → `Blurred Ellipse Glow Layer`  [AMBIGUOUS]
  frontend/public/favicon.svg · relation: conceptually_related_to

## Knowledge Gaps
- **448 isolated node(s):** `video-yt`, `animated`, `board`, `clip`, `cropA` (+443 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1687 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **52 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Endpoint http://127.0.0.1:8000/mcp (streamable-HTTP)` and `Empaquetar como app o desplegar en servidor (pendiente)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Video Editor Brand Identity (Speed / Energy Motif)` and `Blurred Ellipse Glow Layer`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `Timeline` connect `Timeline Migrations Tests` to `FastAPI Main & Jobs API`, `Heatmap Analysis & Schemas`, `Timeline History Tests`, `MCP Server Core & Registry`, `Jobs & Clip Download`, `Timeline Store Tests`, `Storage & YouTube Audio`, `Timeline Ops Tests`, `MCP Edit Tools`, `Background Composition Tests`, `MCP Audit & AI Agent`, `Background Integration Tests`, `MCP DTO Tests`, `Media Library`, `FFmpeg Command & Matte Alignment`, `Clip Mask Tests`, `MCP DTO & Read Tools`, `Property Ops Tests`, `SAM Config & Timeline Store`, `Clip Spec Tests`, `Subtitle Add Tests`, `Export Preview Parity`, `Background Export Tests`, `App Settings`, `Background Ops Tests`, `Background Cache Tests`, `MCP Edit E45 Tests`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `TimelineClip` connect `ASS Subtitle Builder` to `Heatmap Analysis & Schemas`, `MCP Server Core & Registry`, `Clip Masks & Keyframes (backend)`, `Jobs & Clip Download`, `FFmpeg Compose & Render`, `Timeline Store Tests`, `Storage & YouTube Audio`, `Timeline Ops Tests`, `Clip FX FFmpeg Chain`, `Background Composition Tests`, `Background Integration Tests`, `MCP Audit & AI Agent`, `MCP DTO Tests`, `Effective Text Style`, `Transcript Fragmentation`, `Media Library`, `FFmpeg Command & Matte Alignment`, `Timeline Migrations Tests`, `Word Window Tests`, `Clip Mask Tests`, `Shapes (backend)`, `Property Ops Tests`, `Clip Spec Tests`, `Overlay Order Tests`, `Clip Kind Helpers`, `Export Preview Parity`, `Background Export Tests`, `Background Ops Tests`, `Background Cache Tests`, `MCP Edit E45 Tests`, `Clip Motion Tests`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `VideoEditor()` connect `VideoEditor Layout & Masks` to `Editor Model Tests`, `Canvas Composite Render`, `App Shell & Icons`, `Text Styles Render`, `Frontend API Client & Hooks`, `Paper Model & Editor History`, `Clip Keyframes (frontend)`, `Shapes Geometry`, `Audio Tab & Export Hooks`, `Text Styles Draw`, `Keyframe Editing Handlers`, `Paper Timeline Bridge`, `Canvas Interactions & Layout`, `Timeline Crops & Keyframe UI`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Are the 28 inferred relationships involving `VideoEditor()` (e.g. with `addMask()` and `applyBgAuto()`) actually correct?**
  _`VideoEditor()` has 28 INFERRED edges - model-reasoned connections that need verification._
- **Are the 22 inferred relationships involving `TimelineClip` (e.g. with `MatteAlignmentTest` and `RealCompositionTest`) actually correct?**
  _`TimelineClip` has 22 INFERRED edges - model-reasoned connections that need verification._