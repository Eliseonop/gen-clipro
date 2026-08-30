# Biblioteca global, YouTube → Audio y guardados

Fecha: 2026-08-30

## Problema

Los clips y audios viven solo dentro de cada proyecto (`projects.json` + carpeta `video/` / `audio/`). Los “favoritos” de audio son IDs `proyecto:audioId` en `settings.json`: no aparecen en otros proyectos y el archivo sigue atado al origen. Los clips de vídeo no tienen guardar. El MCP (aún no implementado) no puede distinguir un recurso reusable de una fuente externa del material principal del montaje.

Hace falta: extraer el audio de un vídeo de YouTube; promover clips/audios a una biblioteca **global**; filtrarlos en Materiales; dejar un DTO que el MCP pueda usar sin tratarlos como metraje del proyecto.

## Decisiones cerradas

- Biblioteca de primer nivel (catálogo + archivos fuera de los proyectos). No es un índice al proyecto origen. No se copia el archivo a cada proyecto como material normal.
- **Guardar sustituye a la estrella** en clips y audios. Los SFX no se tocan (ya son librería global con estrella).
- Colecciones **disjuntas**: `project.clips` / `project.audios` vs catálogo `library`. Un ítem no está en los dos.
- Generar (TTS, YouTube→Audio, recortar clip) crea material de **proyecto**. Guardar lo **mueve** a la biblioteca.
- YouTube→Audio no se auto-guarda. En v1 se extrae el **audio completo** (sin recorte inicio/fin).
- Timeline: se mantiene `asset_kind` (`clips` | `audios` | `sfx`). Se añade `asset_scope`: `"project"` | `"library"`. Default `"project"`. Sin `schema_version` 3.
- Favoritos viejos de audio (`proyecto:id`) se ignoran. No se migran.

## Arquitectura

```
Generar (TTS / YouTube-audio / clipper)
    → archivo en carpeta del proyecto
    → project.audios | project.clips
    → scope: project

Guardar
    → copia a data/library/{audio|video}/
    → entrada en data/library/library.json
    → reescribe timeline de ESE proyecto (asset_scope: library)
    → sale de project.audios | project.clips
    → se borra el archivo original del proyecto

Usar en cualquier proyecto
    → drag/+ a la timeline
    → clip con asset_scope: library
    → NO se inserta en project.clips / project.audios
```

Módulos:

- `backend/app/library.py` — catálogo, save/unsave, resolución de archivos, DTO.
- `backend/app/jobs.py` — job YouTube→Audio (mismo patrón que TTS).
- `backend/app/storage.py` — `resolve_library_media(kind, filename)`.
- `backend/app/compose.py` — `_clip_path` respeta `asset_scope`.
- UI: `AudioTab.jsx` (tabs), `EdMaterial.jsx` (filtro + bookmark), `editorModel.js` (`asset_scope`, `mediaUrl`, `makeClip`).

## Modelo de datos

### Provenance (siempre en el DTO; persistido donde el ítem viva)

| Campo | Valores | Significado |
|---|---|---|
| `scope` | `project` \| `library` | Dueño. Fuente de verdad para el MCP. |
| `is_saved` | `true` solo si `scope === library` | Conveniencia UI/MCP. No se persiste como campo aparte en el catálogo (se deriva de `scope`). |
| `resource_type` | `audio` \| `clip` | Tipo. |
| `source` | `generated` \| `external` | TTS/compose = generated; YouTube = external. |
| `origin` | `tts` \| `youtube` \| `compose` | Procedencia concreta. |

Vocabulario de `origin` / `source`:

- Narrador TTS → `origin: tts`, `source: generated`.
- YouTube→Audio → `origin: youtube`, `source: external`.
- Clip recortado de YouTube (`source_url` de YouTube) → `origin: youtube`, `source: external`.
- Clip compuesto (`compose_clip`) → `origin: compose`, `source: generated`.

Ítems legacy sin estos campos: se **infieren al serializar** (no se reescribe `projects.json` solo por inferir):

