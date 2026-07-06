// Block pinch-zoom and double-tap-zoom on mobile. iOS Safari ignores the
// viewport's user-scalable=no, so the gestures have to be cancelled in JS.
// (CSS `touch-action: manipulation` handles double-tap on modern browsers;
// the touchend timer is a fallback for older iOS.)
export function blockZoom() {
  const stop = (e) => e.preventDefault();

  // iOS pinch gestures.
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('gesturechange', stop, { passive: false });
  document.addEventListener('gestureend', stop, { passive: false });

  // Two-finger pinch on touchmove (belt-and-suspenders for browsers without
  // gesture events). Single-finger moves (joystick, scrolling menus) pass through.
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  // Double-tap-to-zoom: swallow the second tap of a quick pair.
  let lastEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastEnd <= 300) e.preventDefault();
    lastEnd = now;
  }, { passive: false });

  document.addEventListener('dblclick', stop, { passive: false });
}
