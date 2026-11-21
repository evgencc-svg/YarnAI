"""One-shot provider supplement for GARMENT_YARN_RECOMMENDATION_V1.

The supplement exists only for legacy garment analyses that predate yarn
characterization. It reuses the proven photo, authorization, transport-audit,
and cost boundaries without mutating the saved garment analysis.
"""

from __future__ import annotations

from collections.abc import Mapping
from copy import deepcopy
import hashlib
import json
import math
import re
from typing import Any

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from yarnai.garment_reference import (
    COST_CAP_USD,
    IMAGE_DETAIL,
    MAX_OUTPUT_TOKENS,
    PROVIDER_BACKGROUND,
    PROVIDER_RETRIES,
    PROVIDER_STORE,
    PROVIDER_STREAM,
    PROVIDER_TOOLS,
    REASONING_EFFORT,
    RESPONSES_ENDPOINT_URL,
    SANITIZED_MIME_TYPE,
    GarmentReferenceError,
    SqlitePilotAuthorizationStore,
    UrllibJsonTransport,
    assert_pilot_configuration_cost_safe,
    estimate_validated_request_cost,
    validate_pilot_request,
)
from yarnai.vision_review import DEFAULT_MODEL, DEFAULT_PROVIDER, VisionGatewaySettings


CONTRACT_VERSION = "GARMENT_YARN_RECOMMENDATION_V1"
PROVIDER_SCHEMA_VERSION = 3
YARN_RECOMMENDATION_ROUTE = "/api/v1/garment-yarn-recommendations"
YARN_RECOMMENDATION_CONFIGURATION_ROUTE = f"{YARN_RECOMMENDATION_ROUTE}/configuration"


