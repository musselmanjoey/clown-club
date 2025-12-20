const CHARACTERS = ['penguin', 'bear', 'fox', 'cat', 'dog', 'rabbit'];
const SPAWN_POINT = { x: 400, y: 300 };
const WORLD_BOUNDS = { minX: 50, maxX: 750, minY: 50, maxY: 550 };

class WorldState {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = new Map(); // socketId -> player data
    this.characterIndex = 0;

    // Interactive objects in the world
    this.objects = [
      { id: 'door-1', type: 'door', x: 700, y: 300, emoji: '🚪', action: 'zone-change' },
      { id: 'arcade-1', type: 'arcade', x: 200, y: 150, emoji: '🕹️', action: 'launch-game' },
      { id: 'tree-1', type: 'decoration', x: 100, y: 400, emoji: '🌲' },
      { id: 'tree-2', type: 'decoration', x: 600, y: 450, emoji: '🌲' },
    ];
  }

  /**
   * Add a player to the world
   */
  addPlayer(socketId, name, character = '🤡', isVIP = false) {
    // Limit name to 8 characters
    const safeName = (name || `Player${this.players.size + 1}`).slice(0, 8);

    const player = {
      id: socketId,
      name: safeName,
      x: SPAWN_POINT.x + (Math.random() - 0.5) * 50,
      y: SPAWN_POINT.y + (Math.random() - 0.5) * 50,
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

    // Clamp to world bounds
    player.x = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, x));
    player.y = Math.max(WORLD_BOUNDS.minY, Math.min(WORLD_BOUNDS.maxY, y));

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
        return { success: true, action: 'zone-change', zone: 'lobby' };
      case 'launch-game':
        return { success: true, action: 'launch-game', game: 'party-games' };
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
      players: Array.from(this.players.values()),
      objects: this.objects,
    };
  }
}

module.exports = WorldState;
