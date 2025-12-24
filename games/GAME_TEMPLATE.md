# Game Template Guide

Complete guide for creating new multiplayer party games in the Clown Club system.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js)                             │
│  joey-musselman-site/                                                       │
│  ├── app/clown-club/              # Entry points                            │
│  │   ├── page.tsx                 # Player join screen                      │
│  │   ├── host/page.tsx            # Host/TV display                         │
│  │   └── world/[roomCode]/        # World view                              │
│  └── lib/clown-club/phaser/                                                 │
│      ├── config.ts                # Register scenes here                    │
│      ├── scenes/                                                            │
│      │   ├── LobbyScene.ts        # Player world + game launch              │
│      │   ├── GamesRoomScene.ts    # Arcade room with cabinets               │
│      │   ├── HostWorldScene.ts    # Host view + game queue overlay          │
│      │   ├── MyGameScene.ts       # YOUR PLAYER SCENE                       │
│      │   └── HostMyGameScene.ts   # YOUR HOST SCENE                         │
│      └── HostPhaserWrapper.tsx    # Register host scenes here               │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ Socket.IO
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND (Node.js)                              │
│  clown-club/                                                                │
│  ├── server.js                    # Register game here                      │
│  ├── core/                                                                  │
│  │   ├── RoomManager.js           # Handles queues, game lifecycle          │
│  │   └── GameRegistry.js          # Game registration                       │
│  └── games/                                                                 │
│      ├── BaseGame.js              # Extend this class                       │
│      └── my-game/                                                           │
│          └── MyGame.js            # YOUR GAME LOGIC                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Game Lifecycle

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   LOBBY      │────▶│    QUEUE     │────▶│   PLAYING    │────▶│    ENDED     │
│              │     │              │     │              │     │              │
│ Players walk │     │ Players join │     │ Game phases  │     │ Return to    │
│ to cabinet   │     │ game queue   │     │ run here     │     │ lobby        │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                            │
                     Host clicks
                     "Start Game"
```

### Queue System Flow

1. **Player clicks arcade cabinet** → `game:join-queue { gameType: 'my-game' }`
2. **Server adds to queue** → broadcasts `game:queue-update` to all in room
3. **Host sees queue overlay** → shows player list + "Start Game" button
4. **Host clicks start** → `game:start-queued`
5. **Server creates game** → broadcasts `game:started { gameType, players }`
6. **Scenes launch** → Player: `MyGameScene`, Host: `HostMyGameScene`

## Step-by-Step: Adding a New Game

### Step 1: Create Server Game Class

Create `clown-club/games/my-game/MyGame.js`:

```javascript
const BaseGame = require('../BaseGame');

class MyGame extends BaseGame {
  // ============ STATIC CONFIG ============
  static gameName = 'My Game';
  static description = 'A fun party game!';
  static minPlayers = 2;
  static maxPlayers = 8;
  static totalRounds = 5;  // Optional: for round-based games

  // Timer durations in milliseconds
  static TIMERS = {
    intro: 3000,
    playing: 30000,
    results: 5000,
  };

  // ============ CONSTRUCTOR ============
  constructor(room, io) {
    super(room, io);

    // Game state
    this.phase = 'waiting';
    this.currentRound = 0;
    this.scores = new Map();  // playerId -> score
    this.timer = null;
    this.timerInterval = null;

    // Initialize scores
    for (const player of this.room.players) {
      this.scores.set(player.id, 0);
    }
  }

  // ============ LIFECYCLE ============

  start() {
    this.log('Game started');
    this.nextRound();
  }

  nextRound() {
    this.currentRound++;
    this.startPhase('intro');
  }

  startPhase(phase) {
    this.clearTimer();
    this.phase = phase;
    this.setState(phase);

    const duration = MyGame.TIMERS[phase];
    this.log(`Phase: ${phase} (${duration}ms)`);

    switch (phase) {
      case 'intro':
        this.broadcastPhase('intro', { round: this.currentRound });
        this.startTimer(duration, () => this.startPhase('playing'));
        break;

      case 'playing':
        this.broadcastPhase('playing', {
          round: this.currentRound,
          timer: Math.ceil(duration / 1000),
        });
        this.startTimer(duration, () => this.endPlaying());
        break;

      case 'results':
        this.showResults();
        break;

      case 'game-over':
        this.showGameOver();
        break;
    }
  }

  endPlaying() {
    // Process submissions, calculate scores, etc.
    this.startPhase('results');
  }

