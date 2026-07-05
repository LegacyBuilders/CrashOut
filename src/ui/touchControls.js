// Mobile touch controls: a floating joystick on the left (move / jump / block) and
// attack buttons on the right. They synthesize the Player-1 keyboard codes, so the
// existing KeyboardInput picks them up with zero game-logic changes.
//
// Joystick: ◀ ▶ move, push up = jump, push down = block.
// Buttons: PUNCH (A), KICK (S), HEAVY/special (D).

export class TouchControls {
  constructor() {
    this.held = new Set();
    this.joyId = null;
    this.base = { x: 0, y: 0 };
    this._build();
    this._bind();
  }

  static isTouch() {
    return (window.matchMedia && matchMedia('(pointer: coarse)').matches) ||
      'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'touchControls';
    el.innerHTML = `
      <div class="tc-joyzone" id="tcJoyZone"></div>
      <div class="tc-joy" id="tcJoy"><div class="tc-ring"></div><div class="tc-knob" id="tcKnob"></div></div>
      <div class="tc-atks">
        <button class="tc-btn tc-heavy" data-code="KeyD" type="button">HEAVY</button>
        <button class="tc-btn tc-kick"  data-code="KeyS" type="button">KICK</button>
        <button class="tc-btn tc-punch" data-code="KeyA" type="button">PUNCH</button>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.joy = el.querySelector('#tcJoy');
    this.knob = el.querySelector('#tcKnob');
    this.zone = el.querySelector('#tcJoyZone');
  }

  _key(code, down) {
    if (down) { if (this.held.has(code)) return; this.held.add(code); }
    else { if (!this.held.has(code)) return; this.held.delete(code); }
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
  }

  _bind() {
    // --- joystick (floating) ---
    this.zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.joyId !== null) return;
      const t = e.changedTouches[0];
      this.joyId = t.identifier;
      this.base = { x: t.clientX, y: t.clientY };
      this.joy.style.left = this.base.x + 'px';
      this.joy.style.top = this.base.y + 'px';
      this.joy.classList.add('show');
      this._moveKnob(0, 0);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (this.joyId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyId) { e.preventDefault(); this._joyMove(t.clientX - this.base.x, t.clientY - this.base.y); }
      }
    }, { passive: false });

    const endJoy = (e) => {
      if (this.joyId === null) return;
      for (const t of e.changedTouches) if (t.identifier === this.joyId) { this.joyId = null; this.joy.classList.remove('show'); this._release(); }
    };
    window.addEventListener('touchend', endJoy);
    window.addEventListener('touchcancel', endJoy);

    // --- attack buttons ---
    this.el.querySelectorAll('.tc-btn').forEach((btn) => {
      const code = btn.dataset.code;
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); btn.classList.add('pressed'); window.dispatchEvent(new KeyboardEvent('keydown', { code })); }, { passive: false });
      const up = (e) => { e.preventDefault(); btn.classList.remove('pressed'); window.dispatchEvent(new KeyboardEvent('keyup', { code })); };
      btn.addEventListener('touchend', up, { passive: false });
      btn.addEventListener('touchcancel', up, { passive: false });
    });
  }

  _joyMove(dx, dy) {
    const R = 54, dz = 16, dist = Math.hypot(dx, dy) || 1, cl = dist > R ? R / dist : 1;
    this._moveKnob(dx * cl, dy * cl);
    this._key('ArrowLeft', dx < -dz);
    this._key('ArrowRight', dx > dz);
    this._key('ArrowUp', dy < -dz);   // push up = jump
    this._key('ArrowDown', dy > dz);  // push down = block
  }

  _moveKnob(x, y) { this.knob.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px)`; }

  _release() { ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].forEach((c) => this._key(c, false)); this._moveKnob(0, 0); }

  show() { this.el.classList.add('show'); }
  hide() { this.el.classList.remove('show'); this.joyId = null; this.joy.classList.remove('show'); Array.from(this.held).forEach((c) => this._key(c, false)); }
}