def _object(properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {"type": "object", "additionalProperties": False, "properties": properties, "required": required}


_RANGE = lambda unit: _object(  # noqa: E731
    {"min": {"type": "number", "exclusiveMinimum": 0}, "max": {"type": "number", "exclusiveMinimum": 0}, "unit": {"type": "string", "const": unit}},
    ["min", "max", "unit"],
)
_TEXT = {"type": "string", "minLength": 1, "maxLength": 2000}
_CATEGORY_TEXT = {"type": "string", "minLength": 1, "maxLength": 200}
_CONFIDENCE = {"type": "string", "enum": ["low", "medium", "high"]}
_SURFACE = {"type": "string", "enum": ["smooth", "slight_halo", "medium_halo", "strong_halo_or_brushed"]}
_LIMITATION_CODES = (
    "exact_fiber_composition_unknown",
    "exact_brand_article_unknown",
    "original_yarn_linear_density_unknown",
    "actual_original_gauge_unknown",
    "post_wash_behavior_unknown",
)
_SURFACE_LEVELS = ("smooth", "slight_halo", "medium_halo", "strong_halo")
_VISUAL_FACT_CODES = {
    "knitScale": "knit_scale",
    "verticalTexture": "vertical_texture",
    "stitchClarity": "stitch_clarity",
    "surface": "surface",
    "fabricBehavior": "fabric_behavior",
    "colorEffect": "color_effect",
}


def _claim_provenance_schema(fact_code: str) -> dict[str, Any]:
    common = {"upstreamFactCode": {"type": "string", "const": fact_code}}
    observed = dict(common, kind={"type": "string", "const": "observed"}, uncertainty={"type": "null"})
    inferred = dict(common, kind={"type": "string", "const": "inferred"}, uncertainty=_CONFIDENCE)
    return {"anyOf": [_object(observed, list(observed)), _object(inferred, list(inferred))]}


def _surface_effect_schema(level: str) -> dict[str, Any]:
    fields = {
        "level": {"type": "string", "const": level},
        "verticalTexture": _TEXT,
        "trimClarity": _TEXT,
        "volumeHalo": _TEXT,
        "referenceDifference": _TEXT,
    }
    return _object(fields, list(fields))


def _variant_schema(kind: str) -> dict[str, Any]:
    common = {
        "kind": {"type": "string", "const": kind}, "metersPer100g": _RANGE("m_per_100g"), "categoryRu": _CATEGORY_TEXT,
        "targetStitchesPer10cm": _RANGE("stitches_per_10cm"),
        "initialNeedlesMm": _RANGE("mm"),
        "strandCount": {"type": "integer", "minimum": 1, "maximum": 8}, "surface": _SURFACE,
        "textureEffect": _TEXT, "drapeStructure": _TEXT, "garmentWeightVolume": _TEXT, "trimBehavior": _TEXT,
        "referenceSimilarity": _TEXT, "risk": _TEXT, "confidence": _CONFIDENCE,
        "basis": {"type": "array", "minItems": 1, "maxItems": 6, "items": _TEXT},
    }
    with_rows = dict(common, targetRowsPer10cm=_RANGE("rows_per_10cm"), rowGaugeUncertainty={"type": "null"})
    without_rows = dict(common, targetRowsPer10cm={"type": "null"}, rowGaugeUncertainty=_TEXT)
    return {"anyOf": [_object(with_rows, list(with_rows)), _object(without_rows, list(without_rows))]}


YARN_RECOMMENDATION_JSON_SCHEMA = _object(
    {
        "status": {"type": "string", "enum": ["ready", "partial", "needs_closeup"]}, "summary": _TEXT,
        "visualEvidence": _object(
            {
                "knitScale": _TEXT,
                "verticalTexture": _TEXT,
                "stitchClarity": _TEXT,
                "surface": _TEXT,
                "fabricBehavior": _object(
                    {"behaviorCode": {"type": "string", "enum": ["compact_stable_form", "pliable_drape", "structured_drape", "cannot_determine"]}},
                    ["behaviorCode"],
                ),
                "colorEffect": _TEXT,
                "claimProvenance": _object(
                    {field: _claim_provenance_schema(code) for field, code in _VISUAL_FACT_CODES.items()},
                    list(_VISUAL_FACT_CODES),
                ),
                "photoLimitations": {"type": "array", "minItems": 1, "maxItems": 8, "items": _TEXT},
                "confidence": _CONFIDENCE,
                "basis": {"type": "array", "minItems": 1, "maxItems": 8, "items": _TEXT},
            },
            ["knitScale", "verticalTexture", "stitchClarity", "surface", "fabricBehavior", "colorEffect", "claimProvenance", "photoLimitations", "confidence", "basis"],
        ),
        "limitations": {
            "type": "array",
            "minItems": len(_LIMITATION_CODES),
            "maxItems": len(_LIMITATION_CODES),
            "items": _object(
                {"code": {"type": "string", "enum": list(_LIMITATION_CODES)}, "explanation": _TEXT},
                ["code", "explanation"],
            ),
        },
        "recommendedMiddle": _variant_schema("recommended_middle"), "thinnerAlternative": _variant_schema("thinner"), "thickerAlternative": _variant_schema("thicker"),
        "surfaceRecommendation": _object(
            {
                "smooth": _surface_effect_schema("smooth"),
                "slightHalo": _surface_effect_schema("slight_halo"),
                "mediumHalo": _surface_effect_schema("medium_halo"),
                "strongHalo": _surface_effect_schema("strong_halo"),
                "companionThread": _TEXT,
            },
            ["smooth", "slightHalo", "mediumHalo", "strongHalo", "companionThread"],
        ),
        "manufacturingChoice": _object(
            {
                "provenance": {"type": "string", "const": "selected"},
                "constructionIdentity": _CATEGORY_TEXT,
                "decisionId": _CATEGORY_TEXT,
                "decisionRevision": {"type": "integer", "minimum": 1},
                "decisionFingerprint": _CATEGORY_TEXT,
                "explanation": _TEXT,
            },
            ["provenance", "constructionIdentity", "decisionId", "decisionRevision", "decisionFingerprint", "explanation"],
        ),
        "swatchRequirement": _object({"message": _TEXT, "targetIsNotActualGauge": {"type": "boolean", "const": True}}, ["message", "targetIsNotActualGauge"]),
        "confidence": _CONFIDENCE,
    },
    ["status", "summary", "visualEvidence", "limitations", "recommendedMiddle", "thinnerAlternative", "thickerAlternative", "surfaceRecommendation", "manufacturingChoice", "swatchRequirement", "confidence"],
)


_EXACT_CLAIM = re.compile(
    r"(точн(?:ая|ый|ое)\s+(?:марка|состав|метраж|плотность|спиц)[^.]{0,60}(?:распознан|определ[её]н)|"
    r"(?:распознан|определ[её]н)[^.]{0,60}точн(?:ая|ый|ое)\s+(?:марка|состав|метраж|плотность|спиц))",
    re.IGNORECASE,
)


def _actual_type(value: object) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, Mapping):
        return "object"
    if isinstance(value, list):
        return "array"
    if isinstance(value, str):
        return "string"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    return type(value).__name__


def _safe_actual(value: object) -> object:
    if isinstance(value, str):
        return value[:160] + ("…" if len(value) > 160 else "")
    if value is None or isinstance(value, (bool, int, float)):
        return value if not isinstance(value, float) or math.isfinite(value) else str(value)
    if isinstance(value, Mapping):
        return {"keys": sorted(str(key)[:80] for key in value)[:40]}
    if isinstance(value, list):
        return {"itemCount": len(value)}
    return _actual_type(value)


def _issue(path: str, reason_code: str, rule: str, expected: str, actual: object) -> dict[str, Any]:
    return {
        "path": path,
        "reasonCode": reason_code,
        "rule": rule,
        "expected": expected,
        "actualType": _actual_type(actual),
        "actualValue": _safe_actual(actual),
    }


def _matches_type(value: object, expected: str) -> bool:
    return {
        "object": isinstance(value, Mapping),
        "array": isinstance(value, list),
        "string": isinstance(value, str),
        "null": value is None,
        "boolean": isinstance(value, bool),
        "integer": isinstance(value, int) and not isinstance(value, bool),
        "number": isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value),
    }.get(expected, False)


