# Changelog

All notable changes to Foundry Table Mode are documented here.

## [0.12.3] — 2026-05-04

### Fixed — Push-to-VTT now does page-level elevate / revert (decouples HUD visibility from TV-push readability)

After the Frosthold mega-journal was split into 98 atomic single-page journals, the persistent `ownership[vttUserId] = OBSERVER` workaround broke our note-HUD: the VTT user always saw every map note icon regardless of HUD-toggle state. Two grants were fighting — HUD's `ownership.default` toggle vs the persistent VTT user explicit grant.

**Fix:** restore the v0.4.x elevate/revert pattern, but at **page level** (not journal level). Atomic dnd5e pages have `ownership.default = 0` explicit, which blocks inheritance from journal-level grants — so journal-level elevation no longer cascades to pages. Page-level explicit user grant is the only cascade that reliably reaches the user.

- `toggleJournalOnVtt` (GM-side): on open, grant `page.ownership[vttUserId] = OBSERVER` if not already, remember the prior value. Emit socket open. On close, revert to prior value (or remove the key entirely if it was undefined).
- `handleJournalState` (close from VTT-side): reverts elevation when VTT user closes the sheet manually.
- `handleJournalOpen` (VTT-side): drops `tempOwnership: true` (didn't work in dnd5e 5.2.5) and the DOM `scrollIntoView` fallback (no longer needed for single-page atomic journals).

**Permission model after this release:**

| Field | Value | Effect |
|---|---|---|
| `page.ownership.default` | toggled by note-HUD between 0 ↔ 2 | Icon visibility for all non-GMs (incl VTT user) |
| `page.ownership[vttUserId]` | set briefly on TV-push, removed on close | Lets TV render content regardless of HUD state |

Two independent permission grants — no longer collide. HUD-hide hides the icon on every non-GM client (TV + player laptops). TV-push still works for HUD-hidden notes because elevation is per-push.

**Migration note:** if you previously ran a script that set persistent `ownership[vttUserId] = OBSERVER` on journals/pages (workaround during 0.12.0–0.12.2), run the cleanup snippet below to remove those grants. Without cleanup, HUD-toggle won't appear to affect VTT (the lingering grants override).

```js
// Cleanup persistent VTT user grants from atomic journals
(async () => {
  const vttUserId = game.settings.get('foundry-table-mode', 'vttUserId');
  if (!vttUserId) return;
  for (const j of game.journal.contents) {
    if (j.ownership?.[vttUserId] !== undefined) {
      await j.update({ [`ownership.-=${vttUserId}`]: null });
    }
    const pageUpdates = j.pages.contents
      .filter(p => p.ownership?.[vttUserId] !== undefined)
      .map(p => ({ _id: p.id, [`ownership.-=${vttUserId}`]: null }));
    if (pageUpdates.length) await j.updateEmbeddedDocuments('JournalEntryPage', pageUpdates);
  }
})();
```

## [0.12.2] — 2026-05-04

### Fixed — Show-on-VTT still lands on top in multi-page scrollable mode (B1 follow-up)

v0.12.1 fixed the Promise/TOC race but the bug persisted on multi-page journals using dnd5e's `JournalEntrySheet5e`. That subclass ignores the `mode: 1` (single-page) render option and forces multi-page scrollable rendering; `goToPage` then fails to scroll the container to the targeted page.

**Fix:** after `await render` + `await goToPage`, schedule a `requestAnimationFrame` that calls `scrollIntoView({block: 'start'})` on the matching `[data-page-id]` element inside the journal content. Bypasses the system subclass's incomplete navigation by working at the DOM level.

Verified diagnostic from the field (Frosthold journal, 99 pages):
- GM log: `Show on VTT → zBhbqr3kZIvRRGG1 QiAtDJL9xWoi65Zy (index: 15)` ✅
- VTT log: `Journal opened on VTT … (index: 15)` ✅
- Sheet rendered in multi-page scrollable mode despite `mode: 1` request — needed DOM-level scroll fallback.

## [0.12.1] — 2026-05-04

### Fixed — Show-on-VTT lands on first page instead of selected page (B1)

Multi-page plain core journals on V13.351 + dnd5e 5.2.5 ignored the targeted `pageId` and rendered the first page on the VTT client. Existed since v0.4.9 — only now surfaced because earlier testing was on Monk's Enhanced Journal documents (different code path).

**Root cause:** `sheet.render(true, {pageId})` is async and returns a Promise. The previous fix scheduled a `goToPage` retry via `setTimeout(..., 200)` that raced against TOC initialisation. When the system subclass (`JournalEntrySheet5e`) ignored the `pageId` render option, the retry fired before the TOC was ready and silently no-op'd.

**Fix:**
- `handleJournalOpen` is now `async` and awaits `sheet.render()` before calling `goToPage` — guarantees TOC is populated.
- GM-side `toggleJournalOnVtt` pre-computes `pageIndex` from sort-ordered `journal.pages.contents` and emits it alongside `pageId`.
- VTT-side render options now include `pageIndex` as defence-in-depth — V13 `JournalSheet.render` accepts `{mode, pageId, pageIndex, anchor, tempOwnership}`.
- Console logs now include the resolved index: `Show on VTT → {journalId} {pageId} (index: N)`.

## [0.12.0] — 2026-05-04

### Added — Fog Reveal Brush + Party Marker

A complete native-fog-of-war workflow that replaces Simple Fog for the manual-reveal use case.

**Fog Reveal Brush** (toolbar paintbrush icon, GM-only):
- Click to enter paint mode. Native cursor hidden over canvas; a yellow PIXI circle follows the mouse, sized to the brush radius.
- Click/drag on the map to reveal native fog of war. Brush radius is configurable (1–20 grid squares) via a non-modal floating slider dialog that auto-opens on paint-mode entry.
- Brush is an actor-less-but-actor-linked token (`_FogBrush` actor with `ownership.default = OBSERVER`) so vision propagates to the VTT user. Hidden everywhere visually; non-interactive (no selection rectangle on click).
- Programmatic move with `{animate: false}` — no Foundry drag-ruler, no animation lag. Sight is disabled between strokes (parked) so the area around the last paint position falls back to "explored grey" matching the rest of the painted fog.
- Long-press / Ctrl+click pings suppressed during paint mode via `Canvas.prototype.ping` override.

**Party Marker** (button inside the size dialog):
- Toggle button: "Place Party Marker" places a persistent `_PartyMarker` token at the current brush position; "Remove Party Marker" deletes it. Single instance per scene.
- Visible to GM as a cyan aura icon (1×1 grid square). Invisible on the VTT client (`vttHidden` flag). Provides constant fog reveal in radius via Observer-shared sight.
- Use-case: "the party is here right now" — area around marker stays "currently lit", rest of painted fog is "explored grey". Matches classic D&D fog-of-war.
- Marker sight range = current brush size at placement.

**Reset Fog** (toolbar eraser icon, GM-only):
- Three-step reset: `canvas.fog.reset()` + `scene.update({'fog.reset': Date.now()})` + `canvas.perception.update({refreshVision, refreshLighting, refreshOcclusion}, true)`. All three needed for the canvas to actually redraw across clients.

**Helper-actor housekeeping:**
- Both `_FogBrush` and `_PartyMarker` actors are auto-created on first use and placed in a `_FoundryTableMode` folder (collapsible from the Actors sidebar).
- Migration on `ready` moves any pre-existing copies (from earlier branch builds) into the folder.

**Per-token drag-ruler suppression:**
- V13 introduced `Token.ruler` (BaseTokenRuler). Override `isVisible` getter to return false on flagged tokens — drag-ruler doesn't render on either GM or VTT for fogBrush / partyMarker tokens.

**Removed:**
- `defaultHiddenTokens` setting still registered for compat, but the v0.10/v0.11 attempts at custom fog brushing are fully superseded by this implementation.

### Changed — VTT-token-hide pipeline refactor

`applyHideForToken` now handles three explicit modes:
1. `fogBrush` flag → invisible everywhere (mesh + UI)
2. `partyMarker` flag → on GM: mesh visible, UI hidden (clean cyan icon, no nameplate/elevation/border). On VTT: invisible.
3. `vttHidden` flag → invisible on VTT client only (legacy behavior, unchanged)

UI parts list expanded to include `ring` and `aura` (dnd5e 5.x token children).

## [0.9.2] — 2026-05-02

### Fixed — V13 deprecation spam on token draw/refresh

`Token#target` was split into `targetArrows` + `targetPips` in V13. The legacy `target` getter still works but logs a "Deprecated since Version 13 — removed in V14" warning every time it is read. We were reading it on every `drawToken` and `refreshToken` to set its `visible` flag. Replaced with the two new graphic names — no more deprecation spam, behavior identical.

### Fixed — Eye icon in Token HUD now actually red when active

CSS specificity collision: Foundry's default `.control-icon.active` rule beat our scoped rule, so the icon stayed in Foundry's white/highlighted style instead of our red/yellow palette. Used `!important` on our color/border-color rules and dropped the `#token-hud`/`.token-hud` parent selector — the `.table-mode-vtt-hide` class is already specific enough. Now matches map-note HUD exactly: red when hidden, yellow on hover.

## [0.9.1] — 2026-05-02

### Fixed — Settings-not-registered crash on canvasReady

The 0.9.0 `vtt-token-hide` module read settings (`vttUserId`, `defaultHiddenTokens`) from inside `reapplyAll()` and `onPreCreateToken`. But Foundry's `canvasReady` hook can fire **before** the `ready` hook (where we register settings). Result: every world login crashed with `"foundry-table-mode.vttUserId" is not a registered game setting` and the `canvasReady` hook chain aborted.

Same root cause and fix as 0.7.3 (cursor patches): wrap settings reads in try/catch, return safe defaults during the early-lifecycle window. Once `ready` fires, settings work normally.

Also added a `reapplyAll()` call at the end of the `ready` hook to catch up on tokens that were drawn during the early `canvasReady` window (when our reapply was a no-op).

## [0.9.0] — 2026-05-02

### Changed — "Hidden tokens" is now VTT-only (vision-safe)

The previous "Default new tokens to hidden" behavior used Foundry's native `hidden: true` flag. That flag is binary: hides the token *and* blocks vision-sharing to the token's owners — even at Observer level. Result: a VTT user (Observer on a player actor) saw a black screen because their assigned PC's vision was suppressed by `hidden: true`.

This release replaces that mechanism with a **module-private flag** (`flags.foundry-table-mode.vttHidden`) that hides token sprites *only on the VTT client*. Token document is never marked hidden. Vision, fog and global illumination compute normally for the VTT user. GM and other players see all tokens as before.

### Added — Per-token VTT-hide toggle in the Token HUD

Right-click a token as GM → the standard Foundry Token HUD now includes a red/yellow eye button. Click it to toggle whether that specific token is visible on the VTT client. Same UX as the existing map-note HUD eye:

- Red `.active` = hidden on VTT
- Yellow on hover
- Default state = visible

### Added — "Toggle Visibility on VTT — All Tokens" toolbar button

New button in the Table Mode scene-controls category (user-secret icon). One click hides all tokens on the current scene from the VTT client; click again to reveal all. Mirrors the existing "Toggle All Map Notes" pattern.

### Renamed setting label

"Default new tokens to hidden + GM nameplate" → **"Default new tokens hidden on VTT + actor-name nameplate"**. Setting key (`defaultHiddenTokens`) is unchanged so your current value carries over. New behavior on token creation:
- Sets our flag (not Foundry's `hidden`)
- Sets `displayName: OWNER` (GM nameplate, hidden from players) — unchanged
- Sets `name: actor.name` — unchanged

### Migration note

Tokens that were previously created with `hidden: true` from the old setting are still natively hidden. Right-click each → toggle the standard hidden-eye OFF. Then optionally toggle the new VTT-hide eye ON to restore the table-TV invisibility without breaking vision.

## [0.8.2] — 2026-05-02

### Fixed — Scene Controls crash when other modules are active

Our `Table Mode` scene-control category had no `activeTool` defined. In a single-module dev environment this never mattered, but in production with other modules enabled (Carousel Combat Tracker, etc.), Foundry's SceneControls re-evaluation runs through code paths we didn't hit before — including the actor-drop path:

```
TokenLayer5e._onDropActorData → TokenLayer5e.activate
  → SceneControls.activate → #preActivate → #onToolChange → #onChange
  Cannot read properties of undefined (reading 'onChange')
```

Foundry resolves `controls[active].tools[activeTool]`, finds `undefined`, then crashes on `.onChange` (and on click, on `.button`). Symptom: viewbox toggle stuck on (every click crashed before reaching `disableViewbox()`), and console flooded with the two error variants on actor drag/drop.

Added a no-op `select` selector tool (matching core's pattern in the tokens category) and set `activeTool: 'select'`. Clicking the Table Mode category icon now activates the selector, not any of the action tools — the v0.1.3 lesson about button-tools-as-activeTool firing handlers on category click stays respected.

## [0.8.1] — 2026-05-02

### Changed — Default-hidden tokens also use actor name

The "Default new tokens to hidden" setting now also sets `token.name` to the linked Actor's name (instead of the prototype-token's default, which is often a generic like "Player Character" from the system template). When you drag an actor onto a scene, the placed token's nameplate matches the actor as you'd expect.

Hook now writes three fields on `preCreateToken`: `hidden: true`, `displayName: OWNER (40)`, `name: actor.name`.

## [0.8.0] — 2026-05-02

### Changed — Default-hidden tokens also get GM nameplate

The "Default new tokens to hidden" setting now also sets `displayName: OWNER (40)` on the placed token. The GM (technical owner of all tokens) sees a nameplate on every placed token — useful as a position label during combat with physical minis. Players see nameplates only on tokens they own (their PC).

Setting label updated to reflect the dual behavior: "Default new tokens to hidden + GM nameplate".

## [0.7.4] — 2026-05-02

### Added — Default new tokens to hidden

New module setting **"Default new tokens to hidden"** (default: off, opt-in). When enabled, every token placed on a scene starts with `hidden: true` — invisible to players. Suits the physical-minis workflow: GM drags tokens to track positions, players see only the map on the TV and place real miniatures. Reveal individual tokens via the standard right-click → eye toggle when needed.

Implemented via `preCreateToken` hook + `document.updateSource({ hidden: true })`. Covers drag/drop from sidebar, compendium drops, macro spawns, and MCP-driven creates.

## [0.7.3] — 2026-05-01

### Fixed — Settings-not-registered error cascade

The 0.7.2 cursor patches read `vttUserId` and `hideGmCursor` settings from inside `ControlsLayer.prototype.updateCursor`. But Foundry applies buffered `userActivity` socket events BEFORE the `ready` hook fires (and our settings register at `ready`). Result: every cursor update threw "setting is not a registered game setting", which cascaded through Foundry's hook system and broke viewbox, ping, and other features that depend on the same handler chain.

Wrap settings reads in try/catch. If settings aren't registered yet (early lifecycle), return `false` from `shouldSuppress` — patches let calls through normally. Once `ready` fires and settings are registered, suppression kicks in.

## [0.7.2] — 2026-05-01

### Fixed — Hide GM cursor: no more flicker

The 0.7.1 polling approach flickered: cursor was redrawn between hide-passes. New approach (inspired by Azzurite's cursor-hider): patch `ControlsLayer.prototype.updateCursor` and `updateRuler` so they early-return when this client should hide cursors. The cursor is **never drawn** in the first place — no flicker, no per-frame work.

`canvas.controls.cursors.removeChildren()` once on canvasReady (and on setting flip-on) cleans up any pre-existing cursor elements.

## [0.7.1] — 2026-05-01

### Fixed — Hide GM cursor actually works now

The 0.7.0 implementation hooked `userActivity` to hide GM-cursor visuals — but that hook doesn't fire in V13 builds we tested. Also, V13's `canvas.controls.cursors` children have no `.user` link, so per-user filtering wasn't possible. New approach:

- **Poll-based:** 150ms `setInterval` re-hides cursors while active. Lightweight (one iterator pass over typically 1–2 children).
- **Hides ALL cursor children**, not just GM. The VTT client is a table TV — players watching it have no reason to see anyone's mouse pointer. Acceptable simplification.
- Pings still rendered separately and remain visible.
- Polling stops automatically when setting toggles off, when user is not the active VTT user, or when canvas tears down.

## [0.7.0] — 2026-05-01

### Added — Hide GM cursor on VTT

New module setting **"Hide GM cursor on VTT"** (default: on). Suppresses the GM's mouse cursor and ruler on the VTT client. Players sitting at the table don't see the GM dragging their cursor around while prepping the next reveal. Pings remain visible — so the GM can still draw attention to specific spots, intentionally.

Implemented via `userActivity` hook + `canvasReady` sweep on the VTT client. For each GM user's activity, we set `cursor.visible = false` after Foundry processes the update.



### Fixed

- **Right-click on note no longer triggers canvas pan-drag.** V13's right-mouse-button starts a pan gesture on pointerdown — our handler ran on the completed click but didn't `preventDefault`, so the pan continued running and the user couldn't release the canvas. Now we call `preventDefault` + `stopPropagation` on both the PIXI event and the underlying browser event, and override both `_onClickRight` and `_onClickRight2` (V13 uses the latter for completed clicks on placeables).
- **HUD position back to overlapping upper-left of note** (was hovering too far above in 0.6.9). Wrapper is `pointer-events: none` so the note remains right-clickable underneath; only the eye-button captures clicks.

## [0.6.9] — 2026-05-01

### Fixed

- **Right-clicking the same note again now toggles the HUD off.** Previously the HUD overlay captured pointer events, so the second right-click hit the HUD instead of the note — and clicks that fell off the HUD reached the canvas, causing scene-pan. Wrapper is now `pointer-events: none`, only the button itself captures clicks. Right-clicks anywhere else fall through to the note (or canvas, as appropriate).
- **HUD positioned above the note** instead of overlapping it. Visually clearer and reinforces the click-through behavior.
- **Deprecation warning gone:** `BasePlaceableHUD#clear` → `#close` (V13 deprecation, removed in V15). Falls back to `clear` for older builds.

## [0.6.8] — 2026-05-01

### Removed

- **"Reload TV Embed" toolbar button.** Same effect can be achieved by clicking the journal TV-icon twice (close + open) which reloads the iframe. Marginal benefit didn't justify the toolbar slot. Easy to add back if needed.

## [0.6.7] — 2026-05-01

### Changed

- **Default embed window 1024×1200** (from 920×1180). Eliminates horizontal scrollbar that appeared on Homebrewery PHB-format brews at narrower widths. Defaults matter — the goal is that the GM never has to touch the VTT machine to resize.

## [0.6.6] — 2026-05-01

### Changed

- **Removed render-type dropdown.** Auto-detection by URL file extension covers Homebrewery share links and direct image URLs (`.png/.jpg/...`) reliably enough that the explicit override added in 0.6.5 was unnecessary clutter. If auto fails for some host in the future, we'll add it back.
- **Default embed window size bumped** from 900×1100 to 920×1180 — gives Homebrewery PHB pages a bit more vertical breathing room. Window is resizable; Foundry persists position across sessions.

## [0.6.5] — 2026-05-01

### Added — Render-type override and Homebrewery toolbar clip

- **"Render as" select** next to the Embed URL field: `Auto` (default — uses extension/MIME detection), `Iframe` (force iframe), `Image` (force `<img>`-with-`object-fit:contain`). Use `Image` for URLs without a clear file extension (Google Images thumbnails, signed CDN links, etc.) where auto-detection misses.
- **Homebrewery navbar auto-clipped (~90px)** when the embed URL hostname is `homebrewery.naturalcrit.com`. CSS-clip-trick on our iframe wrapper — we can't inject CSS into the cross-origin iframe content, but we own the iframe element and pull it up under an `overflow:hidden` container so the host's toolbar scrolls out of view.

### Limitations

- Homebrewery's "Notice" popup is a centered modal — can't clip it. User dismisses once via the X. Homebrewery may or may not remember dismissal across sessions (not under our control).
- Clipping is per-host hard-coded for now. Other hosts get no clip. If a future host needs it, add to `clipTopForHost()` in `embed-url.js`.

## [0.6.4] — 2026-05-01

### Reverted

- Homebrewery `/share/` → `/print/` URL rewrite from 0.6.3. The `/print/{id}` endpoint redirects unauthenticated visitors to the Homebrewery homepage for shared brews — it's only valid for the brew's authors. Paste `/share/` URLs again; Homebrewery toolbar chrome remains visible (cross-origin iframe limitation, no public chrome-less endpoint).

## [0.6.3] — 2026-05-01

### Added — Smarter URL handling for TV Embed

- **Auto-rewrite Homebrewery share URLs** to the chrome-less `/print/` variant (was: `/share/{id}` showed NaturalCrit toolbar + notice popup; now: `/print/{id}` renders the brew directly). Paste either URL form — we normalize automatically.
- **Image URLs (`.png/.jpg/.gif/.webp/.svg/.avif/.bmp/.ico`) now render as a centered `<img>`** with `object-fit: contain` on black background, instead of a top-left-anchored iframe with white background. Use for NPC portraits, scene reveals, monster art, etc.

## [0.6.2] — 2026-05-01

### Fixed — TV Embed iframe was empty

The iframe inside the embed window rendered with no `src` attribute — the URL never reached the template via HandlebarsApplicationMixin's part-context plumbing in V13. Switched the embed window to raw `ApplicationV2` with `_renderHTML` / `_replaceHTML` returning the iframe HTML directly with `src` baked in. No template file involved.

## [0.6.1] — 2026-04-30

### Changed — TV Embed renders in a Foundry window (not full-screen overlay)

The TV embed now opens as a regular Foundry ApplicationV2 window — draggable, resizable, with the standard window header and close button. Foundry UI stays visible around it, just like a journal sheet. Better fit for the "in-game iframe" UX than the previous full-screen overlay.

- Default size 900×1100 (PHB-page-ish aspect)
- Title shows the journal page name
- Close via X like any Foundry window
- Reload toolbar button still works on the active window



### Added — TV Embed URL (live-update shop signs / handouts)

Push any URL as a full-screen iframe to the VTT client. Designed for displaying GMBinder/Homebrewery share links, image hosts, or any embeddable page edge-to-edge on the table TV with no Foundry chrome.

**Authoring:**
- Open any text journal page → new "Push to TV as iframe" field at top of edit form
- Paste URL (e.g. `https://homebrewery.naturalcrit.com/share/xxx`) → save
- The TV-icon in the journal header now pushes this URL instead of the journal sheet

**Play:**
- Click TV-icon → full-screen iframe overlay on VTT client (z-index 9999)
- Click again → close overlay
- New "Reload TV Embed" toolbar button — refreshes the iframe (use after editing the source page externally to pick up changes)

**Live-update workflow:** Edit shop sign on Homebrewery → save → click "Reload TV Embed" in Foundry → players see new version immediately. No PDF/PNG export step.

### Socket protocol

- Added `embed.open`, `embed.close`, `embed.reload` message types.

## [0.5.7] — 2026-04-30

### Build / Infra

- **One-command release:** `npm run release` does build → zip → commit → push → gh release. Pre-flight checks (on main, tag doesn't exist, CHANGELOG has matching entry).
- Extracted `build-zip.ps1` from manual PowerShell command — single source of truth for zip layout (forward-slash paths, includes dist/src/manifest/readme/license/changelog).
- Release notes auto-extracted from CHANGELOG section for the version.

No code changes.

## [0.5.6] — 2026-04-30

### Build / Infra

- **Versioned bundle filename:** `dist/table-mode-v{version}.js`. Solves CDN/browser-cache hell — every release has a unique URL so caches can't serve a stale module. Single source of truth: `package.json` version drives both the bundle filename and `module.json` (synced via `scripts/sync-manifest.mjs` post-rollup).
- `npm run build` now: clean `dist/` → rollup → sync `module.json`. One command, always consistent.

No code changes.

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
