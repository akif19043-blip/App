#!/usr/bin/env python3
"""
build_all.py -- generate every game asset with Blender.

    python3 blender/build_all.py                 # export all .glb + manifest
    python3 blender/build_all.py --preview       # ...and render preview sheets
    python3 blender/build_all.py --only car_super --preview

Each asset is built in a freshly emptied scene so nothing leaks between them,
exported to game/assets/models/, and measured. The measurements (bounding box,
triangle count) plus the road's lane geometry are written to manifest.json,
which the game loads at runtime -- so collision sizes and lane positions come
from the actual meshes instead of being duplicated by hand in the JS.
"""

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy                                                   # noqa: E402
from mathutils import Vector                                 # noqa: E402

from lib import city, kit, palette, props, render, road, vehicles  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_DIR = os.path.join(ROOT, 'game', 'assets', 'models')
PREVIEW_DIR = os.path.join(ROOT, 'docs', 'previews')

# name -> (module, kind); kind drives how the game uses the model.
ASSETS = (
    [(n, vehicles, 'player') for n in ('car_sport', 'car_muscle', 'car_super')]
    + [(n, vehicles, 'traffic') for n in ('traffic_sedan', 'traffic_hatch',
                                          'traffic_suv', 'traffic_truck',
                                          'traffic_bus')]
    + [(n, road, 'road') for n in ('road', 'guardrail', 'barrier', 'ground')]
    + [(n, props, 'prop') for n in ('palm', 'cactus', 'rock', 'mesa',
                                    'lamp', 'billboard', 'cone')]
    + [(n, props, 'pickup') for n in ('coin', 'nitro')]
    + [(n, city, 'city') for n in ('city_ground', 'desert_floor',
                                   'city_wall')]
    + [(n, city, 'block') for n in ('block_downtown', 'block_lowrise',
                                    'block_park', 'block_industrial',
                                    'block_parking')]
    + [(n, city, 'pickup') for n in ('beacon', 'traffic_light',
                                     'pedestrian')]
)


def measure(objs):
    """World-space bounding box of a built asset, in metres."""
    kit.sync()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in objs:
        if obj.type != 'MESH':
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            lo = Vector(min(lo[i], world[i]) for i in range(3))
            hi = Vector(max(hi[i], world[i]) for i in range(3))
    size = hi - lo
    center = (lo + hi) / 2.0
    return {
        'size': [round(v, 3) for v in size],
        'center': [round(v, 3) for v in center],
        'min': [round(v, 3) for v in lo],
        'max': [round(v, 3) for v in hi],
    }


def build_one(name, module, kind, want_preview):
    kit.reset()
    P = palette.build()
    module.build(name, P)

    objs = [o for o in bpy.data.objects if o.type == 'MESH']
    entry = {'file': '%s.glb' % name, 'kind': kind, 'tris': kit.tri_count(objs)}
    entry.update(measure(objs))

    path = os.path.join(MODEL_DIR, '%s.glb' % name)
    kit.export(path)
    entry['bytes'] = os.path.getsize(path)

    if want_preview:
        focus, radius = render.frame(objs)
        render.setup(ground=None if kind in ('road',) else '#b9975b')
        render.shot(os.path.join(PREVIEW_DIR, '%s.png' % name),
                    focus=focus, radius=radius, elevation=24, azimuth=42)
    return entry


def contact_sheet(names):
    """One image showing every rendered preview, for a quick eyeball pass."""
    from lib import montage
    paths = [os.path.join(PREVIEW_DIR, '%s.png' % n) for n in names]
    return montage.contact_sheet(
        paths, os.path.join(PREVIEW_DIR, 'contact_sheet.png'), columns=5)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', nargs='*', help='build just these assets')
    parser.add_argument('--preview', action='store_true',
                        help='also render preview PNGs into docs/previews')
    args = parser.parse_args()

    os.makedirs(MODEL_DIR, exist_ok=True)
    os.makedirs(PREVIEW_DIR, exist_ok=True)

    wanted = ASSETS if not args.only else [
        a for a in ASSETS if a[0] in args.only]
    if not wanted:
        parser.error('no assets matched --only %s' % args.only)

    started = time.time()
    manifest = {
        'generator': 'Blender %s' % bpy.app.version_string,
        'road': {
            'tileLength': road.TILE_LEN,
            'lanes': road.LANES,
            'laneWidth': road.LANE_W,
            'roadWidth': road.ROAD_W,
            'edgeX': road.EDGE_X,
            'shoulderWidth': road.SHOULDER_W,
            'laneCenters': [round(v, 3) for v in road.lane_centers()],
            'guardrailTile': road.GUARDRAIL_TILE,
        },
        'city': city.manifest(),
        'models': {},
    }

    for name, module, kind in wanted:
        entry = build_one(name, module, kind, args.preview)
        manifest['models'][name] = entry
        print('  %-16s %6d tris  %7.1f KB  %s'
              % (name, entry['tris'], entry['bytes'] / 1024.0,
                 'x'.join('%.1f' % v for v in entry['size'])))

    if args.preview:
        print('contact sheet: %s' % contact_sheet([n for n, _, _ in wanted]))

    if not args.only:
        with open(os.path.join(MODEL_DIR, 'manifest.json'), 'w') as fh:
            json.dump(manifest, fh, indent=2)
        print('manifest.json written')

    total = sum(m['tris'] for m in manifest['models'].values())
    print('%d assets, %d triangles total, %.1fs'
          % (len(manifest['models']), total, time.time() - started))


if __name__ == '__main__':
    main()
