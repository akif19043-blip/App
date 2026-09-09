"""
render.py -- headless preview renders of the generated assets.

These images are not used by the game; they exist so the geometry can actually
be looked at (and fixed) instead of assumed correct. Cycles on CPU is used
because it needs no GPU or display, which is all this environment has.
"""

import math

import bpy
from mathutils import Vector

from lib import kit


def setup(samples=24, resolution=(560, 380), background='#8fb6d8',
          ground='#b9975b', sun_energy=3.0):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'      # no alpha to store
    scene.render.image_settings.compression = 100
    scene.view_settings.view_transform = 'Filmic' if 'Filmic' in [
        t.identifier for t in
        scene.view_settings.bl_rna.properties['view_transform'].enum_items
    ] else 'Standard'

    world = bpy.data.worlds.new('PreviewWorld')
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg is not None:
        bg.inputs['Color'].default_value = (*kit.hex_color(background), 1.0)
        bg.inputs['Strength'].default_value = 1.4
    scene.world = world

    if ground is not None:
        kit.box('PreviewGround', (400, 400, 0.2), (0, 0, -0.1),
                kit.mat('PreviewGround', kit.hex_color(ground), roughness=0.9))

    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = sun_energy
    sun.data.angle = math.radians(6)
    sun.rotation_euler = (math.radians(52), math.radians(14), math.radians(-58))
    bpy.context.collection.objects.link(sun)

    fill = bpy.data.objects.new('Fill', bpy.data.lights.new('Fill', 'AREA'))
    fill.data.energy = 700
    fill.data.size = 12
    fill.location = (-9, -7, 8)
    fill.rotation_euler = (math.radians(48), 0, math.radians(-140))
    bpy.context.collection.objects.link(fill)
    return scene


def shot(path, focus=(0, 0, 0.8), radius=9.0, elevation=22.0, azimuth=38.0,
         lens=52.0):
    """Render one framed view; `azimuth` 0 looks straight at the vehicle nose."""
    scene = bpy.context.scene
    camera = bpy.data.objects.get('PreviewCam')
    if camera is None:
        camera = bpy.data.objects.new('PreviewCam', bpy.data.cameras.new('Cam'))
        bpy.context.collection.objects.link(camera)
    scene.camera = camera
    camera.data.lens = lens

    focus = Vector(focus)
    theta, phi = math.radians(azimuth), math.radians(elevation)
    camera.location = focus + Vector((
        math.sin(theta) * math.cos(phi),
        math.cos(theta) * math.cos(phi),
        math.sin(phi),
    )) * radius
    camera.rotation_euler = (focus - camera.location).to_track_quat('-Z', 'Y').to_euler()

    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def frame(objs, margin=1.30, floor=2.0):
    """Fit a camera distance and focus point around the given objects."""
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
    if lo.x > hi.x:
        return (0.0, 0.0, 1.0), 8.0
    center = (lo + hi) / 2.0
    return tuple(center), max((hi - lo).length * margin, floor)
