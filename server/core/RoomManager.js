const WorldState = require('../world/WorldState');

class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // roomCode -> WorldState
    this.playerRooms = new Map(); // socketId -> roomCode
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
   * Join an existing room
   */
  joinRoom(socket, { roomCode, playerName }) {
    const code = roomCode.toUpperCase();
    const worldState = this.rooms.get(code);

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

    const result = worldState.handleInteraction(socket.id, objectId);

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
   * Send current world state to a socket
   */
  sendWorldState(socket) {
    const roomCode = this.playerRooms.get(socket.id);
    if (!roomCode) return;

    const worldState = this.rooms.get(roomCode);
    if (!worldState) return;

    socket.emit('cc:world-state', worldState.getState());
    console.log(`[Room] Sent world state to ${socket.id} in ${roomCode}`);
  }

  /**
   * Handle player disconnect
   */
  handleDisconnect(socket) {
    const roomCode = this.playerRooms.get(socket.id);
    if (!roomCode) return;

    const worldState = this.rooms.get(roomCode);
    if (worldState) {
      worldState.removePlayer(socket.id);

      // Notify others
      socket.to(roomCode).emit('cc:player-left', {
        playerId: socket.id,
      });

      // Clean up empty rooms
      if (worldState.getPlayerCount() === 0) {
        this.rooms.delete(roomCode);
        console.log(`[Room] Deleted empty room ${roomCode}`);
      }
    }

    this.playerRooms.delete(socket.id);
  }
}

module.exports = RoomManager;
