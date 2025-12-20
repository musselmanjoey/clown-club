# Clown Club Client

## Stack
Next.js 15 + TypeScript + Tailwind CSS + Phaser.js

## Phaser Integration

### Dynamic Import Pattern
Phaser accesses `window` and must be client-only:
```tsx
const PhaserGame = dynamic(() => import('./PhaserGame'), { ssr: false });
```

### Cleanup
Always destroy the Phaser game instance on component unmount to prevent memory leaks.

### React-Phaser Bridge
- `PhaserWrapper.tsx` handles mounting/unmounting
- Pass socket and player data via Phaser registry
- Scenes access shared data through `this.registry.get('key')`

## File Responsibilities

| Directory | Purpose |
|-----------|---------|
| `app/` | Next.js routes and pages |
| `lib/socket.ts` | Socket.IO client singleton |
| `lib/phaser/scenes/` | Phaser game scenes |
| `lib/phaser/entities/` | Game objects (Player, etc.) |
| `lib/phaser/assets/` | AssetRegistry for emoji/sprite management |
| `components/` | React UI components |

## Adding New Entity

1. Create class in `lib/phaser/entities/`
2. Add to AssetRegistry if it has visuals
3. Instantiate in the appropriate scene

## Adding New Scene

1. Create scene class in `lib/phaser/scenes/`
2. Register in `lib/phaser/config.ts`
3. Use `this.scene.start('SceneName')` to transition

## Socket Events

All events prefixed with `cc:` (Clown Club):
- Emit: `socket.emit('cc:move', { x, y })`
- Listen: `socket.on('cc:player-moved', handler)`