- Audio con `engine` o `voice` → `tts` / `generated`.
- Clip cuyo `source_url` contiene `youtube` o `youtu.be` → `youtube` / `external`.
- Resto de clips → `compose` / `generated`.
- Resto de audios → `tts` / `generated`.

### Material de proyecto

Se extienden `AudioInfo` y `ClipInfo` (Pydantic, opcionales para no romper JSON viejo):

`AudioInfo` nuevo: `origin`, `source`, `youtube_url`, `youtube_id`.

`ClipInfo` nuevo: `origin`, `source`. (`source_url` ya existe.)

No llevan `scope` ni `is_saved` en disco: si están en `project.clips` / `project.audios`, son `scope: project`. `GET /api/projects/{id}` y el MCP los añaden vía `material_dto` al leer; al persistir el proyecto esos tres campos (`scope`, `is_saved`, `resource_type`) no se escriben.

### Catálogo global

Ruta: `backend/data/library/library.json`.

Archivos: `backend/data/library/audio/` y `backend/data/library/video/`.

```
library.json = {
  version: 1,
  items: LibraryItem[]
}

LibraryItem = {
  id: "lib_" + 12 hex,     // prefijo obligatorio
  resource_type: "audio" | "clip",
  scope: "library",        // siempre
  source: "generated" | "external",
  origin: "tts" | "youtube" | "compose",
  filename: str,
  label: str | null,
  description: str | null,
  duration: float | null,
  created_at: str | null,
  saved_at: str,           // ISO
  saved_from_project_id: str | null,  // solo procedencia, no dueño
  // DTO de lectura (no se persisten en library.json): url, is_saved
  url: str,            // /api/library/media/{audio|video}/{filename}
  is_saved: true

  // audio (si resource_type=audio)
  voice, voice2, blend, speed, pause, text, engine,

  // youtube (si origin=youtube)
  youtube_url, youtube_id,

  // clip (si resource_type=clip)
  start, end, source_url, reframe
}
```

No hay `index` en biblioteca. La identidad es `id`. No se deduplica por `youtube_id` en v1: cada Guardar crea un `lib_…` nuevo.

### Timeline

`TimelineClip.asset_scope: str = "project"`. Ausente o vacío al leer = `"project"`.

Si `asset_scope === "library"`:

- `asset_id` = id del `LibraryItem` (`lib_…`).
- `filename` = filename en la carpeta de biblioteca.
- `asset_kind` sigue siendo `clips` o `audios` (el render sabe si es vídeo o audio).

Clips de texto y SFX: `asset_scope` se ignora (SFX ya es global).

## API

### `POST /api/youtube-audio`

Body (como TTS): `{ project_id, url, name? }`.

- `url` vacío, no string, o cuyo host no sea `youtube.com` / `youtu.be` (con o sin `www`/`m.`, incl. `/shorts` y `/live`) → 400 `"URL de YouTube no válida."` Sin job.
- Proyecto inexistente → 404.
- Crea un `Job` y extrae en background.

Resultado al completar: `AudioInfo` en `project.audios` con archivo en `audio/` del proyecto, URL `/api/media/{pid}/audio/{filename}`, `origin=youtube`, `source=external`, `youtube_url`, `youtube_id`, `label` = `name` o título del vídeo. Formato de archivo: **m4a** (yt-dlp `bestaudio` + extracción ffmpeg). No wav.

Reutiliza `ytdlp` (cookies, navegador, `AUTH_HINT`). Si falla, job `error`; no se deja `AudioInfo` ni archivo a medias (se borra el temporal).

v1: audio **completo**. Sin `start`/`end`.

### `GET /api/library`

`{ "clips": LibraryItem[], "audios": LibraryItem[] }` separados por `resource_type`. Cada ítem del DTO incluye `is_saved: true`. Orden: `saved_at` descendente.

El `GET /api/projects/{id}` **no** mezcla la biblioteca.

### `POST /api/library/save`

Body: `{ project_id, resource_type: "audio" | "clip", ident }` (`ident` = id de audio o index de clip).

Transacción con rollback:

