"""Render livery paint previews with proposed precise geometry.

Simulates the JS paint-layer compositor: opaque layer (body -> belly ->
engines -> tail, later parts overwrite), multiplied over the template,
clipped to silhouette. Saves previews to tools/liv_preview/.
"""
import os
from PIL import Image, ImageDraw, ImageChops

root = os.path.join(os.path.dirname(__file__), "..")
livdir = os.path.join(root, "img", "liveries")
outdir = os.path.join(root, "tools", "liv_preview")
os.makedirs(outdir, exist_ok=True)

BODY = (18, 60, 120)     # dark blue
BELLY = (150, 158, 168)  # grey
ENG = (190, 30, 40)      # red
TAIL = (240, 170, 20)    # gold


def oct_box(x0, y0, x1, y1, c=0.25):
    """Octagon from a box; c = corner cut as fraction of the shorter side."""
    w, h = x1 - x0, y1 - y0
    k = min(w, h) * c
    return [(x0 + k, y0), (x1 - k, y0), (x1, y0 + k), (x1, y1 - k),
            (x1 - k, y1), (x0 + k, y1), (x0, y1 - k), (x0, y0 + k)]


# key -> file, belly poly, engine polys (octagons or free), tail poly
GEO = {
    "twin":   {"file": "twin",   "belly_top": 0.83, "belly_x": 0.84,
               "eng": [oct_box(0.300, 0.70, 0.437, 1.02)],
               "tail": [(0.775, 0.68), (0.85, -0.02), (1.02, -0.02), (1.02, 0.38), (0.88, 0.68)]},
    "a340":   {"file": "a340",   "belly_top": 0.79, "belly_x": 0.86,
               "eng": [oct_box(0.305, 0.74, 0.418, 1.00),
                       oct_box(0.418, 0.72, 0.550, 0.98)],
               "tail": [(0.83, 0.62), (0.885, -0.02), (1.02, -0.02), (1.02, 0.34), (0.91, 0.62)]},
    "rj":     {"file": "rj",     "belly_top": 0.82, "belly_x": 0.68,
               "eng": [oct_box(0.660, 0.38, 0.835, 0.72)],
               "tail": [(0.84, 0.60), (0.885, -0.02), (1.02, -0.02), (1.02, 0.60)]},
    "atr":    {"file": "atr",    "belly_top": 0.83, "belly_x": 0.75,
               "eng": [oct_box(0.315, 0.36, 0.545, 0.62)],
               "tail": [(0.78, 0.55), (0.83, -0.02), (1.02, -0.02), (1.02, 0.55)]},
    "light":  {"file": "light",  "belly_top": 0.68, "belly_x": 0.70,
               "eng": [oct_box(0.080, 0.60, 0.300, 0.88)],
               "tail": [(0.72, 0.42), (0.80, -0.02), (1.02, -0.02), (1.02, 0.42)]},
    "tri":    {"file": "tri",    "belly_top": 0.82, "belly_x": 0.86,
               "eng": [oct_box(0.408, 0.78, 0.525, 1.00),
                       oct_box(0.700, 0.32, 0.845, 0.52)],
               "tail": [(0.855, 0.30), (0.885, -0.02), (1.02, -0.02), (1.02, 0.30)]},
    "b747":   {"file": "b747",   "belly_top": 0.82, "belly_x": 0.86, "belly_bot": 0.96,
               "eng": [oct_box(0.293, 0.76, 0.393, 1.00),
                       oct_box(0.435, 0.73, 0.532, 0.95)],
               "tail": [(0.82, 0.60), (0.885, -0.02), (1.02, -0.02), (1.02, 0.36), (0.92, 0.60)]},
    "b737ng": {"file": "b737ng", "belly_top": 0.83, "belly_x": 0.86,
               "eng": [oct_box(0.313, 0.72, 0.442, 1.00)],
               "tail": [(0.79, 0.60), (0.86, -0.02), (1.02, -0.02), (1.02, 0.40), (0.90, 0.60)]},
    "b38m":   {"file": "b38m",   "belly_top": 0.83, "belly_x": 0.86,
               "eng": [oct_box(0.312, 0.72, 0.436, 1.00)],
               "tail": [(0.79, 0.60), (0.86, -0.02), (1.02, -0.02), (1.02, 0.40), (0.90, 0.60)]},
    "a330":   {"file": "a330",   "belly_top": 0.80, "belly_x": 0.87,
               "eng": [oct_box(0.308, 0.72, 0.432, 1.00)],
               "tail": [(0.80, 0.55), (0.875, -0.02), (1.02, -0.02), (1.02, 0.28), (0.90, 0.55)]},
    "b757":   {"file": "b757",   "belly_top": 0.79, "belly_x": 0.87,
               "eng": [oct_box(0.346, 0.73, 0.470, 1.00)],
               "tail": [(0.78, 0.58), (0.87, -0.02), (1.02, -0.02), (1.02, 0.32), (0.91, 0.58)]},
    "b777":   {"file": "b777",   "belly_top": 0.83, "belly_x": 0.87,
               "eng": [oct_box(0.335, 0.72, 0.435, 1.02)],
               "tail": [(0.80, 0.58), (0.88, -0.02), (1.02, -0.02), (1.02, 0.30), (0.91, 0.58)]},
    "a350":   {"file": "a350",   "belly_top": 0.80, "belly_x": 0.87,
               "eng": [oct_box(0.325, 0.72, 0.445, 1.02)],
               "tail": [(0.80, 0.55), (0.875, -0.02), (1.02, -0.02), (1.02, 0.28), (0.90, 0.55)]},
    "b787":   {"file": "b787",   "belly_top": 0.84, "belly_x": 0.87,
               "eng": [oct_box(0.332, 0.72, 0.432, 1.02)],
               "tail": [(0.79, 0.60), (0.865, -0.02), (1.02, -0.02), (1.02, 0.30), (0.90, 0.60)]},
    "crj9":   {"file": "crj9",   "belly_top": 0.85, "belly_x": 0.80,
               "eng": [oct_box(0.700, 0.44, 0.815, 0.76)],
               "tail": [(0.79, 0.55), (0.845, -0.02), (1.02, -0.02), (1.02, 0.35), (0.88, 0.55)]},
    "a320r":  {"file": "a320",   "belly_top": 0.78, "belly_x": 0.82,
               "eng": [oct_box(0.293, 0.72, 0.432, 1.00)],
               "tail": [(0.78, 0.58), (0.825, -0.02), (1.02, -0.02), (1.02, 0.45), (0.88, 0.58)]},
    "a318r":  {"file": "a318",   "belly_top": 0.80, "belly_x": 0.80,
               "eng": [oct_box(0.285, 0.72, 0.428, 1.00)],
               "tail": [(0.755, 0.55), (0.80, -0.02), (1.02, -0.02), (1.02, 0.50), (0.865, 0.55)]},
    "a220r":  {"file": "a220",   "belly_top": 0.79, "belly_x": 0.84,
               "eng": [oct_box(0.303, 0.73, 0.442, 1.00)],
               "tail": [(0.80, 0.58), (0.85, -0.02), (1.02, -0.02), (1.02, 0.45), (0.90, 0.58)]},
    "b146":   {"file": "b146",   "belly_top": 0.82, "belly_x": 0.78,
               "eng": [oct_box(0.272, 0.57, 0.465, 0.82)],
               "tail": [(0.705, 0.54), (0.775, -0.02), (0.985, -0.02), (0.945, 0.54)]},
    "s340":   {"file": "s340",   "belly_top": 0.82, "belly_x": 0.80,
               "eng": [oct_box(0.290, 0.70, 0.540, 0.94)],
               "tail": [(0.735, 0.62), (0.805, -0.02), (1.00, -0.02), (0.955, 0.62)]},
    "a380":   {"file": "a380",   "belly_top": 0.82, "belly_x": 0.84,
               "eng": [oct_box(0.276, 0.76, 0.398, 0.99),
                       oct_box(0.432, 0.74, 0.556, 0.97)],
               "tail": [(0.81, 0.55), (0.865, -0.02), (1.02, -0.02), (1.02, 0.34), (0.905, 0.55)]},
}


def render(key, cfg):
    im = Image.open(os.path.join(livdir, cfg["file"] + ".png")).convert("RGBA")
    W, H = im.size
    lay = Image.new("RGB", (W, H), BODY)
    dr = ImageDraw.Draw(lay)
    bt = cfg["belly_top"]
    bb = cfg.get("belly_bot", 1.02)
    bx = cfg["belly_x"]
    dr.polygon([(-2, bt * H), (bx * W, bt * H), (bx * W, bb * H), (-2, bb * H)], fill=BELLY)
    for poly in cfg["eng"]:
        dr.polygon([(x * W, y * H) for x, y in poly], fill=ENG)
    dr.polygon([(x * W, y * H) for x, y in cfg["tail"]], fill=TAIL)
    rgb = im.convert("RGB")
    mixed = ImageChops.multiply(rgb, lay)
    outim = Image.merge("RGBA", (*mixed.split(), im.split()[3]))
    outim.save(os.path.join(outdir, key + ".png"))


for key, cfg in GEO.items():
    render(key, cfg)
print("previews written to", outdir)
