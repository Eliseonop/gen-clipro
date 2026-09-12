# Graph Report - video-yt  (2026-09-12)

## Corpus Check
- 21 files · ~265,034 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5151 nodes · 11888 edges · 239 communities (188 shown, 49 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 637 edges (avg confidence: 0.9)
- Token cost: 9,316 input · 2,496 output

## Community Hubs (Navigation)
- FastAPI Main & Jobs API
- MCP Server Core & Registry
- Clip Masks & Keyframes (backend)
- Schemas & Clipper Pipeline
- Editor Model & VideoEditor
- Background Removal UI
- FFmpeg Compose & Render
- Editor Model Tests
- MCP Capabilities & TTS
- Timeline Ops Core
- Clip Keyframes (frontend)
- Clip Background Model
- MCP Media & Render Tools
- VideoEditor Layout & Masks
- Shapes Geometry
- Material Tab Components
- MCP Edit Tools
- Frontend API Client & Hooks
- Timeline UI & Alignment
- Clip Masks (frontend)
- Background Matte Service
- Face Detect & Reframe
- Projects Store
- Jobs & MCP Audio Tools
- MCP Audit & AI Agent
- Clip FX FFmpeg Chain
- Clip Stacking
- Image Import & Probing
- Timeline Ops Tests
- Canvas Interactions & Layout
- Clip Mask Tests
- Media Search & Asset Import
- Media Library
- Storage, Shorts & Videos
- ASS Subtitle Builder
- Motion Service & Validator
- GSAP Vendor Bundle A
- Explore Tab
- Shapes (backend)
- Clip Layout Tests
- yt-dlp Wrapper
- Composition Filter Graph
- Transcript Fragmentation
- MCP DTO & Read Tools
- Timeline History & Undo
- Canvas Composite Render
- Panning & Recipe Layout
- Effects Inspector UI
- Settings UI
- AI Agent Tests
- Recipe Layout (backend)
- SFX Tool Tests
- Property Ops Tests
- Material Tab Interactions
- App Settings
- Text Styles Render
- Timeline Scale & FPS
- Clip Motion Builder
- Paper Animator Model
- SFX Library
- ASS Style Overrides
- Frontend Build Config
- App Shell & Icons
- MCP Edit E45 Tests
- SFX Classify Modal
- Motion Composition Hook
- Motion Validation Tests
- Background Export Tests
- Image Paste & Add Modal
- Clip FX (frontend)
- Motion Models & Templates
- HyperFrames Renderer
- Panel Layout
- Clip Speed
- Karaoke Text FX
- YouTube Audio Import
- AI Chat Panels
- Favorites
- Paper Canvas Renderer
- GPU Probe
- Background Ops Tests
- Timeline Migrations Tests
- Background Integration Tests
- Background Cache Tests
- Gemini TTS Tests
- AI Provider Run Loop
- Overlay Export Filters
- Export Preview Parity
- GSAP Vendor Bundle B
- AI Provider Selection Tests
- MCP Capabilities Tests
- Explore Keyword Suggestions
- Matte Build Tests
- MCP Edit Tool Tests
- Paper Composition Hook
- Still Image FFmpeg Input
- Multi API Key Store
- Matte Alignment Tests
- Audio Tab
- Text Fragmentation Goldens
- Clip Animation Pose
- AI Provider Config
- Motion Runtime JS
- GSAP Tween Core
- Timeline Store Adapter
- GPU Selection Tests
- AI Conversations Store
- Clip Layout (backend)
- Motion HTML Generator
- Background Endpoints Tests
- Derive Matte Tests
- Transform & Mask Inspector
- Keyframe Editing Handlers
- Background Provider Interface
- ONNX Matte Provider
- Provider Registry Tests
- Clip Kind Helpers
- Reframe Math
- Whisper Transcription
- Word Shaping Tests
- Clip Background Tests
- Popover & Select Components
- Playback Control Handlers
- Keyboard & Seek Handlers
- Paper Erase Layer
- MCP Media Tool Tests
- YouTube History
- MCP Audio Tests
- MCP Audit Tests
- MCP Layered Discovery Design
- Workflow-as-Job Design
- Subtitle Themes UI
- SFX Favorites Filter
- Chroma Key Parity Tests
- Crops Panel
- Align Guides
- SAM 2.1 Provider
- Compose Slot Layout
- Export Settings
- Gemini TTS
- Background Composition Tests
- Clip Motion Tests
- MCP Registry Tests
- MCP Render Tests
- Timeline Ops Design Notes
- MCP Usage Docs
- Gemini AI Provider
- MCP Vision Tools
- Word Window Tests
- Timeline Store Tests
- CUDA Fallback Tests
- Async Jobs Docs
- GPU Encoder Selection
- GSAP Vendor Bundle C
- Derived Cache Tests
- Matte Frame Index Tests
- Hero Image Asset
- Paper Timeline Bridge
- Paper Image Decoding
- API Key Testing
- GSAP Vendor Bundle D
- API Key Settings Tests
- Fake SAM Test Doubles
- Chroma LUT Golden Tests
- ONNX Provider Tests
- MCP Context Tests
- MCP Structured Errors Tests
- App Favicon
- Provider Model Download
- SAM Encode & Decode
- Clip Audio Mixing
- Fonts & Karaoke Notes
- Effective Text Style
- Clip Spec Tests
- MCP Access Policy Design
- MCP Capability Layer Docs
- Overlay Order Tests
- GSAP Vendor Bundle E
- Fake Background Provider
- Create Clips Tests
- Subtitle Add Tests
- Transcribe Settings Tests
- MCP Progress Notes
- Oxlint Config
- Icon Sprite Sheet
- Vite Logo Asset
- Background Patch Handlers
- Paper Assets Loader
- OpenAI-Compatible Provider
- SAM Model Readiness
- Editor Docs Overview
- Agent Retry Tests
- SAM Assisted Tests
- Project Save Tests
- Manual Piloting Docs
- Frontend Readme & Entry
- Paper Export
- Text Role Helpers
- Piper Binary Fetch
- Conversation Store Tests
- Library Media Resolve Tests
- Job Management Tests
- React Logo Asset
- Track & Text Creation
- Clipboard Copy Handlers
- GSAP Vendor Bundle F
- Chroma Filter Tests
- Chroma Morphology Tests
- Cut Audio Args Tests
- Track Style Persistence
- Keyframe Creation Rules
- Mask Retype Handlers
- Keyframe Deletion Handlers
- GSAP Vendor Bundle G
- TTS Dependencies
- CapCut Parity Checklist
- Declarative Prop Registry
- MCP Tool Reclassification
- BaseException Root
- FastAPI Dependency
- Pydantic BaseModel
- Background Removal Doc
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
- skipUnless Helper

## God Nodes (most connected - your core abstractions)
1. `TimelineClip` - 153 edges
2. `Timeline` - 139 edges
3. `VideoEditor()` - 137 edges
4. `TimelineTrack` - 78 edges
5. `get_project()` - 58 edges
6. `Project` - 53 edges
7. `build_command()` - 42 edges
8. `MotionComposition` - 41 edges
9. `ClipInfo` - 40 edges
10. `base_tl()` - 38 edges

## Surprising Connections (you probably didn't know these)
- `Anton Font (backend, para el render/burn-in)` --semantically_similar_to--> `Anton Font (frontend, para el preview)`  [INFERRED] [semantically similar]
  backend/app/fonts/OFL.txt → frontend/public/fonts/OFL-Anton.txt
- `SIL Open Font License 1.1 (fuentes del backend)` --semantically_similar_to--> `SIL Open Font License 1.1 (fuentes del frontend)`  [INFERRED] [semantically similar]
  backend/app/fonts/OFL.txt → frontend/public/fonts/OFL-Anton.txt
- `Empaquetar como app o desplegar en servidor (pendiente)` --conceptually_related_to--> `Endpoint http://127.0.0.1:8000/mcp (streamable-HTTP)`  [AMBIGUOUS]
  README.md → docs/MCP_USO.md
- `Video Editor` --references--> `yt-dlp`  [INFERRED]
  docs/EDITOR.md → backend/requirements.txt
- `crop_modes()` --uses--> `CropMode`  [INFERRED]
  backend/app/mcp_server/capabilities.py → backend/app/schemas.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Capa de descubrimiento progresivo del MCP** — docs_mcp_uso_describe_capabilities, docs_mcp_auditoria_rediseno_help, docs_mcp_auditoria_rediseno_resources_mcp, docs_mcp_auditoria_rediseno_get_project_context, docs_mcp_auditoria_rediseno_meta_annotations [EXTRACTED 1.00]
- **Capa de descubrimiento del MCP** — docs_mcp_uso_describe_capabilities, docs_mcp_uso_list_projects, docs_mcp_uso_resolve_project, docs_mcp_uso_resources, docs_mcp_uso_get_project_context [EXTRACTED 1.00]
- **Pasos del flujo C (pilotaje manual YouTube → export)** — docs_mcp_uso_analyze_youtube, docs_mcp_uso_create_clips_from_segments, docs_mcp_uso_add_to_timeline, docs_mcp_uso_set_project_format, docs_mcp_uso_transcribe, docs_mcp_uso_add_subtitles, docs_mcp_uso_export_project, docs_mcp_uso_jobs_wait_for_job [EXTRACTED 1.00]
- **Keyframe System Redesign Phases** — docs_keyframes_rediseno_fase_a, docs_keyframes_rediseno_fase_b, docs_keyframes_rediseno_fase_c, docs_keyframes_rediseno_fase_d, docs_keyframes_rediseno_fase_e [EXTRACTED 1.00]
- **Protección de las 3 operaciones irreversibles** — docs_mcp_auditoria_rediseno_delete_media, docs_mcp_auditoria_rediseno_export_project, docs_mcp_auditoria_rediseno_set_project_format, docs_mcp_auditoria_rediseno_dry_run, docs_mcp_auditoria_rediseno_confirm_destructive [EXTRACTED 1.00]
- **Sistema de errores estructurados en el chokepoint** — docs_mcp_auditoria_rediseno_mcperror, docs_mcp_auditoria_rediseno_error_codes, docs_mcp_auditoria_rediseno_registry_wrap, docs_mcp_progreso_registry [EXTRACTED 1.00]
- **SVG <symbol> sprite referenced by id via <use>** — frontend_public_icons_sprite_sheet, frontend_public_icons_bluesky_icon, frontend_public_icons_discord_icon, frontend_public_icons_documentation_icon, frontend_public_icons_github_icon, frontend_public_icons_social_icon, frontend_public_icons_x_icon [EXTRACTED 1.00]
- **AI Features Integration** — docs_editor_ia_chat, docs_editor_tts, docs_editor_bg_removal, backend_requirements_faster_whisper [INFERRED 0.85]
- **Solid black (#08060d) brand marks for external social links** — frontend_public_icons_bluesky_icon, frontend_public_icons_discord_icon, frontend_public_icons_github_icon, frontend_public_icons_x_icon [INFERRED 0.95]
- **Purple (#aa3bff) 1.35 rounded-stroke outline icon style** — frontend_public_icons_documentation_icon, frontend_public_icons_social_icon, frontend_public_icons_sprite_sheet [INFERRED 0.95]

## Communities (239 total, 49 thin omitted)

### Community 0 - "FastAPI Main & Jobs API"
Cohesion: 0.03
Nodes (128): cache_stats(), create_job(), get_job(), Renderiza la composición y la inserta en la timeline como clip 'motion'., _run_motion_add(), start_bg_removal_job(), start_motion_add_job(), add_api_key() (+120 more)

### Community 1 - "MCP Server Core & Registry"
Cohesion: 0.03
Nodes (50): Cliente MCP in-process para el agente. Usa el ``Client`` del SDK ``mcp`` 2.x…, Proveedor SAM 2.1 para Eliminar fondo ASISTIDO (segmentación por clics). A…, Configuración central del proyecto. Todos los valores por defecto viven aquí…, gather_theme_text(), MCP server: capa de control para que una IA opere el editor. Se monta en el…, _classify_value_error(), Exception, Registro de tools + capa de política + auditoría. Toda tool del MCP se declara… (+42 more)

### Community 2 - "Clip Masks & Keyframes (backend)"
Cohesion: 0.06
Nodes (74): clip_pose(), interp_track(), normalize_track(), _num(), Any, Animación de clip (posición / escala / rotación / opacidad). Espejo de…, static_pose(), apply_volume_fade() (+66 more)

### Community 3 - "Schemas & Clipper Pipeline"
Cohesion: 0.04
Nodes (66): _crop_filter(), _cut_audio_args(), _cut_clip(), _download_source(), generate_clips(), Path, ProgressCb, Descarga del vídeo fuente y recorte de cada tramo a formato vertical 9:16.… (+58 more)

### Community 4 - "Editor Model & VideoEditor"
Cohesion: 0.05
Nodes (75): out, props, source, target, applyClipVisualProps(), applyFaceTrack(), canCaptionClip(), canLayerClip() (+67 more)

### Community 5 - "Background Removal UI"
Cohesion: 0.06
Nodes (69): alphaCache, bgMeta(), blurCache, blurCanvasInPlace(), cutCache, cutoutDrawable(), editsSig(), evict() (+61 more)

### Community 6 - "FFmpeg Compose & Render"
Cohesion: 0.05
Nodes (67): auto_active(), _pw_expr(), Expresión FFmpeg de interpolación lineal por tramos value(t). Antes de ``t0``…, _alpha_chain(), ass_overlay_filter(), _bg_input_args(), _bg_source_chain(), build_command() (+59 more)

### Community 7 - "Editor Model Tests"
Cohesion: 0.03
Nodes (74): durationPatchToMatch(), isGeneratedDurationClip(), matchClipsToFirstDuration(), sendClipsBehind(), afterDel, audCut, audio, autoSplit (+66 more)

### Community 8 - "MCP Capabilities & TTS"
Cohesion: 0.05
Nodes (61): crop_modes(), describe(), domains(), overview(), Capacidades descubribles del editor (fuente única para tools + resources). Fase…, Capacidades de UN dominio: verbos, valores válidos y guía. ValueError si no…, Info de ejecución: GPU, proveedor de IA, binarios, defaults, rutas., {dominio: [tools]} a partir del mapa real de help_content.TOOL_DOMAINS. (+53 more)

### Community 9 - "Timeline Ops Core"
Cohesion: 0.10
Nodes (67): Timeline, add_clip(), add_shape(), add_subtitles(), add_track(), animate_clip(), _apply_audio_to_clip(), _clamp01() (+59 more)

### Community 10 - "Clip Keyframes (frontend)"
Cohesion: 0.07
Nodes (64): applyVolumeFade(), AUDIO_FX_KEYS, audioStatic(), canKeyframe(), clampVolume(), clipPropsAt(), clipVolumeAt(), copyKeyframeAt() (+56 more)

### Community 11 - "Clip Background Model"
Cohesion: 0.06
Nodes (64): clip_range(), Tramo de la FUENTE que necesita el clip, con margen., auto_requested(), base_key(), bg_active(), bg_capable(), chroma_active(), chroma_alpha8() (+56 more)

### Community 12 - "MCP Media & Render Tools"
Cohesion: 0.05
Nodes (56): all_jobs(), Todos los jobs conocidos (en memoria, este proceso)., analyze_dto(), job_dto(), Resultado de analyze_youtube: info del vídeo + tramos del heatmap., Estado de un job + resumen del resultado según su tipo., MCPError, Decorador: registra ``fn`` como tool del MCP con auditoría y política. (+48 more)

### Community 13 - "VideoEditor Layout & Masks"
Cohesion: 0.04
Nodes (16): needsFreeLayout(), VideoEditor(), addAsset(), addMask(), applyFragment(), applyFragmentTrack(), applyFreeLayout(), applyRemoveTrack() (+8 more)

### Community 14 - "Shapes Geometry"
Cohesion: 0.06
Nodes (51): ACTIONS, EdLayer(), EdShape(), EdShapes(), applyShapePose(), ARROW_TYPES, clampN(), curvedArrowPoly() (+43 more)

### Community 15 - "Material Tab Components"
Cohesion: 0.06
Nodes (38): CargarCustom(), DROP_HINT, droppedUrl(), importMedia(), onVidDrop(), isAudioFile(), isVideoFile(), MAT_NAV (+30 more)

### Community 16 - "MCP Edit Tools"
Cohesion: 0.07
Nodes (58): add_shape(), add_subtitles(), add_to_timeline(), add_track(), animate_clip(), _apply(), checkpoint(), duplicate_clip() (+50 more)

### Community 17 - "Frontend API Client & Hooks"
Cohesion: 0.08
Nodes (52): useExportJob(), doExport(), useSubtitles(), requestSubtitles(), MotionCanvas(), pollJob(), addApiKey(), analyze() (+44 more)

### Community 18 - "Timeline UI & Alignment"
Cohesion: 0.07
Nodes (46): applyAudioSpeedToLinkedText(), clipCopyText(), clipDur(), clipSourceDur(), displayTracks(), linkedPartnerName(), scaleTextClipFromAnchor(), trackKindForClip() (+38 more)

### Community 19 - "Clip Masks (frontend)"
Cohesion: 0.07
Nodes (50): clipMasksAt(), KF_PROP_KEYS, applyMasksToLayer(), beginMaskLayer(), clamp(), clipMasks(), defaultMask(), endMaskLayer() (+42 more)

### Community 20 - "Background Matte Service"
Cohesion: 0.08
Nodes (53): BgCancelled, build_clip_bg_mask(), build_matte(), build_timeline_bg_masks(), clear_cache(), _contiguous_range(), covered_range(), _embed_key() (+45 more)

### Community 21 - "Face Detect & Reframe"
Cohesion: 0.06
Nodes (51): _detect_faces(), dims(), face_center_x(), face_track(), _get_detector(), _model_path(), _prep_frame(), ndarray (+43 more)

### Community 22 - "Projects Store"
Cohesion: 0.08
Nodes (39): create_project(), list_projects(), add_audio(), add_clips(), add_image(), add_transcript(), apply_manifest(), create_project() (+31 more)

### Community 23 - "Jobs & MCP Audio Tools"
Cohesion: 0.08
Nodes (50): _find_timeline_clip_by_filename(), JobCancelled, _mmss(), Exception, Gestor de trabajos en memoria. Cada petición de clips crea un Job con un id. El…, Se lanza dentro del bucle de un job cuando se pidió cancelarlo., Pide cancelar un job (cooperativo). Devuelve False si no existe o ya terminó.…, Runner común para los workflows de short: corre ``builder`` con progreso. (+42 more)

### Community 24 - "MCP Audit & AI Agent"
Cohesion: 0.05
Nodes (39): _access(), _is_mutating(), Agente del Chat IA: orquesta proveedor ↔ tools MCP y emite eventos. Generador…, Sondea get_job emitiendo progreso hasta que termina. Devuelve el estado final., Corre un turno de chat. Emite: start/text/tool_start/tool_result/job/…, Envuelve run_chat como stream SSE (``data: {json}\\n\\n``)., run_chat(), sse() (+31 more)

### Community 25 - "Clip FX FFmpeg Chain"
Cohesion: 0.09
Nodes (25): audio_fx_chain(), _audio_fx_map(), _clamp01(), clip_fx_at(), effects_ffmpeg(), _effects_map(), _field(), _fx_num() (+17 more)

### Community 26 - "Clip Stacking"
Cohesion: 0.06
Nodes (46): clipsOverlap(), clipWidth(), clusterKey(), clusterSpan(), COVER_RATIO, coversMost(), frontClipId(), fullyCovers() (+38 more)

### Community 27 - "Image Import & Probing"
Cohesion: 0.07
Nodes (23): _clean_filename(), _ext_from_magic(), fetch_image(), import_image(), _new_id(), probe_gif(), probe_size(), Path (+15 more)

### Community 28 - "Timeline Ops Tests"
Cohesion: 0.07
Nodes (11): AddClipTest, AddTrackTest, base_tl(), MoveClipTest, Contrato de timeline_ops: operaciones estructurales puras sobre el Timeline.…, ReframeClipTest, RemoveTest, SetClipLayoutTest (+3 more)

### Community 29 - "Canvas Interactions & Layout"
Cohesion: 0.15
Nodes (45): clipEnd(), timelineToSource(), createCanvasDownHandler(), createMainDownHandler(), createResultDownHandler(), handleBgPointer(), handleMaskPointer(), listenMove() (+37 more)

### Community 30 - "Clip Mask Tests"
Cohesion: 0.07
Nodes (10): AlfaTest, _clip(), ExportTest, GeometriaTest, _graph(), KeyframesTest, ModeloTest, PersistenciaTest (+2 more)

### Community 31 - "Media Search & Asset Import"
Cohesion: 0.10
Nodes (26): allowed_download_url(), AssetImportService, _download(), _filename(), Importa un resultado de Explorar al almacenamiento local del proyecto., _fetch_json(), _int(), map_giphy_gif() (+18 more)

### Community 32 - "Media Library"
Cohesion: 0.10
Nodes (23): _file(), _find_item(), get_item(), infer_origin_source(), library_root(), LibraryInUseError, list_library(), _load() (+15 more)

### Community 33 - "Storage, Shorts & Videos"
Cohesion: 0.09
Nodes (40): _add_clip_to_timeline(), build_short_from_library(), build_short_from_youtube(), _clip_dict(), _export(), ProgressCb, Workflows de alto nivel: crear un short de punta a punta. Componen los…, Como el anterior pero desde un clip que YA está en el proyecto (sin descargar). (+32 more)

### Community 34 - "ASS Subtitle Builder"
Cohesion: 0.11
Nodes (17): Un elemento colocado en una pista de la timeline. ``start`` es la posición en…, TimelineClip, active_word_index(), _applied_style(), ass_time(), build_ass(), caption_dialogues(), _clip_dur() (+9 more)

### Community 35 - "Motion Service & Validator"
Cohesion: 0.10
Nodes (37): motion_update(), _default_times(), _montage(), motion_add_to_timeline(), motion_create_composition(), motion_get_composition(), motion_get_frame(), motion_list_templates() (+29 more)

### Community 36 - "GSAP Vendor Bundle A"
Cohesion: 0.06
Nodes (15): ee(), Jd(), Kd(), la(), Ld(), ma(), Md(), na() (+7 more)

### Community 37 - "Explore Tab"
Cohesion: 0.12
Nodes (34): EdExplore(), addItem(), ExploreCard(), ExplorePreview(), CLASSIC_SUGGESTIONS, cloneExploreSession(), collectThemeText(), EMPTY_EXPLORE_SESSION (+26 more)

### Community 38 - "Shapes (backend)"
Cohesion: 0.11
Nodes (26): _bgr(), _clamp(), _curved_arrow_poly(), default_shape(), _ellipse_pts(), _heart_pts(), _hex(), _map_pt() (+18 more)

### Community 39 - "Clip Layout Tests"
Cohesion: 0.05
Nodes (36): asFreeObject, back, biggerCrop, clamped, containClip, containWin, cover169, crop0 (+28 more)

### Community 40 - "yt-dlp Wrapper"
Cohesion: 0.10
Nodes (19): auth_attempts(), call(), _configured_browser(), _cookie_file(), friendly_error(), is_auth_error(), is_cookie_source_error(), _msg() (+11 more)

### Community 41 - "Composition Filter Graph"
Cohesion: 0.11
Nodes (20): _filter_graph(), generate_composition(), is_http_url(), Path, ProgressCb, Genera un clip 9:16 combinando hasta 2 capas (fuentes distintas o la misma)., resolve_layer_source(), resolve_local_media() (+12 more)

### Community 42 - "Transcript Fragmentation"
Cohesion: 0.10
Nodes (21): chunk_caption_text(), _clip_dur(), _get(), make_text_clip(), _r3(), Fragmentación de transcripción → clips de texto. ESPEJO de la lógica JS.…, Segmentos de Whisper → clips de texto, recortados al tramo del clip fuente, con…, _rel_segment_words() (+13 more)

### Community 43 - "MCP DTO & Read Tools"
Cohesion: 0.10
Nodes (32): project_summary(), Resumen minúsculo de un proyecto para listar/desambiguar., aspect_ratio(), clip_detail(), _clip_summary(), _clip_timeline_duration(), _dup_counts(), _format_dto() (+24 more)

### Community 44 - "Timeline History & Undo"
Cohesion: 0.10
Nodes (23): _history(), get_project_context(), _history_summary(), Resumen del proyecto (formato, material, timeline, historial). Primer paso., Registra las tools de contexto en el MCP (con auditoría/política)., register(), can_redo(), can_undo() (+15 more)

### Community 45 - "Canvas Composite Render"
Cohesion: 0.12
Nodes (32): isVisualClip(), cache, decodeGif(), gifFrameAt(), gifInfo(), boxToDest(), drawBackdrop(), drawBgBrushCursor() (+24 more)

### Community 46 - "Panning & Recipe Layout"
Cohesion: 0.09
Nodes (29): blit(), drawReframe(), fitOf(), frameAt(), isNearCropCorner(), KF_COLORS, modeOf(), OUT_RATIO (+21 more)

### Community 47 - "Effects Inspector UI"
Cohesion: 0.11
Nodes (28): AudioFxGrid(), setFx(), toggle(), valueOf(), EdEffects(), patchEffects(), toggleVideo(), fxTabs() (+20 more)

### Community 48 - "Settings UI"
Cohesion: 0.10
Nodes (26): API_PROVIDERS, AUDIO_DB_PRESETS, EdSettings(), cancel(), reload(), reloadAi(), remove(), runTest() (+18 more)

### Community 49 - "AI Agent Tests"
Cohesion: 0.07
Nodes (16): _clean_schema(), McpToolset, Poda un JSON-Schema a lo que entiende el function-calling de los LLM., Normaliza el CallToolResult a ``{ok, data, text}``. En error, el SDK prefija el…, Sesión abierta contra el MCP in-process para un turno de chat., Declaraciones de función provider-agnósticas (name/description/parameters)., _result_data(), AgentTest (+8 more)

### Community 50 - "Recipe Layout (backend)"
Cohesion: 0.13
Nodes (16): contain_dest(), contain_scale_filter(), dual_slot_wh(), dual_stack_name(), _field(), is_master_reframe(), join_dual_filters(), Any (+8 more)

### Community 51 - "SFX Tool Tests"
Cohesion: 0.08
Nodes (8): AddSfxHttpTest, AddSfxNoLibraryTest, AddSfxTest, CreateSfxCategoryTest, Path, Alta de SFX: copia el audio, registra JSON y crea categoría si hace falta., UpdateSfxTest, _write_lib()

### Community 52 - "Property Ops Tests"
Cohesion: 0.13
Nodes (7): CapabilitiesTest, _clip(), LinkTracksTest, PropertyOpsTest, Etapa 4.5 — ops nuevas de propiedades por-clip / figuras (timeline_ops puro)., ShapeOpTest, _tl()

### Community 53 - "Material Tab Interactions"
Cohesion: 0.08
Nodes (20): dragMediaKind(), EdMaterial(), ingestClipboard(), loadYt(), onFileDragEnter(), onFileDragLeave(), onFileDragOver(), onFileDrop() (+12 more)

### Community 54 - "App Settings"
Cohesion: 0.13
Nodes (31): Prueba TODAS las claves registradas (primaria + extra), en paralelo. Devuelve…, test_all(), delete_api_key(), get_settings(), put_settings(), put_timeline(), set_api_key(), add_key() (+23 more)

### Community 55 - "Text Styles Render"
Cohesion: 0.10
Nodes (30): buildSubtitleClips(), themeById(), applyOrClearTheme(), base, clampN(), cssFont(), CUSTOM_FONTS, drawTextClip() (+22 more)

### Community 56 - "Timeline Scale & FPS"
Cohesion: 0.12
Nodes (27): anchorScroll(), buildTicks(), clamp(), clampPps(), fmtRuler(), maxPps(), minPps(), pad2() (+19 more)

### Community 57 - "Clip Motion Builder"
Cohesion: 0.13
Nodes (30): audio_src_at(), build_motion_items(), downsample_envelope(), _from_amp(), hold_after_peak(), _item(), _kind(), _lerp() (+22 more)

### Community 58 - "Paper Animator Model"
Cohesion: 0.08
Nodes (16): BLEND_MODES, clamp(), DEFAULT_BACKGROUND, DEFAULT_OBJECT, DEFAULT_PAPER_STATE, EASING_OPTIONS, EXPORT_FORMATS, KF_COPY_KEYS (+8 more)

### Community 59 - "SFX Library"
Cohesion: 0.17
Nodes (29): add_sound(), _cat_dto(), create_category(), _ensure_dir(), _entry(), _find_sonido(), get_base(), _library_from_scan() (+21 more)

### Community 60 - "ASS Style Overrides"
Cohesion: 0.14
Nodes (27): _active_override(), _alignment(), alpha_hex(), _alpha_tags(), ass_bgr(), _clamp01(), _esc_ass(), _idle_override() (+19 more)

### Community 61 - "Frontend Build Config"
Cohesion: 0.07
Nodes (26): dependencies, material-icons, mediabunny, react, react-dom, devDependencies, oxlint, @types/react (+18 more)

### Community 62 - "App Shell & Icons"
Cohesion: 0.13
Nodes (18): App(), confirmDeleteProject(), navigate(), onCreate(), refresh(), readHash(), ConfirmModal(), Icon() (+10 more)

### Community 63 - "MCP Edit E45 Tests"
Cohesion: 0.11
Nodes (7): Una pista del editor (V1, V2… / A1, A2… / T1)., TimelineTrack, ComposeStillCommandTest, skipUnless, EditE45Test, _timeline(), OverlayChainOrderTest

### Community 64 - "SFX Classify Modal"
Cohesion: 0.16
Nodes (24): defaultMeta(), isAudioFile(), SfxCategoryCell(), cancel(), confirm(), SfxClassifyModal(), patch(), rememberCat() (+16 more)

### Community 65 - "Motion Composition Hook"
Cohesion: 0.15
Nodes (21): MotionElements(), clampComposition(), deepMerge(), EASES, EFFECT_TYPES, ENTRANCE_TYPES, EXIT_TYPES, moveLayer() (+13 more)

### Community 66 - "Motion Validation Tests"
Cohesion: 0.21
Nodes (10): MotionLayer, Un elemento de la composición, posicionado en el lienzo de salida. ``x``/``y``…, _check_layer(), _is_css_color(), Validación semántica de una ``MotionComposition`` antes de renderizar. Pydantic…, Devuelve una lista de errores (vacía = válida)., validate(), _comp() (+2 more)

### Community 67 - "Background Export Tests"
Cohesion: 0.21
Nodes (13): _clip(), FilterGraphTest, _graph(), NoRegressionTest, Eliminar fondo en el export: filtergraph y composición real con FFmpeg. Lo que…, Cortar el clip solo mueve el número de arranque: nada que regenerar., chromakey y alphamerge sobreescriben el alfa: hay que multiplicar., El alfa va antes: la velocidad la aplica la cadena de siempre, una vez. (+5 more)

### Community 68 - "Image Paste & Add Modal"
Cohesion: 0.18
Nodes (21): ImageAddModal(), patch(), saveAll(), saveRowByKey(), takeFiles(), collectFromClipboardItems(), collectPastePayload(), dataUrlToFile() (+13 more)

### Community 69 - "Clip FX (frontend)"
Cohesion: 0.11
Nodes (24): applyCanvasFx(), clamp01(), clipFxAt(), effectsCss(), FX_DUR, fxWindows(), lerp(), LOOK_CSS (+16 more)

### Community 70 - "Motion Models & Templates"
Cohesion: 0.19
Nodes (22): Motion Studio: motion graphics editables (composición JSON) integrados en el…, MotionAnimation, MotionComposition, MotionEffect, MotionShape, MotionTween, BaseModel, Modelo de composición de Motion Studio. Una ``MotionComposition`` es la fuente… (+14 more)

### Community 71 - "HyperFrames Renderer"
Cohesion: 0.14
Nodes (13): get_renderer(), Path, ProgressCb, Capa de abstracción del motor de render (spec §6). La UI y el servicio hablan…, (ok, motivo). ok=False si falta el motor/navegador; motivo explica., Devuelve el motor por defecto (HyperFrames sobre Playwright)., RendererAdapter, RenderResult (+5 more)

### Community 72 - "Panel Layout"
Cohesion: 0.16
Nodes (22): measure(), usePanelLayout(), applyPanelDrag(), clampPanelLayout(), KEYS, num(), PANEL_DEFAULTS, PANEL_LAYOUT_KEY (+14 more)

### Community 73 - "Clip Speed"
Cohesion: 0.20
Nodes (13): atempo_chain(), audio_speed_filters(), clip_reverse(), clip_source_duration(), clip_speed(), clip_timeline_duration(), _field(), keep_pitch() (+5 more)

### Community 74 - "Karaoke Text FX"
Cohesion: 0.16
Nodes (22): TextFxPanel(), activeWordIndex(), activeWordIndexFromWords(), applyThemeToStyle(), chunkCaptionText(), clamp01(), hasWordFx(), karaokeOn() (+14 more)

### Community 75 - "YouTube Audio Import"
Cohesion: 0.13
Nodes (13): YouTubeAudioRequest, extract_audio(), is_youtube_url(), probe_duration(), Path, ProgressCb, Extraer el audio de un vídeo de YouTube (yt-dlp + ffmpeg → m4a)., Descarga el audio del vídeo y lo deja en ``out_path`` (m4a). (+5 more)

### Community 76 - "AI Chat Panels"
Cohesion: 0.14
Nodes (20): ACCESS_LABEL, EdChat(), patchLast(), send(), EXAMPLES, fmtAuditTime(), fmtMeta(), McpAuditLog() (+12 more)

### Community 77 - "Favorites"
Cohesion: 0.18
Nodes (19): useFavorites(), isClipFav(), saveTextStyle(), toggleClipFav(), toggleSfx(), audioFavKey(), clipFavRef(), emptyFavorites() (+11 more)

### Community 78 - "Paper Canvas Renderer"
Cohesion: 0.17
Nodes (21): EASING, hexToRgba(), lerp(), seededRandom(), animTime(), createPaperRenderer(), applyTornFilter(), draw() (+13 more)

### Community 79 - "GPU Probe"
Cohesion: 0.15
Nodes (21): _add_nvidia_dll_dirs(), cuda_available(), _cuda_libs_ok(), _dll_loads(), _gpu_disabled(), mark_cuda_broken(), onnx_device_label(), onnx_providers() (+13 more)

### Community 80 - "Background Ops Tests"
Cohesion: 0.13
Nodes (7): BgJobTest, Eliminar fondo: operación de timeline (undo/redo) y endpoints HTTP., El job NO escribe la timeline: devuelve el resultado en el Job., Tocar la tolerancia del croma NO puede borrar el matte ya calculado., Sin registrar, ni la IA ni el undo/redo del backend lo verían., SetClipBgRemovalTest, _tl()

### Community 81 - "Timeline Migrations Tests"
Cohesion: 0.09
Nodes (6): KeepPitchMigrationTest, MigrateTimelineTest, Tests de la migración del JSON del timeline (forward-only, idempotente)., SchemaConsistencyTest, TextRoleMigrationTest, TimelineVersionTest

### Community 82 - "Background Integration Tests"
Cohesion: 0.13
Nodes (11): Eliminar fondo: proveedores de segmentación y servicio de matte. ``clip_bg``…, _filter_script_cmd(), Evita ``[WinError 206]`` (la línea de comandos de Windows tiene un límite de…, Eliminar fondo: el matte tiene que caer en el FOTOGRAMA correcto del export. Es…, EndToEndTest, Path, skipUnless, Eliminar fondo de punta a punta con el MODELO REAL. Vídeo → ONNX → matte en… (+3 more)

### Community 83 - "Background Cache Tests"
Cohesion: 0.13
Nodes (8): CacheBase, MissingRangesTest, Path, Eliminar fondo: caché en dos niveles, rango incremental y proveedores. Los…, ``%06d`` empieza en 000001, así ``-start_number`` cuadra con el índice., `Guardar clip` sobrescribe: mismo nombre y tamaño, otro contenido. Con solo…, Duplicar material idéntico no debería re-inferir... salvo por mtime., SourceIdTest

### Community 84 - "Gemini TTS Tests"
Cohesion: 0.10
Nodes (7): AvailableTest, NarrationPromptTest, PublicSettingsTest, Gemini TTS: prompt de estilo, WAV y disponibilidad sin llamar a la API., _silent_pcm(), VoicesListTest, WriteWavTest

### Community 85 - "AI Provider Run Loop"
Cohesion: 0.16
Nodes (17): _friendly_error(), _is_auth_or_quota(), _is_malformed_toolcall(), _payload_no_image(), Exception, Código HTTP del error (openai usa ``status_code``; google-genai ``code``)., El modelo emitió argumentos de tool que NO son JSON válido (frecuente en…, ¿Transitorio que conviene reintentar? 5xx, saturación o tool-call malformado.… (+9 more)

### Community 86 - "Overlay Export Filters"
Cohesion: 0.19
Nodes (12): _clamp(), _pw_expr_direct(), Expresión FFmpeg para salto directo sin interpolación value(t)., Filtro de reencuadre (simple o doble encuadre). Devuelve (filtro,…, _reframe_filter(), _single_reframe_filter(), _overlay_video_filter(), Crop de fuente (tamaño fijo) + scale/rotate del resultado. Devuelve (filtro,… (+4 more)

### Community 87 - "Export Preview Parity"
Cohesion: 0.22
Nodes (12): _fill_base_cropscale(), Crop+scale de un clip fill: cover como el preview, no letterbox. El editor…, Animación de reencuadre aplicada a un clip. ``zoom`` = fracción de la altura…, Reframe, _clip(), FillCropMatchesPreviewTest, FillPoseKeepsCropTest, _graph() (+4 more)

### Community 88 - "GSAP Vendor Bundle B"
Cohesion: 0.15
Nodes (20): _a(), ac(), Co(), db(), ea(), eb(), ga(), gb() (+12 more)

### Community 89 - "AI Provider Selection Tests"
Cohesion: 0.10
Nodes (3): LmStudioModelsApiTest, ProviderSelectionTest, Selección de proveedor de IA (Gemini / OpenAI / OpenRouter).

### Community 90 - "MCP Capabilities Tests"
Cohesion: 0.14
Nodes (3): CapabilitiesTest, _read(), _text()

### Community 91 - "Explore Keyword Suggestions"
Cohesion: 0.20
Nodes (12): _anthropic_keywords(), extract_keywords(), _first_llm(), _gemini_keywords(), _llm_keywords(), _openai_keywords(), parse_keyword_list(), _post_json() (+4 more)

### Community 92 - "Matte Build Tests"
Cohesion: 0.21
Nodes (5): BuildMatteTest, Mover umbral/pluma/pincel NO debe volver a inferir., Un vídeo de 64 px no se sube a 512: no habría más detalle, solo coste., Pedir más allá del final del vídeo no debe sellar huecos en el meta., Vídeo sintético pequeño (necesita ffmpeg).

### Community 94 - "Paper Composition Hook"
Cohesion: 0.29
Nodes (16): useEditorHistory(), activeKeyframe(), addKeyframe(), extendDuration(), getPath(), keyframeClipboardOf(), newPaperState(), patchKeyframe() (+8 more)

### Community 95 - "Still Image FFmpeg Input"
Cohesion: 0.16
Nodes (7): ffmpeg_input_args(), ffmpeg_trim_window(), _in_out(), Ventana de ``trim`` sobre el input de ffmpeg. El still se genera con ``-loop``…, Args ``-i`` de un clip. Still: loop; vídeo/audio: archivo tal cual. Motion…, FfmpegStillInputTest, ClipKindTest

### Community 96 - "Multi API Key Store"
Cohesion: 0.11
Nodes (4): KeyTestAllTest, KeyTestClassifyTest, MultiKeyStoreTest, Varias API keys por proveedor (fallback) + prueba de claves. - Primaria en…

### Community 97 - "Matte Alignment Tests"
Cohesion: 0.22
Nodes (8): MatteAlignmentTest, Path, skipUnless, El caso que rompe si -start_number no cuadra: el clip empieza en 1,2 s., in_point entre dos fotogramas del matte: el más cercano, no el anterior., El matte va a 10 fps y la salida a 60: el filtro fps debe duplicar., El alfa se aplica ANTES de la velocidad: la hereda sin filtros extra. A 2x, el…, Columna donde está la franja visible en el instante ``t`` del vídeo.

### Community 98 - "Audio Tab"
Cohesion: 0.18
Nodes (13): JobStatusBar(), Toast(), AudioTab(), copyPrompt(), extractYoutube(), generate(), reloadEngines(), saveGeminiKey() (+5 more)

### Community 99 - "Text Fragmentation Goldens"
Cohesion: 0.11
Nodes (15): makeTextClip(), relSegmentWords(), textClipsFromTranscript(), abs, allWords, caps, noWords, parent (+7 more)

### Community 100 - "Clip Animation Pose"
Cohesion: 0.18
Nodes (16): ANIM_PROPS, clipPose(), interpTrack(), legacyAnimPose(), normalizeTrack(), num(), posedTransform(), staticPose() (+8 more)

### Community 101 - "AI Provider Config"
Cohesion: 0.19
Nodes (16): ai_config(), _api_keys(), _auto_provider(), _default_model(), get_provider(), _has_key(), _is_local_provider(), list_lmstudio_models() (+8 more)

### Community 102 - "Motion Runtime JS"
Cohesion: 0.29
Nodes (16): applyEffect(), buildAll(), buildLayer(), buildLine(), entranceVars(), exitVars(), isHorizontal(), notify() (+8 more)

### Community 103 - "GSAP Tween Core"
Cohesion: 0.15
Nodes (17): _assertThisInitialized(), Ec(), Fc(), gc(), ka(), qa(), t(), tb() (+9 more)

### Community 104 - "Timeline Store Adapter"
Cohesion: 0.30
Nodes (15): Guarda la composición del editor de vídeo en el proyecto., save_timeline(), apply_op(), checkpoint(), _current(), _history_path(), _load_history(), Adaptador stateful: liga proyecto + timeline_ops + timeline_history. Es la capa… (+7 more)

### Community 105 - "GPU Selection Tests"
Cohesion: 0.16
Nodes (3): GpuSelectionTest, _probe(), Selección de aceleración por hardware: whisper device + encoder de vídeo.

### Community 106 - "AI Conversations Store"
Cohesion: 0.28
Nodes (15): append(), delete(), _dir(), _find(), get_messages(), get_or_create(), history(), list_conversations() (+7 more)

### Community 107 - "Clip Layout (backend)"
Cohesion: 0.24
Nodes (10): _clamp(), dest_rect(), dest_rect_even(), _even(), is_overlay(), new_transform(), Any, Encuadre (crop de fuente) y transformación del resultado en el canvas de… (+2 more)

### Community 108 - "Motion HTML Generator"
Cohesion: 0.19
Nodes (10): _anton_data_uri(), _css(), generate_html(), _gsap_src(), Composition Generator: ``MotionComposition`` → HTML/CSS/GSAP autocontenido. El…, Devuelve el documento HTML completo y autocontenido de la composición., _runtime_src(), GeneratorTest (+2 more)

### Community 110 - "Derive Matte Tests"
Cohesion: 0.23
Nodes (3): DeriveMatteTest, La LUT se construye en float de 64 bits, igual que el JS. La entrada 96 con…, Las coordenadas son normalizadas: el resultado no depende del tamaño.

### Community 111 - "Transform & Mask Inspector"
Cohesion: 0.16
Nodes (9): EdMask(), EdTransform(), KF_TITLES, KfDia(), NumberStepper(), scaleToZoom(), zoomToScale(), MASK_FEATHER_MAX (+1 more)

### Community 112 - "Keyframe Editing Handlers"
Cohesion: 0.28
Nodes (16): applyStaticMask(), applyStaticPose(), changeShape(), changeStyle(), changeTransform(), commitMask(), commitPose(), duplicateKeyframe() (+8 more)

### Community 113 - "Background Provider Interface"
Cohesion: 0.16
Nodes (11): BackgroundRemovalProvider, get(), ProviderUnavailable, RuntimeError, Proveedores de segmentación para Eliminar fondo. La app NO conoce ningún modelo…, El proveedor no puede trabajar (falta modelo, falta onnxruntime…)., Contrato mínimo de un modelo de segmentación de fondo. ``matte`` recibe…, Libera recursos (sesión/VRAM). Debe poder llamarse siempre. (+3 more)

### Community 114 - "ONNX Matte Provider"
Cohesion: 0.18
Nodes (4): OnnxMatteProvider, ndarray, Path, Base para modelos de matte en ONNX Runtime con pre/post de U²-Net. Preproceso…

### Community 115 - "Provider Registry Tests"
Cohesion: 0.13
Nodes (7): catalog(), bg_providers(), gpu_onnx_summary(), Modelos de segmentación disponibles y device efectivo., ProviderRegistryTest, El modelo se descarga de un sitio fijo: sin URL no hay proveedor., Un modelo que devuelve todo igual no debe dividir por cero.

### Community 116 - "Clip Kind Helpers"
Cohesion: 0.18
Nodes (10): clip_fits_track(), has_generated_duration(), is_still_clip(), is_visual_clip(), Familias de clip ↔ pista. Permite tipos nuevos sin rehacer la timeline. Las…, track_kind_for_clip(), Incidencias DURAS del estado (refs rotas, rangos imposibles). Vacío = sano. Los…, validate_timeline() (+2 more)

### Community 117 - "Reframe Math"
Cohesion: 0.24
Nodes (10): _clamp(), frame_at(), _kf_cx(), _kf_cy(), _kf_fit(), _kf_mode(), _kf_t(), _kf_zoom() (+2 more)

### Community 118 - "Whisper Transcription"
Cohesion: 0.23
Nodes (14): _collect_segments(), _download_audio(), _get_model(), Path, ProgressCb, Transcripción de vídeos de YouTube con faster-whisper (STT). Descarga solo el…, Transcribe un archivo de audio/vídeo ya en disco., Descarga el audio del vídeo de YouTube y lo transcribe. (+6 more)

### Community 119 - "Word Shaping Tests"
Cohesion: 0.21
Nodes (8): _attr(), Lee un campo de un Word de faster-whisper (objeto) o de un dict., Normaliza las palabras de un segmento a dicts persistibles. Descarta palabras…, shape_words(), Tests del shaping de palabras (timing real por palabra de faster-whisper). No…, ShapeWordsTest, TranscriptWordsSchemaTest, _w()

### Community 120 - "Clip Background Tests"
Cohesion: 0.21
Nodes (6): _bg(), _clip(), ModelTest, Eliminar fondo: modelo del clip, matte derivado y paridad del chroma key. El…, Es puramente aditivo: nada que migrar y nada que cambie., _ready_auto()

### Community 121 - "Popover & Select Components"
Cohesion: 0.22
Nodes (6): AnchoredMenu(), FlipPopover(), FlipSelect(), placeAnchoredMenu(), placeMenu(), react-dom

### Community 122 - "Playback Control Handlers"
Cohesion: 0.19
Nodes (15): clipWorkspaceTracks(), applyEmptyClipTl(), applyMotionTimeline(), applyPaperTimeline(), applyTl(), goClipTab(), goMainTab(), goMotionBlank() (+7 more)

### Community 123 - "Keyboard & Seek Handlers"
Cohesion: 0.14
Nodes (15): applyHistSnap(), copyKeyframe(), copySelectedClips(), deleteClip(), moveKeyframe(), nudgePlayhead(), onKey(), paperMoveKeyframe() (+7 more)

### Community 124 - "Paper Erase Layer"
Cohesion: 0.24
Nodes (11): clampToContent(), clipSegment(), CROP_CURSOR, normalizeRect(), PaperEditLayer(), eraseColorAt(), paintAt(), brushErase() (+3 more)

### Community 125 - "MCP Media Tool Tests"
Cohesion: 0.16
Nodes (4): ImageInfo, Un archivo de imagen del proyecto (PNG/JPG/WebP…), sin convertir a vídeo., FetchImageTest, DeleteMediaTest

### Community 126 - "YouTube History"
Cohesion: 0.20
Nodes (7): _as_items(), _key(), Historial de enlaces de YouTube consultados (analyze)., record(), remove(), _video_fields(), YtHistoryTest

### Community 129 - "MCP Layered Discovery Design"
Cohesion: 0.19
Nodes (14): Agente interno in-process (ai/agent.py + ai/mcp_client.py), Arquitectura B — split en N servidores MCP (descartada), Arquitectura E — núcleo fino + router en el agente propio (recomendada), Capa de capacidades para agentes (objetivo del rediseño), current_project con alcance de conversación (nunca estado global del servidor), Descubrimiento progresivo en 3 capas (manifiesto / dominios / detalle), Fase 5 — router de intención + entrada-por-proyecto, help(domain) / guía por dominio fuera de los schemas (+6 more)

### Community 130 - "Workflow-as-Job Design"
Cohesion: 0.15
Nodes (14): W1 create_short_from_youtube, W3 create_subtitled_clip (opcional, no crear por crear), Fase 6 — seguridad + robustez de jobs, Envelope único de job (status/progress/result/error), W2 make_short_from_library, result_ref — ids en vez de volcar resultados pesados, wait_for_job (bloquea en threadpool, preferido sobre polling), Cancelación cooperativa best-effort (cancel_requested / JobCancelled) (+6 more)

### Community 131 - "Subtitle Themes UI"
Cohesion: 0.23
Nodes (12): EdText(), sizeToNearestPx(), themePreviewStyle(), WordsPerBox(), BLOCK_APPEAR_OPTIONS, sub, SUBTITLE_THEMES, WORD_FX_OPTIONS (+4 more)

### Community 132 - "SFX Favorites Filter"
Cohesion: 0.22
Nodes (7): sfx_categories(), _favorite_sfx_ids(), filter_sfx_items(), Filtra por búsqueda y categoría. ``favoritos`` usa ids marcados con estrella., search(), with_favorites_category(), SfxFavoritesFilterTest

### Community 133 - "Chroma Key Parity Tests"
Cohesion: 0.18
Nodes (6): ChromaKeyParityTest, ndarray, skipUnless, El chroma key del modelo debe ser IDÉNTICO al de ffmpeg, píxel a píxel., ``frame_uv`` debe dar el MISMO entero que swscale, no un aproximado. Con coma…, La clave usa rango COMPLETO y el fotograma LIMITADO: diff nunca es 0.

### Community 134 - "Crops Panel"
Cohesion: 0.26
Nodes (12): EdCrops(), kfList(), kfTime(), speedLabel(), clipKeepPitch(), clipSpeed(), sourceToTimeline(), SPEED_MAX (+4 more)

### Community 135 - "Align Guides"
Cohesion: 0.21
Nodes (11): canvasAlignTargets(), drawAlignGuides(), SNAP_THRESHOLD, snapAlign(), canvas, clips, far, near (+3 more)

### Community 136 - "SAM 2.1 Provider"
Cohesion: 0.23
Nodes (3): Path, Segmentador asistido SAM 2.1 (encoder + decoder ONNX). INTERACTIVO: no produce…, Sam21Provider

### Community 137 - "Compose Slot Layout"
Cohesion: 0.30
Nodes (6): _even(), Geometría de huecos para componer 2 capas en 720x1280., slot_norm(), slot_pixels(), SlotLayoutTest, SlotRect

### Community 138 - "Export Settings"
Cohesion: 0.20
Nodes (5): encoder_quality(), load(), normalize(), FPS y calidad de export (Configuración del editor)., ExportSettingsTest

### Community 139 - "Gemini TTS"
Cohesion: 0.32
Nodes (11): api_key(), _as_bytes(), available(), _generate_pcm(), narration_prompt(), Path, ProgressCb, Narrador TTS con Gemini (audio cinematográfico, estilo por prompt). Usa el… (+3 more)

### Community 140 - "Background Composition Tests"
Cohesion: 0.35
Nodes (3): skipUnless, Export de verdad: el matte y el croma deben dejar ver la pista inferior., RealCompositionTest

### Community 141 - "Clip Motion Tests"
Cohesion: 0.26
Nodes (3): BuildItemsTest, _clip(), OverlapTest

### Community 143 - "MCP Render Tests"
Cohesion: 0.17
Nodes (4): CooperativeCancelTest, ExportTest, La cancelación aborta el runner en el siguiente on_progress (best-effort)., _timeline()

### Community 144 - "Timeline Ops Design Notes"
Cohesion: 0.18
Nodes (12): Consolidación quirúrgica, no una mega-tool, dry_run — efecto previsto sin aplicar, export_project — render caro, no deshacible, set_project_format — reescala/reencuadra todo, timeline_store.apply_op (snapshot→validar→guardar), update_clip(clip_id, patch) — tool consolidada, Etapa 4.5 — poner al día la edición MCP-only (setters escalares, effects, keyframes), Fragmentación espejo JS↔Python con golden fixtures compartidos (+4 more)

### Community 145 - "MCP Usage Docs"
Cohesion: 0.18
Nodes (12): Auditoría en backend/data/mcp_audit.jsonl, Backend FastAPI (app.main:app vía uvicorn), Catálogo de 50 tools (14 read / 33 write / 3 destructive), Coherencia: IA y usuario comparten el mismo proceso, Validación E2E manual (no automatizable en CI), Endpoint http://127.0.0.1:8000/mcp (streamable-HTTP), Errores estructurados (8 códigos), MCP del editor (video-yt) (+4 more)

### Community 146 - "Gemini AI Provider"
Cohesion: 0.18
Nodes (5): AIProvider, GeminiProvider, Corre el loop de tool-calling, emitiendo eventos. Devuelve el texto final., CallTool, Emit

### Community 147 - "MCP Vision Tools"
Cohesion: 0.31
Nodes (10): _clip_file(), _clip_or_raise(), get_frame(), _project_or_raise(), Path, Visión: darle OJOS a la IA + descripción de material. ``get_frame`` extrae un…, Devuelve un fotograma (imagen) de un clip del material para que lo VEAS.…, Guarda tu descripción de un clip en un campo APARTE (description_ai); NO pisa… (+2 more)

### Community 148 - "Word Window Tests"
Cohesion: 0.31
Nodes (6): Ventana temporal absoluta ``(t0, t1)`` de cada palabra. Usa ``clip.words``…, word_windows(), CaptionDialoguesRealTimingTest, Karaoke del export con timing REAL por palabra (words[] del clip). Con words[]…, _text_clip(), WordWindowsTest

### Community 150 - "CUDA Fallback Tests"
Cohesion: 0.22
Nodes (5): _CudaThenCpu, _Info, Fallback CUDA → CPU de Whisper cuando la inferencia GPU revienta., _Seg, TranscribeCudaFallbackTest

### Community 151 - "Async Jobs Docs"
Cohesion: 0.22
Nodes (11): add_subtitles(source_clip_id, segments), add_to_timeline(project_id, kind, index), analyze_youtube(url) — tramos del heatmap, create_clips_from_segments(project_id, url, segments, crop_mode), export_project(project_id), Flujo A — create_short_from_youtube (automático), Flujo B — make_short_from_library, Auto-detección de GPU (whisper CUDA + FFmpeg NVENC) (+3 more)

### Community 152 - "GPU Encoder Selection"
Cohesion: 0.22
Nodes (10): _encoder_args_for(), _encoder_works(), hw_encoder(), Args de FFmpeg para un codificador concreto (calidad ~ CRF configurado)., Sonda real: codifica 1 fotograma para confirmar que el encoder abre. Estar…, Codificador HW a usar (listado Y que pasa la sonda), o ``None`` → libx264., Args de FFmpeg para el vídeo — *drop-in* de ``-c:v libx264 -crf .. -preset ..``., Nombre del codificador que se usará (para logs/diagnóstico). (+2 more)

### Community 153 - "GSAP Vendor Bundle C"
Cohesion: 0.29
Nodes (10): be(), _d(), fa(), ia(), ie(), je(), ke(), le() (+2 more)

### Community 154 - "Derived Cache Tests"
Cohesion: 0.33
Nodes (3): DerivedTest, skipUnless, Un clip más largo que lo procesado no debe quedarse sin fotogramas.

### Community 155 - "Matte Frame Index Tests"
Cohesion: 0.20
Nodes (3): FrameIndexTest, La clave base NO depende de in/out: cortar no invalida la caché., Mover un slider NO debe re-ejecutar el modelo.

### Community 156 - "Hero Image Asset"
Cohesion: 0.31
Nodes (10): Hero Image Asset, Isometric 3D Rendering Style, Landing / Hero Branding Visual, Layer / Track Stacking Metaphor, Dashed Vertical Projection Guide Lines, Lower Solid Slab With Purple Chrome Edge, Stacked Rounded Slabs Illustration, Transparent Background PNG Asset (+2 more)

### Community 157 - "Paper Timeline Bridge"
Cohesion: 0.24
Nodes (9): paperMutateClip(), baseClip(), interpOf(), isPaperFoldClip(), PAPER_FOLD_TRACK, PAPER_OBJECT_CLIP, PAPER_OBJECT_TRACK, paperStateToTimeline() (+1 more)

### Community 158 - "Paper Image Decoding"
Cohesion: 0.44
Nodes (9): buildPaperImage(), canvasOf(), cropElement(), decode(), decodeCanvas(), fitInto(), loadBackgroundImage(), loadObjectImage() (+1 more)

### Community 159 - "API Key Testing"
Cohesion: 0.36
Nodes (8): _classify(), _gemini(), _http(), _openai_compatible(), probe(), Prueba de API keys: verifica que cada clave autentica contra su proveedor. Cada…, Devuelve el código HTTP (o -1 si no hubo respuesta)., Prueba una clave. Devuelve {ok, message} (ok True/False/None).

### Community 160 - "GSAP Vendor Bundle D"
Cohesion: 0.28
Nodes (9): Aa(), Animation(), ha(), ja(), Jc(), Lc(), Ra(), Sa() (+1 more)

### Community 163 - "Chroma LUT Golden Tests"
Cohesion: 0.22
Nodes (3): GoldenFixtureTest, ``shared/bg_chroma_golden.json`` ancla el espejo JS↔Python. El JS no puede…, Sin pluma ni correcciones, derive_matte == LUT (nada de coma flotante).

### Community 167 - "App Favicon"
Cohesion: 0.36
Nodes (9): Alpha Mask 'a' (Bolt Silhouette Clip), App Favicon (48x46 Bolt Icon), Lightning Bolt Logo Mark, Brand Palette (Violet #863bff / #7e14ff, Lilac #ede6ff, Cyan #47bfff), Display-P3 Wide-Gamut Color Fallback, Figma Export Provenance (effect1_foregroundBlur_2002_17158), Gaussian Blur Filter Set (b through p), Blurred Ellipse Glow Layer (+1 more)

### Community 168 - "Provider Model Download"
Cohesion: 0.29
Nodes (5): _device_setting(), ProgressCb, Deja el proveedor listo (descargar pesos, abrir sesión…)., _device_setting(), ``bg_removal.device`` de Configuración (auto | cuda | dml | cpu).

### Community 169 - "SAM Encode & Decode"
Cohesion: 0.32
Nodes (4): ndarray, Fotograma RGB (uint8, HxWx3) -> embeddings (nivel 1, cacheable)., embeddings + puntos -> matte (uint8, HxW, 0..255). ``points``: lista de ``(x,…, Conveniencia: encode + decode en un paso (para imágenes/still).

### Community 170 - "Clip Audio Mixing"
Cohesion: 0.36
Nodes (4): clip_mixes_audio(), Si un clip de la timeline aporta audio al mix (preview y ffmpeg)., False si la pista o el clip están silenciados., ClipMuteTest

### Community 171 - "Fonts & Karaoke Notes"
Cohesion: 0.32
Nodes (8): Anton Font (backend, para el render/burn-in), SIL Open Font License 1.1 (fuentes del backend), Herencia pista→texto (effective_text_style / effectiveTextStyle), Karaoke real en export (text_ass.word_windows), migrations.py — schema_version=2 con migración lazy al leer, words[] reales de Whisper (Word model, word_timestamps), Anton Font (frontend, para el preview), SIL Open Font License 1.1 (fuentes del frontend)

### Community 172 - "Effective Text Style"
Cohesion: 0.36
Nodes (4): effective_text_style(), Estilo efectivo de un text clip: la pista aporta la base y el clip la sobre-…, EffectiveStyleTest, Herencia pista→texto: estilo efectivo (la pista es base, el clip override).

### Community 174 - "MCP Access Policy Design"
Cohesion: 0.32
Nodes (8): Gate confirm=true para operaciones destructive (REQUIRE_CONFIRM_DESTRUCTIVE), delete_media — único destructivo sin undo (borra el archivo), Enum cerrado de 8 códigos de error MCP, MCPError (code, message, hint, retryable, param), Etiquetado meta.domain + annotations (readOnly/destructive/idempotent hints), registry._wrap — chokepoint único (audit + errores + política), audit.py — JSONL append-only, guarda claves de params nunca valores, registry.py — @tool(access=read|write|destructive) con functools.wraps

### Community 175 - "MCP Capability Layer Docs"
Cohesion: 0.29
Nodes (8): DTO semántico (project_context / clip_summary / clip_detail / job_dto), get_project_context (Capa 0, orientación inicial), Capa DTO semántica + capabilities[] para escalar entre versiones, animate_clip (zoom / giro / slide / aparecer con SFX), describe_capabilities(domain?), generate_voice(text, engine=kokoro|piper|gemini), Resources de solo lectura (capabilities:// config:// help:// project://), set_clip_keyframes(x/y/scale/rotation/opacity)

### Community 176 - "Overlay Order Tests"
Cohesion: 0.48
Nodes (4): overlay_order(), IDs de clips de vídeo de fondo a frente: pista inferior primero, luego orden en…, _clip(), OverlayOrderTest

### Community 177 - "GSAP Vendor Bundle E"
Cohesion: 0.29
Nodes (7): Ab(), Bb(), cb(), Context(), fb(), Gw(), zb()

### Community 182 - "MCP Progress Notes"
Cohesion: 0.29
Nodes (7): Chat IA nativo — agente sobre el MCP existente (cero tools duplicadas), Historial persistente por proyecto (data/conversations/<pid>.json), GeminiProvider (google-genai, gemini-3.6-flash) tras la interfaz AIProvider, ai/mcp_client.py — Client in-process que descubre las tools del MCP, MCP montado en el mismo proceso FastAPI (streamable-HTTP /mcp), docs/superpowers/specs/2026-08-30-mcp-server-base-design.md, Gotcha Gemini 3.x: conservar los parts originales del stream (thought_signature)

### Community 183 - "Oxlint Config"
Cohesion: 0.29
Nodes (6): ignorePatterns, plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 184 - "Icon Sprite Sheet"
Cohesion: 0.57
Nodes (7): Bluesky Icon (butterfly brand mark, external profile link), Discord Icon (community chat link), Documentation Icon (purple outline document with code brackets, opens docs), GitHub Icon (octocat brand mark, repository link), Social Icon (purple outline user plus star, social/community section), Icons SVG Sprite Sheet, X (Twitter) Icon (brand mark, external profile link)

### Community 185 - "Vite Logo Asset"
Cohesion: 0.38
Nodes (7): Accessible SVG Title Label, Prefers-Color-Scheme Dark Theming, Gradient Glow Mask, Lightning Bolt Glyph, Parenthesis Brackets, Vite Build Tool, Vite Logo

### Community 186 - "Background Patch Handlers"
Cohesion: 0.29
Nodes (7): applyBgAuto(), clearBgEdits(), patchBg(), patchBgAuto(), patchBgChroma(), pickChromaAt(), undoBgEdit()

### Community 187 - "Paper Assets Loader"
Cohesion: 0.33
Nodes (6): EMPTY_ASSETS, loadImage(), loadPaperAssets(), LAYER_URLS, MASK_URLS, OVERLAY_URLS

### Community 188 - "OpenAI-Compatible Provider"
Cohesion: 0.40
Nodes (3): OpenAICompatibleProvider, Proveedores con API compatible con OpenAI: streaming + tool-calling. Un mismo…, Todas las claves del proveedor (para fallback). Local → una ficticia.

### Community 189 - "SAM Model Readiness"
Cohesion: 0.47
Nodes (4): ProviderUnavailable, ProgressCb, RuntimeError, SAM no puede trabajar (falta modelo, falta onnxruntime…).

### Community 190 - "Editor Docs Overview"
Cohesion: 0.40
Nodes (6): Faster Whisper, yt-dlp, IA Chat Assistant, Timeline, Video Editor, Motion Studio

### Community 191 - "Agent Retry Tests"
Cohesion: 0.47
Nodes (3): _Err, Exception, RetryableTest

### Community 194 - "Manual Piloting Docs"
Cohesion: 0.33
Nodes (6): Edición transaccional (snapshot → aplicar → validar → guardar), Flujo C — pilotaje manual (control total), get_project_context(project_id), resolve_project(query), undo / redo / checkpoint / restore_checkpoint, update_clip(clip_id, patch)

### Community 195 - "Frontend Readme & Entry"
Cohesion: 0.33
Nodes (6): Entrada de módulo /src/main.jsx, Punto de montaje #root, Reglas Oxlint, React Compiler (deshabilitado), Plantilla React + Vite con HMR, @vitejs/plugin-react (Oxc) vs plugin-react-swc (SWC)

### Community 196 - "Paper Export"
Cohesion: 0.47
Nodes (5): exportPaperFrame(), exportPaperVideo(), FORMATS, outputCanvas(), mediabunny

### Community 197 - "Text Role Helpers"
Cohesion: 0.73
Nodes (4): isCaptionText(), isFreeText(), isGeneratedClip(), textRole()

### Community 198 - "Piper Binary Fetch"
Cohesion: 0.60
Nodes (4): _download(), get_binary(), get_voices(), Descarga Piper (binario) y voces en español mexicano (es_MX). Uso: python…

### Community 202 - "React Logo Asset"
Cohesion: 0.60
Nodes (5): Atom Orbit Mark (three ellipses and nucleus), React Cyan Brand Color 00D8FF, Iconify Logos Icon Set, React UI Library, React Logo (SVG)

### Community 203 - "Track & Text Creation"
Cohesion: 0.40
Nodes (5): addText(), addTextTrack(), addTrack(), duplicateSelected(), ensureTextTrack()

### Community 204 - "Clipboard Copy Handlers"
Cohesion: 0.40
Nodes (5): copyClipDescription(), copyPlain(), copyTrackSrt(), copyTrackSrtRef(), copyTrackText()

### Community 205 - "GSAP Vendor Bundle F"
Cohesion: 0.50
Nodes (4): Ud(), vd(), we(), xe()

### Community 210 - "Keyframe Creation Rules"
Cohesion: 0.67
Nodes (3): Fase A: Reglas de creación, shouldKeyframe, upsertKeyframeAt

### Community 211 - "Mask Retype Handlers"
Cohesion: 0.67
Nodes (3): changeMask(), dropMaskSizeKfs(), retypeMask()

### Community 212 - "Keyframe Deletion Handlers"
Cohesion: 1.00
Nodes (3): deleteAnimKf(), deleteKeyframe(), deleteSelectedKeyframe()

## Ambiguous Edges - Review These
- `Endpoint http://127.0.0.1:8000/mcp (streamable-HTTP)` → `Empaquetar como app o desplegar en servidor (pendiente)`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Landing / Hero Branding Visual` → `Layer / Track Stacking Metaphor`  [AMBIGUOUS]
  frontend/src/assets/hero.png · relation: rationale_for
- `Violet / Purple Brand Accent Color` → `Hero Image Asset`  [AMBIGUOUS]
  frontend/src/assets/hero.png · relation: conceptually_related_to
- `Video Editor Brand Identity (Speed / Energy Motif)` → `Blurred Ellipse Glow Layer`  [AMBIGUOUS]
  frontend/public/favicon.svg · relation: conceptually_related_to
- `Documentation Icon (purple outline document with code brackets, opens docs)` → `GitHub Icon (octocat brand mark, repository link)`  [AMBIGUOUS]
  frontend/public/icons.svg · relation: conceptually_related_to
- `Atom Orbit Mark (three ellipses and nucleus)` → `React UI Library`  [AMBIGUOUS]
  frontend/src/assets/react.svg · relation: semantically_similar_to

## Knowledge Gaps
- **460 isolated node(s):** `out`, `props`, `source`, `target`, `GEN_MIN_DUR` (+455 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1701 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **49 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Endpoint http://127.0.0.1:8000/mcp (streamable-HTTP)` and `Empaquetar como app o desplegar en servidor (pendiente)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Landing / Hero Branding Visual` and `Layer / Track Stacking Metaphor`?**
  _Edge tagged AMBIGUOUS (relation: rationale_for) - confidence is low._
- **What is the exact relationship between `Violet / Purple Brand Accent Color` and `Hero Image Asset`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Video Editor Brand Identity (Speed / Energy Motif)` and `Blurred Ellipse Glow Layer`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Documentation Icon (purple outline document with code brackets, opens docs)` and `GitHub Icon (octocat brand mark, repository link)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Atom Orbit Mark (three ellipses and nucleus)` and `React UI Library`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `Timeline` connect `Timeline Ops Core` to `FastAPI Main & Jobs API`, `MCP Server Core & Registry`, `Schemas & Clipper Pipeline`, `FFmpeg Compose & Render`, `MCP Media & Render Tools`, `Background Composition Tests`, `MCP Render Tests`, `MCP Edit Tools`, `Timeline Store Tests`, `Projects Store`, `Jobs & MCP Audio Tools`, `Image Import & Probing`, `Timeline Ops Tests`, `Clip Mask Tests`, `Media Library`, `Storage, Shorts & Videos`, `MCP DTO & Read Tools`, `Timeline History & Undo`, `Clip Spec Tests`, `AI Agent Tests`, `Subtitle Add Tests`, `Property Ops Tests`, `App Settings`, `MCP Edit E45 Tests`, `Background Export Tests`, `Background Ops Tests`, `Timeline Migrations Tests`, `Background Integration Tests`, `Background Cache Tests`, `Track Style Persistence`, `Overlay Export Filters`, `Export Preview Parity`, `Matte Alignment Tests`, `Timeline Store Adapter`, `Clip Kind Helpers`, `Clip Background Tests`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._