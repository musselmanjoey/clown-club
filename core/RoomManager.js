const WorldState = require('../world/WorldState');
const { DEFAULT_ZONE, getZone, zoneExists } = require('../world/ZoneConfig');

class RoomManager {
  constructor(io, gameRegistry = null) {
    this.io = io;
    this.gameRegistry = gameRegistry;
    this.playerRooms = new Map(); // socketId -> roomCode
    this.playerZones = new Map(); // socketId -> zoneId (which zone they're in within their room)
    this.zoneStates = new Map(); // "roomCode:zoneId" -> WorldState
    this.playerData = new Map(); // socketId -> { name, character, isVIP } (persistent player data)
    this.gameSessions = new Map(); // roomCode -> { game, players[], hostSocketId }
    this.playerGames = new Map(); // socketId -> roomCode (which game they're in)
    this.spectators = new Map(); // socketId -> roomCode (spectators watching rooms)
    this.spectatorZones = new Map(); // socketId -> zoneId (which zone spectator is viewing)
    this.gameQueues = new Map(); // roomCode -> { gameType, players[] } - players waiting to start
  }

  /**
   * Get or create a zone state for a room
   */
  getZoneState(roomCode, zoneId) {
    const key = `${roomCode}:${zoneId}`;
    if (!this.zoneStates.has(key)) {
      this.zoneStates.set(key, new WorldState(roomCode, zoneId));
    }
    return this.zoneStates.get(key);
  }

  /**
   * Get the socket.io room name for a zone
   */
  getZoneRoom(roomCode, zoneId) {
    return `${roomCode}:${zoneId}`;
  }

