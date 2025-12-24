const { createServer } = require('http');
const { Server } = require('socket.io');
const RoomManager = require('./core/RoomManager');
const GameRegistry = require('./core/GameRegistry');
const BoardGame = require('./games/board-game/BoardGame');
const CaptionContestGame = require('./games/caption-contest/CaptionContestGame');
const AboutYouGame = require('./games/about-you/AboutYouGame');

const PORT = process.env.PORT || 3015;

// Create HTTP server
const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Clown Club Server (with Party Games)');
});

// Allowed origins for CORS
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3003',
  'http://127.0.0.1:3000',
  process.env.CLIENT_URL, // Vercel URL
].filter(Boolean);

// Create Socket.IO server
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

// Initialize game registry
const gameRegistry = new GameRegistry();
gameRegistry.register('board-game', BoardGame);
gameRegistry.register('caption-contest', CaptionContestGame);
gameRegistry.register('about-you', AboutYouGame);

// Initialize room manager with game registry
const roomManager = new RoomManager(io, gameRegistry);

// Socket connection handler
io.on('connection', (socket) => {
  console.log(`[Connect] ${socket.id}`);

  // ============ World Events (cc: prefix) ============
  socket.on('cc:create-room', (data) => roomManager.createRoom(socket, data));
  socket.on('cc:join-room', (data) => roomManager.joinRoom(socket, data));
  socket.on('cc:join-spectator', (data) => roomManager.joinSpectator(socket, data));
  socket.on('cc:change-zone', (data) => roomManager.handleZoneChange(socket, data));
  socket.on('cc:spectator-change-zone', (data) => roomManager.handleSpectatorZoneChange(socket, data));
  socket.on('cc:move', (data) => roomManager.handleMove(socket, data));
  socket.on('cc:interact', (data) => roomManager.handleInteract(socket, data));
  socket.on('cc:emote', (data) => roomManager.handleEmote(socket, data));
  socket.on('cc:chat', (data) => roomManager.handleChat(socket, data));
  socket.on('cc:request-state', () => roomManager.sendWorldState(socket));

  // ============ Game Queue Events ============
  socket.on('game:join-queue', (data) => roomManager.joinGameQueue(socket, data));
  socket.on('game:leave-queue', () => roomManager.leaveGameQueue(socket));
  socket.on('game:start-queued', () => roomManager.startQueuedGame(socket));
  socket.on('game:request-queue', () => roomManager.sendQueueState(socket));

  // ============ Game Management Events ============
  socket.on('game:get-list', () => {
    socket.emit('game:list', gameRegistry.getGameList());
  });

  socket.on('game:start', (data) => roomManager.startGame(socket, data));
  socket.on('game:request-state', () => roomManager.sendGameState(socket));
  socket.on('game:leave', () => roomManager.leaveGame(socket));

  // ============ Game-Specific Events (bg:, cap:, ay: prefixes) ============
  // Route game events to active game instance
  socket.onAny((event, data) => {
    // Only handle game-prefixed events
    if (event.startsWith('bg:') || event.startsWith('cap:') || event.startsWith('ay:')) {
      roomManager.handleGameEvent(socket, event, data);
    }
  });

  // ============ Disconnect ============
  socket.on('disconnect', () => {
    console.log(`[Disconnect] ${socket.id}`);
    roomManager.handleDisconnect(socket);
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`Clown Club server running on port ${PORT}`);
  console.log(`Available games: ${gameRegistry.getGameList().map(g => g.name).join(', ')}`);
});
