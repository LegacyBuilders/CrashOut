import * as THREE from 'three';
import { ATTACKS, DEFAULT_ANIMATION_MAP, ANIMATION_SPEEDS, ANIMATION_START } from './animationMap.js';
import { makeFallbackFighter, normalizeFbxObject, normalizeObject, sanitizeClipForFighter } from './assetLoader.js';

const STATE = {
  IDLE: 'idle', WALK: 'walk', JUMP: 'jump', CROUCH: 'crouch', BLOCK: 'block', ATTACK: 'attack', HIT: 'hit', KO: 'ko', LAUNCHED: 'launched'
};

export class Fighter {
  constructor({ id, color, startX, modelUrl, animationBaseUrl, bindings, assetLoader, isAI = false, vfx = null, character = null, clipMap = null, onEvent = null }) {
    this.id = id;
    this.character = character;
    this.color = color ?? character?.color ?? 0x3388ff;
    this.modelUrl = modelUrl ?? character?.modelUrl;
    this.clipMap = clipMap ?? character?.clips ?? null; // action -> clip index (GLB path)
    this.animationBaseUrl = animationBaseUrl;
    this.bindings = bindings;
    this.assetLoader = assetLoader;
    this.isAI = isAI;
    this.vfx = vfx;
    this.onEvent = onEvent; // (type, payload) => void  — SFX / netcode hook
    this.startX = startX;
    this.clips = [];

    this.group = new THREE.Group();
    this.group.position.set(startX, 0, 0);
    this.velocity = new THREE.Vector3();
    this.facing = startX < 0 ? 1 : -1;

    this.health = 100;
    this.state = STATE.IDLE;
    this.stateTime = 0;
    this.attackKind = null;
    this.attackHasHit = false;
    this.hitStop = 0;
    this.stun = 0;
    this.isGrounded = true;
    this.crouching = false;
    this.blocking = false;
    this.koStarted = false;

    this.maxSpeed = 3.2;
    this.acceleration = 22;
    this.friction = 18;
    this.jumpVelocity = 6.2;
    this.gravity = -18;
    this.radius = 0.45;
    this.height = 2.0;

    // tunable (set via setTuning) — see characterConfig DEFAULT_TUNING
    this.faceOffset = 0;     // added to base ±90° so fighters face each other
    this.koYOffset = -0.9;   // sink the body on defeat so it rests on the ground
    this.animSpeed = 1.0;    // master animation-speed multiplier

    // special / launch mechanic
    this.hasSpecial = Boolean(character?.hasSpecial);
    this.launchPhase = null;
    this.launchTime = 0;
    this.launchHeight = 2.6;
    this.pendingLaunchDamage = 0;
    this._useGlb = false;

    this.mixer = null;
    this.actions = new Map();
    this.currentAction = null;
    this.currentActionName = null;
    this.animationsReady = false;
    this.visualBaseScale = new THREE.Vector3(1, 1, 1);
    this.visualBasePosition = new THREE.Vector3(0, 0, 0);
    this.visualOffset = { scale: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
  }

  async load() {
    let visual;
    const useGlb = Boolean(this.clipMap) && /\.glb($|\?)|\.gltf($|\?)/i.test(this.modelUrl || '');
    try {
      if (useGlb) {
        const { object, clips } = await this.assetLoader.loadCharacterWithClips(this.modelUrl);
        visual = object;
        this.clips = clips;
        normalizeObject(visual, this.height);
        console.log(`[${this.id}] Loaded GLB character ${this.modelUrl} with ${clips.length} embedded clips`);
      } else {
        visual = await this.assetLoader.loadFBX(this.modelUrl);
        normalizeFbxObject(visual, this.height);
        console.log(`[${this.id}] Loaded character mesh: ${this.modelUrl}`);
      }
    } catch (err) {
      console.warn(`[${this.id}] Could not load ${this.modelUrl}. Using fallback fighter.`, err);
      visual = makeFallbackFighter(this.color);
      this.clips = [];
    }

    this.visual = visual;
    this.group.add(visual);
    this.visualBaseScale.copy(visual.scale);
    this.visualBasePosition.copy(visual.position);
    if (this.character?.visual) this.applyVisualTransform({ scale: this.character.visual.scale ?? 1, y: this.character.visual.y ?? 0 });
    this.mixer = new THREE.AnimationMixer(visual);

    if (useGlb) {
      this._useGlb = true; // clips assigned later via finalizeClips(pool) once both models are loaded
    } else {
      await this.loadAllAnimations();
      this.animationsReady = true;
      this.play('idle', 0.05, true, true);
    }
    console.log(`[${this.id}] mesh + ${this.clips.length} clips loaded.`);
  }

  // Called once both fighters are loaded so cross-character borrows can resolve.
  finalizeClips(pool) {
    if (this._useGlb) this.assignFromPool(this.clipMap, pool);
    this.animationsReady = true;
    this.play('idle', 0.05, true, true);
  }

  // Resolve a clip map value: number = own clip; "src:idx" = borrow from pool.
  resolveClip(ref, pool) {
    if (typeof ref === 'number') return this.clips[ref];
    if (typeof ref === 'string') {
      const [src, idx] = ref.split(':');
      return pool?.[src]?.[Number(idx)];
    }
    return null;
  }

  assignFromPool(map, pool) {
    this.actions.clear();
    for (const [name, val] of Object.entries(map)) {
      const refs = Array.isArray(val) ? val : [val];
      const acts = [];
      for (const ref of refs) {
        const raw = this.resolveClip(ref, pool);
        if (!raw) { console.warn(`[${this.id}] missing clip ${ref} for '${name}'`); continue; }
        const clip = sanitizeClipForFighter(raw, name);
        clip.name = `${name}_${ref}`;
        const action = this.mixer.clipAction(clip);
        action.clampWhenFinished = true;
        acts.push(action);
      }
      if (acts.length === 1) this.actions.set(name, acts[0]);
      else if (acts.length > 1) this.actions.set(name, acts);
    }
  }

  // Bind an external GLB clip (same Tripo skeleton) as an action, replacing any existing.
  // Strips position tracks so it plays in place (the game drives movement).
  setClip(name, clip) {
    if (!clip || !this.mixer) return;
    const tracks = clip.tracks.filter((t) => !t.name.endsWith('.position'));
    const c = new THREE.AnimationClip(`${name}_ext`, clip.duration, tracks);
    const action = this.mixer.clipAction(c);
    action.clampWhenFinished = true;
    this.actions.set(name, action);
  }

  setTuning(t) {
    if (!t) return;
    this.faceOffset = t.faceOffset ?? this.faceOffset;
    this.koYOffset = t.koYOffset ?? this.koYOffset;
    this.jumpVelocity = t.jumpVelocity ?? this.jumpVelocity;
    this.gravity = t.gravity ?? this.gravity;
    this.animSpeed = t.animSpeed ?? this.animSpeed;
  }

  applyKoPose(active) {
    if (!this.visual) return;
    const baseY = this.visualBasePosition.y + (this.visualOffset?.y || 0);
    this.visual.position.y = active ? baseY + this.koYOffset : baseY;
  }

  // Build the actions map directly from embedded GLB clips using an action->index map.
  assignClipsFromMap(map) {
    this.actions.clear();
    for (const [name, idx] of Object.entries(map)) {
      const indices = Array.isArray(idx) ? idx : [idx];
      const actionsForName = [];
      for (const i of indices) {
        const raw = this.clips[i];
        if (!raw) { console.warn(`[${this.id}] clip index ${i} missing for '${name}'`); continue; }
        const clip = sanitizeClipForFighter(raw, name);
        clip.name = `${name}_${i}`;
        const action = this.mixer.clipAction(clip);
        action.clampWhenFinished = true;
        actionsForName.push(action);
      }
      if (actionsForName.length === 1) this.actions.set(name, actionsForName[0]);
      else if (actionsForName.length > 1) this.actions.set(name, actionsForName);
    }
  }

  // Play a raw embedded clip by index (Animation Lab preview; no sanitize).
  previewClip(index) {
    const raw = this.clips[index];
    if (!raw || !this.mixer) return null;
    if (this._preview) this._preview.stop();
    const clip = raw.clone();
    clip.name = `preview_${index}`;
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.setEffectiveWeight(1);
    action.play();
    if (this.currentAction && this.currentAction !== action) this.currentAction.stop();
    this._preview = action;
    this.currentAction = action;
    this.currentActionName = `preview_${index}`;
    return +raw.duration.toFixed(2);
  }

  clipCount() { return this.clips.length; }

  // Live remap used by the Animation Lab.
  remapAction(name, index) {
    const raw = this.clips[index];
    if (!raw) return false;
    const clip = sanitizeClipForFighter(raw, name);
    clip.name = `${name}_${index}`;
    const action = this.mixer.clipAction(clip);
    action.clampWhenFinished = true;
    this.actions.set(name, action);
    if (this.currentActionName === name) { this.currentAction = null; this.play(name, 0.05, true, true); }
    return true;
  }

  async loadAllAnimations() {
    const names = Object.keys(DEFAULT_ANIMATION_MAP);
    await Promise.all(names.map((name) => this.loadAnimationEntry(name)));
  }

  async loadAnimationEntry(name) {
    if (this.actions.has(name)) return;
    const base = this.animationBaseUrl;
    const files = DEFAULT_ANIMATION_MAP[name];
    const fileList = Array.isArray(files) ? files : [files];
    const loadedActions = [];

    await Promise.all(fileList.map(async (file, index) => {
      const url = `${base}/${encodeURIComponent(file)}`;
      try {
        const actionName = fileList.length === 1 ? name : `${name}_${index}`;
        const clip = await this.assetLoader.loadAnimationClip(url, actionName);
        const action = this.mixer.clipAction(clip);
        action.clampWhenFinished = true;
        loadedActions.push(action);
        console.log(`[${this.id}] Loaded animation ${name}: ${file}`);
      } catch (err) {
        console.warn(`[${this.id}] Missing/bad animation ${name}: ${url}`, err.message || err);
      }
    }));

    if (loadedActions.length === 1) this.actions.set(name, loadedActions[0]);
    if (loadedActions.length > 1) this.actions.set(name, loadedActions);
    if (name === 'idle' && !this.actions.has('idle')) console.error(`[${this.id}] Idle animation not loaded: ${base}/Idle.fbx`);
  }

  applyVisualTransform({ scale = 1, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
    this.visualOffset = { scale, x, y, z, rx, ry, rz };
    if (!this.visual) return;
    this.visual.scale.copy(this.visualBaseScale).multiplyScalar(scale);
    this.visual.position.copy(this.visualBasePosition).add(new THREE.Vector3(x, y, z));
    this.visual.rotation.set(THREE.MathUtils.degToRad(rx), THREE.MathUtils.degToRad(ry), THREE.MathUtils.degToRad(rz));
  }

  pickAction(name) {
    const entry = this.actions.get(name);
    if (!Array.isArray(entry)) return entry;
    return entry[Math.floor(Math.random() * entry.length)];
  }

  play(name, fade = 0.08, loop = true, forceRestart = false) {
    const next = this.pickAction(name);
    if (!next) return false;
    if (!forceRestart && next === this.currentAction && next.isRunning()) return true;
    next.paused = false;
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale((ANIMATION_SPEEDS[name] ?? 1) * (this.animSpeed || 1));
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    const startFrac = ANIMATION_START[name];
    if (startFrac) next.time = (next.getClip()?.duration || 0) * startFrac; // skip clip wind-up
    next.fadeIn(fade).play();
    if (this.currentAction && this.currentAction !== next) this.currentAction.fadeOut(fade);
    this.currentAction = next;
    this.currentActionName = name;
    return true;
  }

  update(dt, input, opponent, arena) {
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      this.mixer?.update(dt * 0.25);
      return;
    }

    if (this.state === STATE.LAUNCHED) {
      this.updateLaunched(dt, arena);
      this.mixer?.update(dt);
      return;
    }

    if (this.health <= 0) {
      if (!this.koStarted) {
        this.koStarted = true;
        this.setState(STATE.KO);
        this.play('ko', 0.05, false, true);
        this.applyKoPose(true);
      }
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, this.friction, dt);
      this.integrate(dt, arena);
      this.mixer?.update(dt);
      return;
    }

    this.stateTime += dt;
    this.crouching = input.isDown(this.bindings.down);
    this.blocking = this.crouching && opponent?.state === STATE.ATTACK;

    if (this.stun > 0) {
      this.stun -= dt;
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, this.friction, dt);
      this.integrate(dt, arena);
      this.mixer?.update(dt);
      return;
    }

