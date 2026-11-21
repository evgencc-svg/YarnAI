from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[2] / "src" / "yarnai" / "static"


class ReviewPageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: list[str] = []
        self.ids: set[str] = set()
        self.links: list[str] = []
        self.buttons: list[dict[str, str | None]] = []
        self.labels: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.add(values["id"] or "")
        if tag == "script" and values.get("src"):
            self.assets.append(values["src"] or "")
        if tag == "link" and values.get("href"):
            self.assets.append(values["href"] or "")
        if tag == "img" and values.get("src"):
            self.assets.append(values["src"] or "")
        if tag == "a" and values.get("href"):
            self.links.append(values["href"] or "")
        if tag == "button":
            self.buttons.append(values)
        if tag == "label" and values.get("for"):
            self.labels.append(values["for"] or "")


def test_review_route_content_type_cache_and_security_headers() -> None:
    response = TestClient(app).get("/pattern-technology-review")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"
    csp = response.headers["content-security-policy"]
    assert "default-src 'self'" in csp
    assert "connect-src 'self'" in csp
    assert "Что Yarn AI изменил в вашей инструкции" in response.text


def test_review_page_has_complete_sectioned_ui_and_local_assets() -> None:
    client = TestClient(app)
    response = client.get("/pattern-technology-review")
    parser = ReviewPageParser()
    parser.feed(response.text)

    required = {
        "pattern-technology-review-status",
        "pattern-technology-review-source",
        "pattern-technology-review-source-revision",
        "pattern-technology-review-summary",
        "pattern-technology-review-overview",
        "pattern-technology-review-materials",
        "pattern-technology-review-components",
        "pattern-technology-review-sections",
        "pattern-technology-review-operations",
        "pattern-technology-review-rows",
        "pattern-technology-review-repeats",
        "pattern-technology-review-stitches",
        "pattern-technology-review-finishing",
        "pattern-technology-review-abbreviations",
        "pattern-technology-review-assumptions",
        "pattern-technology-review-missing",
        "pattern-technology-review-conflicts",
        "pattern-technology-review-warnings",
        "pattern-technology-review-provenance",
        "pattern-technology-review-validation",
        "pattern-technology-review-validation-critical",
        "pattern-technology-review-validation-noncritical",
        "pattern-technology-review-validation-informational",
        "pattern-technology-review-confirm-guidance",
        "pattern-technology-review-operation-status",
        "pattern-technology-executable-input",
        "pattern-technology-executable-input-readiness",
        "pattern-technology-executable-input-identity",
        "pattern-technology-executable-input-binding",
        "pattern-technology-executable-input-coverage",
        "pattern-technology-executable-input-blockers",
        "pattern-technology-executable-input-provenance",
    }
    assert required <= parser.ids
    assert parser.assets
    assert all(asset.startswith("/static/") for asset in parser.assets)
    for asset in parser.assets:
        asset_response = client.get(asset)
        assert asset_response.status_code == 200, asset
        assert asset_response.content
    assert client.get("/static/pattern-technology-review.js").headers[
        "content-type"
    ].startswith(("text/javascript", "application/javascript"))
    assert client.get("/static/pattern-technology-review.css").headers[
        "content-type"
    ].startswith("text/css")


def test_review_actions_and_correction_form_are_accessible() -> None:
    html = (STATIC / "pattern-technology-review.html").read_text(encoding="utf-8")
    parser = ReviewPageParser()
    parser.feed(html)

    for action_id in (
        "pattern-technology-review-start",
        "pattern-technology-review-validate",
        "pattern-technology-review-confirm",
        "pattern-technology-review-reopen",
        "pattern-technology-review-new",
        "pattern-technology-review-correction-cancel",
    ):
        assert action_id in parser.ids
    assert all(button.get("type") in {"button", "submit"} for button in parser.buttons)
    assert {
        "pattern-technology-review-correction-type",
        "pattern-technology-review-correction-value",
        "pattern-technology-review-correction-unit",
    } <= set(parser.labels)
    assert 'aria-live="polite"' in html
    assert 'role="alert"' in html
    assert '<details class="card review-disclosure"' in html


