/**
 * GameRegistry - Registers and manages available games
 */
class GameRegistry {
  constructor() {
    this.games = new Map();
  }

  /**
   * Register a game class
   */
  register(gameId, GameClass) {
    this.games.set(gameId, {
      id: gameId,
      name: GameClass.gameName || gameId,
      description: GameClass.description || '',
      minPlayers: GameClass.minPlayers || 2,
      maxPlayers: GameClass.maxPlayers || 8,
      GameClass
    });
    console.log(`[GameRegistry] Registered: ${GameClass.gameName || gameId}`);
  }

  /**
   * Get list of available games (safe to send to clients)
   */
  getGameList() {
    return Array.from(this.games.values()).map(g => ({
      id: g.id,
      name: g.name,
      description: g.description,
      minPlayers: g.minPlayers,
      maxPlayers: g.maxPlayers
    }));
  }

  /**
   * Get a game definition by ID
   */
  getGame(gameId) {
    return this.games.get(gameId);
  }

  /**
   * Check if a game exists
   */
  hasGame(gameId) {
    return this.games.has(gameId);
  }

  /**
   * Create a new instance of a game
   */
  createGameInstance(gameId, room, io) {
    const game = this.games.get(gameId);
    if (!game) {
      throw new Error(`Unknown game: ${gameId}`);
    }
    return new game.GameClass(room, io);
  }

  /**
   * Validate player count for a game
   */
  validatePlayerCount(gameId, playerCount) {
    const game = this.games.get(gameId);
    if (!game) return { valid: false, error: 'Game not found' };

    if (playerCount < game.minPlayers) {
      return {
        valid: false,
        error: `Need at least ${game.minPlayers} players`
      };
    }
    if (playerCount > game.maxPlayers) {
      return {
        valid: false,
        error: `Maximum ${game.maxPlayers} players allowed`
      };
    }
    return { valid: true };
  }
}

module.exports = GameRegistry;
