# Graph Report - video-yt  (2026-09-09)

## Corpus Check
- 267 files · ~178,715 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3892 nodes · 9531 edges · 162 communities (140 shown, 20 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 549 edges (avg confidence: 0.9)
- Token cost: 488,090 input · 0 output

## Community Hubs (Navigation)
- Editor Model Helpers
- YouTube Heatmap & API
- Clip Animation & Keyframes
- Editor Inspector Panels
- Canvas Interactions & Rendering
- Clip Factory & Visual Props
- AI Chat Agent Core
- Timeline UI & Snapping
- Asset Import & Images
- Schemas & Explore Keywords
- Clip Audio & FFmpeg Compose
- Job Manager
- Clip Layout & Motion
- Material Tab & Ingest
- Shapes UI & Geometry
- Project Storage & Runners
- Clip Visual Effects
- Media Library
- MCP Edit Tools
- Timeline Clip Stacking
- Frontend API Client Hooks
- Timeline Ops Tests
- App Shell & Components
- Explore Feature
- Shape Geometry Backend
- MCP Errors & Media Tools
- yt-dlp Cookies & Auth
- Clip Layout Tests
- MCP Capabilities Discovery
- Clip Masks
- Timeline Structural Ops
- Panning & Recipe Layout
- Recipe Layout Backend
- SFX Tests
- Timeline Ops E45 Tests
- ASS Subtitle Rendering
- Effects Library UI
- MCP Registry & Job DTOs
- SFX Categories Backend
- Timeline Clip Schema & Captions
- Material Cards & SFX Modal
- Text Editor & Subtitle Themes
- Clip Kind & FFmpeg Inputs
- Export Settings
- Frontend Build Config
- SFX Naming & Classification
- AI Providers
- Clipper & Cutting
- GPU Detection
- Project CRUD
- Image Paste & Add Modal
- Editor Settings Panel
- Reframe Keyframes in Export
- Timeline Migrations
- Panel Layout
- Clip Speed & Reverse
- Favorites
- Karaoke Text Styles
- MCP Audit Log
- MCP DTOs & Summaries
- Image Schemas
- YouTube Audio Extraction
- Face Detection & Tracking
- Subtitle Presets & Themes
- Gemini TTS Tests
- MCP Capabilities Tests
- LLM Keyword Extraction
- Timeline History & Resources
- Export Cancellation Tests
- MCP Edit Tests
- SFX Endpoints
- Reframe Proxy Preparation
- MCP Edit E45 Tests
- Export Preview Parity
- Diagnostics & Logging
- GPU Tests
- AI Chat UI
- Word Fragmentation Parity
- Clip Animation Frontend
- Provider Error Handling
- Piper TTS
- Short Workflows & Deps
- AI Conversation Store
- Clip Composition Render
- Overlay Video Filters
- Undo / Redo / Checkpoint
- Reframe Math
- Clip Property Ops
- Whisper Transcription
- Whisper Word Normalization
- AI Agent Tests
- Anchored Menus & Popovers
- MCP Toolset Client
- MCP Read Tools
- MCP Vision Tools
- YouTube URL History
- MCP Audio Tests
- MCP Audit Tests
- Short Workflow Tests
- Timeline History Tests
- Clip FX Tests
- Clip Kind Predicates
- Transcript Fragmentation
- Gemini TTS
- Editor Concept Docs
- Two-Layer Compose Layout
- Effective Text Style
- AI Provider Tests
- Fragmentation Tests
- MCP Registry Tests
- MCP Consolidation Rationale
- MCP Deployment Overview
- Audit Entry Writing
- Word Time Windows
- Whisper CUDA Fallback
- Editor Feature Docs
- Anton Font Licensing
- Text Role Resolution
- Progressive Discovery Docs
- Timeline Store Tests
- Audio & Text Style Docs
- MCP Tool Catalog Docs
- Hero Image Asset
- MCP Undo Tools
- API Key Settings Tests
- MCP Context Tests
- MCP Structured Error Tests
- Export Format Docs
- Project Entry Docs
- MCP Architecture Options
- App Favicon Branding
- Destructive Op Guards
- Clip Props Tests
- Chat SSE Streaming
- Compose Speed Duration
- Overlay Z-Order
- Native AI Chat Deps
- Export Settings Tests
- MCP Media Tests
- Add Subtitles Tests
- Transcribe Settings Tests
- Social & UI Icon Sprite
- Vite Logo Asset
- Clip Audio Ops
- MCP Version Constraint
- Provider Retry Tests
- Migration Idempotence Tests
- Project Save Locking
- Oxlint Config
- Delete Operations
- Animate & Reframe Ops
- Kokoro TTS Runner
- Piper Downloader
- Conversation Store Tests
- In-Process MCP Client Tests
- Job Management Tests
- Manual Piloting Docs
- React Logo Asset
- Tool-Calling Loop
- Tool Classification Notes

## God Nodes (most connected - your core abstractions)
1. `VideoEditor()` - 152 edges
2. `TimelineClip` - 124 edges
3. `Timeline` - 109 edges
4. `TimelineTrack` - 54 edges
5. `get_project()` - 51 edges
6. `EdMaterial()` - 44 edges
7. `ClipInfo` - 40 edges
8. `build_command()` - 39 edges
9. `base_tl()` - 38 edges
10. `clamp()` - 37 edges

## Surprising Connections (you probably didn't know these)
- `describe_capabilities(domain?)` --shares_data_with--> `google-genai`  [INFERRED]
  docs/MCP_AUDITORIA_REDISENO.md → backend/requirements.txt
- `SIL Open Font License 1.1 (fuentes del backend)` --semantically_similar_to--> `SIL Open Font License 1.1 (fuentes del frontend)`  [INFERRED] [semantically similar]
  backend/app/fonts/OFL.txt → frontend/public/fonts/OFL-Anton.txt
- `Anton Font (backend, para el render/burn-in)` --semantically_similar_to--> `Anton Font (frontend, para el preview)`  [INFERRED] [semantically similar]
  backend/app/fonts/OFL.txt → frontend/public/fonts/OFL-Anton.txt
- `Empaquetar como app o desplegar en servidor (pendiente)` --conceptually_related_to--> `Endpoint http://127.0.0.1:8000/mcp (streamable-HTTP)`  [AMBIGUOUS]
  README.md → docs/MCP_USO.md
- `add_subtitles(source_clip_id, segments)` --semantically_similar_to--> `Subtítulos y clips de texto`  [INFERRED] [semantically similar]
  docs/MCP_USO.md → docs/EDITOR.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Flujo de reencuadre vertical con seguimiento de cara** — docs_editor_clip_editor, docs_editor_proxy_ligero, docs_editor_reencuadre, docs_editor_seguimiento_de_cara, docs_editor_keyframes, docs_editor_guardar_clip [EXTRACTED 1.00]
- **Capa de descubrimiento del MCP** — docs_mcp_uso_describe_capabilities, docs_mcp_uso_list_projects, docs_mcp_uso_resolve_project, docs_mcp_uso_resources, docs_mcp_uso_get_project_context [EXTRACTED 1.00]
- **Pasos del flujo C (pilotaje manual YouTube → export)** — docs_mcp_uso_analyze_youtube, docs_mcp_uso_create_clips_from_segments, docs_mcp_uso_add_to_timeline, docs_mcp_uso_set_project_format, docs_mcp_uso_transcribe, docs_mcp_uso_add_subtitles, docs_mcp_uso_export_project, docs_mcp_uso_jobs_wait_for_job [EXTRACTED 1.00]
- **Capa de descubrimiento progresivo del MCP** — docs_mcp_auditoria_rediseno_describe_capabilities, docs_mcp_auditoria_rediseno_help, docs_mcp_auditoria_rediseno_resources_mcp, docs_mcp_auditoria_rediseno_get_project_context, docs_mcp_auditoria_rediseno_meta_annotations [EXTRACTED 1.00]
- **Sistema de errores estructurados en el chokepoint** — docs_mcp_auditoria_rediseno_mcperror, docs_mcp_auditoria_rediseno_error_codes, docs_mcp_auditoria_rediseno_registry_wrap, docs_mcp_progreso_registry [EXTRACTED 1.00]
- **Protección de las 3 operaciones irreversibles** — docs_mcp_auditoria_rediseno_delete_media, docs_mcp_auditoria_rediseno_export_project, docs_mcp_auditoria_rediseno_set_project_format, docs_mcp_auditoria_rediseno_dry_run, docs_mcp_auditoria_rediseno_confirm_destructive [EXTRACTED 1.00]
- **Solid black (#08060d) brand marks for external social links** — frontend_public_icons_bluesky_icon, frontend_public_icons_discord_icon, frontend_public_icons_github_icon, frontend_public_icons_x_icon [INFERRED 0.95]
- **Purple (#aa3bff) 1.35 rounded-stroke outline icon style** — frontend_public_icons_documentation_icon, frontend_public_icons_social_icon, frontend_public_icons_sprite_sheet [INFERRED 0.95]
- **SVG <symbol> sprite referenced by id via <use>** — frontend_public_icons_sprite_sheet, frontend_public_icons_bluesky_icon, frontend_public_icons_discord_icon, frontend_public_icons_documentation_icon, frontend_public_icons_github_icon, frontend_public_icons_social_icon, frontend_public_icons_x_icon [EXTRACTED 1.00]

## Communities (162 total, 20 thin omitted)

### Community 0 - "Editor Model Helpers"
Cohesion: 0.02
Nodes (151): applyAudioSpeedToLinkedText(), canCaptionClip(), canLayerClip(), clipLayerInfo(), clipPlaybackMuted(), clipSaveIndex(), clipsOnTrackSorted(), clipSourceDur() (+143 more)

### Community 1 - "YouTube Heatmap & API"
Cohesion: 0.04
Nodes (92): analyze(), _pick_segments(), Análisis del heatmap ("Most Replayed") de un vídeo de YouTube. yt-dlp ya expone…, Convierte los puntos del heatmap en tramos recortables. 1. Marca los puntos…, Punto de entrada: analiza un vídeo y devuelve info + tramos., add_sfx(), ai_conversation(), ai_conversations() (+84 more)

### Community 2 - "Clip Animation & Keyframes"
Cohesion: 0.05
Nodes (78): clip_pose(), interp_track(), normalize_track(), _num(), Any, Animación de clip (posición / escala / rotación / opacidad). Espejo de…, static_pose(), apply_volume_fade() (+70 more)

### Community 3 - "Editor Inspector Panels"
Cohesion: 0.05
Nodes (84): EdCrops(), kfList(), kfTime(), speedLabel(), AudioFxGrid(), setFx(), toggle(), valueOf() (+76 more)

### Community 4 - "Canvas Interactions & Rendering"
Cohesion: 0.07
Nodes (81): clipDur(), safeMediaTime(), timelineToSource(), createCanvasDownHandler(), createMainDownHandler(), createResultDownHandler(), listenMove(), nearHandle() (+73 more)

### Community 5 - "Clip Factory & Visual Props"
Cohesion: 0.05
Nodes (70): applyClipVisualProps(), applyFaceTrack(), clipCopyText(), duplicateClipOntoTrack(), makeClip(), makeShapeClip(), makeTextClip(), newReframe() (+62 more)

### Community 6 - "AI Chat Agent Core"
Cohesion: 0.04
Nodes (47): _access(), _is_mutating(), Agente del Chat IA: orquesta proveedor ↔ tools MCP y emite eventos. Generador…, Chat IA nativo del editor: agente que opera el MCP existente. NO duplica tools…, Cliente MCP in-process para el agente. Usa el ``Client`` del SDK ``mcp`` 2.x…, Configuración central del proyecto. Todos los valores por defecto viven aquí…, MCP server: capa de control para que una IA opere el editor. Se monta en el…, _classify_value_error() (+39 more)

### Community 7 - "Timeline UI & Snapping"
Cohesion: 0.06
Nodes (64): clipEnd(), displayTracks(), linkedPartnerName(), trackKindForClip(), trimClipPatch(), trimPreviewHead(), EdTimeline(), onLaneDragOver() (+56 more)

### Community 8 - "Asset Import & Images"
Cohesion: 0.05
Nodes (39): allowed_download_url(), AssetImportService, _download(), _filename(), Importa un resultado de Explorar al almacenamiento local del proyecto., _clean_filename(), _ext_from_magic(), fetch_image() (+31 more)

### Community 9 - "Schemas & Explore Keywords"
Cohesion: 0.05
Nodes (23): gather_theme_text(), AudioInfo, ClipInfo, Una pista del editor (V1, V2… / A1, A2… / T1)., TimelineTrack, Transcript, TranscriptSegment, GatherTest (+15 more)

### Community 10 - "Clip Audio & FFmpeg Compose"
Cohesion: 0.05
Nodes (53): clip_mixes_audio(), Si un clip de la timeline aporta audio al mix (preview y ffmpeg)., False si la pista o el clip están silenciados., _alpha_chain(), ass_overlay_filter(), build_command(), _clip_path(), _color() (+45 more)

### Community 11 - "Job Manager"
Cohesion: 0.06
Nodes (60): all_jobs(), create_job(), _find_timeline_clip_by_filename(), get_job(), JobCancelled, _mmss(), Exception, Gestor de trabajos en memoria. Cada petición de clips crea un Job con un id. El… (+52 more)

### Community 12 - "Clip Layout & Motion"
Cohesion: 0.06
Nodes (45): _clamp(), dest_rect(), dest_rect_even(), _even(), is_overlay(), new_transform(), Any, Encuadre (crop de fuente) y transformación del resultado en el canvas de… (+37 more)

### Community 13 - "Material Tab & Ingest"
Cohesion: 0.07
Nodes (44): droppedUrl(), EdMaterial(), confirmDeleteMaterial(), copyAudioDescription(), ingestFiles(), onFileDragEnter(), onFileDragLeave(), onFileDragOver() (+36 more)

### Community 14 - "Shapes UI & Geometry"
Cohesion: 0.07
Nodes (47): ACTIONS, EdLayer(), EdShape(), EdShapes(), ARROW_TYPES, clampN(), curvedArrowPoly(), defaultShape() (+39 more)

### Community 15 - "Project Storage & Runners"
Cohesion: 0.08
Nodes (49): _run(), _run_compose(), _run_export(), _run_tts(), _run_youtube_audio(), get_export(), manifest(), JSON con la descripción de todo el material (listo para pasar a una IA). (+41 more)

### Community 16 - "Clip Visual Effects"
Cohesion: 0.09
Nodes (25): audio_fx_chain(), _audio_fx_map(), _clamp01(), clip_fx_at(), effects_ffmpeg(), _effects_map(), _field(), _fx_num() (+17 more)

### Community 17 - "Media Library"
Cohesion: 0.09
Nodes (24): _file(), _find_item(), get_item(), infer_origin_source(), library_root(), LibraryInUseError, list_library(), _load() (+16 more)

### Community 18 - "MCP Edit Tools"
Cohesion: 0.08
Nodes (49): add_shape(), add_subtitles(), add_to_timeline(), add_track(), animate_clip(), _apply(), duplicate_clip(), link_tracks() (+41 more)

### Community 19 - "Timeline Clip Stacking"
Cohesion: 0.06
Nodes (46): clipsOverlap(), clipWidth(), clusterKey(), clusterSpan(), COVER_RATIO, coversMost(), frontClipId(), fullyCovers() (+38 more)

### Community 20 - "Frontend API Client Hooks"
Cohesion: 0.09
Nodes (46): extractYoutube(), importMedia(), loadYt(), toggleHistory(), toggleSave(), normalizeHistory(), useExportJob(), doExport() (+38 more)

### Community 21 - "Timeline Ops Tests"
Cohesion: 0.07
Nodes (11): AddClipTest, AddTrackTest, base_tl(), MoveClipTest, Contrato de timeline_ops: operaciones estructurales puras sobre el Timeline.…, ReframeClipTest, RemoveTest, SetClipLayoutTest (+3 more)

### Community 22 - "App Shell & Components"
Cohesion: 0.08
Nodes (31): App(), confirmDeleteProject(), navigate(), onCreate(), refresh(), readHash(), ConfirmModal(), Icon() (+23 more)

### Community 23 - "Explore Feature"
Cohesion: 0.12
Nodes (34): EdExplore(), addItem(), ExploreCard(), ExplorePreview(), CLASSIC_SUGGESTIONS, cloneExploreSession(), collectThemeText(), EMPTY_EXPLORE_SESSION (+26 more)

### Community 24 - "Shape Geometry Backend"
Cohesion: 0.11
Nodes (26): _bgr(), _clamp(), _curved_arrow_poly(), default_shape(), _ellipse_pts(), _heart_pts(), _hex(), _map_pt() (+18 more)

### Community 25 - "MCP Errors & Media Tools"
Cohesion: 0.08
Nodes (29): _extract_info(), Descarga solo los metadatos del vídeo (sin bajar el vídeo en sí)., start_job(), clip(), Obtiene el título del vídeo (para nombrar archivos). Vacío si falla., Lanza un trabajo en segundo plano para generar los clips seleccionados., _video_title(), MCPError (+21 more)

### Community 26 - "yt-dlp Cookies & Auth"
Cohesion: 0.10
Nodes (19): auth_attempts(), call(), _configured_browser(), _cookie_file(), friendly_error(), is_auth_error(), is_cookie_source_error(), _msg() (+11 more)

### Community 27 - "Clip Layout Tests"
Cohesion: 0.06
Nodes (35): afterUserScale, biggerCrop, bot, botCrop, botDest, botPx, clamped, containClip (+27 more)

### Community 28 - "MCP Capabilities Discovery"
Cohesion: 0.08
Nodes (31): crop_modes(), describe(), domains(), overview(), Capacidades descubribles del editor (fuente única para tools + resources). Fase…, Capacidades de UN dominio: verbos, valores válidos y guía. ValueError si no…, Info de ejecución: GPU, proveedor de IA, binarios, defaults, rutas., {dominio: [tools]} a partir del mapa real de help_content.TOOL_DOMAINS. (+23 more)

### Community 29 - "Clip Masks"
Cohesion: 0.09
Nodes (30): applyMasksToLayer(), beginMaskLayer(), clamp(), clipMasks(), defaultMask(), endMaskLayer(), hasMask(), heartPoints() (+22 more)

### Community 30 - "Timeline Structural Ops"
Cohesion: 0.16
Nodes (33): add_clip(), add_shape(), add_subtitles(), add_track(), _clip_dur(), _copy(), duplicate_clip(), EditResult (+25 more)

### Community 31 - "Panning & Recipe Layout"
Cohesion: 0.09
Nodes (28): blit(), drawReframe(), fitOf(), frameAt(), KF_COLORS, modeOf(), OUT_RATIO, posAt() (+20 more)

### Community 32 - "Recipe Layout Backend"
Cohesion: 0.13
Nodes (16): contain_dest(), contain_scale_filter(), dual_slot_wh(), dual_stack_name(), _field(), is_master_reframe(), join_dual_filters(), Any (+8 more)

### Community 33 - "SFX Tests"
Cohesion: 0.08
Nodes (8): AddSfxHttpTest, AddSfxNoLibraryTest, AddSfxTest, CreateSfxCategoryTest, Path, Alta de SFX: copia el audio, registra JSON y crea categoría si hace falta., UpdateSfxTest, _write_lib()

### Community 34 - "Timeline Ops E45 Tests"
Cohesion: 0.13
Nodes (7): CapabilitiesTest, _clip(), LinkTracksTest, PropertyOpsTest, Etapa 4.5 — ops nuevas de propiedades por-clip / figuras (timeline_ops puro)., ShapeOpTest, _tl()

### Community 35 - "ASS Subtitle Rendering"
Cohesion: 0.13
Nodes (27): _active_override(), active_word_index(), _alignment(), alpha_hex(), _alpha_tags(), ass_bgr(), ass_time(), _clamp01() (+19 more)

### Community 36 - "Effects Library UI"
Cohesion: 0.13
Nodes (28): EdEffects(), patchEffects(), toggleVideo(), fxTabs(), tabLabel(), EdFxLibrary(), patchEffects(), toggleVideo() (+20 more)

### Community 37 - "MCP Registry & Job DTOs"
Cohesion: 0.11
Nodes (28): job_dto(), Estado de un job + resumen del resultado según su tipo., Decorador: registra ``fn`` como tool del MCP con auditoría y política., tool(), get_job(), _job_or_raise(), Tools de LECTURA de jobs (Etapa 3). Aprovechan que el MCP corre en el MISMO…, Estado de un job (status, progreso, mensaje) + resumen del resultado. (+20 more)

### Community 38 - "SFX Categories Backend"
Cohesion: 0.17
Nodes (29): create_sfx_category(), add_sound(), _cat_dto(), create_category(), _ensure_dir(), _entry(), _find_sonido(), get_base() (+21 more)

### Community 39 - "Timeline Clip Schema & Captions"
Cohesion: 0.16
Nodes (10): Un elemento colocado en una pista de la timeline. ``start`` es la posición en…, TimelineClip, build_ass(), caption_dialogues(), _clip_dur(), split_words(), TimelineClipFxFieldsTest, ImageInfoSchemaTest (+2 more)

### Community 40 - "Material Cards & SFX Modal"
Cohesion: 0.12
Nodes (19): AudioCard(), CargarCustom(), CargarRecList(), SfxCard(), TimeInput(), commit(), bustUrl(), dragPayload() (+11 more)

### Community 41 - "Text Editor & Subtitle Themes"
Cohesion: 0.13
Nodes (25): EdText(), sizeToNearestPx(), TextFxPanel(), themePreviewStyle(), WordsPerBox(), requestFragmentClip(), BLOCK_APPEAR_OPTIONS, sub (+17 more)

### Community 42 - "Clip Kind & FFmpeg Inputs"
Cohesion: 0.11
Nodes (11): ffmpeg_input_args(), ffmpeg_trim_window(), _in_out(), is_still_clip(), Familias de clip ↔ pista. Permite tipos nuevos sin rehacer la timeline. Las…, Ventana de ``trim`` sobre el input de ffmpeg. El still se genera con ``-loop``…, Args ``-i`` de un clip. Still: loop; vídeo/audio: archivo tal cual., ClipKindImageTest (+3 more)

### Community 43 - "Export Settings"
Cohesion: 0.15
Nodes (24): encoder_quality(), load(), normalize(), FPS y calidad de export (Configuración del editor)., put_settings(), put_timeline(), transcribe_models(), api_key() (+16 more)

### Community 44 - "Frontend Build Config"
Cohesion: 0.08
Nodes (25): dependencies, material-icons, react, react-dom, devDependencies, oxlint, @types/react, @types/react-dom (+17 more)

### Community 45 - "SFX Naming & Classification"
Cohesion: 0.17
Nodes (23): defaultMeta(), isAudioFile(), SfxCategoryCell(), cancel(), confirm(), SfxClassifyModal(), patch(), rememberCat() (+15 more)

### Community 46 - "AI Providers"
Cohesion: 0.13
Nodes (19): ai_config(), AIProvider, _api_keys(), _auto_provider(), _default_model(), GeminiProvider, get_provider(), _has_key() (+11 more)

### Community 47 - "Clipper & Cutting"
Cohesion: 0.14
Nodes (25): _clamp(), _crop_filter(), _cut_clip(), _download_source(), generate_clips(), _pw_expr(), _pw_expr_direct(), Path (+17 more)

### Community 48 - "GPU Detection"
Cohesion: 0.12
Nodes (25): _add_nvidia_dll_dirs(), cuda_available(), _cuda_libs_ok(), _dll_loads(), _encoder_args_for(), _encoder_works(), _gpu_disabled(), hw_encoder() (+17 more)

### Community 49 - "Project CRUD"
Cohesion: 0.16
Nodes (25): add_audio(), add_clips(), add_image(), add_transcript(), apply_manifest(), create_project(), delete_project(), _is_lock_error() (+17 more)

### Community 50 - "Image Paste & Add Modal"
Cohesion: 0.18
Nodes (22): ingestClipboard(), onPaste(), pasteFromSystem(), ImageAddModal(), patch(), saveAll(), saveRowByKey(), takeFiles() (+14 more)

### Community 51 - "Editor Settings Panel"
Cohesion: 0.14
Nodes (21): removeHistory(), API_PROVIDERS, AUDIO_DB_PRESETS, EdSettings(), cancel(), reload(), reloadAi(), remove() (+13 more)

### Community 52 - "Reframe Keyframes in Export"
Cohesion: 0.14
Nodes (14): Keyframes del reframe pasados a tiempo LOCAL del fragmento recortado. Los…, Cadena de filtros (crop+scale) para el reencuadre de un clip, sin el trim.…, _reframe_cropscale(), _shifted_keyframes(), Keyframe, Posición del centro de la ventana de recorte en un instante. ``t`` es el…, Animación de reencuadre aplicada a un clip. ``zoom`` = fracción de la altura…, Reframe (+6 more)

### Community 53 - "Timeline Migrations"
Cohesion: 0.08
Nodes (15): migrate_timeline(), Migración del JSON del timeline entre versiones de schema. Reglas: * **Forward-…, v1 → v2: introduce timing real por palabra en las transcripciones y sienta la…, v3 → v4: el preview conserva el tono al acelerar (preservesPitch).…, Versión declarada del timeline. Ausente o inválida = 1 (legacy)., Lleva un timeline (dict) a ``CURRENT_SCHEMA_VERSION``. Devuelve la entrada tal…, timeline_version(), _v1_to_v2() (+7 more)

### Community 54 - "Panel Layout"
Cohesion: 0.16
Nodes (22): measure(), usePanelLayout(), applyPanelDrag(), clampPanelLayout(), KEYS, num(), PANEL_DEFAULTS, PANEL_LAYOUT_KEY (+14 more)

### Community 55 - "Clip Speed & Reverse"
Cohesion: 0.20
Nodes (13): atempo_chain(), audio_speed_filters(), clip_reverse(), clip_source_duration(), clip_speed(), clip_timeline_duration(), _field(), keep_pitch() (+5 more)

### Community 56 - "Favorites"
Cohesion: 0.17
Nodes (20): useFavorites(), isClipFav(), saveTextStyle(), toggleClipFav(), toggleSfx(), applyTextFavorite(), audioFavKey(), clipFavRef() (+12 more)

### Community 57 - "Karaoke Text Styles"
Cohesion: 0.17
Nodes (22): exportPayload(), activeWordIndex(), activeWordIndexFromWords(), clamp01(), hasWordFx(), karaokeOn(), MAX_WORDS_PER_BOX, styleOpacity() (+14 more)

### Community 58 - "MCP Audit Log"
Cohesion: 0.11
Nodes (22): mcp_audit(), Últimas llamadas a tools del MCP (chat interno o IA externa). Sin valores de…, active(), _audit_path(), begin(), extract_meta(), _job_status(), _matches_project() (+14 more)

### Community 59 - "MCP DTOs & Summaries"
Cohesion: 0.14
Nodes (21): project_summary(), Resumen minúsculo de un proyecto para listar/desambiguar., analyze_dto(), aspect_ratio(), clip_detail(), _clip_summary(), _clip_timeline_duration(), _dup_counts() (+13 more)

### Community 60 - "Image Schemas"
Cohesion: 0.10
Nodes (8): ImageInfo, Un archivo de imagen del proyecto (PNG/JPG/WebP…), sin convertir a vídeo., ComposeStillCommandTest, FetchImageTest, Etapa 4.5 — tools de edición nuevas + fetch_image (integración por apply_op)., RegistrationTest, DeleteMediaTest, skipUnless

### Community 61 - "YouTube Audio Extraction"
Cohesion: 0.13
Nodes (13): YouTubeAudioRequest, extract_audio(), is_youtube_url(), probe_duration(), Path, ProgressCb, Extraer el audio de un vídeo de YouTube (yt-dlp + ffmpeg → m4a)., Descarga el audio del vídeo y lo deja en ``out_path`` (m4a). (+5 more)

### Community 62 - "Face Detection & Tracking"
Cohesion: 0.14
Nodes (21): _detect_faces(), dims(), face_center_x(), face_track(), _get_detector(), _model_path(), _prep_frame(), ndarray (+13 more)

### Community 63 - "Subtitle Presets & Themes"
Cohesion: 0.13
Nodes (21): buildSubtitleClips(), applyPreset(), applyTrackPreset(), themeById(), applyThemeToStyle(), applyOrClearTheme(), clearTextTheme(), FONTS (+13 more)

### Community 64 - "Gemini TTS Tests"
Cohesion: 0.10
Nodes (7): AvailableTest, NarrationPromptTest, PublicSettingsTest, Gemini TTS: prompt de estilo, WAV y disponibilidad sin llamar a la API., _silent_pcm(), VoicesListTest, WriteWavTest

### Community 65 - "MCP Capabilities Tests"
Cohesion: 0.14
Nodes (3): CapabilitiesTest, _read(), _text()

### Community 66 - "LLM Keyword Extraction"
Cohesion: 0.20
Nodes (12): _anthropic_keywords(), extract_keywords(), _first_llm(), _gemini_keywords(), _llm_keywords(), _openai_keywords(), parse_keyword_list(), _post_json() (+4 more)

### Community 67 - "Timeline History & Resources"
Cohesion: 0.22
Nodes (18): timeline_restore(), _history(), _history_summary(), can_redo(), can_undo(), checkpoint(), list_checkpoints(), _norm() (+10 more)

### Community 68 - "Export Cancellation Tests"
Cohesion: 0.13
Nodes (7): Timeline, CooperativeCancelTest, ExportTest, La cancelación aborta el runner en el siguiente on_progress (best-effort)., _timeline(), SchemaConsistencyTest, TrackStylePersistTest

### Community 70 - "SFX Endpoints"
Cohesion: 0.14
Nodes (12): list_sfx(), patch, set_sfx_folder(), update_sfx(), sfx_categories(), _favorite_sfx_ids(), filter_sfx_items(), Filtra por búsqueda y categoría. ``favoritos`` usa ids marcados con estrella. (+4 more)

### Community 71 - "Reframe Proxy Preparation"
Cohesion: 0.19
Nodes (17): _download_proxy(), _ffmpeg_proxy(), _key(), _local_media_path(), prepare(), proxy_path(), Path, ProgressCb (+9 more)

### Community 73 - "Export Preview Parity"
Cohesion: 0.24
Nodes (9): _fill_base_cropscale(), Crop+scale de un clip fill: cover como el preview, no letterbox. El editor…, _clip(), FillCropMatchesPreviewTest, FillPoseKeepsCropTest, _graph(), patch, El export de fill debe recortar y transicionar como el preview (Resultado). El… (+1 more)

### Community 74 - "Diagnostics & Logging"
Cohesion: 0.14
Nodes (16): configure_logging(), _ffmpeg_info(), log_report(), _opencv_info(), probe(), Diagnóstico de rendimiento: qué "motor" usará cada parte del pipeline. Los dos…, ¿Hay ffmpeg? ¿Qué codificadores por hardware ofrece?, Sonda cacheada de la máquina. Barata de llamar (solo se ejecuta 1 vez). (+8 more)

### Community 75 - "GPU Tests"
Cohesion: 0.16
Nodes (3): GpuSelectionTest, _probe(), Selección de aceleración por hardware: whisper device + encoder de vídeo.

### Community 76 - "AI Chat UI"
Cohesion: 0.19
Nodes (15): ACCESS_LABEL, EdChat(), patchLast(), send(), EXAMPLES, fmtAuditTime(), fmtMeta(), McpAuditLog() (+7 more)

### Community 77 - "Word Fragmentation Parity"
Cohesion: 0.12
Nodes (14): relSegmentWords(), textClipsFromTranscript(), abs, allWords, caps, noWords, parent, re (+6 more)

### Community 78 - "Clip Animation Frontend"
Cohesion: 0.18
Nodes (15): ANIM_PROPS, applyShapePose(), interpTrack(), legacyAnimPose(), normalizeTrack(), num(), staticPose(), mid (+7 more)

### Community 79 - "Provider Error Handling"
Cohesion: 0.19
Nodes (13): _friendly_error(), _payload_no_image(), Exception, Código HTTP del error (openai usa ``status_code``; google-genai ``code``)., ¿SATURACIÓN transitoria (5xx) que conviene reintentar? (429/404/401 no)., (base64, mime) si el resultado de una tool trae una imagen para VER., Copia del resultado sin el base64 (para el evento SSE al frontend)., Payload JSON para el modelo, sin el base64 (evita gastar tokens en texto). (+5 more)

### Community 80 - "Piper TTS"
Cohesion: 0.22
Nodes (15): available(), _binary(), _label_for(), list_voices(), Path, ProgressCb, Narrador con voz IA (TTS) usando Piper — voces en español mexicano (es_MX). A…, Todos los modelos .onnx de voz disponibles (en voices/ o en la raíz). (+7 more)

### Community 81 - "Short Workflows & Deps"
Cohesion: 0.13
Nodes (16): opencv-python-headless, yt-dlp, W1 create_short_from_youtube, W3 create_subtitled_clip (opcional, no crear por crear), Fase 6 — seguridad + robustez de jobs, Envelope único de job (status/progress/result/error), W2 make_short_from_library, result_ref — ids en vez de volcar resultados pesados (+8 more)

### Community 82 - "AI Conversation Store"
Cohesion: 0.29
Nodes (14): append(), _dir(), _find(), get_messages(), get_or_create(), history(), list_conversations(), _load() (+6 more)

### Community 83 - "Clip Composition Render"
Cohesion: 0.30
Nodes (11): _filter_graph(), generate_composition(), is_http_url(), Path, ProgressCb, Genera un clip 9:16 combinando hasta 2 capas (fuentes distintas o la misma)., resolve_layer_source(), resolve_local_media() (+3 more)

### Community 84 - "Overlay Video Filters"
Cohesion: 0.28
Nodes (7): _even(), _overlay_video_filter(), Crop de fuente (tamaño fijo) + scale/rotate del resultado. Devuelve (filtro,…, _overlay_clip(), OverlayChainOrderTest, OverlayExportTest, patch

### Community 85 - "Undo / Redo / Checkpoint"
Cohesion: 0.22
Nodes (15): timeline_checkpoint(), timeline_redo(), timeline_undo(), Guarda la composición del editor de vídeo en el proyecto., save_timeline(), empty_history(), apply_op(), checkpoint() (+7 more)

### Community 86 - "Reframe Math"
Cohesion: 0.24
Nodes (10): _clamp(), frame_at(), _kf_cx(), _kf_cy(), _kf_fit(), _kf_mode(), _kf_t(), _kf_zoom() (+2 more)

### Community 87 - "Clip Property Ops"
Cohesion: 0.16
Nodes (15): _find_clip(), Opacidad estática del clip (0 = transparente, 1 = opaco)., Velocidad del clip (0.1–10; la fuente fija, la barra cambia). No aplica a…, Transiciones de entrada (``appear``) y salida (``exit``) del clip., Rol de un clip de texto: ``caption`` (subtítulo) o ``free`` (texto libre)., Actualiza varias propiedades escalares de un clip en UNA sola operación.…, Efectos de audio (eq/compressor/reverb/echo/denoise/distortion, 0–1). MERGE por…, Animación por keyframes: ``{enabled, items:[{id,t,interpolation,props}]}``.… (+7 more)

### Community 88 - "Whisper Transcription"
Cohesion: 0.23
Nodes (14): _collect_segments(), _download_audio(), _get_model(), Path, ProgressCb, Transcripción de vídeos de YouTube con faster-whisper (STT). Descarga solo el…, Transcribe un archivo de audio/vídeo ya en disco., Descarga el audio del vídeo de YouTube y lo transcribe. (+6 more)

### Community 89 - "Whisper Word Normalization"
Cohesion: 0.21
Nodes (8): _attr(), Lee un campo de un Word de faster-whisper (objeto) o de un dict., Normaliza las palabras de un segmento a dicts persistibles. Descarta palabras…, shape_words(), Tests del shaping de palabras (timing real por palabra de faster-whisper). No…, ShapeWordsTest, TranscriptWordsSchemaTest, _w()

### Community 90 - "AI Agent Tests"
Cohesion: 0.18
Nodes (5): AgentTest, _collect(), FakeProvider, Provider scripted (modelo emit): pide una tool real y termina., UnavailableProvider

### Community 91 - "Anchored Menus & Popovers"
Cohesion: 0.22
Nodes (6): AnchoredMenu(), FlipPopover(), FlipSelect(), placeAnchoredMenu(), placeMenu(), react-dom

### Community 92 - "MCP Toolset Client"
Cohesion: 0.15
Nodes (10): Sondea get_job emitiendo progreso hasta que termina. Devuelve el estado final., _wait_job(), _clean_schema(), McpToolset, Poda un JSON-Schema a lo que entiende el function-calling de los LLM., Normaliza el CallToolResult a ``{ok, data, text}``. En error, el SDK prefija el…, Sesión abierta contra el MCP in-process para un turno de chat., Declaraciones de función provider-agnósticas (name/description/parameters). (+2 more)

### Community 93 - "MCP Read Tools"
Cohesion: 0.23
Nodes (13): media_list(), Inventario detallado de material del proyecto., get_timeline(), inspect_clip(), list_media(), _project_or_raise(), Tools de LECTURA sobre el proyecto/timeline (Etapa 3)., Timeline: pistas y clips con sus propiedades (sin words/keyframes). (+5 more)

### Community 94 - "MCP Vision Tools"
Cohesion: 0.26
Nodes (13): _clip_file(), _clip_or_raise(), get_frame(), _project_or_raise(), Path, Visión: darle OJOS a la IA + descripción de material. ``get_frame`` extrae un…, Devuelve un fotograma (imagen) de un clip del material para que lo VEAS.…, Guarda tu descripción de un clip en un campo APARTE (description_ai); NO pisa… (+5 more)

### Community 95 - "YouTube URL History"
Cohesion: 0.20
Nodes (7): _as_items(), _key(), Historial de enlaces de YouTube consultados (analyze)., record(), remove(), _video_fields(), YtHistoryTest

### Community 98 - "Short Workflow Tests"
Cohesion: 0.23
Nodes (6): _fake_analyze(), _fake_generate(), _fake_render(), _fake_transcribe(), Orquestación de workflows de short (servicios pesados mockeados)., ShortsTest

### Community 99 - "Timeline History Tests"
Cohesion: 0.22
Nodes (4): CheckpointTest, Core de historial: snapshot / undo / redo / checkpoints (puro, sobre dicts)., tl(), UndoRedoTest

### Community 100 - "Clip FX Tests"
Cohesion: 0.14
Nodes (13): FX_DUR, both, dissolveIn, fadeIn, fadeOut, id, id2, mid (+5 more)

### Community 101 - "Clip Kind Predicates"
Cohesion: 0.15
Nodes (11): clip_fits_track(), has_generated_duration(), is_visual_clip(), track_kind_for_clip(), Incidencias DURAS del estado (refs rotas, rangos imposibles). Vacío = sano. Los…, Coloca un clip: posición (full/top/bottom/free) y opcionalmente timing. Cubre…, Efectos visuales del clip (blur/grayscale/sepia/brightness…). Por defecto MERGE…, set_clip_effects() (+3 more)

### Community 102 - "Transcript Fragmentation"
Cohesion: 0.36
Nodes (12): chunk_caption_text(), _clip_dur(), _get(), make_text_clip(), _r3(), Fragmentación de transcripción → clips de texto. ESPEJO de la lógica JS.…, Segmentos de Whisper → clips de texto, recortados al tramo del clip fuente, con…, _rel_segment_words() (+4 more)

### Community 103 - "Gemini TTS"
Cohesion: 0.27
Nodes (12): _as_bytes(), available(), _generate_pcm(), narration_prompt(), Path, ProgressCb, Narrador TTS con Gemini (audio cinematográfico, estilo por prompt). Usa el…, Genera el WAV en ``out_path``. Devuelve {duration, sample_rate}. (+4 more)

### Community 104 - "Editor Concept Docs"
Cohesion: 0.21
Nodes (13): Clip Editor (preparar un tramo), Guardar clip (hornear reencuadre y animación), Tramos recomendados por heatmap de YouTube, Keyframes (encuadre, posición, escala, rotación, opacidad, volumen), Main Editor (lienzo de composición), Modo superponer (overlay / PIP), Proxy ligero del fragmento, Reencuadre 16:9 → vertical (+5 more)

### Community 105 - "Two-Layer Compose Layout"
Cohesion: 0.30
Nodes (6): _even(), Geometría de huecos para componer 2 capas en 720x1280., slot_norm(), slot_pixels(), SlotLayoutTest, SlotRect

### Community 106 - "Effective Text Style"
Cohesion: 0.24
Nodes (5): effective_text_style(), Estilo efectivo de un text clip: la pista aporta la base y el clip la sobre-…, BuildAssInheritanceTest, EffectiveStyleTest, Herencia pista→texto: estilo efectivo (la pista es base, el clip override).

### Community 108 - "Fragmentation Tests"
Cohesion: 0.18
Nodes (6): ChunkTest, GoldenParityTest, _norm(), Fragmentación en Python + GOLDEN parity con el frontend. `test_golden_*`…, Solo campos estables (sin ids generados)., RelativeTest

### Community 110 - "MCP Consolidation Rationale"
Cohesion: 0.18
Nodes (12): Consolidación quirúrgica, no una mega-tool, dry_run — efecto previsto sin aplicar, export_project — render caro, no deshacible, set_project_format — reescala/reencuadra todo, timeline_store.apply_op (snapshot→validar→guardar), update_clip(clip_id, patch) — tool consolidada, Etapa 4.5 — poner al día la edición MCP-only (setters escalares, effects, keyframes), Fragmentación espejo JS↔Python con golden fixtures compartidos (+4 more)

### Community 111 - "MCP Deployment Overview"
Cohesion: 0.18
Nodes (12): Auditoría en backend/data/mcp_audit.jsonl, Backend FastAPI (app.main:app vía uvicorn), Catálogo de 50 tools (14 read / 33 write / 3 destructive), Coherencia: IA y usuario comparten el mismo proceso, Validación E2E manual (no automatizable en CI), Endpoint http://127.0.0.1:8000/mcp (streamable-HTTP), Errores estructurados (8 códigos), MCP del editor (video-yt) (+4 more)

### Community 112 - "Audit Entry Writing"
Cohesion: 0.18
Nodes (5): finish(), log(), Cierra la tool en curso y escribe la entrada persistente., Añade una entrada al log de auditoría y la devuelve., JobToolsTest

### Community 113 - "Word Time Windows"
Cohesion: 0.31
Nodes (6): Ventana temporal absoluta ``(t0, t1)`` de cada palabra. Usa ``clip.words``…, word_windows(), CaptionDialoguesRealTimingTest, Karaoke del export con timing REAL por palabra (words[] del clip). Con words[]…, _text_clip(), WordWindowsTest

### Community 114 - "Whisper CUDA Fallback"
Cohesion: 0.22
Nodes (5): _CudaThenCpu, _Info, Fallback CUDA → CPU de Whisper cuando la inferencia GPU revienta., _Seg, TranscribeCudaFallbackTest

### Community 115 - "Editor Feature Docs"
Cohesion: 0.18
Nodes (11): Biblioteca de SFX (categorías y favoritos), Chat IA (asistente que edita el proyecto), Efectos visuales y ajustes de color, Figuras (formas, flechas, elementos UI), Material de stock (Pexels, GIPHY, Pixabay, Unsplash), Columna izquierda — pestañas de material y paneles, Transiciones de entrada/salida (fade, dissolve, wipe, zoom, slide, pop), Velocidad del clip y reproducción inversa (+3 more)

### Community 116 - "Anton Font Licensing"
Cohesion: 0.24
Nodes (10): Anton Font (backend, para el render/burn-in), SIL Open Font License 1.1 (fuentes del backend), faster-whisper, numpy, Herencia pista→texto (effective_text_style / effectiveTextStyle), Karaoke real en export (text_ass.word_windows), migrations.py — schema_version=2 con migración lazy al leer, words[] reales de Whisper (Word model, word_timestamps) (+2 more)

### Community 117 - "Text Role Resolution"
Cohesion: 0.33
Nodes (3): _v2_to_v3(), resolve_text_role(), ResolveTextRoleTest

### Community 118 - "Progressive Discovery Docs"
Cohesion: 0.24
Nodes (10): kokoro-onnx, soundfile, describe_capabilities(domain?), Descubrimiento progresivo en 3 capas (manifiesto / dominios / detalle), DTO semántico (project_context / clip_summary / clip_detail / job_dto), get_project_context (Capa 0, orientación inicial), help(domain) / guía por dominio fuera de los schemas, help_content.py (guía larga por dominio + TOOL_DOMAINS) (+2 more)

### Community 120 - "Audio & Text Style Docs"
Cohesion: 0.20
Nodes (10): Efectos de audio (volumen, fundidos, eq, compresor, reverb, echo), Aplicar estilo de texto global / nivel pista, Efecto karaoke (resaltado palabra a palabra), Subtítulos y clips de texto, Transcripción con Whisper (Tiny → Large v3), Narración TTS (Kokoro, Gemini, ElevenLabs), describe_capabilities(domain?), generate_voice(text, engine=kokoro|piper|gemini) (+2 more)

### Community 121 - "MCP Tool Catalog Docs"
Cohesion: 0.24
Nodes (10): add_subtitles(source_clip_id, segments), add_to_timeline(project_id, kind, index), create_clips_from_segments(project_id, url, segments, crop_mode), export_project(project_id), Flujo A — create_short_from_youtube (automático), Flujo B — make_short_from_library, Auto-detección de GPU (whisper CUDA + FFmpeg NVENC), Jobs asíncronos y wait_for_job(job_id, timeout_s) (+2 more)

### Community 122 - "Hero Image Asset"
Cohesion: 0.31
Nodes (10): Hero Image Asset, Isometric 3D Rendering Style, Landing / Hero Branding Visual, Layer / Track Stacking Metaphor, Dashed Vertical Projection Guide Lines, Lower Solid Slab With Purple Chrome Edge, Stacked Rounded Slabs Illustration, Transparent Background PNG Asset (+2 more)

### Community 123 - "MCP Undo Tools"
Cohesion: 0.22
Nodes (9): checkpoint(), _edit_result(), Deshace la última operación estructural., Rehace la última operación deshecha., Marca un punto seguro con nombre al que volver con ``restore_checkpoint``., Vuelve al timeline guardado en un checkpoint (también es deshacible)., redo(), restore_checkpoint() (+1 more)

### Community 127 - "Export Format Docs"
Cohesion: 0.25
Nodes (9): Columna derecha — Resultado y formato de salida, Exportar proyecto a vídeo, Flujo básico de trabajo (7 pasos), Formato de salida (9:16, 16:9, 1:1, 4:5, 4:3, personalizado), Pistas (crear, renombrar, ocultar, silenciar, bloquear, relacionar), Timeline con pistas de vídeo/audio/texto, Vista previa en vivo (lo que ves es lo que se exporta), get_frame(clip_id, at) — ojos de la IA (+1 more)

### Community 128 - "Project Entry Docs"
Cohesion: 0.22
Nodes (9): Editor de vídeo web (clips verticales), Extraer audio de YouTube, Proyecto (unidad de trabajo), Entrada de módulo /src/main.jsx, Punto de montaje #root, Reglas Oxlint, React Compiler (deshabilitado), Plantilla React + Vite con HMR (+1 more)

### Community 129 - "MCP Architecture Options"
Cohesion: 0.28
Nodes (8): Agente interno in-process (ai/agent.py + ai/mcp_client.py), Arquitectura B — split en N servidores MCP (descartada), Arquitectura E — núcleo fino + router en el agente propio (recomendada), Capa de capacidades para agentes (objetivo del rediseño), current_project con alcance de conversación (nunca estado global del servidor), Fase 5 — router de intención + entrada-por-proyecto, resolve_project(query) — no adivina, devuelve candidates[], Router de intención en el agente interno

### Community 130 - "App Favicon Branding"
Cohesion: 0.36
Nodes (9): Alpha Mask 'a' (Bolt Silhouette Clip), App Favicon (48x46 Bolt Icon), Lightning Bolt Logo Mark, Brand Palette (Violet #863bff / #7e14ff, Lilac #ede6ff, Cyan #47bfff), Display-P3 Wide-Gamut Color Fallback, Figma Export Provenance (effect1_foregroundBlur_2002_17158), Gaussian Blur Filter Set (b through p), Blurred Ellipse Glow Layer (+1 more)

### Community 131 - "Destructive Op Guards"
Cohesion: 0.32
Nodes (8): Gate confirm=true para operaciones destructive (REQUIRE_CONFIRM_DESTRUCTIVE), delete_media — único destructivo sin undo (borra el archivo), Enum cerrado de 8 códigos de error MCP, MCPError (code, message, hint, retryable, param), Etiquetado meta.domain + annotations (readOnly/destructive/idempotent hints), registry._wrap — chokepoint único (audit + errores + política), audit.py — JSONL append-only, guarda claves de params nunca valores, registry.py — @tool(access=read|write|destructive) con functools.wraps

### Community 132 - "Clip Props Tests"
Cohesion: 0.25
Nodes (7): out, props, source, target, CLIP_VISUAL_KEYS, pickClipVisualProps(), copyClipProps()

### Community 133 - "Chat SSE Streaming"
Cohesion: 0.29
Nodes (7): Corre un turno de chat. Emite: start/text/tool_start/tool_result/job/…, Envuelve run_chat como stream SSE (``data: {json}\\n\\n``)., run_chat(), sse(), ai_chat(), Turno de chat con la IA. Devuelve eventos SSE (text/tool/reload/done/error). El…, StreamingResponse

### Community 134 - "Compose Speed Duration"
Cohesion: 0.57
Nodes (3): _clip_duration(), _clip(), ComposeClipDurationTest

### Community 135 - "Overlay Z-Order"
Cohesion: 0.48
Nodes (4): overlay_order(), IDs de clips de vídeo de fondo a frente: pista inferior primero, luego orden en…, _clip(), OverlayOrderTest

### Community 136 - "Native AI Chat Deps"
Cohesion: 0.29
Nodes (7): google-genai, openai, Chat IA nativo — agente sobre el MCP existente (cero tools duplicadas), Historial persistente por proyecto (data/conversations/<pid>.json), GeminiProvider (google-genai, gemini-3.6-flash) tras la interfaz AIProvider, ai/mcp_client.py — Client in-process que descubre las tools del MCP, Gotcha Gemini 3.x: conservar los parts originales del stream (thought_signature)

### Community 141 - "Social & UI Icon Sprite"
Cohesion: 0.57
Nodes (7): Bluesky Icon (butterfly brand mark, external profile link), Discord Icon (community chat link), Documentation Icon (purple outline document with code brackets, opens docs), GitHub Icon (octocat brand mark, repository link), Social Icon (purple outline user plus star, social/community section), Icons SVG Sprite Sheet, X (Twitter) Icon (brand mark, external profile link)

### Community 142 - "Vite Logo Asset"
Cohesion: 0.38
Nodes (7): Accessible SVG Title Label, Prefers-Color-Scheme Dark Theming, Gradient Glow Mask, Lightning Bolt Glyph, Parenthesis Brackets, Vite Build Tool, Vite Logo

### Community 143 - "Clip Audio Ops"
Cohesion: 0.33
Nodes (6): _apply_audio_to_clip(), _clip_tl_dur(), Volumen 0–2 (100% = 1, máximo 200%), mute y fade in/out por keyframes., Aplica volumen/mute/fx/fade a todos los clips de audio o vídeo de la pista., set_clip_volume(), set_track_audio()

### Community 144 - "MCP Version Constraint"
Cohesion: 0.33
Nodes (6): fastapi, mcp>=2,<3, uvicorn[standard], mcp 2.1.1 sin notifications/tools/list_changed, MCP montado en el mismo proceso FastAPI (streamable-HTTP /mcp), docs/superpowers/specs/2026-08-30-mcp-server-base-design.md

### Community 145 - "Provider Retry Tests"
Cohesion: 0.47
Nodes (3): _Err, Exception, RetryableTest

### Community 148 - "Oxlint Config"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 149 - "Delete Operations"
Cohesion: 0.40
Nodes (5): delete(), ai_conversation_delete(), delete_library_item(), delete_material(), delete_project()

### Community 150 - "Animate & Reframe Ops"
Cohesion: 0.40
Nodes (5): animate_clip(), _clamp01(), Encuadra un clip visual (vídeo o imagen: reframe/paneo/zoom). * ``center`` →…, Genera keyframes de pose (zoom, giro, slide, fade, pop) sin que el agente los…, reframe_clip()

### Community 151 - "Kokoro TTS Runner"
Cohesion: 0.40
Nodes (5): _get_kokoro(), Path, ProgressCb, Genera el WAV en ``out_path``. Devuelve {duration, sample_rate}. -…, run()

### Community 152 - "Piper Downloader"
Cohesion: 0.60
Nodes (4): _download(), get_binary(), get_voices(), Descarga Piper (binario) y voces en español mexicano (es_MX). Uso: python…

### Community 156 - "Manual Piloting Docs"
Cohesion: 0.40
Nodes (4): JSON del proyecto (ver/editar), Flujo C — pilotaje manual (control total), get_project_context(project_id), resolve_project(query)

### Community 157 - "React Logo Asset"
Cohesion: 0.60
Nodes (5): Atom Orbit Mark (three ellipses and nucleus), React Cyan Brand Color 00D8FF, Iconify Logos Icon Set, React UI Library, React Logo (SVG)

### Community 158 - "Tool-Calling Loop"
Cohesion: 0.50
Nodes (3): Corre el loop de tool-calling, emitiendo eventos. Devuelve el texto final., CallTool, Emit

## Ambiguous Edges - Review These
- `Empaquetar como app o desplegar en servidor (pendiente)` → `Endpoint http://127.0.0.1:8000/mcp (streamable-HTTP)`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Blurred Ellipse Glow Layer` → `Video Editor Brand Identity (Speed / Energy Motif)`  [AMBIGUOUS]
  frontend/public/favicon.svg · relation: conceptually_related_to
- `Documentation Icon (purple outline document with code brackets, opens docs)` → `GitHub Icon (octocat brand mark, repository link)`  [AMBIGUOUS]
  frontend/public/icons.svg · relation: conceptually_related_to
- `Hero Image Asset` → `Violet / Purple Brand Accent Color`  [AMBIGUOUS]
  frontend/src/assets/hero.png · relation: conceptually_related_to
- `Landing / Hero Branding Visual` → `Layer / Track Stacking Metaphor`  [AMBIGUOUS]
  frontend/src/assets/hero.png · relation: rationale_for
- `React UI Library` → `Atom Orbit Mark (three ellipses and nucleus)`  [AMBIGUOUS]
  frontend/src/assets/react.svg · relation: semantically_similar_to

## Knowledge Gaps
- **395 isolated node(s):** `video-yt`, `$schema`, `plugins`, `react/rules-of-hooks`, `react/only-export-components` (+390 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1249 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Empaquetar como app o desplegar en servidor (pendiente)` and `Endpoint http://127.0.0.1:8000/mcp (streamable-HTTP)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Blurred Ellipse Glow Layer` and `Video Editor Brand Identity (Speed / Energy Motif)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Documentation Icon (purple outline document with code brackets, opens docs)` and `GitHub Icon (octocat brand mark, repository link)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Hero Image Asset` and `Violet / Purple Brand Accent Color`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Landing / Hero Branding Visual` and `Layer / Track Stacking Metaphor`?**
  _Edge tagged AMBIGUOUS (relation: rationale_for) - confidence is low._
- **What is the exact relationship between `React UI Library` and `Atom Orbit Mark (three ellipses and nucleus)`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `Timeline` connect `Export Cancellation Tests` to `YouTube Heatmap & API`, `AI Chat Agent Core`, `Schemas & Explore Keywords`, `Clip Audio & FFmpeg Compose`, `Job Manager`, `Add Subtitles Tests`, `Project Storage & Runners`, `Clip Audio Ops`, `Media Library`, `MCP Edit Tools`, `Timeline Ops Tests`, `Animate & Reframe Ops`, `Timeline Structural Ops`, `Timeline Ops E45 Tests`, `MCP Registry & Job DTOs`, `Clip Kind & FFmpeg Inputs`, `Export Settings`, `Reframe Keyframes in Export`, `Timeline Migrations`, `MCP DTOs & Summaries`, `Image Schemas`, `MCP Edit E45 Tests`, `Export Preview Parity`, `Overlay Video Filters`, `Undo / Redo / Checkpoint`, `Clip Property Ops`, `MCP Vision Tools`, `Timeline History Tests`, `Clip Kind Predicates`, `MCP Undo Tools`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._