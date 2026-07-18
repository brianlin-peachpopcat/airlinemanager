"""Build in-game livery art from stacked side-profile templates.

For each PNG in img/liveries/src this script:
  1. finds the two stacked side profiles and crops out the TOP one (gear up)
  2. flood-fills the white background from the borders and makes it transparent
  3. saves the result to img/liveries/<name>.png
  4. prints normalized geometry hints (window strip band, fuselage band) that
     are hand-copied into js/liveryart.js

Requires Pillow.
"""
import os, sys, collections
from PIL import Image

SRC = os.path.join(os.path.dirname(__file__), "..", "img", "liveries", "src")
OUT = os.path.join(os.path.dirname(__file__), "..", "img", "liveries")

WHITE_TOL = 18          # how close to pure white counts as background
PAD = 6                 # padding around the cropped plane


def is_bg(px, tol=WHITE_TOL):
    r, g, b = px[0], px[1], px[2]
    return r >= 255 - tol and g >= 255 - tol and b >= 255 - tol


def row_counts(im):
    """Non-background pixel count per row."""
    w, h = im.size
    pix = im.load()
    counts = []
    for y in range(h):
        n = 0
        for x in range(0, w, 2):
            if not is_bg(pix[x, y]):
                n += 1
        counts.append(n)
    return counts


def top_plane_box(im):
    """Crop everything above the thinnest row near the vertical middle.

    The two stacked profiles overlap vertically (the lower plane's fin rises
    into the gap), so instead of a blank gap we split at the row with the
    least content between 30%% and 70%% of the height. Stray fragments of the
    lower plane are removed later by the largest-component filter.
    """
    counts = row_counts(im)
    h = len(counts)
    lo, hi = int(h * 0.30), int(h * 0.70)
    split = min(range(lo, hi), key=lambda y: counts[y])
    return (0, 0, im.size[0], split)


def make_transparent(im):
    """Flood fill near-white background from the border, set alpha 0."""
    im = im.convert("RGBA")
    w, h = im.size
    pix = im.load()
    seen = bytearray(w * h)
    q = collections.deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(pix[x, y]):
                q.append((x, y))
                seen[y * w + x] = 1
    for y in range(h):
        for x in (0, w - 1):
            if is_bg(pix[x, y]) and not seen[y * w + x]:
                q.append((x, y))
                seen[y * w + x] = 1
    while q:
        x, y = q.popleft()
        r, g, b, a = pix[x, y]
        pix[x, y] = (r, g, b, 0)
        for nx, ny in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                if is_bg(pix[nx, ny]):
                    seen[ny * w + nx] = 1
                    q.append((nx, ny))
    return im


def largest_component(im):
    """Keep only the biggest connected opaque blob, then tight-crop + pad."""
    w, h = im.size
    pix = im.load()
    label = [0] * (w * h)
    sizes = {}
    cur = 0
    for sy in range(h):
        for sx in range(w):
            if pix[sx, sy][3] > 0 and not label[sy * w + sx]:
                cur += 1
                q = collections.deque([(sx, sy)])
                label[sy * w + sx] = cur
                n = 0
                while q:
                    x, y = q.popleft()
                    n += 1
                    for nx, ny in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
                        if 0 <= nx < w and 0 <= ny < h and not label[ny * w + nx] and pix[nx, ny][3] > 0:
                            label[ny * w + nx] = cur
                            q.append((nx, ny))
                sizes[cur] = n
    if not sizes:
        return im
    keep = max(sizes, key=sizes.get)
    x0, y0, x1, y1 = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            if label[y * w + x] != keep:
                if pix[x, y][3] > 0:
                    r, g, b, a = pix[x, y]
                    pix[x, y] = (r, g, b, 0)
            else:
                x0 = min(x0, x); y0 = min(y0, y)
                x1 = max(x1, x); y1 = max(y1, y)
    return im.crop((max(0, x0 - PAD), max(0, y0 - PAD),
                    min(w, x1 + PAD + 1), min(h, y1 + PAD + 1)))


def geometry_hints(im):
    """Find the dark window strip and the fuselage vertical band."""
    w, h = im.size
    pix = im.load()
    # dark pixels (windows / cockpit) histogram per row
    dark_rows = [0] * h
    dark_cols_by_row = {}
    for y in range(h):
        for x in range(w):
            r, g, b, a = pix[x, y]
            if a > 100 and r < 90 and g < 90 and b < 90:
                dark_rows[y] += 1
                dark_cols_by_row.setdefault(y, []).append(x)
    # window strip: the row band with the most dark pixels
    best = max(range(h), key=lambda y: dark_rows[y])
    y0 = best
    while y0 > 0 and dark_rows[y0 - 1] > dark_rows[best] * 0.25:
        y0 -= 1
    y1 = best
    while y1 < h - 1 and dark_rows[y1 + 1] > dark_rows[best] * 0.25:
        y1 += 1
    cols = []
    for y in range(y0, y1 + 1):
        cols += dark_cols_by_row.get(y, [])
    x0, x1 = (min(cols), max(cols)) if cols else (0, 0)
    return {
        "win": (round(x0 / w, 3), round(y0 / h, 3), round(x1 / w, 3), round((y1 + 1) / h, 3)),
    }


def main():
    for name in sorted(os.listdir(SRC)):
        if not name.endswith(".png"):
            continue
        im = Image.open(os.path.join(SRC, name)).convert("RGB")
        box = top_plane_box(im)
        crop = im.crop(box)
        out = largest_component(make_transparent(crop))
        out.save(os.path.join(OUT, name))
        hints = geometry_hints(out)
        print(f"{name}: size={out.size} win={hints['win']}")


if __name__ == "__main__":
    main()
