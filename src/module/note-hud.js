import { MODULE_ID } from './socket-protocol.js';

function log(...args) { console.log(`[${MODULE_ID}]`, ...args); }

let NoteHUDClass = null;

function buildNoteHUDClass() {
  const Base = foundry.applications?.hud?.BasePlaceableHUD ?? globalThis.BasePlaceableHUD;
  const HMixin = foundry.applications?.api?.HandlebarsApplicationMixin;
  if (!Base || !HMixin) {
    console.error(`[${MODULE_ID}] Missing V13 HUD APIs (BasePlaceableHUD / HandlebarsApplicationMixin)`);
    return null;
  }

  class NoteHUD extends HMixin(Base) {
    static async _onToggleVisibility(event, target) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const doc = this.document;
      if (!doc) return;
      const LEVELS = CONST.DOCUMENT_OWNERSHIP_LEVELS;
      const current = doc.ownership?.default ?? LEVELS.NONE;
      const isHidden = current < LEVELS.OBSERVER;
      const newLevel = isHidden ? LEVELS.OBSERVER : LEVELS.NONE;
      try {
        await doc.update(
          { ownership: { default: newLevel } },
          { diff: false, recursive: false }
        );
      } catch (e) {
        console.error(`[${MODULE_ID}] Note ownership update failed`, e);
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
      const ownership = this.document?.ownership ?? {};
      const LEVELS = CONST.DOCUMENT_OWNERSHIP_LEVELS;
      const level = ownership.default ?? LEVELS.NONE;
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
      return out;
    }
  }

  return NoteHUD;
}

/**
 * Install hooks that wire Note placeables to a HUD:
 *  - Note._canHUD → true for GM with a valid entry
 *  - NotesLayer.hud getter → canvas.hud.note
 * Safe to call once at init.
 */
export function installNoteHud() {
  const NoteCls = foundry.canvas?.placeables?.Note ?? globalThis.Note;
  if (NoteCls?.prototype) {
    NoteCls.prototype._canHUD = function () {
      return game.user.isGM && !!this.document?.entryId;
    };
  } else {
    console.warn(`[${MODULE_ID}] Note class not found at install time`);
  }

  const NotesLayerCls = foundry.canvas?.layers?.NotesLayer ?? globalThis.NotesLayer;
  if (NotesLayerCls?.prototype) {
    const existing = Object.getOwnPropertyDescriptor(NotesLayerCls.prototype, 'hud');
    if (!existing) {
      Object.defineProperty(NotesLayerCls.prototype, 'hud', {
        get() { return canvas?.hud?.note ?? null; },
        configurable: true
      });
    }
  }
}

export function onCanvasReady() {
  if (!canvas?.hud) return;
  if (canvas.hud.note) return;
  if (!NoteHUDClass) NoteHUDClass = buildNoteHUDClass();
  if (!NoteHUDClass) return;
  try {
    canvas.hud.note = new NoteHUDClass();
    log('NoteHUD installed on canvas.hud.note');
  } catch (e) {
    console.error(`[${MODULE_ID}] Failed to instantiate NoteHUD`, e);
  }
}
