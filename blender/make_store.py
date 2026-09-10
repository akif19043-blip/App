#!/usr/bin/env python3
"""
make_store.py -- every icon and graphic the app and the Play listing need.

    python3 blender/make_store.py

Writes:
    game/assets/icon-192.png, icon-512.png      PWA / home screen
    store/icon-512.png                          Play listing icon
    store/adaptive-foreground.png               Android adaptive icon, car only
    store/adaptive-background.png               Android adaptive icon, backdrop
    store/feature-graphic.png                   1024x500 Play feature graphic

Everything is rendered from the same models the game ships, so the store never
shows art the game does not actually contain.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy                                              # noqa: E402

from lib import kit, palette, render, vehicles          # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME_ASSETS = os.path.join(ROOT, 'game', 'assets')
STORE = os.path.join(ROOT, 'store')

BRAND_ORANGE = '#ff8a3d'
BRAND_NIGHT = '#1d2b52'
BRAND_DEEP = '#141c33'


def hero(paint=BRAND_ORANGE, model='car_super'):
    """A freshly built hero car, painted in the brand colour."""
    kit.reset()
    P = palette.build()
    vehicles.build(model, P)
    material = bpy.data.materials.get('CarPaint')
    if material is not None:
        for node in material.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                node.inputs['Base Color'].default_value = (
                    *kit.hex_color(paint), 1.0)
    return P


def icon(path, size, background, transparent=False, radius=8.0,
         elevation=24, azimuth=38, focus=(0, 0, 0.55)):
    """
    App icon: the hero car on a flat brand backdrop.

    No ground plane -- an icon wants a clean field behind the subject, not a
    horizon -- and a softer sun, because the paint blows out to white at the
    energy the in-game renders use.
    """
    hero()
    render.setup(samples=64, resolution=(size, size),
                 background=background, ground=None, sun_energy=2.6)
    bpy.context.scene.render.film_transparent = transparent
    render.shot(path, focus=focus, radius=radius, elevation=elevation,
                azimuth=azimuth, lens=58)
    print(os.path.relpath(path, ROOT))


def adaptive_background(path, size=432):
    """
    Flat brand backdrop for the Android adaptive icon.

    Android masks and parallaxes this layer, so it carries no detail -- just
    the colour the foreground sits on.
    """
    kit.reset()
    P = palette.build()
    plate = kit.mat('IconPlate', kit.hex_color(BRAND_NIGHT), roughness=0.9)
    kit.box('plate', (40, 40, 0.2), (0, 0, 0), plate)
    kit.cylinder('glow', 11.0, 0.1, axis='Z', location=(0, 0, 0.12),
                 segments=32,
                 material=kit.mat('IconGlow', kit.hex_color(BRAND_DEEP),
                                  roughness=0.9))
    render.setup(samples=16, resolution=(size, size),
                 background=BRAND_NIGHT, ground=None, sun_energy=2.0)
    render.shot(path, focus=(0, 0, 0), radius=26, elevation=90, azimuth=0,
                lens=50)
    print(os.path.relpath(path, ROOT))


def title_text(body, location, size, extrude=0.06, align='CENTER'):
    curve = bpy.data.curves.new(type='FONT', name='Title')
    curve.body = body
    curve.size = size
    curve.extrude = extrude
    curve.align_x = align
    curve.align_y = 'CENTER'
    obj = bpy.data.objects.new('Title', curve)
    obj.location = location
    bpy.context.collection.objects.link(obj)
    return obj


def menu_logo(path, width=880, height=460):
    """
    The badge at the top of the main menu.

    A game menu wants a logo, not styled text: something with an edge, a
    thickness and a light on it. This is a road sign on two posts, rendered
    on transparency so the live city behind the menu shows through around it.

    An earlier version stood the sign on a crossroads -- what the name means
    -- and it did not survive being shrunk to 300px: the roads read as a grey
    slab cropped at the edges of the image rather than as roads. A sign on
    posts is legible at any size, which is the whole job.

    No tagline in the render: that line is translated, and a logo baked with
    Turkish in it would be wrong in English.
    """
    kit.reset()
    P = palette.build()

    plate = kit.mat('SignPlate', kit.hex_color(BRAND_NIGHT), metallic=0.30,
                    roughness=0.42)
    rim = kit.mat('SignRim', kit.hex_color(BRAND_ORANGE), metallic=0.55,
                  roughness=0.28)
    face = kit.mat('SignFaceInk', kit.hex_color('#f4f7fb'), metallic=0.20,
                   roughness=0.30)

    # The sign stands in the XZ plane facing +Y, which is where the camera is:
    # the rim sits furthest back, the darker face steps forward out of it, and
    # the letters stand proud of that again.
    kit.box('rim', (15.0, 0.55, 4.5), (0, 0.00, 5.4), rim, bevel=0.12)
    kit.box('plate', (14.2, 0.45, 3.8), (0, 0.12, 5.4), plate, bevel=0.10)

    title = title_text('DÖRTYOL', (0, 0.42, 5.35), 2.15, extrude=0.24)
    title.data.materials.append(face)
    # Text lies flat facing +Z. X+90 turns its face to -Y, where the camera
    # is, and Z+180 keeps it the right way up rather than mirrored -- one
    # rotation cannot fix both.
    title.rotation_euler = (math.radians(90), 0, math.radians(180))

    for x in (-5.4, 5.4):
        kit.cylinder('post', 0.26, 3.6, axis='Z', location=(x, 0, 1.6),
                     segments=10, material=P['Metal'])
        kit.box('footing', (1.5, 1.5, 0.42), (x, 0, 0.0), P['Kerb'],
                bevel=0.06)

    scene = render.setup(samples=96, resolution=(width, height),
                         background=BRAND_NIGHT, ground=None, sun_energy=4.6)
    # The shared sun is set up for subjects seen from above; this one faces the
    # camera, so its front would be the shadow side. Re-aim it to come from
    # over the camera's right shoulder: a sun rotated -55 about X travels
    # along -Y and down, which is to say it shines from +Y, where we are.
    sun = bpy.data.objects.get('Sun')
    if sun is not None:
        sun.rotation_euler = (math.radians(-55), 0, math.radians(-25))
    fill = bpy.data.objects.get('Fill')
    if fill is not None:
        fill.location = (-11, 13, 7)
        fill.rotation_euler = (math.radians(66), 0, math.radians(214))
    scene.render.film_transparent = True
    scene.render.image_settings.color_mode = 'RGBA'
    render.shot(path, focus=(0, 0, 4.3), radius=27.0, elevation=7,
                azimuth=2, lens=52)
    print(os.path.relpath(path, ROOT))


def feature_graphic(path, width=1024, height=500):
    """
    The 1024x500 banner on the Play listing: the three playable cars on
    asphalt with the title above them.

    Play crops this graphic differently in different placements, so the title
    and the cars both sit well inside the middle -- nothing important goes near
    an edge.
    """
    kit.reset()
    P = palette.build()

    kit.box('ground', (400, 400, 0.4), (0, 0, -0.2), P['Asphalt'])
    for i in range(-4, 5):
        kit.box('line', (0.16, 4.0, 0.02), (i * 3.4, -6.0, 0.01), P['LineWhite'])

    for index, (model, paint, x) in enumerate((
            ('car_muscle', '#2f6bd8', -6.2),
            ('car_super', BRAND_ORANGE, 0.0),
            ('car_sport', '#d33a2c', 6.2))):
        before = set(bpy.data.objects)
        vehicles.build(model, P)
        # Every car shares the CarPaint slot, so each one gets its own copy
        # before the next build reuses it.
        copy = bpy.data.materials['CarPaint'].copy()
        copy.name = 'CarPaint_%d' % index
        for node in copy.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                node.inputs['Base Color'].default_value = (
                    *kit.hex_color(paint), 1.0)
        for obj in set(bpy.data.objects) - before:
            if obj.parent is None:
                obj.location.x += x
                obj.rotation_euler.z = math.radians(-14 + index * 14)
            if obj.type == 'MESH':
                for slot in obj.material_slots:
                    if slot.material and slot.material.name == 'CarPaint':
                        slot.material = copy

    gold = kit.mat('TitleGold', kit.hex_color(BRAND_ORANGE), metallic=0.35,
                   roughness=0.30, emission=kit.hex_color('#ff7a2a'),
                   emission_strength=1.2)
    title = title_text('DÖRTYOL', (0, -1.0, 4.7), 1.9)
    title.data.materials.append(gold)
    # Text lies flat facing +Z. Standing it up about X alone either shows its
    # back (mirrored) or lands it upside down, because that one rotation has
    # to fix both the facing and which way is up. X+90 then Z+180 does both:
    # the face turns to +Y, where the camera is, and up stays +Z.
    title.rotation_euler = (math.radians(90), 0, math.radians(180))

    render.setup(samples=48, resolution=(width, height),
                 background='#24406e', ground=None, sun_energy=4.4)
    render.shot(path, focus=(0, 0, 2.6), radius=27.0, elevation=9,
                azimuth=4, lens=58)
    print(os.path.relpath(path, ROOT))


def main():
    os.makedirs(GAME_ASSETS, exist_ok=True)
    os.makedirs(STORE, exist_ok=True)

    for size in (192, 512):
        icon(os.path.join(GAME_ASSETS, 'icon-%d.png' % size), size, BRAND_NIGHT)
    icon(os.path.join(STORE, 'icon-512.png'), 512, BRAND_NIGHT)
    # Android masks adaptive icons hard: only the middle ~66% is guaranteed
    # visible, so the car is framed well inside it.
    icon(os.path.join(STORE, 'adaptive-foreground.png'), 432, BRAND_NIGHT,
         transparent=True, radius=10.5)
    adaptive_background(os.path.join(STORE, 'adaptive-background.png'))
    feature_graphic(os.path.join(STORE, 'feature-graphic.png'))

    ui = os.path.join(GAME_ASSETS, 'ui')
    os.makedirs(ui, exist_ok=True)
    menu_logo(os.path.join(ui, 'logo.png'))


if __name__ == '__main__':
    main()
