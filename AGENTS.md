# Clown Club - AI Development Guide

## Project Overview
Mobile-first multiplayer virtual world. Phaser.js game embedded in Next.js.

## Monorepo Structure
- `client/` - Next.js 15 frontend with Phaser.js
- `server/` - Node.js + Socket.IO backend

## Quick Commands
```bash
npm run dev          # Start both client and server
npm run dev:client   # Start client only (port 3000)
npm run dev:server   # Start server only (port 3015)

# See ../ports.json for the central port registry
```

## Socket Event Convention
All events prefixed with `cc:` (Clown Club)
- Client -> Server: `cc:move`, `cc:interact`, `cc:emote`, `cc:create-room`, `cc:join-room`
- Server -> Client: `cc:player-moved`, `cc:world-state`, `cc:player-joined`, `cc:player-left`

## Asset System
Using emoji placeholders initially - see `client/lib/phaser/assets/AssetRegistry.ts`
To swap in sprites: update `spriteKey` property, no code changes needed elsewhere.

## Key Patterns

### Phaser Integration
- Phaser must be dynamically imported (`ssr: false`) - it accesses `window`
- Destroy game instance on React component unmount
- Use `PhaserWrapper.tsx` as the bridge between React and Phaser

### Multiplayer Architecture
- All player positions are server-authoritative (anti-cheat)
- Use interpolation for smooth remote player movement
- Rate limit position updates to 10-15/second

### File Organization
```
client/lib/phaser/
├── scenes/        # Phaser scenes (BootScene, LobbyScene)
├── entities/      # Game objects (Player, RemotePlayer)
└── assets/        # AssetRegistry for emoji/sprite management

server/
├── core/          # Socket.IO and room management
├── world/         # World state and interaction logic
└── data/          # Configuration files
```

## Common Tasks

### Adding a New Character
1. Add entry to `AssetRegistry.characters` with emoji
2. Later: add sprite to `public/assets/`, update `spriteKey`

### Adding Interactive Object
1. Define in `server/data/world-config.json`
2. Add handler in `server/world/InteractionHandler.js`
3. Create visual in scene using AssetRegistry

### Adding New Zone/Room
1. Create new scene in `client/lib/phaser/scenes/`
2. Add zone config to `world-config.json`
3. Handle zone transition via `cc:change-zone` event
