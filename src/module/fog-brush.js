import { MODULE_ID } from './socket-protocol.js';

/**
 * Fog Reveal Brush v2 — actor-linked paint-mode brush.
 *
 * Lessons from the v0.10/v0.11 attempts:
 *   - Actor-less brush tokens don't share vision to non-owners → fog never
 *     revealed on the VTT client. Fixed by linking the brush to a managed
 *     `_FogBrush` actor with `ownership.default = OBSERVER` so all users
 *     see through it.
 *   - Hiding the brush sprite client-side is what works. The vtt-token-hide
 *     pipeline now treats the `fogBrush` flag as "hide for everyone, GM
 *     included".
 *   - Programmatic position updates with `{animate: false}` skip Foundry's
 *     drag-ruler — so the painted reveal appears instantly without a ghost
 *     measurement on the VTT.
 *
 * Toolbar UX:
 *   - Paintbrush toggle → enter paint mode
 *   - In paint mode: native cursor hidden over canvas, PIXI circle follows
 *     the mouse. Click/drag to reveal fog. Cursor reverts over toolbars.
 *   - Brush size cycles 10/30/60/120 ft live
 *   - Reset Fog wraps Foundry's native scene fog reset (with a confirm)
 */

const FOG_BRUSH_FLAG = 'fogBrush';
const PARTY_MARKER_FLAG = 'partyMarker';
const VTT_HIDDEN_FLAG = 'vttHidden';
const BRUSH_SIZE_SETTING = 'fogBrushSize';
const BRUSH_ACTOR_ID_SETTING = 'fogBrushActorId';
const PARTY_MARKER_ACTOR_ID_SETTING = 'partyMarkerActorId';

const ACTOR_NAME = '_FogBrush';
const PARTY_MARKER_ACTOR_NAME = '_PartyMarker';
// Brush size is now in GRID SQUARES (not feet) — works across any scene
// regardless of grid.distance/units. 1 square = grid.size pixels.
const MIN_BRUSH_SIZE = 1;
const MAX_BRUSH_SIZE = 20;
const DEFAULT_BRUSH_SIZE = 3;
const PAINT_THROTTLE_MS = 40;

const state = {
  active: false,
  brushTokenId: null,
  cursorGfx: null,
  pointerDown: false,
  lastMoveTs: 0,
  handlers: null,
  sizeDialog: null,
  closingDialog: false,
  savedLongPress: null
};

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export function registerBrushSettings() {
  game.settings.register(MODULE_ID, BRUSH_SIZE_SETTING, {
    scope: 'world',
    config: false,
    type: Number,
    default: DEFAULT_BRUSH_SIZE
  });
  game.settings.register(MODULE_ID, BRUSH_ACTOR_ID_SETTING, {
    scope: 'world',
    config: false,
    type: String,
    default: ''
  });
  game.settings.register(MODULE_ID, PARTY_MARKER_ACTOR_ID_SETTING, {
    scope: 'world',
    config: false,
    type: String,
    default: ''
  });
}

export function getBrushSize() {
  try {
    return game.settings.get(MODULE_ID, BRUSH_SIZE_SETTING) ?? DEFAULT_BRUSH_SIZE;
  } catch (_) {
    return DEFAULT_BRUSH_SIZE;
  }
}

export function isBrushSpawned() {
  return state.active;
}

/* ------------------------------------------------------------------ */
/* Actor management                                                    */
/* ------------------------------------------------------------------ */

