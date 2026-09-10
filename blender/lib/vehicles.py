"""
vehicles.py -- every car, truck and bus in the game, generated procedurally.

A vehicle is a lofted body plus bolt-on detail meshes, all joined into a single
`Body` mesh, with the four (or six) wheels left as separate named nodes so the
game can steer and spin them:

    Vehicle            (empty root)
      Body             (paint / glass / trim in one multi-material mesh)
      Wheel_FL .. RR   (origin exactly at the hub, so rotation just works)

The game reads those node names verbatim, so renaming them here breaks it.
"""

import math

from lib import kit
from lib.palette import PAINT_SLOT

# Body material slots, in the order build_body() appends them.
PAINT, GLASS, CHASSIS, TRIM = 0, 1, 2, 3


def sections(rows):
    """Turn compact (y, w, z0, z1, bw, tw, zm, zb) rows into kit sections."""
    return [kit.section(y=r[0], w=r[1], z0=r[2], z1=r[3],
                        bw=r[4], tw=r[5], zm=r[6], zb=r[7]) for r in rows]


def build_body(P, rows, cabin, bevel=0.02, paint=PAINT_SLOT):
    """
    Loft the shell and shade the greenhouse as glass.

    `paint` names the material for the painted panels; it is the shared
    CarPaint slot for everything the game recolours, and its own slot for
    liveries that must not be recoloured.

    `cabin` is the (first, last) section index of the passenger compartment.
    The quad band bridging the section *before* it is the windscreen and the
    one *after* is the rear window -- both fall out of the loft for free, so
    the glazing costs no extra geometry.
    """
    first, last = cabin
    materials = [P[paint], P['Glass'], P['Chassis'], P['Trim']]

    def face_material(i, band):
        if i is None:                                   # end caps
            return PAINT
        if band == kit.BAND_FLOOR:
            return CHASSIS
        if band in (kit.BAND_WINDOW_R, kit.BAND_WINDOW_L) and first <= i < last:
            return GLASS
        if band == kit.BAND_ROOF and i in (first - 1, last):
            return GLASS                                # windscreen / rear glass
        return PAINT

    return kit.loft('Body', sections(rows), materials=materials,
                    face_material=face_material, bevel=bevel)


def wheel(P, name, radius, width, location, rim='Alloy'):
    """Tire + dished rim + hub, joined, origin at the hub centre."""
    parts = [
        kit.cylinder('tire', radius, width, axis='X',
                     segments=14, material=P['Tire']),
        kit.cylinder('rim', radius * 0.66, width * 1.04, axis='X',
                     segments=12, material=P[rim]),
        kit.cylinder('dish', radius * 0.46, width * 1.10, axis='X',
                     segments=10, material=P['AlloyDark']),
        kit.cylinder('hub', radius * 0.17, width * 1.16, axis='X',
                     segments=8, material=P[rim]),
    ]
    obj = kit.join(parts, name)
    obj.location = location
    return obj


def add_wheels(P, spec):
    """
    Place wheels from a spec dict:
        r, w, x, front, rear   (and optional `mid` for six-wheelers)
    Returns the wheel objects, named the way the game expects.
    """
    out = []
    axles = [('F', spec['front']), ('R', spec['rear'])]
    if spec.get('mid') is not None:
        axles.insert(1, ('M', spec['mid']))
    for tag, y in axles:
        for side, sx in (('L', -1.0), ('R', 1.0)):
            out.append(wheel(P, 'Wheel_%s%s' % (tag, side),
                             spec['r'], spec['w'],
                             (sx * spec['x'], y, spec['r']),
                             rim=spec.get('rim', 'Alloy')))
    return out


# --------------------------------------------------------------------------- #
# reusable detail parts
# --------------------------------------------------------------------------- #

def lamps(P, y, x, z, size, material, taper=1.0):
    """Mirrored pair of light blocks."""
    return [kit.box('lamp', size, (sx * x, y, z), P[material], taper=taper)
            for sx in (-1.0, 1.0)]


