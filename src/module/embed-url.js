import { MODULE_ID, SOCKET_NAME, MSG } from './socket-protocol.js';
import { getVttUserId } from './settings.js';

const FLAG_SCOPE = MODULE_ID;
const FLAG_KEY = 'embedUrl';

function emit(type, payload) {
  game.socket.emit(SOCKET_NAME, { type, payload, senderId: game.user.id });
}

function t(key) { return game.i18n.localize(key); }

function getEmbedUrl(page) {
  return page?.getFlag?.(FLAG_SCOPE, FLAG_KEY) || page?.flags?.[FLAG_SCOPE]?.[FLAG_KEY] || '';
}

/* =========================================================
 * GM-side state
 * ========================================================= */

let activeEmbed = null; // { pageId, url, title } | null

export function isEmbedActive(pageId) {
  return activeEmbed?.pageId === pageId;
}

export async function toggleEmbedOnVtt(page) {
  if (!game.user.isGM) return;
  const targetUserId = getVttUserId();
  if (!targetUserId) {
    ui.notifications.warn(t('TABLE_MODE.Notifications.NoVttUser'));
    return;
  }
  const url = getEmbedUrl(page);
  if (!url) {
    ui.notifications.warn(t('TABLE_MODE.EmbedUrl.NoUrlSet'));
    return;
  }
  if (activeEmbed?.pageId === page.id) {
    emit(MSG.EMBED_CLOSE, { pageId: page.id, targetUserId });
    activeEmbed = null;
    refreshSheets(page);
    return;
  }
  const title = page.name || page.parent?.name || 'Embed';
  emit(MSG.EMBED_OPEN, { pageId: page.id, url, title, targetUserId });
  activeEmbed = { pageId: page.id, url, title };
  refreshSheets(page);
}

export function reloadEmbedOnVtt() {
  if (!game.user.isGM) return;
  if (!activeEmbed) {
    ui.notifications.info(t('TABLE_MODE.EmbedUrl.NothingToReload'));
    return;
  }
  const targetUserId = getVttUserId();
  if (!targetUserId) return;
  emit(MSG.EMBED_RELOAD, { pageId: activeEmbed.pageId, targetUserId });
  ui.notifications.info(t('TABLE_MODE.EmbedUrl.Reloaded'));
}

function refreshSheets(page) {
  for (const app of Object.values(ui.windows ?? {})) {
    const doc = app?.document ?? app?.object;
    if (doc?.id === page?.id || doc?.id === page?.parent?.id) {
      try { app.render(false); } catch (_) {}
    }
  }
}

/* =========================================================
 * Page-sheet UI injection
 * ========================================================= */

export function onRenderJournalPageSheet(app, html) {
  if (!game.user.isGM) return;
  const page = app?.document;
  if (!page) return;
  if (page.type !== 'text') return;
  const root = html?.jquery ? html[0] : html;
  if (!root?.querySelector) return;
  if (root.querySelector(`[data-${MODULE_ID}-embed-url]`)) return;

  const form = root.querySelector('form') ?? root;
  const current = getEmbedUrl(page);

  const container = document.createElement('div');
  container.className = 'form-group table-mode-embed-url-section';
  container.setAttribute(`data-${MODULE_ID}-embed-url`, '1');
  container.innerHTML = `
    <label style="display:flex;align-items:center;gap:6px;">
      <i class="fas fa-tv" style="color:#ffc107"></i>
      ${t('TABLE_MODE.EmbedUrl.FieldLabel')}
    </label>
    <div class="form-fields">
      <input type="url" name="flags.${FLAG_SCOPE}.${FLAG_KEY}" value="${escapeAttr(current)}" placeholder="https://homebrewery.naturalcrit.com/share/..." style="flex:1"/>
    </div>
    <p class="hint">${t('TABLE_MODE.EmbedUrl.FieldHint')}</p>
  `;

  if (form.firstChild) form.insertBefore(container, form.firstChild);
  else form.appendChild(container);
}

function escapeAttr(s) {
  return String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

/* =========================================================
 * VTT-side: ApplicationV2 window with iframe
 * ========================================================= */

let EmbedFrameAppClass = null;
let activeApp = null;

function buildAppClass() {
  const { ApplicationV2 } = foundry.applications.api;

  class EmbedFrameApp extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id: `${MODULE_ID}-embed-frame`,
      classes: ['table-mode-embed-frame'],
      tag: 'section',
      window: {
        icon: 'fas fa-tv',
        resizable: true,
        contentClasses: ['table-mode-embed-frame-content']
      },
      position: {
        width: 900,
        height: 1100
      }
    };

    constructor(options = {}) {
      const { url, embedTitle, ...rest } = options;
      super(rest);
      this._url = url ?? '';
      this._title = embedTitle ?? t('TABLE_MODE.EmbedFrame.DefaultTitle');
    }

    get title() { return this._title; }

    setUrl(url, title) {
      this._url = url;
      if (title) this._title = title;
      if (this.rendered) this.render();
    }

    reload() {
      const iframe = this.element?.querySelector('iframe');
      if (!iframe) return;
      const src = iframe.src;
      iframe.src = 'about:blank';
      setTimeout(() => { iframe.src = src; }, 50);
    }

    async _renderHTML(_context, _options) {
      const safe = String(this._url || 'about:blank').replaceAll('"', '&quot;');
      return `<iframe class="table-mode-embed-iframe" src="${safe}" allow="fullscreen"></iframe>`;
    }

    _replaceHTML(html, content, _options) {
      content.innerHTML = html;
    }

    async _onClose(options) {
      if (activeApp === this) activeApp = null;
      return super._onClose?.(options);
    }
  }

  return EmbedFrameApp;
}

function ensureAppClass() {
  if (!EmbedFrameAppClass) EmbedFrameAppClass = buildAppClass();
  return EmbedFrameAppClass;
}

function openOrUpdate(url, title) {
  const Cls = ensureAppClass();
  if (activeApp?.rendered) {
    activeApp.setUrl(url, title);
    activeApp.bringToTop?.();
    return;
  }
  activeApp = new Cls({ url, embedTitle: title });
  activeApp.render(true);
}

function closeApp() {
  if (!activeApp) return;
  try { activeApp.close(); } catch (_) {}
  activeApp = null;
}

function reloadApp() {
  if (!activeApp?.rendered) return;
  activeApp.reload();
}

export function handleEmbedOpen(msg) {
  const { payload, senderId } = msg;
  if (payload?.targetUserId && payload.targetUserId !== game.user.id) return;
  if (senderId === game.user.id) return;
  openOrUpdate(payload.url, payload.title);
}

export function handleEmbedClose(msg) {
  const { payload, senderId } = msg;
  if (payload?.targetUserId && payload.targetUserId !== game.user.id) return;
  if (senderId === game.user.id) return;
  closeApp();
}

export function handleEmbedReload(msg) {
  const { payload, senderId } = msg;
  if (payload?.targetUserId && payload.targetUserId !== game.user.id) return;
  if (senderId === game.user.id) return;
  reloadApp();
}
