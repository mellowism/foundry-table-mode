import { MODULE_ID, SOCKET_NAME, MSG } from './socket-protocol.js';
import { getVttUserId } from './settings.js';

/** GM-side: Map<journalId, { pageId? }> for journals currently open on VTT */
const openOnVtt = new Map();

/** VTT-side: map journalId → opened Application instance so we can close it. */
const vttOpenApps = new Map();

function log(...args) { console.log(`[${MODULE_ID}]`, ...args); }

function emit(type, payload) {
  game.socket.emit(SOCKET_NAME, { type, payload, senderId: game.user.id });
}

function t(key) { return game.i18n.localize(key); }

function asJournal(app) {
  const doc = app?.document ?? app?.object;
  return doc?.documentName === 'JournalEntry' ? doc : null;
}

/** Try several V13 APIs to find the currently-displayed page id. */
function currentPageId(app) {
  if (!app) return null;
  return app.pageIndex != null && app.document?.pages?.contents?.[app.pageIndex]?.id
    || app._pages?.current?.id
    || app._pageId
    || app.pageId
    || app.document?.pages?.contents?.[0]?.id
    || null;
}

export function toggleJournalOnVtt(journalId, pageId) {
  if (!game.user.isGM) return;
  const targetUserId = getVttUserId();
  if (!targetUserId) {
    ui.notifications.warn(t('TABLE_MODE.Notifications.NoVttUser'));
    return;
  }
  if (openOnVtt.has(journalId)) {
    emit(MSG.JOURNAL_CLOSE, { journalId, targetUserId });
    openOnVtt.delete(journalId);
    log('Hide on VTT →', journalId);
  } else {
    emit(MSG.JOURNAL_OPEN, { journalId, pageId, targetUserId });
    openOnVtt.set(journalId, { pageId });
    log('Show on VTT →', journalId, pageId ?? '(default page)');
  }
  refreshButtonsFor(journalId);
}

function refreshButtonsFor(journalId) {
  for (const app of Object.values(ui.windows ?? {})) {
    const doc = asJournal(app);
    if (doc?.id === journalId && typeof app.render === 'function') {
      app.render(false);
    }
  }
}

/** Called by hook when any journal sheet renders. GM-side button. */
export function onRenderJournalSheet(app, html) {
  if (!game.user.isGM) return;
  const doc = asJournal(app);
  if (!doc) return;

  const root = html?.jquery ? html[0] : html;
  if (!root?.querySelector) return;
  if (root.querySelector(`[data-${MODULE_ID}-btn]`)) return;

  const header = root.querySelector('.window-header');
  if (!header) return;

  const isOpen = openOnVtt.has(doc.id);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute(`data-${MODULE_ID}-btn`, 'journal');
  btn.className = 'header-control icon fa-solid fa-tv';
  btn.style.cssText = 'background: transparent; border: none; cursor: pointer; padding: 0 6px; color: inherit; font-size: inherit;';
  const label = isOpen ? t('TABLE_MODE.Journal.Hide') : t('TABLE_MODE.Journal.Show');
  btn.title = label;
  btn.setAttribute('data-tooltip', label);
  if (isOpen) btn.style.color = '#ffc107';
  btn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    toggleJournalOnVtt(doc.id, currentPageId(app));
  });

  const closeBtn = header.querySelector('.header-control[data-action="close"], .close, [data-tooltip="Close"]');
  if (closeBtn) header.insertBefore(btn, closeBtn);
  else header.appendChild(btn);
}

/** VTT-side: journal was closed (either via command or user action). Notify GM. */
export function onVttJournalClose(app) {
  if (game.user.isGM) return;
  if (game.user.id !== getVttUserId()) return;
  const doc = asJournal(app);
  if (!doc) return;
  if (!vttOpenApps.has(doc.id)) return; // Not ours; ignore
  vttOpenApps.delete(doc.id);
  emit(MSG.JOURNAL_STATE, { journalId: doc.id, open: false });
  log('VTT closed journal manually, notified GM', doc.id);
}

/** GM-side: receive state update from VTT. */
export function handleJournalState(msg) {
  if (!game.user.isGM) return;
  const { payload, senderId } = msg;
  if (senderId === game.user.id) return;
  if (payload.open === false) {
    if (openOnVtt.has(payload.journalId)) {
      openOnVtt.delete(payload.journalId);
      refreshButtonsFor(payload.journalId);
      log('VTT reported journal closed', payload.journalId);
    }
  }
}

/** VTT-side: open journal (optionally at a specific page) */
export function handleJournalOpen(msg) {
  const { payload, senderId } = msg;
  if (payload?.targetUserId && payload.targetUserId !== game.user.id) return;
  if (senderId === game.user.id) return;
  const journal = game.journal?.get(payload.journalId);
  if (!journal) return;
  try {
    const sheet = journal.sheet;
    sheet.render(true);
    vttOpenApps.set(payload.journalId, sheet);
    // Navigate to specific page if provided
    if (payload.pageId) {
      // Defer so render has begun
      setTimeout(() => {
        try {
          if (typeof sheet.goToPage === 'function') sheet.goToPage(payload.pageId);
          else if (typeof sheet.render === 'function') sheet.render(true, { pageId: payload.pageId });
        } catch (e) {
          console.warn(`[${MODULE_ID}] goToPage failed`, e);
        }
      }, 100);
    }
    log('Journal opened on VTT', payload.journalId, payload.pageId ?? '(default)');
  } catch (e) {
    console.warn(`[${MODULE_ID}] failed to open journal`, e);
  }
}

export function handleJournalClose(msg) {
  const { payload, senderId } = msg;
  if (payload?.targetUserId && payload.targetUserId !== game.user.id) return;
  if (senderId === game.user.id) return;
  const app = vttOpenApps.get(payload.journalId);
  if (app) {
    try { app.close({ fromTableMode: true }); } catch (_) {}
    vttOpenApps.delete(payload.journalId);
  } else {
    const journal = game.journal?.get(payload.journalId);
    if (journal?.sheet?.rendered) journal.sheet.close({ fromTableMode: true });
  }
  log('Journal closed on VTT', payload.journalId);
}