def mirrors(P, x, y, z, paint=PAINT_SLOT):
    parts = []
    for sx in (-1.0, 1.0):
        parts.append(kit.box('mirror_arm', (0.14, 0.05, 0.04),
                             (sx * (x - 0.05), y, z), P['Trim']))
        parts.append(kit.box('mirror', (0.07, 0.11, 0.09),
                             (sx * (x + 0.06), y, z + 0.02), P[paint]))
    return parts


def exhaust(P, x, y, z, radius=0.05, count=1, spacing=0.13):
    parts = []
    for sx in (-1.0, 1.0):
        for i in range(count):
            offset = (i - (count - 1) / 2.0) * spacing
            parts.append(kit.cylinder('exhaust', radius, 0.20, axis='Y',
                                      location=(sx * x + offset, y, z),
                                      segments=8, material=P['Chrome']))
    return parts


def wing(P, y, z, span, chord=0.30, thickness=0.05, stand=0.0):
    """Rear wing; `stand` > 0 raises it on a pair of stanchions."""
    parts = [kit.box('wing', (span, chord, thickness), (0, y, z + stand),
                     P[PAINT_SLOT], bevel=0.01)]
    if stand > 0:
        for sx in (-1.0, 1.0):
            parts.append(kit.box('stanchion', (0.06, 0.10, stand),
                                 (sx * span * 0.36, y, z + stand / 2.0),
                                 P['Trim']))
    return parts


def light_bar(P, y, z, width, material='LightRed', depth=0.07, height=0.09):
    """Full-width strip, used for modern-looking tail lights."""
    return kit.box('light_bar', (width, depth, height), (0, y, z), P[material])


# --------------------------------------------------------------------------- #
# player cars
# --------------------------------------------------------------------------- #

def car_sport(P):
    """Compact rear-drive coupe -- the starter car. Balanced, forgiving."""
    rows = [
        (-2.15, 0.66, 0.34, 0.80, 0.50, 0.54, 0.54, 0.76),
        (-1.95, 0.86, 0.26, 0.90, 0.62, 0.74, 0.52, 0.86),
        (-1.50, 0.92, 0.24, 0.94, 0.60, 0.80, 0.50, 0.90),
        (-1.18, 0.90, 0.24, 1.30, 0.62, 0.72, 0.52, 0.94),
        (-0.50, 0.90, 0.24, 1.34, 0.64, 0.74, 0.54, 0.96),
        ( 0.14, 0.90, 0.24, 1.30, 0.64, 0.74, 0.54, 0.96),
        ( 0.66, 0.92, 0.24, 0.94, 0.64, 0.80, 0.52, 0.90),
        ( 1.38, 0.90, 0.26, 0.88, 0.62, 0.78, 0.52, 0.84),
        ( 1.92, 0.84, 0.30, 0.84, 0.56, 0.68, 0.52, 0.80),
        ( 2.15, 0.68, 0.36, 0.78, 0.50, 0.56, 0.54, 0.74),
    ]
    body = build_body(P, rows, cabin=(3, 5))
    details = []
    details += lamps(P, 2.12, 0.50, 0.66, (0.30, 0.10, 0.13), 'LightWhite')
    details += lamps(P, -2.13, 0.45, 0.70, (0.32, 0.08, 0.11), 'LightRed')
    details.append(kit.box('grille', (0.80, 0.08, 0.16),
                           (0, 2.14, 0.50), P['Trim']))
    details.append(kit.box('splitter', (1.34, 0.34, 0.06),
                           (0, 2.04, 0.31), P['Chassis']))
    details.append(kit.box('diffuser', (1.24, 0.30, 0.09),
                           (0, -2.04, 0.31), P['Chassis']))
    for sx in (-1.0, 1.0):
        details.append(kit.box('skirt', (0.09, 2.10, 0.09),
                               (sx * 0.90, 0.0, 0.27), P['Chassis']))
    details += mirrors(P, 0.94, 0.52, 1.00)
    details += exhaust(P, 0.32, -2.18, 0.36)
    details += wing(P, -1.86, 0.96, 1.42, chord=0.26, thickness=0.06)
    return kit.join([body] + details, 'Body'), dict(
        r=0.33, w=0.24, x=0.80, front=1.42, rear=-1.42)


