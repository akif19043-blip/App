"""
city.py -- the drivable city: street network and building blocks.

The map is a square grid. Blocks are BLOCK metres across, streets STREET
metres wide, so the grid pitch is BLOCK + STREET:

        L0        L1        L2          L_k = (k - GRID/2) * PITCH
    ----+---------+---------+----       street centre lines
        |  block  |  block  |
        |  (i,j)  |         |           block centre = (i - (GRID-1)/2) * PITCH

The whole street network -- asphalt and every painted marking -- is built as a
single mesh, so the roads cost three draw calls no matter how big the map is.
Each block is likewise joined into one mesh. The same constants are written
into manifest.json, so the game places blocks, spawns traffic in real lanes and
collides against the kerbs using the numbers the geometry was built from.
"""

import math
import random

from lib import kit

BLOCK = 58.0            # side of a city block, including its pavement
STREET = 18.0           # kerb-to-kerb street width (2 lanes each way)
PITCH = BLOCK + STREET
GRID = 6                # blocks per side
EXTENT = GRID * PITCH + STREET          # full map width, kerb wall to kerb wall

LANE_OFFSETS = (2.25, 6.75)             # from the street centre line
PAVEMENT = 0.18                         # kerb height
SETBACK = 4.0                           # pavement width before buildings start


def street_lines():
    """Centre-line coordinate of every street, on either axis."""
    return [(k - GRID / 2.0) * PITCH for k in range(GRID + 1)]


def block_centers():
    """(x, z) centre of every city block."""
    out = []
    for i in range(GRID):
        for j in range(GRID):
            out.append(((i - (GRID - 1) / 2.0) * PITCH,
                        (j - (GRID - 1) / 2.0) * PITCH))
    return out


def half_extent():
    return EXTENT / 2.0


# --------------------------------------------------------------------------- #
# street network
# --------------------------------------------------------------------------- #

def _markings_for_segment(P, parts, along_axis, line, start, end):
    """
    Paint one stretch of street between two intersections.

    `along_axis` is the axis the street runs along ('x' or 'y' in Blender's
    ground plane); `line` is the street's centre coordinate on the other axis.
    """
    def place(name, u, v, size_u, size_v, material):
        # u runs along the street, v across it
        if along_axis == 'x':
            kit_size = (size_u, size_v, 0.02)
            location = (u, v, 0.012)
        else:
            kit_size = (size_v, size_u, 0.02)
            location = (v, u, 0.012)
        parts.append(kit.box(name, kit_size, location, material))

    length = end - start
    mid = (start + end) / 2.0

    # solid double centre line
    for offset in (-0.22, 0.22):
        place('centre', mid, line + offset, length, 0.14, P['LineYellow'])

    # dashed dividers between the two lanes on each side
    dashes = 4
    pitch = length / dashes
    for side in (-1.0, 1.0):
        for n in range(dashes):
            u = start + pitch * (n + 0.5)
            place('dash', u, line + side * 4.5, pitch * 0.42, 0.13,
                  P['LineWhite'])

    # stop bars, on the approach side of each intersection
    for u, side in ((start + 0.9, 1.0), (end - 0.9, -1.0)):
        place('stop', u, line + side * 4.5, 0.5, 8.6, P['LineWhite'])


def build_city_ground(P):
    """Asphalt plus every road marking, as one mesh."""
    parts = [kit.box('asphalt', (EXTENT, EXTENT, 0.24), (0, 0, -0.12),
                     P['Asphalt'])]

    lines = street_lines()
    half_street = STREET / 2.0
    for line in lines:
        for j in range(GRID):
            start = lines[j] + half_street
            end = lines[j + 1] - half_street
            _markings_for_segment(P, parts, 'x', line, start, end)
            _markings_for_segment(P, parts, 'y', line, start, end)

    return kit.join(parts, 'CityGround')


# --------------------------------------------------------------------------- #
# blocks
# --------------------------------------------------------------------------- #

def _pavement(P):
    """Slab plus a kerb lip, so the edge the car cannot cross is visible."""
    parts = [kit.box('pavement', (BLOCK, BLOCK, PAVEMENT),
                     (0, 0, PAVEMENT / 2.0), P['Sidewalk'])]
    half = BLOCK / 2.0
    for sx, sy, w, h in ((0, half, BLOCK, 0.5), (0, -half, BLOCK, 0.5),
                         (half, 0, 0.5, BLOCK), (-half, 0, 0.5, BLOCK)):
        size = (w, h, PAVEMENT + 0.06) if w > h else (w, h, PAVEMENT + 0.06)
        parts.append(kit.box('kerb', size, (sx, sy, (PAVEMENT + 0.06) / 2.0),
                             P['Kerb']))
    return parts


