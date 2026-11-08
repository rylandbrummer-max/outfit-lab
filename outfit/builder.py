"""Outfit building on top of the fitted compatibility pipeline.

The MODEL only answers: "how likely is this set of items a real, user-made outfit?"
Everything else here (slot templates, color filters, the bold/matching slider,
random variety) is hand-written app logic, NOT learned or validated.
"""
import numpy as np
import pandas as pd

from .data import ITEM_FIELDS

SLOT_TO_CATEGORY = {
    "top": "tops", "bottom": "bottoms", "dress": "all-body", "outerwear": "outerwear",
    "shoes": "shoes", "bag": "bags", "jewellery": "jewellery", "hat": "hats",
    "sunglasses": "sunglasses", "scarf": "scarves", "accessory": "accessories",
}
CATEGORY_TO_SLOT = {v: k for k, v in SLOT_TO_CATEGORY.items()}
CANDIDATES_PER_SLOT = 120


class Catalog:
    def __init__(self, df: pd.DataFrame):
        self.df = df.set_index("item_id", drop=False)
        self.records = self.df[ITEM_FIELDS].to_dict("index")

    def __contains__(self, item_id):
        return item_id in self.records

    def public(self, item_id):
        r = self.df.loc[item_id]
        return {"item_id": item_id, "name": r["name"], "category": r["semantic_category"],
                "slot": CATEGORY_TO_SLOT[r["semantic_category"]], "fine_type": r["fine_type"],
                "color_family": r["color_family"], "hex": r["hex"],
                "image": f"/items/{item_id}.jpg"}


def score(pipeline, catalog, outfits_ids):
    """Model probability that each outfit (list of item ids) is a real outfit."""
    return pipeline.predict_proba([[catalog.records[i] for i in o] for o in outfits_ids])[:, 1]


def item_impacts(pipeline, catalog, ids):
    """How much the score drops when each item is removed (needs >= 3 items)."""
    if len(ids) < 3:
        return {i: None for i in ids}
    full = score(pipeline, catalog, [ids])[0]
    without = score(pipeline, catalog, [[j for j in ids if j != i] for i in ids])
    return {i: round(float(full - w), 4) for i, w in zip(ids, without)}


def _logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def build(pipeline, catalog, slots, locked=(), avoid_colors=(), style=0.0,
          closet=None, seed=None):
    """Greedy: fill each empty slot with the candidate that maximises the model score
    (plus the hand-set style nudge), sampling among the top few for variety."""
    rng = np.random.default_rng(seed)
    df = catalog.df
    pool = df[~df.color_family.isin(avoid_colors)]
    if closet:
        pool = pool[pool.item_id.isin(set(closet))]

    chosen = list(locked)
    filled = {CATEGORY_TO_SLOT[catalog.records[i]["semantic_category"]] for i in chosen}
    todo = [s for s in slots if s not in filled]
    # a dress replaces top + bottom
    if "dress" in filled or "dress" in todo:
        todo = [s for s in todo if s not in ("top", "bottom")]
    notes = []

    for slot in todo:
        cands = pool[(pool.semantic_category == SLOT_TO_CATEGORY[slot]) & ~pool.item_id.isin(chosen)]
        if cands.empty:
            notes.append(f"No {slot} available with the current filters; skipped.")
            continue
        cands = cands.sample(min(len(cands), CANDIDATES_PER_SLOT), random_state=int(rng.integers(1 << 31)))
        ids = cands.item_id.tolist()
        if not chosen:  # nothing to match against yet: random start
            chosen.append(ids[0])
            continue
        p = score(pipeline, catalog, [chosen + [c] for c in ids])
        utility = _logit(p)
        if style:
            # style > 0 rewards contrast with the outfit so far, < 0 rewards matching
            cur = np.array([[catalog.records[i][k] for k in ("L", "a", "b")] for i in chosen]).mean(0)
            dist = np.linalg.norm(cands[["L", "a", "b"]].to_numpy() - cur, axis=1)
            utility = utility + 1.5 * style * (dist - dist.mean()) / (dist.std() + 1e-9)
        top = np.argsort(-utility)[:4]
        w = np.exp(utility[top] - utility[top].max())
        chosen.append(ids[rng.choice(top, p=w / w.sum())])

    return chosen, notes