def test_blocked_confirmation_is_visibly_disabled_and_explains_next_user_decision() -> None:
    html = (STATIC / "pattern-technology-review.html").read_text(encoding="utf-8")
    css = (STATIC / "pattern-technology-review.css").read_text(encoding="utf-8")
    domain = (STATIC / "pattern-technology-review.js").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-technology-review-assistant.js").read_text(
        encoding="utf-8"
    )

    assert 'aria-describedby="pattern-technology-review-confirm-guidance"' in html
    assert ".review-actions .link-button:disabled" in css
    assert "cursor: not-allowed" in css
    assert "buildConfirmationGuidance(state, validation)" in controller
    assert "REQUIRED_DECISION_PENDING" in domain
    assert "В разделе «Операции» выберите «Принять», «Исправить» или «Отклонить»" in domain
    assert "Yarn AI не примет решение за вас" in domain
    assert 'ui.confirm.setAttribute("aria-disabled", String(ui.confirm.disabled))' in controller


def test_decision_action_has_visible_busy_feedback_and_stable_dom_identity() -> None:
    html = (STATIC / "pattern-technology-review.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-technology-review-assistant.js").read_text(encoding="utf-8")
    decision_ui = (STATIC / "pattern-technology-review-decision-ui.js").read_text(encoding="utf-8")

    assert 'id="pattern-technology-review-operation-status"' in html
    assert 'ui.workflow.setAttribute("aria-busy", "true")' in controller
    assert 'ui.items.querySelectorAll("button")' in controller
    assert 'button.dataset.stage21Action = "set-decision"' in decision_ui
    assert 'button.dataset.targetId' in decision_ui
    assert 'button.dataset.decision' in decision_ui


def test_safe_rendering_local_only_and_no_stage_23() -> None:
    html = (STATIC / "pattern-technology-review.html").read_text(encoding="utf-8")
    domain = (STATIC / "pattern-technology-review.js").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-technology-review-assistant.js").read_text(
        encoding="utf-8"
    )
    scripts = f"{domain}\n{controller}"
    lower = f"{html}\n{scripts}".lower()

    assert "textContent" in controller
    assert "document.createElement" in controller
    assert "innerHTML" not in controller
    assert "insertAdjacentHTML" not in controller
    assert "onclick=" not in html
    assert " eval(" not in scripts
    assert "new Function" not in scripts
    for forbidden in (
        "fetch(",
        "xmlhttprequest",
        "websocket",
        "api.openai.com",
        "tesseract",
        "pdfjs",
        "filereader",
    ):
        assert forbidden not in lower
    later_stage = 20 + 3
    assert f"stage {later_stage}" not in lower
    assert f"stage-{later_stage}" not in lower


def test_responsive_layout_prevents_narrow_horizontal_overflow() -> None:
    css = (STATIC / "pattern-technology-review.css").read_text(encoding="utf-8")
    html = (STATIC / "pattern-technology-review.html").read_text(encoding="utf-8")

    assert "@media (max-width: 560px)" in css
    assert "min-width: 0" in css
    assert "overflow-wrap: anywhere" in css
    assert "max-width: 100%" in css
    assert "width: 100%" in css
    assert ":focus-visible" in css
    assert 'name="viewport"' in html


def test_stage_20_and_stage_21_navigation_is_bidirectional() -> None:
    draft_html = (STATIC / "pattern-technology-draft.html").read_text(
        encoding="utf-8"
    )
    draft_controller = (
        STATIC / "pattern-technology-draft-assistant.js"
    ).read_text(encoding="utf-8")
    review_html = (STATIC / "pattern-technology-review.html").read_text(
        encoding="utf-8"
    )
    review_controller = (
        STATIC / "pattern-technology-review-assistant.js"
    ).read_text(encoding="utf-8")

    assert "Проверить технологию" in draft_html
    assert "/pattern-technology-review?project=" in draft_controller
    assert "Вернуться к черновику" in review_html
    assert "/pattern-technology-draft?project=" in review_controller


def test_stage_21_links_forward_to_stage_22() -> None:
    review_html = (STATIC / "pattern-technology-review.html").read_text(
        encoding="utf-8"
    )
    review_controller = (
        STATIC / "pattern-technology-review-assistant.js"
    ).read_text(encoding="utf-8")

    assert 'id="pattern-technology-review-nav-plan"' in review_html
    assert "/pattern-execution-plan?project=" in review_controller


