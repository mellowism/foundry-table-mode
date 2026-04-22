import { MODULE_ID, SOCKET_NAME, MSG } from './socket-protocol.js';
import { getVttUserId } from './settings.js';

function emit(type, payload) {
  game.socket.emit(SOCKET_NAME, { type, payload, senderId: game.user.id });
}

export function reloadVtt() {
  if (!game.user.isGM) return;
  const targetUserId = getVttUserId();
  if (!targetUserId) {
    ui.notifications.warn(game.i18n.localize('TABLE_MODE.Notifications.NoVttUser'));
    return;
  }
  emit(MSG.CLIENT_RELOAD, { targetUserId });
  ui.notifications.info(game.i18n.localize('TABLE_MODE.Notifications.ReloadSent'));
  console.log(`[${MODULE_ID}] Sent reload to`, targetUserId);
}

export function handleIncomingReload(msg) {
  const { payload, senderId } = msg;
  if (payload?.targetUserId && payload.targetUserId !== game.user.id) return;
  if (senderId === game.user.id) return;
  console.log(`[${MODULE_ID}] Reload requested by GM`);
  // Small delay so the notification can render
  setTimeout(() => location.reload(), 150);
}
