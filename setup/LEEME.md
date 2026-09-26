# Instalar video-yt en otra PC

Todo lo necesario para que video-yt funcione igual en otra máquina Windows:
**verifica la integridad** (tamaño + SHA-256 de cada archivo) y **descarga lo que falte**.

| Archivo | Para qué |
|---|---|
| `instalar.bat` (raíz) | En la PC **nueva**: busca/instala Python y abre el instalador. |
| `setup/instalador.py` | Ventana del instalador (también funciona por consola). |
| `setup/empaquetar.bat` / `empaquetar.py` | En la PC de **origen**: crea el zip para Drive y el manifiesto. |
| `setup/manifest.json` | Qué debe haber en disco y de dónde sacarlo (lo genera `empaquetar.py`). |
| `setup/requirements.lock.txt` | Versiones exactas del `.venv` de origen. |
| `setup/nucleo.py` | Lógica compartida (solo librería estándar de Python). |

## Qué se descarga y de dónde

- **Programa**: `.venv` con las mismas versiones de pip que el origen (si la versión de
  Python coincide; si no, `backend/requirements.txt`), `npm ci` del frontend y Chromium
  de Playwright (Motion Studio).
- **Modelos IA** (≈ 2,9 GB): de sus URLs oficiales (GitHub / HuggingFace), las mismas
  que usa el backend. YuNet, Kokoro, Piper + voces, U²-Net, BiRefNet, RVM, SAM 2.1 y
  Whisper (el modelo configurado en Ajustes, vía caché de HuggingFace).
- **Recursos** (`assets/`: efectos de sonido, letras de Paper Animator, material): no
  tienen URL pública, viajan en `video-yt-assets.zip` desde **tu Google Drive**.
- **Proyectos** (opcional): `backend/data` + `backend/clips` en `video-yt-proyectos.zip`.
  Sin `bgcache/` ni `proxies/` (se regeneran solos) y **sin API keys**.

Requisitos del sistema que comprueba (y ofrece instalar con winget): Python ≥ 3.11
(se recomienda 3.14), Node.js ≥ 20.19, FFmpeg ≥ 7 con ffprobe (se usa la 9), Git.

## En la PC de origen (esta)

1. `setup\empaquetar.bat` (o `python setup/empaquetar.py`). Añade `--proyectos` si
   quieres llevarte también tus proyectos.
2. Sube `setup\_paquetes\video-yt-assets.zip` a Google Drive → clic derecho →
   **Compartir** → Acceso general: **«Cualquier persona con el enlace»**.
   Comparte el **archivo**, no la carpeta.
3. Guarda el enlace: `python setup/empaquetar.py --drive assets=<enlace>`.
4. `git add setup` + commit + push (y los cambios de código pendientes).

Si los recursos cambian, vuelve a ejecutar el paso 1 y sube el zip nuevo **como nueva
versión del mismo archivo** (Drive → Administrar versiones): así el enlace no cambia.
El instalador compara el SHA-256 del zip con el manifiesto y avisa si no coinciden.

`python setup/empaquetar.py --comprobar-urls` prueba que todas las descargas responden
con el tamaño esperado.

## En la PC nueva

1. `git clone https://github.com/Eliseonop/gen-clipro.git` (o `git pull` si ya está).
2. Doble clic en **`instalar.bat`**.
3. En la ventana: si falta algún requisito, **Instalar con winget**; luego
   **Instalar / reparar marcados**. Al acabar, **Iniciar video-yt** (lanza `start.bat`).

La ventana verifica todo al abrirse. Estados: ✓ correcto · ✗ falta / dañado ·
⚠ modificado (un catálogo `.json` editado en esa PC, no es un error).
Sin enlace de Drive: selecciona el componente → **Enlace de Drive…**, o copia el zip a
`setup\_paquetes\` (o a Descargas) y el instalador lo usa sin descargar.

Las **API keys** (`backend/data/settings.json`) nunca van al Drive: ponlas en Ajustes del
editor o copia ese archivo a mano (USB).

Por consola:

```
python setup/instalador.py --verificar [--rapido]
python setup/instalador.py --instalar [--todo | yunet assets …]
python setup/instalador.py --lista
```

Registro: `setup/_descargas/instalador.log`. Las descargas se reanudan si se cortan.
