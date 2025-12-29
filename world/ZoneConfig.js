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
      { id: 'door-records', type: 'door', x: 407, y: 300, emoji: '', action: 'zone-change', targetZone: 'records', label: 'Records' },
      { id: 'door-arcade', type: 'door', x: 630, y: 322, emoji: '', action: 'zone-change', targetZone: 'games', label: 'Arcade' },
    ],
  },
  games: {
    name: 'Game Room',
    spawnPoint: { x: 400, y: 500 },
    bounds: { minX: 50, maxX: 750, minY: 200, maxY: 550 },
    objects: [
      // Exit door (invisible hitbox - visual is in background)
      { id: 'door-lobby', type: 'door', x: 92, y: 376, emoji: '', action: 'zone-change', targetZone: 'lobby', label: 'Exit' },
      // Arcade cabinets (invisible hitboxes - visuals are in background)
      { id: 'arcade-caption', type: 'arcade', x: 249, y: 316, emoji: '', action: 'launch-game', gameType: 'caption-contest', label: 'Caption Contest' },
      { id: 'arcade-board', type: 'arcade', x: 356, y: 319, emoji: '', action: 'launch-game', gameType: 'board-game', label: 'Board Rush' },
      { id: 'arcade-about', type: 'arcade', x: 459, y: 319, emoji: '', action: 'launch-game', gameType: 'about-you', label: 'About You' },
      { id: 'arcade-newlywebs', type: 'arcade', x: 560, y: 316, emoji: '', action: 'under-construction', label: 'Newly Webs', message: 'Newly Webs is coming soon! 🕸️' },
      // Leaderboard/stats panel
      { id: 'stats-panel', type: 'info', x: 716, y: 261, emoji: '', action: 'under-construction', label: 'Leaderboard', message: 'Leaderboard coming soon! 📊' },
    ],
  },
  records: {
    name: 'Record Store',
    spawnPoint: { x: 400, y: 480 },
    bounds: { minX: 50, maxX: 750, minY: 200, maxY: 550 },
    objects: [
      // Exit door back to lobby (matches createExitSign position)
      { id: 'door-lobby', type: 'door', x: 92, y: 340, emoji: '', action: 'zone-change', targetZone: 'lobby', label: 'Exit', width: 60, height: 40 },
      // Vinyl browser station (matches createVinylShelves position - large shelves)
      { id: 'vinyl-browser', type: 'vinyl', x: 100, y: 280, emoji: '', action: 'browse-vinyl', label: 'Browse Collection', width: 200, height: 200 },
      // DJ booth for playback controls (matches createDJBooth position)
      { id: 'dj-booth', type: 'dj', x: 550, y: 320, emoji: '', action: 'playback-controls', label: 'DJ Booth', width: 160, height: 120 },
      // Review board (matches createReviewBoard position)
      { id: 'review-board', type: 'info', x: 680, y: 350, emoji: '', action: 'view-reviews', label: 'Reviews', width: 100, height: 140 },
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
