const WorldState = require('../world/WorldState');

class RoomManager {
  constructor(io, gameRegistry = null) {
    this.io = io;
    this.gameRegistry = gameRegistry;
    this.rooms = new Map(); // roomCode -> WorldState
    this.playerRooms = new Map(); // socketId -> roomCode
    this.gameSessions = new Map(); // roomCode -> { game, players[], hostSocketId }
    this.playerGames = new Map(); // socketId -> roomCode (which game they're in)
    this.spectators = new Map(); // socketId -> roomCode (spectators watching rooms)
    this.gameQueues = new Map(); // roomCode -> { gameType, players[] } - players waiting to start
  }

  /**
   * Generate a random 4-character room code
   */
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
      code = '';
      for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }

  /**
   * Create a new room
   */
  createRoom(socket, { playerName }) {
    const roomCode = this.generateRoomCode();
    const worldState = new WorldState(roomCode);

    // Add creator as first player
    const player = worldState.addPlayer(socket.id, playerName);

    // Store room
    this.rooms.set(roomCode, worldState);
    this.playerRooms.set(socket.id, roomCode);

    // Join socket.io room
    socket.join(roomCode);

    // Send confirmation
    socket.emit('cc:room-created', { roomCode });
    socket.emit('cc:world-state', worldState.getState());

    console.log(`[Room] Created ${roomCode} by ${playerName}`);
  }

  /**
   * Join an existing room (auto-creates LOBBY if needed)
   */
  joinRoom(socket, { roomCode, playerName }) {
    const code = roomCode.toUpperCase();
    let worldState = this.rooms.get(code);

    // Auto-create LOBBY room if it doesn't exist (persistent world)
    if (!worldState && code === 'LOBBY') {
      worldState = new WorldState(code);
      this.rooms.set(code, worldState);
      console.log(`[Room] Auto-created persistent LOBBY room`);
    }

    if (!worldState) {
      socket.emit('cc:error', { message: 'Room not found' });
      return;
    }

    // Leave any existing room first
    const existingRoom = this.playerRooms.get(socket.id);
    if (existingRoom && existingRoom !== code) {
      this.leaveRoom(socket);
    }

    // Add player to world
    const player = worldState.addPlayer(socket.id, playerName);

    // Track player's room
    this.playerRooms.set(socket.id, code);

    // Join socket.io room
    socket.join(code);

    // Notify others in room
    socket.to(code).emit('cc:player-joined', {
      playerId: socket.id,
      playerName: player.name,
      x: player.x,
      y: player.y,
      character: player.character,
    });

    // Send state to joining player
    socket.emit('cc:room-joined', { roomCode: code });
    socket.emit('cc:world-state', worldState.getState());

    console.log(`[Room] ${playerName} joined ${code}`);
  }

  /**
   * Join a room as a spectator (for host/TV display)
   */
  joinSpectator(socket, { roomCode }) {
    const code = roomCode.toUpperCase();
    let worldState = this.rooms.get(code);

    // Auto-create LOBBY room if it doesn't exist
    if (!worldState && code === 'LOBBY') {
      worldState = new WorldState(code);
      this.rooms.set(code, worldState);
      console.log(`[Room] Auto-created persistent LOBBY room for spectator`);
    }

    if (!worldState) {
      socket.emit('cc:error', { message: 'Room not found' });
      return;
    }

    // Track spectator
    this.spectators.set(socket.id, code);

    // Join socket.io room to receive broadcasts
    socket.join(code);

    // Send spectator confirmation
    socket.emit('cc:spectator-joined', {
      roomCode: code,
      playerCount: worldState.getPlayerCount(),
    });

    // Send full world state (same as players get)
    socket.emit('cc:world-state', worldState.getState());

    // If there's an active game, send game state too
    const gameSession = this.gameSessions.get(code);
    if (gameSession) {
      socket.emit('game:started', {
        gameType: gameSession.gameType,
        gameName: this.gameRegistry?.getGame(gameSession.gameType)?.name || 'Unknown',
      });
    }

    console.log(`[Room] Spectator joined ${code}`);
  }

  /**
   * Handle player movement
   */
  handleMove(socket, { x, y }) {
    const roomCode = this.playerRooms.get(socket.id);
    if (!roomCode) return;

    const worldState = this.rooms.get(roomCode);
    if (!worldState) return;

    // Update position (with validation)
    const player = worldState.movePlayer(socket.id, x, y);
    if (!player) return;

    // Broadcast to all in room (including sender for reconciliation)
    this.io.to(roomCode).emit('cc:player-moved', {
      playerId: socket.id,
      x: player.x,
      y: player.y,
    });
  }

  /**
   * Handle object interaction
   */
  handleInteract(socket, { objectId }) {
    const roomCode = this.playerRooms.get(socket.id);
    if (!roomCode) return;

    const worldState = this.rooms.get(roomCode);
    if (!worldState) return;

    const player = worldState.players.get(socket.id);
    const result = worldState.handleInteraction(socket.id, objectId);

    // If the interaction launches a game, include available games and broadcast to room
    if (result.action === 'launch-game' && this.gameRegistry) {
      result.availableGames = this.gameRegistry.getGameList();

      // Broadcast arcade activation to all in room (for host display)
      this.io.to(roomCode).emit('cc:arcade-activated', {
        playerId: socket.id,
        playerName: player?.name || 'Unknown',
        objectId,
      });
    }

    socket.emit('cc:interaction-result', {
      objectId,
      ...result,
    });
  }

  /**
   * Handle emote
   */
  handleEmote(socket, { emoteId }) {
    const roomCode = this.playerRooms.get(socket.id);
    if (!roomCode) return;

    // Broadcast emote to all in room
    this.io.to(roomCode).emit('cc:emote-played', {
      playerId: socket.id,
      emoteId,
    });
  }

  /**
   * Handle chat message
   */
  handleChat(socket, { message }) {
    const roomCode = this.playerRooms.get(socket.id);
    if (!roomCode) return;

    const worldState = this.rooms.get(roomCode);
    if (!worldState) return;

    const player = worldState.players.get(socket.id);
    if (!player) return;

    // Sanitize message (basic - remove scripts, limit length)
    const cleanMessage = message.slice(0, 100).replace(/[<>]/g, '');

    // Broadcast chat to all in room
    this.io.to(roomCode).emit('cc:chat-message', {
      playerId: socket.id,
      playerName: player.name,
      message: cleanMessage,
    });

    console.log(`[Chat] ${player.name}: ${cleanMessage}`);
  }

  /**
   * Send current world state to a socket (works for both players and spectators)
   */
  sendWorldState(socket) {
    // Check both players and spectators
    let roomCode = this.playerRooms.get(socket.id);
    if (!roomCode) {
      roomCode = this.spectators.get(socket.id);
    }
    if (!roomCode) return;

    const worldState = this.rooms.get(roomCode);
    if (!worldState) return;

    socket.emit('cc:world-state', worldState.getState());
    console.log(`[Room] Sent world state to ${socket.id} in ${roomCode}`);
  }

  // ============ Game Queue Management ============

  /**
   * Player joins the game queue (waiting for host to start)
   */
  joinGameQueue(socket, { gameType }) {
    const roomCode = this.playerRooms.get(socket.id);
    if (!roomCode) {
      socket.emit('game:error', { message: 'Not in a room' });
      return;
    }

    // Check if a game is already running
    if (this.gameSessions.has(roomCode)) {
      socket.emit('game:error', { message: 'A game is already in progress' });
      return;
    }

    const worldState = this.rooms.get(roomCode);
    if (!worldState) return;

    const player = worldState.players.get(socket.id);
    if (!player) return;

    // Get or create queue for this room
    let queue = this.gameQueues.get(roomCode);
    if (!queue) {
      queue = { gameType: gameType || 'board-game', players: [] };
      this.gameQueues.set(roomCode, queue);
    }

    // Check if player already in queue
    if (queue.players.find(p => p.id === socket.id)) {
      socket.emit('game:queue-joined', {
        position: queue.players.findIndex(p => p.id === socket.id) + 1,
        totalPlayers: queue.players.length
      });
      return;
    }

    // Add player to queue
    queue.players.push({ id: socket.id, name: player.name });

    console.log(`[Queue] ${player.name} joined queue in ${roomCode} (${queue.players.length} waiting)`);

    // Notify the player they joined
    socket.emit('game:queue-joined', {
      position: queue.players.length,
      totalPlayers: queue.players.length
    });

    // Broadcast queue update to entire room (so host can see)
    this.io.to(roomCode).emit('game:queue-update', {
      gameType: queue.gameType,
      players: queue.players,
      count: queue.players.length,
    });
  }

  /**
   * Player leaves the game queue
   */
  leaveGameQueue(socket) {
    const roomCode = this.playerRooms.get(socket.id);
    if (!roomCode) return;

    const queue = this.gameQueues.get(roomCode);
    if (!queue) return;

    const playerIndex = queue.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;

    const player = queue.players[playerIndex];
    queue.players.splice(playerIndex, 1);

    console.log(`[Queue] ${player.name} left queue in ${roomCode} (${queue.players.length} remaining)`);

    // Notify player they left
    socket.emit('game:queue-left');

    // If queue is empty, remove it
    if (queue.players.length === 0) {
      this.gameQueues.delete(roomCode);
    }

    // Broadcast queue update
    this.io.to(roomCode).emit('game:queue-update', {
      gameType: queue.gameType,
      players: queue.players,
      count: queue.players.length,
    });
  }

  /**
   * Host starts the game with queued players
   */
  startQueuedGame(socket) {
    // Only spectators (host display) can start the game
    const roomCode = this.spectators.get(socket.id);
    if (!roomCode) {
      socket.emit('game:error', { message: 'Only the host can start the game' });
      return;
    }

    const queue = this.gameQueues.get(roomCode);
    if (!queue || queue.players.length === 0) {
      socket.emit('game:error', { message: 'No players in queue' });
      return;
    }

    console.log(`[Queue] Host starting game with ${queue.players.length} queued players`);

    // Start the game with queued players
    // We need to pick a "host" player - use the first one who joined
    const hostPlayer = queue.players[0];
    const playerIds = queue.players.map(p => p.id);

    // Clear the queue
    this.gameQueues.delete(roomCode);

    // Broadcast queue cleared
    this.io.to(roomCode).emit('game:queue-update', {
      gameType: null,
      players: [],
      count: 0,
    });

    // Use the existing startGame logic but with a fake socket for the host player
    this.startGameWithPlayers(roomCode, queue.gameType, hostPlayer.id, playerIds);
  }

  /**
   * Internal method to start a game with specific players
   */
  startGameWithPlayers(roomCode, gameType, hostSocketId, playerIds) {
    if (!this.gameRegistry) {
      this.io.to(hostSocketId).emit('game:error', { message: 'Games not available' });
      return;
    }

    const worldState = this.rooms.get(roomCode);
    if (!worldState) {
      this.io.to(hostSocketId).emit('game:error', { message: 'Room not found' });
      return;
    }

    // Check if a game is already running
    if (this.gameSessions.has(roomCode)) {
      this.io.to(hostSocketId).emit('game:error', { message: 'A game is already running' });
      return;
    }

    // Get players for the game
    const gamePlayers = [];
    for (const playerId of playerIds) {
      const player = worldState.players.get(playerId);
      if (player) {
        gamePlayers.push({ id: playerId, name: player.name });
      }
    }

    // Validate player count
    const validation = this.gameRegistry.validatePlayerCount(gameType, gamePlayers.length);
    if (!validation.valid) {
      this.io.to(hostSocketId).emit('game:error', { message: validation.error });
      return;
    }

    // Create game-compatible room object
    const gameRoom = {
      code: roomCode,
      hostSocketId: hostSocketId,
      players: gamePlayers,
    };

    try {
      // Create game instance
      const game = this.gameRegistry.createGameInstance(gameType, gameRoom, this.io);

      // Store game session
      this.gameSessions.set(roomCode, {
        game,
        gameType,
        players: gamePlayers.map(p => p.id),
        hostSocketId: hostSocketId,
      });

      // Track which players are in the game
      for (const player of gamePlayers) {
        this.playerGames.set(player.id, roomCode);
      }

      // Notify all game players
      for (const player of gamePlayers) {
        this.io.to(player.id).emit('game:started', {
          gameType,
          gameName: this.gameRegistry.getGame(gameType).name,
          players: gamePlayers,
          isHost: player.id === hostSocketId,
        });
      }

      // Also broadcast to spectators in the room
      this.io.to(roomCode).emit('game:started', {
        gameType,
        gameName: this.gameRegistry.getGame(gameType).name,
        players: gamePlayers,
      });

      // Start the game
      game.start();

      console.log(`[Game] Started ${gameType} in room ${roomCode} with ${gamePlayers.length} players`);

    } catch (error) {
      console.error(`[Game] Failed to start ${gameType}:`, error);
      this.io.to(hostSocketId).emit('game:error', { message: error.message });
    }
  }

  // ============ Game Session Management ============

  /**
   * Start a game session in the room
   */
  startGame(socket, { gameType, playerIds }) {
    if (!this.gameRegistry) {
      socket.emit('game:error', { message: 'Games not available' });
      return;
    }

    const roomCode = this.playerRooms.get(socket.id);
    if (!roomCode) {
      socket.emit('game:error', { message: 'Not in a room' });
      return;
    }

    const worldState = this.rooms.get(roomCode);
    if (!worldState) {
      socket.emit('game:error', { message: 'Room not found' });
      return;
    }

    // Check if a game is already running in this room
    if (this.gameSessions.has(roomCode)) {
      socket.emit('game:error', { message: 'A game is already running in this room' });
      return;
    }

    // Get players for the game
    // If playerIds provided, use those; otherwise use all players in room
    let gamePlayers = [];
    if (playerIds && playerIds.length > 0) {
      // Use specific players
      for (const playerId of playerIds) {
        const player = worldState.players.get(playerId);
        if (player) {
          gamePlayers.push({ id: playerId, name: player.name });
        }
      }
    } else {
      // Use all players in room
      for (const [playerId, player] of worldState.players.entries()) {
        gamePlayers.push({ id: playerId, name: player.name });
      }
    }

    // Validate player count
    const validation = this.gameRegistry.validatePlayerCount(gameType, gamePlayers.length);
    if (!validation.valid) {
      socket.emit('game:error', { message: validation.error });
      return;
    }

    // Create game-compatible room object
    const gameRoom = {
      code: roomCode,
      hostSocketId: socket.id,
      players: gamePlayers,
    };

    try {
      // Create game instance
      const game = this.gameRegistry.createGameInstance(gameType, gameRoom, this.io);

      // Store game session
      this.gameSessions.set(roomCode, {
        game,
        gameType,
        players: gamePlayers.map(p => p.id),
        hostSocketId: socket.id,
      });

      // Track which players are in the game
      for (const player of gamePlayers) {
        this.playerGames.set(player.id, roomCode);
      }

      // Notify all game players
      for (const player of gamePlayers) {
        this.io.to(player.id).emit('game:started', {
          gameType,
          gameName: this.gameRegistry.getGame(gameType).name,
          players: gamePlayers,
          isHost: player.id === socket.id,
        });
      }

      // Also broadcast to spectators in the room
      this.io.to(roomCode).emit('game:started', {
        gameType,
        gameName: this.gameRegistry.getGame(gameType).name,
        players: gamePlayers,
      });

      // Start the game
      game.start();

      console.log(`[Game] Started ${gameType} in room ${roomCode} with ${gamePlayers.length} players`);

    } catch (error) {
      console.error(`[Game] Failed to start ${gameType}:`, error);
      socket.emit('game:error', { message: error.message });
    }
  }

  /**
   * Send game state to a player or spectator
   */
  sendGameState(socket) {
    console.log(`[Game] sendGameState called for ${socket.id}`);

    // Check if player is in a game
    let roomCode = this.playerGames.get(socket.id);
    let isSpectator = false;

    // If not a player, check if spectator
    if (!roomCode) {
      roomCode = this.spectators.get(socket.id);
      isSpectator = true;
    }

    if (!roomCode) {
      console.log(`[Game] ${socket.id} not in a game or spectating`);
      socket.emit('game:error', { message: 'Not in a game' });
      return;
    }

    const session = this.gameSessions.get(roomCode);
    if (!session) {
      console.log(`[Game] No active game session in room ${roomCode}`);
      socket.emit('game:error', { message: 'No active game' });
      return;
    }

    // Spectators always get host state (they're viewing the TV display)
    if (isSpectator) {
      const state = session.game.getHostState();
      console.log(`[Game] Sending host state to spectator ${socket.id}`);
      socket.emit('game:state', {
        gameType: session.gameType,
        isHost: true,
        isSpectator: true,
        ...state,
      });
      return;
    }

    // Regular player
    const isHost = session.hostSocketId === socket.id;
    const state = isHost
      ? session.game.getHostState()
      : session.game.getPlayerState(socket.id);

    console.log(`[Game] Sending state to ${socket.id}, isHost: ${isHost}`);
    socket.emit('game:state', {
      gameType: session.gameType,
      isHost,
      ...state,
    });
  }

  /**
   * Handle game-specific events
   */
  handleGameEvent(socket, event, data) {
    const roomCode = this.playerGames.get(socket.id);
    if (!roomCode) return;

    const session = this.gameSessions.get(roomCode);
    if (!session) return;

    // Route event to game instance
    session.game.handleEvent(socket, event, data);
  }

  /**
   * Leave the current game
   */
  leaveGame(socket) {
    const roomCode = this.playerGames.get(socket.id);
    if (!roomCode) return;

    const session = this.gameSessions.get(roomCode);
    if (!session) return;

    // Notify game of player disconnect
    session.game.onPlayerDisconnect(socket.id);

    // Remove player from game tracking
    this.playerGames.delete(socket.id);
    session.players = session.players.filter(id => id !== socket.id);

    // Notify player they left
    socket.emit('game:left', { roomCode });

    // If host left or no players remain, end the game
    if (socket.id === session.hostSocketId || session.players.length === 0) {
      this.endGameSession(roomCode);
    }

    console.log(`[Game] ${socket.id} left game in room ${roomCode}`);
  }

  /**
   * End a game session
   */
  endGameSession(roomCode) {
    const session = this.gameSessions.get(roomCode);
    if (!session) return;

    // Notify all players game ended
    for (const playerId of session.players) {
      this.io.to(playerId).emit('game:ended', { roomCode });
      this.playerGames.delete(playerId);
    }

    // Cleanup game instance
    session.game.destroy();

    // Remove session
    this.gameSessions.delete(roomCode);

    console.log(`[Game] Ended game session in room ${roomCode}`);
  }

  /**
   * Handle player disconnect
   */
  handleDisconnect(socket) {
    // Handle spectator disconnect
    if (this.spectators.has(socket.id)) {
      const roomCode = this.spectators.get(socket.id);
      this.spectators.delete(socket.id);
      console.log(`[Room] Spectator left ${roomCode}`);
      return;
    }

    // Handle game disconnect first
    if (this.playerGames.has(socket.id)) {
      this.leaveGame(socket);
    }

    // Handle room disconnect
    const roomCode = this.playerRooms.get(socket.id);
    if (!roomCode) return;

    const worldState = this.rooms.get(roomCode);
    if (worldState) {
      worldState.removePlayer(socket.id);

      // Notify others (including spectators)
      socket.to(roomCode).emit('cc:player-left', {
        playerId: socket.id,
      });

      // Clean up empty rooms (but keep LOBBY persistent)
      if (worldState.getPlayerCount() === 0 && roomCode !== 'LOBBY') {
        // Also clean up any game session
        if (this.gameSessions.has(roomCode)) {
          this.endGameSession(roomCode);
        }
        this.rooms.delete(roomCode);
        console.log(`[Room] Deleted empty room ${roomCode}`);
      }
    }

    this.playerRooms.delete(socket.id);
  }
}

module.exports = RoomManager;
