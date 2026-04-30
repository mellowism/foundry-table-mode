# Changelog

All notable changes to Foundry Table Mode are documented here.

## [0.5.5] — 2026-04-30

### Fixed — Release zip path separators

Earlier release zips used Windows-style backslash separators in archive entry names (e.g. `dist\table-mode.js`). The ZIP spec mandates forward slashes — backslashes are non-portable and cause unreliable extraction on Linux Foundry installs. Re-release with forward slashes only. No code changes.

This explains intermittent Linux Foundry update failures since v0.5.0 (works locally on Windows because Windows tooling normalizes both).

## [0.5.4] — 2026-04-30

### Added — Toggle All Map Notes (toolbar)

New tool in the Table Mode toolbar (eye icon). Click to toggle player visibility for every map note on the current scene. If any note is visible, hides them all; otherwise shows them all. Uses the same per-note semantics — updates the linked page (or entry) ownership.

### Cleanup

- Removed `_onClickRight2` alias on Note prototype (speculative defensive code from debugging — never confirmed needed).
- Removed `globalThis.*` fallbacks for V13 APIs (foundry.applications.* is always present in V13).
- Removed happy-path console logs from install + canvasReady + assignment. Error logs remain.

## [0.5.3] — 2026-04-29

### Fixed

- **Right-click HUD activation now works on all V13 builds.** Previous versions relied on patching `NotesLayer.prototype.hud` getter so Foundry's default `_onClickRight` could bind the HUD. On some V13 builds that property is non-configurable and the patch silently fails — Foundry then crashes on `null.object` and the right-click does nothing. We now override `Note.prototype._onClickRight` directly and bind `canvas.hud.note` ourselves. No more dependence on the layer-getter indirection.

### Diagnostics

- One log line per install + canvasReady so future regressions surface in console.

## [0.5.2] — 2026-04-29

### Fixed

- **NoteHUD visibility toggle now actually hides the note for players.** Previous versions updated `NoteDocument.ownership`, but Foundry's note-visibility check tests the *linked JournalEntry's* (or page's) ownership — not the placeable's. We now update `note.document.page ?? note.document.entry` instead, matching MEJ's approach.

### Cleanup

- Removed verbose diagnostic logging that was added in 0.5.1 to chase the deploy issue. Errors still log; happy-path is silent.
- Removed redundant `ready`-hook fallback for HUD setup — `canvasReady` is sufficient.

## [0.5.1] — 2026-04-29

### Diagnostics

- Verbose logging added to NoteHUD install path (v0.5.0 silently failed to set `canvas.hud.note` in the field). Each step now logs: API resolution, class build, canvas.hud presence, instantiation outcome.
- Added `ready`-hook fallback in addition to `canvasReady` — covers cases where canvas.hud isn't available when canvasReady fires.

## [0.5.0] — 2026-04-29

### Added — Map Note quick-toggle (MEJ-style)

Right-click a map note as GM to open a small HUD with an eye-icon. Click the icon to toggle player visibility for that note: hidden = `ownership.default = NONE` (note icon disappears for all players), visible = `ownership.default = OBSERVER`. Button gets a red `.active` state when the note is hidden.

Implemented via:
- `Note.prototype._canHUD` override (GM + note must have an entry)
- `NotesLayer.prototype.hud` getter pointing at `canvas.hud.note`
- `canvas.hud.note` instance built from a V13 `BasePlaceableHUD` + `HandlebarsApplicationMixin` subclass

Standalone — does not currently coexist with Monk's Enhanced Journal (which owns the same `canvas.hud.note` slot).

## [0.4.9] — 2026-04-22

### Fixed

- `goToPage(pageId, anchor)` was called with the wrong signature — V13 expects `goToPage(pageId, { anchor })` (options object). Anchor was silently ignored, which is why heading navigation never worked.

### Changed — major simplification

- **Permission elevation removed.** Now uses V13's built-in `tempOwnership: true` render option — Foundry grants observer access for the duration of the render without persisting an ownership change.
- Render uses the canonical V13 options: `{ mode, pageId, anchor, tempOwnership }`. All navigation happens in the initial render call; a single 200ms safety retry remains as a belt for edge cases.
- Removed: `elevateOwnership`, `revertOwnership`, state tracking for `prevOwnership`/`elevated`. ~50 lines of gymnastics replaced with one render-options flag.

## [0.4.8] — 2026-04-22

### Fixed

- **Heading-anchor sidebars:** journals containing pages with multiple H2/H3 sections show each heading as its own sidebar entry. Previously we sent a heading's id as if it were a page id (which failed — headings aren't pages). Now we resolve `{pageId, anchor}` from the sheet's TOC (`_pages[pageIndex]`) and pass the anchor to `goToPage(pageId, anchor)` on VTT so it scrolls to the right section.

### Socket protocol

- `journal.open` payload adds optional `anchor` field.

## [0.4.7] — 2026-04-22

### Fixed

- Page navigation no longer passes `pageIndex` to `render()`. Sheet subclasses (core, dnd5e, MEJ) interpret pageIndex inconsistently — some use sort-order, others creation-order. Now relies on `pageId` + `goToPage()` exclusively, with a second `goToPage` after 500ms as a safety retry for journals with deferred TOC initialization.

## [0.4.6] — 2026-04-22

### Fixed

- **Wrong page displayed on VTT** when the journal had pages that had been reordered. `app.pageIndex` indexes into the UI's sort-order, but `journal.pages.contents` is in creation order — mismatch caused off-by-one (or more) errors. Both GM-side resolve and VTT-side lookup now use a sort-aware `sortedPages()` helper.

## [0.4.5] — 2026-04-22

### Changed

- Journal page list sidebar is now always hidden on the VTT client. Players at the table see only the current page content — they don't need page navigation. Applies independent of the Hide VTT UI setting.

## [0.4.4] — 2026-04-22

### Fixed

- **Journal push now renders in single-page mode** at the requested page (was rendering all-pages scrollable mode via `journal.show()`).
- **Permission-induced dnd5e crash avoided via targeted elevation.** GM-side temporarily grants the VTT user Observer permission on the journal, then reverts the explicit entry back to inherited default on close. This handles the original dnd5e 5.3 crash without the display-mode side effects of `journal.show()`.

### Changed

- Rolled back to custom socket for open (v0.4.3 used `journal.show()`). Custom socket gives full control over render options (mode, pageIndex, pageId).

## [0.4.3] — 2026-04-22

### Fixed

- Journal push no longer crashes when the VTT user lacks full page-level permissions. We now use Foundry core's built-in `JournalEntry.show(users, {pageId})` for the open path — core handles permission elevation and rendering, sidestepping a dnd5e 5.3 render-time crash in `JournalEntrySheet5e._onRender → getPageSheet`.

### Changed

- Open path now piggybacks Foundry core. Close path still uses our socket (core has no "un-show" counterpart).

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