def car_muscle(P):
    """Long-hood muscle car -- heavy, fast in a straight line, lazy steering."""
    rows = [
        (-2.45, 0.72, 0.36, 0.86, 0.56, 0.62, 0.56, 0.82),
        (-2.20, 0.94, 0.28, 0.98, 0.68, 0.84, 0.54, 0.94),
        (-1.70, 0.97, 0.26, 1.00, 0.66, 0.88, 0.52, 0.96),
        (-1.30, 0.95, 0.26, 1.40, 0.68, 0.80, 0.54, 1.00),
        (-0.60, 0.95, 0.26, 1.44, 0.70, 0.82, 0.56, 1.02),
        ( 0.10, 0.95, 0.26, 1.42, 0.70, 0.82, 0.56, 1.02),
        ( 0.55, 0.97, 0.26, 1.06, 0.70, 0.88, 0.54, 1.02),
        ( 1.50, 0.95, 0.28, 1.02, 0.68, 0.86, 0.54, 0.98),
        ( 2.15, 0.90, 0.30, 0.98, 0.62, 0.76, 0.54, 0.94),
        ( 2.45, 0.74, 0.36, 0.90, 0.56, 0.62, 0.56, 0.86),
    ]
    body = build_body(P, rows, cabin=(3, 5))
    details = []
    details += lamps(P, 2.42, 0.56, 0.74, (0.26, 0.10, 0.20), 'LightWhite')
    details += lamps(P, -2.42, 0.50, 0.78, (0.34, 0.08, 0.16), 'LightRed')
    details.append(kit.box('grille', (1.10, 0.09, 0.22),
                           (0, 2.44, 0.72), P['Trim']))
    details.append(kit.box('bumper_f', (1.60, 0.16, 0.14),
                           (0, 2.42, 0.48), P['Chrome'], bevel=0.02))
    details.append(kit.box('bumper_r', (1.56, 0.16, 0.14),
                           (0, -2.42, 0.50), P['Chrome'], bevel=0.02))
    details.append(kit.box('scoop', (0.50, 0.56, 0.10),
                           (0, 1.60, 1.04), P['Chassis'], taper=0.78))
    details += mirrors(P, 0.99, 0.40, 1.12)
    details += exhaust(P, 0.46, -2.50, 0.38, radius=0.06, count=2, spacing=0.15)
    details += wing(P, -2.05, 1.02, 1.56, chord=0.30, thickness=0.06, stand=0.18)
    return kit.join([body] + details, 'Body'), dict(
        r=0.36, w=0.28, x=0.84, front=1.60, rear=-1.62)


def car_super(P):
    """Mid-engine wedge -- the endgame car. Very fast, very sharp."""
    rows = [
        (-2.25, 0.78, 0.30, 0.78, 0.62, 0.66, 0.48, 0.74),
        (-2.05, 0.98, 0.24, 0.88, 0.72, 0.86, 0.46, 0.84),
        (-1.55, 1.00, 0.22, 0.94, 0.70, 0.88, 0.44, 0.90),
        (-1.25, 0.96, 0.22, 1.18, 0.70, 0.74, 0.46, 0.86),
        (-0.60, 0.94, 0.22, 1.22, 0.72, 0.74, 0.48, 0.88),
        ( 0.20, 0.94, 0.22, 1.16, 0.72, 0.76, 0.48, 0.86),
        ( 0.70, 0.98, 0.22, 0.80, 0.72, 0.86, 0.46, 0.76),
        ( 1.45, 0.96, 0.24, 0.72, 0.70, 0.84, 0.44, 0.68),
        ( 2.00, 0.88, 0.26, 0.66, 0.62, 0.72, 0.42, 0.62),
        ( 2.25, 0.70, 0.30, 0.60, 0.54, 0.58, 0.42, 0.56),
    ]
    body = build_body(P, rows, cabin=(3, 5), bevel=0.015)
    details = []
    details += lamps(P, 2.18, 0.56, 0.56, (0.34, 0.10, 0.10), 'LightWhite')
    details.append(light_bar(P, -2.24, 0.68, 1.30))
    details.append(kit.box('splitter', (1.52, 0.40, 0.05),
                           (0, 2.10, 0.26), P['Chassis']))
    details.append(kit.box('diffuser', (1.44, 0.38, 0.12),
                           (0, -2.14, 0.30), P['Chassis']))
    for sx in (-1.0, 1.0):
        details.append(kit.box('intake', (0.10, 0.80, 0.20),
                               (sx * 0.97, -0.85, 0.62), P['Chassis']))
        details.append(kit.box('skirt', (0.10, 2.20, 0.08),
                               (sx * 0.96, -0.10, 0.24), P['Chassis']))
        details.append(kit.box('vent', (0.34, 0.44, 0.03),
                               (sx * 0.48, 1.30, 0.72), P['Chassis']))
    details += mirrors(P, 1.00, 0.55, 0.96)
    details += exhaust(P, 0.26, -2.28, 0.40, radius=0.055, count=2, spacing=0.13)
    details += wing(P, -2.00, 1.06, 1.66, chord=0.34, thickness=0.05, stand=0.22)
    return kit.join([body] + details, 'Body'), dict(
        r=0.35, w=0.30, x=0.86, front=1.45, rear=-1.48)


