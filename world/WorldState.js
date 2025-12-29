const { getZone, DEFAULT_ZONE } = require('./ZoneConfig');

class WorldState {
  constructor(roomCode, zoneId = DEFAULT_ZONE) {
    this.roomCode = roomCode;
    this.zoneId = zoneId;
    this.players = new Map(); // socketId -> player data

    // Load zone-specific configuration
    const zoneConfig = getZone(zoneId);
    this.zoneName = zoneConfig.name;
    this.spawnPoint = zoneConfig.spawnPoint;
    this.bounds = zoneConfig.bounds;
    this.objects = zoneConfig.objects;
  }

  /**
   * Add a player to the world
   */
  addPlayer(socketId, name, character = '🤡', isVIP = false, spawnX = null, spawnY = null) {
    // Limit name to 8 characters
    const safeName = (name || `Player${this.players.size + 1}`).slice(0, 8);

    // Use provided spawn position or zone's default spawn with slight randomness
    const x = spawnX !== null ? spawnX : this.spawnPoint.x + (Math.random() - 0.5) * 50;
    const y = spawnY !== null ? spawnY : this.spawnPoint.y + (Math.random() - 0.5) * 50;

    const player = {
      id: socketId,
      name: safeName,
      x,
      y,
      character: character || '🤡',
      isVIP: isVIP || false,
    };

    this.players.set(socketId, player);
    return player;
  }

  /**
   * Remove a player from the world
   */
  removePlayer(socketId) {
    this.players.delete(socketId);
  }

  /**
   * Move a player (with bounds validation)
   */
  movePlayer(socketId, x, y) {
    const player = this.players.get(socketId);
    if (!player) return null;

    // Clamp to zone bounds
    player.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, x));
    player.y = Math.max(this.bounds.minY, Math.min(this.bounds.maxY, y));

    return player;
  }

  /**
   * Handle object interaction
   */
  handleInteraction(socketId, objectId) {
    const obj = this.objects.find((o) => o.id === objectId);
    if (!obj) {
      return { success: false, message: 'Object not found' };
    }

    switch (obj.action) {
      case 'zone-change':
        return {
          success: true,
          action: 'zone-change',
          targetZone: obj.targetZone,
          label: obj.label,
        };
      case 'launch-game':
        return {
          success: true,
          action: 'launch-game',
          gameType: obj.gameType,
          label: obj.label,
        };
      case 'under-construction':
        return {
          success: true,
          action: 'under-construction',
          message: obj.message || 'Coming soon!',
          label: obj.label,
        };
      case 'browse-vinyl':
        return {
          success: true,
          action: 'browse-vinyl',
          label: obj.label,
        };
      case 'playback-controls':
        return {
          success: true,
          action: 'playback-controls',
          label: obj.label,
        };
      case 'view-reviews':
        return {
          success: true,
          action: 'view-reviews',
          label: obj.label,
        };
      default:
        return { success: true, action: 'none' };
    }
  }

  /**
   * Get player count
   */
  getPlayerCount() {
    return this.players.size;
  }

  /**
   * Get full world state for sync
   */
  getState() {
    return {
      roomCode: this.roomCode,
      zoneId: this.zoneId,
      zoneName: this.zoneName,
      players: Array.from(this.players.values()),
      objects: this.objects,
    };
  }

  /**
   * Get a player's data
   */
  getPlayer(socketId) {
    return this.players.get(socketId);
  }
}

module.exports = WorldState;
