# Changelog

All notable changes to Foundry Table Mode are documented here.

## [0.4.2] — 2026-04-22

### Fixed

- Multi-page journal on VTT now shows content instead of a blank page. Page id + index are now passed as render options on the first render call (was a deferred `goToPage` that raced the sheet's own initialization).

### Changed

- Journal button tooltip is now a single static string: "Show / Hide on VTT". Simpler, no state-dependent update.

## [0.4.1] — 2026-04-22

### Added

- **Page-specific push:** when pushing a multi-page journal, the currently-displayed page on the GM is opened on VTT (not just the default page).
- **State sync:** if the VTT user manually closes a pushed journal (Escape / X), the GM button reverts to its "Show on VTT" state.

### Changed

- Tooltip wording: "Show on VTT" / "Hide on VTT" (was "Open / Close").

### Socket protocol

- Added `journal.state` message (VTT → GM close notification).

## [0.4.0] — 2026-04-22

### Added — Journal push/close toggle

A TV icon button injected into every journal sheet header (GM-only). Click once to open the journal on the VTT client; click again to close it. Button state reflects the last command sent (amber = open, default = closed).

Works for core JournalSheet and JournalEntrySheet variants. Multi-page journals open at their default page.

### Socket protocol

- Added `journal.open` and `journal.close` message types.

## [0.3.1] — 2026-04-22

### Changed

- Collapsed the 7 per-element VTT UI toggles into a single **Hide VTT UI** switch. In the common-display use case, you either want a clean canvas or you don't — individual toggles added config noise without real value. Anyone needing granular control can override with custom CSS.
- Broadened the hide selector to cover V13's actual layout: `#ui-left`, `#ui-right`, `#ui-top`, `#ui-bottom`, `#scene-controls`, `#chat-notifications`, `#pause`, etc.

### Fixed

- V13 UI elements now actually hide. Previous selectors (`#controls`, `#sidebar`) targeted old IDs — V13 uses `#scene-controls` and `#ui-right` wrapper. Hiding the wrapper rather than individual components fixes this.

## [0.3.0] — 2026-04-22

### Added — VTT UI cleanup

Seven per-element toggles in module settings that hide UI chrome on the VTT client only (not GM or other players):

- Hide VTT Sidebar
- Hide VTT Chat
- Hide VTT Scene Navigation
- Hide VTT Player List
- Hide VTT Hotbar
- Hide VTT Scene Controls
- Hide VTT Foundry Logo

Changes apply immediately on the VTT client without reload.

### Added — Reload VTT

New toolbar button in the Table Mode category: **Force Reload VTT Client**. Sends a `client.reload` socket message; VTT calls `location.reload()` after a 150ms delay (lets notifications render).

### Socket protocol

- Added `client.reload` message type.

## [0.2.2] — 2026-04-22

### Fixed

- Viewbox drag/resize events now fire. Registered handlers on the graphics objects themselves (not `canvas.stage`), enabled `interactiveChildren`, and switched to `eventMode = 'dynamic'`. Logs `[foundry-table-mode] drag start` to console when a drag begins.

### Added

- **VTT Screen Aspect Ratio** setting — fallback when auto-detect from VTT client misses. Options: Auto, 16:9, 16:10, 4:3, 21:9, 32:9. Changes apply immediately to an active viewbox.

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
