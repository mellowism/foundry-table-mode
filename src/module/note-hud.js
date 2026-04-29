import { MODULE_ID } from './socket-protocol.js';

let NoteHUDClass = null;

function buildNoteHUDClass() {
  const Base =
    foundry?.applications?.hud?.BasePlaceableHUD ??
    globalThis.BasePlaceableHUD ??
    null;
  const HMixin =
    foundry?.applications?.api?.HandlebarsApplicationMixin ??
    globalThis.HandlebarsApplicationMixin ??
    null;

  if (!Base || !HMixin) {
    console.error(`[${MODULE_ID}] Missing V13 HUD APIs — BasePlaceableHUD=${!!Base} HMixin=${!!HMixin}`);
    return null;
  }

  function visibilityTarget(noteDoc) {
    return noteDoc?.page ?? noteDoc?.entry ?? null;
  }

  class NoteHUD extends HMixin(Base) {
    static async _onToggleVisibility(event) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const target = visibilityTarget(this.document);
      if (!target) {
        console.warn(`[${MODULE_ID}] NoteHUD: no entry/page linked — cannot toggle`);
        return;
      }
      const LEVELS = CONST.DOCUMENT_OWNERSHIP_LEVELS;
      const ownership = foundry.utils.deepClone(target.ownership ?? {});
      const current = ownership.default ?? LEVELS.NONE;
      const isHidden = current < LEVELS.OBSERVER;
      ownership.default = isHidden ? LEVELS.OBSERVER : LEVELS.NONE;
      try {
        await target.update({ ownership });
      } catch (e) {
        console.error(`[${MODULE_ID}] Visibility update failed`, e);
        return;
      }
      this.render();
    }

    static DEFAULT_OPTIONS = {
      id: 'note-hud-{id}',
      classes: ['placeable-hud', 'table-mode-note-hud'],
      actions: {
        visibility: NoteHUD._onToggleVisibility
      }
    };

    static PARTS = {
      form: {
        template: `modules/${MODULE_ID}/src/templates/note-hud.html`,
        root: true
      }
    };

    async _prepareContext() {
      const target = visibilityTarget(this.document);
      const LEVELS = CONST.DOCUMENT_OWNERSHIP_LEVELS;
      const level = target?.ownership?.default ?? LEVELS.NONE;
      const isHidden = level < LEVELS.OBSERVER;
      return {
        id: this.id,
        appId: this.appId,
        isGM: game.user.isGM,
        visibilityClass: isHidden ? 'active' : ''
      };
    }

    _updatePosition(position) {
      const out = super._updatePosition?.(position) ?? position;
      const iconSize = this.document?.iconSize ?? 40;
      if (typeof out.left === 'number') {
        out.left = out.left - (iconSize / 2);
      }
      if (typeof out.top === 'number') {
        out.top = out.top - (iconSize / 2);
      }
      return out;
    }
  }

  return NoteHUD;
}

export function installNoteHud() {
  const NoteCls = foundry?.canvas?.placeables?.Note ?? globalThis.Note;
  if (!NoteCls?.prototype) {
    console.error(`[${MODULE_ID}] Note class not found — install aborted`);
    return;
  }

  NoteCls.prototype._canHUD = function () {
    return game.user.isGM && !!this.document?.entryId;
  };

  // Override right-click directly. Default Foundry impl assumes layer.hud is
  // a non-null object — on some V13 builds NotesLayer.hud returns null and the
  // default crashes silently. Bypass the layer indirection entirely.
  NoteCls.prototype._onClickRight = function (event) {
    if (!this._canHUD?.(game.user, event)) return;
    const hud = canvas?.hud?.note;
    if (!hud) return;
    if (hud.object === this) hud.clear();
    else hud.bind(this);
  };
  // V13 also dispatches via _onClickRight2 in some cases (double-right) —
  // alias to the same handler so we don't lose binds on rapid clicks.
  NoteCls.prototype._onClickRight2 = NoteCls.prototype._onClickRight;

  console.log(`[${MODULE_ID}] NoteHUD install: _canHUD + _onClickRight patched on Note.prototype`);
}

export function onCanvasReady() {
  console.log(`[${MODULE_ID}] NoteHUD canvasReady — canvas.hud=${!!canvas?.hud} existing.note=${!!canvas?.hud?.note}`);
  if (!canvas?.hud || canvas.hud.note) return;
  if (!NoteHUDClass) NoteHUDClass = buildNoteHUDClass();
  if (!NoteHUDClass) return;
  try {
    canvas.hud.note = new NoteHUDClass();
    console.log(`[${MODULE_ID}] canvas.hud.note assigned: ${canvas.hud.note?.constructor?.name}`);
  } catch (e) {
    console.error(`[${MODULE_ID}] Failed to instantiate NoteHUD`, e);
  }
}
