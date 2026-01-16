/**
 * Avalon Quest Configuration
 *
 * Defines team sizes for each quest based on player count.
 * Also includes special rules like Quest 4 requiring 2 fails with 7+ players.
 */

/**
 * Team sizes for each quest by player count
 * Index 0-4 corresponds to Quest 1-5
 */
const QUEST_TEAM_SIZES = {
  5:  [2, 3, 2, 3, 3],
  6:  [2, 3, 4, 3, 4],
  7:  [2, 3, 3, 4, 4],
  8:  [3, 4, 4, 5, 5],
  9:  [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
};

/**
 * Get team size for a specific quest
 * @param {number} playerCount - Number of players (5-10)
 * @param {number} questIndex - Quest index (0-4)
 * @returns {number} Required team size
 */
function getQuestTeamSize(playerCount, questIndex) {
  const sizes = QUEST_TEAM_SIZES[playerCount];
  if (!sizes) {
    throw new Error(`Invalid player count: ${playerCount}`);
  }
  if (questIndex < 0 || questIndex > 4) {
    throw new Error(`Invalid quest index: ${questIndex}`);
  }
  return sizes[questIndex];
}

/**
 * Check if a quest requires 2 fails to fail
 * Quest 4 (index 3) requires 2 fails with 7+ players
 * @param {number} playerCount - Number of players
 * @param {number} questIndex - Quest index (0-4)
 * @returns {boolean} True if 2 fails required
 */
function requiresTwoFails(playerCount, questIndex) {
  return playerCount >= 7 && questIndex === 3;
}

/**
 * Determine quest result based on fail count
 * @param {number} failCount - Number of fail cards played
 * @param {number} playerCount - Number of players
 * @param {number} questIndex - Quest index (0-4)
 * @returns {boolean} True if quest succeeds
 */
function questSucceeds(failCount, playerCount, questIndex) {
  if (requiresTwoFails(playerCount, questIndex)) {
    return failCount < 2;
  }
  return failCount === 0;
}

/**
 * Get all quest configuration for a game
 * @param {number} playerCount - Number of players
 * @returns {object[]} Array of quest configs
 */
function getQuestConfig(playerCount) {
  const sizes = QUEST_TEAM_SIZES[playerCount];
  if (!sizes) return [];

  return sizes.map((teamSize, index) => ({
    questNumber: index + 1,
    teamSize,
    requiresTwoFails: requiresTwoFails(playerCount, index),
  }));
}

/**
 * Max consecutive team rejections before evil wins
 */
const MAX_REJECTIONS = 5;

module.exports = {
  QUEST_TEAM_SIZES,
  getQuestTeamSize,
  requiresTwoFails,
  questSucceeds,
  getQuestConfig,
  MAX_REJECTIONS,
};
