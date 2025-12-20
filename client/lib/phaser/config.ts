import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { LobbyScene } from './scenes/LobbyScene';

export function createGameConfig(parent: string): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: 800,
    height: 600,
    backgroundColor: '#87CEEB', // Sky blue
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, LobbyScene],
    physics: {
      default: 'arcade',
      arcade: {
        debug: false,
      },
    },
    input: {
      activePointers: 3, // Support multi-touch
    },
  };
}
