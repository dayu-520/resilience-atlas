from pathlib import Path


def test_initial_alembic_migration_defines_core_tables():
    migration = Path("app/db/migrations/versions/20260509_0001_initial_schema.py")
    assert migration.exists()

    text = migration.read_text(encoding="utf-8")
    for table_name in ["users", "datasets", "admin_regions", "audit_logs"]:
        assert "create_table(" in text
        assert f'"{table_name}"' in text

    assert "ix_datasets_tags_gin" in text
    assert "Geometry" in text


def test_dataset_preview_migration_adds_preview_geojson_column():
    migration = Path("app/db/migrations/versions/20260510_0002_dataset_preview_geojson.py")
    assert migration.exists()

    text = migration.read_text(encoding="utf-8")
    assert "preview_geojson" in text
    assert "postgresql.JSONB" in text
    assert 'down_revision: str | None = "20260509_0001"' in text
