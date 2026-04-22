import { MODULE_ID, SOCKET_NAME, MSG } from './socket-protocol.js';
import { getVttUserId, getAspectOverride } from './settings.js';
import { ViewboxOverlay } from './viewbox-overlay.js';

const FLAG_KEY = 'viewbox';
const FALLBACK_ASPECT = 16 / 9;

let overlay = null;
let enabled = false;
let vttAspect = FALLBACK_ASPECT;

function effectiveAspect() {
  return getAspectOverride() ?? vttAspect ?? FALLBACK_ASPECT;
}

function log(...args) { console.log(`[${MODULE_ID}]`, ...args); }

function defaultViewbox(scene) {
  const sw = scene?.dimensions?.width ?? scene?.width ?? 4000;
  const sh = scene?.dimensions?.height ?? scene?.height ?? 3000;
  const w = Math.round(sw * 0.5);
  const h = Math.round(w / effectiveAspect());
  return {
    x: Math.round(sw / 2),
    y: Math.round(sh / 2),
    width: w,
    height: h
  };
}

function readFlag() {
  return canvas?.scene?.getFlag(MODULE_ID, FLAG_KEY) ?? null;
}

async function writeFlag(data) {
  const scene = canvas?.scene;
  if (!scene) return;
  await scene.setFlag(MODULE_ID, FLAG_KEY, data);
}

function emit(type, payload) {
  game.socket.emit(SOCKET_NAME, { type, payload, senderId: game.user.id });
}

function broadcastCurrent() {
  if (!overlay) return;
  const targetUserId = getVttUserId();
  if (!targetUserId) return;
  emit(MSG.VIEWBOX_UPDATE, {
    sceneId: canvas?.scene?.id ?? null,
    targetUserId,
    ...overlay.getState()
  });
}

function broadcastClear() {
  const targetUserId = getVttUserId();
  if (!targetUserId) return;
  emit(MSG.VIEWBOX_CLEAR, { targetUserId });
}

async function createOverlay(initial) {
  overlay = new ViewboxOverlay({
    ...initial,
    aspect: effectiveAspect(),
    onChange: async (next) => {
      await writeFlag(next);
      broadcastCurrent();
    }
  });
  canvas.stage.addChild(overlay);
}

export function applyAspectNow() {
  if (overlay) overlay.setAspect(effectiveAspect());
}

export function isEnabled() { return enabled; }

export async function enableViewbox() {
  if (enabled) return;
  if (!canvas?.ready || !game.user.isGM) return;
  const scene = canvas.scene;
  if (!scene) return;

  const stored = readFlag();
  const data = stored ?? defaultViewbox(scene);
  await createOverlay(data);
  enabled = true;
  if (!stored) await writeFlag(data);
  broadcastCurrent();
  log('Viewbox enabled', data);
}

export function disableViewbox() {
  if (!enabled) return;
  if (overlay) {
    canvas.stage.removeChild(overlay);
    overlay.destroy();
    overlay = null;
  }
  enabled = false;
  broadcastClear();
  log('Viewbox disabled');
}

export async function toggleViewbox() {
  if (enabled) disableViewbox();
  else await enableViewbox();
}

export function onCanvasTeardown() {
  if (!overlay) return;
  try {
    canvas.stage.removeChild(overlay);
    overlay.destroy();
  } catch (_) {}
  overlay = null;
}

export async function onCanvasReady() {
  if (!enabled) return;
  if (!game.user.isGM) return;
  const scene = canvas.scene;
  if (!scene) return;
  const stored = readFlag();
  const data = stored ?? defaultViewbox(scene);
  await createOverlay(data);
  if (!stored) await writeFlag(data);
  broadcastCurrent();
}

/** VTT client sends its window aspect on ready. GM stores it for viewbox sizing. */
export function announceClientAspect() {
  emit(MSG.CLIENT_HELLO, {
    userId: game.user.id,
    aspect: window.innerWidth / window.innerHeight,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight
  });
}

/** GM-side: receive VTT's aspect. */
export function handleClientHello(msg) {
  if (!game.user.isGM) return;
  const { payload } = msg;
  if (!payload?.userId || payload.userId !== getVttUserId()) return;
  const aspect = payload.aspect;
  if (!aspect || !isFinite(aspect) || aspect <= 0) return;
  vttAspect = aspect;
  log(`VTT aspect received: ${aspect.toFixed(3)} (${payload.innerWidth}×${payload.innerHeight})`);
  if (overlay && getAspectOverride() == null) overlay.setAspect(aspect);
}

/** VTT-side: apply incoming viewbox as pan+scale. Uses MAX scale so viewbox fills screen. */
export function handleIncomingViewbox(msg) {
  const { type, payload, senderId } = msg;
  if (payload?.targetUserId && payload.targetUserId !== game.user.id) return;
  if (senderId === game.user.id) return;
  if (!canvas?.ready) return;

  if (type === MSG.VIEWBOX_UPDATE) {
    if (payload.sceneId && canvas.scene?.id !== payload.sceneId) return;
    // Max → viewbox just fits screen; aspect lock on GM side ensures no cropping
    const scale = Math.max(
      window.innerWidth / payload.width,
      window.innerHeight / payload.height
    );
    canvas.animatePan({
      x: payload.x,
      y: payload.y,
      scale,
      duration: 250
    }).catch((e) => console.warn(`[${MODULE_ID}] animatePan failed`, e));
  } else if (type === MSG.VIEWBOX_CLEAR) {
    log('Viewbox cleared by GM');
  }
}
