import { MODULE_ID } from './socket-protocol.js';
import { getHideFlags, getVttUserId } from './settings.js';

const STYLE_ID = `${MODULE_ID}-ui-cleanup`;

// Foundry V13 selectors. Multiple selectors per target for resilience across minor versions.
const TARGETS = {
  sidebar: ['#sidebar', '#sidebar.app'],
  chat: ['#chat', '#sidebar-tab-chat', '#chat-log', '#chat-form'],
  navigation: ['#navigation', '#scene-navigation'],
  players: ['#players'],
  hotbar: ['#hotbar'],
  controls: ['#controls', '#ui-left #controls'],
  logo: ['#logo']
};

function isActiveVttUser() {
  return !game.user.isGM && game.user.id === getVttUserId();
}

function buildCss(flags) {
  const parts = [];
  for (const [key, active] of Object.entries(flags)) {
    if (!active) continue;
    const selectors = TARGETS[key];
    if (!selectors) continue;
    parts.push(`${selectors.join(', ')} { display: none !important; }`);
  }
  return parts.join('\n');
}

export function applyUiCleanup() {
  // Remove any existing style first
  const existing = document.getElementById(STYLE_ID);
  if (existing) existing.remove();

  if (!isActiveVttUser()) return;

  const css = buildCss(getHideFlags());
  if (!css) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
  console.log(`[${MODULE_ID}] UI cleanup applied`);
}
