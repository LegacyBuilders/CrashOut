export class KeyboardInput {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.controlCodes = [
      'KeyW','KeyA','KeyS','KeyD','KeyE',                 // P1 strikes
      'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',     // P1 movement
      'KeyI','KeyJ','KeyK','KeyL','KeyU','KeyO','KeyP'    // P2 local
    ];

    window.addEventListener('keydown', (e) => {
      const code = e.code;
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
      if (this.controlCodes.includes(code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
  }

  matches(codeOrCodes, set) {
    const codes = Array.isArray(codeOrCodes) ? codeOrCodes : [codeOrCodes];
    return codes.some((code) => set.has(code));
  }

  isDown(codeOrCodes) { return this.matches(codeOrCodes, this.down); }
  wasPressed(codeOrCodes) { return this.matches(codeOrCodes, this.pressed); }
  endFrame() { this.pressed.clear(); }
}

// Player 1 (Junya): arrow keys move (↑ jump, ↓ block), A/S/D/W/E strike.
// A/W = punch, S/E = kick, D = heavy (hook).
export const P1_BINDINGS = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  punch: ['KeyA', 'KeyW'],
  kick: ['KeyS', 'KeyE'],
  heavy: 'KeyD'
};

// Virtual codes for the AI-driven fighter (AIInput emits these).
export const P2_BINDINGS = {
  left: 'AI_LEFT',
  right: 'AI_RIGHT',
  up: 'AI_UP',
  down: 'AI_DOWN',
  punch: 'AI_PUNCH',
  kick: 'AI_KICK',
  heavy: 'AI_HEAVY'
};

// Local two-player couch co-op: player 2 (Moloch) on a right-hand cluster that
// doesn't collide with P1's arrows + ASDWE. J/L move, I jump, K block, U/O/P strike
// (P = heavy = spell).
export const P2_LOCAL_BINDINGS = {
  left: 'KeyJ',
  right: 'KeyL',
  up: 'KeyI',
  down: 'KeyK',
  punch: 'KeyU',
  kick: 'KeyO',
  heavy: 'KeyP'
};

// Abstract action bindings — used by RemoteInput (net) so the fighter's
// update() reads action names directly ('left','punch', ...).
export const ACTION_BINDINGS = {
  left: 'left', right: 'right', up: 'up', down: 'down',
  punch: 'punch', kick: 'kick', heavy: 'heavy'
};

// Sample a keyboard input source into a serializable action snapshot the guest
// streams to the host: { down:{...booleans}, pressed:{...edges} }.
export function sampleActions(input, bindings) {
  return {
    down: {
      left: input.isDown(bindings.left),
      right: input.isDown(bindings.right),
      up: input.isDown(bindings.up),
      down: input.isDown(bindings.down),
      punch: input.isDown(bindings.punch),
      kick: input.isDown(bindings.kick),
      heavy: input.isDown(bindings.heavy),
    },
    pressed: {
      up: input.wasPressed(bindings.up),
      punch: input.wasPressed(bindings.punch),
      kick: input.wasPressed(bindings.kick),
      heavy: input.wasPressed(bindings.heavy),
    },
  };
}
