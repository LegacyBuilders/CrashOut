// PWA: service-worker registration + an OS-aware "Install App" button.
// Android/desktop Chromium fire `beforeinstallprompt` (1-tap install); iOS Safari
// can't, so we show Add-to-Home-Screen instructions. Hidden once installed.

let deferredPrompt = null;

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
  const btn = document.getElementById('installBtn');
  const overlay = document.getElementById('iosInstall');
  const close = document.getElementById('iosClose');
  if (close && overlay) close.onclick = () => overlay.classList.remove('show');
  if (!btn) return;

  if (isStandalone()) { btn.style.display = 'none'; return; } // already installed

  // Android / desktop Chromium: capture the install prompt.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.style.display = 'block';
    btn.onclick = async () => {
      if (!deferredPrompt) return;
      btn.disabled = true;
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (_) {}
      deferredPrompt = null; btn.disabled = false;
    };
  });
  window.addEventListener('appinstalled', () => { btn.style.display = 'none'; });

  // iOS Safari: no install event — show button + instructions.
  if (isIOS() && isTouch()) {
    btn.style.display = 'block';
    btn.onclick = () => overlay && overlay.classList.add('show');
  }
}
