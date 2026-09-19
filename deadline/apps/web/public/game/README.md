# Game assets

The vertical slice runs entirely on procedural geometry and synthesised audio,
so these folders are intentionally empty. They exist as the drop-in points for
real content:

- `models/` — glTF/GLB meshes. Load them in `src/game/scene.ts` (buildings,
  props) and `src/game/entities.ts` (characters), replacing the box and capsule
  primitives.
- `textures/` — materials for the same.
- `audio/` — real sound effects. `src/game/audio.ts` currently synthesises every
  cue with the Web Audio API; swap its `play()` implementation for a buffer
  loader keyed by the same `SoundEvent` names.
- `icons/` — item icons, keyed by `ItemDefinition.icon`.

No third-party copyrighted assets are bundled with this repository.
