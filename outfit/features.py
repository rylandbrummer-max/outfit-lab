"""OutfitFeaturizer: turns an outfit (a list of item records) into one feature row.

Input X: a list of outfits. Each outfit is a list of item dicts with keys
  semantic_category, fine_type, dom_color, L, a, b, chroma, h0..h12, url_name.

Learned state (fit on real outfits only, i.e. y == 1):
  * pair_pmi_type   - how much more often two fine types (e.g. "sneakers", "jeans")
                      appear together in real outfits than chance predicts
  * pair_pmi_color  - same for two dominant colors
  * pair_pmi_tc     - same for (fine type of one item, dominant color of another)

fit_transform uses out-of-fold tables so a training outfit never sees co-occurrence
counts that include itself (otherwise the model learns that train positives
"look" compatible because they built the tables).
"""
from collections import Counter
from itertools import combinations

import numpy as np
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.model_selection import KFold

SEMANTIC = ["accessories", "all-body", "bags", "bottoms", "hats", "jewellery",
            "outerwear", "scarves", "shoes", "sunglasses", "tops"]
N_HIST = 13
STOP = {"and", "the", "with", "in", "of", "a", "for", "by", "to", "on", "s"}


def _tokens(name):
    return {t for t in str(name).lower().replace("-", " ").split() if len(t) > 1 and t not in STOP}


class PMITable:
    """Smoothed pointwise mutual information over unordered pairs."""

    def __init__(self, alpha=1.0):
        self.alpha = alpha

    def fit(self, pair_lists):
        pairs, single = Counter(), Counter()
        for plist in pair_lists:
            for a, b in plist:
                key = (a, b) if a <= b else (b, a)
                pairs[key] += 1
                single[a] += 1
                single[b] += 1
        self.pairs, self.single = pairs, single
        self.n_pairs = max(sum(pairs.values()), 1)
        self.n_single = max(sum(single.values()), 1)
        self.vocab = max(len(single), 1)
        return self

    def __call__(self, a, b):
        key = (a, b) if a <= b else (b, a)
        al = self.alpha
        p_ab = (self.pairs.get(key, 0) + al) / (self.n_pairs + al * self.vocab ** 2)
        p_a = (self.single.get(a, 0) + al) / (self.n_single + al * self.vocab)
        p_b = (self.single.get(b, 0) + al) / (self.n_single + al * self.vocab)
        return float(np.log(p_ab / (p_a * p_b)))


def _type_pairs(o):
    return list(combinations([str(i["fine_type"]) for i in o], 2))


def _color_pairs(o):
    return list(combinations([str(i["dom_color"]) for i in o], 2))


def _tc_pairs(o):
    return [(f"t:{x['fine_type']}", f"c:{y['dom_color']}")
            for x in o for y in o if x is not y]


def _stats(v, prefix):
    v = np.asarray(v, float) if len(v) else np.zeros(1)
    return {f"{prefix}_mean": v.mean(), f"{prefix}_min": v.min(), f"{prefix}_max": v.max()}


class OutfitFeaturizer(BaseEstimator, TransformerMixin):
    def __init__(self, alpha=1.0, n_folds=5, random_state=0):
        self.alpha = alpha
        self.n_folds = n_folds
        self.random_state = random_state

    # ---------- learned state ----------
    def _fit_tables(self, X, y):
        pos = [o for o, lab in zip(X, y) if lab == 1]
        return (PMITable(self.alpha).fit(map(_type_pairs, pos)),
                PMITable(self.alpha).fit(map(_color_pairs, pos)),
                PMITable(self.alpha).fit(map(_tc_pairs, pos)))

    def fit(self, X, y):
        X, y = list(X), np.asarray(y)
        self.tables_ = self._fit_tables(X, y)
        self.feature_names_ = list(self._row(X[0], self.tables_).keys())
        self.n_real_outfits_ = int((y == 1).sum())
        return self

    def fit_transform(self, X, y=None, **_):
        X, y = list(X), np.asarray(y)
        self.fit(X, y)
        out = np.zeros((len(X), len(self.feature_names_)))
        kf = KFold(self.n_folds, shuffle=True, random_state=self.random_state)
        for tr, te in kf.split(X):
            tables = self._fit_tables([X[i] for i in tr], y[tr])
            for i in te:
                out[i] = list(self._row(X[i], tables).values())
        return out

    def transform(self, X):
        return np.array([list(self._row(o, self.tables_).values()) for o in X])

    def get_feature_names_out(self, input_features=None):
        return np.array(self.feature_names_)

    # ---------- one outfit -> one row ----------
    @staticmethod
    def _row(o, tables):
        t_pmi, c_pmi, tc_pmi = tables
        n = len(o)
        r = {"n_items": n}
        cnt = Counter(i["semantic_category"] for i in o)
        for s in SEMANTIC:
            r[f"n_{s}"] = cnt.get(s, 0)

        r |= _stats([t_pmi(a, b) for a, b in _type_pairs(o)], "pmi_type")
        r |= _stats([c_pmi(a, b) for a, b in _color_pairs(o)], "pmi_color")
        r |= _stats([tc_pmi(a, b) for a, b in _tc_pairs(o)], "pmi_typecolor")

        lab = np.array([[i["L"], i["a"], i["b"]] for i in o], float)
        hist = np.array([[i[f"h{k}"] for k in range(N_HIST)] for i in o], float)
        pairs = list(combinations(range(n), 2))
        r |= _stats([np.linalg.norm(lab[p] - lab[q]) for p, q in pairs], "color_dist")
        r |= _stats([np.minimum(hist[p], hist[q]).sum() for p, q in pairs], "hue_overlap")
        chroma = np.array([i["chroma"] for i in o], float)
        r["lightness_std"] = lab[:, 0].std()
        r["chroma_mean"] = chroma.mean()
        r["chroma_max"] = chroma.max()
        r["n_colorful"] = int((chroma > 20).sum())
        r["neutral_frac"] = float(np.mean([int(i["dom_color"]) == N_HIST - 1 for i in o]))
        r["distinct_colors"] = len({int(i["dom_color"]) for i in o}) / n

        toks = [_tokens(i.get("url_name", "")) for i in o]
        jac = [len(toks[p] & toks[q]) / max(len(toks[p] | toks[q]), 1) for p, q in pairs]
        r |= _stats(jac, "name_overlap")
        return r


class CategoryMix(BaseEstimator, TransformerMixin):
    """Baseline features: outfit size + count of each broad category. Nothing learned."""

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        return np.array([[len(o)] + [sum(i["semantic_category"] == s for i in o) for s in SEMANTIC]
                         for o in X])

    def get_feature_names_out(self, input_features=None):
        return np.array(["n_items"] + [f"n_{s}" for s in SEMANTIC])
