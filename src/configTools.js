const ARENA_KEYS = ['arenaScale', 'arenaX', 'arenaY', 'arenaZ', 'arenaRotX', 'arenaRotY', 'arenaRotZ'];
const STORAGE_KEY = 'tekkenStyleArenaTransformConfig';

function readNumber(id, fallback = 0) {
  const el = document.getElementById(id);
  if (!el) return fallback;
  const v = Number.parseFloat(el.value);
  return Number.isFinite(v) ? v : fallback;
}

function setNumber(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = String(value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export function getArenaConfig() {
  return {
    arenaFile: 'public/assets/arena/arena.glb',
    transform: {
      scale: readNumber('arenaScale', 1),
      position: {
        x: readNumber('arenaX', 0),
        y: readNumber('arenaY', 0),
        z: readNumber('arenaZ', 0)
      },
      rotationDegrees: {
        x: readNumber('arenaRotX', 0),
        y: readNumber('arenaRotY', 0),
        z: readNumber('arenaRotZ', 0)
      }
    }
  };
}

export function applyArenaConfig(config) {
  const t = config?.transform || config;
  if (!t) return;
  setNumber('arenaScale', t.scale ?? 1);
  setNumber('arenaX', t.position?.x ?? t.x ?? 0);
  setNumber('arenaY', t.position?.y ?? t.y ?? 0);
  setNumber('arenaZ', t.position?.z ?? t.z ?? 0);
  setNumber('arenaRotX', t.rotationDegrees?.x ?? t.rx ?? 0);
  setNumber('arenaRotY', t.rotationDegrees?.y ?? t.ry ?? 0);
  setNumber('arenaRotZ', t.rotationDegrees?.z ?? t.rz ?? 0);
}

function showConfig(config) {
  const out = document.getElementById('arenaConfigOutput');
  if (out) out.value = JSON.stringify(config, null, 2);
}

export function setupArenaConfigTools() {
  const exportBtn = document.getElementById('exportArenaConfig');
  const copyBtn = document.getElementById('copyArenaConfig');
  const saveBtn = document.getElementById('saveArenaConfig');
  const loadBtn = document.getElementById('loadArenaConfig');
  const applyBtn = document.getElementById('applyArenaConfig');
  const out = document.getElementById('arenaConfigOutput');

  exportBtn?.addEventListener('click', () => showConfig(getArenaConfig()));

  copyBtn?.addEventListener('click', async () => {
    const config = getArenaConfig();
    showConfig(config);
    await navigator.clipboard?.writeText(JSON.stringify(config, null, 2));
  });

  saveBtn?.addEventListener('click', () => {
    const config = getArenaConfig();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    showConfig(config);
  });

  loadBtn?.addEventListener('click', () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const config = JSON.parse(raw);
    applyArenaConfig(config);
    showConfig(config);
  });

  applyBtn?.addEventListener('click', () => {
    if (!out?.value) return;
    const config = JSON.parse(out.value);
    applyArenaConfig(config);
    showConfig(config);
  });

  ARENA_KEYS.forEach((id) => {
    document.getElementById(id)?.addEventListener('input', () => showConfig(getArenaConfig()));
  });
}
