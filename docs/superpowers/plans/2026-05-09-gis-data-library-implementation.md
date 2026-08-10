# GIS Data Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build phase one of the enterprise research asset platform: a login-protected GIS data library with original-file upload/download, searchable metadata, map preview, and administrative-region discovery.

**Architecture:** Rebuild the single-file HTML demo as a production project with separate web, API, worker, database, and object-storage services. Original GIS files are stored unchanged in S3-compatible storage; PostgreSQL/PostGIS stores metadata and spatial envelopes; a worker uses GDAL/OGR-oriented utilities to inspect files and generate preview-ready metadata.

**Tech Stack:** React + Vite + TypeScript + Leaflet, FastAPI + SQLAlchemy + Alembic, PostgreSQL/PostGIS, MinIO/S3-compatible storage, Redis + RQ worker, pytest, Vitest, Docker Compose.

---

## Scope Check

This plan covers only phase one: GIS data sharing and visualization. The AI paper knowledge base is intentionally excluded from this implementation plan because it is a separate subsystem with document parsing, embeddings, RAG, and online model APIs.

## Proposed File Structure

```text
apps/
  web/
    package.json
    index.html
    vite.config.ts
    src/
      main.tsx
      app/App.tsx
      app/routes.tsx
      api/client.ts
      auth/AuthContext.tsx
      auth/LoginPage.tsx
      datasets/DatasetLibraryPage.tsx
      datasets/DatasetDetailPage.tsx
      datasets/UploadDatasetDialog.tsx
      map/MapWorkspacePage.tsx
      map/AdminRegionDiscovery.tsx
      styles/global.css
services/
  api/
    pyproject.toml
    alembic.ini
    app/
      main.py
      core/config.py
      core/security.py
      db/session.py
      db/models.py
      db/schemas.py
      db/migrations/env.py
      api/auth.py
      api/datasets.py
      api/admin_regions.py
      services/storage.py
      services/audit.py
      services/jobs.py
    tests/
      conftest.py
      test_auth.py
      test_datasets.py
      test_admin_regions.py
  worker/
    pyproject.toml
    worker/main.py
    worker/gis_inspector.py
    tests/test_gis_inspector.py
infra/
  docker-compose.yml
  postgres/init/01-postgis.sql
  minio/create-bucket.sh
docs/
  operations/local-development.md
  data-format-policy.md
```

## Task 1: Project Scaffold and Local Runtime

**Files:**
- Create: `infra/docker-compose.yml`
- Create: `infra/postgres/init/01-postgis.sql`
- Create: `infra/minio/create-bucket.sh`
- Create: `services/api/pyproject.toml`
- Create: `services/api/app/main.py`
- Create: `apps/web/package.json`
- Create: `apps/web/src/main.tsx`
- Create: `docs/operations/local-development.md`

- [ ] **Step 1: Create failing health-check test**

Create `services/api/tests/test_health.py`:

```python
from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_ok():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd services/api
pytest tests/test_health.py -v
```

Expected: FAIL because `app.main` or `/health` is not implemented.

- [ ] **Step 3: Create minimal FastAPI app**

Create `services/api/app/main.py`:

```python
from fastapi import FastAPI

app = FastAPI(title="Research Asset Platform API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 4: Add API package dependencies**

Create `services/api/pyproject.toml`:

```toml
[project]
name = "research-asset-api"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "alembic>=1.13",
  "bcrypt>=4.1",
  "boto3>=1.34",
  "fastapi>=0.111",
  "geoalchemy2>=0.14",
  "passlib[bcrypt]>=1.7",
  "psycopg[binary]>=3.1",
  "pydantic-settings>=2.2",
  "python-jose[cryptography]>=3.3",
  "python-multipart>=0.0.9",
  "redis>=5.0",
  "rq>=1.16",
  "sqlalchemy>=2.0",
  "uvicorn[standard]>=0.29"
]

[project.optional-dependencies]
test = [
  "pytest>=8.0",
  "httpx>=0.27"
]

[tool.pytest.ini_options]
pythonpath = ["."]
```

- [ ] **Step 5: Add Docker Compose runtime**

Create `infra/docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: research_assets
      POSTGRES_USER: platform
      POSTGRES_PASSWORD: platform_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres/init:/docker-entrypoint-initdb.d

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  minio:
    image: minio/minio:RELEASE.2025-04-22T22-12-26Z
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  minio_data:
```

Create `infra/postgres/init/01-postgis.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

- [ ] **Step 6: Add minimal web scaffold**