def _building(P, width, depth, height, location, material, rng,
              floor_height=3.6, taper=1.0):
    """A box with banded windows, a plinth and a roof cap."""
    x, y = location
    base = PAVEMENT
    parts = [
        kit.box('shell', (width, depth, height), (x, y, base + height / 2.0),
                material, taper=taper),
        kit.box('plinth', (width + 0.5, depth + 0.5, 1.4),
                (x, y, base + 0.7), P['Roof']),
        kit.box('roof', (width * 0.86, depth * 0.86, 0.7),
                (x, y, base + height + 0.35), P['Roof']),
    ]
    if height > 12:
        parts.append(kit.box('rooftop', (width * 0.3, depth * 0.3, 1.8),
                             (x + rng.uniform(-2, 2), y + rng.uniform(-2, 2),
                              base + height + 1.5), P['Roof']))

    floors = int((height - 3.0) // floor_height)
    for n in range(floors):
        z = base + 2.6 + n * floor_height
        t = 1.0 - (1.0 - taper) * ((z - base) / height)
        parts.append(kit.box('windows',
                             (width * t + 0.12, depth * t + 0.12, 1.7),
                             (x, y, z), P['Window']))
    return parts


def _scatter(rng, count, area, min_gap):
    """Poisson-ish points inside a square, so buildings do not overlap."""
    points = []
    for _ in range(count * 40):
        if len(points) >= count:
            break
        p = (rng.uniform(-area, area), rng.uniform(-area, area))
        if all(max(abs(p[0] - q[0]), abs(p[1] - q[1])) > min_gap
               for q in points):
            points.append(p)
    return points


def build_block_downtown(P):
    """Four towers with banded glazing."""
    rng = random.Random(101)
    parts = _pavement(P)
    step = (BLOCK / 2.0 - SETBACK) / 2.0
    materials = [P['BuildingB'], P['BuildingA'], P['BuildingB'], P['BuildingC']]
    for n, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        width = rng.uniform(17, 22)
        depth = rng.uniform(17, 22)
        height = rng.uniform(26, 48)
        parts += _building(P, width, depth, height,
                           (sx * step, sy * step), materials[n], rng,
                           taper=rng.choice([1.0, 1.0, 0.88]))
    return kit.join(parts, 'BlockDowntown')


def build_block_lowrise(P):
    """A denser huddle of shops and flats."""
    rng = random.Random(202)
    parts = _pavement(P)
    materials = [P['BuildingA'], P['BuildingC'], P['BuildingA'], P['BuildingB']]
    for n, (x, y) in enumerate(_scatter(rng, 8, BLOCK / 2.0 - SETBACK - 6, 13)):
        parts += _building(P, rng.uniform(10, 15), rng.uniform(10, 15),
                           rng.uniform(8, 17), (x, y),
                           materials[n % len(materials)], rng)
    return kit.join(parts, 'BlockLowrise')


def build_block_park(P):
    """Green space: grass, paths and palms."""
    rng = random.Random(303)
    parts = _pavement(P)
    inner = BLOCK / 2.0 - SETBACK
    parts.append(kit.box('grass', (inner * 2, inner * 2, 0.08),
                         (0, 0, PAVEMENT + 0.04), P['Grass']))
    parts.append(kit.box('path_x', (inner * 2, 3.0, 0.10),
                         (0, 0, PAVEMENT + 0.05), P['Sidewalk']))
    parts.append(kit.box('path_y', (3.0, inner * 2, 0.10),
                         (0, 0, PAVEMENT + 0.05), P['Sidewalk']))
    parts.append(kit.cylinder('pond', 6.0, 0.12, axis='Z',
                              location=(inner * 0.45, -inner * 0.45,
                                        PAVEMENT + 0.06),
                              segments=12, material=P['SignFace']))
    for (x, y) in _scatter(rng, 7, inner - 4, 9):
        trunk = rng.uniform(3.4, 4.6)
        parts.append(kit.cylinder('trunk', 0.30, trunk, axis='Z',
                                  location=(x, y, PAVEMENT + trunk / 2.0),
                                  segments=7, material=P['Wood'],
                                  radius_top=0.22))
        for level, (radius, lift) in enumerate(((2.6, 0.0), (1.9, 1.5))):
            parts.append(kit.cylinder(
                'canopy', radius, 1.8, axis='Z',
                location=(x, y, PAVEMENT + trunk + lift), segments=7,
                material=P['Foliage'], radius_top=radius * 0.45))
    return kit.join(parts, 'BlockPark')


def build_block_industrial(P):
    """Flat-roofed sheds, silos and stacked containers."""
    rng = random.Random(404)
    parts = _pavement(P)
    inner = BLOCK / 2.0 - SETBACK

    for sy in (-1.0, 1.0):
        parts.append(kit.box('shed', (inner * 1.7, inner * 0.7, 9.0),
                             (0, sy * inner * 0.5, PAVEMENT + 4.5),
                             P['BuildingB']))
        parts.append(kit.box('shed_roof', (inner * 1.75, inner * 0.75, 0.6),
                             (0, sy * inner * 0.5, PAVEMENT + 9.2), P['Roof']))
        parts.append(kit.box('shed_door', (6.0, 0.4, 5.0),
                             (0, sy * (inner * 0.5 - inner * 0.35),
                              PAVEMENT + 2.5), P['Roof']))

    # Containers go in the yard between the two sheds, where there is room.
    for n in range(5):
        x = (n - 2) * 8.4
        y = rng.uniform(-3.0, 3.0)
        colour = [P['Cone'], P['SignFace'], P['Foliage']][n % 3]
        parts.append(kit.box('container', (7.4, 2.6, 2.6),
                             (x, y, PAVEMENT + 1.3), colour))
        if n % 2 == 0:
            parts.append(kit.box('container', (7.4, 2.6, 2.6),
                                 (x, y + rng.uniform(-0.4, 0.4),
                                  PAVEMENT + 3.95), P['BuildingC']))
    for sx in (-1.0, 1.0):
        parts.append(kit.cylinder('silo', 3.0, 12.0, axis='Z',
                                  location=(sx * inner * 0.75, 0,
                                            PAVEMENT + 6.0),
                                  segments=10, material=P['Sign']))
    return kit.join(parts, 'BlockIndustrial')


def build_desert_floor(P):
    """Sand the city sits on, so the edge of the map is not a void."""
    return kit.box('DesertFloor', (1400.0, 1400.0, 0.30), (0, 0, -0.40),
                   P['Sand'])


def build_city_wall(P):
    """One PITCH-long boundary wall segment; the game rings the map with them."""
    length = PITCH
    parts = [
        kit.box('wall', (length, 0.9, 2.6), (0, 0, 1.3), P['Concrete']),
        kit.box('cap', (length, 1.2, 0.24), (0, 0, 2.72), P['Kerb']),
    ]
    for n in range(3):
        x = (n - 1) * (length / 2.4)
        parts.append(kit.box('pillar', (1.3, 1.5, 3.1), (x, 0, 1.55),
                             P['Kerb']))
    return kit.join(parts, 'CityWall')


def build_beacon(P):
    """Mission marker: a glowing pad with a column the game spins."""
    parts = [
        kit.cylinder('pad', 3.2, 0.10, axis='Z', location=(0, 0, 0.05),
                     segments=16, material=P['Beacon']),
        kit.cylinder('pad_inner', 2.4, 0.14, axis='Z', location=(0, 0, 0.07),
                     segments=16, material=P['Asphalt']),
        kit.cylinder('column', 0.85, 7.0, axis='Z', location=(0, 0, 3.5),
                     segments=8, material=P['Beacon'], radius_top=0.35),
    ]
    return kit.join(parts, 'Beacon')


BUILDERS = {
    'city_ground': build_city_ground,
    'block_downtown': build_block_downtown,
    'block_lowrise': build_block_lowrise,
    'block_park': build_block_park,
    'block_industrial': build_block_industrial,
    'beacon': build_beacon,
    'desert_floor': build_desert_floor,
    'city_wall': build_city_wall,
}


def build(name, P):
    return BUILDERS[name](P)


def manifest():
    """Grid numbers the game needs, straight from the geometry."""
    return {
        'block': BLOCK,
        'street': STREET,
        'pitch': PITCH,
        'grid': GRID,
        'extent': EXTENT,
        'halfExtent': half_extent(),
        'pavement': PAVEMENT,
        'laneOffsets': list(LANE_OFFSETS),
        'streetLines': [round(v, 3) for v in street_lines()],
        'blockCenters': [[round(x, 3), round(z, 3)] for x, z in block_centers()],
    }
