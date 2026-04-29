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

  /**
   * Resolve the JournalEntry or JournalEntryPage that controls the note's
   * player visibility. Foundry checks the linked entry's ownership when
   * deciding whether a player can see the note icon — NOT the NoteDocument's
   * own ownership. Prefer the specific page when one is set, otherwise the
   * whole entry.
   */
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

/**
 * Install hooks that wire Note placeables to a HUD:
 *  - Note._canHUD → true for GM with a valid entry
 *  - NotesLayer.hud getter → canvas.hud.note
 */
export function installNoteHud() {
  const NoteCls = foundry?.canvas?.placeables?.Note ?? globalThis.Note;
  const NotesLayerCls = foundry?.canvas?.layers?.NotesLayer ?? globalThis.NotesLayer;

  if (!NoteCls?.prototype || !NotesLayerCls?.prototype) {
    console.error(`[${MODULE_ID}] NoteHUD install failed — Note=${!!NoteCls} NotesLayer=${!!NotesLayerCls}`);
    return;
  }

  NoteCls.prototype._canHUD = function () {
    return game.user.isGM && !!this.document?.entryId;
  };

  Object.defineProperty(NotesLayerCls.prototype, 'hud', {
    get() { return canvas?.hud?.note ?? null; },
    configurable: true
  });
}

export function onCanvasReady() {
  if (!canvas?.hud || canvas.hud.note) return;
  if (!NoteHUDClass) NoteHUDClass = buildNoteHUDClass();
  if (!NoteHUDClass) return;
  try {
    canvas.hud.note = new NoteHUDClass();
  } catch (e) {
    console.error(`[${MODULE_ID}] Failed to instantiate NoteHUD`, e);
  }
}