# --------------------------------------------------------------------------- #
# traffic
# --------------------------------------------------------------------------- #

def traffic_sedan(P):
    rows = [
        (-2.30, 0.70, 0.32, 0.90, 0.54, 0.60, 0.54, 0.86),
        (-2.10, 0.88, 0.26, 1.00, 0.64, 0.80, 0.52, 0.96),
        (-1.55, 0.90, 0.24, 1.04, 0.62, 0.82, 0.50, 0.98),
        (-1.15, 0.88, 0.24, 1.44, 0.64, 0.76, 0.52, 1.02),
        (-0.35, 0.88, 0.24, 1.48, 0.66, 0.78, 0.54, 1.04),
        ( 0.45, 0.88, 0.24, 1.44, 0.66, 0.78, 0.54, 1.04),
        ( 0.90, 0.90, 0.24, 1.06, 0.66, 0.82, 0.52, 1.02),
        ( 1.70, 0.88, 0.26, 1.00, 0.62, 0.78, 0.52, 0.96),
        ( 2.14, 0.82, 0.30, 0.94, 0.56, 0.68, 0.52, 0.90),
        ( 2.30, 0.68, 0.34, 0.88, 0.52, 0.58, 0.54, 0.84),
    ]
    body = build_body(P, rows, cabin=(3, 5))
    details = []
    details += lamps(P, 2.27, 0.52, 0.74, (0.30, 0.09, 0.14), 'LightWhite')
    details += lamps(P, -2.27, 0.48, 0.78, (0.32, 0.08, 0.13), 'LightRed')
    details.append(kit.box('grille', (0.86, 0.07, 0.14),
                           (0, 2.29, 0.56), P['Trim']))
    details += mirrors(P, 0.92, 0.62, 1.14)
    details += exhaust(P, 0.36, -2.32, 0.36, radius=0.045)
    return kit.join([body] + details, 'Body'), dict(
        r=0.32, w=0.24, x=0.79, front=1.48, rear=-1.50)


def traffic_hatch(P):
    rows = [
        (-1.90, 0.68, 0.30, 0.96, 0.54, 0.60, 0.52, 0.92),
        (-1.76, 0.86, 0.24, 1.30, 0.64, 0.76, 0.50, 1.00),
        (-1.40, 0.87, 0.24, 1.46, 0.62, 0.76, 0.50, 1.02),
        (-1.05, 0.86, 0.24, 1.50, 0.64, 0.76, 0.52, 1.04),
        (-0.30, 0.86, 0.24, 1.52, 0.66, 0.78, 0.54, 1.06),
        ( 0.35, 0.86, 0.24, 1.48, 0.66, 0.78, 0.54, 1.06),
        ( 0.72, 0.88, 0.24, 1.06, 0.66, 0.80, 0.52, 1.02),
        ( 1.40, 0.86, 0.26, 1.00, 0.62, 0.76, 0.52, 0.96),
        ( 1.80, 0.80, 0.30, 0.94, 0.56, 0.66, 0.52, 0.90),
        ( 1.94, 0.66, 0.34, 0.88, 0.52, 0.56, 0.54, 0.84),
    ]
    body = build_body(P, rows, cabin=(3, 5))
    details = []
    details += lamps(P, 1.91, 0.48, 0.74, (0.28, 0.09, 0.16), 'LightWhite')
    details += lamps(P, -1.88, 0.46, 1.02, (0.24, 0.08, 0.22), 'LightRed')
    details.append(kit.box('grille', (0.78, 0.07, 0.12),
                           (0, 1.93, 0.56), P['Trim']))
    details += mirrors(P, 0.90, 0.52, 1.18)
    return kit.join([body] + details, 'Body'), dict(
        r=0.31, w=0.22, x=0.78, front=1.22, rear=-1.24)


