# Foundry Table Mode

Orchestration layer for in-person table-TV Foundry VTT setups. One GM toolbar controls viewport, display, and mood presets on a dedicated VTT-user client (the TV seat).

Designed for the common "GM laptop + flat TV with a Foundry-VTT user" table layout. Replaces the stack of Lock View + Monk's Common Display + manual-refresh dance with a single control surface.

## Compatibility

| Foundry VTT | Verified |
|---|---|
| V13 | ✅ |

## Install (not yet published)

Manifest URL (v0.1.0): `https://raw.githubusercontent.com/mellowism/foundry-table-mode/main/module.json`

## Features

### Phase 1 — Viewport lock (v0.1.0) ✅

- **Designate a VTT user** in module settings (the dedicated TV client)
- **Sync viewport** — push the GM's current pan/zoom to the VTT client on demand
- **Lock viewport** — keep pushing GM pan/zoom continuously; VTT viewport mirrors GM
- **Unlock** — return VTT control to that user
- GM controls live in the Scene Controls (token tool bar) as a dedicated tool group

### Phase 2 — Display push (v0.2.0) — planned

- Push scenes and journal pages to VTT with one click
- Force client reload (solves stale-cache after GM config changes)

### Phase 3 — Mood presets (v0.3.0) — planned

- Preset API bundling scene + music + lighting + fog toggle
- Built-in: Combat, Exploration, Tavern
- User-defined presets in settings

## Architecture

The module uses Foundry's native `game.socket` to broadcast viewport commands from GM to the designated VTT user. All logic is client-side; no server plugin required.

## Development

```bash
npm install
npm run build         # bundles src/module/main.js → dist/table-mode.js
npm run watch         # rollup watch mode
```

Symlink the repo into your Foundry data folder as `Data/modules/foundry-table-mode/` to test.

## License

MIT — see [LICENSE](LICENSE).