def _schema_issues(value: object, schema: Mapping[str, Any], path: str = "$") -> list[dict[str, Any]]:
    if "anyOf" in schema:
        branches = [_schema_issues(value, branch, path) for branch in schema["anyOf"]]
        if any(not branch for branch in branches):
            return []
        return min(branches, key=lambda branch: (len(branch), json.dumps(branch, sort_keys=True)))
    expected_type = schema.get("type")
    if isinstance(expected_type, str) and not _matches_type(value, expected_type):
        return [_issue(path, "type_mismatch", "type", expected_type, value)]
    issues: list[dict[str, Any]] = []
    if "const" in schema and value != schema["const"]:
        issues.append(_issue(path, "const_mismatch", "const", repr(schema["const"]), value))
    if "enum" in schema and value not in schema["enum"]:
        issues.append(_issue(path, "enum_invalid", "enum", json.dumps(schema["enum"], ensure_ascii=False), value))
    if isinstance(value, Mapping) and expected_type == "object":
        properties = schema.get("properties", {})
        for key in schema.get("required", []):
            if key not in value:
                issues.append(_issue(f"{path}.{key}", "required_field_missing", "required", "field present", "<missing>"))
        if schema.get("additionalProperties") is False:
            for key in sorted(set(value) - set(properties)):
                issues.append(_issue(f"{path}.{key}", "unknown_field", "additionalProperties", "no unknown fields", value[key]))
        for key, child_schema in properties.items():
            if key in value:
                issues.extend(_schema_issues(value[key], child_schema, f"{path}.{key}"))
    if isinstance(value, list) and expected_type == "array":
        if "minItems" in schema and len(value) < schema["minItems"]:
            issues.append(_issue(path, "array_too_short", "minItems", str(schema["minItems"]), value))
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            issues.append(_issue(path, "array_too_long", "maxItems", str(schema["maxItems"]), value))
        if "items" in schema:
            for index, entry in enumerate(value):
                issues.extend(_schema_issues(entry, schema["items"], f"{path}[{index}]"))
    if isinstance(value, str) and expected_type == "string":
        if "minLength" in schema and len(value) < schema["minLength"]:
            issues.append(_issue(path, "string_too_short", "minLength", str(schema["minLength"]), value))
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            issues.append(_issue(path, "string_too_long", "maxLength", str(schema["maxLength"]), value))
    if _matches_type(value, "number") and expected_type in {"number", "integer"}:
        if "exclusiveMinimum" in schema and value <= schema["exclusiveMinimum"]:
            issues.append(_issue(path, "number_out_of_range", "exclusiveMinimum", f"> {schema['exclusiveMinimum']}", value))
        if "minimum" in schema and value < schema["minimum"]:
            issues.append(_issue(path, "number_out_of_range", "minimum", f">= {schema['minimum']}", value))
        if "maximum" in schema and value > schema["maximum"]:
            issues.append(_issue(path, "number_out_of_range", "maximum", f"<= {schema['maximum']}", value))
    return issues


