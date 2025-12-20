import Phaser from 'phaser';
import { getCharacterEmoji, emotes } from '../assets/AssetRegistry';

export class RemotePlayer extends Phaser.GameObjects.Container {
  private emoji: Phaser.GameObjects.Text;
  private nameTag: Phaser.GameObjects.Text;
  private emoteText?: Phaser.GameObjects.Text;
  private chatBubble?: Phaser.GameObjects.Container;
  private targetX: number;
  private targetY: number;
  private lerpFactor: number = 0.1;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    name: string,
    character: string
  ) {
    super(scene, x, y);

    this.targetX = x;
    this.targetY = y;

    // Character emoji
    this.emoji = scene.add.text(0, 0, getCharacterEmoji(character), {
      fontSize: '48px',
    });
    this.emoji.setOrigin(0.5);

    // Name tag
    this.nameTag = scene.add.text(0, 35, name, {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#000000aa',
      padding: { x: 6, y: 3 },
    });
    this.nameTag.setOrigin(0.5);

    this.add([this.emoji, this.nameTag]);
    scene.add.existing(this);

    this.setDepth(y);
  }

  moveToPoint(x: number, y: number) {
    // Flip based on movement direction
    if (x < this.targetX - 5) {
      this.emoji.setScale(-1, 1);
    } else if (x > this.targetX + 5) {
      this.emoji.setScale(1, 1);
    }

    this.targetX = x;
    this.targetY = y;
  }

  showEmote(emoteId: string) {
    const emoteEmoji = emotes[emoteId] || '❓';

    if (this.emoteText) {
      this.emoteText.destroy();
    }

    this.emoteText = this.scene.add.text(0, -50, emoteEmoji, {
      fontSize: '32px',
    });
    this.emoteText.setOrigin(0.5);
    this.add(this.emoteText);

    this.scene.tweens.add({
      targets: this.emoteText,
      alpha: 0,
      y: -80,
      duration: 2000,
      onComplete: () => {
        this.emoteText?.destroy();
        this.emoteText = undefined;
      },
    });
  }

  showChatBubble(message: string) {
    if (this.chatBubble) {
      this.chatBubble.destroy();
    }

    this.chatBubble = this.scene.add.container(0, -60);

    const text = this.scene.add.text(0, 0, message, {
      fontSize: '14px',
      color: '#000000',
      wordWrap: { width: 120 },
      align: 'center',
    });
    text.setOrigin(0.5);

    const padding = 8;
    const bg = this.scene.add.graphics();
    bg.fillStyle(0xffffff, 0.95);
    bg.fillRoundedRect(
      -text.width / 2 - padding,
      -text.height / 2 - padding,
      text.width + padding * 2,
      text.height + padding * 2,
      8
    );
    bg.lineStyle(2, 0x000000, 0.3);
    bg.strokeRoundedRect(
      -text.width / 2 - padding,
      -text.height / 2 - padding,
      text.width + padding * 2,
      text.height + padding * 2,
      8
    );

    bg.fillStyle(0xffffff, 0.95);
    bg.fillTriangle(0, text.height / 2 + padding, -6, text.height / 2 + padding + 8, 6, text.height / 2 + padding + 8);

    this.chatBubble.add([bg, text]);
    this.add(this.chatBubble);

    this.scene.tweens.add({
      targets: this.chatBubble,
      alpha: 0,
      delay: 4000,
      duration: 500,
      onComplete: () => {
        this.chatBubble?.destroy();
        this.chatBubble = undefined;
      },
    });
  }

  update(delta: number) {
    // Smooth interpolation toward target position
    // Use delta-based lerp for consistent speed across frame rates
    const t = 1 - Math.pow(1 - this.lerpFactor, delta / 16.67);

    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Only interpolate if we're far enough away
    if (distance > 2) {
      this.x += dx * t;
      this.y += dy * t;
    } else {
      this.x = this.targetX;
      this.y = this.targetY;
    }

    // Update depth for layering
    this.setDepth(this.y);
  }
}
