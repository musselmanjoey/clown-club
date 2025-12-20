const { createServer } = require('http');
const { Server } = require('socket.io');
const RoomManager = require('./core/RoomManager');

const PORT = process.env.PORT || 3015;

// Create HTTP server
const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Clown Club Server');
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

// Initialize room manager
const roomManager = new RoomManager(io);

// Socket connection handler
io.on('connection', (socket) => {
  console.log(`[Connect] ${socket.id}`);

  // Room events
  socket.on('cc:create-room', (data) => roomManager.createRoom(socket, data));
  socket.on('cc:join-room', (data) => roomManager.joinRoom(socket, data));

  // Game events (delegated to room)
  socket.on('cc:move', (data) => roomManager.handleMove(socket, data));
  socket.on('cc:interact', (data) => roomManager.handleInteract(socket, data));
  socket.on('cc:emote', (data) => roomManager.handleEmote(socket, data));
  socket.on('cc:chat', (data) => roomManager.handleChat(socket, data));
  socket.on('cc:request-state', () => roomManager.sendWorldState(socket));

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`[Disconnect] ${socket.id}`);
    roomManager.handleDisconnect(socket);
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`Clown Club server running on port ${PORT}`);
});
