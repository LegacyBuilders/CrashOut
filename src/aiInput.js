// CPU opponent. Emits the same virtual bindings a keyboard would, so it drives
// the fighter through the exact same update() path as a human. Difficulty scales
// reaction time, aggression, block chance and spacing.

const DIFFICULTY = {
  easy:   { react: 0.28, aggr: 0.35, block: 0.30, combo: 0.10, spacing: 1.35 },
  normal: { react: 0.16, aggr: 0.55, block: 0.55, combo: 0.25, spacing: 1.5 },
  hard:   { react: 0.08, aggr: 0.75, block: 0.78, combo: 0.45, spacing: 1.7 },
};

export class AIInput {
  constructor(bindings, difficulty = 'normal') {
    this.bindings = bindings;
    this.setDifficulty(difficulty);
    this.down = new Set();
    this.pressed = new Set();
    this.timer = 0;
    this.nextAttackAt = 0.6;
    this.nextSpecialAt = 3.5;
    this.blockTimer = 0;
    this.reactBuffer = 0;
  }

  setDifficulty(d) { this.cfg = DIFFICULTY[d] || DIFFICULTY.normal; this.difficulty = d; }

  update(dt, self, opponent) {
    this.down.clear();
    if (!self || !opponent || self.health <= 0) return;

    this.timer += dt;
    const dx = opponent.group.position.x - self.group.position.x;
    const dist = Math.abs(dx);
    const towardSign = Math.sign(dx) || 1;
    const opponentAttacking = opponent.state === 'attack';
    const inRange = dist <= 1.55;

    // Reactive blocking: crouch-block when the opponent commits an attack up close.
    if (opponentAttacking && dist < 2.0) {
      this.reactBuffer -= dt;
      if (this.reactBuffer <= 0 && Math.random() < this.cfg.block * 0.12) {
        this.blockTimer = 0.26;
        this.reactBuffer = this.cfg.react;
      }
    }
    if (this.blockTimer > 0) {
      this.blockTimer -= dt;
      this.down.add(this.bindings.down);
      return;
    }

    // Spacing: close the gap when far; keep a little distance when very close.
    if (dist > this.cfg.spacing) {
      this.down.add(towardSign > 0 ? this.bindings.right : this.bindings.left);
    } else if (dist < 0.75 && Math.random() < 0.4) {
      this.down.add(towardSign > 0 ? this.bindings.left : this.bindings.right);
    }

    // Occasional jump-in to mix things up.
    if (dist > 2.5 && Math.random() < 0.004) this.pressed.add(this.bindings.up);

    // Special (Moloch): cast the launch spell from mid-range on a long cooldown.
    if (self.hasSpecial && dist > 0.8 && dist < 3.0 && this.timer >= this.nextSpecialAt && Math.random() < 0.6) {
      this.pressed.add(this.bindings.heavy); // heavy == special for Moloch
      this.nextSpecialAt = this.timer + 5 + Math.random() * 4;
      this.nextAttackAt = this.timer + 1.4;
      return;
    }

    // Normal attacks when in range and cooldown elapsed.
    if (inRange && this.timer >= this.nextAttackAt) {
      const r = Math.random();
      if (self.hasSpecial) {
        // Moloch's heavy is the special, so his normal pokes are punch/kick only.
        if (r < 0.55) this.pressed.add(this.bindings.punch);
        else this.pressed.add(this.bindings.kick);
      } else {
        if (r < 0.5) this.pressed.add(this.bindings.punch);
        else if (r < 0.82) this.pressed.add(this.bindings.kick);
        else this.pressed.add(this.bindings.heavy);
      }
      const cd = (1.1 - this.cfg.aggr) * 0.9;
      this.nextAttackAt = this.timer + cd + Math.random() * cd;
    }
  }

  isDown(code) { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); }
}
