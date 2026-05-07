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
  onDrawNote,
  onRefreshNote,
  onHoverNote,
  handleNoteHover,
  reapplyAllNoteLabels,
  onCanvasReady as onNoteLabelsCanvasReady
} from './note-labels.js';
import {
  onRenderJournalPageSheet as onRenderEmbedPageSheet,
  handleEmbedOpen,
  handleEmbedClose,
  handleEmbedReload
} from './embed-url.js';
import {
  onCanvasReady as onHideGmCursorCanvasReady,
  onSettingChange as onHideGmCursorSettingChange,
  installCursorPatches
} from './hide-gm-cursor.js';
import {
  onPreCreateToken,
  onDrawToken,
  onRefreshToken,
  onUpdateToken,
  onRenderTokenHUD,
  onCanvasReady as onVttTokenHideCanvasReady,
  reapplyAll as reapplyVttTokenHide
} from './vtt-token-hide.js';
import {
  registerBrushSettings as registerFogBrushSettings,
  onCanvasTeardown as onFogBrushCanvasTeardown,
  onPreUpdateTableModeToken,
  migrateActorsToFolder
} from './fog-brush.js';

const UI_SETTING_KEYS = new Set(['hideUi', 'vttUserId', 'preserveSelectors']);
const GM_CURSOR_SETTING_KEYS = new Set(['hideGmCursor', 'vttUserId']);
const VTT_TOKEN_HIDE_SETTING_KEYS = new Set(['vttUserId']);
const NOTE_LABELS_SETTING_KEYS = new Set(['noteLabelsMode', 'vttUserId']);

Hooks.once('init', () => {
  console.log(`[${MODULE_ID}] init`);
  registerSceneControls();
  installNoteHud();
  installCursorPatches();
});

Hooks.once('ready', () => {
  registerSettings();
  registerFogBrushSettings();
  migrateActorsToFolder().catch((e) => console.warn(`[${MODULE_ID}] migrateActorsToFolder`, e));
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
        case MSG.NOTE_HOVER:
          handleNoteHover(msg); break;
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

  // Re-sweep token visibility now that settings are registered. canvasReady
  // can fire before this hook, in which case the early reapplyAll() bailed
  // out (settings reads throw before ready). Catch up here.
  reapplyVttTokenHide();
  reapplyAllNoteLabels();
});

Hooks.on('updateSetting', (setting) => {
  const key = setting?.key ?? '';
  if (!key.startsWith(`${MODULE_ID}.`)) return;
  const shortKey = key.slice(`${MODULE_ID}.`.length);
  if (shortKey === 'vttAspect') applyAspectNow();
  if (UI_SETTING_KEYS.has(shortKey)) applyUiCleanup();
  if (GM_CURSOR_SETTING_KEYS.has(shortKey)) onHideGmCursorSettingChange();
  if (VTT_TOKEN_HIDE_SETTING_KEYS.has(shortKey)) reapplyVttTokenHide();
  if (NOTE_LABELS_SETTING_KEYS.has(shortKey)) reapplyAllNoteLabels();
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

// VTT Token Hide — default-on-create + per-token HUD button + sprite hiding on VTT
Hooks.on('preCreateToken', onPreCreateToken);
Hooks.on('renderTokenHUD', onRenderTokenHUD);
Hooks.on('drawToken', onDrawToken);
Hooks.on('refreshToken', onRefreshToken);
Hooks.on('updateToken', onUpdateToken);

// Suppress animation for fog-brush + party-marker tokens on user-drag
Hooks.on('preUpdateToken', onPreUpdateTableModeToken);

// Map note labels — force visible on the VTT client per noteLabelsMode setting
Hooks.on('drawNote', onDrawNote);
Hooks.on('refreshNote', onRefreshNote);
// GM-side hover broadcast — drives the on-gm-hover mode
Hooks.on('hoverNote', onHoverNote);

Hooks.on('canvasReady', () => {
  onViewboxCanvasReady().catch((e) => console.error(`[${MODULE_ID}] canvasReady error`, e));
  onNoteHudCanvasReady();
  onHideGmCursorCanvasReady();
  onVttTokenHideCanvasReady();
  onNoteLabelsCanvasReady();
  // Re-run UI cleanup so the preserve-aware ancestor unhide picks up
  // third-party modules (Combat Tracker Dock, etc.) that inject their DOM
  // after our `ready` hook fires. Idempotent.
  applyUiCleanup();
});

// Combat lifecycle — third-party trackers (e.g. Combat Tracker Dock) often
// only inject their DOM when combat starts. Re-run cleanup so preserve-aware
// ancestor unhide can find the new elements.
Hooks.on('combatStart', applyUiCleanup);
Hooks.on('createCombatant', applyUiCleanup);
Hooks.on('deleteCombatant', applyUiCleanup);
Hooks.on('deleteCombat', applyUiCleanup);

Hooks.on('canvasTearDown', () => {
  onViewboxCanvasTeardown();
  onFogBrushCanvasTeardown();
});
