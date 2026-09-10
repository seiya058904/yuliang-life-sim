"""Localise reference-vs-current visual differences for one UI page.

Usage:
    python scripts/ui-diff-grid.py <page> [prefix] [--rows 9] [--cols 12]
                                    [--region x0,y0,x1,y1] [--art]

<page> is one of: life, career, settlement, shop  (see PAGES below).
[prefix] defaults to "base"; captures are read from output/round-current/.

Prints the whole-page diff mean, a rows x cols grid of per-cell diff means
(so the hottest cells can be read directly), and per-row / per-column margin
profiles. With --art it also renders the region (or the four hottest cells)
as ASCII grayscale so the structure can be read without an image viewer.

Reference images are 1448x1086; captures are 1440x1080, so both are resized
to the reference size before comparison.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(r"D:/xia zai/AI project/8.25")
REF_DIR = ROOT / "output/yuliang-ui-audit-current/reference"
CUR_DIR = ROOT / "output/round-current"

# Reference file names are misleading; this is the mapping confirmed by
# cross-diffing every reference against every capture.
PAGES = {
    "life": "01-life-main.png",
    "career": "02-career-market.png",
    "settlement": "03-shop-life.png",
    "shop": "04-month-settlement.png",
}

RAMP = " .:-=+*#%@"


def gray(path, size):
    image = Image.open(path).convert("L")
    if image.size != size:
        image = image.resize(size, Image.LANCZOS)
    return np.asarray(image, dtype=np.float32)


def art(region, cols=64, rows=28, label=""):
    height, width = region.shape
    lines = []
    for r in range(rows):
        y0, y1 = int(height * r / rows), int(height * (r + 1) / rows)
        cells = []
        for c in range(cols):
            x0, x1 = int(width * c / cols), int(width * (c + 1) / cols)
            value = region[y0:y1, x0:x1].mean()
            cells.append(RAMP[min(len(RAMP) - 1, int(value / 256 * len(RAMP)))])
        lines.append("".join(cells))
    if label:
        print(f"  --- {label} ({region.shape[1]}x{region.shape[0]}) ---")
    for line in lines:
        print("  " + line)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    argv = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    page = args[0]
    prefix = args[1] if len(args) > 1 else "base"
    if page not in PAGES:
        print(f"unknown page {page!r}; expected one of {sorted(PAGES)}")
        sys.exit(1)

    rows = cols = None
    region_box = None
    want_art = "--art" in argv

    def opt(name, default=None, cast=int):
        if name in argv:
            return cast(argv[argv.index(name) + 1])
        return default

    rows = opt("--rows")
    cols = opt("--cols")
    box = opt("--region", cast=str)
    if box:
        region_box = tuple(int(v) for v in box.split(","))

    ref_path = REF_DIR / PAGES[page]
    cur_path = CUR_DIR / f"{prefix}-{page}-1440x1080.png"
    for path in (ref_path, cur_path):
        if not path.exists():
            print(f"missing: {path}")
            sys.exit(1)

    ref_img = Image.open(ref_path).convert("L")
    size = ref_img.size  # PIL size is (width, height)
    ref = gray(ref_path, size)
    cur = gray(cur_path, size)
    diff = np.abs(ref - cur)
    width, height = size

    print(f"page={page}  prefix={prefix}  size={width}x{height}")
    print(f"whole-page diffmean = {diff.mean():.2f}")
    print(
        "ref  dark/light/mean = %.1f%% / %.1f%% / %.1f"
        % ((ref < 48).mean() * 100, (ref > 200).mean() * 100, ref.mean())
    )
    print(
        "cur  dark/light/mean = %.1f%% / %.1f%% / %.1f"
        % ((cur < 48).mean() * 100, (cur > 200).mean() * 100, cur.mean())
    )

    if region_box is None:
        rows = rows or 9
        cols = cols or 12
        print(f"\ngrid diff  (rows={rows} rows of {height // rows}px, cols={cols} cols of {width // cols}px)")
        header = "".join(f"{int(width * c / cols):>7d}" for c in range(cols))
        print(f"{'x:':<13}{header}")
        for r in range(rows):
            y0, y1 = int(height * r / rows), int(height * (r + 1) / rows)
            cells = []
            for c in range(cols):
                x0, x1 = int(width * c / cols), int(width * (c + 1) / cols)
                cells.append(f"{diff[y0:y1, x0:x1].mean():7.1f}")
            print(f"y{y0:<5d}-{y1:<5d}" + "".join(cells))

        print("\nhottest cells:")
        ranked = []
        for r in range(rows):
            for c in range(cols):
                y0, y1 = int(height * r / rows), int(height * (r + 1) / rows)
                x0, x1 = int(width * c / cols), int(width * (c + 1) / cols)
                ranked.append((diff[y0:y1, x0:x1].mean(), x0, y0, x1, y1))
        for value, x0, y0, x1, y1 in sorted(ranked, reverse=True)[:6]:
            print(f"  {value:6.1f}  box={x0},{y0},{x1},{y1}")

        # row / column margin profiles help tell "shifted content" from "wrong colour"
        print("\nrow profile (mean diff per 20px band):")
        for y in range(0, height, 60):
            value = diff[y : y + 60].mean()
            print(f"  y{y:<5d} {value:5.1f}  {'#' * int(value / 3)}")
        print("\ncolumn profile (mean diff per 60px band):")
        for x in range(0, width, 60):
            value = diff[:, x : x + 60].mean()
            print(f"  x{x:<5d} {value:5.1f}  {'#' * int(value / 3)}")

    if want_art:
        if region_box:
            x0, y0, x1, y1 = region_box
        else:
            x0, y0, x1, y1 = 0, 0, width, height
        print("\nreference:")
        art(ref[y0:y1, x0:x1], label=f"ref {x0},{y0},{x1},{y1}")
        print("\ncurrent:")
        art(cur[y0:y1, x0:x1], label=f"cur {x0},{y0},{x1},{y1}")
        band_r, band_c = ref[y0:y1, x0:x1], cur[y0:y1, x0:x1]
        print(
            "\nband  ref dark/light = %.1f/%.1f   cur dark/light = %.1f/%.1f"
            % (
                (band_r < 48).mean() * 100,
                (band_r > 200).mean() * 100,
                (band_c < 48).mean() * 100,
                (band_c > 200).mean() * 100,
            )
        )


if __name__ == "__main__":
    main()
