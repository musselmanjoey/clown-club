/**
 * Avalon Role Definitions
 *
 * Each role has:
 * - team: 'good' or 'evil'
 * - name: Display name
 * - description: Short description for UI
 * - sees: What this role sees during night phase
 * - special: Any special abilities
 */

const ROLES = {
  // Good team
  LOYAL_SERVANT: {
    id: 'loyal-servant',
    team: 'good',
    name: 'Loyal Servant',
    description: 'A loyal servant of Arthur with no special abilities',
    sees: [],
  },
  MERLIN: {
    id: 'merlin',
    team: 'good',
    name: 'Merlin',
    description: 'Knows all evil players except Mordred',
    sees: ['evil-except-mordred'],
  },
  PERCIVAL: {
    id: 'percival',
    team: 'good',
    name: 'Percival',
    description: 'Knows who Merlin is (and Morgana if in play)',
    sees: ['merlin-and-morgana'],
  },

  // Evil team
  MINION: {
    id: 'minion',
    team: 'evil',
    name: 'Minion of Mordred',
    description: 'Knows other evil players except Oberon',
    sees: ['evil-except-oberon'],
  },
  ASSASSIN: {
    id: 'assassin',
    team: 'evil',
    name: 'Assassin',
    description: 'Can assassinate Merlin if good wins',
    sees: ['evil-except-oberon'],
    canAssassinate: true,
  },
  MORGANA: {
    id: 'morgana',
    team: 'evil',
    name: 'Morgana',
    description: 'Appears as Merlin to Percival',
    sees: ['evil-except-oberon'],
    appearsAsMerlin: true,
  },
  MORDRED: {
    id: 'mordred',
    team: 'evil',
    name: 'Mordred',
    description: 'Hidden from Merlin',
    sees: ['evil-except-oberon'],
    hiddenFromMerlin: true,
  },
  OBERON: {
    id: 'oberon',
    team: 'evil',
    name: 'Oberon',
    description: 'Unknown to other evil players',
    sees: [],
    hiddenFromEvil: true,
  },
};

/**
 * Team composition by player count
 * { good: number, evil: number }
 */
const TEAM_SIZES = {
  5: { good: 3, evil: 2 },
  6: { good: 4, evil: 2 },
  7: { good: 4, evil: 3 },
  8: { good: 5, evil: 3 },
  9: { good: 6, evil: 3 },
  10: { good: 6, evil: 4 },
};

/**
 * Role presets for quick setup
 * Each preset includes difficulty modifier for good team
 * Positive = easier for good, negative = harder for good
 */
const ROLE_PRESETS = {
  basic: {
    name: 'Basic',
    roles: ['merlin', 'assassin'],
    difficulty: 0,
    description: 'Merlin + Assassin only',
  },
  standard: {
    name: 'Standard',
    roles: ['merlin', 'assassin', 'percival', 'morgana'],
    difficulty: 0,
    description: 'Adds Percival + Morgana',
  },
  advanced: {
    name: 'Advanced',
    roles: ['merlin', 'assassin', 'percival', 'morgana', 'mordred'],
    difficulty: -1,
    description: 'Adds Mordred (harder for good)',
  },
  chaos: {
    name: 'Chaos',
    roles: ['merlin', 'assassin', 'percival', 'morgana', 'mordred', 'oberon'],
    difficulty: 0,
    description: 'All special roles',
  },
};

/**
 * Get difficulty modifier for a set of roles
 * Positive = easier for good, negative = harder for good
 */
function getDifficultyModifier(roleIds) {
  let modifier = 0;

  // Oberon makes it easier for good (+1)
  if (roleIds.includes('oberon')) modifier += 1;

  // Mordred makes it harder for good (-1)
  if (roleIds.includes('mordred')) modifier -= 1;

  // Morgana without Percival is very hard for good (-1)
  if (roleIds.includes('morgana') && !roleIds.includes('percival')) modifier -= 1;

  return modifier;
}

