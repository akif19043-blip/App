"""
palette.py -- the single shared material set for every generated asset.

Colours are authored as sRGB hex and converted to linear, which is what
Blender's Principled inputs and glTF's baseColorFactor both expect.

`CarPaint` is deliberately one shared slot name: the game finds it by name in
the loaded glTF and clones/recolours it per vehicle instance, so a dozen
traffic colours cost one mesh and zero extra downloads.
"""

from lib import kit

PAINT_SLOT = 'CarPaint'


def build():
    """Create every material in the current scene and return them by name."""
    h = kit.hex_color
    spec = {
        # vehicles
        PAINT_SLOT:   dict(color='#c62828', metallic=0.25, roughness=0.42),
        'Glass':      dict(color='#131c26', metallic=0.60, roughness=0.10),
        'Tire':       dict(color='#101215', metallic=0.00, roughness=0.88),
        'Alloy':      dict(color='#c3c9d2', metallic=0.95, roughness=0.28),
        'AlloyDark':  dict(color='#23272e', metallic=0.70, roughness=0.45),
        'Chassis':    dict(color='#0d0f12', metallic=0.20, roughness=0.70),
        'Trim':       dict(color='#1c1f24', metallic=0.30, roughness=0.55),
        'Chrome':     dict(color='#dde2e8', metallic=1.00, roughness=0.14),
        'LightWhite': dict(color='#fff4d8', roughness=0.15,
                           emission='#fff1cc', emission_strength=5.0),
        'LightRed':   dict(color='#c4160c', roughness=0.20,
                           emission='#ff2a18', emission_strength=4.0),
        'LightAmber': dict(color='#c96a06', roughness=0.20,
                           emission='#ff9d1c', emission_strength=3.0),
        # road
        'Asphalt':    dict(color='#34393f', metallic=0.00, roughness=0.82),
        'LineWhite':  dict(color='#e8ecef', roughness=0.55),
        'LineYellow': dict(color='#d9a52f', roughness=0.55),
        'Shoulder':   dict(color='#3a3227', metallic=0.00, roughness=0.90),
        'Concrete':   dict(color='#8b9199', metallic=0.00, roughness=0.75),
        # scenery
        'Sand':       dict(color='#bf9663', metallic=0.00, roughness=0.90),
        'Rock':       dict(color='#8a6446', metallic=0.00, roughness=0.85),
        'RockDark':   dict(color='#6d4d36', metallic=0.00, roughness=0.85),
        'Foliage':    dict(color='#4b7a3a', metallic=0.00, roughness=0.75),
        'Cactus':     dict(color='#3f7a46', metallic=0.00, roughness=0.70),
        'Wood':       dict(color='#5b4630', metallic=0.00, roughness=0.80),
        'Metal':      dict(color='#767d86', metallic=0.85, roughness=0.40),
        'Sign':       dict(color='#e6e9ec', roughness=0.60),
        'SignFace':   dict(color='#1f6fb2', roughness=0.55,
                           emission='#1b5c94', emission_strength=0.8),
        'Cone':       dict(color='#e2571f', roughness=0.60,
                           emission='#c9430f', emission_strength=0.5),
        # city
        'Kerb':       dict(color='#6f757c', metallic=0.00, roughness=0.80),
        'Sidewalk':   dict(color='#9aa0a6', metallic=0.00, roughness=0.82),
        'BuildingA':  dict(color='#c2b09a', metallic=0.00, roughness=0.78),
        'BuildingB':  dict(color='#8d9cab', metallic=0.05, roughness=0.70),
        'BuildingC':  dict(color='#a86f61', metallic=0.00, roughness=0.80),
        'Window':     dict(color='#1b2836', metallic=0.55, roughness=0.16,
                           emission='#ffcf8a', emission_strength=0.45),
        'Roof':       dict(color='#4a5058', metallic=0.10, roughness=0.85),
        'Grass':      dict(color='#4e7d3f', metallic=0.00, roughness=0.88),
        'Beacon':     dict(color='#8ef06a', roughness=0.25,
                           emission='#a6ff7a', emission_strength=3.5),
        # Traffic signals. One material per lamp per axis, shared by every
        # post on the map: the game switches the whole city by setting
        # emissiveIntensity on these six, with no per-instance cloning.
        'SignalX_Red':   dict(color='#3a0d0a', roughness=0.30,
                              emission='#ff2a18', emission_strength=1.0),
        'SignalX_Amber': dict(color='#3a2408', roughness=0.30,
                              emission='#ffa41c', emission_strength=1.0),
        'SignalX_Green': dict(color='#0b3a16', roughness=0.30,
                              emission='#3cff72', emission_strength=1.0),
        'SignalZ_Red':   dict(color='#3a0d0a', roughness=0.30,
                              emission='#ff2a18', emission_strength=1.0),
        'SignalZ_Amber': dict(color='#3a2408', roughness=0.30,
                              emission='#ffa41c', emission_strength=1.0),
        'SignalZ_Green': dict(color='#0b3a16', roughness=0.30,
                              emission='#3cff72', emission_strength=1.0),
        # Police. The body is its own slot rather than the shared CarPaint,
        # so a patrol car cannot come out of the traffic tint in pink; the
        # two bar lamps are shared materials like the signals, so the game
        # flashes every patrol car in the city with two writes a frame.
        'PoliceBody':   dict(color='#eceff2', metallic=0.15, roughness=0.42),
        'PoliceStripe': dict(color='#16305c', metallic=0.10, roughness=0.50),
        'PoliceRed':    dict(color='#3a0d0a', roughness=0.30,
                             emission='#ff2a18', emission_strength=1.0),
        'PoliceBlue':   dict(color='#0a1a3a', roughness=0.30,
                             emission='#3d7bff', emission_strength=1.0),
        # pedestrians
        'Skin':       dict(color='#c98d63', metallic=0.00, roughness=0.72),
        'Shirt':      dict(color='#3f7fd0', metallic=0.00, roughness=0.75),
        'Trousers':   dict(color='#2f3540', metallic=0.00, roughness=0.80),
        # pickups
        'Gold':       dict(color='#ffc233', metallic=0.90, roughness=0.22,
                           emission='#ffae1a', emission_strength=1.6),
        'GoldDark':   dict(color='#c98c12', metallic=0.90, roughness=0.30),
        'Nitro':      dict(color='#2fd2ff', metallic=0.30, roughness=0.20,
                           emission='#39dcff', emission_strength=6.0),
        'NitroShell': dict(color='#d8dee4', metallic=0.70, roughness=0.30),
        'LampGlow':   dict(color='#ffe6a8', roughness=0.20,
                           emission='#ffd98a', emission_strength=9.0),
    }

    out = {}
    for name, kwargs in spec.items():
        emission = kwargs.pop('emission', None)
        out[name] = kit.mat(
            name,
            h(kwargs.pop('color')),
            emission=None if emission is None else h(emission),
            **kwargs,
        )
    return out