def _walk_strings(value: object, path: str = "$"):
    if isinstance(value, str):
        yield path, value
    elif isinstance(value, Mapping):
        for key, child in value.items():
            yield from _walk_strings(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _walk_strings(child, f"{path}[{index}]")


def _semantic_issues(value: object, semantic_context: Mapping[str, Any] | None) -> list[dict[str, Any]]:
    """Validate authoritative meaning from structured fields, never narrative regexes."""

    if not isinstance(value, Mapping):
        return []
    issues: list[dict[str, Any]] = []
    visual = value.get("visualEvidence")
    if isinstance(visual, Mapping):
        fabric = visual.get("fabricBehavior")
        if not isinstance(fabric, Mapping):
            issues.append(_issue(
                "$.visualEvidence.fabricBehavior",
                "UNGROUNDED_VISUAL_EVIDENCE",
                "structuredVisualClaim",
                "controlled fabric behavior with observed/inferred provenance; selected construction is forbidden",
                fabric,
            ))
        provenance = visual.get("claimProvenance")
        upstream_facts = semantic_context.get("upstreamFacts", {}) if isinstance(semantic_context, Mapping) else {}
        if isinstance(provenance, Mapping) and isinstance(upstream_facts, Mapping):
            for field, fact_code in _VISUAL_FACT_CODES.items():
                claim = provenance.get(field)
                upstream = upstream_facts.get(fact_code)
                if not isinstance(claim, Mapping) or not isinstance(upstream, Mapping):
                    continue
                if claim.get("kind") == "observed" and upstream.get("status") != "observed":
                    issues.append(_issue(
                        f"$.visualEvidence.{field}",
                        "UNGROUNDED_VISUAL_EVIDENCE",
                        "noProvenancePromotion",
                        f"at most {upstream.get('status', 'unknown')} from upstream {fact_code}",
                        claim,
                    ))

    limitations = value.get("limitations")
    present_codes = [
        item.get("code") for item in limitations
        if isinstance(limitations, list) and isinstance(item, Mapping) and isinstance(item.get("code"), str)
    ] if isinstance(limitations, list) else []
    for code in _LIMITATION_CODES:
        if code not in present_codes:
            issues.append(_issue(
                f"$.limitations[?(@.code=='{code}')]",
                "REQUIRED_LIMITATION_MISSING",
                "requiredSemanticLimitation",
                code,
                present_codes,
            ))
    for code in _LIMITATION_CODES:
        if present_codes.count(code) > 1:
            issues.append(_issue(
                f"$.limitations[?(@.code=='{code}')]",
                "REQUIRED_LIMITATION_DUPLICATE",
                "uniqueSemanticLimitation",
                "exactly one occurrence",
                present_codes.count(code),
            ))

    surface = value.get("surfaceRecommendation")
    required_surface_keys = {"smooth", "slightHalo", "mediumHalo", "strongHalo", "companionThread"}
    if not isinstance(surface, Mapping) or set(surface) != required_surface_keys:
        legacy_path = "$.surfaceRecommendation.mediumOrStrongHalo" if isinstance(surface, Mapping) and "mediumOrStrongHalo" in surface else "$.surfaceRecommendation"
        issues.append(_issue(
            legacy_path,
            "SURFACE_LEVELS_NOT_DISTINCT",
            "fourDistinctSurfaceLevels",
            "smooth, slight_halo, medium_halo and strong_halo as separate effects",
            surface,
        ))

    choice = value.get("manufacturingChoice")
    expected_choice = semantic_context.get("technologyDecision") if isinstance(semantic_context, Mapping) else None
    if isinstance(choice, Mapping) and isinstance(expected_choice, Mapping):
        comparisons = (
            ("constructionIdentity", "constructionIdentity"),
            ("decisionId", "id"),
            ("decisionRevision", "revision"),
            ("decisionFingerprint", "fingerprint"),
        )
        for field, expected_field in comparisons:
            if choice.get(field) != expected_choice.get(expected_field):
                issues.append(_issue(
                    f"$.manufacturingChoice.{field}",
                    "SELECTED_TECHNOLOGY_BINDING_MISMATCH",
                    "exactOwnerDecisionBinding",
                    repr(expected_choice.get(expected_field)),
                    choice.get(field),
                ))
    return issues


def _domain_issues(value: object, semantic_context: Mapping[str, Any] | None = None) -> list[dict[str, Any]]:
    issues = _semantic_issues(value, semantic_context)
    if not isinstance(value, Mapping):
        return issues
    variants: dict[str, Mapping[str, Any]] = {}
    for key in ("thinnerAlternative", "recommendedMiddle", "thickerAlternative"):
        variant = value.get(key)
        if not isinstance(variant, Mapping):
            continue
        variants[key] = variant
        rows = variant.get("targetRowsPer10cm")
        uncertainty = variant.get("rowGaugeUncertainty")
        if rows is None and (not isinstance(uncertainty, str) or not uncertainty.strip()):
            issues.append(_issue(f"$.{key}.rowGaugeUncertainty", "required_when_target_rows_null", "rowGaugeXor", "non-blank string", uncertainty))
        if rows is not None and uncertainty is not None:
            issues.append(_issue(f"$.{key}.rowGaugeUncertainty", "must_be_null_when_target_rows_present", "rowGaugeXor", "null", uncertainty))
        for range_key in ("metersPer100g", "targetStitchesPer10cm", "targetRowsPer10cm", "initialNeedlesMm"):
            item = variant.get(range_key)
            if isinstance(item, Mapping):
                minimum, maximum = item.get("min"), item.get("max")
                if _matches_type(minimum, "number") and _matches_type(maximum, "number") and minimum > maximum:
                    issues.append(_issue(f"$.{key}.{range_key}.max", "range_order_invalid", "minimum <= maximum", f">= {minimum}", maximum))
        texture = variant.get("textureEffect")
        if variant.get("surface") == "strong_halo_or_brushed" and isinstance(texture, str) and not re.search(r"(скры|размы|чётк)", texture, re.IGNORECASE):
            issues.append(_issue(f"$.{key}.textureEffect", "surface_effect_missing", "semantic surface effect", "explain loss of texture clarity", texture))
    if len(variants) == 3:
        meter_ranges = [variants[key].get("metersPer100g") for key in ("thinnerAlternative", "recommendedMiddle", "thickerAlternative")]
        minima = [entry.get("min") if isinstance(entry, Mapping) else None for entry in meter_ranges]
        if all(_matches_type(entry, "number") for entry in minima) and not (minima[0] > minima[1] > minima[2]):
            issues.append(_issue("$.recommendedMiddle.metersPer100g.min", "thickness_order_invalid", "thinner > middle > thicker meterage", f"between {minima[0]} and {minima[2]}", minima[1]))
    for path, text in _walk_strings(value):
        if not text.strip():
            issues.append(_issue(path, "blank_string", "nonBlank", "non-blank string", text))
        elif _EXACT_CLAIM.search(text):
            issues.append(_issue(path, "false_exact_yarn_claim", "advisoryOnly", "no exact-recognition claim", text))
    return issues


class ProviderOutputValidationError(GarmentReferenceError):
    def __init__(self, issues: list[dict[str, Any]]) -> None:
        self.issues = issues
        self.reason_code = issues[0]["reasonCode"] if issues else "unknown_validation_error"
        self.path = issues[0]["path"] if issues else "$"
        self.validation_stage = "semantic_validation" if self.reason_code in {
            "UNGROUNDED_VISUAL_EVIDENCE",
            "REQUIRED_LIMITATION_MISSING",
            "REQUIRED_LIMITATION_DUPLICATE",
            "SURFACE_LEVELS_NOT_DISTINCT",
            "SELECTED_TECHNOLOGY_BINDING_MISMATCH",
        } else "domain_validation"
        super().__init__(
            "provider_output_validation_failed",
            "Ответ provider нарушил строгий контракт рекомендации; результат не сохранён.",
            status_code=502,
        )


def _trim_strings(value: object) -> object:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, Mapping):
        return {key: _trim_strings(child) for key, child in value.items()}
    if isinstance(value, list):
        return [_trim_strings(child) for child in value]
    return value


