# Microsoft Foundry — capa de IA generativa

Foundry (Azure AI Foundry / Azure OpenAI) es la **capa de IA generativa** del
editor. **Complementa** a Azure Speech y Azure Vision; **no los reemplaza**.

```
Editor
├── Azure Speech   → TTS / STT
├── Azure Vision   → OCR / análisis de imagen
└── Microsoft Foundry (generativa)
    ├── Asistente contextual
    ├── Mejorar guion
    ├── Generar hooks / títulos / descripción
    ├── Sugerir recursos visuales
    ├── Prompts visuales (imagen + vídeo)
    └── Analizar escena
```

## Arquitectura (independiente y modular)

```
Frontend (FoundryPanel)  →  Backend  →  Microsoft Foundry
                            (clave SOLO aquí)
```

- `backend/app/foundry.py` — **FoundryService**: configuración, transporte
  (REST + `urllib`, sin SDK ni dependencias nuevas, igual que los adaptadores
  Azure existentes), timeouts, normalización de respuesta y errores, logging
  seguro (nunca la clave ni el prompt).
- `backend/app/foundry_ops.py` — **capacidades**: prompts + validación de JSON de
  cada función. Aislado del transporte → se puede cambiar de modelo/deployment
  sin tocar los prompts.
- Endpoints: `POST /api/ai/foundry/chat` y `POST /api/ai/foundry/generate`;
  estado en `GET /api/ai/status` (campo `foundry`).
- Frontend: sub-pestaña **Foundry** dentro de la pestaña **IA**
  (`frontend/src/features/ai/FoundryPanel.jsx`) + configuración en **Configuración**.

La credencial **nunca** llega al frontend. El frontend solo pide resultados.

## 1. Configurar Foundry

1. En **Azure AI Foundry** (o Azure OpenAI) crea un recurso y un **deployment**
   de un modelo de chat (p. ej. `gpt-5-mini`, `gpt-4o-mini`). Anota el **nombre
   del deployment** (no el del modelo base), el **endpoint** y la **clave**.
2. En el editor: **IA → Foundry → Ir a Configuración** (o pestaña
   **Configuración**), sección **Microsoft Foundry**:
   - **Endpoint**: el que te da Foundry. Se soportan dos formatos:
     - **Foundry v1** (recomendado): `https://<recurso>.services.ai.azure.com/openai/v1`
       (si pegas solo el host, se normaliza a `/openai/v1` automáticamente).
     - **Azure OpenAI clásico**: `https://<recurso>.openai.azure.com`
   - **Deployment / modelo**: el nombre de tu deployment (p. ej. `gpt-5-mini`)
   - **API version** (opcional): solo para el formato clásico (por defecto `2024-10-21`)
   - **Clave**
3. Guardar. El estado pasa a *Configurado*.

> **Modelos de razonamiento** (gpt-5*, o1/o3/o4): el backend adapta los
> parámetros automáticamente (no envía `temperature`, usa `max_completion_tokens`
> con un presupuesto amplio y `reasoning_effort=low`). Si el modelo rechazara
> algún parámetro (400), se auto-corrige y reintenta. No tienes que hacer nada.

## 2. Variables de entorno (alternativa al UI)

Tienen prioridad sobre `settings.json`. No hay `.env`: se leen de `os.environ`.

| Variable | Descripción |
|---|---|
| `AZURE_FOUNDRY_KEY` (o `AZURE_OPENAI_API_KEY`) | Clave del recurso |
| `AZURE_FOUNDRY_ENDPOINT` (o `AZURE_OPENAI_ENDPOINT`) | v1: `https://<recurso>.services.ai.azure.com/openai/v1` · clásico: `https://<recurso>.openai.azure.com` |
| `AZURE_FOUNDRY_DEPLOYMENT` (o `AZURE_FOUNDRY_MODEL` / `AZURE_OPENAI_DEPLOYMENT`) | Nombre del deployment |
| `AZURE_FOUNDRY_API_VERSION` | Opcional, solo formato clásico (por defecto `2024-10-21`) |

