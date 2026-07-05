# CRASH OUT — by Alienz Only

A 3D Tekken/Mortal-Kombat–style browser fighting game.
**Reeves Junya** (music artist) throws down against **Moloch** (the goat-headed
businessman) on a neon night city block, with the *Crash Out* track looping under
synthesized fight SFX.

Built on Three.js + Vite. Play **vs the CPU**, **local 2-player**, or **invite a friend online**.

---

## Run it

```bash
npm install
npm run dev
```

Open the URL Vite prints (default http://localhost:5173/). Pick a mode from the title screen.

> The character models are meshopt-compressed to ~12 MB each (originals kept as
> `*_orig.glb`), so they load quickly.

## Controls

| Action | Player 1 (Junya) | Player 2 / Moloch (local) |
|--------|------------------|---------------------------|
| Move   | ◀ / ▶            | J / L            |
| Jump   | ▲                | I                |
| Block  | ▼ (crouch-block) | K                |
| Punch  | A or W           | U                |
| Kick   | S or E           | O                |
| Heavy / **Special** | D   | P                |

- Junya's **heavy** is a left hook; **kick** is a spinning kick. Moloch's **heavy is his
  spell** — it launches the opponent into the air and drops them for big damage.
- **`** (backquote/tilde) — open the **Animation Lab + Tuning panel** (see below).
- **🔊 / ☰** (top-right) — mute audio / back to menu.
- FPS is shown bottom-right. Add **`?hq`** to the URL for the reflective wet floor
  (heavier), or **`?lite`** to strip reflections/shadows on weak GPUs.

## Modes

- **Fight the CPU** — Junya vs Moloch AI (Easy / Normal / Hard).
- **Local 2-Player** — two people, one keyboard (P2 plays Moloch, spell on heavy).
- **Invite a Friend (Online)** — click it to open a room; share the **code** or the
  **link**. Your friend pastes the code into *Join* (or opens the link, which pre-fills it).
  You host and play Junya; they play Moloch. Uses WebRTC via the free PeerJS broker —
  no server to run. This is casual P2P sync (smoothed, host-authoritative), not
  rollback netcode, so expect some latency on poor connections. For a friend on another
  network you must deploy the site (below) so the link is reachable.

Matches are best-of-3 rounds (first to 2). Music starts on your first click (browser
autoplay rules); SFX are synthesized live over the track.

---

## Tuning panel

Press **`** and use the cyan **TUNING** panel (bottom-right) to live-adjust values that
depend on the exact models: **facing angle**, **defeat ground height** (so bodies rest on
the floor), **jump height**, **gravity**, and **master animation speed**. Changes save to
your browser; click **Print tuning to console** and paste the JSON into `DEFAULT_TUNING`
in `src/characterConfig.js` to lock them in for everyone.

## Animation Lab (identify / fix moves)

Both characters are Tripo exports whose embedded animation clips have generic names
(`NlaTrack.001`, …), so each game action is mapped to a **clip index** in
`src/characterConfig.js`. Those indices are best-guesses. To correct them:

1. Press **`** to open the Lab.
2. Choose **Junya** or **Goat**, use **◀ / ▶** (or arrow keys) to cycle clips —
   each plays live on that fighter so you can see what it is.
3. When a clip matches an action, click **set N** next to that action
   (idle, punch, kick, …). It rebinds live and saves to your browser (localStorage).
4. Click **Print map to console** and paste the JSON into `JUNYA_CLIPS` / `GOAT_CLIPS`
   in `src/characterConfig.js` to make it permanent for everyone.

Because both models share the same skeleton, a good clip from one character can be
reused on the other if a move is missing.

---

## Deploy (so friends can join online)

It's a static site — build and host the `dist/` folder anywhere:

```bash
npm run build         # outputs dist/
npm run preview       # test the production build locally
```

- **Netlify / Vercel / Cloudflare Pages / GitHub Pages**: drop in `dist/` (or point the
  host at this repo with build command `npm run build`, publish dir `dist`).
- No backend needed — online play uses the public PeerJS broker.

### Models are already optimized
Both GLBs were compressed with `gltf-transform` (meshopt geometry + 1024 webp textures),
~76 MB → ~12 MB each, and `assetLoader.js` wires the `MeshoptDecoder` to read them.
Uncompressed originals are kept as `public/assets/characters/*_orig.glb`. To re-compress
after replacing a model:

```bash
npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt --texture-compress webp --texture-size 1024 --simplify false
```

---

## Project layout

| File | Purpose |
|------|---------|
| `src/game.js` | Scene, camera, modes, rounds, HUD, loop, netcode glue |
| `src/fighter.js` | Fighter state machine, GLB clip loading, combat, net (de)serialize |
| `src/characterConfig.js` | Character defs + action→clip-index maps |
| `src/arena.js` | Procedural neon city stage + night lighting |
| `src/audio.js` | Looping music + synthesized fight SFX |
| `src/net.js` | PeerJS host/guest + RemoteInput |
| `src/aiInput.js` | CPU opponent |
| `src/animLab.js` | In-browser clip identifier/remapper |
| `src/vfx.js` | Hit sparks / dust / speed lines |
| `src/assetLoader.js`, `src/input.js`, `src/animationMap.js` | Loading, input, frame data |

Add `?lite` to the URL for a lighter renderer (no reflections/shadows) on weak GPUs.
