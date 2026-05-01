import { MODULE_ID } from './socket-protocol.js';
import { getVttUserId, isHideGmCursorEnabled } from './settings.js';

/**
 * Hide other users' cursors on the dedicated VTT-display client.
 *
 * Approach (inspired by Azzurite's cursor-hider): patch
 *   - ControlsLayer.prototype.updateCursor
 *   - ControlsLayer.prototype.updateRuler
 * to early-return when this client should hide cursors. The cursor is then
 * never drawn — no flicker, no per-frame work.
 *
 * Pings render through a separate path and remain visible.
 *
 * Hides ALL cursors (not just GM's): the VTT client is a table TV, the
 * audience sitting at the table doesn't need to see anyone's mouse pointer.
 */

let patched = false;

function shouldSuppress() {
  if (!game?.user || game.user.isGM) return false;
  // Settings register in `ready` (vttUserId needs game.users.contents which
  // isn't populated at init). updateCursor patches run as soon as Foundry
  // applies buffered userActivity socket events, which can be before ready.
  // Tolerate the gap: if settings aren't registered yet, just don't suppress.
  try {
    if (game.user.id !== getVttUserId()) return false;
    if (!isHideGmCursorEnabled()) return false;
  } catch (_) {
    return false;
  }
  return true;
}

export function installCursorPatches() {
  if (patched) return;
  const Cls = foundry?.canvas?.layers?.ControlsLayer;
  if (!Cls?.prototype) {
    console.warn(`[${MODULE_ID}] ControlsLayer not found — hide-cursor inactive`);
    return;
  }
  patched = true;

  const origUpdateCursor = Cls.prototype.updateCursor;
  if (typeof origUpdateCursor === 'function') {
    Cls.prototype.updateCursor = function (...args) {
      if (shouldSuppress()) return;
      return origUpdateCursor.apply(this, args);
    };
  }

  const origUpdateRuler = Cls.prototype.updateRuler;
  if (typeof origUpdateRuler === 'function') {
    Cls.prototype.updateRuler = function (...args) {
      if (shouldSuppress()) return;
      return origUpdateRuler.apply(this, args);
    };
  }
}

function removeExistingCursors() {
  const container = canvas?.controls?.cursors;
  if (!container?.removeChildren) return;
  container.removeChildren();
}

export function onCanvasReady() {
  if (shouldSuppress()) removeExistingCursors();
}

export function onSettingChange() {
  if (shouldSuppress()) removeExistingCursors();
  // When toggled OFF: nothing to do — next mouse move will redraw cursor
  // through the (now pass-through) patched method.
}

// no-op kept for main.js compat
export function onUserActivity() {}
