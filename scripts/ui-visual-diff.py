import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(r"D:/xia zai/AI project/8.25")
REF = ROOT / "output/yuliang-ui-audit-current/reference"
CUR = ROOT / "output/round-current"
OUT = ROOT / "output/round-current/cmp"
OUT.mkdir(parents=True, exist_ok=True)

PAIRS = [
    ("life", REF / "01-life-main.png", CUR / "base-life-1440x1080.png"),
    ("career", REF / "02-career-market.png", CUR / "base-career-1440x1080.png"),
    ("settlement", REF / "03-shop-life.png", CUR / "base-settlement-1440x1080.png"),
    ("shop", REF / "04-month-settlement.png", CUR / "base-shop-goods-1440x1080.png"),
]

def load(p):
    im = Image.open(p).convert("RGB")
    return im

def to_gray_arr(im, size):
    return np.asarray(im.resize(size, Image.LANCZOS).convert("L"), dtype=np.float32)

def area_stats(im):
    g = np.asarray(im.convert("L"), dtype=np.float32)
    total = g.size
    dark = float((g < 48).mean()) * 100
    light = float((g > 200).mean()) * 100
    mid = 100 - dark - light
    return dark, light, mid, float(g.mean())

def label(img, text, h=26):
    canvas = Image.new("RGB", (img.width, img.height + h), (20, 20, 20))
    canvas.paste(img, (0, h))
    d = ImageDraw.Draw(canvas)
    d.text((8, 6), text, fill=(255, 255, 255))
    return canvas

report = []
for name, ref_p, cur_p in PAIRS:
    if not ref_p.exists() or not cur_p.exists():
        report.append(f"{name}: missing ({ref_p.exists()=} {cur_p.exists()=})")
        continue
    ref = load(ref_p)
    cur = load(cur_p)
    size = ref.size
    cur_r = cur.resize(size, Image.LANCZOS)
    ra, ca = to_gray_arr(ref, size), to_gray_arr(cur_r, size)
    diff = np.abs(ra - ca)
    diff_img = Image.fromarray((255 - np.clip(diff * 1.6, 0, 255)).astype(np.uint8)).convert("RGB")
    # side by side
    sbs = Image.new("RGB", (size[0] * 2 + 12, size[1]), (20, 20, 20))
    sbs.paste(ref, (0, 0))
    sbs.paste(cur_r, (size[0] + 12, 0))
    sbs = label(sbs, f"{name}: LEFT=reference  RIGHT=current", 26)
    sbs.thumbnail((1500, 1500), Image.LANCZOS)
    sbs.save(OUT / f"{name}-sbs.png")
    # overlay 50/50
    ov = Image.blend(ref, cur_r, 0.5)
    ov = label(ov, f"{name}: 50/50 overlay", 26)
    ov.thumbnail((1100, 1100), Image.LANCZOS)
    ov.save(OUT / f"{name}-overlay.png")
    # diff heat
    di = label(diff_img, f"{name}: abs visual diff (white=identical)", 26)
    di.thumbnail((1100, 1100), Image.LANCZOS)
    di.save(OUT / f"{name}-diff.png")
    rd, rl, rm, rmean = area_stats(ref)
    cd, cl, cm, cmean = area_stats(cur_r)
    report.append(
        f"{name}\n  ref  dark%={rd:5.1f} light%={rl:5.1f} mid%={rm:5.1f} mean={rmean:6.1f}\n"
        f"  cur  dark%={cd:5.1f} light%={cl:5.1f} mid%={cm:5.1f} mean={cmean:6.1f}\n"
        f"  diff mean={diff.mean():6.2f}  >64px%={float((diff>64).mean())*100:5.1f}  size={size}"
    )

print("\n".join(report))
