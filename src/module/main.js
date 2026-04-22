import { MODULE_ID, SOCKET_NAME, MSG } from './socket-protocol.js';
import { registerSettings, getVttUserId } from './settings.js';
import { registerSceneControls } from './gm-toolbar.js';
import { handleIncomingViewport } from './viewport-controller.js';
import {
  handleIncomingViewbox,
  handleClientHello,
  announceClientAspect,
  applyAspectNow,
  onCanvasReady as onViewboxCanvasReady,
  onCanvasTeardown as onViewboxCanvasTeardown
} from './viewbox-controller.js';

Hooks.once('init', () => {
  console.log(`[${MODULE_ID}] init`);
  registerSceneControls();
});

Hooks.once('ready', () => {
  registerSettings();
  console.log(`[${MODULE_ID}] ready — user=${game.user?.name} gm=${game.user?.isGM}`);

  game.socket.on(SOCKET_NAME, (msg) => {
    try {
      switch (msg.type) {
        case MSG.VIEWPORT_SYNC:
          handleIncomingViewport(msg); break;
        case MSG.VIEWBOX_UPDATE:
        case MSG.VIEWBOX_CLEAR:
          handleIncomingViewbox(msg); break;
        case MSG.CLIENT_HELLO:
          handleClientHello(msg); break;
      }
    } catch (e) {
      console.error(`[${MODULE_ID}] socket handler error`, e);
    }
  });

  // If this user is the designated VTT user, announce aspect to GM
  if (!game.user.isGM && game.user.id === getVttUserId()) {
    announceClientAspect();
    window.addEventListener('resize', () => announceClientAspect());
  }
});

Hooks.on('updateSetting', (setting) => {
  if (setting?.key === `${MODULE_ID}.vttAspect`) {
    applyAspectNow();
  }
});

Hooks.on('canvasReady', () => {
  onViewboxCanvasReady().catch((e) => console.error(`[${MODULE_ID}] canvasReady error`, e));
});

Hooks.on('canvasTearDown', () => {
  onViewboxCanvasTeardown();
});