async function ensureBrushActor() {
  let actorId;
  try {
    actorId = game.settings.get(MODULE_ID, BRUSH_ACTOR_ID_SETTING);
  } catch (_) {
    actorId = '';
  }
  if (actorId) {
    const existing = game.actors.get(actorId);
    if (existing) return existing;
  }
  // Create the brush actor. Type is system-dependent — use whatever the system
  // exposes as a generic NPC type, falling back to the first registered type.
  const types = game.documentTypes?.Actor ?? ['npc'];
  const type = types.includes('npc') ? 'npc' : (types.includes('character') ? 'character' : types[0]);

  const ownerDisplayNone = CONST?.TOKEN_DISPLAY_MODES?.NONE ?? 0;
  const observerLevel = CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2;

  const actorData = {
    name: ACTOR_NAME,
    type,
    ownership: { default: observerLevel },
    prototypeToken: {
      name: ACTOR_NAME,
      width: 0.5,
      height: 0.5,
      displayName: ownerDisplayNone,
      texture: { src: 'icons/svg/light.svg' },
      sight: { enabled: false, range: DEFAULT_BRUSH_SIZE, visionMode: 'basic' },
      flags: {
        [MODULE_ID]: {
          [VTT_HIDDEN_FLAG]: true,
          [FOG_BRUSH_FLAG]: true
        }
      }
    }
  };

  let actor;
  try {
    actor = await Actor.create(actorData);
  } catch (e) {
    console.error(`[${MODULE_ID}] Failed to create FogBrush actor`, e);
    return null;
  }
  await game.settings.set(MODULE_ID, BRUSH_ACTOR_ID_SETTING, actor.id);
  return actor;
}

/* ------------------------------------------------------------------ */
/* Party Marker — persistent "the party is here" token                 */
/* ------------------------------------------------------------------ */

async function ensurePartyMarkerActor() {
  let actorId;
  try {
    actorId = game.settings.get(MODULE_ID, PARTY_MARKER_ACTOR_ID_SETTING);
  } catch (_) {
    actorId = '';
  }
  if (actorId) {
    const existing = game.actors.get(actorId);
    if (existing) return existing;
  }
  const types = game.documentTypes?.Actor ?? ['npc'];
  const type = types.includes('npc') ? 'npc' : (types.includes('character') ? 'character' : types[0]);
  const observerLevel = CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2;

  const actorData = {
    name: PARTY_MARKER_ACTOR_NAME,
    type,
    ownership: { default: observerLevel },
    prototypeToken: {
      name: PARTY_MARKER_ACTOR_NAME,
      width: 1,
      height: 1,
      displayName: CONST?.TOKEN_DISPLAY_MODES?.NONE ?? 0,
      texture: { src: 'icons/svg/aura.svg', tint: '#00ccff' },
      sight: { enabled: true, range: 6, visionMode: 'basic' },
      flags: {
        [MODULE_ID]: {
          [VTT_HIDDEN_FLAG]: true,
          [PARTY_MARKER_FLAG]: true
        }
      }
    }
  };

  let actor;
  try {
    actor = await Actor.create(actorData);
  } catch (e) {
    console.error(`[${MODULE_ID}] Failed to create PartyMarker actor`, e);
    return null;
  }
  await game.settings.set(MODULE_ID, PARTY_MARKER_ACTOR_ID_SETTING, actor.id);
  return actor;
}

function findPartyMarkerToken() {
  const tokens = canvas?.scene?.tokens ?? [];
  for (const t of tokens) {
    if (t.getFlag?.(MODULE_ID, PARTY_MARKER_FLAG)) return t;
  }
  return null;
}

export function hasPartyMarker() {
  return !!findPartyMarkerToken();
}

/**
 * Toggle the party marker. If none exists on the current scene → place at the
 * current brush position with sight enabled. If one exists → remove it.
 *
 * Single-instance per scene. Sight range = current brush size.
 */
