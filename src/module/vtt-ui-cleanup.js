import { MODULE_ID } from './socket-protocol.js';
import { isHideUiEnabled, getVttUserId } from './settings.js';

const STYLE_ID = `${MODULE_ID}-ui-cleanup`;

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
  const existing = document.getElementById(STYLE_ID);
  if (existing) existing.remove();

  if (!isActiveVttUser()) return;
  if (!isHideUiEnabled()) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `${HIDE_SELECTOR} { display: none !important; }`;
  document.head.appendChild(style);
  console.log(`[${MODULE_ID}] UI cleanup applied`);
}
