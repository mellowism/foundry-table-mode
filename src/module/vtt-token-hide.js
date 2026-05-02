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
const VISIBLE_PARTS = ['mesh', 'bars', 'nameplate', 'effects', 'tooltip', 'border', 'target'];

function isVttHidden(tokenDoc) {
  return !!tokenDoc?.getFlag?.(MODULE_ID, FLAG_KEY);
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
 * No-op on GM and on non-VTT clients — they always see the token.
 */
export function applyHideForToken(token) {
  if (!token || !isThisClientTheVtt()) return;
  const hide = isVttHidden(token.document);
  for (const key of VISIBLE_PARTS) {
    const part = token[key];
    if (!part) continue;
    part.visible = !hide;
  }
  // Also block selection/interaction visuals for hidden tokens
  if (hide) {
    if (token.tooltip) token.tooltip.visible = false;
  }
}

/** Sweep all tokens on the current scene — used on canvasReady and setting flips. */
export function reapplyAll() {
  if (!isThisClientTheVtt()) return;
  for (const token of canvas?.tokens?.placeables ?? []) {
    applyHideForToken(token);
  }
}

export function onDrawToken(token) { applyHideForToken(token); }
export function onRefreshToken(token) { applyHideForToken(token); }

export function onUpdateToken(tokenDoc, change) {
  // Re-apply when our flag changes, or when other rendering-relevant fields
  // change (Foundry resets visibility on some updates).
  if (!isThisClientTheVtt()) return;
  const flagPath = `flags.${MODULE_ID}.${FLAG_KEY}`;
  const flagChanged = foundry.utils.hasProperty(change, flagPath);
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
