"""Pick a demo catalog of items the model never trained on and export it.

Run from the project root:  .venv/bin/python model/export_catalog.py
Writes artifacts/catalog.parquet (features for the API) and
web/public/items/<item_id>.jpg (images for the website).
"""
import zipfile
from urllib.parse import unquote
from io import BytesIO
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PER_CATEGORY = 240
MIN_PER_CATEGORY = 60

# Lab hue bins (30 degrees each, index 12 = low chroma) -> color family shown in the UI
FAMILY = {0: "pink", 11: "pink", 1: "red/rust", 2: "tan/beige", 3: "yellow", 4: "yellow",
          5: "green/teal", 6: "green/teal", 7: "blue", 8: "blue", 9: "blue", 10: "purple", 12: "neutral"}


def lab_to_hex(L, a, b):
    fy = (L + 16) / 116
    f = np.array([fy + a / 500, fy, fy - b / 200])
    xyz = np.where(f > 0.2069, f ** 3, (f - 16 / 116) / 7.787) * np.array([0.95047, 1.0, 1.08883])
    m = np.array([[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]])
    rgb = np.clip(m @ xyz, 0, 1)
    rgb = np.where(rgb > 0.0031308, 1.055 * rgb ** (1 / 2.4) - 0.055, 12.92 * rgb)
    return "#" + "".join(f"{int(round(c * 255)):02x}" for c in np.clip(rgb, 0, 1))


def main():
    df = pd.read_parquet(ROOT / "data" / "items.parquet")
    pool = df[(df.first_split == "valid") & df.url_name.str.strip().astype(bool)]
    picks = []
    for cat, g in pool.groupby("semantic_category"):
        picks.append(g.sample(min(len(g), PER_CATEGORY), random_state=42))
        assert len(picks[-1]) >= MIN_PER_CATEGORY, cat
    cat_df = pd.concat(picks).reset_index(drop=True)
    cat_df["dom_color"] = cat_df["dom_color"].astype(int)
    cat_df["color_family"] = cat_df.dom_color.map(FAMILY)
    cat_df["hex"] = [lab_to_hex(r.L, r.a, r.b) for r in cat_df.itertuples()]
    cat_df["name"] = cat_df.url_name.map(lambda s: unquote(s).strip()[:80])

    out = ROOT / "web" / "public" / "items"
    out.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ROOT / "data" / "images.zip") as z:
        for i in cat_df.item_id:
            img = Image.open(BytesIO(z.read(f"images/{i}.jpg"))).convert("RGB")
            img.thumbnail((240, 240))
            img.save(out / f"{i}.jpg", quality=80, optimize=True)

    cat_df.drop(columns=["first_split"]).to_parquet(ROOT / "artifacts" / "catalog.parquet", index=False)
    print(cat_df.semantic_category.value_counts().to_string())
    print(cat_df.color_family.value_counts().to_string())
    size = sum(p.stat().st_size for p in out.glob("*.jpg")) / 1e6
    print(f"{len(cat_df)} catalog items, images {size:.1f} MB")


if __name__ == "__main__":
    main()
