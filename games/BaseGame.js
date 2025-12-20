/**
 * BaseGame - Abstract base class for all games
 * All game implementations should extend this class
 */
class BaseGame {
  // Static properties - override in subclasses
  static gameName = 'Base Game';
  static description = 'Base game class';
  static minPlayers = 2;
  static maxPlayers = 8;

  constructor(room, io) {
    this.room = room;
    this.io = io;
    this.state = 'lobby';
    this.createdAt = Date.now();
  }

  /**
   * Get the current game state for the host/TV display
   * Override in subclass
   */
  getHostState() {
    return {
      state: this.state,
      players: this.room.players
    };
  }

  /**
   * Get the current game state for a specific player
   * Override in subclass
   */
  getPlayerState(playerId) {
    return {
      state: this.state
    };
  }

  /**
   * Handle a game-specific socket event
   * Override in subclass
   */
  handleEvent(socket, event, data) {
    console.warn(`Unhandled event: ${event}`);
  }

  /**
   * Called when a player disconnects mid-game
   * Override in subclass to handle cleanup
   */
  onPlayerDisconnect(playerId) {
    // Default: do nothing
  }

  /**
   * Called when the game should be cleaned up
   * Override in subclass if needed
   */
  destroy() {
    // Default: do nothing
  }

  // ============ Helper Methods ============

  /**
   * Broadcast to all players in the room
   */
  broadcast(event, data) {
    this.io.to(this.room.code).emit(event, data);
  }

  /**
   * Send to the host only
   */
  sendToHost(event, data) {
    this.io.to(this.room.hostSocketId).emit(event, data);
  }

  /**
   * Send to a specific player
   */
  sendToPlayer(playerId, event, data) {
    this.io.to(playerId).emit(event, data);
  }

  /**
   * Get a player by ID
   */
  getPlayer(playerId) {
    return this.room.players.find(p => p.id === playerId);
  }

  /**
   * Check if a socket is the host
   */
  isHost(socketId) {
    return socketId === this.room.hostSocketId;
  }

  /**
   * Check if a socket is a player in this room
   */
  isPlayer(socketId) {
    return this.room.players.some(p => p.id === socketId);
  }

  /**
   * Get all player IDs
   */
  getPlayerIds() {
    return this.room.players.map(p => p.id);
  }

  /**
   * Get player count
   */
  getPlayerCount() {
    return this.room.players.length;
  }

  /**
   * Transition to a new state
   */
  setState(newState) {
    const oldState = this.state;
    this.state = newState;
    console.log(`[Game] Room ${this.room.code}: ${oldState} → ${newState}`);
  }

  /**
   * Log a game event
   */
  log(message) {
    console.log(`[Game:${this.room.code}] ${message}`);
  }
}

module.exports = BaseGame;
