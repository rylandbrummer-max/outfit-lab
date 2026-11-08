"""Train baseline + 2 candidate models, compare on the validation split, save the best.

Run from the project root:  .venv/bin/python model/train.py
The test split is NOT touched here; it is reserved for the final report.
"""
import json
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import sklearn
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from outfit.data import load_compatibility, load_fitb, load_items  # noqa: E402
from outfit.features import CategoryMix, OutfitFeaturizer  # noqa: E402


def make_models():
    return {
        "baseline_category_mix": Pipeline([
            ("features", CategoryMix()), ("scale", StandardScaler()),
            ("clf", LogisticRegression(max_iter=1000))]),
        "logistic_regression": Pipeline([
            ("features", OutfitFeaturizer()), ("scale", StandardScaler()),
            ("clf", LogisticRegression(C=0.5, max_iter=2000))]),
        "gradient_boosting": Pipeline([
            ("features", OutfitFeaturizer()),
            ("clf", HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05,
                                                   max_leaf_nodes=31, l2_regularization=1.0,
                                                   random_state=0))]),
    }


def fitb_eval(model, fitb, items):
    outfits, owners = [], []
    for qi, (question, cands, _) in enumerate(fitb):
        for c in cands:
            outfits.append([items[i] for i in question + [c]])
            owners.append(qi)
    p = model.predict_proba(outfits)[:, 1].reshape(len(fitb), 4)
    picks = p.argmax(1)
    correct = np.array([pk == ans for pk, (_, _, ans) in zip(picks, fitb)])
    return correct


def by_group(values, groups):
    d = defaultdict(list)
    for v, g in zip(values, groups):
        d[g].append(v)
    return d


def main():
    t0 = time.time()
    items = load_items()
    Xtr, ytr, _ = load_compatibility("train", items)
    Xva, yva, _ = load_compatibility("valid", items)
    fitb_va = load_fitb("valid")
    print(f"train {len(Xtr):,} outfits | valid {len(Xva):,} outfits | valid FITB {len(fitb_va):,}")

    results, fitted = {}, {}
    for name, model in make_models().items():
        s = time.time()
        model.fit(Xtr, ytr)
        p = model.predict_proba(Xva)[:, 1]
        correct = fitb_eval(model, fitb_va, items)
        results[name] = {
            "valid_auc": round(roc_auc_score(yva, p), 4),
            "valid_accuracy": round(accuracy_score(yva, p > 0.5), 4),
            "valid_fitb_accuracy": round(correct.mean(), 4),
            "fit_seconds": round(time.time() - s, 1),
        }
        fitted[name] = (model, p, correct)
        print(f"{name:24s} {results[name]}")

    best = max((n for n in results if n != "baseline_category_mix"),
               key=lambda n: results[n]["valid_auc"])
    model, p, correct = fitted[best]
    print(f"selected: {best}")

    # ---- error analysis on validation, for the selected model ----
    sizes = ["2-3" if len(o) <= 3 else "4-5" if len(o) <= 5 else "6+" for o in Xva]
    size_auc = {}
    for g, idx in by_group(range(len(Xva)), sizes).items():
        yy, pp = np.array(yva)[idx], p[idx]
        size_auc[g] = {"n_outfits": len(idx), "auc": round(roc_auc_score(yy, pp), 4)}
    blank_cat = [items[c[ans]]["semantic_category"] for _, c, ans in fitb_va]
    fitb_cat = {g: {"n_questions": len(v), "fitb_accuracy": round(float(np.mean(v)), 4)}
                for g, v in sorted(by_group(correct, blank_cat).items())}

    feat = model.named_steps["features"]
    importance = None
    if best == "logistic_regression":
        coef = model.named_steps["clf"].coef_[0]
        order = np.argsort(-np.abs(coef))[:12]
        importance = {feat.feature_names_[i]: round(float(coef[i]), 3) for i in order}

    report = {
        "selected_model": best,
        "comparison": results,
        "error_analysis": {"auc_by_outfit_size": size_auc, "fitb_by_blank_category": fitb_cat},
        "top_coefficients": importance,
        "chance_level": {"auc": 0.5, "fitb_accuracy": 0.25},
    }
    (ROOT / "reports").mkdir(exist_ok=True)
    json.dump(report, open(ROOT / "reports" / "metrics.json", "w"), indent=2)

    (ROOT / "artifacts").mkdir(exist_ok=True)
    bundle = {
        "pipeline": model,
        "model_name": best,
        "sklearn_version": sklearn.__version__,
        "numpy_version": np.__version__,
        "python_version": sys.version.split()[0],
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "train_data": "Polyvore Outfits disjoint/compatibility_train.txt",
        "n_train_outfits": len(Xtr),
        "feature_names": feat.feature_names_,
        "valid_metrics": results[best],
        "baseline_valid_metrics": results["baseline_category_mix"],
    }
    joblib.dump(bundle, ROOT / "artifacts" / "outfit_model.joblib", compress=3)
    print(json.dumps(report["error_analysis"], indent=1))
    print(f"saved artifacts/outfit_model.joblib  ({time.time() - t0:.0f}s total)")


if __name__ == "__main__":
    main()
