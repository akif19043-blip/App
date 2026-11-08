"""Procedurally draws every NFT trait layer as a transparent 512x512 PNG.
Output: layers/<layer_name>/<trait>.png  (layer folders are numbered for draw order)
"""
import os, random
from PIL import Image, ImageDraw

S = 512
OUT = os.path.join(os.path.dirname(__file__), "layers")
rnd = random.Random(7)


def canvas():
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def save(layer, name, im):
    d = os.path.join(OUT, layer)
    os.makedirs(d, exist_ok=True)
    im.save(os.path.join(d, name + ".png"))


# ---------- 01 Background ----------
BG = {
    "Sunset": ((255, 140, 90), (120, 40, 140)),
    "Ocean": ((40, 160, 220), (10, 40, 110)),
    "Mint": ((170, 240, 210), (60, 170, 150)),
    "Candy": ((255, 170, 215), (160, 130, 255)),
    "Night": ((30, 30, 70), (5, 5, 25)),
    "Lava": ((255, 90, 40), (90, 10, 10)),
    "Forest": ((100, 190, 90), (20, 80, 50)),
    "Gold": ((255, 225, 120), (200, 140, 30)),
    "Lavender": ((200, 180, 255), (110, 90, 190)),
    "Sky": ((170, 220, 255), (90, 150, 230)),
    "Slate": ((120, 130, 145), (50, 55, 70)),
    "Peach": ((255, 210, 180), (240, 150, 140)),
}
for name, (c1, c2) in BG.items():
    im = Image.new("RGBA", (S, S))
    px = im.load()
    for y in range(S):
        t = y / (S - 1)
        c = tuple(int(c1[i] * (1 - t) + c2[i] * t) for i in range(3)) + (255,)
        for x in range(S):
            px[x, y] = c
    ov = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for _ in range(14):  # soft bokeh circles (blended via alpha_composite)
        r = rnd.randint(15, 60)
        x, y = rnd.randint(0, S), rnd.randint(0, S)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, 28))
    im = Image.alpha_composite(im, ov)
    save("01_Background", name, im)

# ---------- 02 Body ----------
SKIN = {
    "Peach": (255, 205, 170), "Tan": (220, 165, 120), "Brown": (150, 100, 70),
    "Blue": (110, 170, 240), "Green": (120, 200, 120), "Purple": (170, 130, 220),
    "Pink": (250, 160, 190), "Ghost": (235, 240, 250), "Zombie": (150, 190, 130),
    "Gold": (240, 200, 70),
}
for name, c in SKIN.items():
    im, d = canvas()
    dark = tuple(int(v * 0.8) for v in c)
    d.rounded_rectangle([200, 380, 312, 470], 30, fill=dark)            # neck
    d.ellipse([110, 110, 402, 440], fill=c, outline=dark, width=6)      # head
    d.ellipse([88, 240, 140, 310], fill=c, outline=dark, width=5)       # ears
    d.ellipse([372, 240, 424, 310], fill=c, outline=dark, width=5)
    d.ellipse([235, 285, 277, 325], fill=dark)                          # nose
    save("02_Body", name, im)

# ---------- 03 Clothes ----------
CLOTH = {
    "Red Hoodie": (210, 50, 60), "Blue Tee": (50, 110, 210), "Green Tee": (50, 160, 90),
    "Black Suit": (30, 30, 35), "White Shirt": (240, 240, 245), "Yellow Jacket": (245, 200, 40),
    "Purple Robe": (120, 60, 170), "Orange Hoodie": (240, 130, 40), "Pink Tee": (240, 120, 170),
    "Space Suit": (200, 205, 215),
}
for name, c in CLOTH.items():
    im, d = canvas()
    dark = tuple(int(v * 0.7) for v in c)
    d.polygon([(40, S), (90, 400), (200, 390), (312, 390), (422, 400), (472, S)], fill=c, outline=dark)
    d.polygon([(200, 390), (256, 440), (312, 390)], fill=dark)          # collar
    if name == "Black Suit":
        d.polygon([(256, 440), (236, 512), (276, 512)], fill=(190, 30, 40))  # tie
    if name.endswith("Hoodie"):
        d.line([(230, 440), (225, 500)], fill=(255, 255, 255), width=5)
        d.line([(282, 440), (287, 500)], fill=(255, 255, 255), width=5)
    if name == "Space Suit":
        d.ellipse([240, 450, 272, 482], fill=(220, 60, 60))
    save("03_Clothes", name, im)