```powershell
$env:AZURE_FOUNDRY_ENDPOINT = "https://mi-recurso.services.ai.azure.com/openai/v1"
$env:AZURE_FOUNDRY_DEPLOYMENT = "gpt-5-mini"
$env:AZURE_FOUNDRY_KEY = "<clave>"
```

**Autenticación**: con el endpoint v1 el backend usa `Authorization: Bearer <clave>`
(igual que el SDK de OpenAI); si diera 401/403 reintenta con la cabecera `api-key`
(y al revés en el clásico). La clave **nunca** sale del backend.

## 3. Cambiar de modelo

Cambia el **deployment** (en Configuración o `AZURE_FOUNDRY_DEPLOYMENT`). No hay
que tocar código. Si el modelo nuevo pide otra `api-version`, ajústala también.

## 4. Iniciar el backend

```bash
cd backend
../.venv/Scripts/python.exe -m uvicorn app.main:app --reload
```

## 5. Probar el endpoint

Estado (sin exponer claves):

```bash
curl http://localhost:8000/api/ai/status
```

Asistente contextual:

```bash
curl -X POST http://localhost:8000/api/ai/foundry/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Dame 3 hooks para un vídeo sobre la relatividad","language":"es"}'
```

Operación estructurada (sugerir recursos):

```bash
curl -X POST http://localhost:8000/api/ai/foundry/generate \
  -H "Content-Type: application/json" \
  -d '{"op":"suggest_resources","language":"es","context":{"script":"El tiempo pasa más lento cerca de la velocidad de la luz."}}'
```

## 6. Usar el AI Assistant (UI)

Editor → pestaña **IA** → sub-pestaña **Foundry**. Elige una acción, escribe/pega
el guion o la pregunta y pulsa el botón. Cada resultado ofrece **Copiar**,
**Regenerar**, **Descartar** y, cuando aplica, **Aplicar** (al texto local).
Ninguna acción modifica el proyecto automáticamente.

## 7. Funciones disponibles

| `op` | Entrada relevante | Salida |
|---|---|---|
| `assistant` (`/chat`) | `message`, `context` | `{text}` |
| `improve_script` | `text`, `mode` (`improve`/`shorten`/`natural`/`direct`) | `{result}` |
| `generate_hooks` | `context`, `n` | `{hooks: []}` |
| `generate_titles` | `context`, `n` | `{titles: []}` |
| `generate_description` | `context` | `{description}` |
| `suggest_resources` | `context.script` | `{suggestions: [{type,title,description,duration,prompt,reason}]}` |
| `visual_prompt` | `context` | `{image_prompt, video_prompt, negative_prompt, aspect}` |
| `analyze_scene` | `context.scene` | `{summary, concept, intent, resources[], edits[], improvements[]}` |

`context` admite: `script`, `topic`, `title`, `selected_text`, `scene`,
`transcript` (de Azure Speech), `vision` (metadata de Azure Vision:
`{caption, tags, ocr_text}` — se **reutiliza**, no se re-analiza), `current_time`,
`duration`, `format`/`vertical`.

## 8. Costes y estados

- Las llamadas son **explícitas** (nunca `onChange → IA`).
- Estados en la UI: idle / loading / error, con mensaje claro.
- Todas las respuestas se normalizan; si el modelo devuelve JSON inválido se
  intenta recuperar y, si no, se cae a un formato mínimo sin romper el editor.

## 9. Complementar Speech / Vision

- **Vision → Foundry**: pasa la metadata de un asset ya analizado
  (`context.vision`) para preguntar "¿cómo uso este recurso aquí?".
- **Speech → Foundry**: pasa el `transcript` (subtítulos/audio) como contexto
  para analizar contenido o sugerir recursos.

## Preparado para una segunda fase

- Encadenado automático guion → segmentos → recursos → prompts → timeline.
- "Aplicar" que escriba en campos reales del proyecto (título/descripción de
  vídeo) cuando existan esos campos.
- Streaming de respuestas y cancelación.
