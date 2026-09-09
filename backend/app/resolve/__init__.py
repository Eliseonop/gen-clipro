"""Entrega a DaVinci Resolve (Free) — portado desde el proyecto mi-davinci.

Genera, a partir de la transcripción de un proyecto de video-yt, los recursos que
Resolve Free puede importar:
  - un **Título Fusion** animado por palabra (``.setting``, estilo CapCut),
  - **SRT** de intercambio (Resolve Free lo importa; pierde estilo),
  - (más adelante) un **FCPXML** que monta vídeo + voz + subtítulos en pistas.

Resolve Free NO tiene scripting externo (eso es Studio), así que la inserción se
hace por **archivos que el usuario importa**. Este paquete es autocontenido: no
depende del resto del backend salvo para leer el `Transcript` del proyecto.
"""
