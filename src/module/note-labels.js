import { MODULE_ID } from './socket-protocol.js';
import { getVttUserId, isAlwaysShowNoteLabelsEnabled } from './settings.js';

function shouldForceLabel() {
  if (!isAlwaysShowNoteLabelsEnabled()) return false;
  const vttUserId = getVttUserId();
  if (!vttUserId) return false;
  return game.user?.id === vttUserId;
}

function applyToNote(note) {
  if (!note) return;
  // note.visible is false for notes the current user can't see (e.g. ownership.default = NONE
  // and no per-user grant). Skip — the whole PIXI container is hidden anyway.
  if (note.visible === false) return;
  const tooltip = note.tooltip;
  if (!tooltip) return;
  if (!shouldForceLabel()) return;
  tooltip.visible = true;
}

export function onDrawNote(note) {
  applyToNote(note);
}

export function onRefreshNote(note) {
  applyToNote(note);
}

export function reapplyAllNoteLabels() {
  const notes = canvas?.notes?.placeables ?? [];
  for (const n of notes) applyToNote(n);
}

export function onCanvasReady() {
  reapplyAllNoteLabels();
}