def validate_provider_payload(payload: object, *, semantic_context: Mapping[str, Any] | None = None) -> dict[str, Any]:
    issues = _domain_issues(payload, semantic_context)
    issues.extend(_schema_issues(payload, YARN_RECOMMENDATION_JSON_SCHEMA))
    if issues:
        unique = {json.dumps(issue, ensure_ascii=False, sort_keys=True): issue for issue in issues}
        raise ProviderOutputValidationError(list(unique.values()))
    return _trim_strings(deepcopy(dict(payload)))  # type: ignore[arg-type,return-value]


def _developer_instruction() -> str:
    return (
        "Верни только чистый JSON по схеме, без Markdown fence и пояснений вне JSON. Анализируй exact вязаное изделие на фотографии и предложи три диапазона для ручного вязания похожего самостоятельного изделия: thinner, recommended_middle, thicker. "
        "Числа являются рекомендуемыми диапазонами, не измеренными фактами. Больше метров на 100 г означает более тонкую нить. Отделяй visualEvidence от adaptation. "
        "visualEvidence использует только structured upstream facts и не может превращать selected technology decision в наблюдение. fabricBehavior выбирается только из schema enum; не добавляй туда свободный текст о швах, деталях, пройме или рукаве. "
        "manufacturingChoice описывает выбранный владельцем способ изготовления с provenance=selected и exact binding из trusted_semantic_context; это не визуальный факт. "
        "Верни ровно пять отдельных limitation codes: exact_fiber_composition_unknown, exact_brand_article_unknown, original_yarn_linear_density_unknown, actual_original_gauge_unknown, post_wash_behavior_unknown. Русское explanation объясняет каждый код отдельно. "
        "Опиши smooth, slight_halo, medium_halo и strong_halo строго раздельно. Для каждого отдельно объясни читаемость вертикальной фактуры, чёткость планки/воротника, визуальный объём/пушистость и отличие от фотографии. "
        "Не называй марку, артикул, точный состав, точный метраж оригинала, точные спицы или фактическую плотность оригинала. Все объяснения пиши кратко по-русски. "
        "Если targetRowsPer10cm задан диапазоном, rowGaugeUncertainty должен быть null; если диапазон рядов null, rowGaugeUncertainty обязан честно объяснить неизвестность. Target gauge не равен actual gauge; обязательно требуй обработанный образец."
    )


def build_provider_request(request: Any, semantic_context: Mapping[str, Any] | None = None) -> dict[str, Any]:
    assert_pilot_configuration_cost_safe()
    estimate = estimate_validated_request_cost(request)
    if estimate["upper_bound_usd"] > COST_CAP_USD:
        raise GarmentReferenceError("cost_cap_exceeded", "Верхняя оценка стоимости превышает $0.05.", status_code=409)
    image = request.sanitized_image
    return {
        "model": DEFAULT_MODEL, "store": PROVIDER_STORE, "background": PROVIDER_BACKGROUND, "stream": PROVIDER_STREAM,
        "truncation": "disabled", "reasoning": {"effort": REASONING_EFFORT}, "max_output_tokens": MAX_OUTPUT_TOKENS, "tools": list(PROVIDER_TOOLS),
        "input": [{"role": "developer", "content": [{"type": "input_text", "text": _developer_instruction()}]}, {"role": "user", "content": [{"type": "input_text", "text": json.dumps({"purpose": "yarn characterization for a similar hand-knitted polo", "trusted_semantic_context": semantic_context or {}}, ensure_ascii=False, separators=(",", ":"))}, {"type": "input_image", "detail": IMAGE_DETAIL, "image_url": f"data:{SANITIZED_MIME_TYPE};base64,{image.content_base64}"}]}],
        "text": {"format": {"type": "json_schema", "name": "yarnai_garment_yarn_recommendation_v1", "strict": True, "schema": deepcopy(YARN_RECOMMENDATION_JSON_SCHEMA)}},
    }


_MAX_AUDIT_MODEL_OUTPUT_BYTES = 250_000
_FORBIDDEN_AUDIT_OUTPUT = re.compile(r"data:image|content_base64|authorization|api[_-]?key", re.IGNORECASE)
_LONG_BASE64 = re.compile(r"(?:[A-Za-z0-9+/]{2048,}={0,2})")


