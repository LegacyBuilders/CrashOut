import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

// Procedural neon night city block — the "Crash Out" stage.
// Wet reflective asphalt, sodium streetlights, neon signage, a jersey barrier,
// a parked sedan, trash bags, and a tall building backdrop, drenched in fog.

const HALF_WIDTH = 7.5;

// ---------- canvas texture helpers ----------
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, ctx: c.getContext('2d') };
}

function buildingFacadeTexture() {
  const { c, ctx } = makeCanvas(256, 512);
  ctx.fillStyle = '#0a0c14';
  ctx.fillRect(0, 0, 256, 512);
  // lit windows
  for (let y = 12; y < 512; y += 26) {
    for (let x = 10; x < 256; x += 22) {
      const lit = Math.random();
      if (lit < 0.5) { ctx.fillStyle = 'rgba(10,14,24,1)'; }
      else {
        const warm = Math.random() < 0.7;
        const a = 0.35 + Math.random() * 0.5;
        ctx.fillStyle = warm ? `rgba(255,210,140,${a})` : `rgba(150,200,255,${a})`;
      }
      ctx.fillRect(x, y, 13, 16);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function neonSignTexture(text, color = '#ff3b6b') {
  const { c, ctx } = makeCanvas(512, 160);
  ctx.clearRect(0, 0, 512, 160);
  ctx.font = '900 96px Arial Black, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 40;
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 84);
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#fff';
  ctx.globalAlpha = 0.85;
  ctx.fillText(text, 256, 84);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function puddleNormalTexture() {
  const { c, ctx } = makeCanvas(512, 512);
  ctx.fillStyle = 'rgb(128,128,255)';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 8 + Math.random() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(150,150,255,0.9)');
    g.addColorStop(1, 'rgba(128,128,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

// ---------- pieces ----------
function makeStreetlight(x, z) {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x141821, roughness: 0.6, metalness: 0.7 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 6.2, 10), poleMat);
  pole.position.set(x, 3.1, z);
  pole.castShadow = true;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8), poleMat);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(x + 0.5, 6.1, z);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffcf7a, emissiveIntensity: 3.2, roughness: 0.4 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.28), headMat);
  head.position.set(x + 1.0, 6.05, z);
  const lamp = new THREE.PointLight(0xffc06a, 26, 16, 2.0);
  lamp.position.set(x + 1.0, 5.9, z);
  lamp.castShadow = false;
  // faint light cone
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(1.4, 5.6, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffca7a, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  cone.position.set(x + 1.0, 3.1, z);
  g.add(pole, arm, head, lamp, cone);
  return g;
}

function makeNeon(text, color, x, y, z, scale = 1) {
  const g = new THREE.Group();
  const tex = neonSignTexture(text, color);
  const w = 3.2 * scale, h = 1.0 * scale;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false })
  );
  sign.position.set(x, y, z);
  const glow = new THREE.PointLight(new THREE.Color(color), 6, 9, 2.0);
  glow.position.set(x, y, z + 0.4);
  g.add(sign, glow);
  return g;
}

function makeCar(x, z, facing = 1) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8794a3, roughness: 0.35, metalness: 0.7 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0b1018, roughness: 0.15, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.8, 1.5), bodyMat);
  body.position.y = 0.65;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 1.35), glassMat);
  cabin.position.set(-0.1, 1.2, 0);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 1.3), new THREE.MeshStandardMaterial({ color: 0xff2b2b, emissive: 0xff1a1a, emissiveIntensity: 2.4 }));
  tail.position.set(-1.7, 0.65, 0);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.9 });
  [[1.1, 0.75], [1.1, -0.75], [-1.1, 0.75], [-1.1, -0.75]].forEach(([wx, wz]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 16), wheelMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w);
  });
  g.add(body, cabin, tail);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(x, 0, z);
  g.rotation.y = facing < 0 ? Math.PI : 0;
  return g;
}

function makeBarrier() {
  const g = new THREE.Group();
  const z = -1.35;
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.92 });
  for (let x = -HALF_WIDTH; x <= HALF_WIDTH; x += 2.0) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.8, 0.5), concreteMat);
    seg.position.set(x, 0.4, z);
    seg.castShadow = true; seg.receiveShadow = true;
    g.add(seg);
  }
  // metal top rail
  const railMat = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.4, metalness: 0.8 });
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, HALF_WIDTH * 2 + 1, 10), railMat);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, 1.15, z - 0.05);
  const rail2 = rail.clone(); rail2.position.y = 0.85;
  g.add(rail, rail2);
  // posts
  for (let x = -HALF_WIDTH; x <= HALF_WIDTH; x += 1.5) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 8), railMat);
    post.position.set(x, 0.9, z - 0.05);
    g.add(post);
  }
  return g;
}

function makeTrashBags(x, z) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x0d0d10, roughness: 0.5, metalness: 0.1 });
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.22 + Math.random() * 0.12, 10, 8), mat);
    b.position.set(x + (Math.random() - 0.5) * 0.8, 0.2, z + (Math.random() - 0.5) * 0.5);
    b.scale.y = 0.8;
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