def traffic_suv(P):
    rows = [
        (-2.42, 0.76, 0.42, 1.10, 0.60, 0.66, 0.66, 1.06),
        (-2.26, 0.94, 0.36, 1.52, 0.72, 0.86, 0.64, 1.18),
        (-1.70, 0.96, 0.34, 1.72, 0.70, 0.86, 0.62, 1.22),
        (-1.25, 0.95, 0.34, 1.76, 0.72, 0.84, 0.64, 1.24),
        (-0.30, 0.95, 0.34, 1.78, 0.74, 0.86, 0.66, 1.26),
        ( 0.55, 0.95, 0.34, 1.74, 0.74, 0.86, 0.66, 1.26),
        ( 1.00, 0.96, 0.34, 1.30, 0.74, 0.88, 0.64, 1.24),
        ( 1.80, 0.94, 0.36, 1.24, 0.70, 0.84, 0.64, 1.18),
        ( 2.28, 0.88, 0.40, 1.18, 0.64, 0.74, 0.64, 1.12),
        ( 2.44, 0.74, 0.44, 1.10, 0.58, 0.62, 0.66, 1.06),
    ]
    body = build_body(P, rows, cabin=(3, 5))
    details = []
    details += lamps(P, 2.41, 0.56, 0.94, (0.30, 0.09, 0.16), 'LightWhite')
    details += lamps(P, -2.39, 0.52, 1.20, (0.26, 0.08, 0.26), 'LightRed')
    details.append(kit.box('grille', (1.00, 0.08, 0.20),
                           (0, 2.43, 0.72), P['Trim']))
    details.append(kit.box('roof_rail_l', (0.06, 2.20, 0.06),
                           (-0.70, -0.20, 1.80), P['Trim']))
    details.append(kit.box('roof_rail_r', (0.06, 2.20, 0.06),
                           (0.70, -0.20, 1.80), P['Trim']))
    details.append(kit.box('bumper_f', (1.72, 0.14, 0.22),
                           (0, 2.42, 0.52), P['Chassis']))
    details.append(kit.box('bumper_r', (1.68, 0.14, 0.22),
                           (0, -2.40, 0.54), P['Chassis']))
    details += mirrors(P, 0.99, 0.70, 1.34)
    return kit.join([body] + details, 'Body'), dict(
        r=0.40, w=0.28, x=0.84, front=1.55, rear=-1.58)


def traffic_truck(P):
    """Cab-over box truck: short glazed cab plus a tall cargo body, 6 wheels."""
    rows = [
        (0.20, 1.10, 0.70, 2.50, 0.92, 1.02, 1.10, 2.44),
        (0.60, 1.12, 0.66, 2.56, 0.94, 1.04, 1.08, 1.70),
        (1.90, 1.12, 0.64, 2.56, 0.94, 1.04, 1.06, 1.68),
        (2.30, 1.06, 0.68, 2.46, 0.88, 0.96, 1.08, 2.40),
    ]
    cab = build_body(P, rows, cabin=(1, 3), bevel=0.03)

    details = [
        kit.box('cargo', (2.30, 5.60, 2.60), (0, -2.70, 1.90),
                P[PAINT_SLOT], bevel=0.03),
        kit.box('cargo_floor', (2.34, 5.64, 0.16), (0, -2.70, 0.58),
                P['Chassis']),
        kit.box('frame', (0.70, 7.80, 0.22), (0, -1.20, 0.52), P['Chassis']),
        kit.box('grille', (1.40, 0.10, 0.34), (0, 2.32, 1.00), P['Trim']),
        kit.box('bumper', (2.10, 0.20, 0.30), (0, 2.34, 0.62), P['Chassis']),
        kit.box('sun_visor', (2.00, 0.26, 0.10), (0, 2.20, 2.58), P['Trim']),
    ]
    details += lamps(P, 2.32, 0.82, 0.74, (0.34, 0.10, 0.20), 'LightWhite')
    details += lamps(P, -5.48, 0.86, 0.90, (0.28, 0.09, 0.24), 'LightRed')
    details += lamps(P, 2.30, 1.06, 1.90, (0.10, 0.10, 0.10), 'LightAmber')
    for sx in (-1.0, 1.0):
        details.append(kit.box('tank', (0.30, 1.00, 0.34),
                               (sx * 1.10, -0.30, 0.72), P['Metal']))
        details.append(kit.box('mirror_arm', (0.34, 0.05, 0.05),
                               (sx * 1.28, 2.10, 1.95), P['Trim']))
        details.append(kit.box('mirror', (0.08, 0.14, 0.30),
                               (sx * 1.46, 2.10, 1.90), P['Trim']))
    return kit.join([cab] + details, 'Body'), dict(
        r=0.50, w=0.32, x=1.00, front=1.55, mid=-3.10, rear=-4.20,
        rim='AlloyDark')