class ProviderOutputError(GarmentReferenceError):
    def __init__(self, code: str, message: str, *, stage: str, reason_code: str, issues: list[dict[str, Any]], diagnostic: dict[str, Any]) -> None:
        self.validation_stage = stage
        self.reason_code = reason_code
        self.issues = issues
        self.path = issues[0]["path"] if issues else "$"
        self.diagnostic = diagnostic
        super().__init__(code, message, status_code=502)


def _audit_output_snapshot(model_output: str | None) -> dict[str, Any]:
    if model_output is None:
        return {"model_output": None, "model_output_sha256": None, "model_output_truncated": False, "model_output_redacted": False}
    encoded = model_output.encode("utf-8")
    digest = hashlib.sha256(encoded).hexdigest()
    if _FORBIDDEN_AUDIT_OUTPUT.search(model_output) or _LONG_BASE64.search(model_output):
        return {"model_output": "[REDACTED_FOR_SECRET_OR_IMAGE_SAFETY]", "model_output_sha256": digest, "model_output_truncated": False, "model_output_redacted": True}
    truncated = len(encoded) > _MAX_AUDIT_MODEL_OUTPUT_BYTES
    saved = encoded[:_MAX_AUDIT_MODEL_OUTPUT_BYTES].decode("utf-8", errors="ignore") if truncated else model_output
    return {"model_output": saved, "model_output_sha256": digest, "model_output_truncated": truncated, "model_output_redacted": False}


def _diagnostic(
    response: Mapping[str, Any],
    *,
    model_output: str | None,
    validation_stage: str,
    reason_code: str,
    issues: list[dict[str, Any]],
    parsed: object = None,
    refusals: list[str] | None = None,
) -> dict[str, Any]:
    metadata = {
        "providerResponseId": _safe_actual(response.get("id")),
        "model": _safe_actual(response.get("model")),
        "status": _safe_actual(response.get("status")),
        "incompleteDetails": _safe_actual(response.get("incomplete_details")),
        "refusals": [entry[:500] for entry in (refusals or [])[:8]],
    }
    result = {
        "provider_response_metadata": metadata,
        "validation_stage": validation_stage,
        "reason_code": reason_code,
        "issues": issues,
        "top_level_keys": sorted(str(key)[:120] for key in parsed)[:100] if isinstance(parsed, Mapping) else [],
    }
    result.update(_audit_output_snapshot(model_output))
    return result