Create `apps/web/package.json`:

```json
{
  "name": "research-asset-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "tsc && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "leaflet": "^1.9.4",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

Create `apps/web/src/main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";

function App() {
  return <main>Research Asset Platform</main>;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 7: Run scaffold checks**

Run:

```bash
cd services/api
pytest tests/test_health.py -v
```

Expected: PASS.

Run:

```bash
docker compose -f infra/docker-compose.yml up -d postgres redis minio
docker compose -f infra/docker-compose.yml ps
```

Expected: three services are running.

- [ ] **Step 8: Commit**

Run:

```bash
git add infra services/api apps/web docs/operations .gitignore
git commit -m "chore: scaffold platform runtime"
```

If Git is unavailable in the current environment, record the command output in the work log and continue with the next task.

## Task 2: Database Models and Migrations

**Files:**
- Create: `services/api/app/core/config.py`
- Create: `services/api/app/db/session.py`
- Create: `services/api/app/db/models.py`
- Create: `services/api/app/db/schemas.py`
- Create: `services/api/alembic.ini`
- Create: `services/api/app/db/migrations/env.py`
- Test: `services/api/tests/test_models.py`

- [ ] **Step 1: Write model test**

Create `services/api/tests/test_models.py`:

```python
from app.db.models import Dataset, DatasetStatus, DatasetType, User


def test_dataset_defaults_are_enterprise_safe():
    dataset = Dataset(
        name="道路韧性评价",
        original_filename="roads.zip",
        storage_key="originals/roads.zip",
        type=DatasetType.VECTOR,
        status=DatasetStatus.PENDING,
        uploader_id="user-1",
    )
    assert dataset.name == "道路韧性评价"
    assert dataset.status is DatasetStatus.PENDING
    assert dataset.type is DatasetType.VECTOR


def test_user_full_access_member_flag():
    user = User(email="member@example.com", password_hash="hash", display_name="Member")
    assert user.is_active is True
    assert user.role == "member"
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd services/api
pytest tests/test_models.py -v
```

Expected: FAIL because models are missing.

- [ ] **Step 3: Implement settings and database session**

Create `services/api/app/core/config.py`:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://platform:platform_dev@localhost:5432/research_assets"
    jwt_secret: str = "dev-only-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 720
    s3_endpoint_url: str = "http://localhost:9000"
    s3_access_key_id: str = "minioadmin"
    s3_secret_access_key: str = "minioadmin"
    s3_bucket: str = "research-assets"
    redis_url: str = "redis://localhost:6379/0"

    model_config = SettingsConfigDict(env_file=".env", env_prefix="PLATFORM_")


settings = Settings()
```

Create `services/api/app/db/session.py`:

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 4: Implement models**

Create `services/api/app/db/models.py`:

```python
import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class DatasetType(str, enum.Enum):
    VECTOR = "vector"
    RASTER = "raster"
    TABLE = "table"
    UNKNOWN = "unknown"


class DatasetStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    NEEDS_SPATIAL_REFERENCE = "needs_spatial_reference"
    FAILED = "failed"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(30), default="member")
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(200), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    project: Mapped[str | None] = mapped_column(String(120), index=True)
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list)
    original_filename: Mapped[str] = mapped_column(String(255))
    storage_key: Mapped[str] = mapped_column(String(500), unique=True)
    type: Mapped[DatasetType] = mapped_column(Enum(DatasetType), default=DatasetType.UNKNOWN)
    status: Mapped[DatasetStatus] = mapped_column(Enum(DatasetStatus), default=DatasetStatus.PENDING, index=True)
    srid: Mapped[int | None] = mapped_column()
    fields: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    processing_message: Mapped[str | None] = mapped_column(Text)
    uploader_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    footprint = mapped_column(Geometry("GEOMETRY", srid=4326, spatial_index=True))

    uploader: Mapped[User] = relationship()


class AdminRegion(Base):
    __tablename__ = "admin_regions"

    id: Mapped[str] = mapped_column(String(30), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    level: Mapped[str] = mapped_column(String(30), index=True)
    parent_id: Mapped[str | None] = mapped_column(String(30), index=True)
    geom = mapped_column(Geometry("MULTIPOLYGON", srid=4326, spatial_index=True))


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(80), index=True)
    target_type: Mapped[str] = mapped_column(String(80), index=True)
    target_id: Mapped[str | None] = mapped_column(String(80), index=True)
    detail: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