def traffic_bus(P):
    """Long single-deck coach: the cabin band runs almost the whole length."""
    rows = [
        (-5.60, 1.16, 0.46, 3.00, 0.98, 1.06, 0.90, 2.90),
        (-5.30, 1.24, 0.42, 3.10, 1.06, 1.14, 0.86, 2.10),
        (-2.00, 1.25, 0.40, 3.14, 1.06, 1.15, 0.84, 2.12),
        ( 2.00, 1.25, 0.40, 3.14, 1.06, 1.15, 0.84, 2.12),
        ( 4.90, 1.24, 0.42, 3.10, 1.04, 1.12, 0.86, 2.08),
        ( 5.30, 1.16, 0.48, 3.00, 0.96, 1.04, 0.90, 1.60),
        ( 5.60, 1.08, 0.54, 2.90, 0.90, 0.96, 0.92, 2.80),
    ]
    body = build_body(P, rows, cabin=(1, 5), bevel=0.03)
    details = [
        kit.box('skirt', (2.44, 10.60, 0.36), (0, -0.20, 0.44), P['Chassis']),
        kit.box('bumper_f', (2.30, 0.18, 0.34), (0, 5.62, 0.66), P['Chassis']),
        kit.box('bumper_r', (2.30, 0.18, 0.34), (0, -5.62, 0.62), P['Chassis']),
        kit.box('roof_ac', (1.40, 2.20, 0.22), (0, 1.60, 3.22), P['Sign']),
        kit.box('stripe', (2.52, 10.20, 0.14), (0, 0.0, 1.30), P['Trim']),
    ]
    details += lamps(P, 5.58, 0.86, 0.80, (0.32, 0.10, 0.18), 'LightWhite')
    details += lamps(P, -5.62, 0.90, 0.86, (0.30, 0.09, 0.20), 'LightRed')
    for sx in (-1.0, 1.0):
        details.append(kit.box('mirror_arm', (0.30, 0.05, 0.05),
                               (sx * 1.32, 5.20, 2.30), P['Trim']))
        details.append(kit.box('mirror', (0.08, 0.12, 0.34),
                               (sx * 1.48, 5.20, 2.24), P['Trim']))
    return kit.join([body] + details, 'Body'), dict(
        r=0.50, w=0.30, x=1.06, front=4.10, mid=-3.30, rear=-4.40,
        rim='AlloyDark')