    if (this.state === STATE.ATTACK) {
      this.updateAttack(opponent, dt);
      if (this.attackKind !== 'kick') this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, this.friction, dt);
      this.integrate(dt, arena);
      this.mixer?.update(dt);
      return;
    }

    const left = input.isDown(this.bindings.left);
    const right = input.isDown(this.bindings.right);
    const wantsJump = input.wasPressed(this.bindings.up);
    const punch = input.wasPressed(this.bindings.punch);
    const kick = input.wasPressed(this.bindings.kick);
    const heavy = input.wasPressed(this.bindings.heavy);

    if (punch) this.startAttack('punch');
    else if (kick) this.startAttack('kick');
    else if (heavy) this.startAttack('heavy');
    else if (wantsJump && this.isGrounded) {
      this.velocity.y = this.jumpVelocity;
      this.isGrounded = false;
      this.setState(STATE.JUMP);
      this.play('jump', 0.05, false, true);
      this.vfx?.spawnDust(this.getFootPosition(), 18);
      this.onEvent?.('jump');
    } else if (!this.isGrounded) {
      // Air control — drift left/right mid-jump so you can hop over the opponent.
      let move = 0;
      if (left) move -= 1;
      if (right) move += 1;
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, move * this.maxSpeed * 0.9, this.acceleration * 0.6, dt);
      if (this.state !== STATE.JUMP) { this.setState(STATE.JUMP); this.play('jump', 0.1, false); }
    } else {
      let move = 0;
      if (left) move -= 1;
      if (right) move += 1;

      if (move !== 0) this.velocity.x = THREE.MathUtils.damp(this.velocity.x, move * this.maxSpeed, this.acceleration, dt);
      else this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, this.friction, dt);

      if (this.crouching) {
        this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, this.friction * 1.5, dt);
        this.setState(this.blocking ? STATE.BLOCK : STATE.CROUCH);
        this.play(this.blocking ? 'block' : 'crouch', 0.08, false);
      } else if (Math.abs(this.velocity.x) > 0.08) {
        this.setState(STATE.WALK);
        const movingTowardFacing = Math.sign(this.velocity.x) === this.facing;
        this.play(movingTowardFacing ? 'walkForward' : 'walkBack', 0.08);
      } else {
        this.setState(STATE.IDLE);
        this.play('idle', 0.12);
      }
    }

    this.integrate(dt, arena);
    this.mixer?.update(dt);
  }

  setState(s) {
    if (this.state !== s) {
      if ((this.state === STATE.KO || this.state === STATE.LAUNCHED) && s !== STATE.KO && s !== STATE.LAUNCHED) {
        this.applyKoPose(false);
      }
      this.state = s;
      this.stateTime = 0;
    }
  }

  startAttack(kind) {
    if (this.health <= 0) return;
    // Moloch's heavy is a special spell that launches the opponent.
    const effective = (kind === 'heavy' && this.hasSpecial) ? 'special' : kind;
    this.attackKind = effective;
    this.attackHasHit = false;
    if (kind === 'kick') this.velocity.x = this.facing * (this.maxSpeed * 1.4); // spin-kick lunges in
    else this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, this.friction, 1 / 60);
    this.setState(STATE.ATTACK);
    this.play(effective, 0.025, false, true); // 'special' is its own action for Moloch
    this.onEvent?.('whoosh', { kind: effective });
  }

  updateAttack(opponent, dt = 1 / 60) {
    const atk = ATTACKS[this.attackKind];
    const t = this.stateTime;
    if (!atk) { this.setState(STATE.IDLE); this.play('idle', 0.1); return; }
    // Keep the spinning kick drifting forward through its active window so it sweeps in.
    if (this.attackKind === 'kick' && t < atk.startup + atk.active) this.velocity.x = this.facing * (this.maxSpeed * 1.1);
    if (!this.attackHasHit && t >= atk.startup && t <= atk.startup + atk.active) {
      const dx = opponent.group.position.x - this.group.position.x;
      const dist = Math.abs(dx);
      const correctSide = Math.sign(dx) === this.facing || dist < 0.6;
      if (correctSide && dist <= atk.range && opponent.health > 0) {
        if (this.attackKind === 'special') {
          if (opponent.canBeLaunched?.()) {
            opponent.launch(this, atk.damage);
            this.attackHasHit = true;
            this.vfx?.spawnFlash?.(new THREE.Vector3(opponent.group.position.x, 1.4, opponent.group.position.z + 0.5), 0x7a4bff, 1.2, 0.3);
          }
        } else {
          const hit = opponent.receiveHit(atk, this);
          this.attackHasHit = true;
          const frontZ = this.group.position.z + 0.65;
          const hitPoint = new THREE.Vector3((this.group.position.x + opponent.group.position.x) * 0.5, 1.35, frontZ);
          this.vfx?.spawnHit(hitPoint, new THREE.Vector3(this.facing, 0.15, 0.25), Boolean(hit?.blocked));
        }
      }
    }
    if (t >= atk.startup + atk.active + atk.recovery) {
      this.attackKind = null;
      this.setState(STATE.IDLE);
      this.play('idle', 0.08);
    }
  }

  // ---- Moloch's special: launch the victim into the air, then drop for heavy damage ----
  canBeLaunched() { return this.health > 0 && this.state !== STATE.LAUNCHED && this.state !== STATE.KO; }

  launch(attacker, damage = 30) {
    this.pendingLaunchDamage = damage;
    this.setState(STATE.LAUNCHED);
    this.launchPhase = 'rise';
    this.launchTime = 0;
    this.velocity.set(0, 0, 0);
    this.isGrounded = false;
    this.stun = 0; this.hitStop = 0;
    this.play('ko', 0.1, false, true); // defeat clip plays while airborne
  }

  updateLaunched(dt, arena) {
    this.launchTime += dt;
    if (this.launchPhase === 'rise') {
      this.group.position.y += (this.launchHeight - this.group.position.y) * Math.min(1, dt * 8);
      if (this.launchTime > 0.35) { this.launchPhase = 'hang'; this.launchTime = 0; }
    } else if (this.launchPhase === 'hang') {
      if (this.launchTime > 0.4) { this.launchPhase = 'fall'; this.launchTime = 0; this.velocity.y = 1.5; }
    } else if (this.launchPhase === 'fall') {
      this.velocity.y += this.gravity * 1.4 * dt;
      this.group.position.y += this.velocity.y * dt;
      if (this.group.position.y <= 0) {
        this.group.position.y = 0; this.velocity.y = 0; this.isGrounded = true;
        this.launchPhase = null;
        this.vfx?.spawnDust(this.getFootPosition(), 26);
        this.health = Math.max(0, this.health - this.pendingLaunchDamage);
        this.hitStop = 0.08;
        this.onEvent?.('ko', { damage: this.pendingLaunchDamage });
        if (this.health <= 0) {
          this.koStarted = true; this.setState(STATE.KO); this.applyKoPose(true); this.play('ko', 0.05, false, true);
        } else {
          this.setState(STATE.HIT); this.stun = 0.45; this.play('hit', 0.05, false, true);
        }
      }
    }
    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -arena.halfWidth, arena.halfWidth);
  }

  receiveHit(atk, attacker) {
    if (this.health <= 0) return { blocked: false, ko: true };
    const isBlocking = this.blocking && this.facing === -attacker.facing;
    const damage = isBlocking ? Math.ceil(atk.damage * 0.2) : atk.damage;
    this.health = Math.max(0, this.health - damage);
    // NO position push and NO knockback velocity. Crossing is allowed.
    this.stun = this.health <= 0 ? 0 : (isBlocking ? 0.12 : 0.32);
    this.hitStop = this.health <= 0 ? 0 : 0.035;
    attacker.hitStop = this.health <= 0 ? 0 : 0.025;
    if (this.health <= 0) {
      this.koStarted = true;
      this.setState(STATE.KO);
      this.play('ko', 0.05, false, true);
      this.applyKoPose(true);
      this.onEvent?.('ko', { damage });
    } else {
      this.setState(STATE.HIT);
      this.play('hit', 0.05, false, true);
      this.onEvent?.(isBlocking ? 'block' : 'hit', { damage, heavy: atk.damage >= 12 });
    }
    return { blocked: isBlocking, ko: this.health <= 0 };
  }

  integrate(dt, arena) {
    const wasGrounded = this.isGrounded;
    this.velocity.y += this.gravity * dt;
    this.group.position.x += this.velocity.x * dt;
    this.group.position.y += this.velocity.y * dt;
    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -arena.halfWidth, arena.halfWidth);
    if (this.group.position.y <= 0) {
      this.group.position.y = 0;
      this.velocity.y = 0;
      this.isGrounded = true;
      if (!wasGrounded) {
        this.vfx?.spawnDust(this.getFootPosition(), 18);
        this.onEvent?.('land');
        if (this.state === STATE.JUMP) {
          this.setState(STATE.IDLE);
          this.play('idle', 0.1);
        }
      }
    } else {
      this.isGrounded = false;
    }
  }

  getFootPosition() {
    return new THREE.Vector3(this.group.position.x, 0.05, this.group.position.z + 0.45);
  }

  faceOpponent(opponent) {
    this.facing = opponent.group.position.x >= this.group.position.x ? 1 : -1;
    this.group.rotation.y = (this.facing === 1 ? Math.PI / 2 : -Math.PI / 2) + (this.faceOffset || 0);
  }

  // ---- Netcode: host serializes authoritative state; guest applies it ----
  serialize() {
    return {
      x: +this.group.position.x.toFixed(3),
      y: +this.group.position.y.toFixed(3),
      f: this.facing,
      a: this.currentActionName,
      h: Math.round(this.health),
      s: this.state,
    };
  }

  applyNetState(s, dt) {
    if (!s) return;
    // Smooth position, snap facing/health/animation.
    const k = Math.min(1, dt * 20);
    this.group.position.x += (s.x - this.group.position.x) * k;
    this.group.position.y += (s.y - this.group.position.y) * k;
    this.facing = s.f;
    this.group.rotation.y = (this.facing === 1 ? Math.PI / 2 : -Math.PI / 2) + (this.faceOffset || 0);
    this.health = s.h;
    this.state = s.s;
    this.applyKoPose(s.s === STATE.KO || s.s === STATE.LAUNCHED);
    const oneShot = ['punch', 'kick', 'heavy', 'ko', 'hit', 'jump'];
    if (s.a && s.a !== this.currentActionName) {
      this.play(s.a, 0.08, !oneShot.includes(s.a), true);
    }
    this.mixer?.update(dt);
  }
}
