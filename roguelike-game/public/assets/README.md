# Sprite overrides

Drop PNG files here to replace the procedural art. Nothing needs to be registered:
`npm run dev` and `npm run build` scan this folder, and the dev server reloads the
page when a file is added, changed or removed. Any sprite you don't provide falls back
to the built-in procedural drawing.

| File | Replaces | Default orientation |
|---|---|---|
| `sprites/player/player.png` | Player ship | `face`: rotates to the direction of travel |
| `sprites/enemies/swarmer.png` | Swarmer | `flip`: mirrored when moving left |
| `sprites/enemies/grunt.png` | Drone | `flip` |
| `sprites/enemies/tank.png` | Bulwark (tank) | `flip` |
| `sprites/enemies/spitter.png` | Spitter | `flip` |
| `sprites/enemies/elite.png` | Elite | `flip` |
| `sprites/enemies/boss.png` | Bosses and the Overmind | `flip` |
| `sprites/weapons/wand.png` | Magic Wand bolt | `face` |
| `sprites/weapons/dagger.png` | Ricochet Dagger | `spin` |
| `sprites/weapons/orb.png` | Spinning Orb | `spin` |
| `sprites/weapons/enemy-bullet.png` | Spitter and boss bullets | `none` |
| `sprites/effects/explosion.png` | Death burst of tanks, elites and bosses (played once) | `none` |
| `sprites/effects/gem.png` | XP gem, scaled up for bigger gems | `none` |

Art should face **right**. If yours faces a different way, set `angle` in the sidecar
JSON (for example, Kenney's space ships point up, so use `-90`).

## Spritesheets

A horizontal strip of square frames, such as a 128×32 image, is detected automatically
as 4 frames. For any other layout, add a sidecar JSON with the same file name, for
example `sprites/enemies/swarmer.json`:

```json
{
  "frameWidth": 32,
  "frameHeight": 32,
  "frames": 6,
  "fps": 10,
  "scale": 1.2,
  "rotation": "flip",
  "angle": 0,
  "pixelated": true
}
```

Every field is optional:

- `frameWidth`, `frameHeight`, `frames`: the frame grid. Frames are read left to right, then top to bottom.
- `fps`: animation speed. Defaults to 10.
- `scale`: size multiplier. By default a sprite is fitted to its hitbox (enemies about 1.35× the hitbox diameter).
- `rotation`: one of `face`, `flip`, `spin` or `none`.
- `angle`: the direction the artwork faces, in degrees (0 = right, -90 = up).
- `pixelated`: nearest-neighbour scaling for crisp pixel art. It is on by default when frames are 64 px or smaller.

Hit flashes (a white silhouette) are generated automatically.

## Where to get art

CC0 packs that fit well:

- **Kenney.nl**: *Space Shooter Redux*, *Top-down Shooter*, *Pixel Shmup*.
- **itch.io**: search for "top down monster sprites CC0".
