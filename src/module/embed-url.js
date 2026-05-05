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

function clipTopForHost(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'homebrewery.naturalcrit.com') return 90;
  } catch (_) {}
  return 0;
}

/**
 * Normalize URL for embedding. Reserved for future per-host transforms.
 * v0.6.3 attempted Homebrewery /share/ → /print/ rewrite — reverted in 0.6.4
 * because /print/{id} redirects to the homepage for shared (non-authored) brews.
 */
function normalizeEmbedUrl(url) {
  return url;
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)(\?|#|$)/i;
function isImageUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return IMAGE_EXT_RE.test(u.pathname);
  } catch (_) {
    return IMAGE_EXT_RE.test(url);
  }
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
  const rawUrl = getEmbedUrl(page);
  if (!rawUrl) {
    ui.notifications.warn(t('TABLE_MODE.EmbedUrl.NoUrlSet'));
    return;
  }
  if (activeEmbed?.pageId === page.id) {
    emit(MSG.EMBED_CLOSE, { pageId: page.id, targetUserId });
    activeEmbed = null;
    refreshSheets(page);
    return;
  }
  const url = normalizeEmbedUrl(rawUrl);
  const clipTop = clipTopForHost(url);
  const title = page.name || page.parent?.name || 'Embed';
  emit(MSG.EMBED_OPEN, { pageId: page.id, url, title, clipTop, targetUserId });
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

const CLIP_PREF_KEY = `${MODULE_ID}.embed.clipActive`;

function readClipPref() {
  try {
    const v = localStorage.getItem(CLIP_PREF_KEY);
    if (v === 'false') return 'false';
  } catch (_) {}
  return 'true';
}

function writeClipPref(state) {
  try { localStorage.setItem(CLIP_PREF_KEY, state ? 'true' : 'false'); } catch (_) {}
}

function onToggleChrome(ev) {
  ev?.preventDefault?.();
  const wrap = ev.currentTarget?.closest?.('.table-mode-embed-iframe-wrap');
  if (!wrap) return;
  const next = wrap.getAttribute('data-clipped') === 'true' ? 'false' : 'true';
  wrap.setAttribute('data-clipped', next);
  writeClipPref(next === 'true');
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
        width: 1024,
        height: 1200
      }
    };

    constructor(options = {}) {
      const { url, embedTitle, clipTop, ...rest } = options;
      super(rest);
      this._url = url ?? '';
      this._title = embedTitle ?? t('TABLE_MODE.EmbedFrame.DefaultTitle');
      this._clipTop = Number.isFinite(clipTop) ? clipTop : 0;
    }

    get title() { return this._title; }

    setUrl(url, title, clipTop) {
      this._url = url;
      if (title) this._title = title;
      if (Number.isFinite(clipTop)) this._clipTop = clipTop;
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
      const url = this._url || 'about:blank';
      const safe = String(url).replaceAll('"', '&quot;');
      if (isImageUrl(url)) {
        return `<div class="table-mode-embed-image-wrap"><img src="${safe}" alt=""/></div>`;
      }
      const clip = Math.max(0, this._clipTop | 0);
      if (clip > 0) {
        const clipped = readClipPref();
        const tip = escapeAttr(t('TABLE_MODE.EmbedFrame.ToggleChromeTip'));
        return `<div class="table-mode-embed-iframe-wrap" data-clipped="${clipped}" style="--tm-clip-top:${clip}px">
          <iframe class="table-mode-embed-iframe" src="${safe}" allow="fullscreen"></iframe>
          <button type="button" class="table-mode-embed-chrome-toggle" title="${tip}" aria-label="${tip}">
            <i class="fas fa-window-restore"></i>
          </button>
        </div>`;
      }
      return `<iframe class="table-mode-embed-iframe" src="${safe}" allow="fullscreen"></iframe>`;
    }

    _replaceHTML(html, content, _options) {
      content.innerHTML = html;
      const btn = content.querySelector('.table-mode-embed-chrome-toggle');
      if (btn) btn.addEventListener('click', onToggleChrome);
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

function openOrUpdate(url, title, clipTop) {
  const Cls = ensureAppClass();
  if (activeApp?.rendered) {
    activeApp.setUrl(url, title, clipTop);
    activeApp.bringToTop?.();
    return;
  }
  activeApp = new Cls({ url, embedTitle: title, clipTop });
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
  openOrUpdate(payload.url, payload.title, payload.clipTop);
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