export async function togglePartyMarker() {
  if (!game.user.isGM) return;
  const scene = canvas?.scene;
  if (!scene) {
    ui.notifications.warn(game.i18n.localize('TABLE_MODE.Notifications.NoScene'));
    return;
  }

  const existing = findPartyMarkerToken();
  if (existing) {
    try {
      await scene.deleteEmbeddedDocuments('Token', [existing.id]);
      ui.notifications.info(game.i18n.localize('TABLE_MODE.Notifications.PartyMarkerRemoved'));
    } catch (e) {
      console.error(`[${MODULE_ID}] Remove party marker failed`, e);
    }
    return;
  }

  // Place new marker at current brush position (or scene center if no brush)
  let x, y;
  const brushDoc = state.brushTokenId ? scene.tokens.get(state.brushTokenId) : null;
  if (brushDoc) {
    x = brushDoc.x;
    y = brushDoc.y;
  } else {
    const dims = scene.dimensions ?? canvas.dimensions ?? {};
    x = Math.round((dims.sceneX ?? 0) + ((dims.sceneWidth ?? dims.width ?? 4000) / 2));
    y = Math.round((dims.sceneY ?? 0) + ((dims.sceneHeight ?? dims.height ?? 3000) / 2));
  }

  const actor = await ensurePartyMarkerActor();
  if (!actor) {
    ui.notifications.error(game.i18n.localize('TABLE_MODE.Notifications.PartyMarkerSpawnFailed'));
    return;
  }

  const sizeSquares = getBrushSize();
  const sightRange = squaresToSceneUnits(sizeSquares);
  const proto = actor.prototypeToken.toObject();
  const data = {
    ...proto,
    actorId: actor.id,
    actorLink: false,
    x: Math.round(x),
    y: Math.round(y),
    sight: {
      ...(proto.sight ?? {}),
      enabled: true,
      range: sightRange,
      visionMode: 'basic'
    },
    flags: foundry.utils.mergeObject(
      proto.flags ?? {},
      { [MODULE_ID]: { [VTT_HIDDEN_FLAG]: true, [PARTY_MARKER_FLAG]: true } },
      { inplace: false }
    )
  };

  try {
    await scene.createEmbeddedDocuments('Token', [data]);
    ui.notifications.info(game.i18n.localize('TABLE_MODE.Notifications.PartyMarkerPlaced'));
  } catch (e) {
    console.error(`[${MODULE_ID}] Place party marker failed`, e);
    ui.notifications.error(game.i18n.localize('TABLE_MODE.Notifications.PartyMarkerSpawnFailed'));
  }

  // Refresh dialog so the button label updates
  if (state.sizeDialog?.rendered) state.sizeDialog.render();
}

/* ------------------------------------------------------------------ */
/* Toolbar handlers                                                    */
/* ------------------------------------------------------------------ */

export async function toggleBrush() {
  if (!game.user.isGM) return;
  if (state.active) return exitPaintMode();
  await enterPaintMode();
  // Auto-open the size dialog as a non-modal floating menu. User can adjust
  // size while painting; closing the dialog exits paint mode.
  if (state.active) openBrushSizeMenu();
}

/**
 * Open a non-modal floating popup with a brush-size slider.
 * Stays open during paint mode; closing the dialog exits paint mode.
 */
