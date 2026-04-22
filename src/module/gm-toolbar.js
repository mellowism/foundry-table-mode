import { MODULE_ID } from './socket-protocol.js';
import { syncOnce } from './viewport-controller.js';

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
          onChange: (_event, active) => {
            // V13 fires onChange for button tools as well; only act on explicit click.
            if (active === true) syncOnce();
          }
        }
      }
      // Deliberately no `activeTool` — avoids firing the default tool's handler
      // when the category button is clicked.
    };

    if (Array.isArray(controls)) {
      controls.push(tableControl);
    } else {
      controls[MODULE_ID] = tableControl;
    }
  });
}
