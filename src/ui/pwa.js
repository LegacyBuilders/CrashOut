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

export function initPWA() {
  // Both the menu button and the one on the rotate-device screen.
  const btns = Array.from(document.querySelectorAll('.installBtn'));
  const overlay = document.getElementById('iosInstall');
  const close = document.getElementById('iosClose');
  if (close && overlay) close.onclick = () => overlay.classList.remove('show');
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
