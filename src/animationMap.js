// Animation filenames for your current FBX folders.
// Put the same filenames in BOTH folders:
// public/assets/characters/player1/
// public/assets/characters/player2/
// Values can be a string or an array. Arrays are picked randomly when played.
export const DEFAULT_ANIMATION_MAP = {
  idle: 'Idle.fbx',
  walkForward: 'Medium Step Forward.fbx',
  walkBack: 'Step Backward.fbx',
  jump: 'Jumping.fbx',
  crouch: 'Block.fbx',
  block: 'Block.fbx',
  punch: ['Cross Punch.fbx', 'Cross Punch mirror.fbx'],
  kick: 'Flying Kick.fbx',
  heavy: 'Jump Attack.fbx',
  hit: ['Head Hit.fbx', 'Hit To Body.fbx', 'Receive Punch To The Face.fbx'],
  ko: 'Dying.fbx',
  victory: 'Idle.fbx'
};

// Playback-speed multipliers per action (multiplied again by the master animSpeed).
// Clips are long AI-generated takes, so attacks are sped up to read snappy.
// Playback-speed multipliers per action (multiplied again by the master animSpeed).
export const ANIMATION_SPEEDS = {
  punch: 2.2,        // 3-punch combo — speed so the first hit reads fast
  kick: 1.35,        // spinning kick
  heavy: 1.7,        // hook
  special: 1.15,     // Moloch's spell cast
  hit: 1.35,
  ko: 1.0,
  jump: 1.0,
  idle: 1.0,
  walkForward: 1.35,
  walkBack: -1.35,   // negative = play the walk clip in reverse (true backpedal, no moonwalk)
  block: 1.0,
  crouch: 1.0
};

// Start an action partway through its clip (fraction of duration). The punch clip
// (3-punch combo) has a long wind-up, so begin halfway so the strike lands promptly.
export const ANIMATION_START = {
  punch: 0.5,
};

export const ATTACKS = {
  punch: { damage: 8,  startup: 0.05, active: 0.12, recovery: 0.12, range: 1.35, height: 'mid', push: 0.18 },
  kick:  { damage: 13, startup: 0.12, active: 0.30, recovery: 0.30, range: 1.95, height: 'mid', push: 0.30 }, // wide window for the spin
  heavy: { damage: 17, startup: 0.16, active: 0.16, recovery: 0.34, range: 1.55, height: 'mid', push: 0.40 },
  // Moloch's special: long cast, big range, launches for heavy damage.
  special: { damage: 30, startup: 0.55, active: 0.30, recovery: 0.70, range: 3.2, height: 'mid', push: 0 }
};