  showResults() {
    const duration = MyGame.TIMERS.results;

    this.broadcastPhase('results', {
      round: this.currentRound,
      scores: this.getScoreboard(),
      isLastRound: this.currentRound >= MyGame.totalRounds,
    });

    // Wait for host to click next round (don't auto-advance)
  }

  showGameOver() {
    const scores = this.getScoreboard();
    const winner = scores[0];

    this.broadcastPhase('game-over', {
      winner: winner ? { name: winner.name, score: winner.score } : null,
      finalScores: scores,
    });

    // End game after delay
    this.startTimer(5000, () => this.endGame());
  }

  endGame() {
    this.setState('ended');
    this.log('Game ended');
    this.broadcast('game:ended', {
      gameType: 'my-game',
      finalScores: this.getScoreboard(),
    });
  }

  // ============ EVENT HANDLING ============

  handleEvent(socket, event, data) {
    switch (event) {
      case 'mg:submit':
        this.handleSubmit(socket, data);
        break;
      case 'mg:next-round':
        this.handleNextRound(socket);
        break;
    }
  }

  handleSubmit(socket, data) {
    if (this.phase !== 'playing') return;
    // Process player submission
    this.log(`${socket.id} submitted: ${JSON.stringify(data)}`);
  }

  handleNextRound(socket) {
    if (this.phase !== 'results') return;

    if (this.currentRound >= MyGame.totalRounds) {
      this.startPhase('game-over');
    } else {
      this.nextRound();
    }
  }

  // ============ STATE GETTERS ============

  // Called when host requests game state
  getHostState() {
    return {
      gameType: 'my-game',
      phase: this.phase,
      round: this.currentRound,
      totalRounds: MyGame.totalRounds,
      scores: this.getScoreboard(),
      players: this.room.players.map(p => ({ id: p.id, name: p.name })),
    };
  }

  // Called when player requests game state
  getPlayerState(playerId) {
    return {
      gameType: 'my-game',
      phase: this.phase,
      round: this.currentRound,
      myScore: this.scores.get(playerId) || 0,
    };
  }

  // ============ HELPERS ============

  broadcastPhase(phase, data = {}) {
    this.broadcast('mg:phase-changed', { phase, ...data });
  }

  getScoreboard() {
    return this.room.players
      .map(p => ({
        name: p.name,
        score: this.scores.get(p.id) || 0,
      }))
      .sort((a, b) => b.score - a.score);
  }

  awardPoints(playerId, points) {
    const current = this.scores.get(playerId) || 0;
    this.scores.set(playerId, current + points);
  }

  startTimer(duration, callback) {
    this.clearTimer();

    // Countdown broadcast
    let remaining = Math.ceil(duration / 1000);
    this.broadcast('mg:timer', { secondsLeft: remaining });

    this.timerInterval = setInterval(() => {
      remaining--;
      if (remaining >= 0) {
        this.broadcast('mg:timer', { secondsLeft: remaining });
      }
    }, 1000);

    this.timer = setTimeout(() => {
      this.clearTimer();
      callback();
    }, duration);
  }

  clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timer = null;
    this.timerInterval = null;
  }

  onPlayerDisconnect(playerId) {
    this.log(`Player ${playerId} disconnected`);
    // Handle mid-game disconnection
  }

  destroy() {
    this.clearTimer();
  }
}

module.exports = MyGame;
```

### Step 2: Register Game on Server

In `clown-club/server.js`, add:

```javascript
const MyGame = require('./games/my-game/MyGame');
gameRegistry.register('my-game', MyGame);
```

### Step 3: Create Player Phaser Scene

Create `joey-musselman-site/lib/clown-club/phaser/scenes/MyGameScene.ts`:

```typescript
import * as Phaser from 'phaser';
import { Socket } from 'socket.io-client';

interface PhaseData {
  phase: string;
  round?: number;
  timer?: number;
  scores?: Array<{ name: string; score: number }>;
  winner?: { name: string; score: number };
}

const COLORS = {
  background: 0xffffff,
  panel: 0xf3f4f6,
  accent: 0xdc2626,
  success: 0x22c55e,
  gold: 0xfbbf24,
  text: 0x171717,
  muted: 0x6b7280,
};

export class MyGameScene extends Phaser.Scene {
  private socket!: Socket;
  private playerId!: string;
  private playerName!: string;

  private phase: string = 'waiting';
  private round: number = 1;
  private myScore: number = 0;
  private timer: number = 0;