def extract_yarn_recommendation_output(response: Mapping[str, Any]) -> tuple[dict[str, Any], str]:
    texts: list[str] = []
    refusals: list[str] = []
    outputs = response.get("output")
    if not isinstance(outputs, list):
        issues = [_issue("$.output", "output_type_invalid", "type", "array", outputs)]
        diagnostic = _diagnostic(response, model_output=None, validation_stage="provider_envelope", reason_code="output_type_invalid", issues=issues)
        raise ProviderOutputError("provider_response_malformed", "Provider вернул повреждённый envelope; результат не сохранён.", stage="provider_envelope", reason_code="output_type_invalid", issues=issues, diagnostic=diagnostic)
    for output in outputs:
        if not isinstance(output, Mapping) or output.get("type") != "message":
            continue
        contents = output.get("content")
        if not isinstance(contents, list):
            issues = [_issue("$.output[].content", "content_type_invalid", "type", "array", contents)]
            diagnostic = _diagnostic(response, model_output=None, validation_stage="provider_envelope", reason_code="content_type_invalid", issues=issues)
            raise ProviderOutputError("provider_response_malformed", "Provider вернул повреждённый envelope; результат не сохранён.", stage="provider_envelope", reason_code="content_type_invalid", issues=issues, diagnostic=diagnostic)
        for content in contents:
            if not isinstance(content, Mapping):
                continue
            if content.get("type") == "refusal":
                refusals.append(str(content.get("refusal") or "provider refusal"))
            if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                texts.append(content["text"])
    replay_output = texts[0] if len(texts) == 1 else json.dumps(texts, ensure_ascii=False, separators=(",", ":"))
    if response.get("status") == "incomplete":
        issues = [_issue("$.status", "response_incomplete", "const", "completed", response.get("status"))]
        diagnostic = _diagnostic(response, model_output=replay_output, validation_stage="provider_envelope", reason_code="response_incomplete", issues=issues, refusals=refusals)
        raise ProviderOutputError("provider_response_incomplete", "Provider вернул незавершённый ответ; повтор автоматически не выполняется.", stage="provider_envelope", reason_code="response_incomplete", issues=issues, diagnostic=diagnostic)
    if response.get("status") != "completed":
        issues = [_issue("$.status", "response_status_invalid", "const", "completed", response.get("status"))]
        diagnostic = _diagnostic(response, model_output=replay_output, validation_stage="provider_envelope", reason_code="response_status_invalid", issues=issues, refusals=refusals)
        raise ProviderOutputError("provider_response_failed", "Provider не вернул завершённый ответ; повтор автоматически не выполняется.", stage="provider_envelope", reason_code="response_status_invalid", issues=issues, diagnostic=diagnostic)
    if response.get("model") != DEFAULT_MODEL:
        issues = [_issue("$.model", "provider_model_mismatch", "const", DEFAULT_MODEL, response.get("model"))]
        diagnostic = _diagnostic(response, model_output=replay_output, validation_stage="provider_envelope", reason_code="provider_model_mismatch", issues=issues, refusals=refusals)
        raise ProviderOutputError("provider_response_failed", "Provider ответил неразрешённой моделью; повтор автоматически не выполняется.", stage="provider_envelope", reason_code="provider_model_mismatch", issues=issues, diagnostic=diagnostic)
    if refusals:
        issues = [_issue("$.output[].content[].refusal", "provider_refusal", "content type", "output_text", refusals[0])]
        diagnostic = _diagnostic(response, model_output=replay_output, validation_stage="provider_envelope", reason_code="provider_refusal", issues=issues, refusals=refusals)
        raise ProviderOutputError("provider_refusal", "Provider отказался сформировать рекомендацию; повтор автоматически не выполняется.", stage="provider_envelope", reason_code="provider_refusal", issues=issues, diagnostic=diagnostic)
    if len(texts) != 1:
        issues = [_issue("$.output", "output_text_count_invalid", "cardinality", "exactly one output_text", len(texts))]
        diagnostic = _diagnostic(response, model_output=replay_output, validation_stage="provider_envelope", reason_code="output_text_count_invalid", issues=issues)
        raise ProviderOutputError("provider_response_malformed", "Provider вернул повреждённый ответ; повтор автоматически не выполняется.", stage="provider_envelope", reason_code="output_text_count_invalid", issues=issues, diagnostic=diagnostic)
    model_output = texts[0]
    if re.match(r"^\s*```", model_output):
        issues = [_issue("$.output_text", "markdown_fence_forbidden", "pureJson", "JSON without Markdown fence", model_output[:160])]
        diagnostic = _diagnostic(response, model_output=model_output, validation_stage="json_decoding", reason_code="markdown_fence_forbidden", issues=issues)
        raise ProviderOutputError("provider_response_malformed", "Provider обернул JSON в Markdown; результат не сохранён.", stage="json_decoding", reason_code="markdown_fence_forbidden", issues=issues, diagnostic=diagnostic)
    try:
        parsed = json.loads(model_output)
    except json.JSONDecodeError as error:
        path = f"$.output_text[char:{error.pos}]"
        issues = [_issue(path, "json_invalid", "jsonDecode", "valid JSON object", model_output[max(0, error.pos - 40):error.pos + 40])]
        diagnostic = _diagnostic(response, model_output=model_output, validation_stage="json_decoding", reason_code="json_invalid", issues=issues)
        raise ProviderOutputError("provider_response_malformed", "Provider вернул невалидный JSON; результат не сохранён.", stage="json_decoding", reason_code="json_invalid", issues=issues, diagnostic=diagnostic) from error
    if not isinstance(parsed, Mapping):
        issues = [_issue("$", "top_level_type_invalid", "type", "object", parsed)]
        diagnostic = _diagnostic(response, model_output=model_output, validation_stage="json_decoding", reason_code="top_level_type_invalid", issues=issues, parsed=parsed)
        raise ProviderOutputError("provider_response_malformed", "Provider вернул JSON неверного типа; результат не сохранён.", stage="json_decoding", reason_code="top_level_type_invalid", issues=issues, diagnostic=diagnostic)
    return dict(parsed), model_output


class OpenAIYarnRecommendationProvider:
    def __init__(self, credential: str, *, transport: UrllibJsonTransport, audit: Any = None, request_id: str | None = None) -> None:
        self._credential = credential
        self._transport = transport
        self._audit = audit
        self._request_id = request_id

    def _record_diagnostic(self, diagnostic: Mapping[str, Any]) -> None:
        recorder = getattr(self._audit, "record_output_validation_diagnostic", None)
        if callable(recorder) and self._request_id:
            recorder(self._request_id, diagnostic)

    def analyze(self, request: Any, *, semantic_context: Mapping[str, Any] | None = None) -> dict[str, Any]:
        raw = self._transport.post_json(RESPONSES_ENDPOINT_URL, build_provider_request(request, semantic_context), headers={"Authorization": f"Bearer {self._credential}", "Content-Type": "application/json"}, timeout_seconds=120)
        try:
            payload, model_output = extract_yarn_recommendation_output(raw)
            result = validate_provider_payload(payload, semantic_context=semantic_context)
        except ProviderOutputError as error:
            self._record_diagnostic(error.diagnostic)
            raise
        except ProviderOutputValidationError as error:
            diagnostic = _diagnostic(raw, model_output=model_output, validation_stage=error.validation_stage, reason_code=error.reason_code, issues=error.issues, parsed=payload)
            self._record_diagnostic(diagnostic)
            error.diagnostic = diagnostic
            raise
        self._record_diagnostic(_diagnostic(raw, model_output=model_output, validation_stage="semantic_validation", reason_code="validated", issues=[], parsed=payload))
        return result


