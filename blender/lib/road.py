"""
road.py -- the tiling highway pieces.

Everything here is authored as a single tile `TILE_LEN` metres long, laid out
along +Y so the game can recycle a handful of copies forever. Lane geometry is
driven by the constants below and re-exported to the game as JSON, so the road
mesh and the gameplay lane positions can never drift apart.
"""

from lib import kit

TILE_LEN = 40.0        # metres per tile
LANES = 4
LANE_W = 3.4           # lane centre spacing
SHOULDER_W = 1.9
DASH_LEN = 3.2
DASH_GAP = 5.0
GUARDRAIL_TILE = 40.0   # longer tiles = fewer draw calls on the phone

ROAD_W = LANES * LANE_W                       # 13.6 m of asphalt
EDGE_X = ROAD_W / 2.0


def lane_centers():
    """X positions of the drivable lane centres, left to right."""
    return [(-ROAD_W / 2.0) + LANE_W * (i + 0.5) for i in range(LANES)]


def build_road(P):
    """One asphalt tile complete with painted markings."""
    parts = [kit.box('asphalt', (ROAD_W, TILE_LEN, 0.24), (0, 0, -0.12),
                     P['Asphalt'])]

    for sx in (-1.0, 1.0):                     # graded dirt shoulders
        parts.append(kit.box('shoulder', (SHOULDER_W, TILE_LEN, 0.20),
                             (sx * (EDGE_X + SHOULDER_W / 2.0), 0, -0.11),
                             P['Shoulder']))
        parts.append(kit.box('edge_line', (0.16, TILE_LEN, 0.02),
                             (sx * (EDGE_X - 0.28), 0, 0.005), P['LineWhite']))

    # dashed lane dividers, laid out so consecutive tiles stay in cadence
    pitch = DASH_LEN + DASH_GAP
    count = int(TILE_LEN // pitch)
    for i in range(1, LANES):
        x = -ROAD_W / 2.0 + LANE_W * i
        material = P['LineYellow'] if i == LANES // 2 else P['LineWhite']
        for n in range(count):
            y = -TILE_LEN / 2.0 + pitch * (n + 0.5)
            parts.append(kit.box('dash', (0.14, DASH_LEN, 0.02),
                                 (x, y, 0.005), material))

    return kit.join(parts, 'Road')


def build_guardrail(P):
    """
    One rail tile, mirrored down both edges of the road by the game.

    Deliberately a single material: the whole tile then exports as one glTF
    primitive, and at ~24 tiles on screen that is 24 draw calls instead of 48.
    """
    length = GUARDRAIL_TILE
    posts = int(length / 5.0) + 1
    parts = [
        kit.box('beam', (0.10, length, 0.34), (0, 0, 0.72), P['Metal']),
        kit.box('beam_lip', (0.16, length, 0.06), (0, 0, 0.88), P['Metal']),
    ]
    for n in range(posts):
        y = -length / 2.0 + length * n / float(posts - 1)
        parts.append(kit.box('post', (0.12, 0.12, 0.78), (0, y, 0.39),
                             P['Metal']))
    return kit.join(parts, 'Guardrail')


def build_barrier(P):
    """Concrete jersey barrier, lofted from a proper tapered profile."""
    rows = [
        kit.section(y=-1.6, w=0.30, z0=0.0, z1=0.92,
                    bw=0.32, tw=0.12, zm=0.16, zb=0.86),
        kit.section(y=1.6, w=0.30, z0=0.0, z1=0.92,
                    bw=0.32, tw=0.12, zm=0.16, zb=0.86),
    ]
    barrier = kit.loft('Barrier', rows, material=P['Concrete'], bevel=0.02)
    stripe = kit.box('stripe', (0.63, 0.9, 0.14), (0, 0, 0.60), P['LineWhite'])
    return kit.join([barrier, stripe], 'Barrier')


def build_ground(P):
    """
    Desert tile the road sits on: one slab, one material, one draw call.

    Deliberately flat and featureless -- the tile repeats every TILE_LEN
    metres, so any modelled landmark in it would read as an obvious pattern.
    Scenery variety comes from scattered props instead.
    """
    return kit.box('Ground', (300.0, TILE_LEN, 0.20), (0, 0, -0.30), P['Sand'])


BUILDERS = {
    'road': build_road,
    'guardrail': build_guardrail,
    'barrier': build_barrier,
    'ground': build_ground,
}


def build(name, P):
    return BUILDERS[name](P)
