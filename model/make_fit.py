"""Compute where each cut-out sits on the dress-up figure.

Run from the project root (after make_cutouts.py):  .venv/bin/python model/make_fit.py
Writes web/public/fit.json: {item_id: [left, top, width, z, (mirror, photo)]} in figure units
(the figure's SVG viewBox is 300 x 600; height follows the image's aspect ratio).
mirror=1 means a single shoe: draw it on the right foot and a mirrored copy on the left.
photo=1 (6th field) means the background could not be removed: shown as a small framed snapshot.

Idea: measure the garment's shape from its cut-out mask (e.g. the torso width of a top,
ignoring sleeves; the waistband of trousers) and scale it so that part lines up with the
matching part of the figure. Rules depend on the fine type (shorts vs jeans, earrings vs
necklace, ...). Pure layout heuristics; nothing here is learned.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
CUT = ROOT / "web" / "public" / "cutouts"

# ---- figure landmarks (SVG viewBox units, see components/mannequin.tsx) ----
CX = 150            # body centre line
NECK_Y = 100        # neckline / top of shoulders
WAIST_Y = 238       # where trousers and skirts start
ANKLE_Y = 548
FLOOR_Y = 564
EYE_Y = 57
BROW_Y = 44
L_HAND = (68, 328)
R_HAND = (232, 328)

LONG_BOTTOMS = {"jeans", "pant", "pants", "sweatpants", "pyjama pants", "male jeans", "male pants", "long skirt"}
TALL_SHOES = {"boots": 130, "booties": 80, "heeled boots": 110, "flat boots": 110, "over-the-knee boots": 230}


class Mask:
    def __init__(self, path):
        a = np.asarray(Image.open(path).convert("RGBA"))[:, :, 3] > 40
        self.a = a
        self.h, self.w = a.shape
        cols = np.where(a.any(0))[0]
        self.cx = (cols.min() + cols.max()) / 2 if len(cols) else self.w / 2

    def is_photo(self):
        """Background not removed (model shots, products filling the frame)."""
        k = max(2, self.h // 20)
        a = self.a
        return float(np.mean([a[:k, :k].mean(), a[:k, -k:].mean(), a[-k:, :k].mean(), a[-k:, -k:].mean()])) > 0.5

    def n_big_parts(self, frac=0.15):
        labels, n = ndimage.label(self.a)
        if n == 0:
            return 0
        sizes = ndimage.sum(self.a, labels, range(1, n + 1))
        return int((sizes >= frac * sizes.sum()).sum())

    def central_runs(self, lo, hi):
        """Width and centre of the run through the centre column, for rows in [lo, hi) of the height."""
        c = int(round(self.cx))
        widths, centres = [], []
        for y in range(int(lo * self.h), max(int(hi * self.h), int(lo * self.h) + 1)):
            row = self.a[y]
            if not row[c]:
                continue
            left = c
            while left > 0 and row[left - 1]:
                left -= 1
            right = c
            while right < self.w - 1 and row[right + 1]:
                right += 1
            widths.append(right - left + 1)
            centres.append((left + right) / 2)
        if not widths:
            return self.w, self.w / 2
        return float(np.median(widths)), float(np.median(centres))


def place(fine, slot, m: Mask):
    """Return (left, top, width, z[, mirror_pair]) in figure units."""
    W, H = m.w, m.h

    def by_width(target, cx_px=None, max_h=None, max_w=None):
        s = target / W
        if max_h:
            s = min(s, max_h / H)
        if max_w:
            s = min(s, max_w / W)
        return s

    def anchored(s, x_centre, top, cx_px=None):
        cx_px = m.cx if cx_px is None else cx_px
        return x_centre - cx_px * s, top, W * s

    if slot == "tops":
        tw, tcx = m.central_runs(0.50, 0.80)
        s = min(86 / tw, 330 / H, 230 / W)
        top = 90 if fine in ("turtleneck sweater", "hoodie") else NECK_Y
        # crop tops would leave a gap above the waistband: lengthen up to 30%
        s_len = (WAIST_Y + 14 - top) / H
        s = max(s, min(s_len, 1.3 * s))
        return (*anchored(s, CX, top, tcx), 4)

    if slot == "outerwear":
        tw, tcx = m.central_runs(0.45, 0.75)
        s = min(98 / tw, 400 / H, 250 / W)
        return (*anchored(s, CX, 94, tcx), 6)

    if slot == "all-body":
        tw, tcx = m.central_runs(0.12, 0.28)
        s_w = 84 / tw
        if fine in ("gown", "jumpsuit") or H / W >= 2.6:
            bottom = ANKLE_Y + 4          # maxi / full length
        elif fine in ("swimsuit", "one-piece swimsuit"):
            bottom = 300                  # hips
        elif fine == "romper":
            bottom = 330
        else:
            bottom = 430                  # knee-length dress
        s_h = (bottom - NECK_Y) / H
        s = float(np.clip(np.sqrt(s_w * s_h), 0.8 * s_h, 1.15 * s_h))
        s = min(s, 210 / W)
        return (*anchored(s, CX, NECK_Y, tcx), 4)

    if slot == "bottoms":
        ww, wcx = m.central_runs(0.01, 0.06)
        s = 74 / ww
        if fine in LONG_BOTTOMS:
            s_h = (ANKLE_Y - WAIST_Y) / H
            s = float(np.clip(np.sqrt(s * s_h), 0.85 * s_h, 1.1 * s_h))
            s = min(s, 120 / W)           # folded / sideways photos
        else:
            s = min(s, (ANKLE_Y - WAIST_Y) / H, 150 / W)
        return (*anchored(s, CX, WAIST_Y, wcx), 3)

    if slot == "shoes":
        max_h = TALL_SHOES.get(fine, 56)
        if m.n_big_parts() >= 2:          # photographed as a pair
            s = by_width(72, max_h=max_h)
            return (*anchored(s, CX, FLOOR_Y - H * s), 2)
        s = by_width(42, max_h=max_h)     # single shoe: right foot, mirrored onto the left
        return (*anchored(s, 165, FLOOR_Y - H * s), 2, 1)

    if slot == "hats":
        s = by_width(74, max_h=60)
        return (*anchored(s, CX, BROW_Y + 6 - H * s), 11)

    if slot == "sunglasses":
        s = by_width(58, max_h=26)
        return (*anchored(s, CX, EYE_Y + 1 - H * s / 2), 10)

    if slot == "scarves":
        s = by_width(54, max_h=110)
        return (*anchored(s, CX, 94), 7)

    if slot == "bags":
        if fine == "clutch":
            s = by_width(64, max_h=48)
            return (*anchored(s, R_HAND[0], R_HAND[1] - H * s / 2), 9)
        target = {"tote": 82, "backpack": 70}.get(fine, 72)
        s = by_width(target, max_h=110)
        return (*anchored(s, R_HAND[0] + 2, R_HAND[1] - 26), 9)

    if slot == "jewellery":
        if fine in ("necklace", "pendant"):
            s = by_width(48, max_h=90)
            return (*anchored(s, CX, NECK_Y - 4), 8)
        if fine == "earrings":
            s = by_width(16, max_h=26)
            return (*anchored(s, 176, 60), 10)
        if fine == "ring":
            s = by_width(13, max_h=13)
            return (*anchored(s, R_HAND[0], R_HAND[1] - 4), 10)
        # bracelet / watch: on the left wrist
        s = by_width(24, max_h=24)
        return (*anchored(s, L_HAND[0] + 2, L_HAND[1] - 26), 8)

    # accessories
    if fine in ("belt", "male belt"):
        s = by_width(84, max_h=26)
        return (*anchored(s, CX, WAIST_Y - 4 - H * s / 2), 5)
    if fine == "headband":
        s = by_width(56, max_h=22)
        return (*anchored(s, CX, 26), 11)
    if fine in ("socks", "male socks"):
        s = by_width(62, max_h=80)
        return (*anchored(s, CX, FLOOR_Y - 6 - H * s), 1)
    if fine in ("hosiery", "stockings"):
        s = min((ANKLE_Y - 300) / H, 70 / W)
        return (*anchored(s, CX, 300), 1)
    if fine == "tie":
        s = by_width(18, max_h=130)
        return (*anchored(s, CX, NECK_Y + 2), 7)
    if fine == "gloves":
        s = by_width(34, max_h=50)
        return (*anchored(s, L_HAND[0], L_HAND[1] - 30), 9)
    # umbrella, phone case, wallet, key chain, ... held in the left hand
    s = by_width(40, max_h=70)
    return (*anchored(s, L_HAND[0], L_HAND[1] - 20), 9)


def main():
    cat = pd.read_parquet(ROOT / "artifacts" / "catalog.parquet")
    fit = {}
    for r in cat.itertuples():
        m = Mask(CUT / f"{r.item_id}.webp")
        left, top, width, z, *mirror = place(r.fine_type, r.semantic_category, m)
        if m.is_photo():
            # can't be cut out: pin a small framed snapshot at the same spot instead
            height = width * m.h / m.w
            f = min(1.0, 72 / width, 90 / height)
            cx, cy = left + width / 2, top + height / 2
            width, height = width * f, height * f
            left, top = cx - width / 2, cy - height / 2
            fit[r.item_id] = [round(left, 1), round(top, 1), round(width, 1), z + 20, 0, 1]
            continue
        fit[r.item_id] = [round(left, 1), round(top, 1), round(width, 1), z, *mirror]
    (ROOT / "web" / "public" / "fit.json").write_text(json.dumps(fit, separators=(",", ":")))
    print(f"{len(fit)} placements written")


if __name__ == "__main__":
    main()
