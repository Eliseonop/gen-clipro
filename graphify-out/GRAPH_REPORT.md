# Graph Report - video-yt  (2026-09-12)

## Corpus Check
- 87 files · ~236,004 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4990 nodes · 11748 edges · 224 communities (182 shown, 40 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 630 edges (avg confidence: 0.9)
- Token cost: 5,530 input · 2,058 output

## Community Hubs (Navigation)
- Editor Model & Clip Helpers
- FastAPI Main & Schemas
- Jobs & MCP Server Core
- Clip Masks & Inspector
- VideoEditor Core State
- Clip Keyframes & Props
- Canvas Render & Layout
- Media Library & Storage
- Background Removal UI
- MCP Read DTO Tests
- Project & Job REST Endpoints
- Timeline Ops & Clip Kind
- Timeline UI & Scale
- Material Tab Components
- Frontend API Client
- Clip Keyframes (frontend)
- MCP Edit Tools
- Timeline Ops Tests
- Face Detect & Reframe Prep
- Shapes (frontend)
- MCP DTOs & Capabilities
- Background Matte Service
- Clip Stacking
- FFmpeg Compose Core
- Clip Mask Tests
- Media Search & Explore
- Fragment & Text Splitting
- Panning & Framing Math
- Project CRUD
- Clip Background Model
- GSAP Vendor Bundle
- MCP Render & Job Tools
- Motion Composition Service
- Shorts & Timeline Store
- MCP Media Tools
- Shapes (backend)
- ASS Subtitle Build
- yt-dlp Wrapper
- Clip Layout Tests
- AI Agent & Conversations
- Material Import & Ingest
- Recipe Layout
- SFX Library Tests
- Timeline Property Ops Tests
- Settings Panel
- Capabilities & Transcribe Settings
- Clip Motion Items
- Clipper & Crop Modes
- Overlay Export Filters
- SFX Catalog Backend
- Clip Effects UI
- Settings & YouTube History
- ASS Karaoke Styling
- Motion Model & Hook
- Motion Validator Tests
- Image Import
- Background Export Filter Tests
- Timeline History & Export Tests
- HyperFrames Renderer
- Panel Layout
- Clip Kind & FFmpeg Inputs
- Clip Speed
- AI Chat Panels
- SFX Naming & Classification
- Piper TTS
- AI Agent Tests
- Karaoke Text Effects
- Favorites
- GPU Probe
- Timeline Migration Tests
- Clip FX FFmpeg
- Motion Templates & Models
- Background Ops Tests
- Background Cache Tests
- Gemini TTS Tests
- Frontend Build Config
- Explore Session Model
- AI Provider Retry Logic
- GSAP Vendor Internals
- AI Provider Tests
- MCP Capabilities Tests
- App Shell & JSON Editor
- Text Styles & FX Render
- Explore Keyword Extraction
- Matte Build Tests
- MCP Edit Tool Tests
- Text Style Theme Tests
- Export Preview Parity
- Multi API Key Store
- Matte Alignment Tests
- MCP Edit E45 Tests
- AI Provider Config API
- Timeline History Resources
- Motion Runtime (preview)
- GSAP Tween Internals
- MCP Media Schema Tests
- GPU Selection Tests
- MCP DTO Tests
- Clipboard Image Paste
- Clip FX Chain Tests
- Clip Layout (backend)
- YouTube Audio Import
- Background Job Endpoint Tests
- Matte Derivation Tests
- Clip Motion Tests
- Background Provider Registry
- ONNX Matte Provider
- Composition Clip Generator
- Motion HTML Generator
- Reframe Math
- Whisper Transcription
- Transcript Word Shaping
- Clip Background Model Tests
- Popover & Select Components
- Subtitle Themes & Text Tab
- MCP Client Toolset
- Clip FX Time Sampling
- Compose Keyframes
- MCP Audit Tests
- MCP Layered Discovery Docs
- Workflow-as-Job Docs
- Explore Tab UI
- Matte Alpha Editing
- GIF Probe & Import
- SFX Favorites Filter
- Background End-to-End Test
- Chroma Key Parity
- Timeline Store Tests
- Align Guides
- Clip FX Fixtures
- SAM 2.1 Provider
- Compose Slot Layout
- Export Settings
- Gemini TTS
- Text Style Inheritance
- Real Composition Render Test
- MCP Registry Tests
- Timeline Store Adapter Docs
- MCP Usage & README
- Gemini AI Provider
- Font Resolution & ASS
- API Key Testing
- MCP Vision Tools
- ASS Word Windows
- Whisper CUDA Fallback
- Async Jobs Docs
- GPU Encoder Selection
- GSAP Vendor Helpers
- Derived Cache Tests
- Provider License Tests
- Frame Index Cache Tests
- Hero Image Asset
- Editor Word Model Tests
- GSAP Vendor Core
- API Keys Settings Tests
- SAM Fake Provider Tests
- Chroma Golden Fixture
- ONNX Provider Tests
- MCP Context Tool Tests
- MCP Structured Errors
- App Favicon
- Audio Tab & Voices
- Material Nav Shortcuts
- Provider Device Setup
- SAM Encode/Decode
- Clip Audio Mixing
- Anton Font & Karaoke Docs
- Background Clip Spec Tests
- Image Storage Tests
- Destructive Op Confirm Gate
- Capabilities Discovery Docs
- Compose Speed Tests
- Overlay Order Tests
- Motion Render Job
- GSAP Context Helpers
- Background Fake Provider
- Create Clips Tests
- Subtitle Add Tests
- Transcribe Settings Tests
- YouTube History Tests
- In-Process MCP Mount Docs
- Icon Sprite Sheet
- Vite Logo Asset
- OpenAI-Compatible Provider
- SAM Model Download
- Editor & Requirements Docs
- SAM Assisted Tests
- Manual Piloting Docs
- Vite React Template Docs
- Oxlint Config
- Frontend Dev Dependencies
- Image Add Modal
- Text Role Helpers
- Piper Binary Download
- Conversation Store Tests
- Still Compose Command Test
- React Logo Asset
- Explore Card Formatting
- Background Removal Job
- Chroma Alpha Filters
- Generated Duration Shapes
- GSAP Vendor Misc
- Chroma Filter Tests
- Chroma Morph Tests
- Audio FX Grid
- Track Style Persistence
- Material Custom Range
- GSAP Vendor Fragments
- Kokoro TTS Docs
- MCP Access Reclassification
- Paper Animator Build Script
- Base Exception
- FastAPI Dependency
- Pydantic BaseModel
- Background Removal Doc
- Vision Frame Tool Doc
- Reframe Clip Doc
- Project Format Doc
- Motion Studio (obsoleto)
- Anton Font Preload
- Playwright Dependency
- Test Skip Helper

## God Nodes (most connected - your core abstractions)
1. `VideoEditor()` - 173 edges
2. `TimelineClip` - 153 edges
3. `Timeline` - 139 edges
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
- **Protección de las 3 operaciones irreversibles** — docs_mcp_auditoria_rediseno_delete_media, docs_mcp_auditoria_rediseno_export_project, docs_mcp_auditoria_rediseno_set_project_format, docs_mcp_auditoria_rediseno_dry_run, docs_mcp_auditoria_rediseno_confirm_destructive [EXTRACTED 1.00]
- **Sistema de errores estructurados en el chokepoint** — docs_mcp_auditoria_rediseno_mcperror, docs_mcp_auditoria_rediseno_error_codes, docs_mcp_auditoria_rediseno_registry_wrap, docs_mcp_progreso_registry [EXTRACTED 1.00]
- **SVG <symbol> sprite referenced by id via <use>** — frontend_public_icons_sprite_sheet, frontend_public_icons_bluesky_icon, frontend_public_icons_discord_icon, frontend_public_icons_documentation_icon, frontend_public_icons_github_icon, frontend_public_icons_social_icon, frontend_public_icons_x_icon [EXTRACTED 1.00]
- **Solid black (#08060d) brand marks for external social links** — frontend_public_icons_bluesky_icon, frontend_public_icons_discord_icon, frontend_public_icons_github_icon, frontend_public_icons_x_icon [INFERRED 0.95]
- **Purple (#aa3bff) 1.35 rounded-stroke outline icon style** — frontend_public_icons_documentation_icon, frontend_public_icons_social_icon, frontend_public_icons_sprite_sheet [INFERRED 0.95]
- **AI Features Integration** — docs_editor_ia_chat, docs_editor_tts, docs_editor_bg_removal, backend_requirements_faster_whisper [INFERRED 0.85]

## Communities (224 total, 40 thin omitted)

### Community 0 - "Editor Model & Clip Helpers"
Cohesion: 0.02
Nodes (182): resetBgMeta(), resetCutout(), out, props, source, target, applyAudioSpeedToLinkedText(), canCaptionClip() (+174 more)

### Community 1 - "FastAPI Main & Schemas"
Cohesion: 0.03
Nodes (119): catalog(), analyze(), _extract_info(), _pick_segments(), Análisis del heatmap ("Most Replayed") de un vídeo de YouTube. yt-dlp ya expone…, Descarga solo los metadatos del vídeo (sin bajar el vídeo en sí)., Convierte los puntos del heatmap en tramos recortables. 1. Marca los puntos…, Punto de entrada: analiza un vídeo y devuelve info + tramos. (+111 more)

### Community 2 - "Jobs & MCP Server Core"
Cohesion: 0.03
Nodes (80): Cliente MCP in-process para el agente. Usa el ``Client`` del SDK ``mcp`` 2.x…, Proveedor SAM 2.1 para Eliminar fondo ASISTIDO (segmentación por clics). A…, Configuración central del proyecto. Todos los valores por defecto viven aquí…, JobCancelled, Exception, Gestor de trabajos en memoria. Cada petición de clips crea un Job con un id. El…, Se lanza dentro del bucle de un job cuando se pidió cancelarlo., Pide cancelar un job (cooperativo). Devuelve False si no existe o ya terminó.… (+72 more)

### Community 3 - "Clip Masks & Inspector"
Cohesion: 0.04
Nodes (78): KfTransitionSelect(), EdInspector(), navLabel(), navsFor(), opacityOf(), FORMATS, isVisualClip(), EdMask() (+70 more)

### Community 4 - "VideoEditor Core State"
Cohesion: 0.04
Nodes (74): applyClipVisualProps(), applyFaceTrack(), duplicateClipOntoTrack(), makeClip(), makeShapeClip(), makeTextClip(), motionLayersToTimeline(), newReframe() (+66 more)

### Community 5 - "Clip Keyframes & Props"
Cohesion: 0.06
Nodes (74): clip_pose(), interp_track(), normalize_track(), _num(), Any, Animación de clip (posición / escala / rotación / opacidad). Espejo de…, static_pose(), apply_volume_fade() (+66 more)

### Community 6 - "Canvas Render & Layout"
Cohesion: 0.08
Nodes (82): clipEnd(), timelineToSource(), cache, decodeGif(), gifFrameAt(), gifInfo(), createCanvasDownHandler(), createMainDownHandler() (+74 more)

### Community 7 - "Media Library & Storage"
Cohesion: 0.05
Nodes (52): _file(), _find_item(), get_item(), infer_origin_source(), library_root(), LibraryInUseError, list_library(), _load() (+44 more)

### Community 8 - "Background Removal UI"
Cohesion: 0.06
Nodes (72): alphaCache, bgMeta(), blurCache, blurCanvasInPlace(), cutCache, cutoutDrawable(), editsSig(), evict() (+64 more)

### Community 9 - "MCP Read DTO Tests"
Cohesion: 0.04
Nodes (24): gather_theme_text(), _find_timeline_clip_by_filename(), _mmss(), Id del clip de la timeline (audio/vídeo) cuyo archivo coincide con ``filename``., _run_clip_transcribe(), _run_subtitles(), _run_transcribe(), finish() (+16 more)

### Community 10 - "Project & Job REST Endpoints"
Cohesion: 0.05
Nodes (73): create_job(), _run_tts(), _run_youtube_audio(), start_bg_removal_job(), start_clip_transcribe_job(), start_motion_add_job(), start_subtitles_job(), start_transcribe_job() (+65 more)

### Community 11 - "Timeline Ops & Clip Kind"
Cohesion: 0.10
Nodes (72): clip_fits_track(), is_visual_clip(), track_kind_for_clip(), Timeline, add_clip(), add_shape(), add_subtitles(), add_track() (+64 more)

### Community 12 - "Timeline UI & Scale"
Cohesion: 0.05
Nodes (60): displayTracks(), laneKindForAsset(), linkedPartnerName(), resizeGeneratedClip(), trimClipPatch(), trimPreviewHead(), EdTimeline(), onLaneDragOver() (+52 more)

### Community 13 - "Material Tab Components"
Cohesion: 0.06
Nodes (41): Icon(), JobStatusBar(), Toast(), TtsControls(), voiceOptionLabel(), kfTime(), speedLabel(), SPEED_MAX (+33 more)

### Community 14 - "Frontend API Client"
Cohesion: 0.06
Nodes (61): confirmDeleteMaterial(), loadYt(), toggleSave(), pickDefaultSfxCat(), SfxTab(), chooseFolder(), save(), useExportJob() (+53 more)

### Community 15 - "Clip Keyframes (frontend)"
Cohesion: 0.08
Nodes (57): EdCrops(), kfList(), clipKeepPitch(), applyVolumeFade(), audioStatic(), canKeyframe(), clampVolume(), clipPropsAt() (+49 more)

### Community 16 - "MCP Edit Tools"
Cohesion: 0.07
Nodes (58): add_shape(), add_subtitles(), add_to_timeline(), add_track(), animate_clip(), _apply(), checkpoint(), duplicate_clip() (+50 more)

### Community 17 - "Timeline Ops Tests"
Cohesion: 0.06
Nodes (15): Una pista del editor (V1, V2… / A1, A2… / T1)., TimelineTrack, _timeline(), OverlayChainOrderTest, AddClipTest, AddTrackTest, base_tl(), MoveClipTest (+7 more)

### Community 18 - "Face Detect & Reframe Prep"
Cohesion: 0.06
Nodes (51): _detect_faces(), dims(), face_center_x(), face_track(), _get_detector(), _model_path(), _prep_frame(), ndarray (+43 more)

### Community 19 - "Shapes (frontend)"
Cohesion: 0.07
Nodes (47): EdShape(), EdShapes(), ARROW_TYPES, clampN(), curvedArrowPoly(), defaultShape(), dragShapePayload(), drawShapeClip() (+39 more)

### Community 20 - "MCP DTOs & Capabilities"
Cohesion: 0.06
Nodes (45): project_summary(), Resumen minúsculo de un proyecto para listar/desambiguar., aspect_ratio(), clip_detail(), _clip_summary(), _clip_timeline_duration(), _dup_counts(), _format_dto() (+37 more)

### Community 21 - "Background Matte Service"
Cohesion: 0.08
Nodes (49): BgCancelled, build_clip_bg_mask(), build_matte(), build_timeline_bg_masks(), cache_stats(), clear_cache(), _contiguous_range(), covered_range() (+41 more)

### Community 22 - "Clip Stacking"
Cohesion: 0.06
Nodes (46): clipsOverlap(), clipWidth(), clusterKey(), clusterSpan(), COVER_RATIO, coversMost(), frontClipId(), fullyCovers() (+38 more)

### Community 23 - "FFmpeg Compose Core"
Cohesion: 0.07
Nodes (45): Eliminar fondo: proveedores de segmentación y servicio de matte. ``clip_bg``…, auto_active(), bg_active(), bg_capable(), chroma_active(), chroma_filters(), ¿El clip admite eliminar fondo? Vídeo e imagen (incluye GIF)., True si el clip debe llevar alfa de fuente en preview y export. (+37 more)

### Community 24 - "Clip Mask Tests"
Cohesion: 0.07
Nodes (10): AlfaTest, _clip(), ExportTest, GeometriaTest, _graph(), KeyframesTest, ModeloTest, PersistenciaTest (+2 more)

### Community 25 - "Media Search & Explore"
Cohesion: 0.10
Nodes (26): allowed_download_url(), AssetImportService, _download(), _filename(), Importa un resultado de Explorar al almacenamiento local del proyecto., _fetch_json(), _int(), map_giphy_gif() (+18 more)

### Community 26 - "Fragment & Text Splitting"
Cohesion: 0.07
Nodes (30): chunk_caption_text(), _clip_dur(), _get(), make_text_clip(), _r3(), Fragmentación de transcripción → clips de texto. ESPEJO de la lógica JS.…, Segmentos de Whisper → clips de texto, recortados al tramo del clip fuente, con…, _rel_segment_words() (+22 more)

### Community 27 - "Panning & Framing Math"
Cohesion: 0.08
Nodes (38): EdTransform(), scaleToZoom(), zoomToScale(), blit(), clamp(), clampCenter(), cropCornerNorms(), drawReframe() (+30 more)

### Community 28 - "Project CRUD"
Cohesion: 0.10
Nodes (36): create_project(), list_projects(), set_folder(), add_audio(), add_clips(), add_image(), add_transcript(), apply_manifest() (+28 more)

### Community 29 - "Clip Background Model"
Cohesion: 0.09
Nodes (41): auto_requested(), base_key(), chroma_alpha8(), chroma_key_uv(), _clamp(), clip_bg(), derive_key(), despill_rgb() (+33 more)

### Community 30 - "GSAP Vendor Bundle"
Cohesion: 0.06
Nodes (15): ee(), Jd(), Kd(), la(), Ld(), ma(), Md(), na() (+7 more)

### Community 31 - "MCP Render & Job Tools"
Cohesion: 0.08
Nodes (36): all_jobs(), get_job(), Todos los jobs conocidos (en memoria, este proceso)., job_status(), job_dto(), Estado de un job + resumen del resultado según su tipo., Decorador: registra ``fn`` como tool del MCP con auditoría y política., tool() (+28 more)

### Community 32 - "Motion Composition Service"
Cohesion: 0.11
Nodes (35): motion_update(), _default_times(), _montage(), motion_add_to_timeline(), motion_create_composition(), motion_get_composition(), motion_get_frame(), motion_list_templates() (+27 more)

### Community 33 - "Shorts & Timeline Store"
Cohesion: 0.11
Nodes (37): Aplica una operación estructural (add_clip, split_clip, reframe_clip,…, timeline_checkpoint(), timeline_op(), timeline_redo(), timeline_restore(), timeline_undo(), Guarda la composición del editor de vídeo en el proyecto., save_timeline() (+29 more)

### Community 34 - "MCP Media Tools"
Cohesion: 0.08
Nodes (23): analyze_dto(), Resultado de analyze_youtube: info del vídeo + tramos del heatmap., MCPError, Error de tool con código estructurado (§J). Subclase de ``ValueError`` a…, analyze_youtube(), create_clips_from_segments(), delete_media(), fetch_image() (+15 more)

### Community 35 - "Shapes (backend)"
Cohesion: 0.11
Nodes (26): _bgr(), _clamp(), _curved_arrow_poly(), default_shape(), _ellipse_pts(), _heart_pts(), _hex(), _map_pt() (+18 more)

### Community 36 - "ASS Subtitle Build"
Cohesion: 0.13
Nodes (15): Un elemento colocado en una pista de la timeline. ``start`` es la posición en…, TimelineClip, active_word_index(), _applied_style(), ass_time(), build_ass(), caption_dialogues(), _clip_dur() (+7 more)

### Community 37 - "yt-dlp Wrapper"
Cohesion: 0.10
Nodes (19): auth_attempts(), call(), _configured_browser(), _cookie_file(), friendly_error(), is_auth_error(), is_cookie_source_error(), _msg() (+11 more)

### Community 38 - "Clip Layout Tests"
Cohesion: 0.06
Nodes (35): afterUserScale, biggerCrop, bot, botCrop, botDest, botPx, clamped, containClip (+27 more)

### Community 39 - "AI Agent & Conversations"
Cohesion: 0.09
Nodes (29): _access(), _is_mutating(), Agente del Chat IA: orquesta proveedor ↔ tools MCP y emite eventos. Generador…, Sondea get_job emitiendo progreso hasta que termina. Devuelve el estado final., Corre un turno de chat. Emite: start/text/tool_start/tool_result/job/…, Envuelve run_chat como stream SSE (``data: {json}\\n\\n``)., run_chat(), sse() (+21 more)

### Community 40 - "Material Import & Ingest"
Cohesion: 0.08
Nodes (27): dragMediaKind(), droppedUrl(), EdMaterial(), copyAudioDescription(), importMedia(), ingestClipboard(), onFileDragEnter(), onFileDragLeave() (+19 more)

### Community 41 - "Recipe Layout"
Cohesion: 0.13
Nodes (16): contain_dest(), contain_scale_filter(), dual_slot_wh(), dual_stack_name(), _field(), is_master_reframe(), join_dual_filters(), Any (+8 more)

### Community 42 - "SFX Library Tests"
Cohesion: 0.08
Nodes (8): AddSfxHttpTest, AddSfxNoLibraryTest, AddSfxTest, CreateSfxCategoryTest, Path, Alta de SFX: copia el audio, registra JSON y crea categoría si hace falta., UpdateSfxTest, _write_lib()

### Community 43 - "Timeline Property Ops Tests"
Cohesion: 0.13
Nodes (7): CapabilitiesTest, _clip(), LinkTracksTest, PropertyOpsTest, Etapa 4.5 — ops nuevas de propiedades por-clip / figuras (timeline_ops puro)., ShapeOpTest, _tl()

### Community 44 - "Settings Panel"
Cohesion: 0.09
Nodes (25): generate(), removeHistory(), API_PROVIDERS, AUDIO_DB_PRESETS, EdSettings(), cancel(), reload(), reloadAi() (+17 more)

### Community 45 - "Capabilities & Transcribe Settings"
Cohesion: 0.09
Nodes (29): extract_meta(), Copia identificadores y ajustes seguros. Omite textos largos., crop_modes(), describe(), domains(), overview(), Capacidades descubribles del editor (fuente única para tools + resources). Fase…, Capacidades de UN dominio: verbos, valores válidos y guía. ValueError si no… (+21 more)

### Community 46 - "Clip Motion Items"
Cohesion: 0.13
Nodes (30): audio_src_at(), build_motion_items(), downsample_envelope(), _from_amp(), hold_after_peak(), _item(), _kind(), _lerp() (+22 more)

### Community 47 - "Clipper & Crop Modes"
Cohesion: 0.11
Nodes (30): _clamp(), _crop_filter(), _cut_audio_args(), _cut_clip(), _download_source(), generate_clips(), _pw_expr(), _pw_expr_direct() (+22 more)

### Community 48 - "Overlay Export Filters"
Cohesion: 0.13
Nodes (21): _alpha_chain(), _even(), _fill_pose_filter(), _overlay_video_filter(), _pose_crop_keyframes(), _pose_prop_points(), _pose_spread(), pose_transform_animates() (+13 more)

### Community 49 - "SFX Catalog Backend"
Cohesion: 0.17
Nodes (29): add_sound(), _cat_dto(), create_category(), _ensure_dir(), _entry(), _find_sonido(), get_base(), _library_from_scan() (+21 more)

### Community 50 - "Clip Effects UI"
Cohesion: 0.13
Nodes (25): EdEffects(), patchEffects(), toggleVideo(), fxTabs(), tabLabel(), VolumePanel(), EdFxLibrary(), patchEffects() (+17 more)

### Community 51 - "Settings & YouTube History"
Cohesion: 0.15
Nodes (27): add_key(), api_key(), _api_keys_map(), key_count(), keys_for(), _keys_list_from(), load(), _merge_favorites() (+19 more)

### Community 52 - "ASS Karaoke Styling"
Cohesion: 0.14
Nodes (27): _active_override(), _alignment(), alpha_hex(), _alpha_tags(), ass_bgr(), _clamp01(), _esc_ass(), _idle_override() (+19 more)

### Community 53 - "Motion Model & Hook"
Cohesion: 0.14
Nodes (23): MotionElements(), clampComposition(), deepMerge(), EASES, EFFECT_TYPES, ENTRANCE_TYPES, EXIT_TYPES, moveLayer() (+15 more)

### Community 54 - "Motion Validator Tests"
Cohesion: 0.20
Nodes (10): MotionLayer, Un elemento de la composición, posicionado en el lienzo de salida. ``x``/``y``…, _check_layer(), _is_css_color(), Validación semántica de una ``MotionComposition`` antes de renderizar. Pydantic…, Devuelve una lista de errores (vacía = válida)., validate(), _comp() (+2 more)

### Community 55 - "Image Import"
Cohesion: 0.13
Nodes (14): _clean_filename(), _ext_from_magic(), fetch_image(), import_image(), _new_id(), probe_size(), Path, Importar imágenes al proyecto como PNG de trabajo (listo para alpha / quitar… (+6 more)

### Community 56 - "Background Export Filter Tests"
Cohesion: 0.21
Nodes (13): _clip(), FilterGraphTest, _graph(), NoRegressionTest, Eliminar fondo en el export: filtergraph y composición real con FFmpeg. Lo que…, Cortar el clip solo mueve el número de arranque: nada que regenerar., chromakey y alphamerge sobreescriben el alfa: hay que multiplicar., El alfa va antes: la velocidad la aplica la cadena de siempre, una vez. (+5 more)

### Community 57 - "Timeline History & Export Tests"
Cohesion: 0.10
Nodes (8): CooperativeCancelTest, ExportTest, La cancelación aborta el runner en el siguiente on_progress (best-effort)., _timeline(), CheckpointTest, Core de historial: snapshot / undo / redo / checkpoints (puro, sobre dicts)., tl(), UndoRedoTest

### Community 58 - "HyperFrames Renderer"
Cohesion: 0.14
Nodes (13): get_renderer(), Path, ProgressCb, Capa de abstracción del motor de render (spec §6). La UI y el servicio hablan…, (ok, motivo). ok=False si falta el motor/navegador; motivo explica., Devuelve el motor por defecto (HyperFrames sobre Playwright)., RendererAdapter, RenderResult (+5 more)

### Community 59 - "Panel Layout"
Cohesion: 0.16
Nodes (22): measure(), usePanelLayout(), applyPanelDrag(), clampPanelLayout(), KEYS, num(), PANEL_DEFAULTS, PANEL_LAYOUT_KEY (+14 more)

### Community 60 - "Clip Kind & FFmpeg Inputs"
Cohesion: 0.13
Nodes (10): ffmpeg_input_args(), ffmpeg_trim_window(), _in_out(), is_still_clip(), Familias de clip ↔ pista. Permite tipos nuevos sin rehacer la timeline. Las…, Ventana de ``trim`` sobre el input de ffmpeg. El still se genera con ``-loop``…, Args ``-i`` de un clip. Still: loop; vídeo/audio: archivo tal cual. Motion…, ClipKindImageTest (+2 more)

### Community 61 - "Clip Speed"
Cohesion: 0.20
Nodes (13): atempo_chain(), audio_speed_filters(), clip_reverse(), clip_source_duration(), clip_speed(), clip_timeline_duration(), _field(), keep_pitch() (+5 more)

### Community 62 - "AI Chat Panels"
Cohesion: 0.13
Nodes (21): ACCESS_LABEL, EdChat(), patchLast(), send(), EXAMPLES, fmtAuditTime(), fmtMeta(), McpAuditLog() (+13 more)

### Community 63 - "SFX Naming & Classification"
Cohesion: 0.16
Nodes (22): defaultMeta(), isAudioFile(), SfxCategoryCell(), cancel(), confirm(), SfxClassifyModal(), patch(), rememberCat() (+14 more)

### Community 64 - "Piper TTS"
Cohesion: 0.14
Nodes (21): available(), _binary(), _label_for(), list_voices(), Path, ProgressCb, Narrador con voz IA (TTS) usando Piper — voces en español mexicano (es_MX). A…, Todos los modelos .onnx de voz disponibles (en voices/ o en la raíz). (+13 more)

### Community 65 - "AI Agent Tests"
Cohesion: 0.11
Nodes (9): AgentTest, _collect(), _Err, FakeProvider, Exception, Provider scripted (modelo emit): pide una tool real y termina., RetryableTest, UnavailableProvider (+1 more)

### Community 66 - "Karaoke Text Effects"
Cohesion: 0.16
Nodes (21): TextFxPanel(), activeWordIndex(), activeWordIndexFromWords(), applyThemeToStyle(), chunkCaptionText(), clamp01(), hasWordFx(), karaokeOn() (+13 more)

### Community 67 - "Favorites"
Cohesion: 0.18
Nodes (19): useFavorites(), isClipFav(), saveTextStyle(), toggleClipFav(), toggleSfx(), audioFavKey(), clipFavRef(), emptyFavorites() (+11 more)

### Community 68 - "GPU Probe"
Cohesion: 0.15
Nodes (21): _add_nvidia_dll_dirs(), cuda_available(), _cuda_libs_ok(), _dll_loads(), _gpu_disabled(), mark_cuda_broken(), onnx_device_label(), onnx_providers() (+13 more)

### Community 69 - "Timeline Migration Tests"
Cohesion: 0.09
Nodes (6): KeepPitchMigrationTest, MigrateTimelineTest, Tests de la migración del JSON del timeline (forward-only, idempotente)., SchemaConsistencyTest, TextRoleMigrationTest, TimelineVersionTest

### Community 70 - "Clip FX FFmpeg"
Cohesion: 0.17
Nodes (17): audio_fx_chain(), _audio_fx_map(), _clamp01(), effects_ffmpeg(), _effects_map(), _field(), _fx_num(), _fx_on() (+9 more)

### Community 71 - "Motion Templates & Models"
Cohesion: 0.21
Nodes (19): MotionAnimation, MotionEffect, MotionShape, MotionTween, BaseModel, Modelo de composición de Motion Studio. Una ``MotionComposition`` es la fuente…, Un tramo de animación (entrada o salida) de una capa., Efecto continuo (loop) durante la vida de la capa. (+11 more)

### Community 72 - "Background Ops Tests"
Cohesion: 0.13
Nodes (7): BgJobTest, Eliminar fondo: operación de timeline (undo/redo) y endpoints HTTP., El job NO escribe la timeline: devuelve el resultado en el Job., Tocar la tolerancia del croma NO puede borrar el matte ya calculado., Sin registrar, ni la IA ni el undo/redo del backend lo verían., SetClipBgRemovalTest, _tl()

### Community 73 - "Background Cache Tests"
Cohesion: 0.13
Nodes (8): CacheBase, MissingRangesTest, Path, Eliminar fondo: caché en dos niveles, rango incremental y proveedores. Los…, ``%06d`` empieza en 000001, así ``-start_number`` cuadra con el índice., `Guardar clip` sobrescribe: mismo nombre y tamaño, otro contenido. Con solo…, Duplicar material idéntico no debería re-inferir... salvo por mtime., SourceIdTest

### Community 74 - "Gemini TTS Tests"
Cohesion: 0.10
Nodes (7): AvailableTest, NarrationPromptTest, PublicSettingsTest, Gemini TTS: prompt de estilo, WAV y disponibilidad sin llamar a la API., _silent_pcm(), VoicesListTest, WriteWavTest

### Community 75 - "Frontend Build Config"
Cohesion: 0.10
Nodes (19): dependencies, material-icons, react, react-dom, name, private, scripts, build (+11 more)

### Community 76 - "Explore Session Model"
Cohesion: 0.16
Nodes (19): CLASSIC_SUGGESTIONS, cloneExploreSession(), EMPTY_EXPLORE_SESSION, EXPLORE_SUGGESTIONS, exploreSession, extractKeywords(), MEDIA_FILTERS, PROVIDER_FILTERS (+11 more)

### Community 77 - "AI Provider Retry Logic"
Cohesion: 0.16
Nodes (17): _friendly_error(), _is_auth_or_quota(), _is_malformed_toolcall(), _payload_no_image(), Exception, Código HTTP del error (openai usa ``status_code``; google-genai ``code``)., El modelo emitió argumentos de tool que NO son JSON válido (frecuente en…, ¿Transitorio que conviene reintentar? 5xx, saturación o tool-call malformado.… (+9 more)

### Community 78 - "GSAP Vendor Internals"
Cohesion: 0.15
Nodes (20): _a(), ac(), Co(), db(), ea(), eb(), ga(), gb() (+12 more)

### Community 79 - "AI Provider Tests"
Cohesion: 0.10
Nodes (3): LmStudioModelsApiTest, ProviderSelectionTest, Selección de proveedor de IA (Gemini / OpenAI / OpenRouter).

### Community 80 - "MCP Capabilities Tests"
Cohesion: 0.14
Nodes (3): CapabilitiesTest, _read(), _text()

### Community 81 - "App Shell & JSON Editor"
Cohesion: 0.15
Nodes (14): App(), confirmDeleteProject(), navigate(), onCreate(), refresh(), readHash(), ConfirmModal(), JsonEditor() (+6 more)

### Community 82 - "Text Styles & FX Render"
Cohesion: 0.16
Nodes (19): exportPayload(), clamp01(), clipFxAt(), fxWindows(), lerp(), typingReveal(), base, clampN() (+11 more)

### Community 83 - "Explore Keyword Extraction"
Cohesion: 0.20
Nodes (12): _anthropic_keywords(), extract_keywords(), _first_llm(), _gemini_keywords(), _llm_keywords(), _openai_keywords(), parse_keyword_list(), _post_json() (+4 more)

### Community 84 - "Matte Build Tests"
Cohesion: 0.21
Nodes (5): BuildMatteTest, Mover umbral/pluma/pincel NO debe volver a inferir., Un vídeo de 64 px no se sube a 512: no habría más detalle, solo coste., Pedir más allá del final del vídeo no debe sellar huecos en el meta., Vídeo sintético pequeño (necesita ffmpeg).

### Community 86 - "Text Style Theme Tests"
Cohesion: 0.13
Nodes (18): applyPreset(), applyTrackPreset(), themeById(), applyOrClearTheme(), clearTextTheme(), FONTS, selectedSubtitleThemeId(), classic (+10 more)

### Community 87 - "Export Preview Parity"
Cohesion: 0.25
Nodes (10): _fill_base_cropscale(), Crop+scale de un clip fill: cover como el preview, no letterbox. El editor…, Animación de reencuadre aplicada a un clip. ``zoom`` = fracción de la altura…, Reframe, _clip(), FillCropMatchesPreviewTest, FillPoseKeepsCropTest, _graph() (+2 more)

### Community 88 - "Multi API Key Store"
Cohesion: 0.11
Nodes (4): KeyTestAllTest, KeyTestClassifyTest, MultiKeyStoreTest, Varias API keys por proveedor (fallback) + prueba de claves. - Primaria en…

### Community 89 - "Matte Alignment Tests"
Cohesion: 0.22
Nodes (8): MatteAlignmentTest, Path, skipUnless, El caso que rompe si -start_number no cuadra: el clip empieza en 1,2 s., in_point entre dos fotogramas del matte: el más cercano, no el anterior., El matte va a 10 fps y la salida a 60: el filtro fps debe duplicar., El alfa se aplica ANTES de la velocidad: la hereda sin filtros extra. A 2x, el…, Columna donde está la franja visible en el instante ``t`` del vídeo.

### Community 91 - "AI Provider Config API"
Cohesion: 0.19
Nodes (16): ai_config(), _api_keys(), _auto_provider(), _default_model(), get_provider(), _has_key(), _is_local_provider(), list_lmstudio_models() (+8 more)

### Community 92 - "Timeline History Resources"
Cohesion: 0.24
Nodes (15): _history(), _history_summary(), can_redo(), can_undo(), checkpoint(), list_checkpoints(), _norm(), Historial del timeline: snapshot / undo / redo / checkpoints. Core PURO sobre… (+7 more)

### Community 93 - "Motion Runtime (preview)"
Cohesion: 0.29
Nodes (16): applyEffect(), buildAll(), buildLayer(), buildLine(), entranceVars(), exitVars(), isHorizontal(), notify() (+8 more)

### Community 94 - "GSAP Tween Internals"
Cohesion: 0.15
Nodes (17): _assertThisInitialized(), Ec(), Fc(), gc(), ka(), qa(), t(), tb() (+9 more)

### Community 95 - "MCP Media Schema Tests"
Cohesion: 0.14
Nodes (5): ImageInfo, Un archivo de imagen del proyecto (PNG/JPG/WebP…), sin convertir a vídeo., ImageInfoSchemaTest, FetchImageTest, DeleteMediaTest

### Community 96 - "GPU Selection Tests"
Cohesion: 0.16
Nodes (3): GpuSelectionTest, _probe(), Selección de aceleración por hardware: whisper device + encoder de vídeo.

### Community 97 - "MCP DTO Tests"
Cohesion: 0.17
Nodes (5): AspectRatioTest, ClipIdentityDtoTest, _make_project(), ProjectContextTest, DTO semántico del MCP: contexto de proyecto + capabilities.

### Community 98 - "Clipboard Image Paste"
Cohesion: 0.32
Nodes (14): collectFromClipboardItems(), collectPastePayload(), dataUrlToFile(), dedupeFiles(), extFromMime(), fileKey(), filenameFromUrl(), hasImagePaste() (+6 more)

### Community 99 - "Clip FX Chain Tests"
Cohesion: 0.18
Nodes (6): look_ffmpeg(), Máscara tipo preview: revela de izquierda a derecha sin cambiar el tamaño del…, video_fx_chain(), _wipe_alpha_filter(), ClipEffectsTest, ClipFxFfmpegTest

### Community 100 - "Clip Layout (backend)"
Cohesion: 0.24
Nodes (10): _clamp(), dest_rect(), dest_rect_even(), _even(), is_overlay(), new_transform(), Any, Encuadre (crop de fuente) y transformación del resultado en el canvas de… (+2 more)

### Community 101 - "YouTube Audio Import"
Cohesion: 0.17
Nodes (7): YouTubeAudioRequest, is_youtube_url(), youtube_id_from_url(), YouTube → Audio: validación de URL y job que crea un audio de proyecto., YoutubeAudioHttpTest, YoutubeAudioJobTest, YoutubeUrlTest

### Community 103 - "Matte Derivation Tests"
Cohesion: 0.23
Nodes (3): DeriveMatteTest, La LUT se construye en float de 64 bits, igual que el JS. La entrada 96 con…, Las coordenadas son normalizadas: el resultado no depende del tamaño.

### Community 104 - "Clip Motion Tests"
Cohesion: 0.19
Nodes (5): BuildItemsTest, _clip(), MotionNormalizeTest, OverlapTest, Presets de animate_clip (keyframe generation, sin ffmpeg).

### Community 105 - "Background Provider Registry"
Cohesion: 0.16
Nodes (11): BackgroundRemovalProvider, get(), ProviderUnavailable, RuntimeError, Proveedores de segmentación para Eliminar fondo. La app NO conoce ningún modelo…, El proveedor no puede trabajar (falta modelo, falta onnxruntime…)., Contrato mínimo de un modelo de segmentación de fondo. ``matte`` recibe…, Libera recursos (sesión/VRAM). Debe poder llamarse siempre. (+3 more)

### Community 106 - "ONNX Matte Provider"
Cohesion: 0.18
Nodes (4): OnnxMatteProvider, ndarray, Path, Base para modelos de matte en ONNX Runtime con pre/post de U²-Net. Preproceso…

### Community 107 - "Composition Clip Generator"
Cohesion: 0.30
Nodes (11): _filter_graph(), generate_composition(), is_http_url(), Path, ProgressCb, Genera un clip 9:16 combinando hasta 2 capas (fuentes distintas o la misma)., resolve_layer_source(), resolve_local_media() (+3 more)

### Community 108 - "Motion HTML Generator"
Cohesion: 0.20
Nodes (10): _anton_data_uri(), _css(), generate_html(), _gsap_src(), Composition Generator: ``MotionComposition`` → HTML/CSS/GSAP autocontenido. El…, Devuelve el documento HTML completo y autocontenido de la composición., _runtime_src(), GeneratorTest (+2 more)

### Community 109 - "Reframe Math"
Cohesion: 0.24
Nodes (10): _clamp(), frame_at(), _kf_cx(), _kf_cy(), _kf_fit(), _kf_mode(), _kf_t(), _kf_zoom() (+2 more)

### Community 110 - "Whisper Transcription"
Cohesion: 0.23
Nodes (14): _collect_segments(), _download_audio(), _get_model(), Path, ProgressCb, Transcripción de vídeos de YouTube con faster-whisper (STT). Descarga solo el…, Transcribe un archivo de audio/vídeo ya en disco., Descarga el audio del vídeo de YouTube y lo transcribe. (+6 more)

### Community 111 - "Transcript Word Shaping"
Cohesion: 0.21
Nodes (8): _attr(), Lee un campo de un Word de faster-whisper (objeto) o de un dict., Normaliza las palabras de un segmento a dicts persistibles. Descarta palabras…, shape_words(), Tests del shaping de palabras (timing real por palabra de faster-whisper). No…, ShapeWordsTest, TranscriptWordsSchemaTest, _w()

### Community 112 - "Clip Background Model Tests"
Cohesion: 0.21
Nodes (6): _bg(), _clip(), ModelTest, Eliminar fondo: modelo del clip, matte derivado y paridad del chroma key. El…, Es puramente aditivo: nada que migrar y nada que cambie., _ready_auto()

### Community 113 - "Popover & Select Components"
Cohesion: 0.22
Nodes (6): AnchoredMenu(), FlipPopover(), FlipSelect(), placeAnchoredMenu(), placeMenu(), react-dom

### Community 114 - "Subtitle Themes & Text Tab"
Cohesion: 0.24
Nodes (13): themePreviewStyle(), EdText(), sizeToNearestPx(), themePreviewStyle(), WordsPerBox(), BLOCK_APPEAR_OPTIONS, sub, SUBTITLE_THEMES (+5 more)

### Community 115 - "MCP Client Toolset"
Cohesion: 0.15
Nodes (9): _clean_schema(), McpToolset, Poda un JSON-Schema a lo que entiende el function-calling de los LLM., Normaliza el CallToolResult a ``{ok, data, text}``. En error, el SDK prefija el…, Sesión abierta contra el MCP in-process para un turno de chat., Declaraciones de función provider-agnósticas (name/description/parameters)., _result_data(), McpClientTest (+1 more)

### Community 116 - "Clip FX Time Sampling"
Cohesion: 0.24
Nodes (3): clip_fx_at(), ClipFxAtTest, TransitionParityTest

### Community 117 - "Compose Keyframes"
Cohesion: 0.19
Nodes (12): _kfs_all_contain(), _plain_scale(), Keyframes del reframe pasados a tiempo LOCAL del fragmento recortado. Los…, True si la pista es 100% Entero (letterbox). Mix contain/cover → cover., Cadena de filtros (crop+scale) para el reencuadre de un clip, sin el trim.…, Escalado a WxH con letterbox (solo Entero / fit=contain)., _reframe_cropscale(), _shifted_keyframes() (+4 more)

### Community 119 - "MCP Layered Discovery Docs"
Cohesion: 0.19
Nodes (14): Agente interno in-process (ai/agent.py + ai/mcp_client.py), Arquitectura B — split en N servidores MCP (descartada), Arquitectura E — núcleo fino + router en el agente propio (recomendada), Capa de capacidades para agentes (objetivo del rediseño), current_project con alcance de conversación (nunca estado global del servidor), Descubrimiento progresivo en 3 capas (manifiesto / dominios / detalle), Fase 5 — router de intención + entrada-por-proyecto, help(domain) / guía por dominio fuera de los schemas (+6 more)

### Community 120 - "Workflow-as-Job Docs"
Cohesion: 0.15
Nodes (14): W1 create_short_from_youtube, W3 create_subtitled_clip (opcional, no crear por crear), Fase 6 — seguridad + robustez de jobs, Envelope único de job (status/progress/result/error), W2 make_short_from_library, result_ref — ids en vez de volcar resultados pesados, wait_for_job (bloquea en threadpool, preferido sobre polling), Cancelación cooperativa best-effort (cancel_requested / JobCancelled) (+6 more)

### Community 121 - "Explore Tab UI"
Cohesion: 0.24
Nodes (10): EdExplore(), addItem(), collectThemeText(), filterExploreItems(), pushRecent(), readRecent(), themeSuggestions(), importExplore() (+2 more)

### Community 122 - "Matte Alpha Editing"
Cohesion: 0.23
Nodes (13): derive_matte(), edits_alpha(), expand_alpha(), feather_alpha(), matte_lut(), paint_edit(), ndarray, LUT de 256 entradas con niveles + invertir. Se construye con la MISMA… (+5 more)

### Community 123 - "GIF Probe & Import"
Cohesion: 0.24
Nodes (8): probe_gif(), Salta una cadena de sub-bloques GIF (``size`` byte + datos, terminada en 0)., Metadatos de un GIF leyendo su cabecera (sin dependencias externas). Recorre…, _skip_subblocks(), _mini_gif(), ProbeGifTest, Imagen como material: storage, duración still y args de ffmpeg., GIF sintético válido en estructura de bloques (no en LZW) para probar el parser.

### Community 124 - "SFX Favorites Filter"
Cohesion: 0.22
Nodes (7): sfx_categories(), _favorite_sfx_ids(), filter_sfx_items(), Filtra por búsqueda y categoría. ``favoritos`` usa ids marcados con estrella., search(), with_favorites_category(), SfxFavoritesFilterTest

### Community 125 - "Background End-to-End Test"
Cohesion: 0.22
Nodes (6): EndToEndTest, Path, skipUnless, La condición que pedía el diseño: misma config → cero inferencias., Vídeo sintético: un óvalo claro (el "sujeto") sobre fondo oscuro., _subject_video()

### Community 126 - "Chroma Key Parity"
Cohesion: 0.18
Nodes (6): ChromaKeyParityTest, ndarray, skipUnless, El chroma key del modelo debe ser IDÉNTICO al de ffmpeg, píxel a píxel., ``frame_uv`` debe dar el MISMO entero que swscale, no un aproximado. Con coma…, La clave usa rango COMPLETO y el fotograma LIMITADO: diff nunca es 0.

### Community 127 - "Timeline Store Tests"
Cohesion: 0.21
Nodes (3): _base_timeline(), Adaptador stateful: apply_op / undo / redo / checkpoints sobre un proyecto real…, TimelineStoreTest

### Community 128 - "Align Guides"
Cohesion: 0.21
Nodes (11): canvasAlignTargets(), drawAlignGuides(), SNAP_THRESHOLD, snapAlign(), canvas, clips, far, near (+3 more)

### Community 129 - "Clip FX Fixtures"
Cohesion: 0.15
Nodes (12): both, dissolveIn, fadeIn, fadeOut, id, id2, mid, pop (+4 more)

### Community 130 - "SAM 2.1 Provider"
Cohesion: 0.23
Nodes (3): Path, Segmentador asistido SAM 2.1 (encoder + decoder ONNX). INTERACTIVO: no produce…, Sam21Provider

### Community 131 - "Compose Slot Layout"
Cohesion: 0.30
Nodes (6): _even(), Geometría de huecos para componer 2 capas en 720x1280., slot_norm(), slot_pixels(), SlotLayoutTest, SlotRect

### Community 132 - "Export Settings"
Cohesion: 0.20
Nodes (5): encoder_quality(), load(), normalize(), FPS y calidad de export (Configuración del editor)., ExportSettingsTest

### Community 133 - "Gemini TTS"
Cohesion: 0.32
Nodes (11): api_key(), _as_bytes(), available(), _generate_pcm(), narration_prompt(), Path, ProgressCb, Narrador TTS con Gemini (audio cinematográfico, estilo por prompt). Usa el… (+3 more)

### Community 134 - "Text Style Inheritance"
Cohesion: 0.24
Nodes (5): effective_text_style(), Estilo efectivo de un text clip: la pista aporta la base y el clip la sobre-…, BuildAssInheritanceTest, EffectiveStyleTest, Herencia pista→texto: estilo efectivo (la pista es base, el clip override).

### Community 135 - "Real Composition Render Test"
Cohesion: 0.35
Nodes (3): skipUnless, Export de verdad: el matte y el croma deben dejar ver la pista inferior., RealCompositionTest

### Community 137 - "Timeline Store Adapter Docs"
Cohesion: 0.18
Nodes (12): Consolidación quirúrgica, no una mega-tool, dry_run — efecto previsto sin aplicar, export_project — render caro, no deshacible, set_project_format — reescala/reencuadra todo, timeline_store.apply_op (snapshot→validar→guardar), update_clip(clip_id, patch) — tool consolidada, Etapa 4.5 — poner al día la edición MCP-only (setters escalares, effects, keyframes), Fragmentación espejo JS↔Python con golden fixtures compartidos (+4 more)

### Community 138 - "MCP Usage & README"
Cohesion: 0.18
Nodes (12): Auditoría en backend/data/mcp_audit.jsonl, Backend FastAPI (app.main:app vía uvicorn), Catálogo de 50 tools (14 read / 33 write / 3 destructive), Coherencia: IA y usuario comparten el mismo proceso, Validación E2E manual (no automatizable en CI), Endpoint http://127.0.0.1:8000/mcp (streamable-HTTP), Errores estructurados (8 códigos), MCP del editor (video-yt) (+4 more)

### Community 139 - "Gemini AI Provider"
Cohesion: 0.18
Nodes (5): AIProvider, GeminiProvider, Corre el loop de tool-calling, emitiendo eventos. Devuelve el texto final., CallTool, Emit

### Community 140 - "Font Resolution & ASS"
Cohesion: 0.24
Nodes (7): ass_overlay_filter(), Ruta al TTF: primero fuentes embebidas (Anton…), luego Windows/Fonts., Filtro ass= de ffmpeg, con fontsdir si hay TTF embebidos (Anton…)., resolve_font_path(), ass_filter_path(), Escapa una ruta Windows para el filtro ass= de ffmpeg., BundledFontsTest

### Community 141 - "API Key Testing"
Cohesion: 0.27
Nodes (10): _classify(), _gemini(), _http(), _openai_compatible(), probe(), Prueba de API keys: verifica que cada clave autentica contra su proveedor. Cada…, Prueba TODAS las claves registradas (primaria + extra), en paralelo. Devuelve…, Devuelve el código HTTP (o -1 si no hubo respuesta). (+2 more)

### Community 142 - "MCP Vision Tools"
Cohesion: 0.31
Nodes (10): _clip_file(), _clip_or_raise(), get_frame(), _project_or_raise(), Path, Visión: darle OJOS a la IA + descripción de material. ``get_frame`` extrae un…, Devuelve un fotograma (imagen) de un clip del material para que lo VEAS.…, Guarda tu descripción de un clip en un campo APARTE (description_ai); NO pisa… (+2 more)

### Community 143 - "ASS Word Windows"
Cohesion: 0.31
Nodes (6): Ventana temporal absoluta ``(t0, t1)`` de cada palabra. Usa ``clip.words``…, word_windows(), CaptionDialoguesRealTimingTest, Karaoke del export con timing REAL por palabra (words[] del clip). Con words[]…, _text_clip(), WordWindowsTest

### Community 144 - "Whisper CUDA Fallback"
Cohesion: 0.22
Nodes (5): _CudaThenCpu, _Info, Fallback CUDA → CPU de Whisper cuando la inferencia GPU revienta., _Seg, TranscribeCudaFallbackTest

### Community 145 - "Async Jobs Docs"
Cohesion: 0.22
Nodes (11): add_subtitles(source_clip_id, segments), add_to_timeline(project_id, kind, index), analyze_youtube(url) — tramos del heatmap, create_clips_from_segments(project_id, url, segments, crop_mode), export_project(project_id), Flujo A — create_short_from_youtube (automático), Flujo B — make_short_from_library, Auto-detección de GPU (whisper CUDA + FFmpeg NVENC) (+3 more)

### Community 146 - "GPU Encoder Selection"
Cohesion: 0.22
Nodes (10): _encoder_args_for(), _encoder_works(), hw_encoder(), Args de FFmpeg para un codificador concreto (calidad ~ CRF configurado)., Sonda real: codifica 1 fotograma para confirmar que el encoder abre. Estar…, Codificador HW a usar (listado Y que pasa la sonda), o ``None`` → libx264., Args de FFmpeg para el vídeo — *drop-in* de ``-c:v libx264 -crf .. -preset ..``., Nombre del codificador que se usará (para logs/diagnóstico). (+2 more)

### Community 147 - "GSAP Vendor Helpers"
Cohesion: 0.29
Nodes (10): be(), _d(), fa(), ia(), ie(), je(), ke(), le() (+2 more)

### Community 148 - "Derived Cache Tests"
Cohesion: 0.33
Nodes (3): DerivedTest, skipUnless, Un clip más largo que lo procesado no debe quedarse sin fotogramas.

### Community 149 - "Provider License Tests"
Cohesion: 0.20
Nodes (3): ProviderRegistryTest, El modelo se descarga de un sitio fijo: sin URL no hay proveedor., Un modelo que devuelve todo igual no debe dividir por cero.

### Community 150 - "Frame Index Cache Tests"
Cohesion: 0.20
Nodes (3): FrameIndexTest, La clave base NO depende de in/out: cortar no invalida la caché., Mover un slider NO debe re-ejecutar el modelo.

### Community 151 - "Hero Image Asset"
Cohesion: 0.31
Nodes (10): Hero Image Asset, Isometric 3D Rendering Style, Landing / Hero Branding Visual, Layer / Track Stacking Metaphor, Dashed Vertical Projection Guide Lines, Lower Solid Slab With Purple Chrome Edge, Stacked Rounded Slabs Illustration, Transparent Background PNG Asset (+2 more)

### Community 152 - "Editor Word Model Tests"
Cohesion: 0.20
Nodes (9): abs, allWords, caps, noWords, parent, re, segment, src (+1 more)

### Community 153 - "GSAP Vendor Core"
Cohesion: 0.28
Nodes (9): Aa(), Animation(), ha(), ja(), Jc(), Lc(), Ra(), Sa() (+1 more)

### Community 156 - "Chroma Golden Fixture"
Cohesion: 0.22
Nodes (3): GoldenFixtureTest, ``shared/bg_chroma_golden.json`` ancla el espejo JS↔Python. El JS no puede…, Sin pluma ni correcciones, derive_matte == LUT (nada de coma flotante).

### Community 160 - "App Favicon"
Cohesion: 0.36
Nodes (9): Alpha Mask 'a' (Bolt Silhouette Clip), App Favicon (48x46 Bolt Icon), Lightning Bolt Logo Mark, Brand Palette (Violet #863bff / #7e14ff, Lilac #ede6ff, Cyan #47bfff), Display-P3 Wide-Gamut Color Fallback, Figma Export Provenance (effect1_foregroundBlur_2002_17158), Gaussian Blur Filter Set (b through p), Blurred Ellipse Glow Layer (+1 more)

### Community 161 - "Audio Tab & Voices"
Cohesion: 0.31
Nodes (8): AudioTab(), copyPrompt(), extractYoutube(), reloadEngines(), saveGeminiKey(), buildClipList(), buildScriptPrompt(), listVoices()

### Community 162 - "Material Nav Shortcuts"
Cohesion: 0.42
Nodes (7): digitTabIndex(), isTypingTarget(), scopeShortcutIndex(), scopeTabsFor(), stepNavId(), nav, wheelStepDir()

### Community 163 - "Provider Device Setup"
Cohesion: 0.29
Nodes (5): _device_setting(), ProgressCb, Deja el proveedor listo (descargar pesos, abrir sesión…)., _device_setting(), ``bg_removal.device`` de Configuración (auto | cuda | dml | cpu).

### Community 164 - "SAM Encode/Decode"
Cohesion: 0.32
Nodes (4): ndarray, Fotograma RGB (uint8, HxWx3) -> embeddings (nivel 1, cacheable)., embeddings + puntos -> matte (uint8, HxW, 0..255). ``points``: lista de ``(x,…, Conveniencia: encode + decode en un paso (para imágenes/still).

### Community 165 - "Clip Audio Mixing"
Cohesion: 0.36
Nodes (4): clip_mixes_audio(), Si un clip de la timeline aporta audio al mix (preview y ffmpeg)., False si la pista o el clip están silenciados., ClipMuteTest

### Community 166 - "Anton Font & Karaoke Docs"
Cohesion: 0.32
Nodes (8): Anton Font (backend, para el render/burn-in), SIL Open Font License 1.1 (fuentes del backend), Herencia pista→texto (effective_text_style / effectiveTextStyle), Karaoke real en export (text_ass.word_windows), migrations.py — schema_version=2 con migración lazy al leer, words[] reales de Whisper (Word model, word_timestamps), Anton Font (frontend, para el preview), SIL Open Font License 1.1 (fuentes del frontend)

### Community 169 - "Destructive Op Confirm Gate"
Cohesion: 0.32
Nodes (8): Gate confirm=true para operaciones destructive (REQUIRE_CONFIRM_DESTRUCTIVE), delete_media — único destructivo sin undo (borra el archivo), Enum cerrado de 8 códigos de error MCP, MCPError (code, message, hint, retryable, param), Etiquetado meta.domain + annotations (readOnly/destructive/idempotent hints), registry._wrap — chokepoint único (audit + errores + política), audit.py — JSONL append-only, guarda claves de params nunca valores, registry.py — @tool(access=read|write|destructive) con functools.wraps

### Community 170 - "Capabilities Discovery Docs"
Cohesion: 0.29
Nodes (8): DTO semántico (project_context / clip_summary / clip_detail / job_dto), get_project_context (Capa 0, orientación inicial), Capa DTO semántica + capabilities[] para escalar entre versiones, animate_clip (zoom / giro / slide / aparecer con SFX), describe_capabilities(domain?), generate_voice(text, engine=kokoro|piper|gemini), Resources de solo lectura (capabilities:// config:// help:// project://), set_clip_keyframes(x/y/scale/rotation/opacity)

### Community 171 - "Compose Speed Tests"
Cohesion: 0.57
Nodes (3): _clip_duration(), _clip(), ComposeClipDurationTest

### Community 172 - "Overlay Order Tests"
Cohesion: 0.48
Nodes (4): overlay_order(), IDs de clips de vídeo de fondo a frente: pista inferior primero, luego orden en…, _clip(), OverlayOrderTest

### Community 173 - "Motion Render Job"
Cohesion: 0.38
Nodes (7): Renderiza la composición y la inserta en la timeline como clip 'motion'., _run_motion_add(), asset_path(), _motion_dir(), Path, Renderiza (o reutiliza el caché) el WebM con alfa de la composición., render_composition()

### Community 174 - "GSAP Context Helpers"
Cohesion: 0.29
Nodes (7): Ab(), Bb(), cb(), Context(), fb(), Gw(), zb()

### Community 180 - "In-Process MCP Mount Docs"
Cohesion: 0.29
Nodes (7): Chat IA nativo — agente sobre el MCP existente (cero tools duplicadas), Historial persistente por proyecto (data/conversations/<pid>.json), GeminiProvider (google-genai, gemini-3.6-flash) tras la interfaz AIProvider, ai/mcp_client.py — Client in-process que descubre las tools del MCP, MCP montado en el mismo proceso FastAPI (streamable-HTTP /mcp), docs/superpowers/specs/2026-08-30-mcp-server-base-design.md, Gotcha Gemini 3.x: conservar los parts originales del stream (thought_signature)

### Community 181 - "Icon Sprite Sheet"
Cohesion: 0.57
Nodes (7): Bluesky Icon (butterfly brand mark, external profile link), Discord Icon (community chat link), Documentation Icon (purple outline document with code brackets, opens docs), GitHub Icon (octocat brand mark, repository link), Social Icon (purple outline user plus star, social/community section), Icons SVG Sprite Sheet, X (Twitter) Icon (brand mark, external profile link)

### Community 182 - "Vite Logo Asset"
Cohesion: 0.38
Nodes (7): Accessible SVG Title Label, Prefers-Color-Scheme Dark Theming, Gradient Glow Mask, Lightning Bolt Glyph, Parenthesis Brackets, Vite Build Tool, Vite Logo

### Community 183 - "OpenAI-Compatible Provider"
Cohesion: 0.40
Nodes (3): OpenAICompatibleProvider, Proveedores con API compatible con OpenAI: streaming + tool-calling. Un mismo…, Todas las claves del proveedor (para fallback). Local → una ficticia.

### Community 184 - "SAM Model Download"
Cohesion: 0.47
Nodes (4): ProviderUnavailable, ProgressCb, RuntimeError, SAM no puede trabajar (falta modelo, falta onnxruntime…).

### Community 185 - "Editor & Requirements Docs"
Cohesion: 0.40
Nodes (6): Faster Whisper, yt-dlp, IA Chat Assistant, Timeline, Video Editor, Motion Studio

### Community 187 - "Manual Piloting Docs"
Cohesion: 0.33
Nodes (6): Edición transaccional (snapshot → aplicar → validar → guardar), Flujo C — pilotaje manual (control total), get_project_context(project_id), resolve_project(query), undo / redo / checkpoint / restore_checkpoint, update_clip(clip_id, patch)

### Community 188 - "Vite React Template Docs"
Cohesion: 0.33
Nodes (6): Entrada de módulo /src/main.jsx, Punto de montaje #root, Reglas Oxlint, React Compiler (deshabilitado), Plantilla React + Vite con HMR, @vitejs/plugin-react (Oxc) vs plugin-react-swc (SWC)

### Community 189 - "Oxlint Config"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 190 - "Frontend Dev Dependencies"
Cohesion: 0.33
Nodes (6): devDependencies, oxlint, @types/react, @types/react-dom, vite, @vitejs/plugin-react

### Community 191 - "Image Add Modal"
Cohesion: 0.47
Nodes (5): ImageAddModal(), patch(), saveAll(), saveRowByKey(), takeFiles()

### Community 192 - "Text Role Helpers"
Cohesion: 0.73
Nodes (4): isCaptionText(), isFreeText(), isGeneratedClip(), textRole()

### Community 193 - "Piper Binary Download"
Cohesion: 0.60
Nodes (4): _download(), get_binary(), get_voices(), Descarga Piper (binario) y voces en español mexicano (es_MX). Uso: python…

### Community 196 - "React Logo Asset"
Cohesion: 0.60
Nodes (5): Atom Orbit Mark (three ellipses and nucleus), React Cyan Brand Color 00D8FF, Iconify Logos Icon Set, React UI Library, React Logo (SVG)

### Community 197 - "Explore Card Formatting"
Cohesion: 0.60
Nodes (5): ExploreCard(), ExplorePreview(), formatExploreMeta(), kindLabel(), providerLabel()

### Community 198 - "Background Removal Job"
Cohesion: 0.50
Nodes (4): clip_range(), Tramo de la FUENTE que necesita el clip, con margen., Calcula el matte de Eliminar fondo de un clip (nivel 1 de la caché). NO escribe…, _run_bg_removal()

### Community 199 - "Chroma Alpha Filters"
Cohesion: 0.50
Nodes (4): chroma_alpha_ffmpeg(), chroma_morph_params(), (sigma_frac, bias) para limpiar/expandir el alfa del croma. (0,0) = nada.…, Filtros ffmpeg que procesan un stream GRAY (el alfa del croma). '' si nada.

### Community 201 - "GSAP Vendor Misc"
Cohesion: 0.50
Nodes (4): Ud(), vd(), we(), xe()

### Community 204 - "Audio FX Grid"
Cohesion: 0.83
Nodes (4): AudioFxGrid(), setFx(), toggle(), valueOf()

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
- **425 isolated node(s):** `nav`, `out`, `props`, `source`, `target` (+420 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1616 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **40 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

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
- **Why does `Timeline` connect `Timeline Ops & Clip Kind` to `FastAPI Main & Schemas`, `Jobs & MCP Server Core`, `Real Composition Render Test`, `Media Library & Storage`, `MCP Read DTO Tests`, `Project & Job REST Endpoints`, `MCP Edit Tools`, `Timeline Ops Tests`, `MCP DTOs & Capabilities`, `FFmpeg Compose Core`, `Clip Mask Tests`, `MCP Render & Job Tools`, `Shorts & Timeline Store`, `Background Clip Spec Tests`, `Timeline Property Ops Tests`, `Overlay Export Filters`, `Subtitle Add Tests`, `Background Export Filter Tests`, `Timeline History & Export Tests`, `Still Compose Command Test`, `Timeline Migration Tests`, `Background Ops Tests`, `Background Cache Tests`, `Track Style Persistence`, `Export Preview Parity`, `Matte Alignment Tests`, `MCP Edit E45 Tests`, `MCP DTO Tests`, `Clip Background Model Tests`, `GIF Probe & Import`, `Background End-to-End Test`, `Timeline Store Tests`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._