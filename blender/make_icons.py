#!/usr/bin/env python3
"""
make_icons.py -- render the app icons from the same models the game uses.

    python3 blender/make_icons.py

Writes game/assets/icon-192.png and icon-512.png (PWA / home-screen icons).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy                                              # noqa: E402

from lib import kit, palette, render, vehicles          # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'game', 'assets')

SIZES = (192, 512)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        kit.reset()
        P = palette.build()
        vehicles.build('car_super', P)
        # Repaint the hero car in the UI's accent orange.
        paint = bpy.data.materials.get('CarPaint')
        if paint is not None:
            for node in paint.node_tree.nodes:
                if node.type == 'BSDF_PRINCIPLED':
                    node.inputs['Base Color'].default_value = (
                        *kit.hex_color('#ff8a3d'), 1.0)

        render.setup(samples=64, resolution=(size, size),
                     background='#1d2b52', ground='#2b1f35', sun_energy=4.0)
        render.shot(os.path.join(OUT_DIR, 'icon-%d.png' % size),
                    focus=(0, 0, 0.55), radius=5.5, elevation=21,
                    azimuth=36, lens=58)
        print('icon-%d.png' % size)


if __name__ == '__main__':
    main()