def traffic_police(P):
    """
    Patrol car: the sedan shell in a fixed livery, with a light bar.

    The bar's two lamps use their own shared materials, so the game can flash
    every patrol car on the map by writing two emissiveIntensity values --
    the same trick the traffic signals use.
    """
    rows = [
        (-2.30, 0.70, 0.32, 0.90, 0.54, 0.60, 0.54, 0.86),
        (-2.10, 0.88, 0.26, 1.00, 0.64, 0.80, 0.52, 0.96),
        (-1.55, 0.90, 0.24, 1.04, 0.62, 0.82, 0.50, 0.98),
        (-1.15, 0.88, 0.24, 1.44, 0.64, 0.76, 0.52, 1.02),
        (-0.35, 0.88, 0.24, 1.48, 0.66, 0.78, 0.54, 1.04),
        ( 0.45, 0.88, 0.24, 1.44, 0.66, 0.78, 0.54, 1.04),
        ( 0.90, 0.90, 0.24, 1.06, 0.66, 0.82, 0.52, 1.02),
        ( 1.70, 0.88, 0.26, 1.00, 0.62, 0.78, 0.52, 0.96),
        ( 2.14, 0.82, 0.30, 0.94, 0.56, 0.68, 0.52, 0.90),
        ( 2.30, 0.68, 0.34, 0.88, 0.52, 0.58, 0.54, 0.84),
    ]
    body = build_body(P, rows, cabin=(3, 5), paint='PoliceBody')
    details = []
    details += lamps(P, 2.27, 0.52, 0.74, (0.30, 0.09, 0.14), 'LightWhite')
    details += lamps(P, -2.27, 0.48, 0.78, (0.32, 0.08, 0.13), 'LightRed')
    details.append(kit.box('grille', (0.86, 0.07, 0.14),
                           (0, 2.29, 0.56), P['Trim']))
    details += mirrors(P, 0.92, 0.62, 1.14)

    # door stripe down each flank, and a bonnet flash
    for side in (-1, 1):
        details.append(kit.box('stripe', (0.06, 2.40, 0.30),
                               (side * 0.92, -0.10, 0.72), P['PoliceStripe']))
    details.append(kit.box('bonnet_flash', (0.70, 0.90, 0.04),
                           (0, 1.66, 1.00), P['PoliceStripe']))

    # light bar: a dark plinth with a red half and a blue half
    details.append(kit.box('bar_base', (1.22, 0.26, 0.06),
                           (0, 0.30, 1.33), P['Trim']))
    for side, material in ((-1, 'PoliceRed'), (1, 'PoliceBlue')):
        details.append(kit.box('bar_lamp', (0.52, 0.22, 0.11),
                               (side * 0.30, 0.30, 1.41), P[material]))
    details.append(kit.box('bar_cap', (1.26, 0.28, 0.03),
                           (0, 0.30, 1.48), P['Trim']))

    # push bar, so it reads as a patrol car head-on
    details.append(kit.box('push_bar', (1.30, 0.07, 0.10),
                           (0, 2.36, 0.50), P['AlloyDark']))
    for side in (-1, 1):
        details.append(kit.box('push_strut', (0.08, 0.10, 0.42),
                               (side * 0.52, 2.34, 0.44), P['AlloyDark']))

    details += exhaust(P, 0.36, -2.32, 0.36, radius=0.045)
    return kit.join([body] + details, 'Body'), dict(
        r=0.32, w=0.24, x=0.79, front=1.48, rear=-1.50)


def car_hatch(P):
    """Small three-door hatch -- cheap, slow, and easy to place in a gap."""
    rows = [
        (-1.86, 0.68, 0.30, 0.94, 0.54, 0.60, 0.52, 0.90),
        (-1.72, 0.86, 0.24, 1.26, 0.64, 0.76, 0.50, 0.98),
        (-1.34, 0.87, 0.24, 1.42, 0.62, 0.74, 0.50, 1.00),
        (-1.00, 0.86, 0.24, 1.46, 0.64, 0.74, 0.52, 1.02),
        (-0.26, 0.86, 0.24, 1.48, 0.66, 0.76, 0.54, 1.04),
        ( 0.38, 0.86, 0.24, 1.44, 0.66, 0.76, 0.54, 1.04),
        ( 0.74, 0.88, 0.24, 1.02, 0.66, 0.80, 0.52, 0.98),
        ( 1.36, 0.86, 0.26, 0.96, 0.62, 0.76, 0.52, 0.92),
        ( 1.76, 0.80, 0.30, 0.90, 0.56, 0.66, 0.52, 0.86),
        ( 1.90, 0.66, 0.34, 0.84, 0.52, 0.56, 0.54, 0.80),
    ]
    body = build_body(P, rows, cabin=(3, 5))
    details = []
    details += lamps(P, 1.87, 0.48, 0.70, (0.28, 0.09, 0.16), 'LightWhite')
    details += lamps(P, -1.84, 0.46, 0.98, (0.22, 0.08, 0.24), 'LightRed')
    details.append(kit.box('grille', (0.74, 0.07, 0.12),
                           (0, 1.89, 0.52), P['Trim']))
    details.append(kit.box('spoiler', (1.30, 0.24, 0.05),
                           (0, -1.74, 1.44), P[PAINT_SLOT], bevel=0.01))
    for sx in (-1.0, 1.0):
        details.append(kit.box('skirt', (0.08, 1.90, 0.08),
                               (sx * 0.87, 0.0, 0.27), P['Chassis']))
    details += mirrors(P, 0.90, 0.50, 1.14)
    details += exhaust(P, 0.30, -1.88, 0.34, radius=0.04)
    return kit.join([body] + details, 'Body'), dict(
        r=0.30, w=0.22, x=0.78, front=1.18, rear=-1.20)


