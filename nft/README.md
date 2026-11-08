# NFT Generator (10,000 unique pieces)

```bash
pip install pillow
python make_layers.py                 # draws all trait layers into layers/
python generate.py --count 10000      # composes NFTs -> build/images, build/metadata
```

- 7 layers: Background, Body, Clothes, Eyes, Mouth, Hat, Accessory (67 traits, ~millions of combinations)
- Rarity weights are in `WEIGHTS` in `generate.py`; every NFT is unique (DNA hash)
- Output: `build/images/<id>.png`, `build/metadata/<id>.json` (ERC-721 / OpenSea format), `build/metadata.json`, `build/rarity.json`
- To use your own art, drop transparent 512x512 PNGs into `layers/<NN_Layer>/<Trait>.png` and re-run `generate.py`