/**
 * Get valid role options for a player count
 * Returns roles that can be selected based on team composition
 */
function getValidRoles(playerCount) {
  const teamSize = TEAM_SIZES[playerCount];
  if (!teamSize) return [];

  return {
    good: [
      ROLES.MERLIN,
      ROLES.PERCIVAL,
    ],
    evil: [
      ROLES.ASSASSIN,
      ROLES.MORGANA,
      ROLES.MORDRED,
      ROLES.OBERON,
    ],
    teamSize,
  };
}

/**
 * Assign roles to players
 * @param {string[]} playerIds - Array of player IDs
 * @param {string[]} selectedRoleIds - Role IDs selected by host
 * @returns {Map<string, object>} Map of playerId -> role object
 */
function assignRoles(playerIds, selectedRoleIds) {
  const playerCount = playerIds.length;
  const teamSize = TEAM_SIZES[playerCount];

  if (!teamSize) {
    throw new Error(`Invalid player count: ${playerCount}`);
  }

  // Separate selected roles by team
  const goodSpecialRoles = selectedRoleIds
    .filter(id => {
      const role = Object.values(ROLES).find(r => r.id === id);
      return role && role.team === 'good';
    })
    .map(id => Object.values(ROLES).find(r => r.id === id));

  const evilSpecialRoles = selectedRoleIds
    .filter(id => {
      const role = Object.values(ROLES).find(r => r.id === id);
      return role && role.team === 'evil';
    })
    .map(id => Object.values(ROLES).find(r => r.id === id));

  // Build role arrays
  const goodRoles = [...goodSpecialRoles];
  const evilRoles = [...evilSpecialRoles];

  // Fill remaining slots with generic roles
  while (goodRoles.length < teamSize.good) {
    goodRoles.push({ ...ROLES.LOYAL_SERVANT });
  }
  while (evilRoles.length < teamSize.evil) {
    evilRoles.push({ ...ROLES.MINION });
  }

  // Combine and shuffle
  const allRoles = [...goodRoles, ...evilRoles];
  shuffleArray(allRoles);

  // Assign to players
  const assignments = new Map();
  const shuffledPlayers = [...playerIds];
  shuffleArray(shuffledPlayers);

  for (let i = 0; i < shuffledPlayers.length; i++) {
    assignments.set(shuffledPlayers[i], allRoles[i]);
  }

  return assignments;
}

/**
 * Calculate what a player sees based on their role
 * @param {object} role - The player's role
 * @param {Map<string, object>} allRoles - All player role assignments
 * @returns {string[]} Array of player IDs this player can see
 */
function calculateVisiblePlayers(role, allRoles) {
  const visible = [];

  for (const [playerId, playerRole] of allRoles) {
    // Skip self
    if (playerRole.id === role.id) continue;

    for (const seeType of role.sees) {
      switch (seeType) {
        case 'evil-except-mordred':
          // Merlin sees all evil except Mordred
          if (playerRole.team === 'evil' && !playerRole.hiddenFromMerlin) {
            visible.push(playerId);
          }
          break;

        case 'evil-except-oberon':
          // Evil players see each other except Oberon
          if (playerRole.team === 'evil' && !playerRole.hiddenFromEvil) {
            visible.push(playerId);
          }
          break;

        case 'merlin-and-morgana':
          // Percival sees Merlin and Morgana (but can't tell which is which)
          if (playerRole.id === 'merlin' || playerRole.appearsAsMerlin) {
            visible.push(playerId);
          }
          break;
      }
    }
  }

  return [...new Set(visible)]; // Remove duplicates
}

/**
 * Fisher-Yates shuffle
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

module.exports = {
  ROLES,
  TEAM_SIZES,
  ROLE_PRESETS,
  getDifficultyModifier,
  getValidRoles,
  assignRoles,
  calculateVisiblePlayers,
};
