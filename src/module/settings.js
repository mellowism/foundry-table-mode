import { MODULE_ID } from './socket-protocol.js';

export const SETTINGS = {
  VTT_USER_ID: 'vttUserId',
  ANIMATION_DURATION: 'animationDuration',
  VTT_ASPECT: 'vttAspect',
  HIDE_UI: 'hideUi',
  HIDE_GM_CURSOR: 'hideGmCursor'
};

const ASPECT_PRESETS = {
  auto: null,
  '16:9': 16 / 9,
  '16:10': 16 / 10,
  '4:3': 4 / 3,
  '21:9': 21 / 9,
  '32:9': 32 / 9
};

export function registerSettings() {
  const userChoices = { '': '— none —' };
  const GAMEMASTER = CONST.USER_ROLES.GAMEMASTER;
  for (const u of game.users?.contents ?? []) {
    if (u.role >= GAMEMASTER) continue;
    userChoices[u.id] = u.name;
  }

  game.settings.register(MODULE_ID, SETTINGS.VTT_USER_ID, {
    name: game.i18n.localize('TABLE_MODE.Settings.VttUser.Name'),
    hint: game.i18n.localize('TABLE_MODE.Settings.VttUser.Hint'),
    scope: 'world', config: true, type: String,
    choices: userChoices, default: '', requiresReload: false
  });

  game.settings.register(MODULE_ID, SETTINGS.VTT_ASPECT, {
    name: game.i18n.localize('TABLE_MODE.Settings.VttAspect.Name'),
    hint: game.i18n.localize('TABLE_MODE.Settings.VttAspect.Hint'),
    scope: 'world', config: true, type: String,
    choices: {
      auto: 'Auto (detect from VTT client)',
      '16:9': '16:9',
      '16:10': '16:10',
      '4:3': '4:3',
      '21:9': '21:9 (ultrawide)',
      '32:9': '32:9 (super ultrawide)'
    },
    default: 'auto', requiresReload: false
  });

  game.settings.register(MODULE_ID, SETTINGS.ANIMATION_DURATION, {
    name: game.i18n.localize('TABLE_MODE.Settings.AnimationDuration.Name'),
    hint: game.i18n.localize('TABLE_MODE.Settings.AnimationDuration.Hint'),
    scope: 'world', config: true, type: Number,
    range: { min: 0, max: 2000, step: 50 }, default: 250, requiresReload: false
  });

  game.settings.register(MODULE_ID, SETTINGS.HIDE_UI, {
    name: game.i18n.localize('TABLE_MODE.Settings.HideUi.Name'),
    hint: game.i18n.localize('TABLE_MODE.Settings.HideUi.Hint'),
    scope: 'world', config: true, type: Boolean,
    default: false, requiresReload: false
  });

  game.settings.register(MODULE_ID, SETTINGS.HIDE_GM_CURSOR, {
    name: game.i18n.localize('TABLE_MODE.Settings.HideGmCursor.Name'),
    hint: game.i18n.localize('TABLE_MODE.Settings.HideGmCursor.Hint'),
    scope: 'world', config: true, type: Boolean,
    default: true, requiresReload: false
  });
}

export function getVttUserId() {
  return game.settings.get(MODULE_ID, SETTINGS.VTT_USER_ID);
}
export function getAnimationDuration() {
  return game.settings.get(MODULE_ID, SETTINGS.ANIMATION_DURATION);
}
export function getAspectOverride() {
  const key = game.settings.get(MODULE_ID, SETTINGS.VTT_ASPECT);
  return ASPECT_PRESETS[key] ?? null;
}
export function isHideUiEnabled() {
  return game.settings.get(MODULE_ID, SETTINGS.HIDE_UI);
}
export function isHideGmCursorEnabled() {
  return game.settings.get(MODULE_ID, SETTINGS.HIDE_GM_CURSOR);
}
