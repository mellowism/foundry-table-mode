import { MODULE_ID } from './socket-protocol.js';
import { getVttUserId, isDefaultHiddenTokensEnabled } from './settings.js';

/**
 * VTT Token Hide — visually hides token sprites on the VTT client only.
 *
 * Token document is never marked `hidden: true`, so vision/fog/illumination
 * for the VTT user (Observer on the actor) keep working normally. Only the
 * sprite, nameplate, bars, effects and border are hidden on the VTT client.
 *
 * Mirrors the per-note hide UX (eye icon in HUD + bulk toolbar + default-on
 * setting) but uses a custom flag instead of ownership/hidden mutations.
 */

const FLAG_KEY = 'vttHidden';
const FOG_BRUSH_FLAG = 'fogBrush';
const PARTY_MARKER_FLAG = 'partyMarker';
// UI children (everything except the sprite mesh). dnd5e 5.x adds ring and
// aura PIXI children that other modules don't always touch — list them too.
const UI_PARTS = ['bars', 'nameplate', 'effects', 'tooltip', 'border', 'targetArrows', 'targetPips', 'ring', 'aura'];

function isVttHidden(tokenDoc) {
  return !!tokenDoc?.getFlag?.(MODULE_ID, FLAG_KEY);
}

function isFogBrush(tokenDoc) {
  return !!tokenDoc?.getFlag?.(MODULE_ID, FOG_BRUSH_FLAG);
}

function isPartyMarker(tokenDoc) {
  return !!tokenDoc?.getFlag?.(MODULE_ID, PARTY_MARKER_FLAG);
}

function setUiVisible(token, visible) {
  for (const key of UI_PARTS) {
    const part = token[key];
    if (!part) continue;
    part.visible = visible;
  }
}

/**
 * V13: Token.ruler is a BaseTokenRuler instance with an `isVisible` getter
 * that drives the per-token drag ruler. Override the getter to always return
 * false so the ruler is never rendered on this client when this token is
 * dragged (or being dragged by another user).
 */
function suppressTokenRuler(token) {
  const ruler = token.ruler;
  if (!ruler || ruler._tableModeSuppressed) return;
  try {
    Object.defineProperty(ruler, 'isVisible', {
      get: () => false,
      configurable: true
    });
    ruler.visible = false;
    ruler._tableModeSuppressed = true;
  } catch (_) {
    // Fallback: just kill visible (Foundry's refresh may re-enable it)
    ruler.visible = false;
  }
}

function isThisClientTheVtt() {
  // Settings register at `ready`, but canvasReady can fire earlier. Reading
  // an unregistered setting throws — return false in that early window.
  try {
    return game.user.id === getVttUserId();
  } catch (_) {
    return false;
  }
}

function isDefaultHiddenSafe() {
  try {
    return isDefaultHiddenTokensEnabled();
  } catch (_) {
    return false;
  }
}

/**
 * Apply the hide state to a rendered token's PIXI children.
 *
 * Three flags + role drive behavior:
 *   - `fogBrush` → fully invisible everywhere (mesh + UI hidden, even for GM).
 *   - `partyMarker` → on GM: mesh visible (gold aura icon shown), UI hidden
 *     (no nameplate, no elevation tooltip, no border, no target arrows).
 *     On VTT: fully invisible.
 *   - `vttHidden` → fully invisible on the VTT client only. Other clients
 *     (GM, remote players) see the token normally.
 */
export function applyHideForToken(token) {
  if (!token) return;
  const doc = token.document;
  const isBrush = isFogBrush(doc);
  const isMarker = isPartyMarker(doc);
  const isHiddenOnVtt = isVttHidden(doc);
  const onVtt = isThisClientTheVtt();

  if (isBrush) {
    if (token.mesh) token.mesh.renderable = false;
    setUiVisible(token, false);
    suppressTokenRuler(token);
    // Make the brush non-interactive so Foundry doesn't show a selection
    // rectangle when clicks land on its bounds during paint mode
    token.eventMode = 'none';
    return;
  }

  if (isMarker) {
    if (onVtt) {
      if (token.mesh) token.mesh.renderable = false;
      setUiVisible(token, false);
    } else {
      // GM keeps mesh visible (gold aura), but hide labels/elevation/etc.
      if (token.mesh) token.mesh.renderable = true;
      setUiVisible(token, false);
    }
    // Suppress drag ruler on BOTH sides — VTT must not see it, and GM doesn't
    // need it for the click-to-place workflow either
    suppressTokenRuler(token);
    return;
  }

  if (isHiddenOnVtt && onVtt) {
    if (token.mesh) token.mesh.renderable = false;
    setUiVisible(token, false);
    return;
  }

  // No hide flag applies on this client — restore mesh rendering. Don't force
  // UI parts visible (Foundry's render pipeline manages them based on
  // displayName/displayBars settings).
  if (token.mesh && token.mesh.renderable === false) token.mesh.renderable = true;
}