export async function openBrushSizeMenu() {
  if (!game.user.isGM) return;
  // Don't double-open
  if (state.sizeDialog) return;

  const current = getBrushSize();
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2) {
    // Fallback: cycle through presets
    const presets = [1, 3, 6, 12];
    const idx = presets.indexOf(current);
    const next = presets[(idx + 1) % presets.length];
    await setBrushSize(next);
    return;
  }

  const markerExists = hasPartyMarker();
  const markerLabel = markerExists
    ? game.i18n.localize('TABLE_MODE.FogBrush.RemovePartyMarker')
    : game.i18n.localize('TABLE_MODE.FogBrush.PlacePartyMarker');
  const markerIcon = markerExists ? 'fa-trash' : 'fa-map-pin';

  const html = `
    <div class="table-mode-brush-size-menu">
      <label style="display:block; margin-bottom:6px;">
        <strong>${game.i18n.localize('TABLE_MODE.FogBrush.SizeLabel')}</strong>:
        <span class="table-mode-brush-size-value">${current}</span>
        <span style="opacity:0.7;">${game.i18n.localize('TABLE_MODE.FogBrush.SizeUnit')}</span>
      </label>
      <input type="range" min="${MIN_BRUSH_SIZE}" max="${MAX_BRUSH_SIZE}" step="1"
             value="${current}" class="table-mode-brush-size-slider"
             style="width:100%;" />
      <button type="button" class="table-mode-party-marker-toggle"
              style="width:100%; margin-top:10px;">
        <i class="fas ${markerIcon}"></i>
        ${markerLabel}
      </button>
      <p style="font-size:11px; opacity:0.7; margin-top:4px;">
        ${game.i18n.localize('TABLE_MODE.FogBrush.PartyMarkerHint')}
      </p>
    </div>
  `;

  const dialog = new DialogV2({
    window: {
      title: game.i18n.localize('TABLE_MODE.FogBrush.SizeMenuTitle'),
      icon: 'fas fa-paintbrush'
    },
    position: { width: 280, top: 80, left: 100 },
    content: html,
    buttons: [{
      action: 'done',
      label: game.i18n.localize('TABLE_MODE.FogBrush.SizeMenuClose'),
      icon: 'fas fa-check',
      default: true,
      callback: () => true
    }],
    modal: false,
    rejectClose: false
  });

  state.sizeDialog = dialog;

  // Hook the close lifecycle to exit paint mode when dialog is closed
  const origClose = dialog.close.bind(dialog);
  dialog.close = async (...args) => {
    const wasClosingFromExit = state.closingDialog;
    state.sizeDialog = null;
    const result = await origClose(...args);
    if (!wasClosingFromExit && state.active) {
      // User closed the dialog manually → exit paint mode too
      await exitPaintMode();
    }
    return result;
  };

  dialog.render({ force: true }).then(() => {
    const root = dialog.element;
    if (!root) return;
    const slider = root.querySelector('.table-mode-brush-size-slider');
    const label = root.querySelector('.table-mode-brush-size-value');
    const markerBtn = root.querySelector('.table-mode-party-marker-toggle');
    if (slider) {
      slider.addEventListener('input', async (ev) => {
        const v = Number(ev.target.value);
        if (label) label.textContent = String(v);
        await setBrushSize(v);
      });
    }
    if (markerBtn) {
      markerBtn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        await togglePartyMarker();
      });
    }
  });
}

async function setBrushSize(size) {
  const clamped = Math.max(MIN_BRUSH_SIZE, Math.min(MAX_BRUSH_SIZE, Math.round(size)));
  try {
    await game.settings.set(MODULE_ID, BRUSH_SIZE_SETTING, clamped);
  } catch (e) {
    console.error(`[${MODULE_ID}] Set brush size failed`, e);
    return;
  }
  // Live update of running paint mode
  const tokenDoc = state.brushTokenId ? canvas?.scene?.tokens.get(state.brushTokenId) : null;
  if (tokenDoc) {
    const sceneRange = squaresToSceneUnits(clamped);
    try {
      await tokenDoc.update({ 'sight.range': sceneRange });
    } catch (e) {
      console.error(`[${MODULE_ID}] Update brush sight range failed`, e);
    }
  }
  if (state.cursorGfx) {
    drawBrushCircle(state.cursorGfx, squaresToPixels(clamped));
  }
}

