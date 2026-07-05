# Asset Setup

This starter is a browser JavaScript / Three.js 3D fighting game.

## Arena

The arena can be GLB, GLTF, or FBX.

Put one arena file here:

```text
public/assets/arena/arena.glb
```

or:

```text
public/assets/arena/arena.gltf
public/assets/arena/arena.fbx
```

Recommended: use `arena.glb` if possible. The game tries loading in this order:

1. `arena.glb`
2. `arena.gltf`
3. `arena.fbx`

## Character folders

Put Player 1 files here:

```text
public/assets/characters/player1/
```

Put Player 2 files here:

```text
public/assets/characters/player2/
```

Each folder should contain your current filenames exactly:

```text
Block.fbx
character.fbx
Cross Punch mirror.fbx
Cross Punch.fbx
Dying.fbx
Flying Kick.fbx
Head Hit.fbx
Hit To Body.fbx
Idle.fbx
Jump Attack.fbx
Jumping.fbx
Medium Step Forward.fbx
Receive Punch To The Face.fbx
Step Backward.fbx
```

Capitalization matters on many systems. `Idle.fbx` is not the same as `idle.fbx`.

## Animation mapping

The current `src/animationMap.js` maps your files like this:

```text
Idle.fbx                         -> idle
Medium Step Forward.fbx          -> walk forward
Step Backward.fbx                -> walk backward
Jumping.fbx                      -> jump
Block.fbx                        -> block / crouch
Cross Punch.fbx                  -> punch option 1
Cross Punch mirror.fbx           -> punch option 2
Flying Kick.fbx                  -> kick
Jump Attack.fbx                  -> heavy
Head Hit.fbx                     -> hit reaction option 1
Hit To Body.fbx                  -> hit reaction option 2
Receive Punch To The Face.fbx    -> hit reaction option 3
Dying.fbx                        -> KO
```

Punch and hit reactions are randomly selected.

## Important FBX rules

1. `character.fbx` should contain skinned mesh + skeleton in T-pose.
2. Every animation FBX must use the same skeleton hierarchy/bone names as that player’s `character.fbx`.
3. Export animation FBXs with one take/clip each.
4. If animations still do not play, open browser console and look for `Missing/bad animation` or `Idle animation not loaded`.

## Controls

- P1: `A/D` move, `W` jump, `S` crouch/block, `J` punch, `K` kick, `L` heavy.
- P2: arrow keys move/jump/crouch, numpad `1/2/3` attacks.

## Camera

Camera is fixed by default now. If you want camera-follow back, set this in `src/game.js`:

```js
this.fixedCamera = false;
```
