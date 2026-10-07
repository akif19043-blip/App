#!/usr/bin/env python3
"""
icons.py -- draw the app icon with Pillow.

    python3 tools/icons.py

Writes assets/icon-192.png, assets/icon-512.png and store/icon-512.png,
plus the adaptive-icon layers Android wants. The icon is a runner
silhouette leaping between two roofs against a sunset: it has to read at
48 px on a launcher, so it is three shapes and a gradient, nothing more.
"""

import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw_icon(size, rounded=True, pad_ratio=0.0):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = int(size * pad_ratio)
    inner = size - 2 * pad
    # sunset gradient
    top = (42, 27, 74)
    mid = (255, 122, 26)
    bot = (255, 190, 90)
    for y in range(inner):
        t = y / max(1, inner - 1)
        c = lerp(top, mid, t / 0.6) if t < 0.6 else lerp(mid, bot, (t - 0.6) / 0.4)
        d.line([(pad, pad + y), (pad + inner, pad + y)], fill=c + (255,))
    # sun
    r = inner * 0.16
    cx, cy = pad + inner * 0.68, pad + inner * 0.42
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 236, 170, 255))
    # two roofs
    roof = (14, 12, 30, 255)
    h = inner * 0.3
    d.rectangle([pad, pad + inner - h, pad + inner * 0.36, pad + inner], fill=roof)
    d.rectangle([pad + inner * 0.62, pad + inner - h * 0.85, pad + inner, pad + inner], fill=roof)
    # parapets
    d.rectangle([pad, pad + inner - h - inner * 0.03, pad + inner * 0.36, pad + inner - h], fill=(40, 36, 70, 255))
    d.rectangle([pad + inner * 0.62, pad + inner - h * 0.85 - inner * 0.03, pad + inner, pad + inner - h * 0.85], fill=(40, 36, 70, 255))
    # runner: head, body, legs, arms as thick lines
    s = inner
    ox, oy = pad + s * 0.46, pad + s * 0.47
    w = max(2, int(s * 0.06))
    d.ellipse([ox - s * 0.055, oy - s * 0.2, ox + s * 0.055, oy - s * 0.09], fill=roof)
    d.line([(ox, oy - s * 0.09), (ox - s * 0.04, oy + s * 0.08)], fill=roof, width=w)            # torso
    d.line([(ox - s * 0.04, oy + s * 0.08), (ox - s * 0.2, oy + s * 0.16)], fill=roof, width=w)  # back leg
    d.line([(ox - s * 0.04, oy + s * 0.08), (ox + s * 0.14, oy + s * 0.14)], fill=roof, width=w)  # front leg
    d.line([(ox + s * 0.14, oy + s * 0.14), (ox + s * 0.17, oy + s * 0.26)], fill=roof, width=w)
    d.line([(ox - s * 0.01, oy - s * 0.05), (ox + s * 0.15, oy - s * 0.12)], fill=roof, width=w)  # front arm
    d.line([(ox - s * 0.01, oy - s * 0.05), (ox - s * 0.15, oy + s * 0.02)], fill=roof, width=w)  # back arm
    if rounded:
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([pad, pad, pad + inner, pad + inner], radius=int(inner * 0.22), fill=255)
        img.putalpha(mask)
    return img


def main():
    assets = os.path.join(ROOT, 'assets')
    store = os.path.join(ROOT, 'store')
    os.makedirs(assets, exist_ok=True)
    os.makedirs(store, exist_ok=True)
    draw_icon(512).save(os.path.join(assets, 'icon-512.png'))
    draw_icon(192).save(os.path.join(assets, 'icon-192.png'))
    draw_icon(512, rounded=False).save(os.path.join(store, 'icon-512.png'))
    # adaptive icon: full-bleed background, foreground with safe-zone padding
    draw_icon(432, rounded=False).save(os.path.join(store, 'adaptive-background.png'))
    fg = Image.new('RGBA', (432, 432), (0, 0, 0, 0))
    fg.alpha_composite(draw_icon(432, rounded=True, pad_ratio=0.18))
    fg.save(os.path.join(store, 'adaptive-foreground.png'))
    print('icons written')


if __name__ == '__main__':
    main()