/** Sweep all tokens on the current scene — used on canvasReady and setting flips.
 *  Always runs (not just on VTT) so fogBrush tokens get hidden for the GM too. */
export function reapplyAll() {
  for (const token of canvas?.tokens?.placeables ?? []) {
    applyHideForToken(token);
  }
}

export function onDrawToken(token) { applyHideForToken(token); }
export function onRefreshToken(token) { applyHideForToken(token); }

export function onUpdateToken(tokenDoc, change) {
  // Re-apply when our flags change, or when rendering-relevant fields change.
  // Runs on GM too because fogBrush + partyMarker tokens have GM-side hide
  // behavior (full hide and UI-only hide respectively).
  const vttFlagPath = `flags.${MODULE_ID}.${FLAG_KEY}`;
  const brushFlagPath = `flags.${MODULE_ID}.${FOG_BRUSH_FLAG}`;
  const markerFlagPath = `flags.${MODULE_ID}.${PARTY_MARKER_FLAG}`;
  const flagChanged = foundry.utils.hasProperty(change, vttFlagPath) ||
                      foundry.utils.hasProperty(change, brushFlagPath) ||
                      foundry.utils.hasProperty(change, markerFlagPath);
  const visualsChanged = ['x', 'y', 'hidden', 'texture', 'name', 'displayName'].some(k =>
    foundry.utils.hasProperty(change, k)
  );
  if (!flagChanged && !visualsChanged) return;
  const token = tokenDoc.object ?? canvas?.tokens?.get(tokenDoc.id);
  if (token) applyHideForToken(token);
}

export function onCanvasReady() {
  reapplyAll();
}

/* ------------------------------------------------------------------ */
/* GM-side: Token HUD eye button                                       */
/* ------------------------------------------------------------------ */

export function onRenderTokenHUD(hud, htmlOrJq) {
  if (!game.user.isGM) return;
  const root = htmlOrJq instanceof HTMLElement ? htmlOrJq : htmlOrJq?.[0] ?? htmlOrJq;
  if (!root?.querySelector) return;
  const token = hud.object;
  if (!token) return;

  const hidden = isVttHidden(token.document);
  const tooltip = game.i18n.localize('TABLE_MODE.TokenHud.ToggleVis');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `control-icon table-mode-vtt-hide${hidden ? ' active' : ''}`;
  button.dataset.action = 'tableModeVttHide';
  button.dataset.tooltip = tooltip;
  button.innerHTML = '<i class="fas fa-eye"></i>';
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await token.document.setFlag(MODULE_ID, FLAG_KEY, !hidden);
    } catch (e) {
      console.error(`[${MODULE_ID}] Failed to toggle VTT-hide flag`, e);
      return;
    }
    hud.render();
  });

  const rightCol = root.querySelector('.col.right') ?? root.querySelector('[class*="right"]') ?? root;
  rightCol.appendChild(button);
}

/* ------------------------------------------------------------------ */
/* GM-side: preCreateToken — set flag + nameplate when setting is on   */
/* ------------------------------------------------------------------ */

export function onPreCreateToken(token) {
  if (!game.user?.isGM) return;
  if (!isDefaultHiddenSafe()) return;
  const ownerDisplay = CONST?.TOKEN_DISPLAY_MODES?.OWNER ?? 40;
  const updates = {
    displayName: ownerDisplay,
    [`flags.${MODULE_ID}.${FLAG_KEY}`]: true
  };
  // Use the actor's name so the GM nameplate matches what was dropped
  // (some systems default the prototype-token name to a generic placeholder).
  const actorName = token.actor?.name;
  if (actorName) updates.name = actorName;
  token.updateSource(updates);
}

/* ------------------------------------------------------------------ */
/* GM-side: bulk toolbar — toggle all tokens on the current scene      */
/* ------------------------------------------------------------------ */

export async function toggleAllTokensOnVtt() {
  if (!game.user.isGM) return;
  const tokens = canvas?.tokens?.placeables ?? [];
  if (!tokens.length) {
    ui.notifications.info(game.i18n.localize('TABLE_MODE.Notifications.NoTokens'));
    return;
  }

  const anyVisible = tokens.some(t => !isVttHidden(t.document));
  const newHidden = anyVisible; // hide all if any visible, else show all

  const updates = tokens.map(t => ({
    _id: t.document.id,
    [`flags.${MODULE_ID}.${FLAG_KEY}`]: newHidden
  }));

  try {
    await canvas.scene.updateEmbeddedDocuments('Token', updates);
  } catch (e) {
    console.error(`[${MODULE_ID}] Bulk VTT-hide toggle failed`, e);
    ui.notifications.error(game.i18n.localize('TABLE_MODE.Notifications.BulkTokenToggleFailed'));
    return;
  }

  const key = newHidden ? 'TABLE_MODE.Notifications.TokensHidden' : 'TABLE_MODE.Notifications.TokensShown';
  ui.notifications.info(game.i18n.format(key, { count: tokens.length }));
}
