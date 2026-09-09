"""
props.py -- roadside scenery and pickups.

Props are modelled around their own origin at ground level (z = 0) so the game
can drop them straight onto the terrain, and pickups spin about +Z.
"""

import math
import random

from lib import kit


def build_palm(P):
    """Leaning palm: stacked trunk segments plus radiating fronds."""
    rng = random.Random(11)
    parts, x, y = [], 0.0, 0.0
    height, segments = 5.6, 6
    step = height / segments

    for i in range(segments):
        t = i / float(segments)
        radius = 0.30 * (1.0 - 0.42 * t)
        lean = 0.16 * t * t
        x += lean * 0.5
        parts.append(kit.cylinder(
            'trunk', radius, step * 1.05, axis='Z',
            location=(x, y, step * (i + 0.5)), segments=7, material=P['Wood'],
            radius_top=0.30 * (1.0 - 0.42 * (t + 1.0 / segments))))

    crown = (x, y, height)
    for i in range(10):
        angle = 2 * math.pi * i / 10 + rng.uniform(-0.10, 0.10)
        droop = rng.uniform(0.55, 1.05)
        reach = rng.uniform(1.05, 1.35)
        frond = kit.box('frond', (0.52, 2.4, 0.10),
                        (crown[0] + math.sin(angle) * reach,
                         crown[1] + math.cos(angle) * reach,
                         crown[2] - droop * 0.5),
                        P['Foliage'], taper=0.18)
        frond.rotation_euler = (-droop, 0, -angle)
        parts.append(frond)
    parts.append(kit.cylinder('crown', 0.34, 0.42, axis='Z',
                              location=(crown[0], crown[1], crown[2] - 0.12),
                              segments=7, material=P['Wood']))
    return kit.join(parts, 'Palm')


def build_cactus(P):
    """Saguaro: one column and two elbowed arms."""
    parts = [kit.cylinder('trunk', 0.30, 3.4, axis='Z', location=(0, 0, 1.7),
                          segments=9, material=P['Cactus'], radius_top=0.26)]
    for sx, base, arm in ((-1.0, 1.5, 1.0), (1.0, 2.1, 0.8)):
        parts.append(kit.cylinder('arm', 0.18, 0.9, axis='X',
                                  location=(sx * 0.5, 0, base),
                                  segments=7, material=P['Cactus']))
        parts.append(kit.cylinder('arm_up', 0.18, arm, axis='Z',
                                  location=(sx * 0.92, 0, base + arm / 2.0),
                                  segments=7, material=P['Cactus'],
                                  radius_top=0.15))
    return kit.join(parts, 'Cactus')


def build_rock(P):
    """
    Irregular boulder built from three jittered rings plus a peak, flat on the
    underside so it always sits cleanly on the sand. Seeded, so rebuilds match.
    """
    rng = random.Random(23)
    rings = ((0.00, 1.45), (0.80, 1.65), (1.55, 0.85))
    segments = 7
    verts, faces = [], []

    for z, radius in rings:
        for i in range(segments):
            angle = 2 * math.pi * i / segments
            r = radius * rng.uniform(0.78, 1.18)
            verts.append((math.cos(angle) * r,
                          math.sin(angle) * r * rng.uniform(0.8, 1.2),
                          z * rng.uniform(0.85, 1.15)))
    peak = len(verts)
    verts.append((rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3),
                  rng.uniform(1.9, 2.2)))

    for level in range(len(rings) - 1):
        a, b = level * segments, (level + 1) * segments
        for i in range(segments):
            j = (i + 1) % segments
            faces.append((a + i, a + j, b + j, b + i))
    top = (len(rings) - 1) * segments
    for i in range(segments):
        faces.append((top + i, top + (i + 1) % segments, peak))
    faces.append(tuple(range(segments - 1, -1, -1)))            # flat base

    return kit.mesh_from('Rock', verts, faces, P['Rock'])


def build_mesa(P):
    """Distant butte: stacked, tapered slabs for a layered silhouette."""
    parts = [
        kit.box('base', (44, 30, 9), (0, 0, 4.5), P['Rock'],
                taper=0.78, shear=1.6),
        kit.box('mid', (32, 22, 7), (0, 1.5, 12.4), P['RockDark'],
                taper=0.74, shear=-1.2),
        kit.box('cap', (22, 15, 5), (0, 0.5, 18.2), P['Rock'], taper=0.82),
    ]
    return kit.join(parts, 'Mesa')


