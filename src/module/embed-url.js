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
 * GM-side state — track which embed is currently open on VTT
 * ========================================================= */

let activeEmbed = null; // { pageId, url } | null

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
  emit(MSG.EMBED_OPEN, { pageId: page.id, url, targetUserId });
  activeEmbed = { pageId: page.id, url };
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
 * Page-sheet UI injection — adds an Embed URL field to the
 * Text-page edit form. Works for any V13 sheet via render hook.
 * ========================================================= */

export function onRenderJournalPageSheet(app, html) {
  if (!game.user.isGM) return;
  const page = app?.document;
  if (!page) return;
  if (page.type !== 'text') return; // for now only text pages get the field
  const root = html?.jquery ? html[0] : html;
  if (!root?.querySelector) return;
  if (root.querySelector(`[data-${MODULE_ID}-embed-url]`)) return; // already injected

  // Find the form to inject above
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

  // Insert at top of form
  if (form.firstChild) form.insertBefore(container, form.firstChild);
  else form.appendChild(container);
}

function escapeAttr(s) {
  return String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

/* =========================================================
 * VTT-side iframe overlay
 * ========================================================= */

let overlayEl = null;
let overlayIframe = null;

function ensureOverlay() {
  if (overlayEl) return overlayEl;
  overlayEl = document.createElement('div');
  overlayEl.id = `${MODULE_ID}-embed-overlay`;
  overlayEl.className = 'table-mode-embed-overlay';
  overlayEl.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: #000; display: none;
  `;
  overlayIframe = document.createElement('iframe');
  overlayIframe.style.cssText = `
    width: 100%; height: 100%; border: 0; background: #000;
  `;
  overlayIframe.setAttribute('allow', 'fullscreen');
  overlayEl.appendChild(overlayIframe);
  document.body.appendChild(overlayEl);
  return overlayEl;
}

function showEmbed(url) {
  ensureOverlay();
  overlayIframe.src = url;
  overlayEl.style.display = 'block';
}

function hideEmbed() {
  if (!overlayEl) return;
  overlayEl.style.display = 'none';
  if (overlayIframe) overlayIframe.src = 'about:blank';
}

function reloadEmbed() {
  if (!overlayIframe) return;
  // Force reload by re-setting src
  const src = overlayIframe.src;
  overlayIframe.src = 'about:blank';
  setTimeout(() => { overlayIframe.src = src; }, 50);
}

export function handleEmbedOpen(msg) {
  const { payload, senderId } = msg;
  if (payload?.targetUserId && payload.targetUserId !== game.user.id) return;
  if (senderId === game.user.id) return;
  showEmbed(payload.url);
}

export function handleEmbedClose(msg) {
  const { payload, senderId } = msg;
  if (payload?.targetUserId && payload.targetUserId !== game.user.id) return;
  if (senderId === game.user.id) return;
  hideEmbed();
}

export function handleEmbedReload(msg) {
  const { payload, senderId } = msg;
  if (payload?.targetUserId && payload.targetUserId !== game.user.id) return;
  if (senderId === game.user.id) return;
  reloadEmbed();
}
