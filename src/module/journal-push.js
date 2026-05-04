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
    // Pre-compute pageIndex against sort-ordered pages so the VTT side has
    // a deterministic UI-order index alongside the pageId.
    let pageIndex = 0;
    if (pageId) {
      const journal = game.journal?.get(journalId);
      if (journal) {
        const sorted = [...(journal.pages?.contents ?? [])]
          .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
        const idx = sorted.findIndex(p => p.id === pageId);
        if (idx >= 0) pageIndex = idx;
      }
    }
    emit(MSG.JOURNAL_OPEN, { journalId, pageId, pageIndex, anchor, targetUserId });
    openOnVtt.set(journalId, { pageId, anchor });
    log('Show on VTT →', journalId, pageId ?? '(default)', `(index: ${pageIndex})`, anchor ? `#${anchor}` : '');
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
 * V13's JournalSheet render() accepts `mode`, `pageId`, `pageIndex`, `anchor`, `tempOwnership`.
 * `tempOwnership: true` lets Foundry grant observer access for this render without
 * persisting an ownership change on the document.
 *
 * `sheet.render()` is async — we await it so the TOC is built before calling
 * `goToPage`. This is more reliable than a setTimeout race against TOC init,
 * which previously caused the sheet to land on the first page when system
 * subclasses (e.g. dnd5e JournalEntrySheet5e) ignored the `pageId` render option.
 */
export async function handleJournalOpen(msg) {
  const { payload, senderId } = msg;
  if (payload?.targetUserId && payload.targetUserId !== game.user.id) return;
  if (senderId === game.user.id) return;

  const journal = game.journal?.get(payload.journalId);
  if (!journal) return;

  // Resolve a sort-ordered pageIndex as a fallback, in case the GM didn't send one
  // (older clients) or the value was lost in transit.
  let pageIndex = Number.isInteger(payload.pageIndex) ? payload.pageIndex : 0;
  if (payload.pageId && !Number.isInteger(payload.pageIndex)) {
    const sorted = [...(journal.pages?.contents ?? [])]
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    const idx = sorted.findIndex(p => p.id === payload.pageId);
    if (idx >= 0) pageIndex = idx;
  }

  try {
    const sheet = journal.sheet;
    await sheet.render(true, {
      mode: 1, // single-page view
      pageId: payload.pageId ?? undefined,
      pageIndex,
      anchor: payload.anchor ?? undefined,
      tempOwnership: true
    });
    vttOpenApps.set(payload.journalId, sheet);

    // Now that render has resolved, the TOC is populated — navigate explicitly.
    if (payload.pageId && typeof sheet.goToPage === 'function') {
      try {
        await sheet.goToPage(payload.pageId, { anchor: payload.anchor ?? undefined });
      } catch (e) {
        console.warn(`[${MODULE_ID}] goToPage post-render failed`, e);
      }
    }

    // Defence-in-depth: dnd5e's `JournalEntrySheet5e` ignores `mode: 1` and
    // renders the journal in multi-page scrollable mode. `goToPage` does not
    // always scroll the container in that layout. Explicit scrollIntoView on
    // the matching `[data-page-id]` element guarantees the right page is at
    // the top of the viewport. requestAnimationFrame ensures the DOM is
    // settled when we measure / scroll.
    if (payload.pageId) {
      requestAnimationFrame(() => {
        try {
          const root = sheet.element;
          if (!root) return;
          const sel = `[data-page-id="${payload.pageId}"]`;
          // Prefer the first match inside the journal content, not the TOC sidebar
          const target = root.querySelector(`.journal-entry-content ${sel}`)
                      ?? root.querySelector(`section${sel}`)
                      ?? root.querySelector(sel);
          if (target?.scrollIntoView) {
            target.scrollIntoView({ behavior: 'instant', block: 'start' });
          }
        } catch (e) {
          console.warn(`[${MODULE_ID}] scrollIntoView fallback failed`, e);
        }
      });
    }

    log('Journal opened on VTT', payload.journalId,
        payload.pageId ?? '(default)', `(index: ${pageIndex})`,
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
