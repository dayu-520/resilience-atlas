from pathlib import Path


def test_local_development_doc_explains_seed_user_command():
    text = Path("../../docs/operations/local-development.md").read_text(encoding="utf-8")

    assert "python -m app.cli.seed_user" in text
    assert "--email member@example.com" in text


def test_local_development_doc_lists_api_worker_and_verification_commands():
    text = Path("../../docs/operations/local-development.md").read_text(encoding="utf-8")

    assert "uvicorn app.main:app --reload" in text
    assert "rq worker datasets" in text
    assert "npm run build" in text


def test_local_development_doc_explains_upload_preview_chain():
    text = Path("../../docs/operations/local-development.md").read_text(encoding="utf-8")

    assert "uploads become previewable only after the worker marks them ready" in text
    assert "GET /datasets/{dataset_id}/preview" in text
    assert "#/map?dataset=" in text