export async function resetFog() {
  if (!game.user.isGM) return;
  const scene = canvas?.scene;
  if (!scene) return;

  const title = game.i18n.localize('TABLE_MODE.FogBrush.ResetTitle');
  const content = `<p>${game.i18n.localize('TABLE_MODE.FogBrush.ResetConfirm')}</p>`;

  let confirmed = false;
  const DialogV2 = foundry.applications?.api?.DialogV2;
  try {
    if (DialogV2?.confirm) {
      confirmed = await DialogV2.confirm({
        window: { title },
        content,
        rejectClose: false,
        modal: true
      });
    } else if (globalThis.Dialog?.confirm) {
      confirmed = await globalThis.Dialog.confirm({ title, content });
    } else {
      confirmed = window.confirm(`${title}\n\n${content.replace(/<[^>]+>/g, '')}`);
    }
  } catch (_) {
    confirmed = false;
  }
  if (!confirmed) return;

  try {
    // Three-step reset: clear local fog data, broadcast to other clients via
    // scene field update, then trigger a perception refresh so the canvas
    // actually redraws. Any one of these alone misses something.
    await canvas.fog.reset();
    await canvas.scene.update({ 'fog.reset': Date.now() });
    canvas.perception?.update?.(
      { refreshVision: true, refreshLighting: true, refreshOcclusion: true },
      true
    );
    ui.notifications.info(game.i18n.localize('TABLE_MODE.Notifications.FogReset'));
  } catch (e) {
    console.error(`[${MODULE_ID}] Reset fog failed`, e);
    ui.notifications.error(game.i18n.localize('TABLE_MODE.Notifications.FogResetFailed'));
  }
}

/* ------------------------------------------------------------------ */
/* Paint-mode lifecycle                                                */
/* ------------------------------------------------------------------ */

async function enterPaintMode() {
  const scene = canvas?.scene;
  if (!scene) {
    ui.notifications.warn(game.i18n.localize('TABLE_MODE.Notifications.NoScene'));
    return;
  }

  const actor = await ensureBrushActor();
  if (!actor) {
    ui.notifications.error(game.i18n.localize('TABLE_MODE.Notifications.BrushSpawnFailed'));
    return;
  }

  const sizeSquares = getBrushSize();
  const sightRange = squaresToSceneUnits(sizeSquares);
  const dims = scene.dimensions ?? canvas.dimensions ?? {};
  const spawnX = (dims.sceneX ?? 0) + ((dims.sceneWidth ?? dims.width ?? 4000) / 2);
  const spawnY = (dims.sceneY ?? 0) + ((dims.sceneHeight ?? dims.height ?? 3000) / 2);

  // Build token data from the actor's prototype, then override what we need.
  const proto = actor.prototypeToken.toObject();
  const tokenData = {
    ...proto,
    actorId: actor.id,
    actorLink: false,
    x: Math.round(spawnX),
    y: Math.round(spawnY),
    sight: {
      ...(proto.sight ?? {}),
      enabled: false,
      range: sightRange,
      visionMode: 'basic'
    },
    flags: foundry.utils.mergeObject(
      proto.flags ?? {},
      { [MODULE_ID]: { [VTT_HIDDEN_FLAG]: true, [FOG_BRUSH_FLAG]: true } },
      { inplace: false }
    )
  };

  let docs;
  try {
    docs = await scene.createEmbeddedDocuments('Token', [tokenData]);
  } catch (e) {
    console.error(`[${MODULE_ID}] Spawn brush token failed`, e);
    ui.notifications.error(game.i18n.localize('TABLE_MODE.Notifications.BrushSpawnFailed'));
    return;
  }
  const tokenDoc = docs?.[0];
  if (!tokenDoc) return;

  state.brushTokenId = tokenDoc.id;
  state.active = true;
  state.pointerDown = false;
  state.lastMoveTs = 0;

  installCursorOverlay(sizeSquares);
  installCanvasListeners();
  suppressCanvasPings();
  document.body.classList.add('table-mode-fog-paint-active');

  ui.notifications.info(
    game.i18n.format('TABLE_MODE.Notifications.PaintModeEntered', { size: sizeSquares })
  );
}