export function buildCityArena(scene, renderer, opts = {}) {
  const lite = !!opts.lite;
  const group = new THREE.Group();
  group.name = 'CityArena';

  // Atmosphere
  scene.background = new THREE.Color(0x0a0d16);
  scene.fog = new THREE.FogExp2(0x0a0d16, 0.028);

  // ---- ground: reflective wet asphalt (Reflector), or plain dark plane in lite ----
  if (!lite) {
    const mirror = new Reflector(new THREE.PlaneGeometry(60, 40), {
      color: 0x0e1119,
      textureWidth: 1024,
      textureHeight: 1024,
      clipBias: 0.003,
    });
    mirror.rotation.x = -Math.PI / 2;
    mirror.position.y = 0.001;
    group.add(mirror);
  } else {
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 40),
      new THREE.MeshStandardMaterial({ color: 0x0b0e15, roughness: 0.3, metalness: 0.6 })
    );
    base.rotation.x = -Math.PI / 2;
    base.receiveShadow = true;
    group.add(base);
  }

  // dark tint + puddle normal layer over the mirror for a wet-but-grimy look
  const normalTex = puddleNormalTexture();
  const wet = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 40),
    new THREE.MeshStandardMaterial({
      color: 0x0c0f16, roughness: 0.35, metalness: 0.55,
      transparent: true, opacity: 0.72,
      normalMap: normalTex, normalScale: new THREE.Vector2(0.6, 0.6),
    })
  );
  wet.rotation.x = -Math.PI / 2;
  wet.position.y = 0.012;
  wet.receiveShadow = true;
  group.add(wet);

  // painted parking line (like the screenshot)
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(0.12, 3),
    new THREE.MeshBasicMaterial({ color: 0xf1d33a, transparent: true, opacity: 0.5 })
  );
  line.rotation.x = -Math.PI / 2;
  line.position.set(4.4, 0.02, 1.5);
  group.add(line);

  // ---- backdrop buildings ----
  const facade = buildingFacadeTexture();
  const bBack = new THREE.Group();
  const cols = [
    { x: -14, w: 8, h: 26, z: -16 },
    { x: -6, w: 6, h: 20, z: -18 },
    { x: 0, w: 5, h: 30, z: -22 },
    { x: 7, w: 7, h: 22, z: -17 },
    { x: 15, w: 9, h: 28, z: -16 },
  ];
  cols.forEach((b) => {
    const t = facade.clone(); t.needsUpdate = true;
    t.repeat.set(Math.max(1, Math.round(b.w / 2)), Math.max(1, Math.round(b.h / 4)));
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, b.h, 3),
      new THREE.MeshStandardMaterial({ color: 0x0a0c14, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.9, roughness: 1 })
    );
    mesh.position.set(b.x, b.h / 2, b.z);
    bBack.add(mesh);
  });
  group.add(bBack);

  // side alley walls to frame the fight
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: 0.9 });
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(3, 12, 20), wallMat);
  leftWall.position.set(-11, 6, -4);
  const rightWall = leftWall.clone(); rightWall.position.x = 11;
  leftWall.receiveShadow = rightWall.receiveShadow = true;
  group.add(leftWall, rightWall);

  // ---- barrier / railing behind the fight line ----
  group.add(makeBarrier());

  // ---- streetlights ----
  group.add(makeStreetlight(-5.5, -1.1));
  group.add(makeStreetlight(3.5, -1.1));

  // ---- neon signs ----
  group.add(makeNeon('CRASH OUT', '#ff2f6b', -6.2, 4.6, -6.2, 1.1));
  group.add(makeNeon('ALIENZ ONLY', '#7a4bff', 5.6, 5.4, -7.5, 0.9));
  group.add(makeNeon('PARADE', '#ff9e2f', -2.0, 6.8, -12, 0.8));
  group.add(makeNeon('OPEN', '#37e0ff', 6.8, 2.6, -3.6, 0.5));

  // ---- parked car on the right ----
  group.add(makeCar(6.2, 2.6, 1));

  // ---- trash bags near left pole ----
  group.add(makeTrashBags(-6.4, 1.1));

  scene.add(group);

  // small animated neon flicker
  const flickerLights = [];
  group.traverse((o) => { if (o.isPointLight && o.intensity < 10) flickerLights.push({ l: o, base: o.intensity, phase: Math.random() * 6.28 }); });
  let t = 0;

  return {
    group,
    bounds: { halfWidth: HALF_WIDTH },
    update(dt) {
      t += dt;
      for (const f of flickerLights) {
        f.l.intensity = f.base * (0.85 + 0.15 * Math.sin(t * 8 + f.phase) + (Math.random() < 0.01 ? -0.4 : 0));
      }
    },
    dispose() {
      scene.remove(group);
    },
  };
}

// Night lighting tuned for the neon-noir mood. Returns the light group.
export function addNightLights(scene, lite = false) {
  const g = new THREE.Group();
  g.name = 'NightLights';
  const hemi = new THREE.HemisphereLight(0x27324a, 0x05060a, 0.55);
  g.add(hemi);
  // cool blue key from camera side
  const key = new THREE.DirectionalLight(0x9fc0ff, 1.1);
  key.position.set(-6, 12, 10);
  key.castShadow = !lite;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -14; key.shadow.camera.right = 14;
  key.shadow.camera.top = 14; key.shadow.camera.bottom = -14;
  key.shadow.camera.near = 1; key.shadow.camera.far = 60;
  key.shadow.bias = -0.0004;
  g.add(key);
  // magenta rim from behind
  const rim = new THREE.DirectionalLight(0xff4fa0, 0.9);
  rim.position.set(8, 6, -10);
  g.add(rim);
  // teal fill
  const fill = new THREE.DirectionalLight(0x2fe0ff, 0.4);
  fill.position.set(10, 4, 8);
  g.add(fill);
  // soft frontal fill so the fighters read against the dark stage (toward camera)
  const front = new THREE.DirectionalLight(0xfff3e0, 0.7);
  front.position.set(0, 4, 12);
  g.add(front);
  // warm spotlight pool on the fight zone
  const spot = new THREE.SpotLight(0xffe6c0, 30, 22, Math.PI / 5, 0.5, 1.4);
  spot.position.set(0, 10, 4);
  spot.target.position.set(0, 1, 0);
  g.add(spot, spot.target);
  scene.add(g);
  return g;
}
