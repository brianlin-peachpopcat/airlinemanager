"""Split sunset art into a fixed sun/sky base and a scrolling cloud layer."""
from PIL import Image, ImageFilter
import numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "assets" / "paxview"
SRC = ROOT / "src-sunset.png"


def main():
  im = Image.open(SRC).convert("RGBA")
  arr = np.array(im).astype(np.float32)
  h, w = arr.shape[:2]
  r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
  yy, xx = np.mgrid[:h, :w]

  lum = (r + g + b) / 3.0
  mx = np.maximum(np.maximum(r, g), b)
  mn = np.minimum(np.minimum(r, g), b)
  sat = mx - mn

  # Sun: bright pale disc + warm rays in the lower centre
  sun = (
    (yy > h * 0.58)
    & (
      ((lum > 210) & (r > 220) & (g > 190))
      | ((r > 230) & (g > 160) & (b < 170) & (np.abs(xx - w / 2) < w * 0.42))
    )
  )
  sun_m = Image.fromarray((sun.astype(np.uint8) * 255)).filter(ImageFilter.GaussianBlur(4))
  sun_a = np.array(sun_m).astype(np.float32) / 255.0

  # Clouds: saturated pink/purple/orange blobs above the sun belt
  cloud = (
    (sat > 40)
    & (yy < h * 0.82)
    & (
      ((r > 130) & (b > 90) & (g < r * 0.9) & (b > g * 0.7))  # pink / purple
      | ((r > 170) & (g > 90) & (g < 210) & (b < 150) & (yy > h * 0.4))  # orange banks
    )
    & (sun_a < 0.35)
  )
  cm = Image.fromarray((cloud.astype(np.uint8) * 255))
  cm = cm.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(2))
  cloud_a = np.clip(np.array(cm).astype(np.float32) / 255.0, 0, 1)
  # keep sun clear of scrolling clouds
  cloud_a *= (1.0 - np.clip(sun_a * 1.4, 0, 1))

  # Base: smear sky horizontally (kills cloud shapes) then paste original sun
  base = arr.copy()
  for y in range(h):
    # weighted blend toward horizontal mean — stronger in the upper sky
    t = 1.0 if y < h * 0.55 else max(0.0, 1.0 - (y - h * 0.55) / (h * 0.25))
    mean = arr[y].mean(axis=0)
    base[y] = arr[y] * (1 - t) + mean * t
  base_im = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))
  base = np.array(base_im).astype(np.float32)
  for c in range(3):
    base[:, :, c] = base[:, :, c] * (1 - sun_a) + arr[:, :, c] * sun_a
  base[:, :, 3] = 255
  # also restore a little of the original lower cloud bank under the sun so it isn't empty
  low = (yy > h * 0.7) & (sun_a < 0.2)
  for c in range(3):
    base[:, :, c] = np.where(low, arr[:, :, c] * 0.55 + base[:, :, c] * 0.45, base[:, :, c])

  Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).save(ROOT / "sunset-base.png", optimize=True)
  print("wrote sunset-base.png")

  clouds = np.zeros_like(arr)
  clouds[:, :, :3] = arr[:, :, :3]
  clouds[:, :, 3] = cloud_a * 255
  clouds[clouds[:, :, 3] < 10] = 0
  Image.fromarray(np.clip(clouds, 0, 255).astype(np.uint8)).save(ROOT / "sunset-clouds.png", optimize=True)
  print("wrote sunset-clouds.png")


if __name__ == "__main__":
  main()
