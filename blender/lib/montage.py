"""
montage.py -- glue the individual preview renders into one contact sheet.

Blender is already loaded, so its image API does the pixel work and no extra
imaging dependency is needed.
"""

import os

import bpy
import numpy as np


def _load(path):
    """Return an HxWx4 float array, top row first."""
    image = bpy.data.images.load(path)
    width, height = image.size
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)
    bpy.data.images.remove(image)
    return pixels[::-1]                      # Blender stores bottom-up


def _shrink(pixels, factor):
    if factor <= 1:
        return pixels
    h, w = pixels.shape[0] // factor * factor, pixels.shape[1] // factor * factor
    trimmed = pixels[:h, :w]
    return trimmed.reshape(h // factor, factor,
                           w // factor, factor, 4).mean(axis=(1, 3))


def contact_sheet(paths, out_path, columns=5, shrink=2, gap=6,
                  background=(0.08, 0.09, 0.11, 1.0)):
    """Tile `paths` into a grid and write a single PNG."""
    tiles = [_shrink(_load(p), shrink) for p in paths if os.path.exists(p)]
    if not tiles:
        return None

    th, tw = tiles[0].shape[:2]
    rows = (len(tiles) + columns - 1) // columns
    sheet = np.zeros((rows * (th + gap) + gap,
                      columns * (tw + gap) + gap, 4), dtype=np.float32)
    sheet[:, :] = background

    for i, tile in enumerate(tiles):
        r, c = divmod(i, columns)
        y, x = gap + r * (th + gap), gap + c * (tw + gap)
        sheet[y:y + tile.shape[0], x:x + tile.shape[1]] = tile

    height, width = sheet.shape[:2]
    out = bpy.data.images.new('contact_sheet', width, height, alpha=True)
    out.pixels = sheet[::-1].ravel().tolist()
    out.filepath_raw = out_path
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(out)
    return out_path