def build_lamp(P):
    """Highway light: pole, cranked arm and an emissive head."""
    parts = [
        kit.cylinder('base', 0.30, 0.5, axis='Z', location=(0, 0, 0.25),
                     segments=8, material=P['Metal']),
        kit.cylinder('pole', 0.15, 8.0, axis='Z', location=(0, 0, 4.2),
                     segments=8, material=P['Metal'], radius_top=0.10),
        kit.box('arm', (1.7, 0.16, 0.16), (0.85, 0, 8.1), P['Metal']),
        kit.box('head', (1.0, 0.42, 0.22), (1.55, 0, 7.94), P['Metal'],
                taper=0.7),
        kit.box('glow', (0.86, 0.34, 0.06), (1.55, 0, 7.80), P['LampGlow']),
    ]
    return kit.join(parts, 'Lamp')


def build_billboard(P):
    parts = [
        kit.box('panel', (7.2, 0.18, 3.2), (0, 0, 5.6), P['Sign']),
        kit.box('face', (6.8, 0.10, 2.9), (0, -0.12, 5.6), P['SignFace']),
        kit.box('frame_top', (7.4, 0.26, 0.22), (0, 0, 7.3), P['Metal']),
    ]
    for sx in (-1.0, 1.0):
        parts.append(kit.cylinder('leg', 0.20, 4.2, axis='Z',
                                  location=(sx * 2.4, 0, 2.1),
                                  segments=8, material=P['Metal']))
        parts.append(kit.box('brace', (0.14, 0.14, 2.6),
                             (sx * 2.4, 0.9, 4.0), P['Metal']))
    return kit.join(parts, 'Billboard')


def build_cone(P):
    parts = [
        kit.box('base', (0.52, 0.52, 0.07), (0, 0, 0.035), P['Cone']),
        kit.cylinder('body', 0.22, 0.66, axis='Z', location=(0, 0, 0.38),
                     segments=8, material=P['Cone'], radius_top=0.05),
        kit.cylinder('band', 0.17, 0.12, axis='Z', location=(0, 0, 0.46),
                     segments=8, material=P['LineWhite'], radius_top=0.15),
    ]
    return kit.join(parts, 'Cone')


def build_coin(P):
    """
    Score pickup. The disc faces ±X so the game can spin it about +Z and have
    it flash edge-on to face-on, the way a collectible should read.

    Kept to a single material on purpose: a coin run puts ~20 of these on
    screen at once, and every extra material would be another draw call each.
    Relief comes from the stepped radii instead of from colour.
    """
    parts = [
        kit.cylinder('coin', 0.52, 0.11, axis='X', location=(0, 0, 0),
                     segments=14, material=P['Gold']),
        kit.cylinder('rim', 0.38, 0.15, axis='X', location=(0, 0, 0),
                     segments=12, material=P['Gold']),
        kit.cylinder('pip', 0.17, 0.19, axis='X', location=(0, 0, 0),
                     segments=8, material=P['Gold']),
    ]
    return kit.join(parts, 'Coin')


def build_nitro(P):
    """Boost pickup: a shell with a glowing core."""
    parts = [
        kit.cylinder('shell', 0.30, 0.86, axis='Z', location=(0, 0, 0),
                     segments=10, material=P['NitroShell']),
        kit.cylinder('core', 0.33, 0.30, axis='Z', location=(0, 0, 0),
                     segments=10, material=P['Nitro']),
        kit.cylinder('cap', 0.14, 1.02, axis='Z', location=(0, 0, 0),
                     segments=8, material=P['NitroShell']),
        kit.box('fin', (0.62, 0.06, 0.26), (0, 0, -0.18), P['Nitro']),
    ]
    return kit.join(parts, 'Nitro')


BUILDERS = {
    'palm': build_palm,
    'cactus': build_cactus,
    'rock': build_rock,
    'mesa': build_mesa,
    'lamp': build_lamp,
    'billboard': build_billboard,
    'cone': build_cone,
    'coin': build_coin,
    'nitro': build_nitro,
}


def build(name, P):
    return BUILDERS[name](P)
