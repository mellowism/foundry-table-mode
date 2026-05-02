import { MODULE_ID } from './socket-protocol.js';
import { isDefaultHiddenTokensEnabled } from './settings.js';

/**
 * Default newly-placed tokens to hidden. Useful for the physical-minis
 * workflow: GM drags tokens onto the scene, but players using the table TV
 * place real miniatures — digital tokens stay hidden so the TV shows just
 * the map. GM right-clicks to reveal individual tokens as needed.
 *
 * Also sets `displayName` to OWNER (40) so the GM (technical owner of all
 * tokens) sees nameplates on the placed tokens — useful as labels while
 * managing positions during combat. Players see nameplates only on tokens
 * they own (their own PC).
 *
 * Hooks `preCreateToken` and mutates the source data before persistence.
 * Covers drag/drop, compendium drops, macro spawns, MCP creates.
 */
export function onPreCreateToken(token) {
  if (!game.user?.isGM) return;
  if (!isDefaultHiddenTokensEnabled()) return;
  const ownerDisplay = CONST?.TOKEN_DISPLAY_MODES?.OWNER ?? 40;
  // updateSource mutates the in-memory document data before it's saved.
  token.updateSource({
    hidden: true,
    displayName: ownerDisplay
  });
}