async function exitPaintMode() {
  removeCanvasListeners();
  removeCursorOverlay();
  restoreCanvasPings();
  document.body.classList.remove('table-mode-fog-paint-active');

  // Close size dialog if still open. Flag prevents the close-handler from
  // recursing into exitPaintMode().
  if (state.sizeDialog) {
    state.closingDialog = true;
    try { await state.sizeDialog.close(); } catch (_) {}
    state.closingDialog = false;
    state.sizeDialog = null;
  }

  const scene = canvas?.scene;
  if (scene && state.brushTokenId) {
    try {
      await scene.deleteEmbeddedDocuments('Token', [state.brushTokenId]);
    } catch (e) {
      console.error(`[${MODULE_ID}] Despawn brush token failed`, e);
    }
  }

  state.brushTokenId = null;
  state.active = false;
  state.pointerDown = false;

  ui.notifications.info(game.i18n.localize('TABLE_MODE.Notifications.PaintModeExited'));
}

/* ------------------------------------------------------------------ */
/* Suppress Foundry's canvas long-press → ping while paint mode active */
/* ------------------------------------------------------------------ */

function suppressCanvasPings() {
  if (!canvas) return;
  // Override Canvas#ping which is the actual ping-fire entry point in V13.
  // Both long-press and Ctrl+click pings funnel through it, so a single
  // override catches all of them. Save and restore on exit.
  const proto = canvas.constructor?.prototype;
  if (proto && typeof proto.ping === 'function' && !state.savedLongPress) {
    state.savedLongPress = proto.ping;
    proto.ping = function () {
      if (state.active) return Promise.resolve(false);
      return state.savedLongPress.apply(this, arguments);
    };
  }
}

function restoreCanvasPings() {
  if (state.savedLongPress) {
    const proto = canvas?.constructor?.prototype;
    if (proto) proto.ping = state.savedLongPress;
  }
  state.savedLongPress = null;
}

/* ------------------------------------------------------------------ */
/* Cursor overlay (PIXI graphics following the mouse)                  */
/* ------------------------------------------------------------------ */

/** Convert brush size (in grid squares) to canvas pixels. */
function squaresToPixels(squares) {
  const scene = canvas?.scene;
  const gridSize = scene?.grid?.size ?? 100;
  return squares * gridSize;
}

/** Convert brush size (in grid squares) to scene units (for sight.range). */
function squaresToSceneUnits(squares) {
  const scene = canvas?.scene;
  const distance = scene?.grid?.distance ?? 1;
  return squares * distance;
}

function drawBrushCircle(gfx, radius) {
  gfx.clear();
  gfx.lineStyle(3, 0xffd700, 1);
  gfx.beginFill(0xffd700, 0.12);
  gfx.drawCircle(0, 0, radius);
  gfx.endFill();
}

function installCursorOverlay(sizeSquares) {
  const gfx = new PIXI.Graphics();
  gfx.eventMode = 'none';
  drawBrushCircle(gfx, squaresToPixels(sizeSquares));
  gfx.visible = false;
  canvas.stage.addChild(gfx);
  state.cursorGfx = gfx;
}

function removeCursorOverlay() {
  if (state.cursorGfx) {
    try {
      canvas.stage.removeChild(state.cursorGfx);
      state.cursorGfx.destroy();
    } catch (_) {}
    state.cursorGfx = null;
  }
}

/* ------------------------------------------------------------------ */
/* Canvas pointer listeners                                            */
/* ------------------------------------------------------------------ */

function installCanvasListeners() {
  const view = canvas?.app?.view;
  if (!view) return;
  const handlers = {
    move: (ev) => onMouseMove(ev),
    down: (ev) => onMouseDown(ev),
    up: (ev) => onMouseUp(ev),
    leave: (ev) => onMouseLeave(ev),
    contextmenu: (ev) => ev.preventDefault()
  };
  view.addEventListener('mousemove', handlers.move, true);
  view.addEventListener('mousedown', handlers.down, true);
  window.addEventListener('mouseup', handlers.up, true);
  view.addEventListener('mouseleave', handlers.leave, true);
  view.addEventListener('contextmenu', handlers.contextmenu, true);
  state.handlers = handlers;
}

