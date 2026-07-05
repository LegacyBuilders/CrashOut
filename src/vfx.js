import * as THREE from 'three';

function makeImpactTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';

  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.42);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,235,120,0.9)');
  g.addColorStop(1, 'rgba(255,235,120,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r1 = size * 0.12;
    const r2 = size * (0.32 + (i % 3) * 0.04);
    const w = 0.075;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a - w) * r1, cy + Math.sin(a - w) * r1);
    ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    ctx.lineTo(cx + Math.cos(a + w) * r1, cy + Math.sin(a + w) * r1);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function makeRingTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,120,0.5)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.38, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export class VFXSystem {
  constructor(scene) {
    this.scene = scene;
    this.sprites = [];
    this.impactTex = makeImpactTexture();
    this.ringTex = makeRingTexture();
  }

  spawnHit(position, direction = new THREE.Vector3(1, 0, 0), blocked = false) {
    const baseSize = blocked ? 0.42 : 0.62;
    this.spawnSprite(this.impactTex, position, 0xfff2aa, baseSize, 0.13, {
      rotation: Math.random() * Math.PI,
      grow: 3.4,
      additive: true
    });

    const ringPos = position.clone();
    ringPos.y += 0.02;
    this.spawnSprite(this.ringTex, ringPos, blocked ? 0xaaddff : 0xffffff, blocked ? 0.55 : 0.82, 0.16, {
      rotation: Math.atan2(direction.y, direction.x),
      grow: 4.2,
      additive: true
    });

    this.spawnSpeedLines(position, direction, blocked ? 3 : 6);
  }

  spawnSpeedLines(position, direction, count = 5) {
    const dir = direction.clone().normalize();
    for (let i = 0; i < count; i++) {
      const geo = new THREE.PlaneGeometry(0.55 + Math.random() * 0.35, 0.035);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xfff4b0,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const line = new THREE.Mesh(geo, mat);
      line.position.copy(position).add(new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(0.25),
        THREE.MathUtils.randFloatSpread(0.3),
        THREE.MathUtils.randFloatSpread(0.15)
      ));
      line.rotation.z = Math.atan2(dir.y, dir.x) + THREE.MathUtils.randFloatSpread(0.35);
      line.userData.life = 0.10 + Math.random() * 0.05;
      line.userData.maxLife = line.userData.life;
      line.userData.velocity = dir.clone().multiplyScalar(1.5 + Math.random() * 1.5);
      this.scene.add(line);
      this.sprites.push(line);
    }
  }

  spawnDust(position, count = 1) {
    // Small ground ring, not explosion smoke.
    this.spawnSprite(this.ringTex, position.clone().add(new THREE.Vector3(0, 0.04, 0)), 0xb9aa88, 0.35, 0.18, {
      rotation: -Math.PI / 2,
      grow: 3.0,
      additive: false
    });
  }

  spawnFlash(position, color = 0xffffff, size = 0.55, life = 0.16) {
    this.spawnSprite(this.impactTex, position, color, size, life, { grow: 2.2, additive: true });
  }

  spawnSprite(texture, position, color, size, life, opts = {}) {
    const mat = new THREE.SpriteMaterial({
      map: texture,
      color,
      transparent: true,
      opacity: 0.9,
      blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false,
      rotation: opts.rotation || 0,
      toneMapped: false
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.scale.set(size, size, size);
    sprite.userData.life = life;
    sprite.userData.maxLife = life;
    sprite.userData.grow = opts.grow || 2.5;
    sprite.userData.velocity = new THREE.Vector3();
    this.scene.add(sprite);
    this.sprites.push(sprite);
  }

  update(dt) {
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const obj = this.sprites[i];
      obj.userData.life -= dt;
      const fade = Math.max(obj.userData.life / obj.userData.maxLife, 0);
      obj.position.addScaledVector(obj.userData.velocity || new THREE.Vector3(), dt);
      obj.scale.multiplyScalar(1 + dt * (obj.userData.grow || 2.5));
      obj.material.opacity = fade * 0.9;
      if (obj.userData.life <= 0) {
        this.scene.remove(obj);
        obj.geometry?.dispose?.();
        obj.material?.dispose?.();
        this.sprites.splice(i, 1);
      }
    }
  }
}