1. Leer el ítem del proyecto. Si no está → 404.
2. Copiar el archivo a `data/library/{audio|video}/{safe_name}_{lib_id}.{ext}`.
3. Insertar `LibraryItem` en el catálogo.
4. En la timeline de **ese** proyecto, reescribir clips que apunten al ítem local:
   - audio: `asset_kind == "audios"` y (`asset_id == audio.id` o `filename == audio.filename`)
   - clip: `asset_kind == "clips"` y (`asset_id == str(index)` o `filename == clip.filename`)
   Pasan a `asset_scope: "library"`, `asset_id: lib_…`, `filename` nuevo.
5. Quitar el ítem de `project.audios` / `project.clips`.
6. Borrar el archivo original del proyecto. Si 6 falla, no hay rollback: el ítem ya es de biblioteca; el original queda huérfano y se ignora.

Si 3–5 fallan: eliminar la entrada de catálogo (si se creó) y el archivo copiado. El proyecto queda intacto. El original **no** se borra hasta completar 5.

Locks: no interpolar el lock de `projects` con el de `library` en orden inverso. Orden fijo: **library luego projects** (o un solo método que los tome así).

Respuesta: el `LibraryItem` creado.

### `DELETE /api/library/{id}`

Escanea las timelines de **todos** los proyectos. Si alguno tiene un clip con `asset_scope=library` y `asset_id=id` → **409**:

```
{ "detail": { "code": "in_use", "message": "En uso en: Nombre A, Nombre B", "projects": [{ "id", "name" }] } }
```

(`frontend/src/services/api.js` debe usar `detail.message` cuando `detail` es objeto.)

Si no está en uso: quitar del catálogo y borrar el archivo. 200 `{ "deleted": id }`.

### `GET /api/library/media/{kind}/{filename}`

`kind` ∈ `audio` | `video`. Misma protección de path que `storage.resolve_media`. 404 si no existe.

## Resolución de media

`storage.resolve_library_media(kind, filename)` → ruta bajo `data/library/{kind}/` o `None`.

`compose._clip_path`:

- `asset_kind == sfx` → sfx (igual).
- `asset_scope == library` → `resolve_library_media` (`audios`→audio, `clips`→video).
- resto → `resolve_media` del proyecto.

Preview (`editorModel.mediaUrl`):

- sfx → `/api/sfx/file/…` (igual).
- `asset_scope === 'library'` → `/api/library/media/{audio|video}/{filename}`.
- resto → `/api/media/{pid}/…`.

Si el archivo de biblioteca no existe, el render **omite** ese clip (mismo criterio que un medio de proyecto desaparecido). No aborta todo el export.

`POST /api/projects/{id}/subtitles` acepta `asset_scope` (default `"project"`). Si es `"library"`, el job resuelve con `resolve_library_media`. El frontend envía el `asset_scope` del clip de timeline.

Transcribir por index (`POST .../clips/{index}/transcribe`) solo aplica a clips que siguen en el proyecto. No hay transcripción de un `LibraryItem` suelto en v1.

`makeClip(assetKind, item, …)`: si `item.scope === 'library'` o `item.id` empieza por `lib_`, escribe `asset_scope: 'library'` y `asset_id: item.id`. Para clips de biblioteca no usa `item.index`. El drag payload incluye `scope`.

Al Guardar, reescritura solo en el proyecto actual. Otros proyectos aún no tienen ese asset en timeline; cuando lo arrastren, nace con scope library.

## UI

### Sección Audio (`AudioTab`)

Dos tabs (`ed-tab`): **Narrador** | **YouTube → Audio**.

- Narrador: formulario actual sin cambio de comportamiento.
- YouTube → Audio: input de URL (mismo patrón que Cargar video), nombre opcional, botón extraer, progreso del job, error de login amigable.

La lista de audios del proyecto (`AudioProjectList`) queda **fuera** de las tabs (como ahora, al lado/debajo). Solo muestra `project.audios` (no biblioteca). Cada fila: reproducir, descargar, **Guardar** (bookmark, no estrella). Tras Guardar, recargar proyecto + biblioteca; el ítem desaparece de esta lista.

### Materiales (`EdMaterial`)

