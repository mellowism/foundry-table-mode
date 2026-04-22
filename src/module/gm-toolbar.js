import { MODULE_ID } from './socket-protocol.js';
import { syncOnce, toggleLock, isLocked } from './viewport-controller.js';

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
        sync: {
          name: 'sync',
          title: t('TABLE_MODE.Controls.SyncOnce'),
          icon: 'fas fa-crosshairs',
          button: true,
          onClick: () => syncOnce(),
          onChange: () => syncOnce()
        },
        lock: {
          name: 'lock',
          title: t('TABLE_MODE.Controls.ToggleLock'),
          icon: 'fas fa-lock',
          toggle: true,
          active: isLocked(),
          onChange: (_event, active) => {
            if (active !== isLocked()) toggleLock();
          }
        }
      },
      activeTool: 'sync'
    };

    // V13 scene controls is an object keyed by control id.
    if (Array.isArray(controls)) {
      controls.push(tableControl);
    } else {
      controls[MODULE_ID] = tableControl;
    }
  });
}
