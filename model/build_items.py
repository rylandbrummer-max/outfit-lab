"""Build the per-item feature table: metadata + fine type + image color features.

Run from the project root:  .venv/bin/python model/build_items.py
Writes data/items.parquet (one row per item that appears in any disjoint outfit).
"""
import json
import zipfile
from concurrent.futures import ProcessPoolExecutor
from io import BytesIO
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

DATA = Path(__file__).resolve().parent.parent / "data"
ZIP = DATA / "images.zip"
N_HUE = 12  # hue bins; index 12 = neutral (black/white/gray)

_zip = None


def _srgb_to_lab(rgb):
    """rgb: (n,3) floats 0-1 -> (n,3) CIE Lab (D65)."""
    c = np.where(rgb > 0.04045, ((rgb + 0.055) / 1.055) ** 2.4, rgb / 12.92)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[:, 1] - 16, 500 * (f[:, 0] - f[:, 1]), 200 * (f[:, 1] - f[:, 2])], 1)


def image_features(img):
    """Color summary of the garment, ignoring the white studio background."""
    a = np.asarray(img.convert("RGB").resize((64, 64)), dtype=np.float32) / 255.0
    px = a.reshape(-1, 3)
    fg = px.min(1) < 0.92  # near-white pixels are background
    if fg.sum() < 40:  # almost all white: a white item
        fg = np.ones(len(px), bool)
    lab = _srgb_to_lab(px[fg])
    L, A, B = lab[:, 0], lab[:, 1], lab[:, 2]
    chroma = np.hypot(A, B)
    hue = (np.degrees(np.arctan2(B, A)) + 360) % 360
    hist = np.zeros(N_HUE + 1)
    colorful = chroma > 12
    np.add.at(hist, (hue[colorful] // (360 / N_HUE)).astype(int), 1)
    hist[N_HUE] = (~colorful).sum()
    hist /= hist.sum()
    return {
        "L": float(L.mean()), "a": float(A.mean()), "b": float(B.mean()),
        "L_std": float(L.std()), "chroma": float(chroma.mean()),
        "fg_frac": float(fg.mean()),
        "dom_color": int(hist.argmax()),
        **{f"h{i}": float(hist[i]) for i in range(N_HUE + 1)},
    }


def _work(ids):
    global _zip
    if _zip is None:
        _zip = zipfile.ZipFile(ZIP)
    out = []
    for i in ids:
        try:
            with _zip.open(f"images/{i}.jpg") as f:
                out.append({"item_id": i, **image_features(Image.open(BytesIO(f.read())))})
        except KeyError:
            out.append({"item_id": i})
    return out


def main():
    meta = json.load(open(DATA / "polyvore_item_metadata.json"))
    cats = pd.read_csv(DATA / "categories.csv", header=None, names=["category_id", "fine_type", "semantic"])
    fine = dict(zip(cats.category_id.astype(str), cats.fine_type))

    ids, split_of = [], {}
    for split in ["train", "valid", "test"]:
        for o in json.load(open(DATA / "disjoint" / f"{split}.json")):
            for it in o["items"]:
                split_of.setdefault(it["item_id"], split)  # first split that uses it
    ids = sorted(split_of)
    print(f"{len(ids):,} items used by disjoint outfits")

    chunks = [ids[i:i + 2000] for i in range(0, len(ids), 2000)]
    rows = []
    with ProcessPoolExecutor() as ex:
        for n, part in enumerate(ex.map(_work, chunks), 1):
            rows += part
            print(f"  {n}/{len(chunks)} chunks", end="\r")
    img = pd.DataFrame(rows).set_index("item_id")

    df = pd.DataFrame({
        "item_id": ids,
        "url_name": [meta[i]["url_name"] for i in ids],
        "semantic_category": [meta[i]["semantic_category"] for i in ids],
        "fine_type": [fine.get(meta[i]["category_id"], "unknown") for i in ids],
        "first_split": [split_of[i] for i in ids],
    }).set_index("item_id").join(img)
    print(f"\nmissing images: {df['L'].isna().sum()}")
    df.reset_index().to_parquet(DATA / "items.parquet", index=False)
    print("wrote data/items.parquet", df.shape)


if __name__ == "__main__":
    main()
