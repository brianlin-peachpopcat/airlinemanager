"""Split a 3x3 fictional-livery collage and assign tiles to passenger aircraft jpgs."""
from PIL import Image
from pathlib import Path

SRC = Path(r"C:\Users\brian\.cursor\projects\c-Users-brian-OneDrive-Documents-airlinemanager\assets\c__Users_brian_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_image-1b98f861-62f3-447a-828d-39e1d8755655.png")
OUT = Path(__file__).resolve().parents[1] / "img"

# Grid positions (row, col) → silhouette role
# 0 Aurora 747 | 1 EcoJet wide twin | 2 Sky Luxe A380
# 3 American 737 | 4 North Wind 787/A350 | 5 Tropical A320
# 6 Regional jet | 7 Short stubby | 8 Global Connect NB

ASSIGN = {
    # obvious
    (0, 0): [  # 747
        "b744", "b748", "b74sp", "b74d", "b741",
    ],
    (0, 2): [  # A380
        "a388",
    ],
    # classic / mid widebody twin (A330 / 777 / 767 / trijets / older wide)
    (0, 1): [
        "a332", "a333", "a339", "a310", "a300", "a343", "a346",
        "b763", "b764", "b77w", "b77l", "b779",
        "dc10", "md11", "l1011", "il96", "il964",
    ],
    # 737 family (+ 757 as similar narrowbody jet)
    (1, 0): [
        "b737", "b738", "b38m", "b731", "b752",
    ],
    # modern long-haul (787 / A350)
    (1, 1): [
        "b788", "b789", "b7810", "a359", "a35k", "a35u",
    ],
    # A320-family longer / neo (floral)
    (1, 2): [
        "a320n", "a321n", "a21x", "mc214",
    ],
    # regional jets
    (2, 0): [
        "a220", "e175", "e190e2", "e195e2", "crj7", "crj9", "b146",
    ],
    # short / stubby narrowbodies
    (2, 1): [
        "a318", "b717", "dc9", "md88",
    ],
    # remaining passenger narrowbodies + classic A320ceo
    (2, 2): [
        "a320", "dc8", "b707", "conc",
    ],
}


def crop_cells(im: Image.Image):
    w, h = im.size
    cw, ch = w / 3, h / 3
    inset = 4  # avoid thin grid lines
    cells = {}
    for r in range(3):
        for c in range(3):
            box = (
                int(c * cw) + inset,
                int(r * ch) + inset,
                int((c + 1) * cw) - inset,
                int((r + 1) * ch) - inset,
            )
            cells[(r, c)] = im.crop(box)
    return cells


def main():
    im = Image.open(SRC).convert("RGB")
    cells = crop_cells(im)
    written = []
    for key, ids in ASSIGN.items():
        tile = cells[key]
        for aid in ids:
            path = OUT / f"{aid}.jpg"
            tile.save(path, "JPEG", quality=88, optimize=True)
            written.append(aid)
    # report coverage
    all_ids = sorted({i for ids in ASSIGN.values() for i in ids})
    print(f"wrote {len(written)} files covering {len(all_ids)} types")
    for key, ids in ASSIGN.items():
        print(f"  cell{key}: {', '.join(ids)}")


if __name__ == "__main__":
    main()
