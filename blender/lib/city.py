"""
city.py -- the drivable city: street network and building blocks.

The map is a square grid. Blocks are BLOCK metres across, streets STREET
metres wide, so the grid pitch is BLOCK + STREET:

        L0        L1        L2          L_k = (k - GRID/2) * PITCH
    ----+---------+---------+----       street centre lines
        |  block  |  block  |
        |  (i,j)  |         |           block centre = (i - (GRID-1)/2) * PITCH

The whole street network -- asphalt and every painted marking -- is built as a
single mesh, so the roads cost a handful of draw calls no matter how big the
map is; the markings themselves are flat quads rather than thin boxes.
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
GRID = 8                # blocks per side
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
            kit_size = (size_u, size_v)
            location = (u, v, 0.012)
        else:
            kit_size = (size_v, size_u)
            location = (v, u, 0.012)
        parts.append(kit.plate(name, kit_size, location, material))

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
    """
    Asphalt plus every road marking, as one mesh.

    A band-per-street-line split was tried so three.js could cull the far
    side of the map, and measured worse: a band runs the full 626 m, so it is
    in frustum whichever way you face, and the split only added draw calls.
    With the markings built as flat quads the whole network is a few thousand
    triangles, cheap enough to submit in one go.
    """
    lines = street_lines()
    half_street = STREET / 2.0
    parts = [kit.box('asphalt', (EXTENT, EXTENT, 0.24), (0, 0, -0.12),
                     P['Asphalt'])]

    for line in lines:
        for j in range(GRID):
            start = lines[j] + half_street
            end = lines[j + 1] - half_street
            _markings_for_segment(P, parts, 'x', line, start, end)
            _markings_for_segment(P, parts, 'y', line, start, end)

    return kit.join(parts, 'CityGround')


# --------------------------------------------------------------------------- #
# landmark blocks
# --------------------------------------------------------------------------- #
#
# Three blocks are not generated at random but placed at fixed cells, so the
# city is learnable: a grid of interchangeable blocks all looks the same from
# the driver's seat, and once you have seen the tower once you know which way
# is which without looking at the minimap.


def _disc(name, radii, z, segments, material):
    """Flat ellipse -- the stadium pitch. A fan, so it is one triangle a step."""
    verts = [(0.0, 0.0, z)]
    for n in range(segments):
        angle = 2.0 * math.pi * n / segments
        verts.append((radii[0] * math.cos(angle), radii[1] * math.sin(angle), z))
    faces = [(0, 1 + n, 1 + (n + 1) % segments) for n in range(segments)]
    return kit.mesh_from(name, verts, faces, material)


def _annulus(name, inner, outer, z_inner, z_outer, segments, material,
             facade=None):
    """
    Sloped elliptical band -- a bowl of stadium seating, or the canopy over it.

    `inner` and `outer` are (rx, ry) radii; the band rises from z_inner at the
    inner edge to z_outer at the outer one. Pass `facade` to also drop the
    outer edge to that height as a wall, which is what turns the seating into
    a closed bowl; leave it off for the canopy, which hangs in the air.
    """
    stride = 3 if facade is not None else 2
    verts, faces = [], []
    for n in range(segments):
        angle = 2.0 * math.pi * n / segments
        c, s = math.cos(angle), math.sin(angle)
        verts += [(inner[0] * c, inner[1] * s, z_inner),
                  (outer[0] * c, outer[1] * s, z_outer)]
        if facade is not None:
            verts.append((outer[0] * c, outer[1] * s, facade))
    for n in range(segments):
        a = n * stride
        b = ((n + 1) % segments) * stride
        faces.append((a, a + 1, b + 1, b))          # the band, facing up
        if facade is not None:
            faces.append((a + 1, a + 2, b + 2, b + 1))   # wall, facing out
    return kit.mesh_from(name, verts, faces, material)


def _floodlight(P, x, y, height=22.0):
    """Mast with a lit head, at stadium scale."""
    parts = [kit.cylinder('mast', 0.55, height, axis='Z',
                          location=(x, y, PAVEMENT + height / 2.0),
                          segments=6, material=P['Metal'], radius_top=0.35)]
    for row in (-1, 1):
        parts.append(kit.box('rig', (5.0, 0.9, 1.6),
                             (x, y + row * 1.1, PAVEMENT + height + 0.8),
                             P['LampGlow']))
    parts.append(kit.box('rig_back', (5.4, 2.8, 0.6),
                         (x, y, PAVEMENT + height + 1.9), P['Roof']))
    return parts


def build_block_stadium(P):
    """A stadium: a bowl of seating around a pitch, under four floodlights."""
    parts = _pavement(P)
    inner = BLOCK / 2.0 - SETBACK
    pitch_r = (inner * 0.52, inner * 0.40)
    parts.append(_disc('pitch', pitch_r, PAVEMENT + 0.05, 24, P['Grass']))
    outer = (inner, inner * 0.82)
    parts.append(_annulus('stands', pitch_r, outer,
                          PAVEMENT + 1.2, PAVEMENT + 13.5, 24, P['Concrete'],
                          facade=0.0))
    # the canopy hangs over the seating without a wall of its own, so the
    # stands stay visible from outside
    parts.append(_annulus('canopy', (pitch_r[0] * 1.45, pitch_r[1] * 1.45),
                          (outer[0] + 1.4, outer[1] + 1.4),
                          PAVEMENT + 21.0, PAVEMENT + 16.5, 24,
                          P['Sidewalk']))
    for x, y in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        parts += _floodlight(P, x * (inner + 1.6), y * (inner * 0.82 + 1.6))
    # a ring of turnstiles, standing proud of the facade
    for n in range(8):
        angle = 2.0 * math.pi * (n + 0.5) / 8.0
        parts.append(kit.box('gate', (4.6, 3.4, 5.0),
                             (math.cos(angle) * (outer[0] + 0.6),
                              math.sin(angle) * (outer[1] + 0.6),
                              PAVEMENT + 2.5), P['BuildingA']))
    return kit.join(parts, 'BlockStadium')


def build_block_tower(P):
    """
    The tallest thing on the map: an observation tower on a podium.

    Deliberately over-scaled at 80 m against 48 m downtown towers, because a
    landmark you cannot pick out of the skyline is not a landmark.
    """
    parts = _pavement(P)
    base = PAVEMENT

    parts.append(kit.box('podium', (30.0, 30.0, 7.0), (0, 0, base + 3.5),
                         P['BuildingB'], taper=0.94))
    parts.append(kit.box('podium_glass', (30.4, 30.4, 2.2),
                         (0, 0, base + 3.0), P['Window']))
    parts.append(kit.box('podium_roof', (31.0, 31.0, 0.8),
                         (0, 0, base + 7.4), P['Roof']))

    shaft = 52.0
    parts.append(kit.cylinder('shaft', 6.2, shaft, axis='Z',
                              location=(0, 0, base + 7.8 + shaft / 2.0),
                              segments=10, material=P['Concrete'],
                              radius_top=4.0))
    # four ribs up the shaft, so it reads as a structure and not a chimney
    for angle in (0.0, math.pi / 2.0, math.pi, 3.0 * math.pi / 2.0):
        parts.append(kit.box('rib', (1.4, 1.4, shaft),
                             (math.cos(angle) * 5.4, math.sin(angle) * 5.4,
                              base + 7.8 + shaft / 2.0), P['Metal'],
                             taper=0.7))

    pod = base + 7.8 + shaft
    parts.append(kit.cylinder('pod_floor', 10.5, 1.0, axis='Z',
                              location=(0, 0, pod + 0.5), segments=12,
                              material=P['Roof']))
    parts.append(kit.cylinder('pod', 10.0, 6.0, axis='Z',
                              location=(0, 0, pod + 4.0), segments=12,
                              material=P['Window'], radius_top=8.6))
    parts.append(kit.cylinder('pod_roof', 9.4, 1.2, axis='Z',
                              location=(0, 0, pod + 7.6), segments=12,
                              material=P['Roof'], radius_top=6.0))
    parts.append(kit.cylinder('deck', 4.4, 4.0, axis='Z',
                              location=(0, 0, pod + 10.2), segments=10,
                              material=P['Concrete'], radius_top=3.0))
    mast = 14.0
    parts.append(kit.cylinder('mast', 0.9, mast, axis='Z',
                              location=(0, 0, pod + 12.2 + mast / 2.0),
                              segments=6, material=P['Metal'],
                              radius_top=0.25))
    parts.append(kit.cylinder('aircraft_light', 0.8, 0.9, axis='Z',
                              location=(0, 0, pod + 12.2 + mast + 0.4),
                              segments=8, material=P['LightRed']))
    return kit.join(parts, 'BlockTower')


def build_block_plaza(P):
    """A civic square: a memorial arch over a paved court, with a fountain."""
    rng = random.Random(707)
    parts = _pavement(P)
    inner = BLOCK / 2.0 - SETBACK
    base = PAVEMENT

    parts.append(kit.box('court', (inner * 2, inner * 2, 0.10),
                         (0, 0, base + 0.05), P['Sidewalk']))
    for ring, shade in ((0.74, P['Concrete']), (0.42, P['Sidewalk'])):
        parts.append(kit.box('court_ring', (inner * 2 * ring,
                                            inner * 2 * ring, 0.12),
                             (0, 0, base + 0.07), shade))

    # the arch: two piers, a lintel and a cornice, spanning the north-south walk
    pier = (5.0, 8.0, 15.0)
    for side in (-1, 1):
        parts.append(kit.box('pier', pier,
                             (side * 8.0, 0, base + pier[2] / 2.0),
                             P['BuildingA'], taper=0.94))
        parts.append(kit.box('pier_plinth', (pier[0] + 1.2, pier[1] + 1.2, 1.6),
                             (side * 8.0, 0, base + 0.8), P['Concrete']))
    parts.append(kit.box('lintel', (21.0, 8.4, 5.0), (0, 0, base + 17.5),
                         P['BuildingA']))
    parts.append(kit.box('cornice', (23.0, 9.6, 1.4), (0, 0, base + 20.7),
                         P['Concrete']))
    parts.append(kit.box('frieze', (16.0, 8.8, 1.8), (0, 0, base + 17.4),
                         P['Gold']))

    # fountain, off the arch's axis so the walk stays clear
    for radius, height, material in ((7.0, 0.9, P['Concrete']),
                                     (6.2, 0.6, P['SignFace']),
                                     (1.6, 3.4, P['Concrete'])):
        parts.append(kit.cylinder('fountain', radius, height, axis='Z',
                                  location=(0, inner * 0.58,
                                            base + height / 2.0),
                                  segments=14, material=material,
                                  radius_top=radius * 0.9))

    for side in (-1, 1):
        for y in (-inner * 0.62, inner * 0.10):
            parts += _tree(P, side * inner * 0.70, y, rng.uniform(3.8, 5.0))
        parts.append(kit.cylinder('flagpole', 0.22, 11.0, axis='Z',
                                  location=(side * 3.2, -inner * 0.72,
                                            base + 5.5),
                                  segments=6, material=P['Chrome']))
        parts.append(kit.box('flag', (0.1, 3.0, 1.8),
                             (side * 3.2, -inner * 0.72 + 1.5, base + 10.0),
                             P['Cone'] if side < 0 else P['SignFace']))
    return kit.join(parts, 'BlockPlaza')


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


def _tree(P, x, y, trunk):
    """Two-tier palm: a tapered trunk and a pair of cone canopies."""
    parts = [kit.cylinder('trunk', 0.30, trunk, axis='Z',
                          location=(x, y, PAVEMENT + trunk / 2.0),
                          segments=7, material=P['Wood'], radius_top=0.22)]
    for radius, lift in ((2.6, 0.0), (1.9, 1.5)):
        parts.append(kit.cylinder(
            'canopy', radius, 1.8, axis='Z',
            location=(x, y, PAVEMENT + trunk + lift), segments=7,
            material=P['Foliage'], radius_top=radius * 0.45))
    return parts


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
        parts += _tree(P, x, y, rng.uniform(3.4, 4.6))
    return kit.join(parts, 'BlockPark')


# Obstacles inside a parking block, in block-local metres: (x, z, halfX, halfZ).
# The builder places meshes from this list and manifest() ships the same list
# to the game as collision, so what you can see is exactly what you can hit.
def parking_layout():
    half = BLOCK / 2.0
    edge = half - 0.7
    wall = 0.7
    gate = 13.0                     # half-width of the way in, north and south
    flank = (half - gate) / 2.0
    return {
        'walls': [
            (-edge, 0.0, wall, half),
            (edge, 0.0, wall, half),
            (-(gate + flank), -edge, flank, wall),
            (gate + flank, -edge, flank, wall),
            (-(gate + flank), edge, flank, wall),
            (gate + flank, edge, flank, wall),
        ],
        'rows': [
            (-20.0, -8.0, 7.0, 12.0),
            (20.0, -8.0, 7.0, 12.0),
            (-20.0, 16.0, 7.0, 9.0),
        ],
        'kiosk': [(20.0, 18.0, 6.0, 7.0)],
    }


def parking_shapes():
    layout = parking_layout()
    return layout['walls'] + layout['rows'] + layout['kiosk']


def build_block_parking(P):
    """
    A car park you can actually drive into.

    Every other block is one solid box as far as collision goes; this one ships
    its obstacles individually, leaving a lane in from the north side and out
    to the south. The parked cars are simple two-box stand-ins -- at lot
    distance they read as cars without costing a real vehicle each.
    """
    rng = random.Random(505)
    layout = parking_layout()
    parts = [
        kit.box('tarmac', (BLOCK, BLOCK, PAVEMENT * 0.6),
                (0, 0, PAVEMENT * 0.3), P['Asphalt']),
    ]

    for (x, z, hx, hz) in layout['walls']:
        parts.append(kit.box('wall', (hx * 2, hz * 2, 0.75),
                             (x, z, 0.37), P['Kerb']))

    colours = [P['BuildingC'], P['SignFace'], P['Cone'], P['Sign'],
               P['BuildingB']]
    for (x, z, hx, hz) in layout['rows']:
        # bay markings, then a row of cars parked nose-in along it
        parts.append(kit.box('bays', (hx * 2, hz * 2, 0.04),
                             (x, z, 0.06), P['LineWhite']))
        parts.append(kit.box('bays_fill', (hx * 2 - 0.5, hz * 2 - 0.5, 0.05),
                             (x, z, 0.065), P['Asphalt']))
        count = max(2, int(hz * 2 / 2.6))
        for n in range(count):
            cz = z - hz + 1.3 + n * 2.6
            colour = colours[(n + int(x)) % len(colours)]
            parts.append(kit.box('parked', (4.2, 1.85, 0.72),
                                 (x, cz, 0.42), colour, bevel=0.06))
            parts.append(kit.box('parked_cabin', (2.1, 1.6, 0.52),
                                 (x - 0.2, cz, 1.02), P['Glass'],
                                 taper=0.82))

    for (x, z, hx, hz) in layout['kiosk']:
        parts.append(kit.box('kiosk', (hx * 2, hz * 2, 4.2),
                             (x, z, 2.1 + PAVEMENT), P['BuildingA']))
        parts.append(kit.box('kiosk_roof', (hx * 2 + 0.8, hz * 2 + 0.8, 0.4),
                             (x, z, 4.4 + PAVEMENT), P['Roof']))
        parts.append(kit.box('kiosk_window', (hx * 2 + 0.1, hz * 1.2, 1.2),
                             (x, z, 2.6 + PAVEMENT), P['Window']))

    return kit.join(parts, 'BlockParking')


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


def build_traffic_light(P):
    """
    One signal post carrying two heads: one seen by traffic travelling along
    X, one by traffic along Z.

    Each lamp is a single cylinder pushed right through its housing, so it
    reads as lit from both approaches at once and the post costs three lamp
    meshes per axis instead of six. The lamp materials are shared across every
    post on the map, which is what lets the game switch the whole city's
    signals by touching six materials.
    """
    height = 5.6
    parts = [
        kit.cylinder('base', 0.26, 0.3, axis='Z', location=(0, 0, 0.15),
                     segments=8, material=P['Trim']),
        kit.cylinder('pole', 0.12, height, axis='Z',
                     location=(0, 0, height / 2.0), segments=8,
                     material=P['Trim']),
        kit.box('housing_x', (0.30, 0.34, 1.12), (0, 0, 5.05), P['Trim']),
        kit.box('housing_z', (0.34, 0.30, 1.12), (0, 0, 3.80), P['Trim']),
        kit.box('visor_x', (0.36, 0.40, 0.06), (0, 0, 5.64), P['Trim']),
        kit.box('visor_z', (0.40, 0.36, 0.06), (0, 0, 4.39), P['Trim']),
    ]

    # Lamps for traffic running along X: discs facing +/-X.
    for n, lamp in enumerate(('Red', 'Amber', 'Green')):
        parts.append(kit.cylinder(
            'lamp_x_%s' % lamp, 0.115, 0.40, axis='X',
            location=(0, 0, 5.41 - n * 0.36), segments=10,
            material=P['SignalX_%s' % lamp]))
    # Lamps for traffic running along Z: discs facing +/-Z (Blender's +/-Y).
    for n, lamp in enumerate(('Red', 'Amber', 'Green')):
        parts.append(kit.cylinder(
            'lamp_z_%s' % lamp, 0.115, 0.40, axis='Y',
            location=(0, 0, 4.16 - n * 0.36), segments=10,
            material=P['SignalZ_%s' % lamp]))

    return kit.join(parts, 'TrafficLight')


def build_pedestrian(P):
    """
    A walker for the pavements.

    Only the legs move, and they are the only parts left as separate objects:
    their origins sit at the hip so the game can swing them directly, with no
    skeleton and no animation data. Everything else is welded into one body
    with two material slots, which keeps a whole pedestrian to four draw calls
    -- it matters, because a dozen of them are on screen at once.

    `Shirt` is the tintable slot, the way `CarPaint` is for vehicles.
    """
    hip, shoulder = 0.84, 1.38
    body_parts = [
        kit.box('torso', (0.40, 0.22, 0.58), (0, 0, hip + 0.30), P['Shirt']),
        kit.box('hips', (0.34, 0.21, 0.16), (0, 0, hip - 0.02), P['Shirt']),
        kit.box('head', (0.21, 0.21, 0.23), (0, 0, hip + 0.72), P['Skin'],
                bevel=0.03),
    ]
    for sx in (-1.0, 1.0):
        body_parts.append(kit.box('arm', (0.10, 0.11, 0.56),
                                  (sx * 0.25, 0.02, shoulder - 0.26),
                                  P['Shirt']))
    body = kit.join(body_parts, 'Ped')

    legs = []
    for side, sx in (('L', -1.0), ('R', 1.0)):
        leg = kit.box('Leg_%s' % side, (0.15, 0.16, 0.82), (0, 0, 0),
                      P['Trousers'])
        kit.move_origin(leg, (0, 0, -0.41))       # pivot at the hip
        leg.location = (sx * 0.11, 0, hip)
        legs.append(leg)

    root = kit.empty('Pedestrian')
    kit.parent(body, root)
    for leg in legs:
        kit.parent(leg, root)
    return root


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
    'block_parking': build_block_parking,
    'block_tower': build_block_tower,
    'block_stadium': build_block_stadium,
    'block_plaza': build_block_plaza,
    'beacon': build_beacon,
    'traffic_light': build_traffic_light,
    'pedestrian': build_pedestrian,
    'desert_floor': build_desert_floor,
    'city_wall': build_city_wall,
}


def build(name, P):
    """A builder may return one object or a list of them; both are fine."""
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
        # Collision for each block type. A solid block is one box covering the
        # whole footprint; the car park ships its obstacles instead, which is
        # what makes it driveable.
        'blockShapes': {
            'solid': [[0.0, 0.0, BLOCK / 2.0, BLOCK / 2.0]],
            'block_parking': [[round(v, 3) for v in shape]
                              for shape in parking_shapes()],
        },
    }
