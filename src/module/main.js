import { MODULE_ID, SOCKET_NAME } from './socket-protocol.js';
import { registerSettings } from './settings.js';
import { registerSceneControls } from './gm-toolbar.js';
import { handleIncomingViewport } from './viewport-controller.js';

Hooks.once('init', () => {
  console.log(`[${MODULE_ID}] init`);
  registerSettings();
  registerSceneControls();
});

Hooks.once('ready', () => {
  console.log(`[${MODULE_ID}] ready — user=${game.user?.name} gm=${game.user?.isGM}`);

  game.socket.on(SOCKET_NAME, (msg) => {
    try {
      handleIncomingViewport(msg);
    } catch (e) {
      console.error(`[${MODULE_ID}] socket handler error`, e);
    }
  });
});
