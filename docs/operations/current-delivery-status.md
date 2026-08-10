# Current Delivery Status

## Scope Delivered

- Preserved the dark GIS workbench style from the original HTML demo in the React map workspace.
- Replaced Supabase/browser-only assumptions with API-backed dataset listing, upload, download, and preview calls.
- Added worker-generated `preview_geojson` support for GeoJSON and CSV point uploads.
- Added `GET /datasets/{dataset_id}/preview` for map-ready preview payloads.
- Added a dataset detail CTA that opens ready datasets directly in the map workbench through `#/map?dataset={dataset_id}`.
- Added automatic status refresh on dataset detail pages while uploads are pending or processing.
- Added a data-panel refresh action in the map workbench so processed datasets can be reloaded after the worker updates them.
- Documented the upload-to-worker-to-preview chain in the local development guide.

## Main Entry Points

- Data library: `http://127.0.0.1:5173/#/datasets`
- Dataset upload: `http://127.0.0.1:5173/#/datasets/upload`
- Map workbench: `http://127.0.0.1:5173/#/map`
- Load a dataset directly in the map: `http://127.0.0.1:5173/#/map?dataset={dataset_id}`
- Demo-only map fallback: `http://127.0.0.1:5173/#/map-demo`

## Verification Run

The latest verification covered:

- Worker tests: `12 passed`
- API tests: `30 passed`
- Frontend tests: `34 passed`
- TypeScript compile: passed
- Vite production build: passed

Pytest emitted Windows cache warnings because the runtime could not write `.pytest_cache` under the Chinese-path workspace. The application tests themselves passed.

## Remaining Product Edges

- Raster previews currently report that a derived preview file is not yet available. GeoTIFF preview tile generation is still a later worker capability.
- Shapefile/GeoPackage/KML metadata is classified, but full geometry extraction still needs a GIS library pipeline.
- The local Docker Compose file currently starts infrastructure services only: PostgreSQL/PostGIS, Redis, and MinIO. API, worker, and web are run from the source directories as documented.
