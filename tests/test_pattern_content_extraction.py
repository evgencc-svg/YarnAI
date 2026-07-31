from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pytest
from pypdf import PdfReader, PdfWriter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

import yarnai.pattern_content_extraction as extraction


def make_pdf(*pages: str | None) -> bytes:
    font_path = next(
        path
        for path in (
            Path("C:/Windows/Fonts/arial.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        )
        if path.exists()
    )
    pdfmetrics.registerFont(TTFont("YarnAITest", font_path))
    writer = PdfWriter()
    for text in pages:
        if text is None:
            writer.add_blank_page(width=595, height=842)
            continue
        page_stream = BytesIO()
        document = canvas.Canvas(page_stream)
        document.setFont("YarnAITest", 12)
        document.drawString(72, 720, text)
        document.save()
        writer.add_page(PdfReader(BytesIO(page_stream.getvalue())).pages[0])
    stream = BytesIO()
    writer.write(stream)
    return stream.getvalue()


def test_pdf_with_text_layer_and_unicode() -> None:
    result = extraction.extract_pdf_text(make_pdf("Привет, вязание"))

    assert result["status"] == "extracted"
    assert result["pageCount"] == 1
    assert "Привет, вязание" in result["text"]
    assert result["pages"][0]["pageNumber"] == 1


def test_multipage_pdf_keeps_stable_page_order() -> None:
    result = extraction.extract_pdf_text(make_pdf("Первая", "Вторая", "Третья"))

    assert [page["pageNumber"] for page in result["pages"]] == [1, 2, 3]
    assert [page["text"].strip() for page in result["pages"]] == [
        "Первая",
        "Вторая",
        "Третья",
    ]


def test_empty_page_is_allowed_when_other_page_has_text() -> None:
    result = extraction.extract_pdf_text(make_pdf("Есть текст", None))

    assert result["status"] == "extracted"
    assert result["pageCount"] == 2
    assert result["pages"][1]["text"] == ""


def test_pdf_without_text_layer_is_not_ocr_success() -> None:
    result = extraction.extract_pdf_text(make_pdf(None))

    assert result["status"] == "no_text_layer"
    assert result["text"] == ""
    assert result["warnings"][0]["code"] == "pdf_no_text_layer"


@pytest.mark.parametrize("payload", [b"not a pdf", b"%PDF-1.7\ntruncated"])
def test_damaged_pdf_has_controlled_error(payload: bytes) -> None:
    with pytest.raises(extraction.PdfExtractionError) as caught:
        extraction.extract_pdf_text(payload)

    assert caught.value.code == "pdf_invalid"
    assert "Traceback" not in caught.value.message


def test_encrypted_pdf_has_controlled_error() -> None:
    reader = PdfReader(BytesIO(make_pdf("secret")))
    writer = PdfWriter()
    writer.append_pages_from_reader(reader)
    writer.encrypt("password")
    output = BytesIO()
    writer.write(output)

    with pytest.raises(extraction.PdfExtractionError) as caught:
        extraction.extract_pdf_text(output.getvalue())

    assert caught.value.code == "pdf_encrypted"


def test_page_count_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(extraction, "MAX_PDF_PAGES", 1)

    with pytest.raises(extraction.PdfExtractionError) as caught:
        extraction.extract_pdf_text(make_pdf("one", "two"))

    assert caught.value.code == "pdf_too_many_pages"


def test_pdf_size_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(extraction, "MAX_PDF_BYTES", 10)

    with pytest.raises(extraction.PdfExtractionError) as caught:
        extraction.extract_pdf_text(make_pdf("too large"))

    assert caught.value.code == "file_too_large"
