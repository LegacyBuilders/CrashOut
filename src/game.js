import * as THREE from 'three';
import { AssetLoader } from './assetLoader.js';
import { Fighter } from './fighter.js';
import { KeyboardInput, P1_BINDINGS, P2_BINDINGS, P2_LOCAL_BINDINGS, ACTION_BINDINGS, sampleActions } from './input.js';
import { AIInput } from './aiInput.js';
import { VFXSystem } from './vfx.js';
import { buildCityArena, addNightLights } from './arena.js';
import { AudioSystem } from './audio.js';
import { NetSession, RemoteInput } from './net.js';
import { CHARACTERS, ROSTER, LOCKED_SLOTS, getClipMap, getTuning, saveTuning } from './characterConfig.js';

const ARENAS = [
  { id: 'city', name: 'CITY BLOCK', locked: false, img: '/assets/arenas/city.png' },
  { id: 'rooftop', name: 'ROOFTOP', locked: true },
  { id: 'dojo', name: 'DOJO', locked: true },
];
import { AnimationLab } from './animLab.js';
import { enterOverlay, exitOverlay, staggerIn, attachHover, selectPop, popPortrait } from './ui/selectFx.js';
import { TouchControls } from './ui/touchControls.js';

const NEUTRAL_INPUT = { isDown: () => false, wasPressed: () => false, endFrame: () => {} };
const WINS_TO_TAKE_SET = 2;

export class FightingGame {
  constructor(container = document.body) {
    this.container = container;
    this.clock = new THREE.Clock();
    this.input = new KeyboardInput();
    this.loader = new AssetLoader();
    this.vfxReady = false;

    this.mode = 'menu';            // menu | cpu | local | host | guest
    this.arena = { halfWidth: 7.5 };
    this.roundOver = false;
    this.matchOver = false;
    this.fightStarted = false;
    this.fightersReady = false;
    this.roundEndTimer = 0;
    this.round = 1;
    this.wins = [0, 0];
    this.difficulty = 'normal';

    this.net = null;
    this.remoteInput = new RemoteInput();
    this.audio = new AudioSystem();
    const params = new URLSearchParams(location.search);
    this.isTouch = TouchControls.isTouch();
    this.isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (this.isTouch && Math.min(window.innerWidth, window.innerHeight) <= 820);
    this.lite = params.has('lite') || this.isMobile; // lighter renderer on phones
    this.hq = params.has('hq'); // opt-in reflective floor (heavier)
    if (this.isTouch) document.body.classList.add('touch');
    if (this.isMobile) document.body.classList.add('mobile');
    this.tuning = getTuning();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 2000);
    this.camDefault = { pos: new THREE.Vector3(0, 3.5, 11.5), look: new THREE.Vector3(0, 1.5, -0.4) };
    this.camera.position.copy(this.camDefault.pos);
    this.camera.lookAt(this.camDefault.look);
    this.camLook = this.camDefault.look.clone();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(this.lite ? 1 : Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = !this.lite;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.container.appendChild(this.renderer.domElement);

    this.vfx = new VFXSystem(this.scene, this.camera);

    window.addEventListener('resize', () => this.onResize());
    this.setupMenuUi();
  }

  async init() {
    addNightLights(this.scene, this.lite);
    // Reflective floor only when explicitly requested (?hq) and not in lite mode.
    this.cityArena = buildCityArena(this.scene, this.renderer, { lite: this.lite || !this.hq });
    this.arena = this.cityArena.bounds;
    this.animate();

    // Music: try to start immediately, and guarantee it on the first user interaction
    // (browsers block audio until a gesture). start() is idempotent and resumes rather
    // than restarts, so the track plays continuously across menu → mode/char/arena → fights.
    if (this.isTouch) this.touch = new TouchControls();
    this.audio.start();
    const firstGesture = (e) => {
      this.audio.start();
      // Don't grab fullscreen when the gesture is someone typing in a text field (join code).
      const typing = e?.target && e.target.closest?.('input, textarea, select, [contenteditable]');
      if (this.isMobile && !typing) this.goFullscreen();
    };
    window.addEventListener('pointerdown', firstGesture);
    window.addEventListener('keydown', firstGesture);
    this.setBanner('LOADING FIGHTERS…');
    try {
      await this.loadFighters();
      this.fightersReady = true;
      this.lab = new AnimationLab(this);
      this.showMenu(true);
      this.setBanner('');
      console.log('CRASH OUT ready. Pick a mode. Press ` for the Animation Lab.');
    } catch (err) {
      console.error('Asset load failed:', err);
      this.setBanner(`Load failed: ${err.message || err}`);
    }
  }

