#!/usr/bin/env python3
"""
android_assets.py -- fill the Android project's icon and splash resources.

    python3 tools/android_assets.py

Reads the renders in store/ and writes every density Android asks for. Uses
Blender's image API for the resampling, since it is already a dependency and
nothing else here is an imaging library.
"""

import math
import os
import sys

import bpy
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORE = os.path.join(ROOT, 'store')
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')

BRAND_NIGHT = '#1D2B52'

# Legacy square launcher icon, per density.
LAUNCHER = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
# Adaptive icon layers are 108dp; only the middle 72dp is guaranteed visible.
ADAPTIVE = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324,
            'xxxhdpi': 432}


def load(path):
    """PNG -> HxWx4 float array, top row first."""
    image = bpy.data.images.load(path)
    width, height = image.size
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)
    bpy.data.images.remove(image)
    return pixels[::-1]


def save(pixels, path):
    height, width = pixels.shape[:2]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    image = bpy.data.images.new('out', width, height, alpha=True)
    image.pixels = pixels[::-1].ravel().tolist()
    image.filepath_raw = path
    image.file_format = 'PNG'
    settings = bpy.context.scene.render.image_settings
    settings.file_format = 'PNG'
    settings.color_mode = 'RGBA'
    settings.compression = 100
    image.save()
    bpy.data.images.remove(image)


def resize(pixels, size):
    """Box-filter down to `size` square; these only ever shrink."""
    height, width = pixels.shape[:2]
    ys = np.linspace(0, height, size + 1).astype(int)
    xs = np.linspace(0, width, size + 1).astype(int)
    out = np.zeros((size, size, 4), dtype=np.float32)
    for y in range(size):
        for x in range(size):
            block = pixels[ys[y]:ys[y + 1], xs[x]:xs[x + 1]]
            out[y, x] = block.reshape(-1, 4).mean(axis=0)
    return out


def circular(pixels):
    """Mask to a circle, for the legacy round launcher icon."""
    size = pixels.shape[0]
    yy, xx = np.mgrid[0:size, 0:size]
    centre = (size - 1) / 2.0
    distance = np.hypot(yy - centre, xx - centre)
    edge = size / 2.0
    alpha = np.clip((edge - distance) / max(size * 0.02, 1.0), 0.0, 1.0)
    out = pixels.copy()
    out[:, :, 3] = out[:, :, 3] * alpha
    return out


def main():
    square = load(os.path.join(STORE, 'icon-512.png'))
    foreground = load(os.path.join(STORE, 'adaptive-foreground.png'))

    for density, size in LAUNCHER.items():
        scaled = resize(square, size)
        save(scaled, os.path.join(RES, 'mipmap-%s' % density, 'ic_launcher.png'))
        save(circular(scaled),
             os.path.join(RES, 'mipmap-%s' % density, 'ic_launcher_round.png'))

    for density, size in ADAPTIVE.items():
        save(resize(foreground, size),
             os.path.join(RES, 'mipmap-%s' % density,
                          'ic_launcher_foreground.png'))

    # The adaptive background is a flat brand colour: Android parallaxes this
    # layer, and detail in it just smears.
    with open(os.path.join(RES, 'values', 'ic_launcher_background.xml'), 'w') as fh:
        fh.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
                 '    <color name="ic_launcher_background">%s</color>\n'
                 '</resources>\n' % BRAND_NIGHT)

    # A drawable of the same name shadows the colour; remove it so the adaptive
    # icon XML resolves to the colour above.
    stale = os.path.join(RES, 'drawable', 'ic_launcher_background.xml')
    if os.path.exists(stale):
        os.remove(stale)

    print('icons written for %d densities' % len(LAUNCHER))


if __name__ == '__main__':
    main()
