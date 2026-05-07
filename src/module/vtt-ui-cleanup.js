import { MODULE_ID } from './socket-protocol.js';
import { isHideUiEnabled, getVttUserId, getPreserveSelectors } from './settings.js';

const STYLE_ID = `${MODULE_ID}-ui-cleanup`;
const ALWAYS_STYLE_ID = `${MODULE_ID}-vtt-always`;

// Always applied on the VTT client regardless of settings.
// Hides journal page list — VTT only shows the current page content.
const ALWAYS_CSS = `
  .journal-sidebar, aside.journal-sidebar { display: none !important; }
`;

// Broad selectors — hides everything that isn't the canvas (#board).
// Covers V13 layout (#ui-left, #ui-right, #ui-top, #ui-bottom) + older/fallback ids.
const HIDE_WRAPPERS = [
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
];

const HIDE_SELECTOR = HIDE_WRAPPERS.join(', ');

function isActiveVttUser() {
  return !game.user.isGM && game.user.id === getVttUserId();
}

// Walk up from each preserve-target and force-show every ancestor that's in
// the hide list. Without this, third-party modules (Combat Tracker Dock,
// custom HUDs) that render inside Foundry's UI wrappers get collapsed to 0×0
// because we display:none their parent.
function applyPreserveOverrides() {
  const preserves = getPreserveSelectors();
  if (preserves.length === 0) return false;

  const ancestors = new Set();
  for (const sel of preserves) {
    let el;
    try {
      el = document.querySelector(sel);
    } catch {
      // Invalid selector — skip silently
      continue;
    }
    if (!el) continue;
    let p = el.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
      if (HIDE_WRAPPERS.some((s) => p.matches(s))) {
        ancestors.add(p);
      }
      p = p.parentElement;
    }
  }

  for (const a of ancestors) {
    a.style.setProperty('display', 'flex', 'important');
  }
  return ancestors.size > 0;
}

let preserveObserver = null;

// Watch for preserve-targets being injected into the DOM after our cleanup
// pass already ran. Third-party modules (Combat Tracker Dock, etc.) often
// inject their DOM in their own ready/canvasReady hooks which may fire
// after ours, so a one-shot pass on canvasReady misses them.
function ensurePreserveObserver() {
  if (preserveObserver) return;
  if (!document.body) return;

  preserveObserver = new MutationObserver((mutations) => {
    const preserves = getPreserveSelectors();
    if (preserves.length === 0) return;

    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        for (const sel of preserves) {
          let matches = false;
          try {
            matches = node.matches?.(sel) || !!node.querySelector?.(sel);
          } catch {
            // Invalid selector — skip
          }
          if (matches) {
            applyUiCleanup();
            return;
          }
        }
      }
    }
  });

  preserveObserver.observe(document.body, { childList: true, subtree: true });
}

export function applyUiCleanup() {
  for (const id of [STYLE_ID, ALWAYS_STYLE_ID]) {
    const existing = document.getElementById(id);
    if (existing) existing.remove();
  }

  // Reset any inline display overrides we may have set on a previous pass.
  // Without this, when the user disables HIDE_UI or clears their preserve
  // list, our forced display:flex would linger.
  for (const sel of HIDE_WRAPPERS) {
    let el;
    try {
      el = document.querySelector(sel);
    } catch {
      continue;
    }
    if (el && el.style.display) el.style.removeProperty('display');
  }

  if (!isActiveVttUser()) return;

  // Start watching for preserve-targets appearing in DOM after our pass.
  // Idempotent — only installs once.
  ensurePreserveObserver();

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

    const restored = applyPreserveOverrides();
    if (restored) {
      // Third-party modules (e.g. Combat Tracker Dock) compute layout when
      // their container is hidden, ending up 0×0. A single resize event
      // forces them to relayout against the now-visible container.
      requestAnimationFrame(() => {
        try {
          window.dispatchEvent(new Event('resize'));
        } catch {
          // No-op — best-effort relayout
        }
      });
    }
  }

  console.log(`[${MODULE_ID}] UI cleanup applied`);
}
