"""FastAPI service for the outfit compatibility model.

Local:  .venv/bin/uvicorn api.main:app --reload      (from the project root)
Docs:   http://127.0.0.1:8000/docs
"""
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from outfit.builder import SLOT_TO_CATEGORY, Catalog, build, item_impacts, score  # noqa: E402

ARTIFACT_DIR = Path(os.environ.get("ARTIFACT_DIR", ROOT / "artifacts"))
STATE: dict = {}

Slot = Literal[tuple(SLOT_TO_CATEGORY)]
ColorFamily = Literal["neutral", "red/rust", "pink", "tan/beige", "yellow", "green/teal", "blue", "purple"]
Category = Literal[tuple(SLOT_TO_CATEGORY.values())]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load once per server process; never retrain while serving.
    try:
        STATE["bundle"] = joblib.load(ARTIFACT_DIR / "outfit_model.joblib")
        STATE["catalog"] = Catalog(pd.read_parquet(ARTIFACT_DIR / "catalog.parquet"))
    except FileNotFoundError as e:
        STATE.clear()
        STATE["error"] = f"artifact missing: {Path(e.filename).name}"
    yield


app = FastAPI(title="Outfit Compatibility API", version="1.0.0", lifespan=lifespan,
              description="Scores how likely a set of Polyvore items is a real, user-made outfit, "
                          "and builds outfits by greedily maximising that score.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def _ready():
    if "bundle" not in STATE:
        raise HTTPException(503, STATE.get("error", "model not loaded"))
    return STATE["bundle"]["pipeline"], STATE["catalog"]


def _check_ids(catalog, ids):
    unknown = [i for i in ids if i not in catalog]
    if unknown:
        raise HTTPException(422, f"unknown item_id(s): {unknown[:5]}")


def _verdict(p):
    return "strong" if p >= 0.75 else "good" if p >= 0.5 else "weak" if p >= 0.25 else "clashing"


# ---------- schemas ----------
class ScoreRequest(BaseModel):
    item_ids: list[str] = Field(min_length=2, max_length=16, examples=[["211990161", "211863963"]])

    @field_validator("item_ids")
    @classmethod
    def unique(cls, v):
        if len(set(v)) != len(v):
            raise ValueError("item_ids must be unique")
        return v


class ScoredItem(BaseModel):
    item_id: str
    name: str
    category: str
    slot: str
    fine_type: str
    color_family: str
    hex: str
    image: str
    impact: float | None = Field(None, description="Score drop if this item is removed")


class ScoreResponse(BaseModel):
    score: float = Field(description="Model probability the outfit is real/compatible (0-1)")
    verdict: Literal["strong", "good", "weak", "clashing"]
    items: list[ScoredItem]


class BuildRequest(BaseModel):
    slots: list[Slot] = Field(default=["top", "bottom", "shoes", "bag", "jewellery"],
                              min_length=1, max_length=11)
    locked_ids: list[str] = Field(default=[], max_length=10)
    avoid_colors: list[ColorFamily] = []
    style: float = Field(0.0, ge=-1, le=1, description="-1 = matching colors, +1 = bold contrast")
    closet_ids: list[str] | None = Field(None, max_length=3000)
    seed: int | None = None


class BuildResponse(ScoreResponse):
    notes: list[str]


# ---------- endpoints ----------
@app.get("/health")
def health():
    return {"status": "ok" if "bundle" in STATE else "unavailable",
            "model_loaded": "bundle" in STATE, "error": STATE.get("error")}


@app.get("/info")
def info():
    _ready()
    b = STATE["bundle"]
    return {k: b[k] for k in ("model_name", "sklearn_version", "numpy_version", "python_version",
                              "trained_at", "train_data", "n_train_outfits", "valid_metrics",
                              "baseline_valid_metrics")} | {
        "pipeline_steps": [name for name, _ in b["pipeline"].steps],
        "n_features": len(b["feature_names"]),
        "catalog_size": len(STATE["catalog"].df)}


@app.get("/catalog")
def catalog(category: Category | None = None, color: ColorFamily | None = None,
            q: str | None = Query(None, max_length=50),
            limit: int = Query(60, ge=1, le=300), offset: int = Query(0, ge=0)):
    _, cat = _ready()
    df = cat.df
    if category:
        df = df[df.semantic_category == category]
    if color:
        df = df[df.color_family == color]
    if q:
        df = df[df.name.str.contains(q, case=False, regex=False)]
    page = df.iloc[offset:offset + limit]
    return {"total": len(df), "items": [cat.public(i) for i in page.item_id]}


@app.post("/score", response_model=ScoreResponse)
def score_outfit(req: ScoreRequest):
    pipe, cat = _ready()
    _check_ids(cat, req.item_ids)
    p = float(score(pipe, cat, [req.item_ids])[0])
    imp = item_impacts(pipe, cat, req.item_ids)
    return {"score": round(p, 4), "verdict": _verdict(p),
            "items": [cat.public(i) | {"impact": imp[i]} for i in req.item_ids]}


@app.post("/build", response_model=BuildResponse)
def build_outfit(req: BuildRequest):
    pipe, cat = _ready()
    _check_ids(cat, req.locked_ids)
    if req.closet_ids:
        _check_ids(cat, req.closet_ids)
    ids, notes = build(pipe, cat, req.slots, req.locked_ids, req.avoid_colors,
                       req.style, req.closet_ids, req.seed)
    if len(ids) < 2:
        raise HTTPException(422, "could not build an outfit with at least 2 items; loosen the filters")
    p = float(score(pipe, cat, [ids])[0])
    imp = item_impacts(pipe, cat, ids)
    return {"score": round(p, 4), "verdict": _verdict(p), "notes": notes,
            "items": [cat.public(i) | {"impact": imp[i]} for i in ids]}
