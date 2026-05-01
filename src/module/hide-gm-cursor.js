import { MODULE_ID } from './socket-protocol.js';
import { getVttUserId, isHideGmCursorEnabled } from './settings.js';

/**
 * Hide GM cursor + ruler on the dedicated VTT-display client.
 *
 * Pings remain visible — they're rendered separately from the persistent
 * cursor element and are still useful for the table.
 *
 * Foundry V13 renders each user's cursor as a PIXI element keyed by user id
 * under canvas.interface (or canvas.controls in older builds). We set
 * `visible = false` after every userActivity update for GM users.
 */

function isActiveVttUser() {
  return !game.user.isGM && game.user.id === getVttUserId();
}

function getUserCursor(userId) {
  return canvas?.interface?.cursors?.get?.(userId)
    ?? canvas?.controls?.cursors?.get?.(userId)
    ?? null;
}

function getUserRuler(userId) {
  return canvas?.controls?.rulers?.get?.(userId)
    ?? canvas?.interface?.rulers?.get?.(userId)
    ?? null;
}

function hideUserVisuals(userId) {
  const c = getUserCursor(userId);
  if (c) c.visible = false;
  const r = getUserRuler(userId);
  if (r) r.visible = false;
}

function hideAllGmCursors() {
  if (!isActiveVttUser()) return;
  if (!isHideGmCursorEnabled()) return;
  for (const u of game.users ?? []) {
    if (u.isGM) hideUserVisuals(u.id);
  }
}

export function onUserActivity(user, _data) {
  if (!isActiveVttUser()) return;
  if (!isHideGmCursorEnabled()) return;
  if (!user?.isGM) return;
  // Foundry processes the activity synchronously after the hook chain — defer
  // to next microtask so we hide the cursor *after* it gets shown.
  Promise.resolve().then(() => hideUserVisuals(user.id));
}

export function onCanvasReady() {
  hideAllGmCursors();
}

/**
 * Re-evaluate when the setting flips. If user toggles ON, hide existing
 * GM cursors immediately. If toggled OFF, show them again so they reappear
 * on next mouse move.
 */
export function onSettingChange() {
  if (!isActiveVttUser()) return;
  if (isHideGmCursorEnabled()) {
    hideAllGmCursors();
  } else {
    for (const u of game.users ?? []) {
      if (!u.isGM) continue;
      const c = getUserCursor(u.id);
      if (c) c.visible = true;
      const r = getUserRuler(u.id);
      if (r) r.visible = true;
    }
  }
}
