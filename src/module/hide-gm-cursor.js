import { MODULE_ID } from './socket-protocol.js';
import { getVttUserId, isHideGmCursorEnabled } from './settings.js';

/**
 * Hide cursors on the dedicated VTT-display client.
 *
 * V13 cursor architecture:
 *  - `canvas.controls.cursors` is a PIXI UnboundContainer holding Cursor
 *    instances as children. There's no `.user` link on the children, and
 *    `game.users` doesn't expose a `.cursor` property — so we can't filter
 *    GM-only here. We just hide ALL cursor children. Acceptable because the
 *    VTT client is a table TV — other players watching it have no reason to
 *    see anyone's mouse cursor.
 *  - Pings are rendered separately, so they remain visible.
 *  - `userActivity` hook does not fire in V13. We poll instead.
 */

let pollHandle = null;
const POLL_MS = 150;

function isActiveVttUser() {
  return !game.user.isGM && game.user.id === getVttUserId();
}

function hideAllCursors() {
  const container = canvas?.controls?.cursors;
  if (!container?.children) return;
  for (const c of container.children) {
    if (c) c.visible = false;
  }
}

function showAllCursors() {
  const container = canvas?.controls?.cursors;
  if (!container?.children) return;
  for (const c of container.children) {
    if (c) c.visible = true;
  }
}

function startPolling() {
  if (pollHandle != null) return;
  pollHandle = setInterval(() => {
    if (!isActiveVttUser() || !isHideGmCursorEnabled()) {
      stopPolling();
      return;
    }
    hideAllCursors();
  }, POLL_MS);
}

function stopPolling() {
  if (pollHandle == null) return;
  clearInterval(pollHandle);
  pollHandle = null;
}

export function onCanvasReady() {
  if (!isActiveVttUser()) return;
  if (!isHideGmCursorEnabled()) return;
  hideAllCursors();
  startPolling();
}

export function onSettingChange() {
  if (!isActiveVttUser()) return;
  if (isHideGmCursorEnabled()) {
    hideAllCursors();
    startPolling();
  } else {
    stopPolling();
    showAllCursors();
  }
}

// Kept for backward-compat with main.js wiring (no-op now).
export function onUserActivity() {}