def car_van(P):
    """
    Panel van. Slow and tall, but it is the one that pays: the game gives it a
    higher delivery multiplier, so it is worth owning even though it loses
    every race.
    """
    rows = [
        (-2.72, 0.86, 0.34, 1.10, 0.68, 0.74, 0.60, 1.06),
        (-2.58, 1.02, 0.30, 2.26, 0.82, 0.94, 0.58, 2.20),
        (-1.40, 1.04, 0.28, 2.34, 0.82, 0.96, 0.56, 2.28),
        (-0.20, 1.04, 0.28, 2.34, 0.84, 0.96, 0.58, 2.26),
        ( 0.55, 1.03, 0.28, 2.30, 0.84, 0.94, 0.58, 1.42),
        ( 1.30, 1.02, 0.28, 2.20, 0.82, 0.92, 0.58, 1.40),
        ( 1.95, 0.98, 0.30, 1.90, 0.76, 0.86, 0.58, 1.30),
        ( 2.35, 0.90, 0.34, 1.44, 0.68, 0.76, 0.60, 1.24),
        ( 2.52, 0.76, 0.38, 1.16, 0.58, 0.64, 0.62, 1.10),
    ]
    # The cabin band is the windscreen and door glass only; the box behind it
    # stays painted, which is what makes it read as a van and not a minibus.
    body = build_body(P, rows, cabin=(5, 7), bevel=0.03)
    details = []
    details += lamps(P, 2.48, 0.60, 0.92, (0.30, 0.10, 0.22), 'LightWhite')
    details += lamps(P, -2.66, 0.66, 1.10, (0.26, 0.09, 0.30), 'LightRed')
    details.append(kit.box('grille', (1.02, 0.08, 0.22),
                           (0, 2.50, 1.20), P['Trim']))
    details.append(kit.box('bumper_f', (1.80, 0.16, 0.24),
                           (0, 2.50, 0.62), P['Chassis']))
    details.append(kit.box('bumper_r', (1.86, 0.16, 0.24),
                           (0, -2.66, 0.60), P['Chassis']))
    details.append(kit.box('door_seam', (2.10, 0.04, 1.60),
                           (0, -2.62, 1.40), P['Trim']))
    for sx in (-1.0, 1.0):
        details.append(kit.box('flank', (0.06, 3.40, 0.34),
                               (sx * 1.05, -0.60, 1.06), P['Trim']))
    details += mirrors(P, 1.08, 1.60, 1.66)
    return kit.join([body] + details, 'Body'), dict(
        r=0.38, w=0.26, x=0.90, front=1.60, rear=-1.70)


BUILDERS = {
    'car_hatch': car_hatch,
    'car_sport': car_sport,
    'car_van': car_van,
    'car_muscle': car_muscle,
    'car_super': car_super,
    'traffic_sedan': traffic_sedan,
    'traffic_hatch': traffic_hatch,
    'traffic_suv': traffic_suv,
    'traffic_truck': traffic_truck,
    'traffic_bus': traffic_bus,
    'traffic_police': traffic_police,
}


def build(name, P):
    """Build one vehicle into the current scene; returns its root empty."""
    body, wheel_spec = BUILDERS[name](P)
    root = kit.empty('Vehicle')
    kit.parent(body, root)
    for w in add_wheels(P, wheel_spec):
        kit.parent(w, root)
    return root
