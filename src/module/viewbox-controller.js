import { MODULE_ID, SOCKET_NAME, MSG } from './socket-protocol.js';
import { getVttUserId } from './settings.js';
import { ViewboxOverlay } from './viewbox-overlay.js';

const FLAG_KEY = 'viewbox';

let overlay = null;
let enabled = false;

function log(...args) {
  console.log(`[${MODULE_ID}]`, ...args);
}

function defaultViewbox(scene) {
  const sw = scene?.dimensions?.width ?? scene?.width ?? 4000;
  const sh = scene?.dimensions?.height ?? scene?.height ?? 3000;
  const w = Math.round(sw * 0.5);
  // Default to 16:9 aspect
  const h = Math.round(w * (9 / 16));
  return {
    x: Math.round(sw / 2),
    y: Math.round(sh / 2),
    width: w,
    height: h
  };
}

function readFlag() {
  const scene = canvas?.scene;
  if (!scene) return null;
  return scene.getFlag(MODULE_ID, FLAG_KEY) ?? null;
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
  const scene = canvas?.scene;
  emit(MSG.VIEWBOX_UPDATE, {
    sceneId: scene?.id ?? null,
    targetUserId,
    ...overlay.getState()
  });
}

function broadcastClear() {
  const targetUserId = getVttUserId();
  if (!targetUserId) return;
  emit(MSG.VIEWBOX_CLEAR, { targetUserId });
}

export function isEnabled() {
  return enabled;
}

export async function enableViewbox() {
  if (enabled) return;
  if (!canvas?.ready || !game.user.isGM) return;
  const scene = canvas.scene;
  if (!scene) return;

  const stored = readFlag();
  const data = stored ?? defaultViewbox(scene);

  overlay = new ViewboxOverlay({
    ...data,
    onChange: async (next) => {
      await writeFlag(next);
      broadcastCurrent();
    }
  });
  canvas.stage.addChild(overlay);

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

/** Called on scene change — tear down the overlay; toolbar state persists. */
export function onCanvasTeardown() {
  if (!overlay) return;
  try {
    canvas.stage.removeChild(overlay);
    overlay.destroy();
  } catch (_) {}
  overlay = null;
  // Keep `enabled` flag — auto re-create on canvasReady if user had it on
}

export async function onCanvasReady() {
  if (!enabled) return; // user hasn't toggled on
  if (!game.user.isGM) return;
  // Re-create overlay for the new scene
  const scene = canvas.scene;
  if (!scene) return;
  const stored = readFlag();
  const data = stored ?? defaultViewbox(scene);
  overlay = new ViewboxOverlay({
    ...data,
    onChange: async (next) => {
      await writeFlag(next);
      broadcastCurrent();
    }
  });
  canvas.stage.addChild(overlay);
  if (!stored) await writeFlag(data);
  broadcastCurrent();
}

/** VTT-side: apply incoming viewbox as pan+scale. */
export function handleIncomingViewbox(msg) {
  const { type, payload, senderId } = msg;
  if (payload?.targetUserId && payload.targetUserId !== game.user.id) return;
  if (senderId === game.user.id) return;
  if (!canvas?.ready) return;

  if (type === MSG.VIEWBOX_UPDATE) {
    if (payload.sceneId && canvas.scene?.id !== payload.sceneId) return;
    const scale = Math.min(
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
    // No-op for now — VTT keeps its last framed view.
    log('Viewbox cleared by GM');
  }
}
