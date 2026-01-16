const { createServer } = require('http');
const { Server } = require('socket.io');
const RoomManager = require('./core/RoomManager');
const GameRegistry = require('./core/GameRegistry');
const BoardGame = require('./games/board-game/BoardGame');
const CaptionContestGame = require('./games/caption-contest/CaptionContestGame');
const AboutYouGame = require('./games/about-you/AboutYouGame');
const AvalonGame = require('./games/avalon/AvalonGame');
const RecordStoreManager = require('./zones/RecordStoreManager');
const spotifyManager = require('./core/SpotifyManager');
const db = require('./database/connection');

// Load environment variables from .env file
require('dotenv').config();

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
gameRegistry.register('avalon', AvalonGame);

// Initialize room manager with game registry
const roomManager = new RoomManager(io, gameRegistry);

// Initialize record store manager
const recordStoreManager = new RecordStoreManager(io, roomManager);

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

  // ============ Admin Events ============
  socket.on('admin:reset-all', () => roomManager.adminResetAll(socket));

  // ============ Game-Specific Events (bg:, cap:, ay: prefixes) ============
  // Route game events to active game instance
  socket.onAny((event, data) => {
    // Game-prefixed events
    if (event.startsWith('bg:') || event.startsWith('cap:') || event.startsWith('ay:') || event.startsWith('av:')) {
      roomManager.handleGameEvent(socket, event, data);
    }
    // Record Store events
    if (event.startsWith('rs:')) {
      recordStoreManager.handleEvent(socket, event, data);
    }
  });

  // ============ Disconnect ============
  socket.on('disconnect', () => {
    console.log(`[Disconnect] ${socket.id}`);
    roomManager.handleDisconnect(socket);
  });
});

/**
 * Auto-authenticate with Spotify using stored refresh token
 */
async function initSpotify() {
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  if (!refreshToken) {
    console.log('[Spotify] No refresh token found - run "npm run spotify:setup" in joey-musselman-site');
    return false;
  }

  try {
    console.log('[Spotify] Auto-authenticating with stored refresh token...');

    // Call Next.js API to refresh the token
    const response = await fetch(`${clientUrl}/api/spotify/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Token refresh failed: ${response.status}`);
    }

    const tokens = await response.json();

    // Store as global host (single account for all rooms)
    spotifyManager.setGlobalTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || refreshToken,
      expires_at: tokens.expires_at,
    }, 'server');

    console.log('[Spotify] Auto-authenticated successfully! DJ Booth ready.');
    return true;
  } catch (err) {
    console.error('[Spotify] Auto-authentication failed:', err.message);
    console.log('[Spotify] You can still authenticate manually from the host screen');
    return false;
  }
}

// Start server
async function start() {
  // Connect to database
  const dbConnected = await db.connect();
  if (dbConnected) {
    console.log('[DB] Connected to PostgreSQL');
  } else {
    console.warn('[DB] Running without database - vinyl collection will be empty');
  }

  // Auto-authenticate with Spotify if refresh token is available
  await initSpotify();

  httpServer.listen(PORT, () => {
    console.log(`Clown Club server running on port ${PORT}`);
    console.log(`Available games: ${gameRegistry.getGameList().map(g => g.name).join(', ')}`);
  });
}

start();
