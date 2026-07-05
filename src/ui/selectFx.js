// Motion (motion.dev) helpers for the character/arena select screens.
// Vanilla DOM animations — the same team's non-React library.
import { animate, stagger, hover, press } from 'motion';

const SPRING = { type: 'spring', stiffness: 320, damping: 24 };

// Fade + spring the overlay (and its inner panel) into view.
export function enterOverlay(el) {
  if (!el) return;
  animate(el, { opacity: [0, 1] }, { duration: 0.22, ease: 'easeOut' });
  const inner = el.querySelector('.selInner');
  if (inner) animate(inner, { opacity: [0, 1], y: [26, 0], scale: [0.97, 1] }, SPRING);
}

// Fade the overlay out, resolve when done (for screen transitions).
export function exitOverlay(el) {
  if (!el) return Promise.resolve();
  return animate(el, { opacity: [1, 0] }, { duration: 0.14, ease: 'easeIn' }).finished;
}

// Staggered entrance for a set of cards.
export function staggerIn(cards) {
  const list = Array.from(cards || []);
  if (!list.length) return;
  animate(list, { opacity: [0, 1], scale: [0.82, 1], y: [16, 0] },
    { delay: stagger(0.04), type: 'spring', stiffness: 360, damping: 22 });
}

// Hover/press spring on a card (skips locked cards).
export function attachHover(card) {
  if (!card || card.classList.contains('locked')) return;
  hover(card, (el) => {
    animate(el, { scale: 1.07 }, { type: 'spring', stiffness: 420, damping: 18 });
    return () => animate(el, { scale: 1 }, { type: 'spring', stiffness: 420, damping: 24 });
  });
  press(card, (el) => {
    animate(el, { scale: 0.95 }, { duration: 0.08 });
    return () => animate(el, { scale: 1 }, { type: 'spring', stiffness: 520, damping: 16 });
  });
}

// Pop a card when it's selected.
export function selectPop(card) {
  if (!card) return;
  animate(card, { scale: [1, 1.16, 1] }, { duration: 0.34, ease: [0.34, 1.56, 0.64, 1] });
}

// Animate a VS portrait frame swapping to a new fighter.
export function popPortrait(frame) {
  if (!frame) return;
  animate(frame, { opacity: [0.25, 1], scale: [0.82, 1], rotate: [-3, 0] },
    { type: 'spring', stiffness: 300, damping: 18 });
}
