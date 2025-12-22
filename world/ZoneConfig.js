/**
 * Zone Configuration - Defines room layouts and interactive objects
 * Each zone has its own set of objects, spawn point, and bounds
 */

const ZONES = {
  lobby: {
    name: 'Town Square',
    spawnPoint: { x: 400, y: 300 },
    bounds: { minX: 50, maxX: 750, minY: 50, maxY: 550 },
    objects: [
      { id: 'door-games', type: 'door', x: 700, y: 300, emoji: '🚪', action: 'zone-change', targetZone: 'games', label: 'Games Room' },
      { id: 'tree-1', type: 'decoration', x: 100, y: 400, emoji: '🌲' },
      { id: 'tree-2', type: 'decoration', x: 600, y: 450, emoji: '🌲' },
      { id: 'snowman', type: 'decoration', x: 350, y: 150, emoji: '⛄' },
    ],
  },
  games: {
    name: 'Games Room',
    spawnPoint: { x: 400, y: 450 },
    bounds: { minX: 50, maxX: 750, minY: 50, maxY: 550 },
    objects: [
      { id: 'door-lobby', type: 'door', x: 100, y: 450, emoji: '🚪', action: 'zone-change', targetZone: 'lobby', label: 'Back to Lobby' },
      { id: 'arcade-board', type: 'arcade', x: 250, y: 200, emoji: '🎲', action: 'launch-game', gameType: 'board-game', label: 'Board Rush' },
      { id: 'arcade-caption', type: 'arcade', x: 550, y: 200, emoji: '📸', action: 'launch-game', gameType: 'caption-contest', label: 'Caption Contest' },
    ],
  },
};

const DEFAULT_ZONE = 'lobby';

/**
 * Get zone configuration by ID
 */
function getZone(zoneId) {
  return ZONES[zoneId] || ZONES[DEFAULT_ZONE];
}

/**
 * Get all available zone IDs
 */
function getZoneIds() {
  return Object.keys(ZONES);
}

/**
 * Check if zone exists
 */
function zoneExists(zoneId) {
  return zoneId in ZONES;
}

module.exports = {
  ZONES,
  DEFAULT_ZONE,
  getZone,
  getZoneIds,
  zoneExists,
};
