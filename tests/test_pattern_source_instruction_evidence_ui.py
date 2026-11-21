from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"


def read(name: str) -> str:
    return (STATIC / name).read_text(encoding="utf-8")


def test_source_instruction_evidence_route_and_assets_are_served() -> None:
    client = TestClient(create_app())
    response = client.get("/pattern-source-instruction-evidence?project=00000000-0000-7000-8000-000000000000")
    assert response.status_code == 200
    assert "SOURCE_PATTERN_INSTRUCTION_EVIDENCE_V1" in response.text
    for asset in (
        "/static/pattern-source-instruction-evidence.js",
        "/static/pattern-source-instruction-evidence-assistant.js",
        "/static/pattern-source-instruction-evidence.css",
    ):
        assert client.get(asset).status_code == 200, asset


def test_source_instruction_ui_exposes_review_provenance_and_gates() -> None:
    html = read("pattern-source-instruction-evidence.html")
    assistant = read("pattern-source-instruction-evidence-assistant.js")
    model = read("pattern-source-instruction-evidence.js")
    for required in (
        "PDF identity",
        "PDF fingerprint",
        "Stage 19",
        "Обязательные решения",
        "Coverage",
        "Stage 21 blockers",
        "source-evidence-confirm",
    ):
        assert required in html
    for required in (
        "pdfPageIndex",
        "textSpan",
        "supportingExcerpt",
        "fragmentFingerprint",
        "extractionConfidence",
        "selectedRawValue",
        "selectionAlgorithmVersion",
        "confirmForProject",
    ):
        assert required in assistant or required in model
    assert "innerHTML" not in assistant
    assert "indexedDB" not in assistant
    assert "confirm(" not in assistant


def test_stage21_links_to_the_source_instruction_boundary() -> None:
    html = read("pattern-technology-review.html")
    assistant = read("pattern-technology-review-assistant.js")
    assert 'id="pattern-technology-review-source-evidence"' in html
    assert "/pattern-source-instruction-evidence?project=" in assistant
