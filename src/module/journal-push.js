import { MODULE_ID, SOCKET_NAME, MSG } from './socket-protocol.js';
import { getVttUserId } from './settings.js';

/** GM-side: set of journal IDs currently open on VTT. */
const openOnVtt = new Set();

/** VTT-side: map journalId → opened Application instance so we can close it. */
const vttOpenApps = new Map();

function log(...args) { console.log(`[${MODULE_ID}]`, ...args); }

function emit(type, payload) {
  game.socket.emit(SOCKET_NAME, { type, payload, senderId: game.user.id });
}

function t(key) { return game.i18n.localize(key); }

function currentJournalSheet(app) {
  // Support both old (app.object) and new ApplicationV2 (app.document) shapes
  const doc = app?.document ?? app?.object;
  return doc?.documentName === 'JournalEntry' ? doc : null;
}

export function toggleJournalOnVtt(journalId) {
  if (!game.user.isGM) return;
  const targetUserId = getVttUserId();
  if (!targetUserId) {
    ui.notifications.warn(t('TABLE_MODE.Notifications.NoVttUser'));
    return;
  }
  if (openOnVtt.has(journalId)) {
    emit(MSG.JOURNAL_CLOSE, { journalId, targetUserId });
    openOnVtt.delete(journalId);
    log('Close on VTT →', journalId);
  } else {
    emit(MSG.JOURNAL_OPEN, { journalId, targetUserId });
    openOnVtt.add(journalId);
    log('Open on VTT →', journalId);
  }
  refreshButtonsFor(journalId);
}

function refreshButtonsFor(journalId) {
  // Re-render any open journal sheets for this journal so button state updates.
  for (const app of Object.values(ui.windows ?? {})) {
    const doc = currentJournalSheet(app);
    if (doc?.id === journalId && typeof app.render === 'function') {
      app.render(false);
    }
  }
}

/** Called by hook when any journal sheet renders. Adds GM header button. */
export function onRenderJournalSheet(app, html) {
  if (!game.user.isGM) return;
  const doc = currentJournalSheet(app);
  if (!doc) return;

  const root = html?.jquery ? html[0] : html;
  if (!root?.querySelector) return;

  // Avoid double-injection
  if (root.querySelector(`[data-${MODULE_ID}-btn]`)) return;

  const header = root.querySelector('.window-header');
  if (!header) return;

  const isOpen = openOnVtt.has(doc.id);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute(`data-${MODULE_ID}-btn`, 'journal');
  btn.className = 'header-control icon fa-solid ' + (isOpen ? 'fa-tv-alt' : 'fa-tv');
  btn.style.cssText = 'background: transparent; border: none; cursor: pointer; padding: 0 6px; color: inherit; font-size: inherit;';
  btn.title = isOpen ? t('TABLE_MODE.Journal.Close') : t('TABLE_MODE.Journal.Push');
  btn.setAttribute('data-tooltip', btn.title);
  if (isOpen) btn.style.color = '#ffc107';
  btn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    toggleJournalOnVtt(doc.id);
  });

  // Insert before the close button (last .header-control)
  const closeBtn = header.querySelector('.header-control[data-action="close"], .close, [data-tooltip="Close"]');
  if (closeBtn) header.insertBefore(btn, closeBtn);
  else header.appendChild(btn);
}

/** VTT-side handlers */

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
    log('Journal opened on VTT', payload.journalId);
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
    try { app.close(); } catch (_) {}
    vttOpenApps.delete(payload.journalId);
  } else {
    // Fallback — search open windows for this journal
    const journal = game.journal?.get(payload.journalId);
    if (journal?.sheet?.rendered) journal.sheet.close();
  }
  log('Journal closed on VTT', payload.journalId);
}
