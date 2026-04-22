import { MODULE_ID, SOCKET_NAME, MSG } from './socket-protocol.js';
import { registerSettings } from './settings.js';
import { registerSceneControls } from './gm-toolbar.js';
import { handleIncomingViewport } from './viewport-controller.js';
import {
  handleIncomingViewbox,
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
      if (msg.type === MSG.VIEWPORT_SYNC) handleIncomingViewport(msg);
      else if (msg.type === MSG.VIEWBOX_UPDATE || msg.type === MSG.VIEWBOX_CLEAR) handleIncomingViewbox(msg);
    } catch (e) {
      console.error(`[${MODULE_ID}] socket handler error`, e);
    }
  });
});

Hooks.on('canvasReady', () => {
  onViewboxCanvasReady().catch((e) => console.error(`[${MODULE_ID}] canvasReady error`, e));
});

Hooks.on('canvasTearDown', () => {
  onViewboxCanvasTeardown();
});
