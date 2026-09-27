const ADJECTIVES = [
  'Byte', 'Neon', 'Pixel', 'Grid', 'Cyber', 'Glitch', 'Hex', 'Flux',
  'Void', 'Hash', 'Stack', 'Null', 'Logic', 'Turbo', 'Nano', 'Rogue',
  'Sigma', 'Proto', 'Alpha', 'Delta', 'Vector', 'Bit', 'Dark', 'Nova',
] as const;

const NOUNS = [
  'Fox', 'Owl', 'Wolf', 'Hawk', 'Lynx', 'Scribe', 'Sage', 'Ghost',
  'Spark', 'Scout', 'Drift', 'Pulse', 'Shade', 'Crypt', 'Forge', 'Rune',
  'Wisp', 'Bard', 'Glyph', 'Node', 'Shard', 'Core', 'Veil', 'Beam',
] as const;

export function generateAgentName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj} ${noun}`;
}
