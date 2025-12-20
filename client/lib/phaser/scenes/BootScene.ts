import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // Show loading text
    const loadingText = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      'Loading...',
      { fontSize: '32px', color: '#000' }
    );
    loadingText.setOrigin(0.5);

    // When sprites are added, load them here:
    // this.load.image('penguin', '/assets/penguin.png');
    // this.load.spritesheet('penguin-walk', '/assets/penguin-walk.png', { frameWidth: 48, frameHeight: 48 });
  }

  create() {
    // Transition to lobby scene
    this.scene.start('LobbyScene');
  }
}
