import { MODULE_ID } from './socket-protocol.js';
import { getVttUserId, isHideTemplatesOnVttEnabled } from './settings.js';

/**
 * Hide Measured Templates on VTT view.
 *
 * Spell-targeting templates (cone, circle, line, ray) are DM-side range/aim
 * reference. On the table TV they're a geometric overlay that breaks immersion.
 * AA's animations (Sequencer/PIXI) are a separate render layer — suppressing
 * the template doesn't suppress the cast animation.
 *
 * GM client renders templates as normal; only the VTT user's client hides them.
 */

function isThisClientTheVtt() {
  try {
    return game.user.id === getVttUserId();
  } catch (_) {
    return false;
  }
}

function isHideEnabledSafe() {
  try {
    return isHideTemplatesOnVttEnabled();
  } catch (_) {
    // Settings not registered yet — default to safe (hide). Misalignment in the
    // early canvasReady window resolves on the next refresh after `ready`.
    return true;
  }
}

function getHighlightLayer(template) {
  const id = template?.highlightId;
  if (!id) return null;
  // V13 path moved: canvas.interface.grid.highlightLayers; older fallback retained.
  const map = canvas?.interface?.grid?.highlightLayers ?? canvas?.grid?.highlightLayers;
  return map?.[id] ?? null;
}

export function applyHideForTemplate(template) {
  if (!template) return;
  if (!isThisClientTheVtt()) return;
  if (!isHideEnabledSafe()) {
    // Setting off: don't fight the default render. Let Foundry manage visibility.
    return;
  }
  template.visible = false;
  // The grid-highlight layer (the filled purple squares Foundry draws to mark
  // which cells the template covers) is a separate PIXI object owned by
  // canvas.grid, not by the template itself. Hide it explicitly — without
  // this, `template.visible = false` hides only the cone/circle outline and
  // controlIcon while the grid squares remain visible.
  const highlight = getHighlightLayer(template);
  if (highlight) highlight.visible = false;
}

export function reapplyAll() {
  for (const t of canvas?.templates?.placeables ?? []) {
    applyHideForTemplate(t);
  }
}

export function onDrawMeasuredTemplate(template) { applyHideForTemplate(template); }
export function onRefreshMeasuredTemplate(template) { applyHideForTemplate(template); }

export function onCanvasReady() {
  reapplyAll();
}
