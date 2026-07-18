"""Build daytime airport scene: static apron + 3 animated plane sprites."""
from PIL import Image, ImageFilter, ImageDraw
import numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "assets" / "paxview"
SRC = ROOT / "src-airport-day.png"


def main():
  im = Image.open(SRC).convert("RGBA")
  arr = np.array(im)
  h, w = arr.shape[:2]
  r = arr[:, :, 0].astype(np.int16)
  g = arr[:, :, 1].astype(np.int16)
  b = arr[:, :, 2].astype(np.int16)
  lum = (r.astype(np.int32) + g + b) // 3
  yy, xx = np.mgrid[:h, :w]

  # Hand-tuned boxes on 740×440 art
  planes = {
    "fg": {
      "box": (10, 245, 410, 430),
      "keep": lambda: (
        ((r > 130) & (b > 110) & (g < 140) & (yy > 250))  # magenta body/tail
        | ((lum > 225) & (yy > 260) & (yy < 400) & (xx < 400))  # white top
        | ((lum < 70) & (yy > 340) & (xx < 380))  # gear
        | ((np.abs(r - 180) < 40) & (np.abs(g - 190) < 40) & (yy > 300) & (xx < 360))  # wing grey/white
      ),
    },
    "mid": {
      "box": (400, 195, 680, 345),
      "keep": lambda: (
        ((lum > 210) & (yy > 200) & (yy < 340) & (xx > 400))
        | ((b > r + 10) & (b > 150) & (yy > 195) & (xx > 500))  # blue tail
        | ((lum < 80) & (yy > 280) & (xx > 420) & (xx < 650))
      ),
    },
    "take": {
      "box": (500, 35, 640, 115),
      "keep": lambda: (lum > 245) & (yy < 120) & (xx > 500),
    },
  }

  sprites = {}
  masks = {}
  for name, spec in planes.items():
    x0, y0, x1, y1 = spec["box"]
    keep = spec["keep"]()
    keep[:y0, :] = False
    keep[y1:, :] = False
    keep[:, :x0] = False
    keep[:, x1:] = False
    m = Image.fromarray((keep.astype(np.uint8) * 255))
    m = m.filter(ImageFilter.MaxFilter(3 if name == "take" else 5))
    m = m.filter(ImageFilter.MinFilter(3))
    keep = np.array(m) > 100
    # tighten takeoff — drop huge cloud blobs
    if name == "take" and keep.sum() > 1800:
      keep &= (yy > 50) & (yy < 100) & (xx > 520) & (xx < 620)
      m = Image.fromarray((keep.astype(np.uint8) * 255)).filter(ImageFilter.MaxFilter(2))
      keep = np.array(m) > 128
    masks[name] = keep
    # tight bbox
    if keep.any():
      ys, xs = np.where(keep)
      pad = 4
      box = (max(0, xs.min() - pad), max(0, ys.min() - pad),
             min(w, xs.max() + pad + 1), min(h, ys.max() + pad + 1))
    else:
      box = spec["box"]
    sprites[name] = {"box": box, "keep": keep}

  # Build base by painting out planes
  base = arr.copy()
  for name, sp in sprites.items():
    keep = sp["keep"]
    x0, y0, x1, y1 = sp["box"]
    if name == "take":
      sky = arr[30:70, 100:200, :3].mean(axis=(0, 1))
      base[keep, :3] = sky
      continue
    # fill with local row samples from outside the mask
    ys, xs = np.where(keep)
    for y, x in zip(ys, xs):
      fill = None
      for dx in range(2, 100):
        for sx in (x - dx, x + dx):
          if 0 <= sx < w and not keep[y, sx]:
            fill = arr[y, sx, :3]
            break
        if fill is not None:
          break
      if fill is None:
        fill = arr[min(h - 1, y + 8), x, :3] if y + 8 < h and not keep[min(h - 1, y + 8), x] else arr[y, 0, :3]
      base[y, x, :3] = fill

  # soften patched areas
  patch = masks["fg"] | masks["mid"] | masks["take"]
  pm = np.array(Image.fromarray((patch.astype(np.uint8) * 255)).filter(ImageFilter.MaxFilter(9))).astype(np.float32) / 255
  blurred = np.array(Image.fromarray(base).filter(ImageFilter.GaussianBlur(2))).astype(np.float32)
  out = base.astype(np.float32)
  for c in range(3):
    out[:, :, c] = out[:, :, c] * (1 - pm * 0.5) + blurred[:, :, c] * (pm * 0.5)
  out[:, :, 3] = 255
  Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(ROOT / "airport-day-base.png", optimize=True)

  layout = {}
  for name, sp in sprites.items():
    x0, y0, x1, y1 = sp["box"]
    crop = arr[y0:y1, x0:x1].copy()
    m = sp["keep"][y0:y1, x0:x1]
    crop[~m, 3] = 0
    crop[crop[:, :, 3] < 10] = 0
    fname = {"fg": "airport-plane-fg.png", "mid": "airport-plane-mid.png", "take": "airport-plane-takeoff.png"}[name]
    Image.fromarray(crop).save(ROOT / fname, optimize=True)
    layout[name] = {
      "left": round(x0 / w * 100, 2),
      "top": round(y0 / h * 100, 2),
      "width": round((x1 - x0) / w * 100, 2),
      "height": round((y1 - y0) / h * 100, 2),
    }
    print(name, fname, crop.shape, "px", int(sp["keep"].sum()), layout[name])

  import json
  (ROOT / "airport-layout.json").write_text(json.dumps(layout, indent=2), encoding="utf-8")
  print("wrote airport-layout.json")


if __name__ == "__main__":
  main()