def test_executable_input_ui_separates_evidence_provenance_and_readiness() -> None:
    html = (STATIC / "pattern-technology-review.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-technology-review-assistant.js").read_text(
        encoding="utf-8"
    )

    assert "EXECUTABLE_TECHNOLOGY_PLAN_INPUT_V1" in html
    assert "SOURCE_PATTERN_EVIDENCE" in controller
    assert "USER_ADAPTATION_PROFILE" in controller
    assert "ADAPTATION_CALCULATED" in controller
    assert "DERIVED_BY_DECLARED_FORMULA" in controller
    assert "UNRESOLVED" in controller
    assert "Не готов к вязанию" in controller
    assert "Технология готова" not in f"{html}\n{controller}"


def test_executable_input_ui_renders_confirmed_instruction_coverage_and_binding() -> None:
    controller = (STATIC / "pattern-technology-review-assistant.js").read_text(
        encoding="utf-8"
    )

    assert "input.coverage?.items" in controller
    assert "input.coverage?.sections" in controller
    assert "entry.component" in controller
    assert "entry.complete" in controller
    assert "sourceInstructionEvidenceIdentity" in controller
    assert "sourceInstructionEvidenceRevision" in controller
    assert "sourceInstructionEvidenceFingerprint" in controller
    assert "sourceInstructionResultIdentity" in controller
    assert '["Stage 21 review", `${state.id} · revision ${state.revision} · status ${state.status}`]' in controller
    assert '["Stage 21 immutable snapshot", state.immutableSourceSnapshotFingerprint]' in controller


def test_primary_ui_renders_human_adaptation_explanation_and_separates_diagnostics() -> None:
    html = (STATIC / "pattern-technology-review.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-technology-review-assistant.js").read_text(
        encoding="utf-8"
    )

    assert "Было → Стало → Почему" in html
    for label in ("Было", "Стало", "Почему", "Практический смысл"):
        assert f'adaptationFact("{label}"' in controller
    assert '<details id="pattern-technology-executable-input"' in html
    assert "Техническая диагностика входа плана" in html
    assert "buildAdaptationExplanation" in controller
    assert "Объяснение построено по сохранённым данным без догадок" in controller


def test_primary_ui_does_not_print_stage_ids_or_fingerprints() -> None:
    controller = (STATIC / "pattern-technology-review-assistant.js").read_text(
        encoding="utf-8"
    )
    render_start = controller.index("function renderAdaptationExplanation")
    render_end = controller.index("function renderSummary", render_start)
    primary_renderer = controller[render_start:render_end]

    for forbidden in ("fingerprint", "revision", "state.id", "sourceDraftId", "JSON"):
        assert forbidden not in primary_renderer


def test_completed_stage_21_view_uses_read_only_inspection_and_hides_repeat_actions() -> None:
    html = (STATIC / "pattern-technology-review.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-technology-review-assistant.js").read_text(
        encoding="utf-8"
    )
    domain = (STATIC / "pattern-technology-review.js").read_text(encoding="utf-8")

    assert 'id="pattern-technology-review-read-only"' in html
    assert 'parameters.get("view") === "completed"' in controller
    assert "await reviewApi.inspectForProject(repository, projectId)" in controller
    assert "if (!readOnlyCompleted)" in controller
    assert "if (readOnlyCompleted) return article;" in controller
    assert controller.index("if (readOnlyCompleted) return article;") < controller.index(
        'actions.append('
    )
    assert "Результат уже принят — повторное действие не требуется" in controller
    assert "Адаптация подтверждена, но поддержана не полностью" in controller
    assert "async function inspectForProject(repository, projectId)" in domain


def test_saved_project_card_exposes_completed_stage_21_without_replacing_current_action() -> None:
    controller = (STATIC / "user-workspace-entry-assistant.js").read_text(
        encoding="utf-8"
    )
    presentation = (STATIC / "user-workspace-entry.js").read_text(encoding="utf-8")

    assert "project.completedTechnologyReview" in controller
    assert "Посмотреть принятую адаптацию" in presentation
    assert "&view=completed" in presentation
