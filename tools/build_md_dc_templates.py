"""Build transparent livery templates from stacked dual-profile sources."""
import collections
import os
import sys
from PIL import Image

PAD = 6
THR = 248


def is_near_white(px, tol=18):
    return px[0] >= 255 - tol and px[1] >= 255 - tol and px[2] >= 255 - tol


def is_bg(px, t=THR):
    return px[0] >= t and px[1] >= t and px[2] >= t


def row_counts(im):
    w, h = im.size
    pix = im.load()
    return [sum(1 for x in range(0, w, 2) if not is_near_white(pix[x, y])) for y in range(h)]


def build(src_path, out_path, src_save=None):
    im0 = Image.open(src_path).convert("RGB")
    if src_save:
        os.makedirs(os.path.dirname(src_save), exist_ok=True)
        im0.save(src_save)
    w0, h0 = im0.size
    counts = row_counts(im0)
    lo, hi = int(h0 * 0.30), int(h0 * 0.70)
    split = min(range(lo, hi), key=lambda y: counts[y])
    crop = im0.crop((0, 0, w0, split)).convert("RGBA")
    w, h = crop.size
    pix = crop.load()

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
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and is_bg(pix[nx, ny]):
                seen[ny * w + nx] = 1
                q.append((nx, ny))

    for _ in range(3):
        kills = []
        for y in range(h):
            for x in range(w):
                if pix[x, y][3] == 0:
                    continue
                if not (pix[x, y][0] >= THR - 6 and pix[x, y][1] >= THR - 6 and pix[x, y][2] >= THR - 6):
                    continue
                if any(
                    0 <= nx < w and 0 <= ny < h and pix[nx, ny][3] == 0
                    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))
                ):
                    kills.append((x, y))
        for x, y in kills:
            r, g, b, a = pix[x, y]
            pix[x, y] = (r, g, b, 0)

    label = [0] * (w * h)
    sizes = {}
    cur = 0
    for sy in range(h):
        for sx in range(w):
            if pix[sx, sy][3] > 0 and not label[sy * w + sx]:
                cur += 1
                qq = collections.deque([(sx, sy)])
                label[sy * w + sx] = cur
                n = 0
                while qq:
                    x, y = qq.popleft()
                    n += 1
                    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                        if 0 <= nx < w and 0 <= ny < h and not label[ny * w + nx] and pix[nx, ny][3] > 0:
                            label[ny * w + nx] = cur
                            qq.append((nx, ny))
                sizes[cur] = n
    keep = max(sizes, key=sizes.get)
    x0, y0, x1, y1 = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            if label[y * w + x] != keep:
                if pix[x, y][3] > 0:
                    r, g, b, a = pix[x, y]
                    pix[x, y] = (r, g, b, 0)
            else:
                x0 = min(x0, x)
                y0 = min(y0, y)
                x1 = max(x1, x)
                y1 = max(y1, y)
    out = crop.crop((max(0, x0 - PAD), max(0, y0 - PAD), min(w, x1 + PAD + 1), min(h, y1 + PAD + 1)))

    # cool/neutralize
    pix = out.load()
    W, H = out.size
    for y in range(H):
        for x in range(W):
            r, g, b, a = pix[x, y]
            if a < 15:
                continue
            L = 0.2126 * r + 0.7152 * g + 0.0722 * b
            v = int(L)
            if L < 50:
                pix[x, y] = (v, v, v, a)
            else:
                cool = max(0, min(255, v - 1))
                pix[x, y] = (cool, cool, min(255, cool + 2), a)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    out.save(out_path)
    print(os.path.basename(out_path), out.size, "split", split)


if __name__ == "__main__":
    assets = r"C:\Users\brian\.cursor\projects\c-Users-brian-OneDrive-Documents-airlinemanager\assets"
    md11 = os.path.join(
        assets,
        "c__Users_brian_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_image-7db36ff9-68d7-48a2-990f-923a83978d5e.png",
    )
    dc9 = os.path.join(
        assets,
        "c__Users_brian_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_image-df11370c-68b0-42bc-a173-edb8a9f327d8.png",
    )
    build(md11, "img/liveries/md11.png", "img/liveries/src/md11.png")
    build(dc9, "img/liveries/dc9.png", "img/liveries/src/dc9.png")
