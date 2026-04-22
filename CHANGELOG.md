# Changelog

All notable changes to Foundry Table Mode are documented here.

## [0.2.1] — 2026-04-22

### Fixed

- Viewbox move/resize interaction now works — switched to `canvas.stage.toLocal()` for coord conversion and `globalpointermove` for drag tracking.
- Sync button no longer triggers the `onClick` deprecation warning (V13 uses `onChange`).
- **VTT viewport now matches viewbox exactly.** The viewbox aspect ratio is locked to the VTT client's actual screen aspect (announced via a new `client.hello` handshake on ready and on window resize). VTT uses `max` scale so the viewbox fills the screen with no extra visible area.

### Changed

- Move/resize handles redesigned: left-click-drag anywhere on the box to move; bottom-right circle with diagonal-arrow icon to resize. Only one handle now.
- VTT client announces its window aspect + dimensions to the GM via `client.hello`.

## [0.2.0] — 2026-04-22

### Added

- **Viewbox** — draggable rectangle on the GM canvas defining exactly what the VTT client frames. Toggle from the Table Mode toolbar.
- Move handle (top-left) and resize handle (bottom-right) on the viewbox.
- Viewbox state persists as a scene flag — each scene remembers its viewbox.
- VTT client auto-computes pan/zoom from viewbox dimensions vs its own window size.

### Socket protocol

- Added `viewbox.update` and `viewbox.clear` message types.

## [0.1.4] — 2026-04-22

### Fixed

- Sync Viewport fired twice per click (once from `onClick`, once from `onChange`). Removed the `onChange` handler.

## [0.1.3] — 2026-04-22

### Removed

- **Lock Viewport to GM** tool — removed in favor of the upcoming Viewbox model (v0.2.0). Having both was confusing; Viewbox is the single viewport paradigm going forward.

### Changed

- VTT User dropdown now excludes only the Gamemaster role (4). Assistant GM (3) and Trusted Player (2) are allowed.
- Sync Viewport toolbar is now the only tool in the Table Mode category. Removed `activeTool` default so clicking the category button does not auto-fire sync.
- Sync confirms with a notification on success.

## [0.1.2] — 2026-04-22

### Fixed

- Sync Viewport button now fires its handler — V13 button-type tools use `onClick`, not `onChange`.

### Changed

- VTT User dropdown filters out GM accounts. The VTT client is always a player account.

## [0.1.1] — 2026-04-22

### Fixed

- VTT User dropdown in module settings was empty — settings are now registered on the `ready` hook (when `game.users` is populated) instead of `init`.

## [0.1.0] — 2026-04-22

### Added

- Viewport sync: GM pushes current pan/zoom to designated VTT user (`Sync Viewport` tool)
- Viewport lock: continuous mirroring of GM pan/zoom to VTT user (`Lock Viewport` toggle)
- Module setting: "VTT User" picker (which user receives viewport commands)
- Scene Controls tool group with sync/lock/unlock buttons
- i18n scaffold (English)
- Native `game.socket` transport (no library dependency)
