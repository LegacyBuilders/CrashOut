import { saveClipMap } from './characterConfig.js';

// Dev overlay to identify each GLB clip and remap game actions to clip indices.
// Toggle with the ` (backquote / tilde) key. Overrides persist to localStorage
// and can be printed to the console to paste back into characterConfig.js.

const ACTIONS = ['idle', 'walkForward', 'walkBack', 'jump', 'crouch', 'block', 'punch', 'kick', 'heavy', 'hit', 'ko', 'victory'];

export class AnimationLab {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.freeze = false; // true only while previewing clips (pauses the fight)
    this.targetId = 'p1';
    this.clipIndex = 0;
    this.maps = { p1: {}, p2: {} };
    this.el = null;
    this._build();
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote') { e.preventDefault(); this.toggle(); }
      if (!this.open) return;
      if (e.code === 'ArrowRight') this.step(1);
      if (e.code === 'ArrowLeft') this.step(-1);
    });
  }

  target() { return this.targetId === 'p1' ? this.game.p1 : this.game.p2; }

  _build() {
    const el = document.createElement('div');
    el.id = 'animLab';
    el.style.cssText = `position:fixed;right:12px;top:12px;width:300px;max-height:60vh;overflow:auto;
      background:rgba(6,8,14,.92);border:1px solid #ff2f6b;border-radius:10px;padding:12px;
      color:#eaf; font:12px ui-monospace,monospace;z-index:99999;display:none;box-shadow:0 8px 30px #000`;
    document.body.appendChild(el);
    this.el = el;
    this._buildTuning();
  }

  _buildTuning() {
    const el = document.createElement('div');
    el.id = 'tuneLab';
    el.style.cssText = `position:fixed;right:12px;bottom:12px;width:300px;
      background:rgba(6,8,14,.92);border:1px solid #37e0ff;border-radius:10px;padding:12px;
      color:#dff; font:12px ui-monospace,monospace;z-index:99999;display:none;box-shadow:0 8px 30px #000`;
    const t = this.game.tuning || {};
    const sliders = [
      ['faceOffset', -3.15, 3.15, 0.01, 'facing angle'],
      ['koYOffset', -2.5, 0.5, 0.05, 'defeat ground height'],
      ['jumpVelocity', 5, 16, 0.5, 'jump height'],
      ['gravity', -40, -8, 1, 'gravity'],
      ['animSpeed', 0.5, 2.5, 0.05, 'master anim speed'],
    ];
    el.innerHTML = `<div style="font-weight:900;color:#37e0ff;margin-bottom:6px">TUNING</div>` +
      sliders.map(([k, mn, mx, st, lbl]) => `
        <label style="display:block;margin:6px 0">${lbl} <b id="tv_${k}" style="float:right;color:#7ec96b">${(t[k] ?? 0).toFixed(2)}</b>
          <input type="range" data-k="${k}" min="${mn}" max="${mx}" step="${st}" value="${t[k] ?? 0}" style="width:100%">
        </label>`).join('') +
      `<button id="printTune" style="width:100%;margin-top:8px;padding:6px;border-radius:5px;border:1px solid #37e0ff;background:#08222a;color:#fff;cursor:pointer">Print tuning to console</button>
       <div style="color:#678;margin-top:6px">Drag to fix facing / KO height / jump. Saved to this browser.</div>`;
    document.body.appendChild(el);
    this.tuneEl = el;
    el.querySelectorAll('input[data-k]').forEach((inp) => {
      inp.oninput = () => {
        const k = inp.dataset.k; const v = parseFloat(inp.value);
        const lbl = el.querySelector(`#tv_${k}`); if (lbl) lbl.textContent = v.toFixed(2);
        this.game.applyTuning({ [k]: v });
      };
    });
    el.querySelector('#printTune').onclick = () => {
      console.log('// crashout tuning (paste into DEFAULT_TUNING in characterConfig.js)');
      console.log(JSON.stringify(this.game.tuning, null, 2));
    };
  }

  toggle() {
    this.open = !this.open;
    const d = this.open ? 'block' : 'none';
    this.el.style.display = d;
    if (this.tuneEl) this.tuneEl.style.display = d;
    if (!this.open) this.freeze = false; // resume gameplay when closing
    if (this.open) this.render();
  }

  step(d) {
    const f = this.target();
    const n = f?.clipCount?.() || 0;
    if (!n) return;
    this.freeze = true; // pause the fight so the previewed clip holds
    this.clipIndex = (this.clipIndex + d + n) % n;
    const dur = f.previewClip(this.clipIndex);
    this.render(dur);
  }

  setTarget(id) { this.targetId = id; this.clipIndex = 0; this.freeze = true; const f = this.target(); const dur = f?.previewClip?.(0); this.render(dur); }

  assign(action) {
    const f = this.target();
    if (!f) return;
    this.maps[this.targetId][action] = this.clipIndex;
    f.remapAction(action, this.clipIndex);
    saveClipMap(f.character?.id || this.targetId, this.maps[this.targetId]);
    this.render();
  }

  printMap() {
    const f = this.target();
    const id = f?.character?.id || this.targetId;
    console.log(`// ${id} clip map (paste into characterConfig.js)`);
    console.log(JSON.stringify(this.maps[this.targetId], null, 2));
  }

  render(dur) {
    const f = this.target();
    const n = f?.clipCount?.() || 0;
    const cur = this.maps[this.targetId];
    const rows = ACTIONS.map((a) => {
      const mapped = a in cur ? cur[a] : (f?.clipMap?.[a] ?? '?');
      const hot = mapped === this.clipIndex ? '#ff2f6b' : '#444';
      return `<div style="display:flex;justify-content:space-between;gap:6px;margin:2px 0">
        <span>${a}<b style="color:#7ec96b"> [${mapped}]</b></span>
        <button data-act="${a}" style="border:1px solid ${hot};background:#1a1e2a;color:#fff;border-radius:4px;cursor:pointer">set ${this.clipIndex}</button>
      </div>`;
    }).join('');
    this.el.innerHTML = `
      <div style="font-weight:900;color:#ff2f6b;margin-bottom:6px">ANIMATION LAB <span style="float:right;color:#567">\`=close</span></div>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <button data-t="p1" style="flex:1;padding:4px;border-radius:5px;border:1px solid ${this.targetId === 'p1' ? '#7ec96b' : '#333'};background:#141824;color:#fff;cursor:pointer">${this.game.p1?.character?.name || 'P1'}</button>
        <button data-t="p2" style="flex:1;padding:4px;border-radius:5px;border:1px solid ${this.targetId === 'p2' ? '#7ec96b' : '#333'};background:#141824;color:#fff;cursor:pointer">${this.game.p2?.character?.name || 'P2'}</button>
      </div>
      <div style="text-align:center;margin:6px 0">
        <button data-step="-1" style="padding:4px 10px">◀</button>
        <b style="color:#37e0ff">clip ${this.clipIndex}/${Math.max(0, n - 1)}${dur != null ? ` · ${dur}s` : ''}</b>
        <button data-step="1" style="padding:4px 10px">▶</button>
      </div>
      <div style="max-height:300px;overflow:auto">${rows}</div>
      <button data-resume style="width:100%;margin-top:8px;padding:6px;border-radius:5px;border:1px solid #7ec96b;background:#0f2416;color:#fff;cursor:pointer">▶ Resume fight ${this.freeze ? '(paused)' : '(running)'}</button>
      <button data-print style="width:100%;margin-top:6px;padding:6px;border-radius:5px;border:1px solid #7a4bff;background:#1a1030;color:#fff;cursor:pointer">Print map to console</button>
      <div style="color:#678;margin-top:6px">←/→ cycle clips · "set" binds shown clip to an action · Resume to test in a live fight. Saved to this browser.</div>`;
    this.el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => this.setTarget(b.dataset.t));
    this.el.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => this.step(+b.dataset.step));
    this.el.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => this.assign(b.dataset.act));
    this.el.querySelector('[data-resume]').onclick = () => { this.freeze = false; this.render(); };
    this.el.querySelector('[data-print]').onclick = () => this.printMap();
  }
}