`EdMaterial` (o el editor) hace `GET /api/library` al montar y tras save/unsave. Se elimina la estrella de favoritos en audios (`audioFavOnly`, `isAudioFav`, `toggleAudio`, `audioFavKey`). SFX conserva estrella y categoría Favoritos.

En **Video** y en **Audio**, filtro de dos estados (por defecto Todos):

- **Todos** = materiales de este proyecto (orden actual) **seguidos** de ítems de biblioteca de ese tipo. Los de biblioteca llevan bookmark relleno / distintivo.
- **Guardados** = solo biblioteca. Vacío: “No hay clips guardados.” / “No hay audios guardados.”

Cards de proyecto: bookmark vacío → Guardar. Cards de biblioteca: bookmark relleno → Quitar de guardados. Si 409, mostrar `detail.message`; no se borra.

`+` y drag funcionan igual en ambos. Ítem de biblioteca **no** se copia a `project.clips` / `project.audios`.

Clave de lista: `scope + id` (los clips de proyecto siguen usando `index` como id de vista).

## Contrato MCP (DTO; el server aún no existe)

`list_media` / `get_project_context` deben exponer dos colecciones, nunca mezcladas:

```
clips[], audios[]              → scope: project
library.clips[], library.audios[] → scope: library, is_saved: true
```

Cada ítem incluye `scope`, `is_saved`, `source`, `origin`, `resource_type`.

`add_to_timeline` aceptará `library_id` (o `asset_scope: library` + `asset_id`). Eso no clona el archivo al proyecto.

Borrar material de proyecto no borra biblioteca. Unsave es otra operación (409 si está en uso).

`manifest.json` del proyecto sigue siendo solo materiales locales. Los `lib_…` en uso se **derivan de la timeline** cuando el MCP pida contexto; no se duplican en el JSON del proyecto.

Helper único `material_dto(item, scope)` en `library.py` para HTTP y para las tools MCP cuando existan.

## Errores (resumen)

| Caso | Respuesta |
|---|---|
| URL vacía o no YouTube | 400, sin job |
| YouTube auth/age-gate | job error + `AUTH_HINT` |
| Vídeo sin audio / ffmpeg | job error; sin AudioInfo; temp borrado |
| Proyecto o ítem inexistente | 404 |
| Unsave en uso | 409 `code: in_use` |
| Medio library desaparecido en export | se omite el clip |

## Tests

Backend (TDD):

- Save audio/clip: catálogo con provenance correcto; ítem sale del proyecto; timeline de ese proyecto reescrita a `asset_scope: library`.
- Save con fallo simulado tras copiar: rollback; proyecto intacto.
- Unsave en uso → 409; sin uso → desaparece.
- YouTube→Audio con yt-dlp mockeado: `AudioInfo` `origin=youtube`, `source=external`, archivo en `audio/` del proyecto, no en library.
- URL vacía o host no YouTube → 400.
- `_clip_path` / `mediaUrl` equivalentes: scope library vs project.
- `GET /api/library` y `GET /api/projects/{id}` no mezclan colecciones.
- Timeline sin `asset_scope` se lee como `project`.
- Inferencia de origin/source en ítems legacy.

Frontend: tabs, filtro Todos/Guardados, bookmark; verificar en el navegador al implementar.

## Fuera de alcance

- Recorte inicio/fin del audio de YouTube.
- Deduplicar por `youtube_id`.
- Migrar estrellas viejas de audio a biblioteca.
- Cambiar SFX.
- Implementar el servidor MCP (solo el DTO y la separación de colecciones).
- `schema_version` 3.
- Auto-guardar al extraer de YouTube.
- Copiar el archivo de biblioteca a la carpeta del proyecto al usarlo.
- Transcribir un `LibraryItem` que no está en `project.clips` (los subtítulos desde la timeline sí, con `asset_scope`).

## Compatibilidad

- Timelines existentes: `asset_scope` ausente = project. Preview y export iguales.
- `settings.favorites.audios` puede seguir en disco; el código deja de leerlo. `favorites.sfx` y `textStyles` igual.
- Borrar un proyecto no borra `data/library/`.
