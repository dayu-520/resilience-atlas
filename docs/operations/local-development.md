# Local Development

## Start Dependencies

```bash
docker compose -f infra/docker-compose.yml up -d postgres redis minio
```

PostgreSQL/PostGIS runs on `localhost:5432`.

Redis runs on `localhost:6379`.

MinIO API runs on `localhost:9000`; MinIO console runs on `localhost:9001`.

Initialize the object-storage bucket after MinIO starts:

```bash
docker run --rm --network host minio/mc sh -c "mc alias set local http://minioadmin:minioadmin@localhost:9000 && mc mb --ignore-existing local/research-assets && mc anonymous set none local/research-assets"
```

On systems where Docker host networking is unavailable, run the equivalent script from a shell with `mc` installed:

```bash
sh infra/minio/create-bucket.sh
```

## Run Database Migrations

```bash
cd services/api
alembic upgrade head
```

## Create Local Test Account

Create or update a local member account after the database migration succeeds:

```bash
cd services/api
python -m app.cli.seed_user --email member@example.com --password dev-password --display-name "Local Member"
```

The command is idempotent. Running it again updates the same account password, display name, role, and active status.

## Run API Tests

```bash
cd services/api
pytest -v
```

## Run API Server

```bash
cd services/api
uvicorn app.main:app --reload
```

Verify the health endpoint:

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{"status":"ok"}
```

## Run Web Tests

```bash
cd apps/web
npm test
```

Build the production frontend:

```bash
cd apps/web
npm run build
```

## Run Web Development Server

```bash
cd apps/web
npm run dev
```

## Run Worker Tests

```bash
cd services/worker
pytest -v
```

## Run Worker

Start the dataset inspection worker after Redis is running:

```bash
cd services/worker
rq worker datasets
```

The worker consumes jobs enqueued by the API after uploads and updates dataset processing metadata.

uploads become previewable only after the worker marks them ready. For GeoJSON and CSV point files, the worker stores a lightweight `preview_geojson` sample that the map workbench can render directly.

Check the generated preview payload with:

```bash
# GET /datasets/{dataset_id}/preview
curl -H "Authorization: Bearer <token>" http://localhost:8000/datasets/{dataset_id}/preview
```

The frontend detail page links ready datasets to the map workbench with a route like:

```text
http://127.0.0.1:5173/#/map?dataset={dataset_id}
```

## Map Demo Preview

When the backend is not available yet, open the local map interaction demo directly:

```text
http://127.0.0.1:5173/#/map-demo
```

This route shows the Leaflet map, clickable Jing-Jin-Ji demo regions, selected-region highlighting, and fallback dataset cards.

## Verification Checklist

- API health endpoint returns `{"status":"ok"}`.
- API tests pass.
- Worker tests pass.
- Frontend tests pass.
- Frontend production build succeeds.
- Docker Compose starts PostgreSQL/PostGIS, Redis, and MinIO.
