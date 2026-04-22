import { MODULE_ID } from './socket-protocol.js';

export const SETTINGS = {
  VTT_USER_ID: 'vttUserId',
  ANIMATION_DURATION: 'animationDuration',
  VTT_ASPECT: 'vttAspect',
  HIDE_SIDEBAR: 'hideSidebar',
  HIDE_CHAT: 'hideChat',
  HIDE_NAVIGATION: 'hideNavigation',
  HIDE_PLAYERS: 'hidePlayers',
  HIDE_HOTBAR: 'hideHotbar',
  HIDE_CONTROLS: 'hideControls',
  HIDE_LOGO: 'hideLogo'
};

const ASPECT_PRESETS = {
  auto: null,
  '16:9': 16 / 9,
  '16:10': 16 / 10,
  '4:3': 4 / 3,
  '21:9': 21 / 9,
  '32:9': 32 / 9
};

const HIDE_TOGGLES = [
  [SETTINGS.HIDE_SIDEBAR, 'HideSidebar'],
  [SETTINGS.HIDE_CHAT, 'HideChat'],
  [SETTINGS.HIDE_NAVIGATION, 'HideNavigation'],
  [SETTINGS.HIDE_PLAYERS, 'HidePlayers'],
  [SETTINGS.HIDE_HOTBAR, 'HideHotbar'],
  [SETTINGS.HIDE_CONTROLS, 'HideControls'],
  [SETTINGS.HIDE_LOGO, 'HideLogo']
];

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

  for (const [key, labelKey] of HIDE_TOGGLES) {
    game.settings.register(MODULE_ID, key, {
      name: game.i18n.localize(`TABLE_MODE.Settings.${labelKey}.Name`),
      hint: game.i18n.localize(`TABLE_MODE.Settings.${labelKey}.Hint`),
      scope: 'world', config: true, type: Boolean,
      default: false, requiresReload: false
    });
  }
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
export function getHideFlags() {
  return {
    sidebar: game.settings.get(MODULE_ID, SETTINGS.HIDE_SIDEBAR),
    chat: game.settings.get(MODULE_ID, SETTINGS.HIDE_CHAT),
    navigation: game.settings.get(MODULE_ID, SETTINGS.HIDE_NAVIGATION),
    players: game.settings.get(MODULE_ID, SETTINGS.HIDE_PLAYERS),
    hotbar: game.settings.get(MODULE_ID, SETTINGS.HIDE_HOTBAR),
    controls: game.settings.get(MODULE_ID, SETTINGS.HIDE_CONTROLS),
    logo: game.settings.get(MODULE_ID, SETTINGS.HIDE_LOGO)
  };
}