  // UI elements
  private timerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super('MyGameScene');
  }

  create() {
    // Get data from registry (set by LobbyScene)
    this.socket = this.registry.get('socket');
    this.playerId = this.registry.get('playerId');
    this.playerName = this.registry.get('playerName') || 'Player';

    if (!this.socket) {
      this.add.text(400, 300, 'Connection error', { fontSize: '24px', color: '#ff0000' }).setOrigin(0.5);
      return;
    }

    this.createUI();
    this.setupSocketListeners();

    // Request current game state (for rejoins)
    this.socket.emit('game:request-state');
  }

  private createUI() {
    // Background
    this.add.rectangle(400, 300, 800, 600, COLORS.background);

    // Timer
    this.timerText = this.add.text(400, 50, '', {
      fontSize: '32px',
      color: '#171717',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Status
    this.statusText = this.add.text(400, 300, 'Waiting...', {
      fontSize: '24px',
      color: '#171717',
    }).setOrigin(0.5);

    // Leave button
    this.createButton(400, 550, 'Leave Game', () => {
      this.socket.emit('game:leave');
    });
  }

  private setupSocketListeners() {
    // Phase changes from server
    this.socket.on('mg:phase-changed', (data: PhaseData) => {
      this.handlePhaseChange(data);
    });

    // Timer updates
    this.socket.on('mg:timer', (data: { secondsLeft: number }) => {
      this.timer = data.secondsLeft;
      this.timerText.setText(data.secondsLeft.toString());
    });

    // Game state (for rejoins)
    this.socket.on('game:state', (state: { gameType: string; phase: string; round: number; myScore: number }) => {
      if (state.gameType !== 'my-game') return;
      this.round = state.round;
      this.myScore = state.myScore;
      this.handlePhaseChange({ phase: state.phase, round: state.round });
    });

    // Game ended
    this.socket.on('game:ended', () => this.returnToLobby());
    this.socket.on('game:left', () => this.returnToLobby());
  }

  private handlePhaseChange(data: PhaseData) {
    this.phase = data.phase;
    if (data.round) this.round = data.round;

    switch (data.phase) {
      case 'intro':
        this.showIntro(data);
        break;
      case 'playing':
        this.showPlaying(data);
        break;
      case 'results':
        this.showResults(data);
        break;
      case 'game-over':
        this.showGameOver(data);
        break;
    }
  }

  private showIntro(data: PhaseData) {
    this.statusText.setText(`Round ${data.round}!`);
  }

  private showPlaying(data: PhaseData) {
    this.statusText.setText('Playing...');
    // Show game UI here
  }

  private showResults(data: PhaseData) {
    this.statusText.setText('Results...');
    // Show scores
  }

  private showGameOver(data: PhaseData) {
    this.statusText.setText(`Winner: ${data.winner?.name || 'Nobody'}`);
  }

  private createButton(x: number, y: number, text: string, onClick: () => void) {
    const bg = this.add.rectangle(x, y, 160, 50, COLORS.accent)
      .setInteractive({ useHandCursor: true });

    this.add.text(x, y, text, {
      fontSize: '18px',
      color: '#ffffff',
    }).setOrigin(0.5);

    bg.on('pointerdown', onClick);
  }

  private returnToLobby() {
    this.cleanupSocketListeners();
    this.scene.stop();
    this.scene.resume('LobbyScene');
  }

  private cleanupSocketListeners() {
    this.socket.off('mg:phase-changed');
    this.socket.off('mg:timer');
    this.socket.off('game:state');
    this.socket.off('game:ended');
    this.socket.off('game:left');
  }

  shutdown() {
    this.cleanupSocketListeners();
  }
}
```

### Step 4: Create Host Phaser Scene

Create `joey-musselman-site/lib/clown-club/phaser/scenes/HostMyGameScene.ts`:

```typescript
import * as Phaser from 'phaser';
import { Socket } from 'socket.io-client';

// Similar structure to player scene, but:
// - Larger display (1280x720)
// - Shows all players' status
// - Has "Next Round" / control buttons
// - More elaborate animations for TV display

export class HostMyGameScene extends Phaser.Scene {
  private socket!: Socket;

  constructor() {
    super('HostMyGameScene');
  }

  create() {
    this.socket = this.registry.get('socket');
    // ... similar setup, different layout
  }

  // Host-specific: "Next Round" button
  private createNextRoundButton() {
    // Button that emits 'mg:next-round'
  }
}
```

### Step 5: Register Scenes

In `joey-musselman-site/lib/clown-club/phaser/config.ts`:

```typescript
import { MyGameScene } from './scenes/MyGameScene';

// Add to scenes array:
scene: [BootScene, LobbyScene, GamesRoomScene, BoardGameScene, CaptionContestScene, MyGameScene],
```

In `joey-musselman-site/lib/clown-club/phaser/HostPhaserWrapper.tsx`:

```typescript
import { HostMyGameScene } from './scenes/HostMyGameScene';

// Add to host config scenes array
```

### Step 6: Add Game Launch Logic

In `LobbyScene.ts` (and `GamesRoomScene.ts`), add to `game:started` handler:

```typescript
} else if (gameData.gameType === 'my-game') {
  this.scene.pause();
  this.scene.launch('MyGameScene');
}
```

In `HostWorldScene.ts`, add to game scene switching:

```typescript
const sceneName = gameData.gameType === 'my-game'
  ? 'HostMyGameScene'
  : ...;