  // ---------------- fighters ----------------
  // Load the shared clip pool + extra clips once, then build the default menu matchup.
  async loadFighters() {
    const [walkClips, idleClips] = await Promise.all([
      this.loader.loadClips('/assets/animations/walk.glb'),
      this.loader.loadClips('/assets/animations/idle_rap.glb'),
    ]);
    this.extraClips = { walk: walkClips[0], idleRap: idleClips[0] };
    // The canonical animation library = Reeves Junya's + Moloch's embedded clips.
    // Loading them here also warms the AssetLoader cache for buildMatch().
    const jCC = await this.loader.loadCharacterWithClips(CHARACTERS.junya.modelUrl);
    const mCC = await this.loader.loadCharacterWithClips(CHARACTERS.moloch.modelUrl);
    this.clipPool = { junya: jCC.clips, moloch: mCC.clips };
    this.selectedP1 = 'junya';
    this.selectedP2 = 'moloch';
    await this.buildMatch('junya', 'moloch'); // menu-background matchup
  }

  // Build (or rebuild) a fighter for a character id. Loads the mesh (cached), assigns
  // actions from the shared pool, applies the walk + rap-idle clips.
  async makeFighter(charId, side, startX, who) {
    const cfg = { ...CHARACTERS[charId], clips: getClipMap(charId) };
    const f = new Fighter({
      id: `${side}-${charId}`, startX, character: cfg,
      bindings: side === 'P1' ? P1_BINDINGS : P2_BINDINGS,
      assetLoader: this.loader, vfx: this.vfx,
      onEvent: (t, p) => this.onFighterEvent(who, t, p),
    });
    await f.load();
    f.setTuning(this.tuning);
    f.finalizeClips(this.clipPool);
    if (this.extraClips?.walk) { f.setClip('walkForward', this.extraClips.walk); f.setClip('walkBack', this.extraClips.walk); }
    if (cfg.idleRap && this.extraClips?.idleRap) f.setClip('idle', this.extraClips.idleRap);
    f.play('idle', 0.05, true, true);
    return f;
  }

  // Swap in a fresh matchup. Gates the loop while (re)building.
  async buildMatch(p1Id, p2Id) {
    this.fightersReady = false;
    this.fightStarted = false;
    if (this.p1) this.scene.remove(this.p1.group);
    if (this.p2) this.scene.remove(this.p2.group);
    this.p1 = await this.makeFighter(p1Id, 'P1', -2.6, 1);
    this.p2 = await this.makeFighter(p2Id, 'P2', 2.6, 2);
    this.scene.add(this.p1.group, this.p2.group);
    this.placeFightersAtStart();
    this.p1.faceOpponent(this.p2);
    this.p2.faceOpponent(this.p1);
    this.p1char = p1Id; this.p2char = p2Id;
    this.fightersReady = true;
  }

  // Push live tuning (from the Animation Lab) into both fighters.
  applyTuning(t) {
    this.tuning = { ...this.tuning, ...t };
    saveTuning(this.tuning);
    this.p1?.setTuning(this.tuning); this.p2?.setTuning(this.tuning);
    this.p1?.faceOpponent(this.p2); this.p2?.faceOpponent(this.p1);
  }

  placeFightersAtStart() {
    this.p1.group.position.set(-2.6, 0, 0);
    this.p2.group.position.set(2.6, 0, 0);
    this.p1.velocity.set(0, 0, 0);
    this.p2.velocity.set(0, 0, 0);
  }

  onFighterEvent(who, type, payload) {
    this.audio.event(type, payload);
    if (type === 'hit' || type === 'ko') this.shake = 0.18;
    // Host relays nothing extra; guest derives SFX from snapshots instead.
  }

  // ---------------- menu / modes ----------------
  setupMenuUi() {
    const on = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn);
    on('btnCpu', 'click', () => this.showCharSelect('cpu'));
    on('btnLocal', 'click', () => this.showCharSelect('local'));
    on('btnHost', 'click', () => this.startHost());
    on('btnJoin', 'click', () => {
      // The 'crashout-' prefix is pre-typed in the UI; accept a bare code or a pasted full id.
      const raw = (document.getElementById('joinId')?.value || '').trim().toLowerCase();
      const code = raw.replace(/^crashout-/, '');
      if (code) this.showCharSelect('guest', 'crashout-' + code);
    });
    on('charBack', 'click', () => this.showMenu(true));
    on('charNext', 'click', () => this.onCharNext());
    on('arenaBack', 'click', () => this.showCharSelect(this.pendingMode, this.pendingJoinId));
    on('arenaFight', 'click', () => this.onArenaConfirm());
    on('difficulty', 'change', (e) => { this.difficulty = e.target.value; });
    on('replayBtn', 'click', () => this.rematch());
    on('muteBtn', 'click', () => {
      const m = this.audio.toggleMute();
      const b = document.getElementById('muteBtn'); if (b) b.textContent = m ? '🔇' : '🔊';
    });
    on('menuBtn', 'click', () => this.backToMenu());
    on('fsBtn', 'click', () => this.goFullscreen(true));
    on('reselectBtn', 'click', () => this.hostReselect());

