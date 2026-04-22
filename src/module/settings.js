import { MODULE_ID } from './socket-protocol.js';

export const SETTINGS = {
  VTT_USER_ID: 'vttUserId',
  ANIMATION_DURATION: 'animationDuration'
};

export function registerSettings() {
  const userChoices = { '': '— none —' };
  for (const u of game.users?.contents ?? []) {
    if (u.isGM) continue; // VTT client is a dedicated player account, never a GM
    userChoices[u.id] = u.name;
  }

  game.settings.register(MODULE_ID, SETTINGS.VTT_USER_ID, {
    name: game.i18n.localize('TABLE_MODE.Settings.VttUser.Name'),
    hint: game.i18n.localize('TABLE_MODE.Settings.VttUser.Hint'),
    scope: 'world',
    config: true,
    type: String,
    choices: userChoices,
    default: '',
    requiresReload: false
  });

  game.settings.register(MODULE_ID, SETTINGS.ANIMATION_DURATION, {
    name: game.i18n.localize('TABLE_MODE.Settings.AnimationDuration.Name'),
    hint: game.i18n.localize('TABLE_MODE.Settings.AnimationDuration.Hint'),
    scope: 'world',
    config: true,
    type: Number,
    range: { min: 0, max: 2000, step: 50 },
    default: 250,
    requiresReload: false
  });
}

export function getVttUserId() {
  return game.settings.get(MODULE_ID, SETTINGS.VTT_USER_ID);
}

export function getAnimationDuration() {
  return game.settings.get(MODULE_ID, SETTINGS.ANIMATION_DURATION);
}
