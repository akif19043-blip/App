"""Composes N unique NFTs from the layer folders with rarity weights.

Usage: python generate.py [--count 10000] [--seed 1] [--out build]
Output: build/images/<id>.png, build/metadata/<id>.json, build/metadata.json
"""
import argparse, json, os, random, hashlib
from multiprocessing import Pool
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
LAYERS = os.path.join(HERE, "layers")

# rarity weights per trait name; anything not listed gets weight 10
WEIGHTS = {
    "06_Hat": {"None": 30, "Crown": 2, "Halo": 3, "Horns": 4, "Wizard": 4},
    "07_Accessory": {"None": 40, "Gold Chain": 3, "Scar": 5, "Face Paint": 6},
    "02_Body": {"Gold": 1, "Ghost": 4, "Zombie": 5},
    "04_Eyes": {"Laser": 3, "Star": 4},
    "05_Mouth": {"Gold Teeth": 3, "Fangs": 5},
    "01_Background": {"Gold": 3},
}


def load_traits():
    order = sorted(os.listdir(LAYERS))
    traits = {}
    for layer in order:
        names = sorted(f[:-4] for f in os.listdir(os.path.join(LAYERS, layer)) if f.endswith(".png"))
        w = [WEIGHTS.get(layer, {}).get(n, 10) for n in names]
        traits[layer] = (names, w)
    return order, traits


def render(job):
    idx, combo, out = job
    im = None
    for layer, name in combo:
        l = Image.open(os.path.join(LAYERS, layer, name + ".png")).convert("RGBA")
        im = l if im is None else Image.alpha_composite(im, l)
    im.convert("RGB").save(os.path.join(out, "images", f"{idx}.png"), optimize=False)
    return idx


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=10000)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", default=os.path.join(HERE, "build"))
    ap.add_argument("--name", default="My NFT")
    a = ap.parse_args()

    order, traits = load_traits()
    total = 1
    for n, _ in traits.values():
        total *= len(n)
    assert a.count <= total, f"only {total} unique combinations possible"

    os.makedirs(os.path.join(a.out, "images"), exist_ok=True)
    os.makedirs(os.path.join(a.out, "metadata"), exist_ok=True)
    rnd = random.Random(a.seed)

    seen, combos = set(), []
    while len(combos) < a.count:
        pick = tuple(rnd.choices(traits[l][0], traits[l][1])[0] for l in order)
        if pick in seen:
            continue
        seen.add(pick)
        combos.append(pick)

    jobs = [(i + 1, list(zip(order, c)), a.out) for i, c in enumerate(combos)]
    with Pool() as p:
        for n, _ in enumerate(p.imap_unordered(render, jobs, chunksize=50), 1):
            if n % 1000 == 0:
                print(f"{n}/{a.count}")

    allmeta, counts = [], {l: {} for l in order}
    for idx, combo, _ in jobs:
        attrs = [{"trait_type": l.split("_", 1)[1], "value": v} for l, v in combo]
        dna = hashlib.sha1("|".join(v for _, v in combo).encode()).hexdigest()
        meta = {"name": f"{a.name} #{idx}", "description": f"{a.name} collection of {a.count}.",
                "image": f"{idx}.png", "edition": idx, "dna": dna, "attributes": attrs}
        with open(os.path.join(a.out, "metadata", f"{idx}.json"), "w") as f:
            json.dump(meta, f, indent=2)
        allmeta.append(meta)
        for l, v in combo:
            counts[l][v] = counts[l].get(v, 0) + 1
    with open(os.path.join(a.out, "metadata.json"), "w") as f:
        json.dump(allmeta, f)
    with open(os.path.join(a.out, "rarity.json"), "w") as f:
        json.dump(counts, f, indent=2)
    print("done:", a.count, "NFTs ->", a.out)


if __name__ == "__main__":
    main()
