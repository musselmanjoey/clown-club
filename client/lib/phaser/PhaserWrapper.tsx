'use client';

import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { Socket } from 'socket.io-client';
import { createGameConfig } from './config';

interface PhaserWrapperProps {
  socket: Socket;
  playerId: string;
  playerName: string;
}

export function PhaserWrapper({ socket, playerId, playerName }: PhaserWrapperProps) {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    // Create Phaser game
    const config = createGameConfig('phaser-container');

    // Store socket and player data in registry for scenes to access
    const game = new Phaser.Game(config);

    game.registry.set('socket', socket);
    game.registry.set('playerId', playerId);
    game.registry.set('playerName', playerName);

    gameRef.current = game;

    // Cleanup on unmount
    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [socket, playerId, playerName]);

  return (
    <div
      ref={containerRef}
      id="phaser-container"
      className="w-full h-full"
    />
  );
}
