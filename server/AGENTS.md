# Clown Club Server

## Stack
Node.js + Socket.IO

## Event Handling
All `cc:` prefixed events are routed through the main handler.
Server is authoritative for all player positions.

## Room Lifecycle
1. `cc:create-room` -> generate room code, create room state
2. `cc:join-room` -> add player to room, broadcast to others
3. Player disconnect -> remove from room, broadcast departure

## File Responsibilities

| File | Purpose |
|------|---------|
| `server.js` | Entry point, HTTP + Socket.IO setup |
| `core/RoomManager.js` | Room creation, joining, leaving |
| `core/PlayerManager.js` | Player state within rooms |
| `world/WorldState.js` | Player positions and world objects |
| `world/InteractionHandler.js` | Handle object interactions |
| `data/world-config.json` | Zone layouts, spawn points, objects |

## Adding New Interaction

1. Define object in `data/world-config.json`
2. Add handler case in `world/InteractionHandler.js`
3. Emit result via `cc:interaction-result`

## Event Reference

### Incoming (from client)
- `cc:create-room` - Create new room
- `cc:join-room` - Join existing room
- `cc:move` - Player position update
- `cc:interact` - Object interaction
- `cc:emote` - Player emote

### Outgoing (to clients)
- `cc:room-created` - Room code on creation
- `cc:room-joined` - Confirmation + player list
- `cc:world-state` - Full state sync
- `cc:player-moved` - Position broadcast
- `cc:player-joined` - New player notification
- `cc:player-left` - Disconnect notification
- `cc:interaction-result` - Interaction response
