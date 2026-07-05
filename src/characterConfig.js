// CRASH OUT — character roster.
//
// Every character shares the identical Tripo skeleton (Reeves Junya's armature),
// so any clip binds by bone-name on any character. Animation clips come from a
// shared POOL built once at load (Reeves Junya's + Moloch's embedded clips, plus
// walk/idle-rap). A clip map value is:
//   number        -> this character's OWN embedded clip index (Junya/Moloch)
//   "junya:3"     -> borrow clip 3 from the pool's junya clips
//   "moloch:1"    -> borrow clip 1 from the pool's moloch clips
//   [ ...above ]  -> random variant chosen at play time (e.g. hit reactions)
//
// Clip identities (confirmed in the Animation Lab, press `):
// REEVES JUNYA (9): 0 idle, 1 hit-face, 2 turn-180, 3 punch-combo, 4 spin-kick,
//                   5 defeat, 6 defeat, 7 hook-punch, 8 hit-body
// MOLOCH (8): 0 hit-face, 1 walk, 2 hit-side, 3 hit-body, 4 defeat(fall),
//             5 SPECIAL spell-cast, 6 kick, 7 defeat

const JUNYA_CLIPS = {
  idle: 0,
  walkForward: 'moloch:1',  // native walk replaced by walk.glb at runtime; this is the fallback
  walkBack: 'moloch:1',
  jump: 0,                  // reuse idle (apex only shows briefly)
  crouch: 0,
  block: 0,
  punch: 3,                 // 3-punch combo
  kick: 4,                  // spinning kick (see spin-kick handling in fighter.js)
  heavy: 7,                 // left hook
  hit: [1, 8],              // face / body reactions
  ko: [5, 6],               // two defeat animations
  victory: 3,               // reuse the combo as a hype flex
};

const MOLOCH_CLIPS = {
  idle: 'junya:0',          // borrow Reeves Junya's idle
  walkForward: 1,
  walkBack: 1,
  jump: 'junya:0',
  crouch: 'junya:0',
  block: 'junya:0',
  punch: 'junya:3',         // borrow the combo
  kick: 6,                  // question-mark kick
  heavy: 5,                 // heavy input maps to the special
  special: 5,               // spell cast -> launches opponent (see fighter.js)
  hit: [0, 2, 3],           // face / side / body reactions
  ko: [4, 7],               // two defeat animations
  victory: 'junya:0',
};

// Default humanoid moveset for new rigged characters (no embedded clips of their
// own) — they borrow the shared pool. Refine per-character later.
const BORROWED_MOVESET = {
  idle: 'junya:0',
  walkForward: 'moloch:1', walkBack: 'moloch:1',
  jump: 'junya:0', crouch: 'junya:0', block: 'junya:0',
  punch: 'junya:3', kick: 'junya:4', heavy: 'junya:7',
  hit: ['junya:1', 'junya:8'], ko: ['junya:5', 'junya:6'], victory: 'junya:3',
};

export const CHARACTERS = {
  junya: {
    id: 'junya', name: 'REEVES JUNYA', avatar: '/assets/avatars/junya.png',
    modelUrl: '/assets/characters/junya.glb', color: 0x7ec96b,
    clips: JUNYA_CLIPS, visual: { scale: 1.0, y: 0 },
    idleRap: true, // gets the rap idle at runtime
  },
  moloch: {
    id: 'moloch', name: 'LABEL HEAD', avatar: '/assets/avatars/moloch.png',
    modelUrl: '/assets/characters/moloch.glb', color: 0x8a5cc0,
    clips: MOLOCH_CLIPS, visual: { scale: 1.02, y: 0 },
    hasSpecial: true, // heavy input casts the launch spell (clip 5)
  },
  kc: {
    id: 'kc', name: 'KAYCEE POODLE', avatar: '/assets/avatars/kc.png',
    modelUrl: '/assets/characters/kc.glb', color: 0xff8ac0,
    clips: { ...BORROWED_MOVESET }, visual: { scale: 1.0, y: 0 },
  },
  rocky: {
    id: 'rocky', name: 'ROCKY RHINESTONES', avatar: '/assets/avatars/rocky.png',
    modelUrl: '/assets/characters/rocky.glb', color: 0xc9a06b,
    clips: { ...BORROWED_MOVESET }, visual: { scale: 1.0, y: 0 },
  },
};

// Display order in character select. Add more ids here as characters are added.
export const ROSTER = ['junya', 'moloch', 'kc', 'rocky'];
// Extra greyed "coming soon" slots shown after the roster.
export const LOCKED_SLOTS = 2;

// Live-tunable values that are hard to eyeball headlessly. Defaults are best
// guesses; the Animation Lab's Tuning panel edits these and persists to
// localStorage. Paste finalized numbers back here to lock them for everyone.
export const DEFAULT_TUNING = {
  _v: 2,                   // bump when defaults change to invalidate stale saved tuning
  faceOffset: -Math.PI / 2, // added to the base ±90° so fighters face EACH OTHER (not back-to-back)
  koYOffset: -0.9,         // lower the body during defeat so it rests on the ground
  jumpVelocity: 9.0,       // higher = MK-style hop-overs
  gravity: -20,
  animSpeed: 1.0,          // master animation-speed multiplier
};

function mergeLocal(key, base) {
  const out = { ...base };
  try {
    const raw = localStorage.getItem(key);
    if (raw) Object.assign(out, JSON.parse(raw));
  } catch (_) { /* ignore */ }
  return out;
}

export function getClipMap(characterId) {
  return mergeLocal(`crashout.clipmap.${characterId}`, CHARACTERS[characterId]?.clips || {});
}
export function saveClipMap(characterId, map) {
  try { localStorage.setItem(`crashout.clipmap.${characterId}`, JSON.stringify(map)); } catch (_) {}
}

export function getTuning() {
  const t = mergeLocal('crashout.tuning', DEFAULT_TUNING);
  // Ignore stale saved tuning from an older default set (e.g. the old facing value).
  if (t._v !== DEFAULT_TUNING._v) return { ...DEFAULT_TUNING };
  return t;
}
export function saveTuning(t) {
  try { localStorage.setItem('crashout.tuning', JSON.stringify(t)); } catch (_) {}
}
