"""Report tight nacelle boxes + fuselage bottom per livery template.

Underwing engines: columns whose bottom (lowest opaque pixel) drops below the
local fuselage bottom mark the nacelle span; deepest drop is the nacelle
bottom. Rear-/wing-mounted engines are reported as 'no drop' for hand tuning.
"""
import os
from PIL import Image

root = os.path.join(os.path.dirname(__file__), "..")
livdir = os.path.join(root, "img", "liveries")

TPL = {
    "twin":   {"eng": [[0.20, 0.50]], "file": "twin"},
    "a340":   {"eng": [[0.20, 0.62]], "file": "a340"},
    "rj":     {"eng": [[0.60, 0.92]], "file": "rj"},
    "atr":    {"eng": [[0.22, 0.60]], "file": "atr"},
    "light":  {"eng": [[0.02, 0.35]], "file": "light"},
    "tri":    {"eng": [[0.30, 0.60], [0.64, 0.90]], "file": "tri"},
    "b747":   {"eng": [[0.20, 0.65]], "file": "b747"},
    "b737ng": {"eng": [[0.24, 0.52]], "file": "b737ng"},
    "b38m":   {"eng": [[0.23, 0.53]], "file": "b38m"},
    "a330":   {"eng": [[0.23, 0.50]], "file": "a330"},
    "b757":   {"eng": [[0.26, 0.55]], "file": "b757"},
    "b777":   {"eng": [[0.26, 0.54]], "file": "b777"},
    "a350":   {"eng": [[0.24, 0.51]], "file": "a350"},
    "b787":   {"eng": [[0.24, 0.54]], "file": "b787"},
    "crj9":   {"eng": [[0.62, 0.90]], "file": "crj9"},
    "a320r":  {"eng": [[0.20, 0.50]], "file": "a320"},
    "a318r":  {"eng": [[0.19, 0.54]], "file": "a318"},
    "a220r":  {"eng": [[0.20, 0.51]], "file": "a220"},
    "b146":   {"eng": [[0.21, 0.49]], "file": "b146"},
    "s340":   {"eng": [[0.20, 0.57]], "file": "s340"},
    "a380":   {"eng": [[0.18, 0.62]], "file": "a380"},
}

for key, cfg in TPL.items():
    path = os.path.join(livdir, cfg["file"] + ".png")
    im = Image.open(path).convert("RGBA")
    W, H = im.size
    px = im.load()

    bot = [None] * W
    for x in range(W):
        for y in range(H - 1, -1, -1):
            if px[x, y][3] > 60:
                bot[x] = y
                break

    # fuselage bottom: median of clean stretches fore and aft of the wing
    spans = []
    for x0f, x1f in [(0.10, 0.20), (0.62, 0.72)]:
        vals = sorted(bot[x] for x in range(int(x0f * W), int(x1f * W)) if bot[x])
        if vals:
            spans.append(vals[len(vals) // 2])
    fus_bot = min(spans) / H if spans else 0

    print(f"== {key} {W}x{H} fus_bottom {fus_bot:.3f}")
    for i, (ex0, ex1) in enumerate(cfg["eng"]):
        drop_cols = []
        for x in range(int(ex0 * W), int(ex1 * W)):
            if bot[x] and bot[x] / H > fus_bot + 0.025:
                drop_cols.append(x)
        if drop_cols:
            # contiguous runs (gear legs can also drop — keep runs > 2% width)
            runs = []
            start = prev = drop_cols[0]
            for x in drop_cols[1:]:
                if x - prev > 3:
                    runs.append((start, prev))
                    start = x
                prev = x
            runs.append((start, prev))
            runs = [(a, b) for a, b in runs if (b - a) / W > 0.02]
            for a, b in runs:
                deep = max(bot[x] for x in range(a, b + 1) if bot[x]) / H
                print(f"   eng{i} run x {a/W:.3f}-{b/W:.3f} bottom {deep:.3f}")
        else:
            print(f"   eng{i} no drop (rear/wing mount)")
