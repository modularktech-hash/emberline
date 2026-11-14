# Bake the globe's dotted land into an equirectangular texture (was ~10k H3 hex-dot meshes built at runtime).
# Usage: python3 scripts/make_globe_texture.py web/public/geo/countries.geojson web/public/geo/land-dots.png 2048
# Dots are drawn as ellipses widened by 1/cos(lat) so they look round and evenly spaced on the sphere.
import json, math, sys
from PIL import Image, ImageDraw
src, out, W = sys.argv[1], sys.argv[2], int(sys.argv[3])
H = W // 2
S = 2  # supersample
mask = Image.new("L", (W, H), 0)
md = ImageDraw.Draw(mask)
px = lambda lon, lat: ((lon + 180) / 360 * W, (90 - lat) / 180 * H)
g = json.load(open(src))
for f in g["features"]:
    geom = f["geometry"]
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    for poly in polys:
        md.polygon([px(*p[:2]) for p in poly[0]], fill=255)
        for hole in poly[1:]:
            md.polygon([px(*p[:2]) for p in hole], fill=0)
OCEAN, DOT = (243, 236, 220), (40, 38, 34)
img = Image.new("RGB", (W * S, H * S), OCEAN)
d = ImageDraw.Draw(img)
step = 0.85  # degrees between dots along a meridian
r = 0.27     # dot radius in degrees of arc
lat = -90 + step / 2
while lat < 90:
    c = max(math.cos(math.radians(lat)), 0.02)
    dlon = step / c
    n = max(1, int(360 / dlon))
    dlon = 360 / n
    off = (dlon / 2) if int((lat + 90) / step) % 2 else 0
    for i in range(n):
        lon = -180 + off + i * dlon
        x, y = px(lon, lat)
        if 0 <= int(x) < W and 0 <= int(y) < H and mask.getpixel((int(x), int(y))):
            rx, ry = r / c / 360 * W * S, r / 180 * H * S
            X, Y = x * S, y * S
            d.ellipse([X - rx, Y - ry, X + rx, Y + ry], fill=DOT)
    lat += step
img = img.resize((W, H), Image.LANCZOS)
# Greyscale, 4 levels: ~130 KB. The globe material tints it cream.
img.convert("L").quantize(colors=4, dither=Image.Dither.NONE).save(out, optimize=True)
