import { MODULE_ID, SOCKET_NAME, MSG } from './socket-protocol.js';
import { getVttUserId } from './settings.js';
import { toggleEmbedOnVtt, isEmbedActive } from './embed-url.js';

/**
 * GM-side: Map<journalId, { pageId?, anchor?, elevation? }>
 * `elevation` carries { page, userId, prev } if we temporarily granted the
 * VTT user OBSERVER on a page so the sheet could render content. We revert
 * on close so HUD-toggled note visibility stays consistent across users.
 */
const openOnVtt = new Map();

/** VTT-side: Map<journalId, Application> */
const vttOpenApps = new Map();

const OBSERVER = 2; // CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER

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

/**
 * GM-side: grant VTT user OBSERVER on a specific page so the journal sheet
 * can render its content. Returns { page, userId, prev } so we can revert
 * the exact prior state — even if it was "no explicit value" (undefined).
 *
 * Page-level (not journal-level) because dnd5e's atomic-page model stores
 * `ownership.default = 0` explicitly on each page, which blocks inheritance
 * from journal-level grants. Page-level explicit user grant is the only
 * cascade that reliably reaches the user.
 */
async function elevatePagePermission(page, userId) {
  if (!page || !userId) return null;
  const targetUser = game.users.get(userId);
  if (!targetUser) return null;
  // Skip if already OBSERVER+
  if (page.testUserPermission?.(targetUser, 'OBSERVER')) return null;
  const prev = page.ownership?.[userId];
  try {
    await page.update({ [`ownership.${userId}`]: OBSERVER });
    return { page, userId, prev };
  } catch (e) {
    console.warn(`[${MODULE_ID}] elevatePagePermission failed`, e);
    return null;
  }
}

async function revertPagePermission(elevation) {
  if (!elevation) return;
  const { page, userId, prev } = elevation;
  // Page may have been deleted between elevate and revert — guard with try/catch
  try {
    const update = (prev === undefined)
      ? { [`ownership.-=${userId}`]: null }
      : { [`ownership.${userId}`]: prev };
    await page.update(update);
  } catch (e) {
    console.warn(`[${MODULE_ID}] revertPagePermission failed`, e);
  }
}

export async function toggleJournalOnVtt(journalId, pageId, anchor) {
  if (!game.user.isGM) return;
  const targetUserId = getVttUserId();
  if (!targetUserId) {
    ui.notifications.warn(t('TABLE_MODE.Notifications.NoVttUser'));
    return;
  }

  if (openOnVtt.has(journalId)) {
    // Close path — emit close, then revert any elevation we did on open.
    const state = openOnVtt.get(journalId);
    emit(MSG.JOURNAL_CLOSE, { journalId, targetUserId });
    openOnVtt.delete(journalId);
    if (state?.elevation) await revertPagePermission(state.elevation);
    log('Hide on VTT →', journalId);
  } else {
    // Open path. First, elevate VTT user permission on the target page so
    // the sheet can render content. Then compute pageIndex, emit the socket
    // open message, and remember the elevation for revert-on-close.
    const journal = game.journal?.get(journalId);
    const page = (pageId && journal) ? journal.pages?.get(pageId) : null;
    const elevation = page ? await elevatePagePermission(page, targetUserId) : null;

    let pageIndex = 0;
    if (pageId && journal) {
      const sorted = [...(journal.pages?.contents ?? [])]
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
      const idx = sorted.findIndex(p => p.id === pageId);
      if (idx >= 0) pageIndex = idx;
    }

    emit(MSG.JOURNAL_OPEN, { journalId, pageId, pageIndex, anchor, targetUserId });
    openOnVtt.set(journalId, { pageId, anchor, elevation });
    log('Show on VTT →', journalId, pageId ?? '(default)',
        `(index: ${pageIndex}${elevation ? ', elevated' : ''})`,
        anchor ? `#${anchor}` : '');
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

/** GM-side: VTT closed the sheet. Revert elevation we set on open. */
export async function handleJournalState(msg) {
  if (!game.user.isGM) return;
  const { payload, senderId } = msg;
  if (senderId === game.user.id) return;
  if (payload.open !== false) return;
  if (!openOnVtt.has(payload.journalId)) return;
  const state = openOnVtt.get(payload.journalId);
  openOnVtt.delete(payload.journalId);
  if (state?.elevation) await revertPagePermission(state.elevation);
  refreshButtonsFor(payload.journalId);
  log('VTT reported journal closed', payload.journalId);
}

/**
 * VTT-side: render the requested journal with the right page + anchor.
 *
 * The GM has already elevated this user's permission on the target page
 * (see `elevatePagePermission` above). We therefore render with normal
 * options — no `tempOwnership`, no DOM scroll fallbacks. Atomic single-page
 * journals render the only page directly; system subclasses that quirk on
 * multi-page navigation are no longer hit.
 */
export async function handleJournalOpen(msg) {
  const { payload, senderId } = msg;
  if (payload?.targetUserId && payload.targetUserId !== game.user.id) return;
  if (senderId === game.user.id) return;

  const journal = game.journal?.get(payload.journalId);
  if (!journal) return;

  try {
    const sheet = journal.sheet;
    await sheet.render(true, {
      mode: 1,
      pageId: payload.pageId ?? undefined,
      pageIndex: Number.isInteger(payload.pageIndex) ? payload.pageIndex : 0,
      anchor: payload.anchor ?? undefined
    });
    vttOpenApps.set(payload.journalId, sheet);

    if (payload.pageId && typeof sheet.goToPage === 'function') {
      try {
        await sheet.goToPage(payload.pageId, { anchor: payload.anchor ?? undefined });
      } catch (e) {
        console.warn(`[${MODULE_ID}] goToPage post-render failed`, e);
      }
    }

    log('Journal opened on VTT', payload.journalId,
        payload.pageId ?? '(default)',
        `(index: ${payload.pageIndex ?? 0})`,
        payload.anchor ? `#${payload.anchor}` : '');
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
