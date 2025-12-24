# Clown Club Server

Canonical game server for multiplayer party games and virtual world lobby. Club Penguin-style experience.

## Commands

```bash
npm run dev      # Start with auto-reload (port 3015)
npm start        # Production start
```

## Project Structure

```
clown-club/
├── server.js              # Entry point, Socket.IO setup
├── core/
│   ├── RoomManager.js     # Room, spectator, game session, zone management
│   └── GameRegistry.js    # Game type registration
├── games/
│   ├── BaseGame.js        # Abstract base class for all games
│   ├── board-game/
│   │   └── BoardGame.js   # Party board game implementation
│   └── caption-contest/
│       └── CaptionContestGame.js  # Caption contest game
├── world/
│   ├── WorldState.js      # Zone-aware player positions, interactions
│   └── ZoneConfig.js      # Zone definitions (lobby, games room)
├── data/
│   └── (config files)     # World configuration
└── client/                # (Reserved for future client code)
```

## Key Files

- `server.js` - Socket.IO server entry, event routing
- `core/RoomManager.js` - Manages rooms, players, spectators, game sessions, queues, zones
- `core/GameRegistry.js` - Registers game types, validates player counts
- `games/BaseGame.js` - Base class all games extend
- `world/WorldState.js` - Zone-aware virtual world player state
- `world/ZoneConfig.js` - Zone definitions with objects, spawn points, bounds

## Zone System

Club Penguin-style multi-room navigation. Players can move between zones within a room.

### Zones
- `lobby` - Main town square with buildings, door to games room
- `games` - Arcade room with game cabinets (Board Rush, Caption Contest)

### Socket Rooms
Players join multiple socket.io rooms:
- Base room (`LOBBY`) - for room-wide events (game broadcasts)
- Zone room (`LOBBY:lobby`, `LOBBY:games`) - for zone-specific events

### Zone Events
```
cc:change-zone           Player requests zone change
cc:zone-changed          Server confirms zone change
cc:spectator-change-zone Host switches viewing zone
```

## Socket Event Convention

### World Events (cc: prefix)
```
Client -> Server:
  cc:create-room     Create private room
  cc:join-room       Join room as player
  cc:join-spectator  Join as spectator/host display
  cc:move            Player movement {x, y}
  cc:interact        Object interaction {objectId}
  cc:emote           Play emote {emoteId}
  cc:chat            Chat message {message}
  cc:request-state   Request world state sync

Server -> Client:
  cc:room-created    Room created confirmation
  cc:room-joined     Successfully joined room
  cc:spectator-joined Spectator connected
  cc:world-state     Full world state
  cc:player-joined   New player in room
  cc:player-left     Player disconnected
  cc:player-moved    Position update
  cc:chat-message    Chat broadcast
  cc:emote-played    Emote broadcast
  cc:arcade-activated Player triggered arcade
  cc:error           Error message
```

### Game Management Events (game: prefix)
```
Client -> Server:
  game:get-list      Get available games
  game:join-queue    Join waiting queue
  game:leave-queue   Leave queue
  game:start-queued  Host starts queued game
  game:start         Start game with players
  game:request-state Request game state
  game:leave         Leave current game

Server -> Client:
  game:list          Available games
  game:queue-joined  Joined queue confirmation
  game:queue-left    Left queue confirmation
  game:queue-update  Queue state broadcast
  game:started       Game started
  game:state         Current game state
  game:ended         Game ended
  game:error         Game error
```

### Game-Specific Events
- `bg:*` - Board Game events
- `cap:*` - Caption Contest events

## Adding a New Game

1. Create `games/my-game/MyGame.js` extending BaseGame:
```javascript
const BaseGame = require('../BaseGame');

class MyGame extends BaseGame {
  static get metadata() {
    return {
      name: 'My Game',
      description: 'Game description',
      minPlayers: 2,
      maxPlayers: 8,
      eventPrefix: 'mg'  // mg:* events
    };
  }

  start() { /* Initialize game */ }
  handleEvent(socket, event, data) { /* Handle mg:* events */ }
  getHostState() { /* State for host display */ }
  getPlayerState(playerId) { /* State for specific player */ }
  onPlayerDisconnect(playerId) { /* Cleanup */ }
  destroy() { /* Final cleanup */ }
}
```

2. Register in `server.js`:
```javascript
const MyGame = require('./games/my-game/MyGame');
gameRegistry.register('my-game', MyGame);
```

3. Add arcade cabinet in `world/ZoneConfig.js`:
```javascript
{ id: 'arcade-mygame', type: 'arcade', x: 459, y: 319, emoji: '', action: 'launch-game', gameType: 'my-game', label: 'My Game' }
```

4. Create client scenes in `joey-musselman-site/lib/clown-club/phaser/scenes/`:
   - `MyGameScene.ts` - Player controller (800x600)
   - `HostMyGameScene.ts` - TV display (1280x720)

5. Register scenes in Phaser wrappers:
   - `PhaserWrapper.tsx` - Add to player scene list
   - `HostPhaserWrapper.tsx` - Add to host scene list

## Related Projects

| Project | Path | Description |
|---------|------|-------------|
| Frontend | `../joey-musselman-site/` | Next.js client (port 3000) |
| Ports Registry | `../ports.json` | Central port allocation |
| Legacy Server | `../party-games-server/` | Archive - has styling to preserve |

## Environment Variables

- `PORT` - Server port (default: 3015)
- `CLIENT_URL` - Production client URL for CORS

## Pre-Commit Checklist

1. No `.env*` files (except .example)
2. No API keys or credentials
3. Test with at least 2 players

## IMPORTANT

- This is the CANONICAL game server (replaces party-games-server)
- All games use BaseGame pattern
- Socket events are prefixed by domain (cc:, game:, bg:, cap:)
- RoomManager handles all room/player/game lifecycle