# ---------- 04 Eyes ----------
def eye_pair(draw_one):
    im, d = canvas()
    draw_one(d, 195, 255)
    draw_one(d, 317, 255)
    return im

def e_normal(d, x, y):
    d.ellipse([x - 28, y - 32, x + 28, y + 32], fill="white", outline=(30, 30, 30), width=4)
    d.ellipse([x - 12, y - 14, x + 12, y + 14], fill=(25, 25, 25))
    d.ellipse([x - 6, y - 10, x, y - 3], fill="white")

def e_big(d, x, y):
    d.ellipse([x - 38, y - 42, x + 38, y + 42], fill="white", outline=(30, 30, 30), width=4)
    d.ellipse([x - 20, y - 22, x + 20, y + 22], fill=(40, 90, 200))
    d.ellipse([x - 9, y - 9, x + 9, y + 9], fill=(10, 10, 10))

def e_sleepy(d, x, y):
    d.arc([x - 28, y - 20, x + 28, y + 24], 0, 180, fill=(30, 30, 30), width=7)

def e_happy(d, x, y):
    d.arc([x - 28, y - 10, x + 28, y + 40], 200, 340, fill=(30, 30, 30), width=8)

def e_angry(d, x, y):
    e_normal(d, x, y)
    s = 1 if x < 256 else -1
    d.line([(x - 34 * s, y - 52 + 18 * (s == -1) * 0), (x + 30 * s, y - 28)], fill=(30, 30, 30), width=9)

def e_laser(d, x, y):
    d.ellipse([x - 26, y - 26, x + 26, y + 26], fill=(255, 40, 40), outline=(120, 0, 0), width=4)
    d.ellipse([x - 10, y - 10, x + 10, y + 10], fill=(255, 220, 220))

def e_star(d, x, y):
    import math
    pts = []
    for i in range(10):
        r = 34 if i % 2 == 0 else 15
        a = math.pi / 5 * i - math.pi / 2
        pts.append((x + r * math.cos(a), y + r * math.sin(a)))
    d.polygon(pts, fill=(255, 215, 0), outline=(150, 100, 0))

def e_wink(d, x, y):
    (e_normal if x < 256 else e_happy)(d, x, y)

for name, fn in {"Normal": e_normal, "Big": e_big, "Sleepy": e_sleepy, "Happy": e_happy,
                 "Angry": e_angry, "Laser": e_laser, "Star": e_star, "Wink": e_wink}.items():
    save("04_Eyes", name, eye_pair(fn))

# ---------- 05 Mouth ----------
def mouth(name, fn):
    im, d = canvas()
    fn(d)
    save("05_Mouth", name, im)

ink = (40, 20, 20)
mouth("Smile", lambda d: d.arc([186, 320, 326, 400], 15, 165, fill=ink, width=8))
mouth("Grin", lambda d: (d.chord([176, 330, 336, 410], 0, 180, fill="white", outline=ink, width=6)))
mouth("Frown", lambda d: d.arc([196, 360, 316, 420], 195, 345, fill=ink, width=8))
mouth("Neutral", lambda d: d.line([(206, 372), (306, 372)], fill=ink, width=8))
mouth("Open", lambda d: d.ellipse([226, 345, 286, 405], fill=(90, 20, 30), outline=ink, width=5))
mouth("Tongue", lambda d: (d.arc([186, 320, 326, 400], 15, 165, fill=ink, width=8),
                            d.rounded_rectangle([240, 372, 274, 412], 14, fill=(240, 90, 120))))
mouth("Fangs", lambda d: (d.arc([186, 320, 326, 400], 15, 165, fill=ink, width=8),
                           d.polygon([(215, 372), (230, 372), (222, 395)], fill="white"),
                           d.polygon([(282, 372), (297, 372), (290, 395)], fill="white")))
mouth("Gold Teeth", lambda d: (d.chord([176, 330, 336, 410], 0, 180, fill=(250, 210, 50), outline=ink, width=6)))

# ---------- 06 Hat ----------
def hat(name, fn):
    im, d = canvas()
    if fn:
        fn(d)
    save("06_Hat", name, im)

hat("None", None)
hat("Beanie", lambda d: (d.pieslice([115, 40, 397, 280], 180, 360, fill=(220, 60, 70)),
                          d.rounded_rectangle([112, 150, 400, 185], 12, fill=(160, 30, 40)),
                          d.ellipse([240, 20, 272, 52], fill="white")))