    // Invite sharing.
    on('copyInvite', 'click', (e) => this.copyText(this._inviteLink || '', e.currentTarget, 'Copied!', 'Copy link'));
    on('copyCode', 'click', (e) => this.copyText(this._inviteCode || '', e.currentTarget, 'Copied!', 'Copy code'));
    on('shareInvite', 'click', () => {
      if (navigator.share) navigator.share({ title: 'CRASH OUT', text: this.inviteMessage(), url: this._inviteLink }).catch(() => {});
      else this.copyText(this._inviteLink || '', document.getElementById('shareInvite'), 'Link copied!', '📤 Share');
    });
    on('smsInvite', 'click', () => {
      const sep = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?';
      location.href = `sms:${sep}body=${encodeURIComponent(this.inviteMessage())}`;
    });
    on('emailInvite', 'click', () => {
      location.href = `mailto:?subject=${encodeURIComponent('CRASH OUT invite')}&body=${encodeURIComponent(this.inviteMessage())}`;
    });

    // Auto-join if opened with ?join=<id> — strip the prefix so only the code shows.
    const params = new URLSearchParams(location.search);
    const join = params.get('join');
    if (join) {
      const jf = document.getElementById('joinId'); if (jf) jf.value = join.replace(/^crashout-/, '');
    }
  }

  showMenu(show) {
    this.hideOverlays();
    if (show) { this.touch?.hide(); this.showReselectBtn(false); }
    const m = document.getElementById('menu');
    if (m) m.style.display = show ? 'grid' : 'none';
    const help = document.getElementById('help');
    if (help) help.style.display = show ? 'none' : 'block';
  }

  hideOverlays() {
    document.getElementById('charSelect')?.classList.remove('show');
    document.getElementById('arenaSelect')?.classList.remove('show');
    const np = document.getElementById('netPanel'); if (np) np.style.display = 'none';
  }

  // Go landscape fullscreen (needs a user gesture). The auto first-gesture call runs
  // once; the manual button passes force=true so it always works on demand.
  // iOS iPhone has no Fullscreen API — there we route to the install overlay instead
  // (installing the PWA is the only way to lose the Safari chrome).
  goFullscreen(force = false) {
    const el = document.documentElement;
    const canFs = !!(el.requestFullscreen || el.webkitRequestFullscreen);
    if (!canFs) {
      if (force) this.showIosInstall();
      return;
    }
    if (!force && this._fsTried) return;
    this._fsTried = true;
    try {
      const req = document.fullscreenElement ? null : (el.requestFullscreen?.() || el.webkitRequestFullscreen?.());
      Promise.resolve(req).then(() => { try { screen.orientation?.lock?.('landscape'); } catch (_) {} }).catch(() => {});
    } catch (_) {}
  }

  // Surface the iOS Add-to-Home-Screen / Web Clip overlay (defined in pwa.js markup).
  showIosInstall() {
    const overlay = document.getElementById('iosInstall');
    if (overlay) overlay.classList.add('show');
  }

  // ---------------- character / arena select ----------------
  hex(c) { return '#' + c.toString(16).padStart(6, '0'); }

  showCharSelect(mode, joinId = null) {
    this.pendingMode = mode; this.pendingJoinId = joinId;
    this.hideOverlays();
    const m = document.getElementById('menu'); if (m) m.style.display = 'none';
    const overlay = document.getElementById('charSelect');
    overlay?.classList.add('show');
    const twoPlayer = (mode === 'cpu' || mode === 'local');
    const vsP2 = document.getElementById('vsP2'); if (vsP2) vsP2.style.display = twoPlayer ? '' : 'none';
    const vsBadge = document.getElementById('vsBadge'); if (vsBadge) vsBadge.style.display = twoPlayer ? '' : 'none';
    const p1tag = document.getElementById('vsP1Tag'); if (p1tag) p1tag.textContent = twoPlayer ? (mode === 'local' ? 'PLAYER 1' : 'YOUR FIGHTER') : 'YOUR FIGHTER';
    const next = document.getElementById('charNext'); if (next) next.textContent = (mode === 'guest') ? (this.net?.connected ? 'READY ▶' : 'CONNECT ▶') : 'NEXT: ARENA ▶';
    this.activeSlot = 'p1';
    ['p1', 'p2'].forEach((slot) => { const f = document.getElementById(slot === 'p1' ? 'vsP1' : 'vsP2'); if (f) f.onclick = () => { this.activeSlot = slot; this.updateVsFrames(); this.audio.uiBlip?.(); }; });
    this.renderRoster();
    this.updateVsFrames();
    enterOverlay(overlay);
    staggerIn(overlay?.querySelectorAll('#roster .card'));
  }

  renderRoster() {
    const el = document.getElementById('roster'); if (!el) return;
    let html = ROSTER.map((id) => {
      const c = CHARACTERS[id];
      const sel = (id === this.selectedP1 || id === this.selectedP2);
      return `<div class="card fighter${sel ? ' selected' : ''}" data-id="${id}" style="--accent:${this.hex(c.color)}">
        <div class="portrait"><img src="${c.avatar}" alt="${c.name}" loading="lazy"/></div>
        <div class="cname">${c.name}</div></div>`;
    }).join('');
    for (let i = 0; i < LOCKED_SLOTS; i++) html += `<div class="card fighter locked"><div class="portrait"><span class="qmark">?</span></div><div class="cname">COMING SOON</div></div>`;
    el.innerHTML = html;
    el.querySelectorAll('.card[data-id]').forEach((card) => {
      attachHover(card);
      card.onclick = () => this.pickFighter(card.dataset.id, card);
    });
  }

  pickFighter(id, card) {
    const twoPlayer = (this.pendingMode === 'cpu' || this.pendingMode === 'local');
    if (this.activeSlot === 'p1' || !twoPlayer) this.selectedP1 = id; else this.selectedP2 = id;
    this.audio.uiSelect?.();
    selectPop(card);
    if (twoPlayer && this.activeSlot === 'p1') this.activeSlot = 'p2';
    document.querySelectorAll('#roster .card[data-id]').forEach((c) => c.classList.toggle('selected', c.dataset.id === this.selectedP1 || (twoPlayer && c.dataset.id === this.selectedP2)));
    this.updateVsFrames();
  }

  updateVsFrames() {
    const twoPlayer = (this.pendingMode === 'cpu' || this.pendingMode === 'local');
    const set = (slot, id) => {
      const c = CHARACTERS[id]; if (!c) return;
      const frame = document.getElementById(slot === 'p1' ? 'vsP1' : 'vsP2');
      const img = document.getElementById(slot === 'p1' ? 'vsP1Img' : 'vsP2Img');
      const name = document.getElementById(slot === 'p1' ? 'vsP1Name' : 'vsP2Name');
      if (img && img.getAttribute('src') !== c.avatar) { img.src = c.avatar; popPortrait(frame?.querySelector('.vsPortrait')); }
      if (name) name.textContent = c.name;
      if (frame) frame.style.setProperty('--accent', this.hex(c.color));
    };
    set('p1', this.selectedP1);
    if (twoPlayer) set('p2', this.selectedP2);
    document.getElementById('vsP1')?.classList.toggle('active', this.activeSlot === 'p1' || !twoPlayer);
    document.getElementById('vsP2')?.classList.toggle('active', twoPlayer && this.activeSlot === 'p2');
  }

  onCharNext() {
    this.audio.uiSelect?.();
    if (this.pendingMode === 'guest') {
      // Mid-match re-pick reuses the live connection; a fresh join connects first.
      if (this.net?.connected) { this.guestChar = this.selectedP1; this.guestSendPick(); }
      else this.startGuest(this.pendingJoinId);
      return;
    }
    this.showArenaSelect();
  }

  // Guest sends its chosen fighter to the host over the existing connection and waits.
  guestSendPick() {
    this.hideOverlays();
    this.net.send({ t: 'sel', char: this.guestChar });
    this.setBanner('WAITING FOR HOST…', 'good');
  }

  showArenaSelect() {
    this.hideOverlays();
    const overlay = document.getElementById('arenaSelect');
    overlay?.classList.add('show');
    this.renderArenas();
    enterOverlay(overlay);
    staggerIn(overlay?.querySelectorAll('#arenaGrid .card'));
  }

  renderArenas() {
    const el = document.getElementById('arenaGrid'); if (!el) return;
    this.selectedArena = this.selectedArena || 'city';
    el.innerHTML = ARENAS.map((a) => {
      if (a.locked) return `<div class="card arena locked"><div class="thumb"><span class="qmark">?</span></div><div class="cname">${a.name}</div><div class="ctag">COMING SOON</div></div>`;
      const bg = a.img ? ` style="background-image:url('${a.img}')"` : '';
      return `<div class="card arena${a.id === this.selectedArena ? ' selected' : ''}" data-arena="${a.id}"><div class="thumb"${bg}></div><div class="cname">${a.name}</div></div>`;
    }).join('');
    el.querySelectorAll('.card[data-arena]').forEach((card) => {
      attachHover(card);
      card.onclick = () => {
        this.selectedArena = card.dataset.arena; this.audio.uiSelect?.(); selectPop(card);
        el.querySelectorAll('.card[data-arena]').forEach((c) => c.classList.toggle('selected', c.dataset.arena === this.selectedArena));
      };
    });
  }

  onArenaConfirm() {
    if (this.pendingMode === 'host') { this.hostConfirm(); return; }
    this.confirmMatch();
  }

  async confirmMatch() {
    const mode = this.pendingMode;
    this.mode = mode;
    this.audio.start();
    this.hideOverlays();
    const help = document.getElementById('help'); if (help) help.style.display = 'block';
    this.setBanner('LOADING FIGHTERS…');
    await this.buildMatch(this.selectedP1, this.selectedP2);
    this.setBanner('');
    this.wins = [0, 0]; this.round = 1; this.matchOver = false;
    const n1 = CHARACTERS[this.selectedP1].name, n2 = CHARACTERS[this.selectedP2].name;
    if (mode === 'cpu') {
      this.aiInput = new AIInput(P2_BINDINGS, this.difficulty);
      this.p2.bindings = P2_BINDINGS; this.p2.isAI = true;
      this.setNames(n1, n2 + ' (CPU)');
    } else {
      this.p2.bindings = P2_LOCAL_BINDINGS; this.p2.isAI = false;
      this.setNames(n1 + ' · P1', n2 + ' · P2');
    }
    this.startRound(true);
  }

  setBanner(text, cls = '') {
    const b = document.getElementById('banner');
    if (!b) return;
    b.textContent = text;
    b.className = cls;
    b.style.display = text ? 'flex' : 'none';
  }

  // Host: open the room FIRST so the invite can be sent, then pick a fighter/arena.
  async startHost() {
    this.mode = 'host';
    this.audio.start();
    this.hideOverlays();
    const menu = document.getElementById('menu'); if (menu) menu.style.display = 'none';
    this.hostReady = false; this.hostChar = null; this.guestChar = null; this._matchStarting = false;
    this.net = new NetSession();
    this.net.onData = (msg) => this.onHostData(msg);
    this.net.onOpen = () => { this._guestJoined = true; this.setNetStatus('✅ Opponent joined — pick your fighter to start'); };
    this.net.onClose = () => this.setNetStatus('Opponent left.');
    this.setNetStatus('Opening room…');
    try {
      const id = await this.net.host();
      const link = `${location.origin}${location.pathname}?join=${id}`;
      this.showInvite(id, link);
    } catch (e) {
      this.setNetStatus('Could not open room. Check your connection.');
    }
  }

  setNetStatus(text) { const el = document.getElementById('netStatus'); if (el) el.textContent = text; }

  onHostData(msg) {
    if (!msg) return;
    if (msg.t === 'in') this.remoteInput.apply(msg);
    else if (msg.t === 'sel') { this.guestChar = msg.char; this.setNetStatus('✅ Opponent joined — pick your fighter to start'); this.tryBeginNetMatch(); }
  }

  // Host finished picking a fighter + arena.
  hostConfirm() {
    this.hostChar = this.selectedP1;
    this.hostReady = true;
    this.hideOverlays();
    const panel = document.getElementById('netPanel'); if (panel) panel.style.display = 'block';
    this.setNetStatus(this.guestChar ? 'Starting…' : 'Ready — waiting for your opponent to join & pick…');
    this.tryBeginNetMatch();
  }

  tryBeginNetMatch() {
    if (this._matchStarting) return;
    if (this.hostReady && this.guestChar && this.net?.connected) { this._matchStarting = true; this.beginNetMatch(); }
  }

  // Guest: picked own fighter, now connect and send the pick to the host.
  async startGuest(hostId) {
    this.mode = 'guest';
    this.audio.start();
    this.hideOverlays();
    this.guestChar = this.selectedP1;
    this.net = new NetSession();
    this.net.onData = (msg) => this.onGuestData(msg);
    this.net.onClose = () => this.setBanner('DISCONNECTED', 'bad');
    this.setBanner('CONNECTING…');
    try {
      await this.net.join(hostId);
      this.setBanner('CONNECTED — WAITING FOR HOST', 'good');
      this.net.send({ t: 'sel', char: this.guestChar });
    } catch (e) {
      this.setBanner('Could not join room.', 'bad');
    }
  }

  showInvite(id, link) {
    this.hideOverlays();
    const menu = document.getElementById('menu'); if (menu) menu.style.display = 'none';
    const panel = document.getElementById('netPanel');
    if (panel) panel.style.display = 'block';
    this._inviteLink = link;
    this._inviteCode = id.replace(/^crashout-/, ''); // bare code the friend types into the prefixed box
    const code = document.getElementById('roomCode'); if (code) code.textContent = this._inviteCode;
    const l = document.getElementById('inviteLink'); if (l) l.value = link;
    if (!this._guestJoined) this.setNetStatus('Waiting for opponent to join…');
    const pick = document.getElementById('netPickFighter'); if (pick) pick.onclick = () => this.showCharSelect('host');
    const cancel = document.getElementById('netCancel'); if (cancel) cancel.onclick = () => this.backToMenu();
    this.setBanner('');
  }

  inviteMessage() {
    return `Fight me in CRASH OUT 🥊 Join my room: ${this._inviteLink || ''}`;
  }

  // Copy text to the clipboard with an execCommand fallback (non-HTTPS / old mobile),
  // flashing a confirmation label on the button.
  copyText(text, btn, doneLabel, restoreLabel) {
    if (!text) return;
    const done = () => {
      if (!btn) return;
      const orig = restoreLabel || btn.textContent;
      btn.textContent = doneLabel;
      setTimeout(() => { btn.textContent = orig; }, 1200);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this._legacyCopy(text, done));
    } else {
      this._legacyCopy(text, done);
    }
  }

  _legacyCopy(text, done) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand('copy'); ta.remove(); done?.();
    } catch (_) {}
  }

  async beginNetMatch() {
    const panel = document.getElementById('netPanel'); if (panel) panel.style.display = 'none';
    const help = document.getElementById('help'); if (help) help.style.display = 'block';
    this.setBanner('LOADING FIGHTERS…');
    await this.buildMatch(this.hostChar, this.guestChar);
    this.setBanner('');
    this.wins = [0, 0]; this.round = 1; this.matchOver = false;
    this.p2.bindings = ACTION_BINDINGS; this.p2.isAI = false;
    this.setNames(CHARACTERS[this.hostChar].name + ' (HOST)', CHARACTERS[this.guestChar].name + ' (P2)');
    this.net.send({ t: 'setup', arena: this.selectedArena, p1char: this.hostChar, p2char: this.guestChar });
    this._reselecting = false;
    this.showReselectBtn(true); // host can bounce back to select mid-match
    this.startRound(true);
  }

  showReselectBtn(on) {
    const rb = document.getElementById('reselectBtn');
    if (rb) rb.style.display = on ? 'block' : 'none';
  }

  // Host: bounce back to fighter/arena select mid-match, keeping the connection alive.
  // Both players re-pick — the guest is told to re-open its own select.
  hostReselect() {
    if (this.mode !== 'host' || !this.net?.connected) return;
    this._reselecting = true;
    this.fightStarted = false;            // pause sim + snapshot streaming while choosing
    this.net.send({ t: 'reselect' });
    this._matchStarting = false; this._guestStarted = false;
    this.hostReady = false; this.hostChar = null; this.guestChar = null;
    this.touch?.hide();
    this.showReselectBtn(false);
    this.showCharSelect('host');
  }

  async onGuestData(msg) {
    if (!msg) return;
    if (msg.t === 'setup') {
      if (this._matchStarting) return; this._matchStarting = true;
      this._reselecting = false;
      this.setBanner('LOADING FIGHTERS…');
      if (msg.arena) this.selectedArena = msg.arena; // keep guest's arena in sync with host
      await this.buildMatch(msg.p1char, msg.p2char); // host is P1, guest is P2
      this.setBanner('');
      const help = document.getElementById('help'); if (help) help.style.display = 'block';
      this.setNames(CHARACTERS[msg.p1char].name, CHARACTERS[msg.p2char].name + ' (YOU)');
      this.touch?.show(); // guest never runs startRound() — show touch controls here so joiners can fight
    } else if (msg.t === 'reselect') {
      // Host went back to select — reset and re-open our own fighter select (both re-pick).
      this._reselecting = true;
      this._matchStarting = false; this._guestStarted = false; this._latest = null;
      this.touch?.hide();
      this.setBanner('OPPONENT IS CHOOSING…', 'good');
      this.showCharSelect('guest');
    } else if (msg.t === 'st') {
      if (this._reselecting) return; // ignore stale simulation while re-selecting
      if (!this._guestStarted) { this._guestStarted = true; this.fightStarted = true; }
      this._latest = msg;
    }
  }

  setNames(a, b) {
    const p1 = document.getElementById('p1name'); if (p1) p1.textContent = a;
    const p2 = document.getElementById('p2name'); if (p2) p2.textContent = b;
  }

  backToMenu() {
    this.net?.close(); this.net = null;
    this._matchStarting = false; this._guestStarted = false; this._latest = null; this._reselecting = false;
    this.hostReady = false; this.hostChar = null; this.guestChar = null; this._guestJoined = false;
    this.showReselectBtn(false);
    this.fightStarted = false; this.mode = 'menu';
    this.roundOver = this.matchOver = false;
    this.placeFightersAtStart();
    this.p1.health = this.p2.health = 100;
    this.p1.setState('idle'); this.p2.setState('idle');
    this.p1.play('idle', 0.1, true, true); this.p2.play('idle', 0.1, true, true);
    document.getElementById('replayBtn')?.setAttribute('style', 'display:none');
    document.getElementById('netPanel')?.setAttribute('style', 'display:none');
    this.setBanner('');
    this.showMenu(true);
  }

  // ---------------- rounds ----------------
  startRound(first = false) {
    this.touch?.show();
    this.roundOver = false;
    this.placeFightersAtStart();
    this.p1.health = this.p2.health = 100;
    this.p1.koStarted = this.p2.koStarted = false;
    this.p1.stun = this.p2.stun = 0;
    this.p1.hitStop = this.p2.hitStop = 0;
    this.p1.setState('idle'); this.p2.setState('idle');
    this.p1.play('idle', 0.05, true, true); this.p2.play('idle', 0.05, true, true);
    this.p1.faceOpponent(this.p2); this.p2.faceOpponent(this.p1);
    this.updateHud();
    document.getElementById('replayBtn')?.setAttribute('style', 'display:none');
    if (this.aiInput) this.aiInput.setDifficulty(this.difficulty);
    // round intro
    this.fightStarted = false;
    this.setBanner(`ROUND ${this.round}`, 'round');
    setTimeout(() => {
      this.setBanner('FIGHT!', 'fight');
      this.audio.bell();
      this.fightStarted = true;
      setTimeout(() => this.setBanner(''), 700);
    }, 900);
  }

  rematch() { this.wins = [0, 0]; this.round = 1; this.matchOver = false; this.startRound(true); }

  checkRoundOver() {
    if (this.roundOver) return;
    if (this.p1.health > 0 && this.p2.health > 0) return;
    this.roundOver = true;
    const p1down = this.p1.health <= 0, p2down = this.p2.health <= 0;
    let winner = 0;
    if (p1down && p2down) winner = 0;
    else if (p2down) { winner = 1; this.wins[0]++; }
    else { winner = 2; this.wins[1]++; }
    this.updatePips();
    this.audio.event('ko');
    if (this.wins[0] >= WINS_TO_TAKE_SET || this.wins[1] >= WINS_TO_TAKE_SET) {
      this.matchOver = true;
      const who = this.wins[0] >= WINS_TO_TAKE_SET ? this.nameP1() : this.nameP2();
      this.setBanner(`${who} WINS!`, 'ko');
      document.getElementById('replayBtn')?.setAttribute('style', 'display:block');
    } else {
      this.setBanner(winner === 0 ? 'DOUBLE KO' : `${winner === 1 ? this.nameP1() : this.nameP2()} — K.O.`, 'ko');
      this.roundEndTimer = 2.2;
    }
  }

  nameP1() { return document.getElementById('p1name')?.textContent || 'REEVES JUNYA'; }
  nameP2() { return document.getElementById('p2name')?.textContent || 'MOLOCH'; }

  // ---------------- loop ----------------
  animate() {
    requestAnimationFrame(() => this.animate());
    // Clamp to 1/15 (not 1/30): below 30fps the old cap ran the sim in slow-motion.
    const dt = Math.min(this.clock.getDelta(), 1 / 15);
    this.cityArena?.update(dt);
    this.update(dt);
    this.vfx.update(dt);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
    this.aiInput?.endFrame();
    this.remoteInput.endFrame();
    this.updateFps(dt);
  }

  updateFps(dt) {
    this._fpsAcc = (this._fpsAcc || 0) + dt;
    this._fpsN = (this._fpsN || 0) + 1;
    if (this._fpsAcc >= 0.5) {
      const fps = Math.round(this._fpsN / this._fpsAcc);
      const el = document.getElementById('fps');
      if (el) el.textContent = `${fps} FPS`;
      this._fpsAcc = 0; this._fpsN = 0;
    }
  }

  update(dt) {
    if (!this.fightersReady) return;

    // Animation Lab clip-preview: freeze game logic, just advance mixers so previews play.
    // (Tuning sliders leave freeze off so gameplay keeps running.)
    if (this.lab?.freeze) { this.p1.mixer?.update(dt); this.p2.mixer?.update(dt); return; }

    if (this.mode === 'guest') return this.updateGuest(dt);

    if (!this.fightStarted || this.mode === 'menu') {
      this.p1.play('idle', 0.12); this.p2.play('idle', 0.12);
      this.p1.mixer?.update(dt); this.p2.mixer?.update(dt);
      this.p1.faceOpponent(this.p2); this.p2.faceOpponent(this.p1);
      return;
    }

    this.p1.faceOpponent(this.p2);
    this.p2.faceOpponent(this.p1);

    if (!this.roundOver) {
      const p2input = this.mode === 'cpu' ? this.aiInput : (this.mode === 'host' ? this.remoteInput : this.input);
      if (this.mode === 'cpu') this.aiInput.update(dt, this.p2, this.p1);
      this.p1.update(dt, this.input, this.p2, this.arena);
      this.p2.update(dt, p2input, this.p1, this.arena);
      this.checkRoundOver();
    } else {
      this.p1.update(dt, NEUTRAL_INPUT, this.p2, this.arena);
      this.p2.update(dt, NEUTRAL_INPUT, this.p1, this.arena);
      if (!this.matchOver && this.roundEndTimer > 0) {
        this.roundEndTimer -= dt;
        if (this.roundEndTimer <= 0) { this.round++; this.startRound(); }
      }
    }
    this.updateHud();

    // Host streams authoritative state to the guest.
    if (this.mode === 'host' && this.net?.connected) {
      this.net.send({ t: 'st', p1: this.p1.serialize(), p2: this.p2.serialize(), ro: this.roundOver, mo: this.matchOver, w: this.wins, rt: document.getElementById('banner')?.textContent || '' });
    }
  }

  updateGuest(dt) {
    // Send local input (guest controls P2).
    if (this.net?.connected) this.net.send({ t: 'in', ...sampleActions(this.input, P1_BINDINGS) });
    const s = this._latest;
    if (s) {
      const prevP2 = this.p2.health;
      this.p1.applyNetState(s.p1, dt);
      this.p2.applyNetState(s.p2, dt);
      if (s.p2.h < prevP2) this.audio.event('hit');
      this.wins = s.w || this.wins;
      this.updatePips();
      this.roundOver = s.ro; this.matchOver = s.mo;
      if (s.rt) this.setBanner(s.rt, s.mo ? 'ko' : (s.ro ? 'ko' : ''));
      else this.setBanner('');
      this.updateHud();
    } else {
      this.p1.mixer?.update(dt); this.p2.mixer?.update(dt);
    }
  }

  updateCamera(dt) {
    // Tekken-style: gently frame the midpoint, pull back with distance.
    if (!this.p1 || !this.p2) return;
    const midX = (this.p1.group.position.x + this.p2.group.position.x) * 0.5;
    const dist = Math.abs(this.p1.group.position.x - this.p2.group.position.x);
    const targetX = THREE.MathUtils.clamp(midX * 0.45, -2.5, 2.5);
    const targetZ = 10.5 + Math.min(dist * 0.35, 3.2);
    let shakeX = 0, shakeY = 0;
    if (this.shake > 0) { this.shake -= dt; shakeX = (Math.random() - 0.5) * this.shake; shakeY = (Math.random() - 0.5) * this.shake; }
    const k = Math.min(1, dt * 4);
    this.camera.position.x += (targetX + shakeX - this.camera.position.x) * k;
    this.camera.position.y += (3.5 + shakeY - this.camera.position.y) * k;
    this.camera.position.z += (targetZ - this.camera.position.z) * k;
    this.camLook.x += (midX * 0.5 - this.camLook.x) * k;
    this.camera.lookAt(this.camLook.x, 1.5, -0.4);
  }

  updateHud() {
    const p1 = document.getElementById('p1Health'); if (p1) p1.style.width = `${Math.max(0, this.p1.health)}%`;
    const p2 = document.getElementById('p2Health'); if (p2) p2.style.width = `${Math.max(0, this.p2.health)}%`;
  }
  updatePips() {
    const set = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = '●'.repeat(n) + '○'.repeat(WINS_TO_TAKE_SET - n); };
    set('p1pips', this.wins[0]); set('p2pips', this.wins[1]);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
