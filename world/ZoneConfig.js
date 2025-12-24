/**
 * Zone Configuration - Defines room layouts and interactive objects
 * Each zone has its own set of objects, spawn point, and bounds
 */

const ZONES = {
  lobby: {
    name: 'Town Square',
    spawnPoint: { x: 400, y: 480 },
    bounds: { minX: 50, maxX: 750, minY: 200, maxY: 550 },
    objects: [
      // Building doors - invisible hitboxes over actual doors in the background
      { id: 'door-cafe', type: 'door', x: 189, y: 315, emoji: '', action: 'under-construction', label: 'Cafe', message: 'The Cafe is coming soon! ☕' },
      { id: 'door-records', type: 'door', x: 407, y: 300, emoji: '', action: 'under-construction', label: 'Records', message: 'The Record Store is coming soon! 🎵' },
      { id: 'door-arcade', type: 'door', x: 630, y: 322, emoji: '', action: 'zone-change', targetZone: 'games', label: 'Arcade' },
    ],
  },
  games: {
    name: 'Game Room',
    spawnPoint: { x: 100, y: 500 },
    bounds: { minX: 50, maxX: 750, minY: 120, maxY: 550 },
    objects: [
      // Exit door
      { id: 'door-lobby', type: 'door', x: 80, y: 520, emoji: '🚪', action: 'zone-change', targetZone: 'lobby', label: 'Exit' },
      // Arcade cabinets (4 games)
      { id: 'arcade-caption', type: 'arcade', x: 150, y: 180, emoji: '📸', action: 'launch-game', gameType: 'caption-contest', label: 'Caption Contest' },
      { id: 'arcade-board', type: 'arcade', x: 300, y: 180, emoji: '🎲', action: 'launch-game', gameType: 'board-game', label: 'Board Rush' },
      { id: 'arcade-about', type: 'arcade', x: 500, y: 180, emoji: '💭', action: 'under-construction', label: 'About You', message: 'About You is coming soon! 💭' },
      { id: 'arcade-newlywebs', type: 'arcade', x: 650, y: 180, emoji: '🕸️', action: 'under-construction', label: 'Newly Webs', message: 'Newly Webs is coming soon! 🕸️' },
      // Decorative props
      { id: 'lava-lamp-1', type: 'decoration', x: 80, y: 350, emoji: '🪔' },
      { id: 'lava-lamp-2', type: 'decoration', x: 400, y: 450, emoji: '🪔' },
      { id: 'bean-bag-1', type: 'decoration', x: 250, y: 400, emoji: '🛋️' },
      { id: 'bean-bag-2', type: 'decoration', x: 550, y: 420, emoji: '🛋️' },
      { id: 'bean-bag-3', type: 'decoration', x: 680, y: 380, emoji: '🛋️' },
      { id: 'stats-panel', type: 'info', x: 720, y: 450, emoji: '📊', action: 'under-construction', label: 'Stats', message: 'Game stats coming soon! 📊' },
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