hat("Cap", lambda d: (d.pieslice([115, 50, 397, 290], 180, 360, fill=(40, 100, 220)),
                       d.rounded_rectangle([250, 150, 440, 175], 12, fill=(30, 70, 160))))
hat("Top Hat", lambda d: (d.rounded_rectangle([160, 20, 352, 140], 8, fill=(25, 25, 30)),
                           d.rectangle([160, 100, 352, 125], fill=(180, 30, 40)),
                           d.rounded_rectangle([110, 135, 402, 165], 10, fill=(25, 25, 30))))
hat("Crown", lambda d: (d.polygon([(150, 150), (140, 50), (200, 100), (256, 30), (312, 100), (372, 50), (362, 150)],
                                  fill=(250, 210, 50), outline=(160, 110, 10)),
                         d.ellipse([246, 80, 266, 100], fill=(220, 40, 60))))
hat("Cowboy", lambda d: (d.pieslice([170, 40, 342, 200], 180, 360, fill=(150, 95, 50)),
                          d.ellipse([85, 135, 427, 185], fill=(130, 80, 40))))
hat("Wizard", lambda d: (d.polygon([(256, -10), (150, 160), (362, 160)], fill=(90, 50, 160)),
                          d.ellipse([100, 140, 412, 190], fill=(70, 35, 130)),
                          d.ellipse([245, 70, 267, 92], fill=(255, 230, 90))))
hat("Headband", lambda d: (d.rounded_rectangle([112, 150, 400, 180], 10, fill=(240, 70, 70)),
                            d.polygon([(400, 160), (450, 140), (440, 190)], fill=(240, 70, 70))))
hat("Halo", lambda d: d.ellipse([170, 30, 342, 80], outline=(255, 225, 90), width=12))
hat("Horns", lambda d: (d.polygon([(150, 150), (120, 50), (190, 120)], fill=(200, 40, 40)),
                         d.polygon([(362, 150), (392, 50), (322, 120)], fill=(200, 40, 40))))

# ---------- 07 Accessory ----------
def acc(name, fn):
    im, d = canvas()
    if fn:
        fn(d)
    save("07_Accessory", name, im)

acc("None", None)
acc("Round Glasses", lambda d: (d.ellipse([155, 220, 235, 290], outline=(30, 30, 30), width=7),
                                 d.ellipse([277, 220, 357, 290], outline=(30, 30, 30), width=7),
                                 d.line([(235, 255), (277, 255)], fill=(30, 30, 30), width=7)))
acc("Sunglasses", lambda d: (d.rounded_rectangle([145, 220, 240, 285], 18, fill=(15, 15, 20)),
                              d.rounded_rectangle([272, 220, 367, 285], 18, fill=(15, 15, 20)),
                              d.line([(240, 240), (272, 240)], fill=(15, 15, 20), width=8)))
acc("Mustache", lambda d: (d.pieslice([196, 318, 256, 362], 180, 360, fill=(60, 35, 20)),
                            d.pieslice([256, 318, 316, 362], 180, 360, fill=(60, 35, 20))))
acc("Earring", lambda d: d.ellipse([92, 305, 118, 331], fill=(250, 210, 50), outline=(150, 100, 10), width=3))
acc("Scar", lambda d: (d.line([(160, 190), (205, 300)], fill=(150, 40, 50), width=6),
                        [d.line([(150 + k * 9 + 8, 220 + k * 22), (172 + k * 9 + 8, 214 + k * 22)], fill=(150, 40, 50), width=3) for k in range(4)]))
acc("Blush", lambda d: (d.ellipse([140, 300, 190, 330], fill=(255, 110, 130, 140)),
                         d.ellipse([322, 300, 372, 330], fill=(255, 110, 130, 140))))
acc("Face Paint", lambda d: (d.line([(150, 330), (200, 345)], fill=(60, 120, 255), width=8),
                              d.line([(150, 350), (200, 365)], fill=(60, 120, 255), width=8),
                              d.line([(362, 330), (312, 345)], fill=(60, 120, 255), width=8),
                              d.line([(362, 350), (312, 365)], fill=(60, 120, 255), width=8)))
acc("Gold Chain", lambda d: (d.arc([170, 400, 342, 520], 20, 160, fill=(250, 210, 50), width=9),
                              d.ellipse([240, 490, 272, 522], fill=(250, 210, 50), outline=(150, 100, 10), width=3)))

print("layers written to", OUT)
