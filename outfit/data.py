"""Load items and the disjoint compatibility / fill-in-the-blank tasks."""
import json
from pathlib import Path

import pandas as pd

DATA = Path(__file__).resolve().parent.parent / "data"
ITEM_FIELDS = ["semantic_category", "fine_type", "dom_color", "L", "a", "b", "chroma",
               *[f"h{k}" for k in range(13)], "url_name"]


def load_items():
    """item_id -> record dict with exactly the fields the featurizer needs."""
    df = pd.read_parquet(DATA / "items.parquet")
    df["dom_color"] = df["dom_color"].astype(int)
    return df.set_index("item_id")[ITEM_FIELDS].to_dict("index")


def _slot_map(split):
    return {o["set_id"]: {i["index"]: i["item_id"] for i in o["items"]}
            for o in json.load(open(DATA / "disjoint" / f"{split}.json"))}


def _resolve(slots, ref):
    set_id, idx = ref.rsplit("_", 1)
    return slots[set_id][int(idx)]


def load_compatibility(split, items):
    """Returns (outfits as lists of item records, labels, outfits as item-id lists)."""
    slots = _slot_map(split)
    X, y, ids = [], [], []
    for line in open(DATA / "disjoint" / f"compatibility_{split}.txt"):
        parts = line.split()
        oid = [_resolve(slots, r) for r in parts[1:]]
        X.append([items[i] for i in oid])
        y.append(int(parts[0]))
        ids.append(oid)
    return X, y, ids


def load_fitb(split):
    """Returns list of (question item ids, [4 candidate item ids], index of correct one)."""
    slots = _slot_map(split)
    out = []
    for q in json.load(open(DATA / "disjoint" / f"fill_in_blank_{split}.json")):
        set_id = q["question"][0].rsplit("_", 1)[0]
        cands = q["answers"]
        correct = [c.rsplit("_", 1)[0] for c in cands].index(set_id)
        out.append(([_resolve(slots, r) for r in q["question"]],
                    [_resolve(slots, c) for c in cands], correct))
    return out
