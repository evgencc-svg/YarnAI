"""Deterministic local extraction of the text layer from pattern PDFs."""

from __future__ import annotations

from io import BytesIO
from typing import Any

from pypdf import PdfReader
from pypdf.errors import FileNotDecryptedError, PdfReadError


MAX_PDF_BYTES = 20 * 1024 * 1024
MAX_PDF_PAGES = 200
MAX_PDF_PAGE_TEXT_CHARS = 100_000
MAX_PDF_TEXT_CHARS = 1_000_000


class PdfExtractionError(ValueError):
    """A controlled PDF extraction failure safe to expose to the client."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _normalize_text(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n").lstrip("\ufeff")


def extract_pdf_text(payload: bytes) -> dict[str, Any]:
    """Extract a PDF text layer in stable page order without OCR."""

    if len(payload) > MAX_PDF_BYTES:
        raise PdfExtractionError(
            "file_too_large",
            "PDF exceeds the safe local extraction size limit.",
        )
    try:
        reader = PdfReader(BytesIO(payload), strict=False)
        if reader.is_encrypted:
            raise PdfExtractionError(
                "pdf_encrypted",
                "Encrypted PDF files cannot be read locally.",
            )
        page_count = len(reader.pages)
        if page_count > MAX_PDF_PAGES:
            raise PdfExtractionError(
                "pdf_too_many_pages",
                "PDF exceeds the safe page-count limit.",
            )
        pages: list[dict[str, Any]] = []
        total_length = 0
        for page_number, page in enumerate(reader.pages, start=1):
            text = _normalize_text(page.extract_text() or "")
            if len(text) > MAX_PDF_PAGE_TEXT_CHARS:
                raise PdfExtractionError(
                    "extraction_failed",
                    f"Text on PDF page {page_number} exceeds the safe limit.",
                )
            total_length += len(text)
            if total_length > MAX_PDF_TEXT_CHARS:
                raise PdfExtractionError(
                    "extraction_failed",
                    "Extracted PDF text exceeds the safe total limit.",
                )
            pages.append(
                {
                    "pageNumber": page_number,
                    "text": text,
                    "textLength": len(text),
                    "warnings": [],
                }
            )
    except PdfExtractionError:
        raise
    except FileNotDecryptedError as error:
        raise PdfExtractionError(
            "pdf_encrypted", "Encrypted PDF files cannot be read locally."
        ) from error
    except (PdfReadError, OSError, ValueError, TypeError, KeyError) as error:
        raise PdfExtractionError(
            "pdf_invalid", "The PDF is damaged or has an unsupported structure."
        ) from error
    except Exception as error:
        raise PdfExtractionError(
            "extraction_failed", "The PDF text layer could not be extracted."
        ) from error

    combined_text = "\n".join(page["text"] for page in pages)
    if not any(page["text"].strip() for page in pages):
        return {
            "status": "no_text_layer",
            "pageCount": page_count,
            "pages": pages,
            "text": "",
            "textLength": 0,
            "warnings": [
                {
                    "code": "pdf_no_text_layer",
                    "message": "PDF has no extractable text layer; OCR was not used.",
                }
            ],
        }
    return {
        "status": "extracted",
        "pageCount": page_count,
        "pages": pages,
        "text": combined_text,
        "textLength": len(combined_text),
        "warnings": [],
    }
