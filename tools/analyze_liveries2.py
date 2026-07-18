"""Detailed bottom-profile runs per template (no width filter) + top of drop.

For each drop column also find where the drop *starts* (the y where alpha
becomes opaque scanning up from the bottom stays the same), and the top edge
of the hanging feature: highest opaque pixel that is below the fuselage
bottom line and connected downward. Approximated: for each drop column,
report bottom depth; runs separated by >2px gaps.
"""
import os
from PIL import Image

root = os.path.join(os.path.dirname(__file__), "..")
livdir = os.path.join(root, "img", "liveries")

FILES = ["twin", "a340", "rj", "atr", "light", "tri", "b747", "b737ng", "b38m",
         "a330", "b757", "b777", "a350", "b787", "crj9", "a320", "a318",
         "a220", "b146", "s340", "a380"]

for name in FILES:
    im = Image.open(os.path.join(livdir, name + ".png")).convert("RGBA")
    W, H = im.size
    px = im.load()
    bot = [None] * W
    for x in range(W):
        for y in range(H - 1, -1, -1):
            if px[x, y][3] > 60:
                bot[x] = y
                break
    spans = []
    for x0f, x1f in [(0.10, 0.20), (0.62, 0.72)]:
        vals = sorted(bot[x] for x in range(int(x0f * W), int(x1f * W)) if bot[x])
        if vals:
            spans.append(vals[len(vals) // 2])
    fus_bot = min(spans) / H if spans else 0

    drops = [x for x in range(W) if bot[x] and bot[x] / H > fus_bot + 0.02]
    runs = []
    if drops:
        start = prev = drops[0]
        for x in drops[1:]:
            if x - prev > 2:
                runs.append((start, prev))
                start = x
            prev = x
        runs.append((start, prev))
    print(f"== {name} {W}x{H} fus_bottom {fus_bot:.3f}")
    for a, b in runs:
        if b - a < 2:
            continue
        deep = max(bot[x] for x in range(a, b + 1) if bot[x]) / H
        print(f"   run x {a/W:.3f}-{b/W:.3f} w {(b-a)/W:.3f} bottom {deep:.3f}")
