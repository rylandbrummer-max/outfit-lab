# Outfit Lab: Polyvore outfit compatibility

Predicts whether a set of clothing items forms a real, user-made outfit, and uses that
score to build outfits. Includes a scikit-learn pipeline, a FastAPI service (Modal) and a Next.js + shadcn/ui
site (Vercel).

```
outfit/          shared Python package: features (custom transformer), data loading, outfit builder
model/           build_items.py → train.py → export_catalog.py
api/             main.py (FastAPI), modal_app.py (deploy)
artifacts/       outfit_model.joblib (fitted pipeline + metadata), catalog.parquet (demo items)
reports/         metrics.json (validation comparison + error analysis)
web/             Next.js site; item images in web/public/items/
data/            downloaded data (git-ignored; see below)
```

## Data

[Stylique/Polyvore](https://huggingface.co/datasets/Stylique/Polyvore) (MIT): a mirror of Polyvore Outfits,
Vasileva et al., ECCV 2018. The same 251,008 items as `owj0421/polyvore`. Download into `data/`:

```bash
B=https://huggingface.co/datasets/Stylique/Polyvore/resolve/main
mkdir -p data/disjoint && cd data
for f in categories.csv polyvore_item_metadata.json polyvore_outfit_titles.json README images.zip; do curl -fLO $B/$f; done
for s in train valid test; do for f in $s.json compatibility_$s.txt fill_in_blank_$s.json; do
  curl -fL -o disjoint/$f $B/disjoint/$f; done; done
```

**Task.** Each compatibility row is an outfit labelled 1 (real) or 0 (fake: items swapped for random items
of the *same broad category*). Real and fake outfits therefore have identical category mixes. The split is
**disjoint**: valid/test outfits share no items with train (84 items do overlap train/test, a small leak in the
source data). Train 16,995 / valid 3,000 / test 15,145 real outfits, each with one fake.

## Rebuild

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python model/build_items.py      # image color features for 152,785 items (~1-2 min)
.venv/bin/python model/train.py            # baseline + 2 models on validation, saves artifacts/
.venv/bin/python model/export_catalog.py   # 2,617 demo items + images for the site
.venv/bin/python model/make_cutouts.py     # transparent cut-outs for the dress-up figure
.venv/bin/python model/make_fit.py         # where each cut-out sits on the figure → web/public/fit.json
```

`train.py` never touches the test split; it's reserved for the final evaluation.

## Model

`OutfitFeaturizer` (custom transformer, `outfit/features.py`) turns an outfit (2–16 items) into 36 features:
- **Learned co-occurrence (PMI)** of fine type pairs (e.g. sneakers + jeans), color pairs, and type × color, fit
  on real training outfits only. `fit_transform` uses 5-fold out-of-fold tables, so a training outfit never
  scores itself.
- Color harmony from the images: pairwise Lab distance, hue-histogram overlap, lightness spread, saturation.
- Shared words across item names, outfit size, category counts.

| Validation (3,000 real + 3,000 fake) | AUC | FITB acc. (1 of 4) |
|---|---|---|
| Chance | 0.50 | 0.25 |
| Baseline: logistic regression on category mix | 0.500 | 0.253 |
| Logistic regression + OutfitFeaturizer | 0.829 | 0.522 |
| **Gradient boosting + OutfitFeaturizer** (selected) | **0.842** | **0.516** |

Checks:
- Training on shuffled labels gives a validation AUC of 0.48, so there's no pipeline leakage.
- Ablation: color features alone reach 0.79 AUC, PMI tables alone about 0.58 each, name overlap 0.63.
- Error analysis is in `reports/metrics.json`. Small outfits (2–3 items) are hardest (AUC 0.74 vs 0.89
  for 6+). FITB is weakest for accessories, bottoms and tops (42–47%).

Caveats:
- Fakes are random swaps, so "compatible" partly means "not random". Color coordination may also
  reflect items from the same shop sharing a photo style.
- Polyvore users skewed toward women's and luxury fashion, mid-2010s.
- The catalog contains some non-clothing junk (stickers, plants, graphics).
- The builder's preference controls (color filters, the matching↔bold slider) are hand-set app logic, not learned
  or validated.

## API

Live: https://rylandbrummer-max--outfit-lab-api-fastapi-app.us-east.modal.run
(docs at [`/docs`](https://rylandbrummer-max--outfit-lab-api-fastapi-app.us-east.modal.run/docs))

```bash
.venv/bin/uvicorn api.main:app --reload        # http://127.0.0.1:8000/docs
modal deploy api/modal_app.py                  # prints the public URL
```

| Endpoint | Purpose |
|---|---|
| `GET /health` | status, whether the model loaded |
| `GET /info` | model name, versions, training size, validation metrics |
| `GET /catalog?category=&color=&q=&limit=&offset=` | browse demo items |
| `POST /score` `{"item_ids": [...]}` | probability the outfit is real + each item's impact |
| `POST /build` `{"slots", "locked_ids", "avoid_colors", "style", "closet_ids", "seed"}` | greedy outfit builder |

Errors: unknown IDs, bad slots and out-of-range values return **422**. A missing artifact returns **503**
(test locally with `ARTIFACT_DIR=/nonexistent`). The model loads once per process and is never retrained while serving.

## Website

```bash
cd web && npm install
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 npm run dev     # http://localhost:3000
```

On Vercel, set the project **Root Directory** to `web` and the environment variable `NEXT_PUBLIC_API_URL` to the Modal URL
(no trailing slash), then deploy. The user's closet is stored in their browser (localStorage).

The dress-up figure is a paper-doll preview, made of layout heuristics with nothing learned:
- `make_cutouts.py` removes each product's white or plain studio background (`web/public/cutouts/`).
- `make_fit.py` measures each cut-out's shape and scales it so the matching part lines up with the figure:
  - tops by torso width (ignoring sleeves), lengthened to meet the waistband;
  - trousers waistband to ankle, skirts and shorts from the waist;
  - dresses at knee or full length, depending on type and shape;
  - single-shoe photos mirrored onto both feet;
  - earrings, rings, bracelets, belts, socks, hats and bags at their body spots.
- About 140 items (5%) are photos of models or products that fill the frame. These can't be cut out, so they
  appear as small framed snapshots at the right spot instead.
