import { MODULE_ID, SOCKET_NAME, MSG } from './socket-protocol.js';
import { getVttUserId, getNoteLabelsMode, NOTE_LABELS_MODES } from './settings.js';

// VTT-side: id of the note whose label is currently force-shown via GM-hover.
let activeHoverNoteId = null;

function isVttUser() {
  const id = getVttUserId();
  return !!id && game.user?.id === id;
}

function setLabelVisible(note, visible) {
  if (!note) return;
  const tooltip = note.tooltip;
  if (!tooltip) return;
  tooltip.visible = visible;
}

// ─── Always-mode: every visible note's label forced on ──────────────────────

function applyAlways(note) {
  if (!note) return;
  if (note.visible === false) return;
  setLabelVisible(note, true);
}

// ─── On-GM-hover mode: only the hovered note's label visible ────────────────

function applyHoverState(note) {
  if (!note) return;
  if (note.visible === false) return;
  setLabelVisible(note, note.document?.id === activeHoverNoteId);
}

function reapplyAllForCurrentMode() {
  const mode = getNoteLabelsMode();
  const notes = canvas?.notes?.placeables ?? [];
  if (!isVttUser()) return;
  if (mode === NOTE_LABELS_MODES.ALWAYS) {
    for (const n of notes) applyAlways(n);
    return;
  }
  if (mode === NOTE_LABELS_MODES.ON_GM_HOVER) {
    for (const n of notes) applyHoverState(n);
    return;
  }
  // OFF — leave Foundry's default behavior (Alt-hover) in place by clearing
  // any forced flags from a previous mode.
  for (const n of notes) {
    if (n?.tooltip) n.tooltip.visible = false;
  }
}

// ─── Per-note hooks (drawNote / refreshNote) ────────────────────────────────

function applyToNote(note) {
  if (!isVttUser()) return;
  const mode = getNoteLabelsMode();
  if (mode === NOTE_LABELS_MODES.ALWAYS) return applyAlways(note);
  if (mode === NOTE_LABELS_MODES.ON_GM_HOVER) return applyHoverState(note);
  // OFF — no-op.
}

export function onDrawNote(note) {
  applyToNote(note);
}

export function onRefreshNote(note) {
  applyToNote(note);
}

export function reapplyAllNoteLabels() {
  reapplyAllForCurrentMode();
}

export function onCanvasReady() {
  // Clear stale hover state on scene change — GM has no note hovered after
  // a scene flip until a fresh hoverNote fires.
  activeHoverNoteId = null;
  reapplyAllForCurrentMode();
}

// ─── GM-side: broadcast hoverNote events to VTT ─────────────────────────────

export function onHoverNote(note, hovered) {
  if (!game.user?.isGM) return;
  if (getNoteLabelsMode() !== NOTE_LABELS_MODES.ON_GM_HOVER) return;
  const vttUserId = getVttUserId();
  if (!vttUserId) return;
  const noteId = note?.document?.id;
  if (!noteId) return;
  const sceneId = note?.document?.parent?.id ?? canvas?.scene?.id;
  if (!sceneId) return;
  game.socket.emit(SOCKET_NAME, {
    type: MSG.NOTE_HOVER,
    sceneId,
    noteId,
    hovered: !!hovered
  });
}

// ─── VTT-side: receive hover broadcasts and reflect on canvas ───────────────

export function handleNoteHover(msg) {
  if (!isVttUser()) return;
  const sceneId = msg?.sceneId;
  if (sceneId && canvas?.scene?.id && sceneId !== canvas.scene.id) {
    // Hover from a scene the VTT isn't viewing — ignore.
    return;
  }
  const noteId = msg?.noteId;
  const hovered = !!msg?.hovered;

  // If clearing the same note, drop active state entirely.
  if (!hovered && activeHoverNoteId === noteId) {
    activeHoverNoteId = null;
  } else if (hovered) {
    activeHoverNoteId = noteId;
  }
  // Note: a hovered=true followed by hovered=true on a different note
  // will swap activeHoverNoteId — last-write-wins, matches GM intent.

  reapplyAllForCurrentMode();
}
