import './style.css';
import { FightingGame } from './game.js';

const game = new FightingGame(document.body);
window.__game = game; // handy for debugging / Animation Lab
game.init().catch((err) => {
  console.error(err);
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:20px;top:20px;right:20px;padding:16px;background:#300;color:#fff;z-index:99999;white-space:pre-wrap;font:13px monospace';
  box.textContent = `Game failed to start:\n${err.stack || err.message || err}`;
  document.body.appendChild(box);
});
