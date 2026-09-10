import sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(r"D:/xia zai/AI project/8.25")
REF = ROOT / "output/yuliang-ui-audit-current/reference"
CUR = ROOT / "output/round-current"
OUT = ROOT / "output/round-current/crop"
OUT.mkdir(parents=True, exist_ok=True)

# name -> (ref_file, cur_file, [(label, box)])  box in reference pixel coords (1448x1086)
JOBS = {
    "life": ("01-life-main.png", "base-life-1440x1080.png", [
        ("hero", (16, 105, 830, 385)),
        ("forecast", (840, 100, 1440, 395)),
        ("planner", (16, 380, 830, 530)),
        ("inbox", (16, 525, 1440, 700)),
        ("statusbar", (16, 690, 1440, 760)),
        ("header", (0, 0, 1448, 105)),
    ]),
    "career": ("02-career-market.png", "base-career-1440x1080.png", [
        ("filterrail", (16, 110, 250, 570)),
        ("toolbar", (250, 105, 1040, 175)),
        ("jobcards", (255, 175, 1040, 570)),
        ("detail", (1040, 110, 1440, 580)),
    ]),
    "settlement": ("03-shop-life.png", "base-settlement-1440x1080.png", [
        ("header", (0, 0, 1448, 90)),
        ("summary_top", (16, 95, 1440, 300)),
        ("hero", (960, 95, 1440, 420)),
        ("achievements", (16, 530, 1440, 660)),
        ("footer", (16, 660, 1440, 760)),
    ]),
    "shop": ("04-month-settlement.png", "base-shop-goods-1440x1080.png", [
        ("cards", (16, 115, 740, 560)),
        ("rail", (770, 95, 1075, 630)),
        ("detail", (16, 585, 1080, 720)),
    ]),
}

def crop_pair(name, ref_f, cur_f, label, box, scale=2):
    ref = Image.open(REF / ref_f).convert("RGB")
    cur = Image.open(CUR / cur_f).convert("RGB")
    cw, ch = cur.size
    rw, rh = ref.size
    x0, y0, x1, y1 = box
    cb = (round(x0 * cw / rw), round(y0 * ch / rh), round(x1 * cw / rw), round(y1 * ch / rh))
    rc = ref.crop(box)
    cc = cur.crop(cb).resize(rc.size, Image.LANCZOS)
    w, h = rc.size
    canvas = Image.new("RGB", (w * 2 + 10, h + 24), (30, 30, 30))
    canvas.paste(rc, (0, 24))
    canvas.paste(cc, (w + 10, 24))
    d = ImageDraw.Draw(canvas)
    d.text((6, 7), f"{name}/{label}  L=ref  R=current", fill=(255, 255, 120))
    nw, nh = int(canvas.width * scale), int(canvas.height * scale)
    if nw > 1600:
        s = 1600 / canvas.width
        nw, nh = int(canvas.width * s), int(canvas.height * s)
    canvas = canvas.resize((nw, nh), Image.NEAREST)
    canvas.save(OUT / f"{name}-{label}.png")
    return canvas.size

for name, (ref_f, cur_f, boxes) in JOBS.items():
    for label, box in boxes:
        try:
            print(name, label, crop_pair(name, ref_f, cur_f, label, box, scale=1.6))
        except Exception as e:
            print("ERR", name, label, e)
