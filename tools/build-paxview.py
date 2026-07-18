"""Build passenger-view backgrounds from the four scene photos (no window frame)."""
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "assets" / "paxview"


def main():
  Image.open(ROOT / "src-day-flight.png").convert("RGB").save(ROOT / "day-flight.png", optimize=True)
  print("wrote day-flight.png")

  # Night flight — keep the starfield; discard the wing below
  n = Image.open(ROOT / "src-night-flight.png").convert("RGB")
  nw, nh = n.size
  n.crop((0, 0, nw, int(nh * 0.58))).resize((nw, nh), Image.LANCZOS).save(ROOT / "night-flight.png", optimize=True)
  print("wrote night-flight.png")

  # Day ground — keep the apron / terminal; discard the wing
  d = Image.open(ROOT / "src-day-ground.png").convert("RGB")
  dw, dh = d.size
  d.crop((int(dw * 0.55), 0, dw, dh)).resize((dw, dh), Image.LANCZOS).save(ROOT / "day-ground.png", optimize=True)
  print("wrote day-ground.png")

  Image.open(ROOT / "src-night-ground.png").convert("RGB").save(ROOT / "night-ground.png", optimize=True)
  print("wrote night-ground.png")


if __name__ == "__main__":
  main()
