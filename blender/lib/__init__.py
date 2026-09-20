"""
Blender-side modelling library.

`build_all.py` is the entry point; everything it needs lives here, split by
what is being built rather than by technique: `kit` is the low-poly toolbox
the rest share, and `vehicles`, `city`, `road` and `props` each own one family
of models. `palette` holds the colours so a repaint is one file, and `render`
and `montage` only exist to produce previews, never anything the game loads.
"""