  // Legacy getter for backward compatibility
  get rooms() {
    // Return a Map-like object that provides lobby zone states
    const self = this;
    return {
      get(roomCode) {
        return self.getZoneState(roomCode, DEFAULT_ZONE);
      },
      has(roomCode) {
        return self.zoneStates.has(`${roomCode}:${DEFAULT_ZONE}`);
      },
      set(roomCode, worldState) {
        self.zoneStates.set(`${roomCode}:${DEFAULT_ZONE}`, worldState);
      },
      delete(roomCode) {
        // Delete all zones for this room
        for (const key of self.zoneStates.keys()) {
          if (key.startsWith(`${roomCode}:`)) {
            self.zoneStates.delete(key);
          }
        }
      }
    };
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
   * Players start in the default zone (lobby)
   */
  joinRoom(socket, { roomCode, playerName, character, isVIP }) {
    const code = roomCode.toUpperCase();
    const zoneId = DEFAULT_ZONE;

    // Get or create the zone state (auto-creates for LOBBY)
    const zoneState = this.getZoneState(code, zoneId);

    // Leave any existing room first
    const existingRoom = this.playerRooms.get(socket.id);
    if (existingRoom && existingRoom !== code) {
      this.leaveRoom(socket);
    }

    // Store persistent player data
    this.playerData.set(socket.id, { name: playerName, character, isVIP });

    // Add player to zone
    const player = zoneState.addPlayer(socket.id, playerName, character, isVIP);

    // Track player's room and zone
    this.playerRooms.set(socket.id, code);
    this.playerZones.set(socket.id, zoneId);

    // Join base room for room-wide events (game broadcasts)
    socket.join(code);

    // Join socket.io room for this zone
    const zoneRoom = this.getZoneRoom(code, zoneId);
    socket.join(zoneRoom);

    // Notify others in the same zone
    socket.to(zoneRoom).emit('cc:player-joined', {
      playerId: socket.id,
      playerName: player.name,
      x: player.x,
      y: player.y,
      character: player.character,
      isVIP: player.isVIP,
    });

    // Send state to joining player
    socket.emit('cc:room-joined', { roomCode: code });
    socket.emit('cc:world-state', zoneState.getState());

    console.log(`[Room] ${playerName} joined ${code}:${zoneId}`);
  }

  /**
   * Handle zone change (player moving between zones within a room)
   */
  handleZoneChange(socket, { targetZone }) {
    const roomCode = this.playerRooms.get(socket.id);
    if (!roomCode) {
      socket.emit('cc:error', { message: 'Not in a room' });
      return;
    }

    // Validate target zone exists
    if (!zoneExists(targetZone)) {
      socket.emit('cc:error', { message: 'Invalid zone' });
      return;
    }

    const currentZone = this.playerZones.get(socket.id) || DEFAULT_ZONE;
    if (currentZone === targetZone) {
      return; // Already in this zone
    }

    // Get player data
    const playerInfo = this.playerData.get(socket.id);
    if (!playerInfo) {
      socket.emit('cc:error', { message: 'Player data not found' });
      return;
    }

    // Get current zone state and remove player
    const currentZoneState = this.getZoneState(roomCode, currentZone);
    currentZoneState.removePlayer(socket.id);

    // Leave current zone's socket.io room
    const currentZoneRoom = this.getZoneRoom(roomCode, currentZone);
    socket.leave(currentZoneRoom);

    // Notify players in current zone that player left
    this.io.to(currentZoneRoom).emit('cc:player-left', {
      playerId: socket.id,
    });

    // Get target zone state and add player at spawn point
    const targetZoneState = this.getZoneState(roomCode, targetZone);
    const targetZoneConfig = getZone(targetZone);
    const player = targetZoneState.addPlayer(
      socket.id,
      playerInfo.name,
      playerInfo.character,
      playerInfo.isVIP
    );

    // Update zone tracking
    this.playerZones.set(socket.id, targetZone);

    // Join new zone's socket.io room
    const targetZoneRoom = this.getZoneRoom(roomCode, targetZone);
    socket.join(targetZoneRoom);

    // Send zone change confirmation with new state
    socket.emit('cc:zone-changed', {
      zoneId: targetZone,
      zoneName: targetZoneConfig.name,
    });
    socket.emit('cc:world-state', targetZoneState.getState());

    // Notify players in new zone that player joined
    socket.to(targetZoneRoom).emit('cc:player-joined', {
      playerId: socket.id,
      playerName: player.name,
      x: player.x,
      y: player.y,
      character: player.character,
      isVIP: player.isVIP,
    });

    console.log(`[Room] ${playerInfo.name} moved from ${currentZone} to ${targetZone} in ${roomCode}`);
  }

  /**
   * Join a room as a spectator (for host/TV display)
   * Spectators start viewing the default zone (lobby)
   */
  joinSpectator(socket, { roomCode }) {
    const code = roomCode.toUpperCase();
    const zoneId = DEFAULT_ZONE;

    // Get or create the zone state
    const zoneState = this.getZoneState(code, zoneId);

    // Track spectator
    this.spectators.set(socket.id, code);
    this.spectatorZones.set(socket.id, zoneId);

    // Join base room for room-wide events (queue updates, game events)
    socket.join(code);

    // Join socket.io room for this zone
    const zoneRoom = this.getZoneRoom(code, zoneId);
    socket.join(zoneRoom);

    // Send spectator confirmation
    socket.emit('cc:spectator-joined', {
      roomCode: code,
      zoneId: zoneId,
      playerCount: zoneState.getPlayerCount(),
    });

    // Send full world state
    socket.emit('cc:world-state', zoneState.getState());

    // If there's an active game, send game state too
    const gameSession = this.gameSessions.get(code);
    if (gameSession) {
      socket.emit('game:started', {
        gameType: gameSession.gameType,
        gameName: this.gameRegistry?.getGame(gameSession.gameType)?.name || 'Unknown',
      });
    }

    console.log(`[Room] Spectator joined ${code}:${zoneId}`);
  }

  /**
   * Handle spectator zone change (for host/TV switching between zones)
   */
  handleSpectatorZoneChange(socket, { zoneId }) {
    const roomCode = this.spectators.get(socket.id);
    if (!roomCode) {
      socket.emit('cc:error', { message: 'Not a spectator' });
      return;
    }

    if (!zoneExists(zoneId)) {
      socket.emit('cc:error', { message: 'Invalid zone' });
      return;
    }

    const currentZone = this.spectatorZones.get(socket.id) || DEFAULT_ZONE;
    if (currentZone === zoneId) {
      return; // Already viewing this zone
    }

    // Leave current zone room
    const currentZoneRoom = this.getZoneRoom(roomCode, currentZone);
    socket.leave(currentZoneRoom);

    // Join new zone room
    const newZoneRoom = this.getZoneRoom(roomCode, zoneId);
    socket.join(newZoneRoom);

    // Update tracking
    this.spectatorZones.set(socket.id, zoneId);

    // Send new zone state
    const zoneState = this.getZoneState(roomCode, zoneId);
    const zoneConfig = getZone(zoneId);

    socket.emit('cc:zone-changed', {
      zoneId: zoneId,
      zoneName: zoneConfig.name,
    });
    socket.emit('cc:world-state', zoneState.getState());

    console.log(`[Room] Spectator switched to ${zoneId} in ${roomCode}`);
  }

  /**
   * Handle player movement
   */
  handleMove(socket, { x, y }) {
    const roomCode = this.playerRooms.get(socket.id);
    if (!roomCode) return;

    const zoneId = this.playerZones.get(socket.id) || DEFAULT_ZONE;
    const zoneState = this.getZoneState(roomCode, zoneId);

    // Update position (with validation)
    const player = zoneState.movePlayer(socket.id, x, y);
    if (!player) return;

    // Broadcast to all in the same zone
    const zoneRoom = this.getZoneRoom(roomCode, zoneId);
    this.io.to(zoneRoom).emit('cc:player-moved', {
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

    const zoneId = this.playerZones.get(socket.id) || DEFAULT_ZONE;
    const zoneState = this.getZoneState(roomCode, zoneId);

    const player = zoneState.players.get(socket.id);
    const result = zoneState.handleInteraction(socket.id, objectId);

    // If the interaction launches a game, include available games and broadcast to zone
    if (result.action === 'launch-game' && this.gameRegistry) {
      result.availableGames = this.gameRegistry.getGameList();

      // Broadcast arcade activation to all in zone (for host display)
      const zoneRoom = this.getZoneRoom(roomCode, zoneId);
      this.io.to(zoneRoom).emit('cc:arcade-activated', {
        playerId: socket.id,
        playerName: player?.name || 'Unknown',
        objectId,
        gameType: result.gameType,
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

    const zoneId = this.playerZones.get(socket.id) || DEFAULT_ZONE;
    const zoneRoom = this.getZoneRoom(roomCode, zoneId);

    // Broadcast emote to all in zone
    this.io.to(zoneRoom).emit('cc:emote-played', {
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

    const zoneId = this.playerZones.get(socket.id) || DEFAULT_ZONE;
    const zoneState = this.getZoneState(roomCode, zoneId);

    const player = zoneState.players.get(socket.id);
    if (!player) return;

    // Sanitize message (basic - remove scripts, limit length)
    const cleanMessage = message.slice(0, 100).replace(/[<>]/g, '');

    // Broadcast chat to all in zone
    const zoneRoom = this.getZoneRoom(roomCode, zoneId);
    this.io.to(zoneRoom).emit('cc:chat-message', {
      playerId: socket.id,
      playerName: player.name,
      message: cleanMessage,
    });
  }

  /**
   * Send current world state to a socket (works for both players and spectators)
   */
  sendWorldState(socket) {
    // Check if player
    let roomCode = this.playerRooms.get(socket.id);
    let zoneId = this.playerZones.get(socket.id);

    // Check if spectator
    if (!roomCode) {
      roomCode = this.spectators.get(socket.id);
      zoneId = this.spectatorZones.get(socket.id);
    }

    if (!roomCode) return;
    zoneId = zoneId || DEFAULT_ZONE;

    const zoneState = this.getZoneState(roomCode, zoneId);
    socket.emit('cc:world-state', zoneState.getState());
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

    // Get player data (persistent across zones)
    const player = this.playerData.get(socket.id);
    if (!player) {
      console.log(`[Queue] Player data not found for ${socket.id}`);
      return;
    }

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
   * Send current queue state to a socket (for host to refresh)
   */
  sendQueueState(socket) {
    // Check if spectator or player
    let roomCode = this.spectators.get(socket.id);
    if (!roomCode) {
      roomCode = this.playerRooms.get(socket.id);
    }
    if (!roomCode) {
      console.log(`[Queue] sendQueueState: socket ${socket.id} not in any room`);
      return;
    }

    const queue = this.gameQueues.get(roomCode);

    socket.emit('game:queue-update', {
      gameType: queue?.gameType || null,
      players: queue?.players || [],
      count: queue?.players?.length || 0,
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

    // Check if a game is already running
    if (this.gameSessions.has(roomCode)) {
      this.io.to(hostSocketId).emit('game:error', { message: 'A game is already running' });
      return;
    }

    // Get players for the game using playerData (zone-agnostic)
    const gamePlayers = [];
    for (const playerId of playerIds) {
      const player = this.playerData.get(playerId);
      if (player) {
        gamePlayers.push({ id: playerId, name: player.name });
      } else {
        console.log(`[Game] Player ${playerId} not found in playerData`);
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
    // Check if sender is a player
    let roomCode = this.playerGames.get(socket.id);

    // Also allow spectators (host) to send certain game events
    if (!roomCode) {
      roomCode = this.spectators.get(socket.id);
    }

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
      this.spectatorZones.delete(socket.id);
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

    const zoneId = this.playerZones.get(socket.id) || DEFAULT_ZONE;
    const zoneState = this.getZoneState(roomCode, zoneId);

    if (zoneState) {
      zoneState.removePlayer(socket.id);

      // Notify others in the same zone
      const zoneRoom = this.getZoneRoom(roomCode, zoneId);
      this.io.to(zoneRoom).emit('cc:player-left', {
        playerId: socket.id,
      });

      // Clean up empty rooms (but keep LOBBY persistent)
      // Check if ALL zones in the room are empty
      let totalPlayers = 0;
      for (const [key, state] of this.zoneStates.entries()) {
        if (key.startsWith(`${roomCode}:`)) {
          totalPlayers += state.getPlayerCount();
        }
      }

      if (totalPlayers === 0 && roomCode !== 'LOBBY') {
        // Also clean up any game session
        if (this.gameSessions.has(roomCode)) {
          this.endGameSession(roomCode);
        }
        // Delete all zones for this room
        for (const key of this.zoneStates.keys()) {
          if (key.startsWith(`${roomCode}:`)) {
            this.zoneStates.delete(key);
          }
        }
        console.log(`[Room] Deleted empty room ${roomCode}`);
      }
    }

    // Clean up player tracking
    this.playerRooms.delete(socket.id);
    this.playerZones.delete(socket.id);
    this.playerData.delete(socket.id);
  }

  /**
   * Leave current room (called when switching rooms)
   */
  leaveRoom(socket) {
    const roomCode = this.playerRooms.get(socket.id);
    if (!roomCode) return;

    const zoneId = this.playerZones.get(socket.id) || DEFAULT_ZONE;
    const zoneState = this.getZoneState(roomCode, zoneId);

    if (zoneState) {
      zoneState.removePlayer(socket.id);

      // Notify others in the same zone
      const zoneRoom = this.getZoneRoom(roomCode, zoneId);
      socket.leave(zoneRoom);
      this.io.to(zoneRoom).emit('cc:player-left', {
        playerId: socket.id,
      });
    }

    this.playerRooms.delete(socket.id);
    this.playerZones.delete(socket.id);
  }
}

module.exports = RoomManager;
