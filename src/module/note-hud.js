import { MODULE_ID } from './socket-protocol.js';

function log(...args) { console.log(`[${MODULE_ID}]`, ...args); }
function warn(...args) { console.warn(`[${MODULE_ID}]`, ...args); }
function err(...args) { console.error(`[${MODULE_ID}]`, ...args); }

let NoteHUDClass = null;

function resolveBaseAPI() {
  const Base =
    foundry?.applications?.hud?.BasePlaceableHUD ??
    foundry?.applications?.hud?.placeable?.BasePlaceableHUD ??
    globalThis.BasePlaceableHUD ??
    null;
  const HMixin =
    foundry?.applications?.api?.HandlebarsApplicationMixin ??
    globalThis.HandlebarsApplicationMixin ??
    null;
  log('resolveBaseAPI →',
    'foundry.applications.hud:', !!foundry?.applications?.hud,
    'BasePlaceableHUD:', !!Base, Base?.name,
    'HMixin:', !!HMixin);
  return { Base, HMixin };
}

function buildNoteHUDClass() {
  const { Base, HMixin } = resolveBaseAPI();
  if (!Base || !HMixin) {
    err('Missing V13 HUD APIs — cannot build NoteHUD class');
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
        err('Note ownership update failed', e);
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
      log('NoteHUD _prepareContext', { isHidden, level });
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

  log('buildNoteHUDClass succeeded:', NoteHUD?.name);
  return NoteHUD;
}

export function installNoteHud() {
  log('installNoteHud start');
  const NoteCls = foundry?.canvas?.placeables?.Note ?? globalThis.Note;
  log('Note class:', !!NoteCls, NoteCls?.name);
  if (NoteCls?.prototype) {
    NoteCls.prototype._canHUD = function () {
      return game.user.isGM && !!this.document?.entryId;
    };
    log('Note.prototype._canHUD installed');
  } else {
    warn('Note class not found at install time');
  }

  const NotesLayerCls = foundry?.canvas?.layers?.NotesLayer ?? globalThis.NotesLayer;
  log('NotesLayer class:', !!NotesLayerCls, NotesLayerCls?.name);
  if (NotesLayerCls?.prototype) {
    Object.defineProperty(NotesLayerCls.prototype, 'hud', {
      get() { return canvas?.hud?.note ?? null; },
      configurable: true
    });
    log('NotesLayer.prototype.hud getter installed');
  }
  log('installNoteHud done');
}

export function ensureCanvasHud() {
  log('ensureCanvasHud — canvas.hud:', !!canvas?.hud, canvas?.hud?.constructor?.name);
  if (!canvas?.hud) {
    warn('canvas.hud not available yet');
    return false;
  }
  if (canvas.hud.note) {
    log('canvas.hud.note already set — skipping');
    return true;
  }
  if (!NoteHUDClass) NoteHUDClass = buildNoteHUDClass();
  if (!NoteHUDClass) return false;
  try {
    canvas.hud.note = new NoteHUDClass();
    log('canvas.hud.note assigned:', !!canvas.hud.note, canvas.hud.note?.constructor?.name);
    return true;
  } catch (e) {
    err('Failed to instantiate NoteHUD', e);
    return false;
  }
}

export function onCanvasReady() {
  log('onCanvasReady fired');
  ensureCanvasHud();
}

export function onReady() {
  log('onReady fired');
  ensureCanvasHud();
}
