import { MODULE_ID, SOCKET_NAME, MSG } from './socket-protocol.js';
import { getVttUserId, getAnimationDuration } from './settings.js';

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
  ui.notifications.info(game.i18n.localize('TABLE_MODE.Notifications.Synced'));
  log('Sync →', targetId, vp);
}

export async function handleIncomingViewport(msg) {
  const { type, payload, senderId } = msg;
  if (payload?.targetUserId && payload.targetUserId !== game.user.id) return;
  if (senderId === game.user.id) return;

  if (type === MSG.VIEWPORT_SYNC) {
    if (!canvas?.ready) return;
    if (payload.sceneId && canvas.scene?.id !== payload.sceneId) return;
    try {
      await canvas.animatePan({
        x: payload.x,
        y: payload.y,
        scale: payload.scale,
        duration: getAnimationDuration()
      });
    } catch (e) {
      warn('animatePan failed', e);
    }
  }
}
