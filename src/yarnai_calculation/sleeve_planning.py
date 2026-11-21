"""Authoritative Stage 79 sleeve target-geometry planning domain.

The module deliberately has no HTTP, browser, or physical-execution concerns.  It
stores JSON-compatible immutable states so the existing project ``progress`` history
store can persist them without a schema change.  All sleeve endpoint and taper
mathematics is delegated to :mod:`yarnai_calculation.sleeve_math`.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from decimal import Decimal, InvalidOperation
import json
import re
from typing import Callable, Iterable, Literal, Mapping, Protocol, Sequence

from .candidates import height_allowed_pattern, neighbor_values
from .models import EndPhase, Parity
from .sleeve_math import (
    BOTTOM_UP_SLEEVE_TAPER_DISTRIBUTION_V1,
    JOINT_SLEEVE_ENDPOINT_ROUNDING_V1,
    EndpointConstraintV1,
    JointSleeveEndpointResultV1,
    SleeveMathError,
    distribute_bottom_up_sleeve_taper_v1,
    select_joint_sleeve_endpoint_pair_v1,
    solve_joint_sleeve_endpoints_v1,
)


DOMAIN_IDENTITY = "PROJECT_SLEEVE_TARGET_GEOMETRY_PLANNING"
CONTRACT_SCHEMA_ID = "SLEEVE_TARGET_GEOMETRY_AND_CONSTRUCTION_CONTRACT_V1"
CONTRACT_VERSION = 1
PROGRESS_KIND = DOMAIN_IDENTITY
MATH_CANON_VERSION = "1.1"

SOURCE_STAGES = (61, 63, 65, 70, 73, 75, 76, 77, 78)
EXPECTED_SOURCE_CONTRACTS: Mapping[int, tuple[str, int]] = {
    61: ("PROJECT_INITIALIZATION_FROM_CONFIRMED_DETAILS", 1),
    63: ("SWATCH_GAUGE_HISTORY", 1),
    65: ("PROJECT_EXECUTION_PLAN_PREPARATION", 1),
    70: ("FOUNDATION_SECTION_EXECUTION_PREPARATION", 1),
    73: ("PRIMARY_FABRIC_PREPARATION", 1),
    75: ("PRIMARY_FABRIC_MEASUREMENT", 1),
    76: ("PROJECT_NEXT_SECTION_PLANNING", 1),
    77: ("PROJECT_CONSTRUCTION_STRATEGY_PLANNING", 1),
    78: ("PROJECT_SHAPING_POLICY_PLANNING", 2),
}

REQUIRED_STAGE78_REASON = (
    "EXECUTION_GEOMETRY_PREREQUISITES_REQUIRED_BEFORE_SAFE_PLAN_EXTENSION"
)
REQUIRED_STAGE78_PREREQUISITES = (
    "sleeve_construction_and_target_geometry",
    "two_completed_measured_sleeves",
    "sleeve_stitch_counts_at_underarm",
    "body_and_sleeve_underarm_stitch_allocation",
    "combined_yoke_section_balance",
)
REQUIRED_TOPOLOGY = "construction-strategy:body-sleeves-joined-raglan:v1"

POLICY_VERSIONS = (
    "sleeve-pattern-inheritance-policy:v1",
    "sleeve-cuff-inheritance-policy:v1",
    "sleeve-working-method-policy:joined-raglan-in-round:v1",
    "cuff-to-main-same-count-pattern-change:v1",
    "paired-mirrored-increase-flanking-bor:v1",
    "increase-technique:mirrored-lifted-pair:v1",
    JOINT_SLEEVE_ENDPOINT_ROUNDING_V1,
    BOTTOM_UP_SLEEVE_TAPER_DISTRIBUTION_V1,
)

_UUID_V7 = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)
_TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
_FINGERPRINT = re.compile(r"^fnv1a32:[0-9a-f]{8}$")
_DECIMAL_INPUT = re.compile(r"^(?:0|[1-9]\d*)(?:\.\d+)?$")


class SleevePlanningError(ValueError):
    """Fail-closed Stage 79 domain or repository error."""

    def __init__(self, code: str, message: str, details: Mapping[str, object] | None = None):
        super().__init__(message)
        self.code = code
        self.details = dict(details or {})


@dataclass(frozen=True)
class SourceBinding:
    stage: int
    repository_record_id: str
    repository_revision: int
    domain_identity: str
    contract_version: int
    domain_fingerprint: str
    snapshot_fingerprint: str
    project_id: str
    calculation_id: str
    lifecycle: str = "completed"
    current_repository_revision: int | None = None
    current_domain_fingerprint: str | None = None
    current_snapshot_fingerprint: str | None = None
    conflict: bool = False
    quarantined: bool = False
    imported_unproven: bool = False
    deleted: bool = False

    def current(self) -> "SourceBinding":
        return replace(
            self,
            current_repository_revision=self.repository_revision,
            current_domain_fingerprint=self.domain_fingerprint,
            current_snapshot_fingerprint=self.snapshot_fingerprint,
        )


@dataclass(frozen=True)
class PatternBinding:
    identity: str
    source_identity: str
    source_fingerprint: str
    display_value: str
    horizontal_repeat: int
    fixed_working_stitches: int
    vertical_repeat: int
    end_phase: Literal["any", "even", "odd"]
    origin: Literal["inherited_stage70", "inherited_stage73", "user_override"]


@dataclass(frozen=True)
class ZoneGaugeBinding:
    zone: Literal["cuff", "main"]
    project_id: str
    calculation_id: str
    gauge_record_identity: str
    gauge_confirmation_key: str
    gauge_record_fingerprint: str
    gauge_source_context_fingerprint: str
    stitches_per_cm_exact: str
    rows_per_cm_exact: str
    finishing_state: str
    yarn_identity: str
    tool_identity: str
    pattern_identity: str
    working_method: Literal["in_round"]
    applicability_mode: Literal[
        "deterministic_identity_match", "explicit_legacy_context_attestation"
    ]
    compared_context_fingerprint: str
    evidence_fingerprint: str
    explicit_confirmation: bool
    confirmed_at: str | None
    current_record_fingerprint: str | None = None
    current_context_fingerprint: str | None = None
    stale: bool = False

    def current(self) -> "ZoneGaugeBinding":
        return replace(
            self,
            current_record_fingerprint=self.gauge_record_fingerprint,
            current_context_fingerprint=self.gauge_source_context_fingerprint,
        )


@dataclass(frozen=True)
class AuthoritativeSleeveSources:
    project_id: str
    calculation_id: str
    bindings: tuple[SourceBinding, ...]
    upper_arm_body_circumference_cm: str
    shoulder_point_to_cuff_length_cm: str
    armhole_depth_cm: str
    direction: str
    topology_identity: str
    stage78_outcome_status: str
    stage78_outcome_reason: str
    stage78_blocking_prerequisites: tuple[str, ...]
    inherited_cuff_pattern: PatternBinding
    inherited_cuff_height_cm: str
    inherited_main_pattern: PatternBinding
    yarn_identity: str
    tool_identity: str
    math_canon_version: str = MATH_CANON_VERSION
    math_canon_fingerprint: str = ""

    def with_canon_fingerprint(self) -> "AuthoritativeSleeveSources":
        return replace(self, math_canon_fingerprint=MATH_CANON_FINGERPRINT)


def _canonical(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def fingerprint(value: object) -> str:
    data = _canonical(value).encode("utf-8")
    result = 0x811C9DC5
    for byte in data:
        result ^= byte
        result = (result * 0x01000193) & 0xFFFFFFFF
    return f"fnv1a32:{result:08x}"


MATH_CANON_FINGERPRINT = fingerprint(
    {"version": MATH_CANON_VERSION, "policies": list(POLICY_VERSIONS[-2:])}
)


def _plain(value: object) -> object:
    if hasattr(value, "__dataclass_fields__"):
        return {key: _plain(item) for key, item in asdict(value).items()}
    if isinstance(value, Mapping):
        return {str(key): _plain(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        return [_plain(item) for item in value]
    return value


def _require_uuid(value: str, code: str) -> str:
    if not _UUID_V7.fullmatch(value or ""):
        raise SleevePlanningError(code, "A UUIDv7 identity is required.")
    return value


def _require_timestamp(value: str, code: str = "TIMESTAMP_INVALID") -> str:
    if not _TIMESTAMP.fullmatch(value or ""):
        raise SleevePlanningError(code, "An ISO UTC timestamp with milliseconds is required.")
    return value


def _require_fingerprint(value: str, code: str = "FINGERPRINT_INVALID") -> str:
    if not _FINGERPRINT.fullmatch(value or ""):
        raise SleevePlanningError(code, "A canonical repository fingerprint is required.")
    return value


def canonical_decimal(value: Decimal | int | str, code: str = "TARGET_INVALID") -> str:
    text = str(value)
    if not _DECIMAL_INPUT.fullmatch(text):
        raise SleevePlanningError(code, "The value must be a canonical non-exponential decimal.")
    try:
        decimal = Decimal(text)
    except InvalidOperation as error:
        raise SleevePlanningError(code, "The value is not a finite decimal.") from error
    if not decimal.is_finite() or decimal <= 0 or decimal > Decimal("1000"):
        raise SleevePlanningError(code, "The value must be finite, positive, and within bounds.")
    normalized = format(decimal, "f")
    if "." in normalized:
        normalized = normalized.rstrip("0").rstrip(".")
    return normalized or "0"


def _source_semantic(sources: AuthoritativeSleeveSources) -> dict[str, object]:
    return _plain(sources)  # type: ignore[return-value]


def validate_authoritative_sources(sources: AuthoritativeSleeveSources) -> None:
    _require_uuid(sources.project_id, "PROJECT_ID_INVALID")
    _require_uuid(sources.calculation_id, "CALCULATION_ID_INVALID")
    by_stage = {binding.stage: binding for binding in sources.bindings}
    if tuple(sorted(by_stage)) != SOURCE_STAGES or len(by_stage) != len(sources.bindings):
        raise SleevePlanningError("AUTHORITATIVE_SOURCE_CHAIN_INVALID", "The exact Stage 61/63/65/70/73/75/76/77/78 chain is required.")
    for stage in SOURCE_STAGES:
        binding = by_stage[stage]
        expected_identity, expected_version = EXPECTED_SOURCE_CONTRACTS[stage]
        if binding.domain_identity != expected_identity or binding.contract_version != expected_version:
            raise SleevePlanningError("SOURCE_CONTRACT_MISMATCH", f"Stage {stage} contract identity/version is not authoritative.")
        if binding.project_id != sources.project_id or binding.calculation_id != sources.calculation_id:
            raise SleevePlanningError("SOURCE_SCOPE_MISMATCH", f"Stage {stage} belongs to another project or calculation.")
        if binding.lifecycle != "completed" or binding.repository_revision < 1:
            raise SleevePlanningError("SOURCE_STATUS_INVALID", f"Stage {stage} is not a completed immutable source.")
        if binding.conflict or binding.quarantined or binding.imported_unproven or binding.deleted:
            raise SleevePlanningError("SOURCE_UNSAFE", f"Stage {stage} is conflicted, quarantined, unproven, or deleted.")
        _require_fingerprint(binding.domain_fingerprint)
        _require_fingerprint(binding.snapshot_fingerprint)
        if (
            binding.current_repository_revision != binding.repository_revision
            or binding.current_domain_fingerprint != binding.domain_fingerprint
            or binding.current_snapshot_fingerprint != binding.snapshot_fingerprint
        ):
            raise SleevePlanningError("SOURCE_STALE", f"Stage {stage} source binding is stale.")
    if sources.direction != "bottom_up" or sources.topology_identity != REQUIRED_TOPOLOGY:
        raise SleevePlanningError("CONSTRUCTION_CONTRADICTION", "Stage 76/77 construction is incompatible with Stage 79 V1.")
    if (
        sources.stage78_outcome_status != "blocked_on_prerequisites"
        or sources.stage78_outcome_reason != REQUIRED_STAGE78_REASON
        or sources.stage78_blocking_prerequisites != REQUIRED_STAGE78_PREREQUISITES
    ):
        raise SleevePlanningError("STAGE78_CONTRACT_MISMATCH", "Stage 78 must be the corrected completed V2 prerequisite boundary.")
    for value in (
        sources.upper_arm_body_circumference_cm,
        sources.shoulder_point_to_cuff_length_cm,
        sources.armhole_depth_cm,
        sources.inherited_cuff_height_cm,
    ):
        canonical_decimal(value, "REFERENCE_MEASUREMENT_INVALID")
    _validate_pattern(sources.inherited_cuff_pattern, "inherited_stage70")
    _validate_pattern(sources.inherited_main_pattern, "inherited_stage73")
    if sources.inherited_cuff_pattern.identity != "rib_1x1" or Decimal(sources.inherited_cuff_height_cm) != Decimal("5"):
        raise SleevePlanningError("CUFF_INHERITANCE_MISMATCH", "V1 requires the reviewed Stage 70 rib_1x1 / 5 cm candidate.")
    by_stage[70]
    if sources.inherited_cuff_pattern.source_fingerprint != by_stage[70].snapshot_fingerprint:
        raise SleevePlanningError("CUFF_SOURCE_STALE", "The cuff proposal is not bound to current Stage 70.")
    if sources.inherited_main_pattern.source_fingerprint != by_stage[73].snapshot_fingerprint:
        raise SleevePlanningError("MAIN_PATTERN_SOURCE_STALE", "The main pattern is not bound to current Stage 73.")
    if not sources.yarn_identity or not sources.tool_identity:
        raise SleevePlanningError("FABRIC_CONTEXT_MISSING", "Yarn and tool identities are required for gauge applicability.")
    if sources.math_canon_version != MATH_CANON_VERSION or sources.math_canon_fingerprint != MATH_CANON_FINGERPRINT:
        raise SleevePlanningError("MATH_CANON_STALE", "The bound sleeve math canon is not current.")


def _validate_pattern(pattern: PatternBinding, expected_origin: str | None = None) -> None:
    if not pattern.identity or not pattern.source_identity or not pattern.display_value:
        raise SleevePlanningError("PATTERN_BINDING_INVALID", "Pattern identities and display provenance are required.")
    _require_fingerprint(pattern.source_fingerprint)
    if pattern.horizontal_repeat < 1 or pattern.fixed_working_stitches < 0 or pattern.vertical_repeat < 1:
        raise SleevePlanningError("PATTERN_CONSTRAINT_INVALID", "Numeric repeat/fixed-stitch constraints are required.")
    if pattern.end_phase not in {"any", "even", "odd"}:
        raise SleevePlanningError("PATTERN_PHASE_INVALID", "Pattern end phase is not recognized.")
    if expected_origin and pattern.origin != expected_origin:
        raise SleevePlanningError("PATTERN_PROVENANCE_INVALID", "Inherited pattern provenance is incorrect.")


class SleevePlanningState:
    """Immutable, deterministic, JSON-round-trippable Stage 79 state."""

    __slots__ = ("_json",)

    def __init__(self, payload: Mapping[str, object]):
        object.__setattr__(self, "_json", _canonical(payload))

    @classmethod
    def from_json(cls, value: str) -> "SleevePlanningState":
        try:
            payload = json.loads(value)
        except (TypeError, json.JSONDecodeError) as error:
            raise SleevePlanningError("PROGRESS_STATE_INVALID", "Stored Stage 79 JSON is corrupted.") from error
        if not isinstance(payload, dict):
            raise SleevePlanningError("PROGRESS_STATE_INVALID", "Stored Stage 79 state must be an object.")
        state = cls(payload)
        validate_state(state)
        return state

    def to_json(self) -> str:
        return self._json

    def to_dict(self) -> dict[str, object]:
        return json.loads(self._json)

    def __getitem__(self, key: str) -> object:
        return self.to_dict()[key]

    @property
    def lifecycle(self) -> str:
        return str(self.to_dict()["lifecycle"])

    @property
    def revision(self) -> int:
        return int(self.to_dict()["revision"])

    @property
    def epoch(self) -> int:
        return int(self.to_dict()["epoch"])

    @property
    def fingerprint(self) -> str:
        return str(self.to_dict()["fingerprint"])

    def __eq__(self, other: object) -> bool:
        return isinstance(other, SleevePlanningState) and self._json == other._json

    def __hash__(self) -> int:
        return hash(self._json)


_STATE_KEYS = {
    "kind", "version", "projectId", "calculationId", "identity", "epoch",
    "predecessorIdentity", "lifecycle", "revision", "source", "referenceMeasurements",
    "targets", "construction", "gaugeBindings", "derivedReview", "confirmations",
    "operations", "timestamps", "completedSnapshot", "fingerprint",
}


def validate_state(state: SleevePlanningState) -> dict[str, object]:
    value = state.to_dict()
    if set(value) != _STATE_KEYS or value["kind"] != DOMAIN_IDENTITY or value["version"] != CONTRACT_VERSION:
        raise SleevePlanningError("PROGRESS_STATE_INVALID", "Stage 79 state identity or allowlist is invalid.")
    _require_uuid(str(value["projectId"]), "PROJECT_ID_INVALID")
    _require_uuid(str(value["calculationId"]), "CALCULATION_ID_INVALID")
    if value["lifecycle"] not in {"ready_to_collect", "collecting", "reviewing", "completed"}:
        raise SleevePlanningError("PROGRESS_STATE_INVALID", "Stage 79 lifecycle is invalid.")
    if not isinstance(value["epoch"], int) or value["epoch"] < 1 or not isinstance(value["revision"], int) or value["revision"] < 1:
        raise SleevePlanningError("PROGRESS_STATE_INVALID", "Stage 79 epoch/revision is invalid.")
    semantic = dict(value)
    stored_fingerprint = semantic.pop("fingerprint", None)
    if stored_fingerprint != fingerprint(semantic):
        raise SleevePlanningError("FINGERPRINT_MISMATCH", "Stage 79 state fingerprint does not match its content.")
    _validate_state_shape(value)
    if value["lifecycle"] == "completed" and not isinstance(value["completedSnapshot"], dict):
        raise SleevePlanningError("COMPLETED_SNAPSHOT_MISSING", "Completed Stage 79 state lacks its immutable snapshot.")
    if isinstance(value["completedSnapshot"], dict):
        _validate_completed_snapshot_shape(value["completedSnapshot"])
    return value


def _exact_keys(value: object, keys: set[str], code: str = "PROGRESS_STATE_INVALID") -> None:
    if not isinstance(value, dict) or set(value) != keys:
        raise SleevePlanningError(code, "A Stage 79 object contains missing or unallowlisted fields.")


def _validate_state_shape(value: dict[str, object]) -> None:
    _exact_keys(value["source"], {"chain", "sourceBindingFingerprint"})
    chain = value["source"]["chain"]  # type: ignore[index]
    _exact_keys(chain, {
        "project_id", "calculation_id", "bindings", "upper_arm_body_circumference_cm",
        "shoulder_point_to_cuff_length_cm", "armhole_depth_cm", "direction",
        "topology_identity", "stage78_outcome_status", "stage78_outcome_reason",
        "stage78_blocking_prerequisites", "inherited_cuff_pattern",
        "inherited_cuff_height_cm", "inherited_main_pattern", "yarn_identity",
        "tool_identity", "math_canon_version", "math_canon_fingerprint",
    })
    binding_keys = {
        "stage", "repository_record_id", "repository_revision", "domain_identity",
        "contract_version", "domain_fingerprint", "snapshot_fingerprint", "project_id",
        "calculation_id", "lifecycle", "current_repository_revision",
        "current_domain_fingerprint", "current_snapshot_fingerprint", "conflict",
        "quarantined", "imported_unproven", "deleted",
    }
    pattern_keys = {
        "identity", "source_identity", "source_fingerprint", "display_value",
        "horizontal_repeat", "fixed_working_stitches", "vertical_repeat", "end_phase", "origin",
    }
    if not isinstance(chain["bindings"], list):
        raise SleevePlanningError("PROGRESS_STATE_INVALID", "Source bindings must be an ordered list.")
    for binding in chain["bindings"]:
        _exact_keys(binding, binding_keys)
    _exact_keys(chain["inherited_cuff_pattern"], pattern_keys)
    _exact_keys(chain["inherited_main_pattern"], pattern_keys)
    _exact_keys(value["referenceMeasurements"], {
        "upperArmBodyCircumferenceCm", "upperArmSemanticRole",
        "shoulderPointToCuffLengthCm", "shoulderPointToCuffSemanticRole",
        "armholeDepthCm", "armholeDepthSemanticRole",
    })
    if not isinstance(value["targets"], dict) or not set(value["targets"]).issubset(set(SleeveTargetGeometryPlanningService.target_order)):
        raise SleevePlanningError("PROGRESS_STATE_INVALID", "Target collection contains an unallowlisted field.")
    for target in value["targets"].values():
        _exact_keys(target, {"value", "unit", "semanticRole", "provenance", "confirmedAt"})
    construction = value["construction"]
    _exact_keys(construction, {
        "direction", "componentDirection", "topologyIdentity", "quantity", "pairSymmetry",
        "workingMethod", "mainPattern", "cuff", "transition", "profile", "increasePolicy",
    })
    for key in ("direction", "componentDirection", "workingMethod"):
        _exact_keys(construction[key], {"value", "policyIdentity", "origin"})
    _exact_keys(construction["mainPattern"], pattern_keys)
    _exact_keys(construction["cuff"], {"pattern", "targetHeightCm", "heightOrigin"})
    _exact_keys(construction["cuff"]["pattern"], pattern_keys)
    _exact_keys(construction["transition"], {"identity", "shapingAllowed", "mainRound"})
    _exact_keys(construction["increasePolicy"], {"identity", "deltaPerEvent", "placementLane", "techniqueIdentity"})
    _validate_gauge_shape(value["gaugeBindings"])
    review = value["derivedReview"]
    if review is not None:
        _exact_keys(review, {
            "endpointSelectionPolicy", "endpointStatus", "rawCuffStitches", "rawUpperStitches",
            "cuffCandidates", "upperCandidates", "candidatePairs", "tiedCandidateKeys",
            "selectedCandidateKey", "selectedCandidate", "taper", "reviewFingerprint",
        })
    _exact_keys(value["confirmations"], {
        "inheritedConstructionReviewed", "roundingCandidateConfirmation", "finalReview",
    })
    if not isinstance(value["operations"], list):
        raise SleevePlanningError("PROGRESS_STATE_INVALID", "Operation receipts must be a list.")
    for receipt in value["operations"]:
        _exact_keys(receipt, {"operationId", "command", "payloadFingerprint", "resultingRevision", "at"})
    _exact_keys(value["timestamps"], {"createdAt", "completedAt"})


def _validate_gauge_shape(gauges: object) -> None:
    if not isinstance(gauges, dict) or not set(gauges).issubset({"cuff", "main"}):
        raise SleevePlanningError("PROGRESS_STATE_INVALID", "Gauge bindings contain an unallowlisted zone.")
    for gauge in gauges.values():
        _exact_keys(gauge, {
            "zone", "gaugeRecordIdentity", "gaugeConfirmationKey", "gaugeRecordFingerprint",
            "gaugeSourceContextFingerprint", "stitchesPerCmExact", "rowsPerCmExact",
            "finishingState", "boundFabricContext", "patternIdentity", "applicability",
        })
        _exact_keys(gauge["boundFabricContext"], {"yarnIdentity", "toolIdentity", "patternIdentity", "workingMethod"})
        _exact_keys(gauge["applicability"], {
            "mode", "evidenceFingerprint", "comparedContextFingerprint",
            "explicitConfirmation", "confirmedAt",
        })


def _validate_completed_snapshot_shape(snapshot: dict[str, object]) -> None:
    _exact_keys(snapshot, {
        "schemaId", "contractVersion", "kind", "stageIdentity", "identity", "projectId",
        "calculationId", "epoch", "lifecycle", "revision", "sourceBindings",
        "referenceMeasurements", "confirmedTargets", "construction", "gaugeBindings",
        "derivedGeometry", "provenance", "confirmations", "supersession", "timestamps",
        "audit", "fingerprint",
    }, "COMPLETED_SNAPSHOT_INVALID")
    semantic = dict(snapshot)
    stored = semantic.pop("fingerprint")
    if stored != fingerprint(semantic):
        raise SleevePlanningError("COMPLETED_SNAPSHOT_FINGERPRINT_MISMATCH", "Completed snapshot fingerprint is invalid.")
    source_keys = {"stage63GaugeHistory" if stage == 63 else f"stage{stage}" for stage in SOURCE_STAGES}
    source_keys.add("sourceBindingFingerprint")
    _exact_keys(snapshot["sourceBindings"], source_keys, "COMPLETED_SNAPSHOT_INVALID")
    source_binding_keys = {
        "repositoryRecordId", "repositoryRevision", "domainIdentity", "contractVersion",
        "domainFingerprint", "snapshotFingerprint",
    }
    for key, binding in snapshot["sourceBindings"].items():
        if key != "sourceBindingFingerprint":
            _exact_keys(binding, source_binding_keys, "COMPLETED_SNAPSHOT_INVALID")
    _exact_keys(snapshot["confirmedTargets"], {
        "cuffTargetCircumferenceCm", "cuffTargetLocation",
        "upperSleeveTargetCircumferenceCm", "upperTargetLocation",
        "cuffToUnderarmLengthCm", "lengthMeasurementPath",
    }, "COMPLETED_SNAPSHOT_INVALID")
    _validate_gauge_shape(snapshot["gaugeBindings"])
    _exact_keys(snapshot["derivedGeometry"], {
        "endpointSelectionPolicy", "rawCuffStitches", "rawUpperStitches", "candidatePairs",
        "selectedCandidateKey", "cuffTargetStitches", "upperSleeveTargetStitches",
        "plannedCuffCircumferenceCm", "plannedUpperCircumferenceCm", "cuffDeviationCm",
        "upperDeviationCm", "observedUpperSleeveEaseCm", "shapingLengthCm",
        "rawShapingRows", "shapingRows", "plannedShapingLengthCm",
        "shapingLengthDeviationCm", "totalIncreaseStitches", "increaseEventCount",
        "eligibleIncreaseRounds", "increaseDistribution", "finalTargetCount", "stopCondition",
    }, "COMPLETED_SNAPSHOT_INVALID")
    _exact_keys(snapshot["provenance"], {"fieldSources", "policyVersions", "mathCanonVersion", "mathCanonFingerprint"}, "COMPLETED_SNAPSHOT_INVALID")
    _exact_keys(snapshot["confirmations"], {"inheritedConstructionReviewed", "gaugeApplicabilityEvidence", "roundingCandidateConfirmation", "finalReview"}, "COMPLETED_SNAPSHOT_INVALID")
    _exact_keys(snapshot["supersession"], {"supersedesIdentity", "reason"}, "COMPLETED_SNAPSHOT_INVALID")
    _exact_keys(snapshot["timestamps"], {"createdAt", "completedAt"}, "COMPLETED_SNAPSHOT_INVALID")
    _exact_keys(snapshot["audit"], {"event", "operationId"}, "COMPLETED_SNAPSHOT_INVALID")


def _state(payload: dict[str, object]) -> SleevePlanningState:
    payload = json.loads(_canonical(payload))
    payload.pop("fingerprint", None)
    payload["fingerprint"] = fingerprint(payload)
    result = SleevePlanningState(payload)
    validate_state(result)
    return result


class SleeveTargetGeometryPlanningService:
    """Pure application service for Stage 79 lifecycle operations."""

    target_order = (
        "cuffTargetCircumferenceCm",
        "upperSleeveTargetCircumferenceCm",
        "cuffToUnderarmLengthCm",
    )

    def start_epoch(
        self,
        sources: AuthoritativeSleeveSources,
        *,
        epoch: int,
        created_at: str,
        supersedes_identity: str | None = None,
    ) -> SleevePlanningState:
        validate_authoritative_sources(sources)
        if not isinstance(epoch, int) or isinstance(epoch, bool) or epoch < 1:
            raise SleevePlanningError("EPOCH_INVALID", "Epoch must be a positive integer.")
        _require_timestamp(created_at)
        source = _source_semantic(sources)
        source_fingerprint = fingerprint(source)
        identity = f"{sources.project_id}:sleeve-target-geometry:{epoch}:{source_fingerprint}"
        payload: dict[str, object] = {
            "kind": DOMAIN_IDENTITY,
            "version": CONTRACT_VERSION,
            "projectId": sources.project_id,
            "calculationId": sources.calculation_id,
            "identity": identity,
            "epoch": epoch,
            "predecessorIdentity": supersedes_identity,
            "lifecycle": "ready_to_collect",
            "revision": 1,
            "source": {"chain": source, "sourceBindingFingerprint": source_fingerprint},
            "referenceMeasurements": {
                "upperArmBodyCircumferenceCm": canonical_decimal(sources.upper_arm_body_circumference_cm),
                "upperArmSemanticRole": "body_measurement",
                "shoulderPointToCuffLengthCm": canonical_decimal(sources.shoulder_point_to_cuff_length_cm),
                "shoulderPointToCuffSemanticRole": "finished_garment_reference",
                "armholeDepthCm": canonical_decimal(sources.armhole_depth_cm),
                "armholeDepthSemanticRole": "body_vertical_measurement",
            },
            "targets": {},
            "construction": self._construction(sources),
            "gaugeBindings": {},
            "derivedReview": None,
            "confirmations": {
                "inheritedConstructionReviewed": False,
                "roundingCandidateConfirmation": None,
                "finalReview": None,
            },
            "operations": [],
            "timestamps": {"createdAt": created_at, "completedAt": None},
            "completedSnapshot": None,
        }
        return _state(payload)

    def collect_target(
        self,
        state: SleevePlanningState,
        sources: AuthoritativeSleeveSources,
        *,
        field: str,
        value: Decimal | int | str,
        operation_id: str,
        at: str,
    ) -> SleevePlanningState:
        normalized = canonical_decimal(value)
        return self._apply(
            state,
            sources,
            command="collect_target",
            operation_id=operation_id,
            at=at,
            payload={"field": field, "value": normalized},
            mutate=lambda draft: self._collect(draft, field, normalized, at),
        )

    def bind_gauge(
        self,
        state: SleevePlanningState,
        sources: AuthoritativeSleeveSources,
        binding: ZoneGaugeBinding,
        *,
        operation_id: str,
        at: str,
    ) -> SleevePlanningState:
        current = validate_state(state)
        expected_pattern = (
            current["construction"]["cuff"]["pattern"]["identity"]
            if binding.zone == "cuff"
            else current["construction"]["mainPattern"]["identity"]
        )
        self._validate_gauge(binding, sources, str(expected_pattern))
        return self._apply(
            state,
            sources,
            command="bind_zone_gauge",
            operation_id=operation_id,
            at=at,
            payload=_plain(binding),
            mutate=lambda draft: self._bind_gauge(draft, binding),
        )

    def override_main_pattern(
        self,
        state: SleevePlanningState,
        sources: AuthoritativeSleeveSources,
        pattern: PatternBinding,
        *,
        operation_id: str,
        at: str,
    ) -> SleevePlanningState:
        self._validate_override_pattern(pattern)
        return self._apply(
            state,
            sources,
            command="override_main_pattern",
            operation_id=operation_id,
            at=at,
            payload=_plain(pattern),
            mutate=lambda draft: self._override_pattern(draft, "main", pattern, None),
        )

    def override_cuff(
        self,
        state: SleevePlanningState,
        sources: AuthoritativeSleeveSources,
        pattern: PatternBinding,
        *,
        target_height_cm: Decimal | int | str,
        transition_identity: str,
        operation_id: str,
        at: str,
    ) -> SleevePlanningState:
        self._validate_override_pattern(pattern)
        height = canonical_decimal(target_height_cm, "CUFF_OVERRIDE_INVALID")
        if transition_identity != "cuff-to-main-same-count-pattern-change:v1":
            raise SleevePlanningError("CUFF_OVERRIDE_INVALID", "V1 supports only the contracted same-count transition.")
        return self._apply(
            state,
            sources,
            command="override_cuff",
            operation_id=operation_id,
            at=at,
            payload={"pattern": _plain(pattern), "targetHeightCm": height, "transitionIdentity": transition_identity},
            mutate=lambda draft: self._override_pattern(draft, "cuff", pattern, height),
        )

    def review(
        self,
        state: SleevePlanningState,
        sources: AuthoritativeSleeveSources,
        *,
        operation_id: str,
        at: str,
        inherited_construction_reviewed: bool,
        row_candidate: int | None = None,
    ) -> SleevePlanningState:
        if inherited_construction_reviewed is not True:
            raise SleevePlanningError("CONSTRUCTION_REVIEW_REQUIRED", "Inherited cuff/main construction must be explicitly reviewed.")
        return self._apply(
            state,
            sources,
            command="review_plan",
            operation_id=operation_id,
            at=at,
            payload={"inheritedConstructionReviewed": True, "rowCandidate": row_candidate},
            mutate=lambda draft: self._review(draft, sources, row_candidate),
        )

    def confirm_rounding_candidate(
        self,
        state: SleevePlanningState,
        sources: AuthoritativeSleeveSources,
        *,
        candidate_key: str,
        operation_id: str,
        at: str,
    ) -> SleevePlanningState:
        return self._apply(
            state,
            sources,
            command="confirm_rounding_candidate",
            operation_id=operation_id,
            at=at,
            payload={"candidateKey": candidate_key},
            mutate=lambda draft: self._confirm_candidate(draft, sources, candidate_key, operation_id, at),
        )

    def complete(
        self,
        state: SleevePlanningState,
        sources: AuthoritativeSleeveSources,
        *,
        review_fingerprint: str,
        operation_id: str,
        at: str,
    ) -> SleevePlanningState:
        return self._apply(
            state,
            sources,
            command="complete_plan",
            operation_id=operation_id,
            at=at,
            payload={"reviewFingerprint": review_fingerprint},
            mutate=lambda draft: self._complete(draft, sources, review_fingerprint, operation_id, at),
            allow_completed_replay=True,
        )

    def _apply(
        self,
        state: SleevePlanningState,
        sources: AuthoritativeSleeveSources,
        *,
        command: str,
        operation_id: str,
        at: str,
        payload: object,
        mutate: Callable[[dict[str, object]], None],
        allow_completed_replay: bool = False,
    ) -> SleevePlanningState:
        current = validate_state(state)
        _require_uuid(operation_id, "OPERATION_ID_INVALID")
        _require_timestamp(at)
        payload_fingerprint = fingerprint(payload)
        for receipt in current["operations"]:  # type: ignore[union-attr]
            if receipt["operationId"] == operation_id:
                if receipt["command"] != command or receipt["payloadFingerprint"] != payload_fingerprint:
                    raise SleevePlanningError("OPERATION_ID_CONFLICT", "The operation id was already used with different semantics.")
                return state
        if current["lifecycle"] == "completed":
            code = "COMPLETED_EPOCH_IMMUTABLE"
            if allow_completed_replay:
                code = "DUPLICATE_COMPLETION_CONFLICT"
            raise SleevePlanningError(code, "A completed Stage 79 epoch cannot be mutated.")
        self._validate_live_binding(current, sources)
        draft = json.loads(_canonical(current))
        mutate(draft)
        draft["revision"] = int(current["revision"]) + 1
        draft["operations"].append(
            {
                "operationId": operation_id,
                "command": command,
                "payloadFingerprint": payload_fingerprint,
                "resultingRevision": draft["revision"],
                "at": at,
            }
        )
        return _state(draft)

    def _validate_live_binding(self, state: Mapping[str, object], sources: AuthoritativeSleeveSources) -> None:
        validate_authoritative_sources(sources)
        if state["projectId"] != sources.project_id or state["calculationId"] != sources.calculation_id:
            raise SleevePlanningError("PROJECT_OR_CALCULATION_MISMATCH", "The operation is scoped to another project or calculation.")
        if state["source"]["sourceBindingFingerprint"] != fingerprint(_source_semantic(sources)):  # type: ignore[index]
            raise SleevePlanningError("SOURCE_STALE", "The Stage 79 epoch is bound to another authoritative source chain.")

    def _construction(self, sources: AuthoritativeSleeveSources) -> dict[str, object]:
        return {
            "direction": {"value": "bottom_up", "policyIdentity": "stage76-confirmed-direction:v1", "origin": "inherited_confirmed_source"},
            "componentDirection": {"value": "cuff_up", "policyIdentity": "sleeve-cuff-up-from-bottom-up:v1", "origin": "construction_policy"},
            "topologyIdentity": REQUIRED_TOPOLOGY,
            "quantity": 2,
            "pairSymmetry": "identical_unless_future_explicit_asymmetry_contract",
            "workingMethod": {"value": "in_round", "policyIdentity": "sleeve-working-method-policy:joined-raglan-in-round:v1", "origin": "construction_policy"},
            "mainPattern": _plain(sources.inherited_main_pattern),
            "cuff": {"pattern": _plain(sources.inherited_cuff_pattern), "targetHeightCm": canonical_decimal(sources.inherited_cuff_height_cm), "heightOrigin": "inherited_stage70"},
            "transition": {"identity": "cuff-to-main-same-count-pattern-change:v1", "shapingAllowed": False, "mainRound": 1},
            "profile": None,
            "increasePolicy": {"identity": "paired-mirrored-increase-flanking-bor:v1", "deltaPerEvent": 2, "placementLane": "both_sides_of_beginning_of_round", "techniqueIdentity": "increase-technique:mirrored-lifted-pair:v1"},
        }

    def _collect(self, draft: dict[str, object], field: str, value: str, at: str) -> None:
        if field not in self.target_order:
            raise SleevePlanningError("TARGET_FIELD_INVALID", "Stage 79 accepts exactly three target fields.")
        targets: dict[str, object] = draft["targets"]  # type: ignore[assignment]
        missing = next((name for name in self.target_order if name not in targets), None)
        if field not in targets and field != missing:
            raise SleevePlanningError("TARGET_ORDER_INVALID", "Stage 79 target values must be collected in contract order.")
        targets[field] = {
            "value": value,
            "unit": "cm",
            "semanticRole": "finished_garment_target",
            "provenance": "user_entered_at_stage_79",
            "confirmedAt": at,
        }
        if field == "upperSleeveTargetCircumferenceCm" and "cuffTargetCircumferenceCm" in targets:
            cuff = Decimal(targets["cuffTargetCircumferenceCm"]["value"])  # type: ignore[index]
            if Decimal(value) < cuff:
                raise SleevePlanningError("UNSUPPORTED_REVERSE_TAPER_V1", "V1 does not support an upper target below the cuff target.")
        if field == "cuffToUnderarmLengthCm":
            cuff_height = Decimal(draft["construction"]["cuff"]["targetHeightCm"])  # type: ignore[index]
            if Decimal(value) <= cuff_height:
                raise SleevePlanningError("SHAPING_LENGTH_NOT_POSITIVE", "Cuff-to-underarm length must exceed cuff height.")
        draft["lifecycle"] = "collecting"
        draft["derivedReview"] = None
        draft["confirmations"]["inheritedConstructionReviewed"] = False  # type: ignore[index]
        draft["confirmations"]["roundingCandidateConfirmation"] = None  # type: ignore[index]
        draft["confirmations"]["finalReview"] = None  # type: ignore[index]

    def _validate_gauge(self, binding: ZoneGaugeBinding, sources: AuthoritativeSleeveSources, expected_pattern_identity: str) -> None:
        if binding.project_id != sources.project_id or binding.calculation_id != sources.calculation_id:
            raise SleevePlanningError("GAUGE_SCOPE_MISMATCH", "Gauge belongs to another project or calculation.")
        if binding.zone not in {"cuff", "main"} or binding.working_method != "in_round":
            raise SleevePlanningError("GAUGE_NOT_APPLICABLE", "Gauge zone or working mode is incompatible.")
        if binding.pattern_identity != expected_pattern_identity:
            raise SleevePlanningError("GAUGE_PATTERN_MISMATCH", "Gauge pattern does not match its selected zone.")
        if binding.yarn_identity != sources.yarn_identity or binding.tool_identity != sources.tool_identity:
            raise SleevePlanningError("GAUGE_NOT_APPLICABLE", "Gauge yarn/tool context is incompatible.")
        for item in (
            binding.gauge_confirmation_key,
            binding.gauge_record_fingerprint,
            binding.gauge_source_context_fingerprint,
            binding.compared_context_fingerprint,
            binding.evidence_fingerprint,
        ):
            _require_fingerprint(item, "GAUGE_FINGERPRINT_INVALID")
        expected_evidence = fingerprint({
            "zone": binding.zone,
            "mode": binding.applicability_mode,
            "comparedContextFingerprint": binding.compared_context_fingerprint,
            "gaugeRecordFingerprint": binding.gauge_record_fingerprint,
        })
        if binding.evidence_fingerprint != expected_evidence:
            raise SleevePlanningError("GAUGE_EVIDENCE_FINGERPRINT_MISMATCH", "Gauge applicability evidence is corrupted.")
        canonical_decimal(binding.stitches_per_cm_exact, "GAUGE_INVALID")
        canonical_decimal(binding.rows_per_cm_exact, "GAUGE_INVALID")
        if binding.stale or binding.current_record_fingerprint != binding.gauge_record_fingerprint or binding.current_context_fingerprint != binding.gauge_source_context_fingerprint:
            raise SleevePlanningError("GAUGE_STALE", "Gauge binding is stale.")
        if binding.applicability_mode == "explicit_legacy_context_attestation":
            if not binding.explicit_confirmation or not binding.confirmed_at:
                raise SleevePlanningError("GAUGE_ATTESTATION_REQUIRED", "Legacy gauge applicability requires explicit zone attestation.")
            _require_timestamp(binding.confirmed_at)
        elif binding.applicability_mode == "deterministic_identity_match":
            if binding.explicit_confirmation or binding.confirmed_at is not None:
                raise SleevePlanningError("GAUGE_EVIDENCE_INVALID", "Deterministic gauge evidence must not masquerade as user attestation.")
        else:
            raise SleevePlanningError("GAUGE_EVIDENCE_INVALID", "Gauge applicability mode is not recognized.")

    def _validate_override_pattern(self, pattern: PatternBinding) -> None:
        _validate_pattern(pattern)
        if pattern.origin != "user_override":
            raise SleevePlanningError("PATTERN_OVERRIDE_INVALID", "An override must have explicit Stage 79 user provenance.")

    def _override_pattern(self, draft: dict[str, object], zone: str, pattern: PatternBinding, height: str | None) -> None:
        if zone == "main":
            draft["construction"]["mainPattern"] = _plain(pattern)  # type: ignore[index]
        else:
            draft["construction"]["cuff"] = {  # type: ignore[index]
                "pattern": _plain(pattern),
                "targetHeightCm": height,
                "heightOrigin": "user_override",
            }
        draft["gaugeBindings"].pop(zone, None)  # type: ignore[union-attr]
        draft["lifecycle"] = "collecting"
        draft["derivedReview"] = None
        draft["confirmations"]["inheritedConstructionReviewed"] = False  # type: ignore[index]
        draft["confirmations"]["roundingCandidateConfirmation"] = None  # type: ignore[index]
        draft["confirmations"]["finalReview"] = None  # type: ignore[index]

    def _bind_gauge(self, draft: dict[str, object], binding: ZoneGaugeBinding) -> None:
        gauges: dict[str, object] = draft["gaugeBindings"]  # type: ignore[assignment]
        other = gauges.get("main" if binding.zone == "cuff" else "cuff")
        if other and other["gaugeRecordIdentity"] == binding.gauge_record_identity and other["patternIdentity"] != binding.pattern_identity:  # type: ignore[index]
            raise SleevePlanningError("CROSS_ZONE_GAUGE_REUSE_FORBIDDEN", "One gauge record cannot represent different cuff/main patterns.")
        gauges[binding.zone] = {
            "zone": binding.zone,
            "gaugeRecordIdentity": binding.gauge_record_identity,
            "gaugeConfirmationKey": binding.gauge_confirmation_key,
            "gaugeRecordFingerprint": binding.gauge_record_fingerprint,
            "gaugeSourceContextFingerprint": binding.gauge_source_context_fingerprint,
            "stitchesPerCmExact": canonical_decimal(binding.stitches_per_cm_exact),
            "rowsPerCmExact": canonical_decimal(binding.rows_per_cm_exact),
            "finishingState": binding.finishing_state,
            "boundFabricContext": {"yarnIdentity": binding.yarn_identity, "toolIdentity": binding.tool_identity, "patternIdentity": binding.pattern_identity, "workingMethod": "in_round"},
            "patternIdentity": binding.pattern_identity,
            "applicability": {"mode": binding.applicability_mode, "evidenceFingerprint": binding.evidence_fingerprint, "comparedContextFingerprint": binding.compared_context_fingerprint, "explicitConfirmation": binding.explicit_confirmation, "confirmedAt": binding.confirmed_at},
        }
        draft["lifecycle"] = "collecting"
        draft["derivedReview"] = None
        draft["confirmations"]["inheritedConstructionReviewed"] = False  # type: ignore[index]
        draft["confirmations"]["roundingCandidateConfirmation"] = None  # type: ignore[index]
        draft["confirmations"]["finalReview"] = None  # type: ignore[index]

    def _review(self, draft: dict[str, object], sources: AuthoritativeSleeveSources, row_candidate: int | None) -> None:
        targets: dict[str, object] = draft["targets"]  # type: ignore[assignment]
        if any(name not in targets for name in self.target_order):
            raise SleevePlanningError("GEOMETRY_INCOMPLETE", "All three direct geometry targets are required.")
        gauges: dict[str, object] = draft["gaugeBindings"]  # type: ignore[assignment]
        if "cuff" not in gauges:
            raise SleevePlanningError("CUFF_GAUGE_REQUIRED", "An applicable cuff-zone gauge is required.")
        if "main" not in gauges:
            raise SleevePlanningError("MAIN_GAUGE_REQUIRED", "An applicable main-zone gauge is required.")
        result = self._endpoint_result(draft, sources)
        review = self._review_from_result(draft, sources, result, row_candidate=row_candidate, selected_key=None)
        draft["derivedReview"] = review
        draft["construction"]["profile"] = "straight_endpoint_profile" if review.get("selectedCandidate") and review["selectedCandidate"]["cuffStitches"] == review["selectedCandidate"]["upperStitches"] else "nondecreasing_even_taper"  # type: ignore[index]
        draft["confirmations"]["inheritedConstructionReviewed"] = True  # type: ignore[index]
        draft["lifecycle"] = "reviewing"
        review["reviewFingerprint"] = self._review_fingerprint(draft)

    def _endpoint_result(self, draft: Mapping[str, object], sources: AuthoritativeSleeveSources) -> JointSleeveEndpointResultV1:
        targets = draft["targets"]  # type: ignore[assignment]
        gauges = draft["gaugeBindings"]  # type: ignore[assignment]
        cuff_target = Decimal(targets["cuffTargetCircumferenceCm"]["value"])
        upper_target = Decimal(targets["upperSleeveTargetCircumferenceCm"]["value"])
        cuff_gauge = Decimal(gauges["cuff"]["stitchesPerCmExact"])
        main_gauge = Decimal(gauges["main"]["stitchesPerCmExact"])
        cuff_pattern = draft["construction"]["cuff"]["pattern"]  # type: ignore[index]
        main_pattern = draft["construction"]["mainPattern"]  # type: ignore[index]
        cuff_constraint = EndpointConstraintV1(
            repeat=cuff_pattern["horizontal_repeat"],
            fixed_stitches=cuff_pattern["fixed_working_stitches"],
            parity=Parity.EVEN if cuff_pattern["identity"] == "rib_1x1" else Parity.ANY,
        )
        main_constraint = EndpointConstraintV1(
            repeat=main_pattern["horizontal_repeat"],
            fixed_stitches=main_pattern["fixed_working_stitches"],
            parity=Parity.ANY,
        )
        return solve_joint_sleeve_endpoints_v1(
            raw_cuff_stitches=cuff_target * cuff_gauge,
            raw_upper_stitches=upper_target * main_gauge,
            cuff_stitches_per_cm=cuff_gauge,
            upper_stitches_per_cm=main_gauge,
            cuff_constraint=cuff_constraint,
            upper_constraint=main_constraint,
        )

    def _review_from_result(
        self,
        draft: Mapping[str, object],
        sources: AuthoritativeSleeveSources,
        result: JointSleeveEndpointResultV1,
        *,
        row_candidate: int | None,
        selected_key: str | None,
    ) -> dict[str, object]:
        targets = draft["targets"]  # type: ignore[assignment]
        gauges = draft["gaugeBindings"]  # type: ignore[assignment]
        cuff_target = Decimal(targets["cuffTargetCircumferenceCm"]["value"])
        upper_target = Decimal(targets["upperSleeveTargetCircumferenceCm"]["value"])
        cuff_gauge = Decimal(gauges["cuff"]["stitchesPerCmExact"])
        main_gauge = Decimal(gauges["main"]["stitchesPerCmExact"])
        pairs = [self._candidate(pair, cuff_target, upper_target, cuff_gauge, main_gauge) for pair in result.valid_pairs]
        tied_keys = [self._candidate_key(pair.cuff_stitches, pair.upper_stitches) for pair in result.tied_pairs]
        selected = result.selected_pair
        status = result.status
        if selected_key is not None:
            selected = next((pair for pair in result.tied_pairs if self._candidate_key(pair.cuff_stitches, pair.upper_stitches) == selected_key), None)
            if selected is None:
                raise SleevePlanningError("ROUNDING_CANDIDATE_INVALID", "The selected endpoint pair is not one of the tied minima.")
            status = "selected"
        if status == "no_valid_candidate":
            raise SleevePlanningError("TARGET_IMPOSSIBLE_UNDER_CURRENT_CONSTRAINTS", "No endpoint pair satisfies repeat/parity/+2 constraints.")
        review: dict[str, object] = {
            "endpointSelectionPolicy": JOINT_SLEEVE_ENDPOINT_ROUNDING_V1,
            "endpointStatus": result.status,
            "rawCuffStitches": _decimal(result.raw_cuff_stitches),
            "rawUpperStitches": _decimal(result.raw_upper_stitches),
            "cuffCandidates": list(result.cuff_candidates),
            "upperCandidates": list(result.upper_candidates),
            "candidatePairs": pairs,
            "tiedCandidateKeys": tied_keys,
            "selectedCandidateKey": self._candidate_key(selected.cuff_stitches, selected.upper_stitches) if selected else None,
            "selectedCandidate": self._candidate(selected, cuff_target, upper_target, cuff_gauge, main_gauge) if selected else None,
            "taper": None,
            "reviewFingerprint": None,
        }
        if selected is not None:
            review["taper"] = self._derive_taper(draft, sources, selected.cuff_stitches, selected.upper_stitches, row_candidate)
        return review

    def _derive_taper(self, draft: Mapping[str, object], sources: AuthoritativeSleeveSources, cuff_count: int, upper_count: int, row_candidate: int | None) -> dict[str, object]:
        targets = draft["targets"]  # type: ignore[assignment]
        main_gauge = Decimal(draft["gaugeBindings"]["main"]["rowsPerCmExact"])  # type: ignore[index]
        target_length = Decimal(targets["cuffToUnderarmLengthCm"]["value"])
        cuff_height = Decimal(draft["construction"]["cuff"]["targetHeightCm"])  # type: ignore[index]
        shaping_length = target_length - cuff_height
        raw_rows = shaping_length * main_gauge
        main_pattern = draft["construction"]["mainPattern"]  # type: ignore[index]
        end_phase = EndPhase(main_pattern["end_phase"])
        residues, period = height_allowed_pattern(main_pattern["vertical_repeat"], 0, end_phase)
        lower, upper = neighbor_values(raw_rows, residues, period)
        candidates = sorted({value for value in (lower, upper) if value is not None and value > 0})
        if not candidates:
            raise SleevePlanningError("NO_VALID_ROW_CANDIDATE", "No positive row count satisfies the main pattern phase.")
        best_error = min(abs(Decimal(value) - raw_rows) for value in candidates)
        best = [value for value in candidates if abs(Decimal(value) - raw_rows) == best_error]
        if len(best) > 1:
            if row_candidate not in best:
                raise SleevePlanningError("ROW_ROUNDING_TIE_REQUIRES_CONFIRMATION", "A structural row-count tie requires an explicit candidate.", {"candidates": best})
            shaping_rows = int(row_candidate)
        else:
            shaping_rows = best[0]
            if row_candidate is not None and row_candidate != shaping_rows:
                raise SleevePlanningError("ROW_CANDIDATE_INVALID", "The row candidate is not the canonical minimum.")
        eligible = tuple(range(2, shaping_rows))
        try:
            taper = distribute_bottom_up_sleeve_taper_v1(
                start_stitch_count=cuff_count,
                target_stitch_count=upper_count,
                available_shaping_round_span=shaping_rows,
                eligible_increase_rounds=eligible,
                excluded_rounds=(1, shaping_rows),
            )
        except SleeveMathError as error:
            raise SleevePlanningError(error.code, str(error)) from error
        events = [
            {
                "ordinal": event.ordinal,
                "mainRound": event.main_round,
                "deltaStitches": event.delta_stitches,
                "resultingStitchCount": event.resulting_stitch_count,
                "techniqueIdentity": "increase-technique:mirrored-lifted-pair:v1",
                "placementPolicyIdentity": "paired-mirrored-increase-flanking-bor:v1",
            }
            for event in taper.events
        ]
        return {
            "shapingLengthCm": _decimal(shaping_length),
            "rawShapingRows": _decimal(raw_rows),
            "shapingRows": shaping_rows,
            "plannedShapingLengthCm": _decimal(Decimal(shaping_rows) / main_gauge),
            "shapingLengthDeviationCm": _decimal(Decimal(shaping_rows) / main_gauge - shaping_length),
            "totalIncreaseStitches": taper.stitch_delta,
            "increaseEventCount": taper.increase_event_count,
            "eligibleIncreaseRounds": list(taper.eligible_increase_rounds),
            "increaseDistribution": {
                "policyIdentity": taper.policy_identity,
                "cellCenterTieDirection": taper.cell_center_tie_direction,
                "events": events,
            },
            "finalTargetCount": taper.final_stitch_count,
            "stopCondition": {
                "targetLengthCm": targets["cuffToUnderarmLengthCm"]["value"],
                "plannedFullTubeStitches": upper_count,
                "holdOrRemoveUnderarmStitches": False,
                "physicalConfirmationRequiredLater": True,
            },
        }

    def _candidate(self, pair: object, cuff_target: Decimal, upper_target: Decimal, cuff_gauge: Decimal, main_gauge: Decimal) -> dict[str, object]:
        cuff = pair.cuff_stitches
        upper = pair.upper_stitches
        return {
            "key": self._candidate_key(cuff, upper),
            "cuffStitches": cuff,
            "upperStitches": upper,
            "totalIncreaseStitches": upper - cuff,
            "plannedCuffCm": _decimal(Decimal(cuff) / cuff_gauge),
            "plannedUpperCm": _decimal(Decimal(upper) / main_gauge),
            "cuffSignedErrorCm": _decimal(pair.cuff_signed_error_cm),
            "upperSignedErrorCm": _decimal(pair.upper_signed_error_cm),
            "structurallyValid": True,
            "toleranceZone": _tolerance_zone(pair, cuff_target, upper_target, cuff_gauge, main_gauge),
        }

    @staticmethod
    def _candidate_key(cuff: int, upper: int) -> str:
        return f"cuff:{cuff}|upper:{upper}"

    def _confirm_candidate(self, draft: dict[str, object], sources: AuthoritativeSleeveSources, candidate_key: str, operation_id: str, at: str) -> None:
        review = draft.get("derivedReview")
        if draft.get("lifecycle") != "reviewing" or not isinstance(review, dict) or review.get("endpointStatus") != "tie":
            raise SleevePlanningError("ROUNDING_TIE_NOT_PENDING", "There is no unresolved endpoint tie.")
        result = self._endpoint_result(draft, sources)
        replacement = self._review_from_result(draft, sources, result, row_candidate=None, selected_key=candidate_key)
        draft["derivedReview"] = replacement
        draft["confirmations"]["roundingCandidateConfirmation"] = {  # type: ignore[index]
            "operationId": operation_id,
            "confirmedAt": at,
            "explicit": True,
            "payloadFingerprint": fingerprint({"candidateKey": candidate_key}),
            "candidateKey": candidate_key,
        }
        replacement["reviewFingerprint"] = self._review_fingerprint(draft)

    def _review_fingerprint(self, draft: Mapping[str, object]) -> str:
        return fingerprint(
            {
                "source": draft["source"],
                "referenceMeasurements": draft["referenceMeasurements"],
                "targets": draft["targets"],
                "construction": draft["construction"],
                "gaugeBindings": draft["gaugeBindings"],
                "derivedReview": {key: value for key, value in draft["derivedReview"].items() if key != "reviewFingerprint"},  # type: ignore[union-attr]
                "confirmations": {
                    "inheritedConstructionReviewed": draft["confirmations"]["inheritedConstructionReviewed"],  # type: ignore[index]
                    "roundingCandidateConfirmation": draft["confirmations"]["roundingCandidateConfirmation"],  # type: ignore[index]
                },
            }
        )

    def _complete(self, draft: dict[str, object], sources: AuthoritativeSleeveSources, review_fingerprint: str, operation_id: str, at: str) -> None:
        review = draft.get("derivedReview")
        if draft.get("lifecycle") != "reviewing" or not isinstance(review, dict):
            raise SleevePlanningError("REVIEW_REQUIRED", "The plan must be reviewing before completion.")
        if review.get("selectedCandidate") is None or review.get("taper") is None:
            raise SleevePlanningError("ROUNDING_CONFIRMATION_REQUIRED", "A unique or explicitly confirmed endpoint pair is required.")
        if review.get("reviewFingerprint") != review_fingerprint:
            raise SleevePlanningError("REVIEW_FINGERPRINT_STALE", "Completion does not target the current review fingerprint.")
        final_review = {
            "operationId": operation_id,
            "confirmedAt": at,
            "explicit": True,
            "payloadFingerprint": fingerprint({"reviewFingerprint": review_fingerprint}),
            "reviewFingerprint": review_fingerprint,
        }
        draft["confirmations"]["finalReview"] = final_review  # type: ignore[index]
        candidate = review["selectedCandidate"]
        taper = review["taper"]
        derived = {
            "endpointSelectionPolicy": review["endpointSelectionPolicy"],
            "rawCuffStitches": review["rawCuffStitches"],
            "rawUpperStitches": review["rawUpperStitches"],
            "candidatePairs": review["candidatePairs"],
            "selectedCandidateKey": review["selectedCandidateKey"],
            "cuffTargetStitches": candidate["cuffStitches"],
            "upperSleeveTargetStitches": candidate["upperStitches"],
            "plannedCuffCircumferenceCm": candidate["plannedCuffCm"],
            "plannedUpperCircumferenceCm": candidate["plannedUpperCm"],
            "cuffDeviationCm": candidate["cuffSignedErrorCm"],
            "upperDeviationCm": candidate["upperSignedErrorCm"],
            "observedUpperSleeveEaseCm": _decimal(Decimal(draft["targets"]["upperSleeveTargetCircumferenceCm"]["value"]) - Decimal(draft["referenceMeasurements"]["upperArmBodyCircumferenceCm"])),  # type: ignore[index]
            **taper,
        }
        snapshot = {
            "schemaId": CONTRACT_SCHEMA_ID,
            "contractVersion": CONTRACT_VERSION,
            "kind": "SLEEVE_TARGET_GEOMETRY_PLANNING",
            "stageIdentity": DOMAIN_IDENTITY,
            "identity": draft["identity"],
            "projectId": draft["projectId"],
            "calculationId": draft["calculationId"],
            "epoch": draft["epoch"],
            "lifecycle": "completed",
            "revision": int(draft["revision"]) + 1,
            "sourceBindings": self._snapshot_source_bindings(sources),
            "referenceMeasurements": draft["referenceMeasurements"],
            "confirmedTargets": self._confirmed_targets(draft["targets"]),
            "construction": draft["construction"],
            "gaugeBindings": draft["gaugeBindings"],
            "derivedGeometry": derived,
            "provenance": self._provenance(sources, draft),
            "confirmations": {
                "inheritedConstructionReviewed": True,
                "gaugeApplicabilityEvidence": [
                    {
                        "zone": zone,
                        "mode": gauge["applicability"]["mode"],
                        "comparedContextFingerprint": gauge["applicability"]["comparedContextFingerprint"],
                        "gaugeRecordFingerprint": gauge["gaugeRecordFingerprint"],
                        "explicitConfirmation": gauge["applicability"]["explicitConfirmation"],
                        "confirmedAt": gauge["applicability"]["confirmedAt"],
                    }
                    for zone, gauge in sorted(draft["gaugeBindings"].items())  # type: ignore[union-attr]
                ],
                "roundingCandidateConfirmation": draft["confirmations"]["roundingCandidateConfirmation"],  # type: ignore[index]
                "finalReview": final_review,
            },
            "supersession": {"supersedesIdentity": draft["predecessorIdentity"], "reason": "user_requested_correction" if draft["predecessorIdentity"] else None},
            "timestamps": {"createdAt": draft["timestamps"]["createdAt"], "completedAt": at},  # type: ignore[index]
            "audit": {"event": "SLEEVE_TARGET_GEOMETRY_CONFIRMED", "operationId": operation_id},
        }
        snapshot["fingerprint"] = fingerprint(snapshot)
        draft["completedSnapshot"] = snapshot
        draft["timestamps"]["completedAt"] = at  # type: ignore[index]
        draft["lifecycle"] = "completed"

    @staticmethod
    def _snapshot_source_bindings(sources: AuthoritativeSleeveSources) -> dict[str, object]:
        result: dict[str, object] = {}
        for binding in sources.bindings:
            key = "stage63GaugeHistory" if binding.stage == 63 else f"stage{binding.stage}"
            result[key] = {
                "repositoryRecordId": binding.repository_record_id,
                "repositoryRevision": binding.repository_revision,
                "domainIdentity": binding.domain_identity,
                "contractVersion": binding.contract_version,
                "domainFingerprint": binding.domain_fingerprint,
                "snapshotFingerprint": binding.snapshot_fingerprint,
            }
        result["sourceBindingFingerprint"] = fingerprint(result)
        return result

    @staticmethod
    def _confirmed_targets(targets: Mapping[str, object]) -> dict[str, object]:
        return {
            "cuffTargetCircumferenceCm": targets["cuffTargetCircumferenceCm"],
            "cuffTargetLocation": "relaxed_finished_outer_cuff_edge",
            "upperSleeveTargetCircumferenceCm": targets["upperSleeveTargetCircumferenceCm"],
            "upperTargetLocation": "full_sleeve_tube_at_underarm_before_allocation",
            "cuffToUnderarmLengthCm": targets["cuffToUnderarmLengthCm"],
            "lengthMeasurementPath": "outer_cuff_edge_to_underarm_boundary_along_underarm_line",
        }

    @staticmethod
    def _provenance(sources: AuthoritativeSleeveSources, draft: Mapping[str, object]) -> dict[str, object]:
        by_stage = {binding.stage: binding for binding in sources.bindings}
        cuff_pattern = draft["construction"]["cuff"]["pattern"]  # type: ignore[index]
        main_pattern = draft["construction"]["mainPattern"]  # type: ignore[index]
        cuff_override = cuff_pattern["origin"] == "user_override"
        main_override = main_pattern["origin"] == "user_override"
        return {
            "fieldSources": {
                "referenceMeasurements": {"classification": "inherited_confirmed_source", "sourceStage": "stage61", "sourceIdentity": by_stage[61].domain_identity, "sourceFingerprint": by_stage[61].snapshot_fingerprint, "formulaOrPolicyIdentity": None},
                "confirmedTargets": {"classification": "user_confirmed", "sourceStage": "stage79", "sourceIdentity": DOMAIN_IDENTITY, "sourceFingerprint": fingerprint({"projectId": sources.project_id, "calculationId": sources.calculation_id}), "formulaOrPolicyIdentity": None},
                "construction.cuff": {"classification": "user_confirmed" if cuff_override else "inherited_confirmed_source", "sourceStage": "stage79" if cuff_override else "stage70", "sourceIdentity": cuff_pattern["source_identity"] if cuff_override else by_stage[70].domain_identity, "sourceFingerprint": cuff_pattern["source_fingerprint"] if cuff_override else by_stage[70].snapshot_fingerprint, "formulaOrPolicyIdentity": "sleeve-cuff-inheritance-policy:v1"},
                "construction.mainPattern": {"classification": "user_confirmed" if main_override else "inherited_confirmed_source", "sourceStage": "stage79" if main_override else "stage73", "sourceIdentity": main_pattern["source_identity"] if main_override else by_stage[73].domain_identity, "sourceFingerprint": main_pattern["source_fingerprint"] if main_override else by_stage[73].snapshot_fingerprint, "formulaOrPolicyIdentity": "sleeve-pattern-inheritance-policy:v1"},
                "derivedGeometry": {"classification": "derived", "sourceStage": "stage79", "sourceIdentity": DOMAIN_IDENTITY, "sourceFingerprint": sources.math_canon_fingerprint, "formulaOrPolicyIdentity": JOINT_SLEEVE_ENDPOINT_ROUNDING_V1},
            },
            "policyVersions": list(POLICY_VERSIONS),
            "mathCanonVersion": sources.math_canon_version,
            "mathCanonFingerprint": sources.math_canon_fingerprint,
        }


def _decimal(value: Decimal) -> str:
    if value == 0:
        return "0"
    return format(value, "f").rstrip("0").rstrip(".")


def _tolerance_zone(pair: object, cuff_target: Decimal, upper_target: Decimal, cuff_gauge: Decimal, main_gauge: Decimal) -> str:
    normal_cuff = max(Decimal(1) / cuff_gauge, cuff_target * Decimal("0.01"))
    normal_upper = max(Decimal(1) / main_gauge, upper_target * Decimal("0.01"))
    warning_cuff = max(Decimal(2) / cuff_gauge, cuff_target * Decimal("0.02"))
    warning_upper = max(Decimal(2) / main_gauge, upper_target * Decimal("0.02"))
    cuff_error = abs(pair.cuff_signed_error_cm)
    upper_error = abs(pair.upper_signed_error_cm)
    if cuff_error <= normal_cuff and upper_error <= normal_upper:
        return "normal"
    if cuff_error <= warning_cuff and upper_error <= warning_upper:
        return "warning"
    return "decision"


@dataclass(frozen=True)
class SleevePlanningProgressRecord:
    progress_id: str
    project_id: str
    calculation_id: str
    kind: str
    epoch: int
    revision: int
    state_json: str

    @property
    def state(self) -> SleevePlanningState:
        return SleevePlanningState.from_json(self.state_json)

    def to_progress_dict(self) -> dict[str, object]:
        """Materialize the existing IndexedDB ``progress`` record shape."""

        return {
            "progress_id": self.progress_id,
            "project_id": self.project_id,
            "calculation_id": self.calculation_id,
            "kind": self.kind,
            "epoch": self.epoch,
            "revision": self.revision,
            "state": self.state.to_dict(),
        }


class ProjectProgressBackend(Protocol):
    """Minimal port implemented by the existing project progress/history store."""

    def list(self, project_id: str, calculation_id: str, kind: str) -> Sequence[SleevePlanningProgressRecord]: ...
    def insert(self, record: SleevePlanningProgressRecord) -> None: ...
    def replace(self, record: SleevePlanningProgressRecord, expected_revision: int) -> None: ...


class SleevePlanningHistoryRepository:
    """Stage 79 repository policy over the existing generic progress store shape."""

    def __init__(self, backend: ProjectProgressBackend, identity_provider: Callable[[], str]):
        self._backend = backend
        self._identity_provider = identity_provider

    def history(self, project_id: str, calculation_id: str) -> tuple[SleevePlanningProgressRecord, ...]:
        records = tuple(sorted(self._backend.list(project_id, calculation_id, PROGRESS_KIND), key=lambda item: item.epoch))
        for index, record in enumerate(records, start=1):
            if record.kind != PROGRESS_KIND or record.project_id != project_id or record.calculation_id != calculation_id or record.epoch != index or record.revision < 1:
                raise SleevePlanningError("PLANNING_HISTORY_CONFLICT", "Stage 79 progress history is not contiguous or correctly scoped.")
            state = record.state
            if state.epoch != record.epoch or state.to_dict()["projectId"] != project_id or state.to_dict()["calculationId"] != calculation_id:
                raise SleevePlanningError("PLANNING_HISTORY_CONFLICT", "Stage 79 record/state binding is corrupted.")
            if index < len(records) and state.lifecycle != "completed":
                raise SleevePlanningError("PLANNING_HISTORY_CONFLICT", "Only a completed epoch may have a successor.")
            if index > 1 and state.to_dict()["predecessorIdentity"] != records[index - 2].state.to_dict()["identity"]:
                raise SleevePlanningError("PLANNING_HISTORY_CONFLICT", "Stage 79 predecessor identity is corrupted.")
        return records

    def save(
        self,
        state: SleevePlanningState,
        *,
        expected_repository_revision: int | None = None,
    ) -> SleevePlanningProgressRecord:
        value = validate_state(state)
        records = self.history(str(value["projectId"]), str(value["calculationId"]))
        current = records[-1] if records else None
        if current is None:
            if state.epoch != 1 or expected_repository_revision not in (None, 0):
                raise SleevePlanningError("REVISION_CONFLICT", "The first Stage 79 epoch has stale repository expectations.")
            record = SleevePlanningProgressRecord(
                progress_id=_require_uuid(self._identity_provider(), "PROGRESS_ID_INVALID"),
                project_id=str(value["projectId"]), calculation_id=str(value["calculationId"]),
                kind=PROGRESS_KIND, epoch=1, revision=1, state_json=state.to_json(),
            )
            self._backend.insert(record)
            return record
        if state.epoch == current.epoch:
            if state.fingerprint == current.state.fingerprint:
                return current
            if current.state.lifecycle == "completed":
                raise SleevePlanningError("COMPLETED_EPOCH_IMMUTABLE", "A completed Stage 79 epoch cannot be replaced.")
            if expected_repository_revision != current.revision:
                raise SleevePlanningError("REVISION_CONFLICT", "Stage 79 progress changed concurrently.")
            if state.revision != current.state.revision + 1 or value["identity"] != current.state.to_dict()["identity"]:
                raise SleevePlanningError("REVISION_CONFLICT", "Stage 79 domain revision or identity is stale.")
            record = replace(current, revision=current.revision + 1, state_json=state.to_json())
            self._backend.replace(record, current.revision)
            return record
        if state.epoch == current.epoch + 1:
            if current.state.lifecycle != "completed" or value["predecessorIdentity"] != current.state.to_dict()["identity"] or state.revision != 1:
                raise SleevePlanningError("PLANNING_HISTORY_CONFLICT", "A new epoch must supersede the immutable current completion.")
            if expected_repository_revision not in (None, 0):
                raise SleevePlanningError("REVISION_CONFLICT", "New Stage 79 epoch has stale repository expectations.")
            record = SleevePlanningProgressRecord(
                progress_id=_require_uuid(self._identity_provider(), "PROGRESS_ID_INVALID"),
                project_id=str(value["projectId"]), calculation_id=str(value["calculationId"]),
                kind=PROGRESS_KIND, epoch=state.epoch, revision=1, state_json=state.to_json(),
            )
            self._backend.insert(record)
            return record
        if state.epoch < current.epoch:
            historical = records[state.epoch - 1] if 0 < state.epoch <= len(records) else None
            if historical and historical.state.fingerprint == state.fingerprint:
                return historical
            raise SleevePlanningError("STALE_EPOCH", "A stale Stage 79 operation cannot mutate the current epoch.")
        raise SleevePlanningError("PLANNING_HISTORY_CONFLICT", "Stage 79 epochs must be contiguous.")
