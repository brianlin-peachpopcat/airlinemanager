"""Measure precise engine-nacelle and belly geometry from livery templates.

For each template: scan the alpha channel to find, per x-column, the lowest
opaque pixel (bottom profile). Engine nacelles hang below the fuselage, so
columns where the bottom profile drops well below the local fuselage line
mark the nacelle's x-extent and depth. Also reports the fuselage bottom line
around mid-body for belly placement.
"""
import json
import os
import sys
from PIL import Image

root = os.path.join(os.path.dirname(__file__), "..")
livdir = os.path.join(root, "img", "liveries")

# current engine boxes from liveryart.js (normalized) — used as search regions
TPL = {
    "twin":   {"eng": [[0.28, 0.42]]},
    "a340":   {"eng": [[0.28, 0.55]]},
    "rj":     {"eng": [[0.67, 0.85]], "rear": True},
    "atr":    {"eng": [[0.30, 0.53]], "wing": True},
    "light":  {"eng": [[0.06, 0.28]], "wing": True},
    "tri":    {"eng": [[0.38, 0.53], [0.71, 0.84]]},
    "b747":   {"eng": [[0.28, 0.58]]},
    "b737ng": {"eng": [[0.31, 0.45]]},
    "b38m":   {"eng": [[0.30, 0.46]]},
    "a330":   {"eng": [[0.30, 0.43]]},
    "b757":   {"eng": [[0.33, 0.48]]},
    "b777":   {"eng": [[0.33, 0.47]]},
    "a350":   {"eng": [[0.31, 0.44]]},
    "b787":   {"eng": [[0.305, 0.475]]},
    "crj9":   {"eng": [[0.705, 0.835]], "rear": True},
    "a320r":  {"eng": [[0.27, 0.43]], "file": "a320"},
    "a318r":  {"eng": [[0.26, 0.47]], "file": "a318"},
    "a220r":  {"eng": [[0.27, 0.44]], "file": "a220"},
    "b146":   {"eng": [[0.285, 0.42]], "wing": True},
    "s340":   {"eng": [[0.28, 0.50]], "wing": True},
    "a380":   {"eng": [[0.26, 0.55]]},
}

out = {}
for key, cfg in TPL.items():
    fn = cfg.get("file", key) + ".png"
    path = os.path.join(livdir, fn)
    im = Image.open(path).convert("RGBA")
    W, H = im.size
    px = im.load()

    # bottom profile: lowest opaque y per column; top profile: highest opaque y
    bot = [None] * W
    for x in range(W):
        for y in range(H - 1, -1, -1):
            if px[x, y][3] > 60:
                bot[x] = y
                break

    def prof(x0f, x1f, step=6):
        x0, x1 = int(x0f * W), int(x1f * W)
        return [(round(x / W, 3), round((bot[x] or 0) / H, 3))
                for x in range(x0, min(x1, W - 1), step)]

    # fuselage bottom around mid-body but away from engines/wing:
    spans = []
    for x0f, x1f in [(0.10, 0.22), (0.60, 0.72)]:
        vals = [bot[x] for x in range(int(x0f * W), int(x1f * W)) if bot[x]]
        if vals:
            vals.sort()
            spans.append(vals[len(vals) // 2] / H)
    fus_bot = round(min(spans), 3) if spans else None

    engines = []
    for (ex0, ex1) in cfg["eng"]:
        seg = prof(max(0, ex0 - 0.05), min(1, ex1 + 0.05), step=4)
        engines.append(seg)

    out[key] = {"size": [W, H], "fus_bottom_med": fus_bot, "eng_profiles": engines}

print(json.dumps(out, indent=1))
