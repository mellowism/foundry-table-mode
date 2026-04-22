import { MODULE_ID } from './socket-protocol.js';
import { syncOnce } from './viewport-controller.js';
import { toggleViewbox, isEnabled as isViewboxEnabled } from './viewbox-controller.js';

function t(key) {
  return game.i18n.localize(key);
}

export function registerSceneControls() {
  Hooks.on('getSceneControlButtons', (controls) => {
    if (!game.user?.isGM) return;

    const tableControl = {
      name: MODULE_ID,
      title: t('TABLE_MODE.Controls.Title'),
      icon: 'fas fa-tv',
      layer: 'controls',
      visible: true,
      tools: {
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
          onClick: () => syncOnce()
        }
      }
    };

    if (Array.isArray(controls)) {
      controls.push(tableControl);
    } else {
      controls[MODULE_ID] = tableControl;
    }
  });
}

export function refreshToolbar() {
  ui.controls?.render?.(true);
}
