import { MODULE_ID, SOCKET_NAME, MSG } from './socket-protocol.js';
import { getVttUserId } from './settings.js';
import { toggleEmbedOnVtt, isEmbedActive } from './embed-url.js';

/** GM-side: Map<journalId, { pageId?, anchor? }> — journals currently open on VTT */
const openOnVtt = new Map();

/** VTT-side: Map<journalId, Application> */
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

/**
 * Resolve the currently-displayed { pageId, anchor } on a V13 journal sheet.
 * The sheet's TOC (`app._pages` / `app.pageIndex`) can include both pages and
 * heading-anchors within pages. Each TOC entry carries a pageId + optional anchor.
 */
function currentPageInfo(app) {
  const empty = { pageId: null, anchor: null };
  if (!app) return empty;

  if (Array.isArray(app._pages) && Number.isInteger(app.pageIndex)) {
    const entry = app._pages[app.pageIndex];
    if (entry) {
      const pageId = entry.pageId ?? entry.id;
      if (pageId && app.document?.pages?.get(pageId)) {
        return { pageId, anchor: entry.anchor ?? null };
      }
    }
  }

  const directId = app.pageId ?? app._pageId;
  if (directId && app.document?.pages?.get(directId)) {
    return { pageId: directId, anchor: null };
  }

  const firstPage = app.document?.pages?.contents?.[0]?.id;
  return { pageId: firstPage ?? null, anchor: null };
}

export async function toggleJournalOnVtt(journalId, pageId, anchor) {
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
    emit(MSG.JOURNAL_OPEN, { journalId, pageId, anchor, targetUserId });
    openOnVtt.set(journalId, { pageId, anchor });
    log('Show on VTT →', journalId, pageId ?? '(default)', anchor ? `#${anchor}` : '');
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

/** GM-side: inject the TV toggle button into journal sheet headers. */
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
  const label = t('TABLE_MODE.Journal.Toggle');
  btn.title = label;
  btn.setAttribute('data-tooltip', label);
  if (isOpen) btn.style.color = '#ffc107';
  btn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const { pageId, anchor } = currentPageInfo(app);
    // If current page has an embed URL, route to iframe push instead of journal-sheet push
    const page = pageId ? doc.pages?.get(pageId) : null;
    const embedUrl = page?.getFlag?.(MODULE_ID, 'embedUrl') || page?.flags?.[MODULE_ID]?.embedUrl;
    if (embedUrl) {
      toggleEmbedOnVtt(page);
      return;
    }
    toggleJournalOnVtt(doc.id, pageId, anchor);
  });

  const closeBtn = header.querySelector('.header-control[data-action="close"], .close, [data-tooltip="Close"]');
  if (closeBtn) header.insertBefore(btn, closeBtn);
  else header.appendChild(btn);
}

/** VTT-side: when user manually closes a pushed sheet, notify GM so button state flips. */
export function onVttJournalClose(app) {
  if (game.user.isGM) return;
  if (game.user.id !== getVttUserId()) return;
  const doc = asJournal(app);
  if (!doc) return;
  if (!vttOpenApps.has(doc.id)) return;
  vttOpenApps.delete(doc.id);
  emit(MSG.JOURNAL_STATE, { journalId: doc.id, open: false });
  log('VTT closed journal manually', doc.id);
}

export function onVttJournalRender(app) {
  if (game.user.isGM) return;
  if (game.user.id !== getVttUserId()) return;
  const doc = asJournal(app);
  if (!doc) return;
  vttOpenApps.set(doc.id, app);
}

export function handleJournalState(msg) {
  if (!game.user.isGM) return;
  const { payload, senderId } = msg;
  if (senderId === game.user.id) return;
  if (payload.open !== false) return;
  if (!openOnVtt.has(payload.journalId)) return;
  openOnVtt.delete(payload.journalId);
  refreshButtonsFor(payload.journalId);
  log('VTT reported journal closed', payload.journalId);
}

/**
 * VTT-side: render the requested journal with the right page + anchor.
 * V13's JournalSheet render() accepts `mode`, `pageId`, `anchor`, `tempOwnership`.
 * `tempOwnership: true` lets Foundry grant observer access for this render without
 * persisting an ownership change on the document.
 */
export function handleJournalOpen(msg) {
  const { payload, senderId } = msg;
  if (payload?.targetUserId && payload.targetUserId !== game.user.id) return;
  if (senderId === game.user.id) return;

  const journal = game.journal?.get(payload.journalId);
  if (!journal) return;

  try {
    const sheet = journal.sheet;
    sheet.render(true, {
      mode: 1, // single-page view
      pageId: payload.pageId ?? undefined,
      anchor: payload.anchor ?? undefined,
      tempOwnership: true
    });
    vttOpenApps.set(payload.journalId, sheet);

    // Safety retry: if the render raced TOC init, re-navigate after layout settles.
    if (payload.pageId && typeof sheet.goToPage === 'function') {
      setTimeout(() => {
        try { sheet.goToPage(payload.pageId, { anchor: payload.anchor ?? undefined }); } catch (_) {}
      }, 200);
    }

    log('Journal opened on VTT', payload.journalId, payload.pageId ?? '(default)', payload.anchor ? `#${payload.anchor}` : '');
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
