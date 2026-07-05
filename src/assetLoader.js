import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export class AssetLoader {
  constructor(loadingManager = new THREE.LoadingManager()) {
    this.fbx = new FBXLoader(loadingManager);
    this.gltf = new GLTFLoader(loadingManager);
    // Our character GLBs are meshopt-compressed (EXT_meshopt_compression) — needed to decode them.
    this.gltf.setMeshoptDecoder(MeshoptDecoder);
    this.cache = new Map();
  }

  cloneObject(source) {
    const clone = SkeletonUtils.clone(source);
    clone.animations = source.animations || [];
    return clone;
  }

  async loadFBX(url) {
    if (this.cache.has(url)) return this.cloneObject(this.cache.get(url));
    const object = await this.fbx.loadAsync(url);
    this.cache.set(url, object);
    return this.cloneObject(object);
  }

  async loadGLTF(url) {
    if (this.cache.has(url)) return this.cloneObject(this.cache.get(url));
    const gltf = await this.gltf.loadAsync(url);
    const object = gltf.scene;
    object.animations = gltf.animations || [];
    this.cache.set(url, object);
    return this.cloneObject(object);
  }

  async loadObject(url, format = null) {
    const lower = String(url).toLowerCase();
    const fmt = format ? String(format).toLowerCase() : null;
    if (fmt === 'glb' || fmt === 'gltf' || lower.endsWith('.glb') || lower.endsWith('.gltf')) return this.loadGLTF(url);
    if (fmt === 'fbx' || lower.endsWith('.fbx')) return this.loadFBX(url);
    // Blob URLs do not preserve filenames. Uploaded arenas are GLB, so default blob loading to GLTFLoader.
    if (lower.startsWith('blob:')) return this.loadGLTF(url);
    return this.loadFBX(url);
  }

  async loadAnimationClip(url, clipName) {
    const object = await this.loadObject(url, 'fbx');
    const rawClip = object.animations?.[0];
    if (!rawClip) throw new Error(`No animation clip found in ${url}`);
    const clip = sanitizeClipForFighter(rawClip, clipName);
    clip.name = clipName;
    return clip;
  }

  // Load a character GLB and return both the (cloned, skin-preserving) scene
  // and the full array of embedded animation clips.
  async loadCharacterWithClips(url) {
    const object = await this.loadGLTF(url); // cloned via SkeletonUtils, keeps .animations
    const clips = (object.animations || []).map((c) => c.clone());
    return { object, clips };
  }

  // Load only the animation clips from a GLB (no scene clone). Used for the extra
  // Tripo-rigged animation GLBs (walk, rap idle) whose tracks bind by bone name.
  async loadClips(url) {
    const gltf = await this.gltf.loadAsync(url);
    return (gltf.animations || []).map((c) => c.clone());
  }
}

function isLocomotionClip(name = '') { return /walk|run|step|move|forward|back/i.test(name); }

export function sanitizeClipForFighter(clip, semanticName = '') {
  if (!isLocomotionClip(semanticName) && !isLocomotionClip(clip.name)) return clip.clone();
  const rootLike = /(^|[.:/])(root|armature|scene)$/i;
  const hipsLike = /hips|pelvis/i;
  const cleanedTracks = clip.tracks.map((track) => {
    if (!track.name.endsWith('.position')) return track.clone();
    if (hipsLike.test(track.name)) return track.clone();
    if (!rootLike.test(track.name) && track.name !== '.position') return track.clone();
    const cloned = track.clone();
    const v = cloned.values;
    const x0 = v[0];
    const z0 = v[2];
    for (let i = 0; i < v.length; i += 3) {
      v[i + 0] = x0;
      v[i + 2] = z0;
    }
    return cloned;
  });
  const out = new THREE.AnimationClip(`${clip.name || semanticName}_inPlace`, clip.duration, cleanedTracks);
  out.optimize();
  return out;
}

export function makeFallbackFighter(color = 0x3388ff) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.05, 8, 16), new THREE.MeshStandardMaterial({ color, roughness: 0.55 }));
  body.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffd0aa, roughness: 0.65 }));
  head.position.y = 1.85;
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), gloveMat);
  const rHand = lHand.clone();
  lHand.position.set(-0.42, 1.25, 0.02);
  rHand.position.set(0.42, 1.25, 0.02);
  group.add(body, head, lHand, rHand);
  return group;
}

export function normalizeObject(object, targetHeight = 2.0) {
  object.traverse((child) => {
    if (child.isMesh || child.isSkinnedMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => { m.side = THREE.FrontSide; });
      }
    }
  });
  object.updateMatrixWorld(true);
  // Prefer measuring by the SKELETON bone span: for skinned characters the visible
  // height is bone-driven, and some rigs (Blender re-rigs) author the mesh geometry
  // at a different scale than the skeleton — measuring the geometry bbox then scales
  // them wrong (half-size). Bone span keeps every character the same on-screen size.
  const boneY = boneYExtent(object);
  if (boneY) {
    // The Tripo skeleton spans ~0.82 of the full character height (hair/feet extend
    // past the head/foot bones), so target that fraction to keep sizing consistent.
    if (boneY.span > 0.001) object.scale.multiplyScalar((targetHeight * 0.82) / boneY.span);
    object.updateMatrixWorld(true);
    const g = boneYExtent(object);
    if (g) object.position.y -= g.min; // ground the lowest bone to y=0
  } else {
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (size.y > 0.001) object.scale.multiplyScalar(targetHeight / size.y);
    object.updateMatrixWorld(true);
    const fixedBox = new THREE.Box3().setFromObject(object);
    object.position.y -= fixedBox.min.y;
  }
  return object;
}

// World-space min/max Y of all bones in an object (null if it has no bones).
function boneYExtent(object) {
  let min = Infinity, max = -Infinity, found = false;
  object.traverse((o) => {
    if (o.isBone) { found = true; const y = o.matrixWorld.elements[13]; if (y < min) min = y; if (y > max) max = y; }
  });
  return found ? { min, max, span: max - min } : null;
}

export const normalizeFbxObject = normalizeObject;
