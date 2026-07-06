// PWA: service-worker registration + an OS-aware "Install App" button.
// Android/desktop Chromium fire `beforeinstallprompt` (1-tap install); iOS Safari
// can't, so we show Add-to-Home-Screen instructions. Hidden once installed.

let deferredPrompt = null;
let wantInstall = false; // user tapped before the browser's prompt was ready

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  window.navigator.standalone === true;

const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;
const isTouch = () => window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
}

// Fetch an asset and return its base64 (no data: prefix) — used to embed the
// home-screen icon inside the iOS Web Clip profile.
async function assetToBase64(url) {
  const res = await fetch(url);
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

// Build an Apple configuration profile (.mobileconfig) carrying a managed Web Clip.
// Installing it drops a fullscreen home-screen icon pointing at this site — the
// closest thing iOS allows to "the app packaging itself." Not silent: the user
// still installs it from Settings and enters their passcode.
function buildWebClipProfile(iconB64) {
  const url = location.origin + '/';
  const u1 = crypto.randomUUID(), u2 = crypto.randomUUID();
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>FullScreen</key><true/>
      <key>IgnoreManifestScope</key><true/>
      <key>Icon</key><data>${iconB64}</data>
      <key>IsRemovable</key><true/>
      <key>Label</key><string>CRASH OUT</string>
      <key>PayloadIdentifier</key><string>only.alienz.crashout.webclip</string>
      <key>PayloadType</key><string>com.apple.webClip.managed</string>
      <key>PayloadUUID</key><string>${u1}</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>Precomposed</key><true/>
      <key>URL</key><string>${url}</string>
    </dict>
  </array>
  <key>PayloadDisplayName</key><string>CRASH OUT — home screen icon</string>
  <key>PayloadIdentifier</key><string>only.alienz.crashout</string>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadUUID</key><string>${u2}</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict>
</plist>`;
}

async function downloadWebClipProfile(btn) {
  const label = btn?.textContent;
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Preparing…'; }
    const iconB64 = await assetToBase64('/assets/icons/apple-touch-icon.png');
    const xml = buildWebClipProfile(iconB64);
    const blob = new Blob([xml], { type: 'application/x-apple-aspen-config' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href; a.download = 'CrashOut.mobileconfig';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 4000);
  } catch (_) {
    // Fall back silently — the manual Add-to-Home-Screen steps are shown right below.
  } finally {
    if (btn) { btn.disabled = false; if (label) btn.textContent = label; }
  }
}

export function initPWA() {
  // Both the menu button and the one on the rotate-device screen.
  const btns = Array.from(document.querySelectorAll('.installBtn'));
  const overlay = document.getElementById('iosInstall');
  const close = document.getElementById('iosClose');
  if (close && overlay) close.onclick = () => overlay.classList.remove('show');
  const profileBtn = document.getElementById('iosProfileBtn');
  if (profileBtn) profileBtn.onclick = () => downloadWebClipProfile(profileBtn);
  if (!btns.length) return;

  const showBtns = (on) => btns.forEach((b) => { b.style.display = on ? 'block' : 'none'; });
  const setBusy = (on) => btns.forEach((b) => { b.disabled = on; });
  const iosHint = () => overlay && overlay.classList.add('show');

  if (isStandalone()) { showBtns(false); return; } // already installed

  const promptInstall = async () => {
    if (!deferredPrompt) return false;
    setBusy(true);
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch (_) {}
    deferredPrompt = null; wantInstall = false; setBusy(false);
    return true;
  };

  // Wire clicks up front so the CTA works the instant it's visible.
  btns.forEach((b) => { b.onclick = async () => {
    if (await promptInstall()) return;   // Android / desktop Chromium: native install
    if (isIOS()) { iosHint(); return; }  // iOS Safari: Add-to-Home-Screen steps
    wantInstall = true;                  // Android before the prompt arrived — fire it as soon as it does
  }; });

  // Show the download option right away on mobile (e.g. the portrait rotate
  // screen) instead of waiting for `beforeinstallprompt`, which Chrome can
  // delay behind engagement heuristics.
  if (isTouch()) showBtns(true);

  // Android / desktop Chromium: capture (and, if already tapped, fire) the prompt.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showBtns(true);
    if (wantInstall) promptInstall();
  });
  window.addEventListener('appinstalled', () => showBtns(false));
}
