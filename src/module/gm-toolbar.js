import { MODULE_ID } from './socket-protocol.js';
import { syncOnce } from './viewport-controller.js';
import { toggleViewbox, isEnabled as isViewboxEnabled } from './viewbox-controller.js';
import { reloadVtt } from './client-actions.js';
import { toggleAllVisibility as toggleAllNotes } from './note-hud.js';
import { toggleAllTokensOnVtt } from './vtt-token-hide.js';
import { toggleBrush, openBrushSizeMenu, resetFog, getBrushSize, isBrushSpawned } from './fog-brush.js';

function t(key) { return game.i18n.localize(key); }

export function registerSceneControls() {
  Hooks.on('getSceneControlButtons', (controls) => {
    if (!game.user?.isGM) return;

    const tableControl = {
      name: MODULE_ID,
      title: t('TABLE_MODE.Controls.Title'),
      icon: 'fas fa-tv',
      layer: 'controls',
      visible: true,
      activeTool: 'select',
      tools: {
        // No-op selector — gives Foundry's SceneControls a valid default tool
        // to fall back on when other code paths (e.g. dropping an actor on
        // canvas, other modules re-rendering controls) trigger a tool-change
        // lookup. Without this the lookup hits `tools[undefined]` and crashes.
        select: {
          name: 'select',
          title: t('TABLE_MODE.Controls.Select'),
          icon: 'fas fa-mouse-pointer'
        },
        viewbox: {
          name: 'viewbox',
          title: t('TABLE_MODE.Controls.ToggleViewbox'),
          icon: 'fas fa-vector-square',
          toggle: true,
          active: isViewboxEnabled(),
          onChange: (_event, active) => {
            if (active !== isViewboxEnabled()) toggleViewbox();
          }
        },
        sync: {
          name: 'sync',
          title: t('TABLE_MODE.Controls.SyncOnce'),
          icon: 'fas fa-crosshairs',
          button: true,
          onChange: () => syncOnce()
        },
        reload: {
          name: 'reload',
          title: t('TABLE_MODE.Controls.ReloadVtt'),
          icon: 'fas fa-sync',
          button: true,
          onChange: () => reloadVtt()
        },
        toggleNotes: {
          name: 'toggleNotes',
          title: t('TABLE_MODE.Controls.ToggleAllNotes'),
          icon: 'fas fa-eye',
          button: true,
          onChange: () => toggleAllNotes()
        },
        toggleTokens: {
          name: 'toggleTokens',
          title: t('TABLE_MODE.Controls.ToggleAllTokens'),
          icon: 'fas fa-user-secret',
          button: true,
          onChange: () => toggleAllTokensOnVtt()
        },
        fogBrush: {
          name: 'fogBrush',
          title: t('TABLE_MODE.Controls.FogBrush'),
          icon: 'fas fa-paintbrush',
          toggle: true,
          active: isBrushSpawned(),
          onChange: () => toggleBrush()
        },
        fogBrushSize: {
          name: 'fogBrushSize',
          title: t('TABLE_MODE.Controls.FogBrushSize') + ` (${getBrushSize()} sq)`,
          icon: 'fas fa-circle-dot',
          button: true,
          onChange: () => openBrushSizeMenu()
        },
        fogReset: {
          name: 'fogReset',
          title: t('TABLE_MODE.Controls.FogReset'),
          icon: 'fas fa-eraser',
          button: true,
          onChange: () => resetFog()
        }
      }
    };

    if (Array.isArray(controls)) controls.push(tableControl);
    else controls[MODULE_ID] = tableControl;
  });
}
