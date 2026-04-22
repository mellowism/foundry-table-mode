import { MODULE_ID } from './socket-protocol.js';
import { isHideUiEnabled, getVttUserId } from './settings.js';

const STYLE_ID = `${MODULE_ID}-ui-cleanup`;
const ALWAYS_STYLE_ID = `${MODULE_ID}-vtt-always`;

// Always applied on the VTT client regardless of settings.
// Hides journal page list — VTT only shows the current page content.
const ALWAYS_CSS = `
  .journal-sidebar, aside.journal-sidebar { display: none !important; }
`;

// Broad selectors — hides everything that isn't the canvas (#board).
// Covers V13 layout (#ui-left, #ui-right, #ui-top, #ui-bottom) + older/fallback ids.
const HIDE_SELECTOR = [
  '#ui-left',
  '#ui-top',
  '#ui-right',
  '#ui-bottom',
  '#ui-middle',
  '#navigation',
  '#scene-navigation',
  '#sidebar',
  '#players',
  '#hotbar',
  '#scene-controls',
  '#controls',
  '#logo',
  '#chat-notifications',
  '#chat',
  '#pause',
  '#notifications'
].join(', ');

function isActiveVttUser() {
  return !game.user.isGM && game.user.id === getVttUserId();
}

export function applyUiCleanup() {
  for (const id of [STYLE_ID, ALWAYS_STYLE_ID]) {
    const existing = document.getElementById(id);
    if (existing) existing.remove();
  }

  if (!isActiveVttUser()) return;

  // Always-on CSS for VTT user
  const alwaysStyle = document.createElement('style');
  alwaysStyle.id = ALWAYS_STYLE_ID;
  alwaysStyle.textContent = ALWAYS_CSS;
  document.head.appendChild(alwaysStyle);

  // Optional full-UI-hide based on setting
  if (isHideUiEnabled()) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `${HIDE_SELECTOR} { display: none !important; }`;
    document.head.appendChild(style);
  }

  console.log(`[${MODULE_ID}] UI cleanup applied`);
}
