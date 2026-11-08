"""Cut catalog items out of their white studio backgrounds for the dress-up figure.

Run from the project root (after export_catalog.py):  .venv/bin/python model/make_cutouts.py
Writes web/public/cutouts/<item_id>.webp (transparent background, trimmed to the item).
"""
import zipfile
from concurrent.futures import ProcessPoolExecutor
from io import BytesIO
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "public" / "cutouts"


def cutout(img: Image.Image) -> Image.Image:
    rgb = np.asarray(img.convert("RGB"), dtype=np.int16)
    near_white = (rgb.min(axis=2) > 232) & (np.ptp(rgb, axis=2) < 18)
    candidate = near_white
    # studio shots on a plain grey/coloured backdrop: use the border's colour too
    edge = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(edge, axis=0)
    if (np.linalg.norm(edge - bg, axis=1) < 26).mean() > 0.7:
        candidate = candidate | (np.linalg.norm(rgb - bg, axis=2) < 26)
    # background = candidate regions connected to the image border
    labels, _ = ndimage.label(candidate)
    border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    bg = np.isin(labels, border[border > 0])
    alpha = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    out = img.convert("RGBA")
    out.putalpha(alpha)
    box = alpha.point(lambda v: 255 if v > 24 else 0).getbbox()
    return out.crop(box) if box else out


def _work(ids):
    with zipfile.ZipFile(ROOT / "data" / "images.zip") as z:
        for i in ids:
            im = cutout(Image.open(BytesIO(z.read(f"images/{i}.jpg"))))
            im.thumbnail((320, 320))
            im.save(OUT / f"{i}.webp", quality=82, method=4)


def main():
    cat = pd.read_parquet(ROOT / "artifacts" / "catalog.parquet")
    OUT.mkdir(parents=True, exist_ok=True)
    todo = list(cat.item_id)
    with ProcessPoolExecutor() as ex:
        list(ex.map(_work, [todo[k:k + 50] for k in range(0, len(todo), 50)]))
    size = sum(p.stat().st_size for p in OUT.glob("*.webp")) / 1e6
    print(f"{len(cat)} cutouts, {size:.1f} MB")


if __name__ == "__main__":
    main()