function removeCanvasListeners() {
  if (!state.handlers) return;
  const view = canvas?.app?.view;
  if (view) {
    view.removeEventListener('mousemove', state.handlers.move, true);
    view.removeEventListener('mousedown', state.handlers.down, true);
    view.removeEventListener('mouseleave', state.handlers.leave, true);
    view.removeEventListener('contextmenu', state.handlers.contextmenu, true);
  }
  window.removeEventListener('mouseup', state.handlers.up, true);
  state.handlers = null;
}

function clientToSceneCoords(clientEvent) {
  const view = canvas.app.view;
  const rect = view.getBoundingClientRect();
  return canvas.stage.toLocal(
    new PIXI.Point(clientEvent.clientX - rect.left, clientEvent.clientY - rect.top)
  );
}

function onMouseMove(ev) {
  if (!state.active) return;
  const local = clientToSceneCoords(ev);
  if (state.cursorGfx) {
    state.cursorGfx.x = local.x;
    state.cursorGfx.y = local.y;
    state.cursorGfx.visible = true;
  }
  if (state.pointerDown && (ev.buttons & 1)) {
    paintAt(local.x, local.y);
  }
}

function onMouseDown(ev) {
  if (!state.active) return;
  if (ev.button !== 0) return;
  ev.preventDefault();
  ev.stopPropagation();
  state.pointerDown = true;
  const local = clientToSceneCoords(ev);
  paintAt(local.x, local.y, true);
}

async function onMouseUp(_ev) {
  if (!state.pointerDown) return;
  state.pointerDown = false;
  // Park the brush (disable sight) so the area around the last paint spot
  // doesn't show as "currently lit" — falls back to "explored but out of
  // sight" matching the rest of the painted fog.
  if (!state.brushTokenId) return;
  const tokenDoc = canvas?.scene?.tokens.get(state.brushTokenId);
  if (!tokenDoc) return;
  try {
    await tokenDoc.update({ 'sight.enabled': false }, { animate: false });
  } catch (e) {
    console.error(`[${MODULE_ID}] Park brush failed`, e);
  }
}

function onMouseLeave(_ev) {
  if (state.cursorGfx) state.cursorGfx.visible = false;
  state.pointerDown = false;
}

async function paintAt(x, y, force = false) {
  const now = Date.now();
  if (!force && now - state.lastMoveTs < PAINT_THROTTLE_MS) return;
  state.lastMoveTs = now;

  if (!state.brushTokenId) return;
  const tokenDoc = canvas?.scene?.tokens.get(state.brushTokenId);
  if (!tokenDoc) return;

  // Token x/y is the top-left corner. Center the token under the cursor.
  const half = (canvas.scene.grid?.size ?? 100) * 0.25;
  const update = {
    x: Math.round(x - half),
    y: Math.round(y - half)
  };
  // Each new stroke re-enables sight (mouseup disables it to "park" the brush)
  if (!tokenDoc.sight?.enabled) {
    update['sight.enabled'] = true;
  }
  try {
    await tokenDoc.update(update, { animate: false });
  } catch (e) {
    console.error(`[${MODULE_ID}] Paint move failed`, e);
  }
}

/* ------------------------------------------------------------------ */
/* Cleanup if the canvas tears down while paint mode is active        */
/* ------------------------------------------------------------------ */

export function onCanvasTeardown() {
  if (!state.active) return;
  removeCanvasListeners();
  removeCursorOverlay();
  restoreCanvasPings();
  document.body.classList.remove('table-mode-fog-paint-active');
  if (state.sizeDialog) {
    state.closingDialog = true;
    try { state.sizeDialog.close(); } catch (_) {}
    state.closingDialog = false;
    state.sizeDialog = null;
  }
  state.active = false;
  state.pointerDown = false;
  state.brushTokenId = null;
}
