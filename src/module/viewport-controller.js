import { MODULE_ID, SOCKET_NAME, MSG } from './socket-protocol.js';
import { getVttUserId, getAnimationDuration } from './settings.js';

let locked = false;
let panHookId = null;
let suppressNextPanBroadcast = false;

function log(...args) {
  console.log(`[${MODULE_ID}]`, ...args);
}

function warn(...args) {
  console.warn(`[${MODULE_ID}]`, ...args);
}

function currentViewport() {
  if (!canvas?.ready || !canvas.stage) return null;
  return {
    x: canvas.stage.pivot.x,
    y: canvas.stage.pivot.y,
    scale: canvas.stage.scale.x,
    sceneId: canvas.scene?.id ?? null
  };
}

function emit(type, payload) {
  game.socket.emit(SOCKET_NAME, { type, payload, senderId: game.user.id });
}

export function isLocked() {
  return locked;
}

export function syncOnce() {
  if (!game.user.isGM) return;
  const targetId = getVttUserId();
  if (!targetId) {
    ui.notifications.warn(game.i18n.localize('TABLE_MODE.Notifications.NoVttUser'));
    return;
  }
  const vp = currentViewport();
  if (!vp) return;
  emit(MSG.VIEWPORT_SYNC, { ...vp, targetUserId: targetId });
  log('Sync once →', targetId, vp);
}

export function lock() {
  if (!game.user.isGM) return;
  const targetId = getVttUserId();
  if (!targetId) {
    ui.notifications.warn(game.i18n.localize('TABLE_MODE.Notifications.NoVttUser'));
    return;
  }
  if (locked) return;
  locked = true;
  panHookId = Hooks.on('canvasPan', onGmPan);
  ui.notifications.info(game.i18n.localize('TABLE_MODE.Notifications.Locked'));
  // Seed with current viewport
  syncOnce();
  log('Locked to', targetId);
}

export function unlock() {
  if (!locked) return;
  locked = false;
  if (panHookId != null) {
    Hooks.off('canvasPan', panHookId);
    panHookId = null;
  }
  const targetId = getVttUserId();
  if (targetId) emit(MSG.VIEWPORT_UNLOCK, { targetUserId: targetId });
  ui.notifications.info(game.i18n.localize('TABLE_MODE.Notifications.Unlocked'));
  log('Unlocked');
}

export function toggleLock() {
  locked ? unlock() : lock();
}

function onGmPan(_canvas, view) {
  if (!locked) return;
  if (suppressNextPanBroadcast) {
    suppressNextPanBroadcast = false;
    return;
  }
  const targetId = getVttUserId();
  if (!targetId) return;
  emit(MSG.VIEWPORT_LOCK, {
    x: view.x,
    y: view.y,
    scale: view.scale,
    sceneId: canvas.scene?.id ?? null,
    targetUserId: targetId
  });
}

// Called on VTT-user side when a socket message arrives
export async function handleIncomingViewport(msg) {
  const { type, payload, senderId } = msg;
  if (payload?.targetUserId && payload.targetUserId !== game.user.id) return;
  if (senderId === game.user.id) return; // ignore own echo

  switch (type) {
    case MSG.VIEWPORT_SYNC:
    case MSG.VIEWPORT_LOCK: {
      if (!canvas?.ready) return;
      if (payload.sceneId && canvas.scene?.id !== payload.sceneId) {
        // Viewport references a scene we're not viewing — skip silently.
        return;
      }
      const duration = type === MSG.VIEWPORT_LOCK ? 0 : getAnimationDuration();
      suppressNextPanBroadcast = true;
      try {
        await canvas.animatePan({
          x: payload.x,
          y: payload.y,
          scale: payload.scale,
          duration
        });
      } catch (e) {
        warn('animatePan failed', e);
      }
      break;
    }
    case MSG.VIEWPORT_UNLOCK:
      // No-op for now — viewport simply stops being pushed.
      break;
    default:
      break;
  }
}