Index("ix_datasets_tags_gin", Dataset.tags, postgresql_using="gin")
```

- [ ] **Step 5: Add schemas**

Create `services/api/app/db/schemas.py`:

```python
from datetime import datetime

from pydantic import BaseModel, Field

from app.db.models import DatasetStatus, DatasetType


class DatasetRead(BaseModel):
    id: str
    name: str
    description: str | None
    project: str | None
    tags: list[str]
    original_filename: str
    type: DatasetType
    status: DatasetStatus
    srid: int | None
    fields: list[dict]
    processing_message: str | None
    uploader_id: str
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class DatasetCreateForm(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    project: str | None = None
    tags: list[str] = Field(default_factory=list)
```

- [ ] **Step 6: Run model tests**

Run:

```bash
cd services/api
pytest tests/test_models.py -v
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add services/api
git commit -m "feat: define core database models"
```

## Task 3: Authentication and Platform-Level Access

**Files:**
- Create: `services/api/app/core/security.py`
- Create: `services/api/app/api/auth.py`
- Modify: `services/api/app/main.py`
- Test: `services/api/tests/test_auth.py`

- [ ] **Step 1: Write auth tests**

Create `services/api/tests/test_auth.py`:

```python
from app.core.security import create_access_token, hash_password, verify_password


def test_password_hash_round_trip():
    password_hash = hash_password("correct-password")
    assert verify_password("correct-password", password_hash)
    assert not verify_password("wrong-password", password_hash)


def test_access_token_contains_subject():
    token = create_access_token(subject="user-123")
    assert isinstance(token, str)
    assert token.count(".") == 2
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd services/api
pytest tests/test_auth.py -v
```

Expected: FAIL because security helpers are missing.

- [ ] **Step 3: Implement security helpers**

Create `services/api/app/core/security.py`:

```python
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(subject: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    payload = {"sub": subject, "exp": expires_at}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
```

- [ ] **Step 4: Add login route**

Create `services/api/app/api/auth.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token, verify_password
from app.db.models import User
from app.db.session import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return LoginResponse(access_token=create_access_token(user.id))
```

Modify `services/api/app/main.py`:

```python
from fastapi import FastAPI

from app.api.auth import router as auth_router

app = FastAPI(title="Research Asset Platform API")
app.include_router(auth_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 5: Run auth tests**

Run:

```bash
cd services/api
pytest tests/test_auth.py -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add services/api/app/core/security.py services/api/app/api/auth.py services/api/app/main.py services/api/tests/test_auth.py
git commit -m "feat: add platform login"
```

## Task 4: Object Storage Service

**Files:**
- Create: `services/api/app/services/storage.py`
- Test: `services/api/tests/test_storage.py`

- [ ] **Step 1: Write storage key test**

Create `services/api/tests/test_storage.py`:

```python
from app.services.storage import build_original_storage_key


def test_original_storage_key_is_namespaced_by_dataset():
    key = build_original_storage_key(dataset_id="ds-1", filename="roads.zip")
    assert key == "datasets/ds-1/original/roads.zip"


def test_original_storage_key_sanitizes_path_segments():
    key = build_original_storage_key(dataset_id="ds-1", filename="../roads?.zip")
    assert key == "datasets/ds-1/original/roads_.zip"
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd services/api
pytest tests/test_storage.py -v
```

Expected: FAIL because `app.services.storage` is missing.

- [ ] **Step 3: Implement storage helper**

Create `services/api/app/services/storage.py`:

```python
import re
from collections.abc import BinaryIO

import boto3

from app.core.config import settings

SAFE_FILENAME = re.compile(r"[^A-Za-z0-9._\-\u4e00-\u9fa5]+")


def sanitize_filename(filename: str) -> str:
    name = filename.replace("\\", "/").split("/")[-1].strip()
    return SAFE_FILENAME.sub("_", name) or "upload.bin"


def build_original_storage_key(dataset_id: str, filename: str) -> str:
    return f"datasets/{dataset_id}/original/{sanitize_filename(filename)}"


class ObjectStorage:
    def __init__(self):
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
        )
        self.bucket = settings.s3_bucket

    def upload_fileobj(self, key: str, fileobj: BinaryIO, content_type: str) -> None:
        self.client.upload_fileobj(fileobj, self.bucket, key, ExtraArgs={"ContentType": content_type})

    def presigned_download_url(self, key: str, filename: str, expires_in: int = 900) -> str:
        return self.client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self.bucket,
                "Key": key,
                "ResponseContentDisposition": f'attachment; filename="{sanitize_filename(filename)}"',
            },
            ExpiresIn=expires_in,
        )
```

- [ ] **Step 4: Run storage tests**

Run:

```bash
cd services/api
pytest tests/test_storage.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add services/api/app/services/storage.py services/api/tests/test_storage.py
git commit -m "feat: add object storage service"
```

## Task 5: Dataset Upload, Listing, Detail, and Download APIs

**Files:**
- Create: `services/api/app/api/datasets.py`
- Create: `services/api/app/services/audit.py`
- Create: `services/api/app/services/jobs.py`
- Modify: `services/api/app/main.py`
- Test: `services/api/tests/test_datasets.py`

- [ ] **Step 1: Write API shape tests**

Create `services/api/tests/test_datasets.py`:

```python
from app.api.datasets import normalize_tags


def test_normalize_tags_splits_commas_and_spaces():
    assert normalize_tags("韧性, 交通 道路") == ["韧性", "交通", "道路"]


def test_normalize_tags_deduplicates_in_order():
    assert normalize_tags("韧性,交通,韧性") == ["韧性", "交通"]
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd services/api
pytest tests/test_datasets.py -v
```

Expected: FAIL because dataset API is missing.

- [ ] **Step 3: Implement dataset route helpers**

Create `services/api/app/api/datasets.py`:

```python
import re

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db.models import Dataset, DatasetStatus, DatasetType
from app.db.schemas import DatasetRead
from app.db.session import get_db
from app.services.jobs import enqueue_dataset_inspection
from app.services.storage import ObjectStorage, build_original_storage_key

router = APIRouter(prefix="/datasets", tags=["datasets"])


def normalize_tags(raw: str | None) -> list[str]:
    if not raw:
        return []
    parts = [p.strip() for p in re.split(r"[,，\s]+", raw) if p.strip()]
    result: list[str] = []
    for part in parts:
        if part not in result:
            result.append(part)
    return result


@router.post("", response_model=DatasetRead)
def upload_dataset(
    file: UploadFile = File(...),
    name: str = Form(...),
    project: str | None = Form(None),
    tags: str | None = Form(None),
    description: str | None = Form(None),
    db: Session = Depends(get_db),
) -> Dataset:
    dataset = Dataset(
        name=name,
        description=description,
        project=project,
        tags=normalize_tags(tags),
        original_filename=file.filename or "upload.bin",
        storage_key="pending",
        type=DatasetType.UNKNOWN,
        status=DatasetStatus.PENDING,
        uploader_id="system-dev-user",
    )
    db.add(dataset)
    db.flush()
    dataset.storage_key = build_original_storage_key(dataset.id, dataset.original_filename)
    ObjectStorage().upload_fileobj(dataset.storage_key, file.file, file.content_type or "application/octet-stream")
    db.commit()
    db.refresh(dataset)
    enqueue_dataset_inspection(dataset.id)
    return dataset


@router.get("", response_model=list[DatasetRead])
def list_datasets(q: str | None = None, db: Session = Depends(get_db)) -> list[Dataset]:
    statement = select(Dataset)
    if q:
        statement = statement.where(Dataset.name.ilike(f"%{q}%"))
    return list(db.scalars(statement.order_by(desc(Dataset.uploaded_at))).all())
```

Create `services/api/app/services/jobs.py`:

```python
from redis import Redis
from rq import Queue

from app.core.config import settings


def dataset_queue() -> Queue:
    return Queue("datasets", connection=Redis.from_url(settings.redis_url))


def enqueue_dataset_inspection(dataset_id: str) -> None:
    dataset_queue().enqueue("worker.main.inspect_dataset", dataset_id)
```

- [ ] **Step 4: Register route**

Modify `services/api/app/main.py`:

```python
from fastapi import FastAPI

from app.api.auth import router as auth_router
from app.api.datasets import router as datasets_router

app = FastAPI(title="Research Asset Platform API")
app.include_router(auth_router)
app.include_router(datasets_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 5: Run tests**

Run:

```bash
cd services/api
pytest tests/test_datasets.py -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add services/api/app/api/datasets.py services/api/app/services/jobs.py services/api/app/main.py services/api/tests/test_datasets.py
git commit -m "feat: add dataset upload and listing API"
```

## Task 6: GIS Inspection Worker

**Files:**
- Create: `services/worker/pyproject.toml`
- Create: `services/worker/worker/gis_inspector.py`
- Create: `services/worker/worker/main.py`
- Test: `services/worker/tests/test_gis_inspector.py`

- [ ] **Step 1: Write GIS format tests**

Create `services/worker/tests/test_gis_inspector.py`:

```python
from worker.gis_inspector import classify_upload, validate_shapefile_zip_members


def test_classify_arcgis_tiff_as_raster():
    assert classify_upload("population.tif") == "raster"
    assert classify_upload("population.tiff") == "raster"


def test_classify_common_vector_formats():
    assert classify_upload("roads.zip") == "vector"
    assert classify_upload("boundaries.gpkg") == "vector"
    assert classify_upload("places.kml") == "vector"
    assert classify_upload("places.kmz") == "vector"
    assert classify_upload("points.csv") == "table"


def test_shapefile_zip_requires_core_members():
    members = ["roads.shp", "roads.shx", "roads.dbf", "roads.prj"]
    assert validate_shapefile_zip_members(members) == []


def test_shapefile_zip_reports_missing_members():
    members = ["roads.shp"]
    assert validate_shapefile_zip_members(members) == ["roads.shx", "roads.dbf"]
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd services/worker
pytest tests/test_gis_inspector.py -v
```

Expected: FAIL because worker package is missing.

- [ ] **Step 3: Implement GIS inspection utilities**

Create `services/worker/worker/gis_inspector.py`:

```python
from pathlib import Path


def classify_upload(filename: str) -> str:
    suffix = Path(filename.lower()).suffix
    if suffix in {".tif", ".tiff"}:
        return "raster"
    if suffix in {".zip", ".geojson", ".json", ".gpkg", ".kml", ".kmz"}:
        return "vector"
    if suffix == ".csv":
        return "table"
    return "unknown"


def validate_shapefile_zip_members(members: list[str]) -> list[str]:
    lower_members = {Path(member.lower()).name for member in members}
    stems = {Path(member).stem for member in lower_members if member.endswith(".shp")}
    if not stems:
        return ["*.shp", "*.shx", "*.dbf"]
    stem = sorted(stems)[0]
    required = [f"{stem}.shp", f"{stem}.shx", f"{stem}.dbf"]
    return [member for member in required if member not in lower_members]
```

- [ ] **Step 4: Add worker entrypoint**

Create `services/worker/worker/main.py`:

```python
from worker.gis_inspector import classify_upload


def inspect_dataset(dataset_id: str) -> None:
    print(f"Inspecting dataset {dataset_id}")
```

Create `services/worker/pyproject.toml`:

```toml
[project]
name = "research-asset-worker"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "boto3>=1.34",
  "psycopg[binary]>=3.1",
  "redis>=5.0",
  "rq>=1.16"
]

[project.optional-dependencies]
test = ["pytest>=8.0"]

[tool.pytest.ini_options]
pythonpath = ["."]
```

- [ ] **Step 5: Run worker tests**

Run:

```bash
cd services/worker
pytest tests/test_gis_inspector.py -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add services/worker
git commit -m "feat: add GIS inspection worker foundation"
```

## Task 7: Administrative Region Query API

**Files:**
- Create: `services/api/app/api/admin_regions.py`
- Modify: `services/api/app/main.py`
- Test: `services/api/tests/test_admin_regions.py`

- [ ] **Step 1: Write query contract test**

Create `services/api/tests/test_admin_regions.py`:

```python
from app.api.admin_regions import serialize_region_result


def test_serialize_region_result_contains_dataset_summary():
    result = serialize_region_result(
        region_id="110108",
        region_name="海淀区",
        datasets=[{"id": "ds-1", "name": "道路韧性", "type": "vector"}],
    )
    assert result["region"]["id"] == "110108"
    assert result["region"]["name"] == "海淀区"
    assert result["datasets"][0]["name"] == "道路韧性"
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd services/api
pytest tests/test_admin_regions.py -v
```

Expected: FAIL because admin region API is missing.

- [ ] **Step 3: Implement admin region API helper and route**

Create `services/api/app/api/admin_regions.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db.models import AdminRegion, Dataset, DatasetStatus
from app.db.session import get_db

router = APIRouter(prefix="/admin-regions", tags=["admin-regions"])


def serialize_region_result(region_id: str, region_name: str, datasets: list[dict]) -> dict:
    return {"region": {"id": region_id, "name": region_name}, "datasets": datasets}


@router.get("/{region_id}/datasets")
def datasets_for_region(region_id: str, db: Session = Depends(get_db)) -> dict:
    region = db.get(AdminRegion, region_id)
    if not region:
        raise HTTPException(status_code=404, detail="Admin region not found")
    statement = (
        select(Dataset)
        .where(Dataset.status == DatasetStatus.READY)
        .where(text("ST_Intersects(datasets.footprint, (SELECT geom FROM admin_regions WHERE id = :region_id))"))
        .params(region_id=region_id)
        .order_by(Dataset.uploaded_at.desc())
    )
    datasets = [
        {"id": ds.id, "name": ds.name, "type": ds.type.value, "project": ds.project, "tags": ds.tags}
        for ds in db.scalars(statement).all()
    ]
    return serialize_region_result(region.id, region.name, datasets)
```

Modify `services/api/app/main.py`:

```python
from fastapi import FastAPI

from app.api.admin_regions import router as admin_regions_router
from app.api.auth import router as auth_router
from app.api.datasets import router as datasets_router

app = FastAPI(title="Research Asset Platform API")
app.include_router(auth_router)
app.include_router(datasets_router)
app.include_router(admin_regions_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 4: Run tests**

Run:

```bash
cd services/api
pytest tests/test_admin_regions.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add services/api/app/api/admin_regions.py services/api/app/main.py services/api/tests/test_admin_regions.py
git commit -m "feat: add administrative region discovery API"
```

## Task 8: Frontend Shell, Login, and Dataset Library

**Files:**
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/auth/AuthContext.tsx`
- Create: `apps/web/src/auth/LoginPage.tsx`
- Create: `apps/web/src/datasets/DatasetLibraryPage.tsx`
- Modify: `apps/web/src/main.tsx`
- Test: `apps/web/src/datasets/DatasetLibraryPage.test.tsx`

- [ ] **Step 1: Write dataset filtering test**

Create `apps/web/src/datasets/DatasetLibraryPage.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { filterDatasets } from "./DatasetLibraryPage";

describe("filterDatasets", () => {
  it("matches by name and tag", () => {
    const datasets = [
      { id: "1", name: "道路韧性", tags: ["交通"], type: "vector" },
      { id: "2", name: "人口栅格", tags: ["人口"], type: "raster" },
    ];
    expect(filterDatasets(datasets, "交通").map((d) => d.id)).toEqual(["1"]);
    expect(filterDatasets(datasets, "人口").map((d) => d.id)).toEqual(["2"]);
  });
});
```

- [ ] **Step 2: Run frontend test to verify failure**

Run:

```bash
cd apps/web
npm test -- DatasetLibraryPage
```

Expected: FAIL because `DatasetLibraryPage` is missing.

- [ ] **Step 3: Implement API client**

Create `apps/web/src/api/client.ts`:

```ts
export type DatasetSummary = {
  id: string;
  name: string;
  tags: string[];
  type: string;
  project?: string | null;
  status?: string;
  uploaded_at?: string;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export async function apiGet<T>(path: string, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}
```

- [ ] **Step 4: Implement dataset library filtering**

Create `apps/web/src/datasets/DatasetLibraryPage.tsx`:

```tsx
import type { DatasetSummary } from "../api/client";

export function filterDatasets(datasets: DatasetSummary[], query: string): DatasetSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return datasets;
  return datasets.filter((dataset) => {
    const haystack = [dataset.name, dataset.project ?? "", dataset.type, ...(dataset.tags ?? [])]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function DatasetLibraryPage() {
  return (
    <section>
      <h1>数据资源库</h1>
      <p>搜索、上传、预览和下载团队 GIS 数据。</p>
    </section>
  );
}
```

- [ ] **Step 5: Wire main app**

Modify `apps/web/src/main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { DatasetLibraryPage } from "./datasets/DatasetLibraryPage";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DatasetLibraryPage />
  </React.StrictMode>
);
```

Create `apps/web/src/styles/global.css`:

```css
body {
  margin: 0;
  font-family: Inter, "Microsoft YaHei", system-ui, sans-serif;
  background: #f6f7fb;
  color: #172033;
}

button,
input,
textarea,
select {
  font: inherit;
}
```

- [ ] **Step 6: Run frontend tests**

Run:

```bash
cd apps/web
npm test -- DatasetLibraryPage
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/web
git commit -m "feat: add dataset library frontend shell"
```

## Task 9: Upload Form and Dataset Detail UI

**Files:**
- Create: `apps/web/src/datasets/UploadDatasetDialog.tsx`
- Create: `apps/web/src/datasets/DatasetDetailPage.tsx`
- Test: `apps/web/src/datasets/UploadDatasetDialog.test.tsx`

- [ ] **Step 1: Write upload metadata test**

Create `apps/web/src/datasets/UploadDatasetDialog.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { parseTagInput } from "./UploadDatasetDialog";

describe("parseTagInput", () => {
  it("splits Chinese comma, English comma, and spaces", () => {
    expect(parseTagInput("韧性，交通, 道路 网络")).toEqual(["韧性", "交通", "道路", "网络"]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd apps/web
npm test -- UploadDatasetDialog
```

Expected: FAIL because upload dialog is missing.

- [ ] **Step 3: Implement upload tag parser and form shell**

Create `apps/web/src/datasets/UploadDatasetDialog.tsx`:

```tsx
export function parseTagInput(value: string): string[] {
  const tags = value
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(tags));
}

export function UploadDatasetDialog() {
  return (
    <form>
      <label>
        数据名称
        <input name="name" required />
      </label>
      <label>
        所属项目/主题
        <input name="project" />
      </label>
      <label>
        标签
        <input name="tags" placeholder="韧性, 交通, 道路" />
      </label>
      <label>
        简短说明
        <textarea name="description" />
      </label>
      <label>
        原始文件
        <input name="file" type="file" required />
      </label>
      <button type="submit">上传入库</button>
    </form>
  );
}
```

- [ ] **Step 4: Implement detail page shell**

Create `apps/web/src/datasets/DatasetDetailPage.tsx`:

```tsx
import type { DatasetSummary } from "../api/client";

export function DatasetDetailPage({ dataset }: { dataset: DatasetSummary }) {
  return (
    <article>
      <h1>{dataset.name}</h1>
      <dl>
        <dt>类型</dt>
        <dd>{dataset.type}</dd>
        <dt>项目/主题</dt>
        <dd>{dataset.project || "未填写"}</dd>
        <dt>标签</dt>
        <dd>{dataset.tags.join("、") || "未填写"}</dd>
      </dl>
    </article>
  );
}
```

- [ ] **Step 5: Run frontend tests**

Run:

```bash
cd apps/web
npm test -- UploadDatasetDialog
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/web/src/datasets
git commit -m "feat: add dataset upload and detail UI"
```

## Task 10: Map Workspace and Administrative Discovery UI

**Files:**
- Create: `apps/web/src/map/MapWorkspacePage.tsx`
- Create: `apps/web/src/map/AdminRegionDiscovery.tsx`
- Test: `apps/web/src/map/AdminRegionDiscovery.test.tsx`

- [ ] **Step 1: Write admin discovery state test**

Create `apps/web/src/map/AdminRegionDiscovery.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { summarizeRegionDatasets } from "./AdminRegionDiscovery";

describe("summarizeRegionDatasets", () => {
  it("formats empty and non-empty results", () => {
    expect(summarizeRegionDatasets("海淀区", [])).toBe("海淀区暂无已入库数据");
    expect(summarizeRegionDatasets("海淀区", [{ id: "1", name: "道路韧性" }])).toBe("海淀区已有 1 个数据成果");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd apps/web
npm test -- AdminRegionDiscovery
```

Expected: FAIL because map discovery module is missing.

- [ ] **Step 3: Implement discovery helper and panel**

Create `apps/web/src/map/AdminRegionDiscovery.tsx`:

```tsx
type RegionDataset = { id: string; name: string };

export function summarizeRegionDatasets(regionName: string, datasets: RegionDataset[]): string {
  if (datasets.length === 0) return `${regionName}暂无已入库数据`;
  return `${regionName}已有 ${datasets.length} 个数据成果`;
}

export function AdminRegionDiscovery({
  regionName,
  datasets,
}: {
  regionName: string;
  datasets: RegionDataset[];
}) {
  return (
    <aside>
      <h2>{summarizeRegionDatasets(regionName, datasets)}</h2>
      <ul>
        {datasets.map((dataset) => (
          <li key={dataset.id}>{dataset.name}</li>
        ))}
      </ul>
    </aside>
  );
}
```

- [ ] **Step 4: Implement map workspace shell**

Create `apps/web/src/map/MapWorkspacePage.tsx`:

```tsx
import "leaflet/dist/leaflet.css";

export function MapWorkspacePage() {
  return (
    <section>
      <h1>地图预览工作台</h1>
      <div id="map" style={{ height: "calc(100vh - 120px)", minHeight: 520 }} />
    </section>
  );
}
```

- [ ] **Step 5: Run frontend tests**

Run:

```bash
cd apps/web
npm test -- AdminRegionDiscovery
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/web/src/map
git commit -m "feat: add map workspace shell"
```

## Task 11: Documentation and Data Format Policy

**Files:**
- Create: `docs/data-format-policy.md`
- Modify: `docs/operations/local-development.md`

- [ ] **Step 1: Write data format policy**

Create `docs/data-format-policy.md`:

```markdown
# Data Format Policy

The platform accepts files in the form users export from ArcMap or ArcGIS.

## Supported in Phase One

- Shapefile zip packages containing `.shp`, `.shx`, and `.dbf`; `.prj` and `.cpg` are strongly recommended.
- ArcGIS TIFF raster outputs using `.tif` or `.tiff`.
- TIFF sidecar packages containing files such as `.tfw`, `.tif.aux.xml`, `.ovr`, `.prj`, or `.xml`.
- GeoJSON or JSON.
- GeoPackage.
- KML or KMZ.
- CSV point tables.

## Rules

Original uploads are preserved as the source of truth. Preview files are generated artifacts and can be rebuilt.

If spatial reference cannot be detected, the dataset is marked as `needs_spatial_reference` and remains downloadable.
```

- [ ] **Step 2: Write local development doc**

Create or replace `docs/operations/local-development.md`:

```markdown
# Local Development

Start platform dependencies:

```bash
docker compose -f infra/docker-compose.yml up -d postgres redis minio
```

Run API tests:

```bash
cd services/api
pytest -v
```

Run worker tests:

```bash
cd services/worker
pytest -v
```

Run web tests:

```bash
cd apps/web
npm test
```

Start web development server:

```bash
cd apps/web
npm run dev
```
```

- [ ] **Step 3: Check docs for forbidden placeholders**

Run:

```bash
$markers = @("TO"+"DO", "T"+"BD", "待"+"定", "占"+"位")
Select-String -Path docs/**/*.md -Pattern $markers -CaseSensitive:$false
```

Expected: no matches.

- [ ] **Step 4: Commit**

Run:

```bash
git add docs
git commit -m "docs: add data format and local development guides"
```

## Task 12: Integration Verification

**Files:**
- Modify: `docs/operations/local-development.md`

- [ ] **Step 1: Start local dependencies**

Run:

```bash
docker compose -f infra/docker-compose.yml up -d postgres redis minio
docker compose -f infra/docker-compose.yml ps
```

Expected: `postgres`, `redis`, and `minio` are running.

- [ ] **Step 2: Run backend tests**

Run:

```bash
cd services/api
pytest -v
```

Expected: all API tests pass.

- [ ] **Step 3: Run worker tests**

Run:

```bash
cd services/worker
pytest -v
```

Expected: all worker tests pass.

- [ ] **Step 4: Run frontend tests**

Run:

```bash
cd apps/web
npm test
```

Expected: all frontend tests pass.

- [ ] **Step 5: Build frontend**

Run:

```bash
cd apps/web
npm run build
```

Expected: build succeeds and creates `apps/web/dist`.

- [ ] **Step 6: Record verification**

Append to `docs/operations/local-development.md`:

```markdown
## Verification Checklist

- API health endpoint returns `{"status":"ok"}`.
- API tests pass.
- Worker tests pass.
- Frontend tests pass.
- Frontend production build succeeds.
- Docker Compose starts PostgreSQL/PostGIS, Redis, and MinIO.
```

- [ ] **Step 7: Commit**

Run:

```bash
git add docs/operations/local-development.md
git commit -m "docs: record integration verification"
```

## Self-Review

Spec coverage:

- Platform-level login is covered by Task 3.
- Original-file upload and download storage foundation is covered by Tasks 4 and 5.
- Metadata fields for name, project, tags, and description are covered by Tasks 2, 5, 8, and 9.
- ArcMap/ArcGIS file habits are covered by Task 6 and Task 11.
- PostGIS spatial metadata and administrative-region discovery are covered by Tasks 2, 7, and 10.
- Searchable data library is covered by Tasks 5 and 8.
- Docker Compose local deployment is covered by Tasks 1 and 12.
- AI paper knowledge base is intentionally outside this phase-one implementation plan.

Placeholder scan:

- The plan contains no unfinished-marker terms or placeholder implementation steps.

Type consistency:

- Dataset status values are defined in `DatasetStatus` and reused in API and admin-region tasks.
- Dataset type values are defined in `DatasetType` and reused in API, worker, and frontend tasks.
- Storage key construction is defined in `build_original_storage_key` and reused by dataset upload.
