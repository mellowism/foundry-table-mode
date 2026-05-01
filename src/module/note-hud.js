import { MODULE_ID } from './socket-protocol.js';

let NoteHUDClass = null;

function visibilityTarget(noteDoc) {
  return noteDoc?.page ?? noteDoc?.entry ?? null;
}

function buildNoteHUDClass() {
  const Base = foundry.applications.hud.BasePlaceableHUD;
  const HMixin = foundry.applications.api.HandlebarsApplicationMixin;

  class NoteHUD extends HMixin(Base) {
    static async _onToggleVisibility(event) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const target = visibilityTarget(this.document);
      if (!target) return;
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
      // Place HUD just above the note icon so right-clicking the note itself
      // remains possible (HUD wrapper is pointer-events:none anyway, but
      // visually clearer too).
      if (typeof out.left === 'number') out.left -= 18; // half of 36px button
      if (typeof out.top === 'number') out.top -= iconSize / 2 + 40;
      return out;
    }
  }

  return NoteHUD;
}

export function installNoteHud() {
  const NoteCls = foundry.canvas.placeables.Note;

  NoteCls.prototype._canHUD = function () {
    return game.user.isGM && !!this.document?.entryId;
  };

  // Default Foundry _onClickRight assumes layer.hud is non-null. On some V13
  // builds NotesLayer.hud returns null, which crashes the default impl. Bind
  // canvas.hud.note ourselves to bypass the layer indirection.
  NoteCls.prototype._onClickRight = function (event) {
    if (!this._canHUD?.(game.user, event)) return;
    const hud = canvas?.hud?.note;
    if (!hud) return;
    if (hud.object === this) {
      // V13: BasePlaceableHUD#clear is deprecated in favor of #close
      (hud.close ?? hud.clear).call(hud);
    } else {
      hud.bind(this);
    }
  };
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

/**
 * Toolbar action: toggle visibility of every map note on the current scene.
 * Mirrors the per-note semantics — updates the linked page (or entry) ownership.
 * If any target is visible, hides all. Otherwise shows all.
 */
export async function toggleAllVisibility() {
  if (!game.user.isGM) return;
  const notes = canvas?.notes?.placeables ?? [];
  if (!notes.length) {
    ui.notifications.info(game.i18n.localize('TABLE_MODE.Notifications.NoNotes'));
    return;
  }

  const targets = new Map();
  for (const n of notes) {
    const t = visibilityTarget(n.document);
    if (t && !targets.has(t.id)) targets.set(t.id, t);
  }

  if (!targets.size) {
    ui.notifications.warn(game.i18n.localize('TABLE_MODE.Notifications.NoLinkedEntries'));
    return;
  }

  const LEVELS = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  const anyVisible = [...targets.values()].some(
    t => (t.ownership?.default ?? LEVELS.NONE) >= LEVELS.OBSERVER
  );
  const newLevel = anyVisible ? LEVELS.NONE : LEVELS.OBSERVER;

  try {
    await Promise.all([...targets.values()].map(t => {
      const ownership = foundry.utils.deepClone(t.ownership ?? {});
      ownership.default = newLevel;
      return t.update({ ownership });
    }));
  } catch (e) {
    console.error(`[${MODULE_ID}] Bulk visibility toggle failed`, e);
    ui.notifications.error(game.i18n.localize('TABLE_MODE.Notifications.BulkToggleFailed'));
    return;
  }

  const key = anyVisible ? 'TABLE_MODE.Notifications.NotesHidden' : 'TABLE_MODE.Notifications.NotesShown';
  ui.notifications.info(game.i18n.format(key, { count: targets.size }));

  if (canvas.hud.note?.rendered) canvas.hud.note.render();
}
