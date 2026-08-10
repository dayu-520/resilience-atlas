from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.admin_regions import router as admin_regions_router
from app.api.auth import router as auth_router
from app.api.datasets import router as datasets_router
from app.core.config import settings

app = FastAPI(title="Research Asset Platform API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(admin_regions_router)
app.include_router(auth_router)
app.include_router(datasets_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
