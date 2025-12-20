/**
 * Asset Registry - Emoji placeholders with sprite swap support
 *
 * To swap emoji for sprite:
 * 1. Add sprite to public/assets/
 * 2. Update the `spriteKey` property
 * 3. Load sprite in BootScene
 */

export interface CharacterAsset {
  emoji: string;
  spriteKey: string | null;
  name: string;
}

export interface ObjectAsset {
  emoji: string;
  spriteKey: string | null;
  interactive?: boolean;
  action?: string;
}

export const characters: Record<string, CharacterAsset> = {
  penguin: { emoji: '🐧', spriteKey: null, name: 'Penguin' },
  bear: { emoji: '🐻', spriteKey: null, name: 'Bear' },
  fox: { emoji: '🦊', spriteKey: null, name: 'Fox' },
  cat: { emoji: '🐱', spriteKey: null, name: 'Cat' },
  dog: { emoji: '🐶', spriteKey: null, name: 'Dog' },
  rabbit: { emoji: '🐰', spriteKey: null, name: 'Rabbit' },
};

export const objects: Record<string, ObjectAsset> = {
  door: { emoji: '🚪', spriteKey: null, interactive: true, action: 'zone-change' },
  arcade: { emoji: '🕹️', spriteKey: null, interactive: true, action: 'launch-game' },
  tree: { emoji: '🌲', spriteKey: null },
  snowman: { emoji: '⛄', spriteKey: null },
  igloo: { emoji: '🏠', spriteKey: null, interactive: true },
};

export const emotes: Record<string, string> = {
  wave: '👋',
  dance: '💃',
  laugh: '😂',
  heart: '❤️',
  thumbsup: '👍',
};

/**
 * Get character visual (emoji or sprite key)
 */
export function getCharacterEmoji(characterType: string): string {
  return characters[characterType]?.emoji || '❓';
}

/**
 * Get object visual (emoji or sprite key)
 */
export function getObjectEmoji(objectType: string): string {
  return objects[objectType]?.emoji || '❓';
}

/**
 * Check if character has sprite loaded
 */
export function hasCharacterSprite(characterType: string): boolean {
  return characters[characterType]?.spriteKey !== null;
}
