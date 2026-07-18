"""Embed a sharp equirectangular Earth plate as a data-URL JS module (file:// safe)."""
from PIL import Image
from io import BytesIO
import base64
import os

root = os.path.join(os.path.dirname(__file__), "..")
candidates = [
    os.path.join(os.path.expanduser("~"), "Downloads", "textures", "1_earth_8k.jpg"),
    os.path.join(root, "assets", "globe", "earth-4k.jpg"),
    os.path.join(root, "assets", "globe", "earth-2k.jpg"),
]
src = next(p for p in candidates if os.path.isfile(p))
out = os.path.join(root, "assets", "globe", "earth-data.js")

# Full 4K plate — sharp enough for mid zoom; extreme close-ups still soft.
im = Image.open(src).convert("RGB")
if im.size != (4096, 2048):
    im = im.resize((4096, 2048), Image.LANCZOS)
buf = BytesIO()
im.save(buf, format="JPEG", quality=88, optimize=True)
raw = buf.getvalue()
b64 = base64.b64encode(raw).decode("ascii")

with open(out, "w", encoding="utf-8") as f:
    f.write("// Auto-generated equirectangular Earth texture (data URL).\n")
    f.write("// Loaded this way so canvas getImageData works on file:// pages.\n")
    f.write(f'window.EARTH_TEX_DATA_URL = "data:image/jpeg;base64,{b64}";\n')

print("source", src, "size", im.size)
print("wrote", out, "jpeg_kb", round(len(raw) / 1024, 1), "js_kb", round(os.path.getsize(out) / 1024, 1))