```

### Step 7: Add Arcade Cabinet

In `GamesRoomScene.ts` or zone config, add cabinet:

```typescript
this.createArcadeCabinet(x, y, '🎮', 'My Game', 'my-game');
```

## Common Patterns

### Event Prefixes

| Prefix | Domain |
|--------|--------|
| `cc:` | Clown Club world (movement, chat) |
| `game:` | Game lifecycle (start, end, queue) |
| `mg:` | My Game specific events |
| `bg:` | Board Game events |
| `cap:` | Caption Contest events |

### Standard Events Your Game Should Handle

```
Server → Client:
  mg:phase-changed    { phase, round, timer, ...gameData }
  mg:timer            { secondsLeft }
  game:state          Full state for rejoins
  game:ended          Return to lobby

Client → Server:
  mg:submit           Player action
  mg:next-round       Host advances game
  game:request-state  Request current state
  game:leave          Leave game early
```

### Timer Pattern

```javascript
// Server
startTimer(duration, callback) {
  let remaining = Math.ceil(duration / 1000);
  this.broadcast('mg:timer', { secondsLeft: remaining });

  this.timerInterval = setInterval(() => {
    remaining--;
    this.broadcast('mg:timer', { secondsLeft: remaining });
  }, 1000);

  this.timer = setTimeout(callback, duration);
}

// Client (Phaser)
this.socket.on('mg:timer', ({ secondsLeft }) => {
  this.timerText.setText(secondsLeft.toString());

  // Visual feedback when low
  if (secondsLeft <= 5) {
    this.timerText.setColor('#dc2626');
    this.tweens.add({
      targets: this.timerText,
      scale: { from: 1, to: 1.2 },
      duration: 150,
      yoyo: true,
    });
  }
});
```

### Score Display Pattern

```javascript
// Server helper
getScoreboard() {
  return this.room.players
    .map(p => ({
      name: p.name,
      score: this.scores.get(p.id) || 0,
    }))
    .sort((a, b) => b.score - a.score);
}

// Client display
scores.forEach((entry, i) => {
  const isFirst = i === 0 && entry.score > 0;
  const rankText = isFirst ? '👑' : `${i + 1}.`;
  // Render row...
});
```

### Host vs Spectator Events

The host display connects as a **spectator**, not a player:

```javascript
// Host connects
socket.emit('cc:join-spectator', { roomCode });

// Server routing allows spectators to send certain events
handleGameEvent(socket, event, data) {
  let roomCode = this.playerGames.get(socket.id);
  if (!roomCode) {
    roomCode = this.spectators.get(socket.id);  // Also check spectators
  }
  // Route to game...
}
```

## Testing Checklist

- [ ] Game registers correctly (shows in arcade)
- [ ] Queue system works (join, leave, start)
- [ ] Single player mode (if minPlayers = 1)
- [ ] Timer countdown works
- [ ] Phase transitions work
- [ ] Host display syncs with game state
- [ ] Player display syncs with game state
- [ ] "Next Round" button works
- [ ] Game over shows winner
- [ ] Return to lobby works
- [ ] Disconnect mid-game handled
- [ ] Rejoin (game:request-state) works
- [ ] Mobile layout (375px width)

## File Checklist for New Game

```
Server:
  [ ] clown-club/games/my-game/MyGame.js
  [ ] Register in clown-club/server.js

Frontend:
  [ ] joey-musselman-site/lib/clown-club/phaser/scenes/MyGameScene.ts
  [ ] joey-musselman-site/lib/clown-club/phaser/scenes/HostMyGameScene.ts
  [ ] Register in config.ts (player scenes)
  [ ] Register in HostPhaserWrapper.tsx (host scenes)
  [ ] Add launch logic in LobbyScene.ts
  [ ] Add launch logic in GamesRoomScene.ts
  [ ] Add launch logic in HostWorldScene.ts
  [ ] Add arcade cabinet (if applicable)
```
