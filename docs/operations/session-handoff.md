# Session Handoff

Last updated: 2026-05-10

## Product Direction

The project is being rebuilt from a single HTML GIS demo into an enterprise internal research asset platform.

Phase one is the GIS data library:

- Platform-level login.
- All authenticated members can upload, search, preview, and download original GIS files.
- Original uploads are the source of truth.
- Preview artifacts are derived and can be rebuilt.
- ArcMap/ArcGIS upload habits must be supported, including Shapefile zip and `.tif/.tiff` raster outputs with common sidecar files such as `.tfw`, `.tif.aux.xml`, `.ovr`, `.prj`, and `.xml`.
- The map should support administrative-region discovery: clicking an administrative area returns datasets that overlap that region.

Phase two is the AI paper knowledge base:

- Online LLM API.
- Internal team papers first.
- External sources automatically supplement insufficient internal evidence.
- Answers cite source research titles and original text fragments.

## Canonical Planning Documents

- `docs/superpowers/specs/2026-05-09-research-asset-platform-design.md`
- `docs/superpowers/plans/2026-05-09-gis-data-library-implementation.md`

## Current Implementation State

Created project structure:

- `apps/web`: React + Vite + TypeScript + Vitest frontend.
- `services/api`: FastAPI backend.
- `services/worker`: Python GIS worker foundation.
- `infra`: Docker Compose infrastructure for PostGIS, Redis, and MinIO.
- `docs/operations`: operational docs.

Implemented foundations:

- API `/health`.
- API settings.
- SQLAlchemy session and models: `User`, `Dataset`, `AdminRegion`, `AuditLog`.
- API schemas for datasets.
- Password hashing and JWT token helper.
- `/auth/login` route.
- Object storage helper.
- Dataset tag normalization, upload route, and list route.
- RQ dataset inspection enqueue helper.
- Administrative-region dataset lookup route shell.
- Worker upload classifier and Shapefile zip member validator.
- Web dataset API client.
- Dataset library filtering and shell page.
- Upload form shell and tag parser.
- Dataset detail shell.
- Administrative-region discovery helper and shell.
- Map workspace shell.
- Data format policy documentation.

Known environmental notes:

- This directory is still not a Git repository because creating `.git` was blocked by the current environment approval flow.
- `node_modules`, `dist`, `.pytest_cache`, `__pycache__`, and `*.egg-info` are ignored in `.gitignore`.
- Python dependencies were installed into the Codex runtime Python, not a project virtualenv.
- Frontend dependencies were installed in `apps/web`, producing `package-lock.json`.

## Verification Commands

Use these commands from `E:\zhuomian\平台开发`:

```powershell
C:\Users\23261\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m pytest tests -q
```

Run in `services/api`.

```powershell
C:\Users\23261\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m pytest tests -q
```

Run in `services/worker`.

```powershell
npm test
npm run build
```

Run in `apps/web`.

## Next Best Step

Run fresh verification after this handoff file is created.

If verification passes, continue with the remaining implementation-plan tasks:

1. Strengthen Task 5 upload/list/download APIs with authenticated current-user handling and testable storage/job dependency seams.
2. Add real Alembic migration files for the database schema.
3. Add frontend routing and wire the dataset pages into the visible app shell.
4. Add integration tests around dataset upload metadata without requiring live MinIO or Redis.
5. Add short-context review agents after each verified checkpoint instead of long-running broad agents.

## Multi-Agent Operating Rule

Use subagents for narrow, bounded review or implementation tasks only. Prior broad worker agents hung without writing files in this Windows workspace. Prefer direct implementation by the controller plus short review agents until subagent write reliability improves.
