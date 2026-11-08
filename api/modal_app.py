"""Deploy the FastAPI service to Modal.

From the project root:
    modal serve api/modal_app.py     # temporary dev URL, hot reload
    modal deploy api/modal_app.py    # permanent URL
"""
from pathlib import Path

import modal

ROOT = Path(__file__).resolve().parent.parent

image = (
    modal.Image.debian_slim(python_version="3.13")
    .pip_install(
        "scikit-learn==1.9.1", "numpy==2.5.4", "scipy==1.18.1", "pandas==3.1.1",
        "pyarrow==26.0.1", "joblib==1.6.0", "fastapi[standard]==0.162.2", "pydantic==2.14.3",
    )
    .env({"ARTIFACT_DIR": "/root/artifacts"})
    .add_local_python_source("outfit", "api")
    .add_local_dir(ROOT / "artifacts", "/root/artifacts")
)

app = modal.App("outfit-lab-api", image=image)


@app.function(scaledown_window=300)
@modal.concurrent(max_inputs=20)
@modal.asgi_app()
def fastapi_app():
    from api.main import app as web  # model + catalog load once per container

    return web
