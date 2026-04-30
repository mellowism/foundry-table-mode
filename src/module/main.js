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
import { applyUiCleanup } from './vtt-ui-cleanup.js';
import { handleIncomingReload } from './client-actions.js';
import {
  onRenderJournalSheet,
  onVttJournalClose,
  onVttJournalRender,
  handleJournalOpen,
  handleJournalClose,
  handleJournalState
} from './journal-push.js';
import { installNoteHud, onCanvasReady as onNoteHudCanvasReady } from './note-hud.js';
import {
  onRenderJournalPageSheet as onRenderEmbedPageSheet,
  handleEmbedOpen,
  handleEmbedClose,
  handleEmbedReload
} from './embed-url.js';

const UI_SETTING_KEYS = new Set(['hideUi', 'vttUserId']);

Hooks.once('init', () => {
  console.log(`[${MODULE_ID}] init`);
  registerSceneControls();
  installNoteHud();
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
        case MSG.CLIENT_RELOAD:
          handleIncomingReload(msg); break;
        case MSG.JOURNAL_OPEN:
          handleJournalOpen(msg); break;
        case MSG.JOURNAL_CLOSE:
          handleJournalClose(msg); break;
        case MSG.JOURNAL_STATE:
          handleJournalState(msg); break;
        case MSG.EMBED_OPEN:
          handleEmbedOpen(msg); break;
        case MSG.EMBED_CLOSE:
          handleEmbedClose(msg); break;
        case MSG.EMBED_RELOAD:
          handleEmbedReload(msg); break;
      }
    } catch (e) {
      console.error(`[${MODULE_ID}] socket handler error`, e);
    }
  });

  if (!game.user.isGM && game.user.id === getVttUserId()) {
    announceClientAspect();
    window.addEventListener('resize', () => announceClientAspect());
  }

  applyUiCleanup();
});

Hooks.on('updateSetting', (setting) => {
  const key = setting?.key ?? '';
  if (!key.startsWith(`${MODULE_ID}.`)) return;
  const shortKey = key.slice(`${MODULE_ID}.`.length);
  if (shortKey === 'vttAspect') applyAspectNow();
  if (UI_SETTING_KEYS.has(shortKey)) applyUiCleanup();
});

// Journal header button — inject on render. Try several hook names for V13 variants.
Hooks.on('renderJournalSheet', (app, html) => {
  onRenderJournalSheet(app, html);
  onVttJournalRender(app);
});
Hooks.on('renderJournalEntrySheet', (app, html) => {
  onRenderJournalSheet(app, html);
  onVttJournalRender(app);
});
Hooks.on('renderJournalPageSheet', onRenderJournalSheet);

// Page-sheet UI: inject "TV Embed URL" field on text page sheets
Hooks.on('renderJournalTextPageSheet', onRenderEmbedPageSheet);
Hooks.on('renderJournalPageSheet', onRenderEmbedPageSheet);
Hooks.on('renderJournalEntryPageSheet', onRenderEmbedPageSheet);

// VTT-side: detect user-initiated close so we can notify GM
Hooks.on('closeJournalSheet', onVttJournalClose);
Hooks.on('closeJournalEntrySheet', onVttJournalClose);

Hooks.on('canvasReady', () => {
  onViewboxCanvasReady().catch((e) => console.error(`[${MODULE_ID}] canvasReady error`, e));
  onNoteHudCanvasReady();
});

Hooks.on('canvasTearDown', () => {
  onViewboxCanvasTeardown();
});
