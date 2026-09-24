# Diseño de la ventana

Botón **Diseño** (icono de cuadrícula) en la barra superior del editor. Abre un menú con
miniaturas para cambiar la disposición de los paneles, como el menú *Layout* de CapCut.

| Variante | Arriba | Timeline |
|---|---|---|
| Predeterminado | Materiales · Main · Inspector | ancho completo |
| Main a la derecha | Materiales · Inspector · Main | ancho completo |
| Main a la izquierda | Main · Materiales · Inspector | ancho completo |
| Invertido | Inspector · Main · Materiales | ancho completo |
| Materiales a toda altura | Materiales (alto completo) · Main · Inspector | a la derecha de Materiales |
| Main a toda altura | Materiales · Inspector · **Main (alto completo, a la derecha)** | debajo de Materiales + Inspector |

- La elección se guarda en `localStorage` (`vy:workspace-preset`), por navegador; no forma
  parte del proyecto ni afecta al export.
- Los anchos de paneles (`vy:panel-layout`) son los mismos en todas las variantes. En
  *Main a toda altura* el separador junto al Main cambia el ancho del Main (`main`) y el
  inspector ocupa el espacio que sobra.
- Es solo interfaz: el MCP y el chat IA no la ven ni la cambian.

## Implementación

- `frontend/src/features/editor/panelLayout.js` — `WORKSPACE_PRESETS` (id, textos y el
  signo del arrastre de cada separador: +1 si el panel queda a la izquierda de su
  separador, −1 si queda a la derecha), `read/writeWorkspacePreset`, y
  `applyPanelDrag(..., preset)`.
- `hooks/usePanelLayout.js` — estado `preset` / `setPreset`; re-recorta los anchos al cambiar.
- `EdTopBar.jsx` — `LayoutMenu` (FlipPopover) con miniaturas SVG.
- `VideoEditor.jsx` — añade la clase `ws-<preset>` a `.veditor`.
- `editor.css` — las variantes horizontales solo usan `order` en `.veditor-workspace`;
  *Materiales a toda altura* y *Main a toda altura* convierten `.veditor` en rejilla y aplana el workspace con
  `display: contents`, así ningún panel se re-monta al cambiar (el canvas y el estado de
  las pestañas se conservan).