class GarmentYarnRecommendationGateway:
    def __init__(self, settings: VisionGatewaySettings | None = None, *, provider: Any = None, state_verifier: Any = None, authorization_store: Any = None) -> None:
        self.settings = settings or VisionGatewaySettings()
        self.provider = provider
        self.state_verifier = state_verifier
        self.store = authorization_store

    @property
    def enabled(self) -> bool:
        return bool(self.settings.explicitly_enabled and self.settings.credential_configured and self.settings.provider == DEFAULT_PROVIDER and self.settings.model == DEFAULT_MODEL and self.provider and self.state_verifier and self.store)

    def configuration(self) -> dict[str, Any]:
        cost = assert_pilot_configuration_cost_safe(); pending = self.store.pending_request_id() if self.enabled else None
        binding_getter = getattr(self.store, "pending_binding", None); binding = binding_getter() if pending and callable(binding_getter) else None
        public_binding = None if not binding else {key: binding.get(key) for key in ("request_id", "source_identity", "source_photo_id", "source_photo_sha256", "sanitized_photo_sha256", "sanitized_width", "sanitized_height", "sanitized_byte_size")}
        return {"contract_version": CONTRACT_VERSION, "provider_schema_version": PROVIDER_SCHEMA_VERSION, "enabled": self.enabled, "pilot_ready": bool(pending and public_binding), "pilot_request_id": pending if public_binding else None, "pilot_authorization_binding": public_binding, "provider": DEFAULT_PROVIDER, "model": DEFAULT_MODEL, "retries": PROVIDER_RETRIES, "cost_cap_usd": str(COST_CAP_USD), "worst_case_cost_usd": str(cost["upper_bound_usd"])}

    def record_post(self) -> None:
        if not self.enabled: raise GarmentReferenceError("yarn_recommendation_gateway_disabled", "Дополнительный анализ пряжи не разрешён.", status_code=503)
        self.store.record_analysis_post()

    def analyze(self, payload: object) -> dict[str, Any]:
        if not self.enabled: raise GarmentReferenceError("yarn_recommendation_gateway_disabled", "Дополнительный анализ пряжи не разрешён.", status_code=503)
        request = validate_pilot_request(payload)
        self.state_verifier.assert_current(request.source_identity_dict())
        context_provider = getattr(self.state_verifier, "semantic_context", None)
        if not callable(context_provider):
            raise GarmentReferenceError("semantic_context_unavailable", "Авторитетный смысловой контекст недоступен.", status_code=409)
        semantic_context = context_provider(request.source_identity_dict())
        if not isinstance(semantic_context, Mapping):
            raise GarmentReferenceError("semantic_context_invalid", "Авторитетный смысловой контекст повреждён.", status_code=409)
        estimate = estimate_validated_request_cost(request)
        if estimate["upper_bound_usd"] > COST_CAP_USD: raise GarmentReferenceError("cost_cap_exceeded", "Верхняя оценка стоимости превышает $0.05.", status_code=409)
        if not self.store.consume(request): raise GarmentReferenceError("pilot_authorization_missing_or_used", "Одноразовое разрешение отсутствует или уже использовано.", status_code=409)
        self.state_verifier.assert_current(request.source_identity_dict())
        try:
            result = self.provider.analyze(request, semantic_context=semantic_context)
            result = validate_provider_payload(result, semantic_context=semantic_context)
        except GarmentReferenceError as error:
            recorder = getattr(self.store, "record_validation", None)
            if callable(recorder):
                recorder(request.request_id, passed=False, error_code=error.code)
            raise
        recorder = getattr(self.store, "record_validation", None)
        if callable(recorder):
            recorder(request.request_id, passed=True, error_code=None)
        result["provenance"] = {"method": "provider_supplement", "provider": DEFAULT_PROVIDER, "model": DEFAULT_MODEL, "requestId": request.request_id}
        return result

    def routes(self) -> list[Route]:
        async def configuration(_: Request) -> JSONResponse: return JSONResponse(self.configuration())
        async def submit(request: Request) -> JSONResponse:
            try:
                payload = await request.json()
            except (json.JSONDecodeError, UnicodeDecodeError):
                return JSONResponse({"error": {"code": "invalid_json", "message": "Request body must be valid JSON."}}, status_code=400)
            try:
                self.record_post(); return JSONResponse(self.analyze(payload))
            except GarmentReferenceError as error:
                public_error = {"code": error.code, "message": error.message}
                if isinstance(error, (ProviderOutputError, ProviderOutputValidationError)):
                    public_error.update({"reason_code": error.reason_code, "path": error.path})
                return JSONResponse({"error": public_error}, status_code=error.status_code)
            except Exception:
                return JSONResponse({"error": {"code": "yarn_recommendation_failed", "message": "Дополнительный анализ завершился ошибкой; повтор не выполняется."}}, status_code=502)
        return [Route(YARN_RECOMMENDATION_CONFIGURATION_ROUTE, configuration, methods=["GET"]), Route(YARN_RECOMMENDATION_ROUTE, submit, methods=["POST"])]


__all__ = ["CONTRACT_VERSION", "GarmentYarnRecommendationGateway", "OpenAIYarnRecommendationProvider", "ProviderOutputError", "ProviderOutputValidationError", "YARN_RECOMMENDATION_CONFIGURATION_ROUTE", "YARN_RECOMMENDATION_JSON_SCHEMA", "YARN_RECOMMENDATION_ROUTE", "build_provider_request", "extract_yarn_recommendation_output", "validate_provider_payload"]
