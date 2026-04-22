import { MODULE_ID, SOCKET_NAME, MSG } from './socket-protocol.js';
import { getVttUserId } from './settings.js';

/** GM-side: Map<journalId, { pageId?, prevOwnership? }> */
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

function sortedPages(doc) {
  return [...(doc?.pages?.contents ?? [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}

/**
 * Resolve the currently-displayed { pageId, anchor } on a V13 journal sheet.
 * The sheet sidebar can include both pages AND heading-anchors within pages.
 * `app.pageIndex` indexes into `app._pages` (TOC entries), not document.pages.
 */
function currentPageInfo(app) {
  const empty = { pageId: null, anchor: null };
  if (!app) return empty;

  // V13 pattern: _pages is array of TOC entries with {pageId, anchor, ...}
  if (Array.isArray(app._pages) && Number.isInteger(app.pageIndex)) {
    const entry = app._pages[app.pageIndex];
    if (entry) {
      const pageId = entry.pageId ?? entry.id;
      if (pageId && app.document?.pages?.get(pageId)) {
        return { pageId, anchor: entry.anchor ?? null };
      }
    }
  }

  // Some sheets expose _pages as keyed object (alt V13 variant)
  if (app._pages && typeof app._pages === 'object' && !Array.isArray(app._pages)) {
    const current = app._pages.current ?? null;
    if (current) {
      const pageId = current.pageId ?? current.id;
      if (pageId && app.document?.pages?.get(pageId)) {
        return { pageId, anchor: current.anchor ?? null };
      }
    }
  }

  // Direct properties (older or other variants)
  const directId = app.pageId ?? app._pageId;
  if (directId && app.document?.pages?.get(directId)) {
    return { pageId: directId, anchor: null };
  }

  // pageIndex against sorted document.pages (best-effort fallback)
  const pages = sortedPages(app.document);
  if (Number.isInteger(app.pageIndex) && pages[app.pageIndex]) {
    return { pageId: pages[app.pageIndex].id, anchor: null };
  }

  return { pageId: pages[0]?.id ?? null, anchor: null };
}

const OBSERVER = 2; // CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER

async function elevateOwnership(journal, userId) {
  const ownership = journal.ownership ?? {};
  const explicit = ownership[userId];
  const effective = explicit ?? ownership.default ?? 0;
  if (effective >= OBSERVER) return { changed: false };
  await journal.update({ [`ownership.${userId}`]: OBSERVER });
  log(`Elevated ${userId} to Observer on journal ${journal.id} (was ${explicit ?? 'inherit'})`);
  return { changed: true, prev: explicit }; // prev is the explicit value (may be undefined)
}

async function revertOwnership(journal, userId, prev) {
  const update = {};
  if (prev === undefined) {
    // Remove explicit entry — revert to inherited default
    update[`ownership.-=${userId}`] = null;
  } else {
    update[`ownership.${userId}`] = prev;
  }
  try {
    await journal.update(update);
    log(`Reverted ownership for ${userId} on journal ${journal.id}`);
  } catch (e) {
    console.warn(`[${MODULE_ID}] revertOwnership failed`, e);
  }
}

export async function toggleJournalOnVtt(journalId, pageId, anchor) {
  if (!game.user.isGM) return;
  const targetUserId = getVttUserId();
  if (!targetUserId) {
    ui.notifications.warn(t('TABLE_MODE.Notifications.NoVttUser'));
    return;
  }
  const journal = game.journal?.get(journalId);
  if (!journal) return;

  if (openOnVtt.has(journalId)) {
    const state = openOnVtt.get(journalId);
    emit(MSG.JOURNAL_CLOSE, { journalId, targetUserId });
    openOnVtt.delete(journalId);
    if (state.elevated) {
      await revertOwnership(journal, targetUserId, state.prevOwnership);
    }
    log('Hide on VTT →', journalId);
  } else {
    const elevation = await elevateOwnership(journal, targetUserId);
    emit(MSG.JOURNAL_OPEN, { journalId, pageId, anchor, targetUserId });
    openOnVtt.set(journalId, {
      pageId, anchor,
      elevated: elevation.changed,
      prevOwnership: elevation.prev
    });
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
    toggleJournalOnVtt(doc.id, pageId, anchor);
  });

  const closeBtn = header.querySelector('.header-control[data-action="close"], .close, [data-tooltip="Close"]');
  if (closeBtn) header.insertBefore(btn, closeBtn);
  else header.appendChild(btn);
}

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

export async function handleJournalState(msg) {
  if (!game.user.isGM) return;
  const { payload, senderId } = msg;
  if (senderId === game.user.id) return;
  if (payload.open !== false) return;
  const state = openOnVtt.get(payload.journalId);
  if (!state) return;
  openOnVtt.delete(payload.journalId);
  refreshButtonsFor(payload.journalId);
  // Revert permission if we elevated
  if (state.elevated) {
    const journal = game.journal?.get(payload.journalId);
    if (journal) await revertOwnership(journal, getVttUserId(), state.prevOwnership);
  }
  log('VTT reported journal closed', payload.journalId);
}

export async function handleJournalOpen(msg) {
  const { payload, senderId } = msg;
  if (payload?.targetUserId && payload.targetUserId !== game.user.id) return;
  if (senderId === game.user.id) return;

  // Give the ownership update a moment to land if it's still in-flight
  const journal = game.journal?.get(payload.journalId);
  if (!journal) return;

  try {
    const sheet = journal.sheet;

    // Render in single-page mode. Do NOT pass pageIndex — subclasses interpret it inconsistently
    // (sort-order vs creation-order). Rely on pageId + goToPage instead.
    const opts = { mode: 1 };
    if (payload.pageId) opts.pageId = payload.pageId;

    sheet.render(true, opts);
    vttOpenApps.set(payload.journalId, sheet);

    if (payload.pageId && typeof sheet.goToPage === 'function') {
      const nav = () => {
        try { sheet.goToPage(payload.pageId, payload.anchor ?? undefined); } catch (_) {}
      };
      setTimeout(nav, 150);
      setTimeout(nav, 500);
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
