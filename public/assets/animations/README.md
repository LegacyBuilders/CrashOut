# Shared animations

Optional folder for shared animation FBX files.

The current code loads animations from each character folder:

```text
public/assets/characters/player1/*.fbx
public/assets/characters/player2/*.fbx
```

If you want shared animations instead, change `animationBaseUrl` in `src/game.js` to `/assets/animations`.
