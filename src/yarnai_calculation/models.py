from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from enum import StrEnum
from typing import Any


Number = Decimal | int | float | str


class Axis(StrEnum):
    """Calculation axis requested by the caller."""

    WIDTH = "width"
    HEIGHT = "height"


class Unit(StrEnum):
    """Supported physical length unit."""

    CM = "cm"
    INCH = "inch"


class ResultStatus(StrEnum):
    """Top-level outcome of a calculation request."""

    READY = "Расчёт готов"
    READY_WITH_WARNINGS = "Расчёт готов с предупреждениями"
    CONFIRMATION_REQUIRED = "Требуется подтверждение"
    INPUT_ERROR = "Ошибка входных данных"
    IMPOSSIBLE = "Расчёт невозможен"
    OUT_OF_SCOPE = "Случай вне области первой версии"


class FunctionalCategory(StrEnum):
    """Functional use category that controls required safety decisions."""

    ORDINARY = "ordinary"
    NEGATIVE_EASE = "negative_ease"
    CRITICAL_OPENING = "critical_opening"
    MEDICAL_OR_ORTHOPEDIC = "medical_or_orthopedic"
    PROTECTIVE = "protective"
    CHILD_SENSITIVE = "child_sensitive"
    ANIMAL_CLOTHING = "animal_clothing"
    EXACT_COVER = "exact_cover"
    UNKNOWN = "unknown"


class KnittingMode(StrEnum):
    """Method used to knit the requested fabric zone."""

    FLAT = "flat"
    ROUND = "round"


class PatternClass(StrEnum):
    """Structural class of the pattern inside the calculation zone."""

    CONSTANT = "constant_stitch_count"
    VARIABLE_OR_UNKNOWN = "variable_or_unknown_stitch_count"
    COMPOSITE_ROW = "composite_row"
    MULTIPLE_GAUGES = "multiple_gauges"


class TriState(StrEnum):
    """Three-valued answer used when a fact may be unknown."""

    YES = "yes"
    NO = "no"
    UNKNOWN = "unknown"


class SizeKind(StrEnum):
    """Meaning of a supplied width value."""

    FINISHED = "finished"
    MEASUREMENT = "measurement"


class Direction(StrEnum):
    """Required direction for choosing a discrete candidate."""

    NEAREST = "nearest"
    NOT_LESS = "not_less"
    NOT_MORE = "not_more"


class GaugeMethod(StrEnum):
    """Method used to provide gauge data."""

    MEASUREMENTS = "measurements"
    READY_VALUE = "ready_value"


class GaugeSource(StrEnum):
    """Origin of gauge data supplied by the caller."""

    PERSONAL_SWATCH = "personal_swatch"
    OTHER_SWATCH = "other_swatch"
    LABEL = "label"
    PATTERN = "pattern"
    UNKNOWN = "unknown"


class MeasurementState(StrEnum):
    """Fabric state in which a gauge measurement was taken."""

    RELAXED = "relaxed"
    EXPLICIT_STRETCH = "explicit_stretch"
    UNKNOWN = "unknown"


class ProcessingState(StrEnum):
    """Processing state of the measured swatch."""

    AFTER = "after_intended_processing"
    BEFORE = "before_processing"
    UNKNOWN = "unknown"


class SwatchMode(StrEnum):
    """Technique used to create the measured swatch."""

    FLAT = "flat"
    ROUND = "round"
    SIMULATED_ROUND = "simulated_round"


class Parity(StrEnum):
    """Allowed parity of a calculated count."""

    ANY = "any"
    EVEN = "even"
    ODD = "odd"


class CenterType(StrEnum):
    """Required center structure of a width calculation."""

    NONE = "none"
    STITCH = "central_stitch"
    GAP = "central_gap"


class Part(StrEnum):
    """Part of the stitch count to which a structural rule applies."""

    ALL = "all"
    VARIABLE = "variable"


class EndPhase(StrEnum):
    """Required phase at the end of a height calculation."""

    ANY = "any"
    EVEN = "even"
    ODD = "odd"
    SOURCE = "source_phase"


class ToleranceMode(StrEnum):
    """Method used to evaluate candidate error against tolerance."""

    YARNAI = "yarnai"
    ABSOLUTE = "absolute"
    RELATIVE = "relative"


class DiagnosticClass(StrEnum):
    """Severity and handling class of a calculation diagnostic."""

    INPUT_ERROR = "input_error"
    OUT_OF_SCOPE = "out_of_scope"
    IMPOSSIBLE = "impossible"
    WARNING = "warning"
    CLARIFICATION = "clarification"


class InvariantState(StrEnum):
    """Application state of a canonical invariant in the result trace."""

    APPLIED = "applied"
    FULFILLED = "fulfilled"
    NOT_APPLICABLE = "not_applicable"
    BLOCKED = "blocked"
    REQUIRES_DECISION = "requires_decision"


@dataclass(frozen=True, slots=True)
class FabricContext:
    """Materials and technique that define the target fabric.

    Attributes:
        yarn: Yarn identification.
        yarn_batch: Dye lot or batch identification.
        strands: Number of strands held together.
        strands_description: Human-readable strand arrangement.
        needle_mm: Needle diameter in millimetres.
        needle_type: Needle construction or material.
        pattern: Stitch pattern used in the zone.
        mode: Flat or round knitting mode.
        processing: Intended washing, blocking, or finishing process.
    """

    yarn: str | None = None
    yarn_batch: str | None = None
    strands: int | None = None
    strands_description: str | None = None
    needle_mm: Number | None = None
    needle_type: str | None = None
    pattern: str | None = None
    mode: KnittingMode | str | None = None
    processing: str | None = None


@dataclass(frozen=True, slots=True)
class SwatchContext:
    """Conditions under which a gauge swatch was made and measured.

    Attributes:
        off_needles: Whether the swatch was removed from the needles.
        processing_state: Whether intended processing was completed.
        fully_dry: Whether the swatch was fully dry.
        rest_hours: Rest time before measurement, in hours.
        measurement_state: Relaxed, stretched, or unknown measurement state.
        fabric: Fabric context represented by the swatch.
        mode: Technique used to knit the swatch.
        heavy_or_large: Whether gravity may materially affect the swatch.
    """

    off_needles: TriState | str | None = None
    processing_state: ProcessingState | str | None = None
    fully_dry: TriState | str | None = None
    rest_hours: Number | None = None
    measurement_state: MeasurementState | str | None = None
    fabric: FabricContext | None = None
    mode: SwatchMode | str | None = None
    heavy_or_large: TriState | str | None = None


@dataclass(frozen=True, slots=True)
class GaugeMeasurement:
    """One count-over-length gauge measurement.

    Attributes:
        count: Number of stitches or rows counted.
        length: Length of the measured zone.
        unit: Unit of ``length``.
        position: Optional swatch position or measurement label.
    """

    count: Number | None
    length: Number | None
    unit: Unit | str = Unit.CM
    position: str | None = None


@dataclass(frozen=True, slots=True)
class GaugeInput:
    """Gauge observations used for one calculation axis.

    Provide either individual ``measurements`` or a ``ready_count`` over
    ``base_length``, according to ``method``.

    Attributes:
        method: Representation used for the supplied gauge.
        source: Origin of the gauge information.
        measurements: Individual count-over-length observations.
        ready_count: Precomputed count over ``base_length``.
        base_length: Reference length for ``ready_count``.
        base_unit: Unit of ``base_length``.
        source_measurement_count: Number of observations behind a ready value.
        total_swatch_size: Full size of the measured swatch.
        total_swatch_unit: Unit of ``total_swatch_size``.
        margins_outside_zone: Whether measurement margins were excluded.
        context: Conditions under which the gauge was measured.
    """

    method: GaugeMethod | str | None
    source: GaugeSource | str | None
    measurements: tuple[GaugeMeasurement, ...] = ()
    ready_count: Number | None = None
    base_length: Number | None = None
    base_unit: Unit | str = Unit.CM
    source_measurement_count: int | None = None
    total_swatch_size: Number | None = None
    total_swatch_unit: Unit | str = Unit.CM
    margins_outside_zone: TriState | str | None = None
    context: SwatchContext | None = None


@dataclass(frozen=True, slots=True)
class FixedComponent:
    """A non-variable component included in a width count.

    Attributes:
        role: Component role, such as an edge or seam allowance.
        on_needle: Stitches occupied on the needle.
        visible: Stitches contributing to visible finished width.
        same_gauge: Whether the component uses the zone gauge.
        source: Source of the component rule.
        absorption_note: Explanation of stitches hidden or absorbed.
    """

    role: str | None
    on_needle: Number | None
    visible: Number | None
    same_gauge: TriState | str | None = TriState.YES
    source: str | None = None
    absorption_note: str | None = None


@dataclass(frozen=True, slots=True)
class StructuralConstraints:
    """Discrete structural constraints for a width calculation.

    Attributes:
        parity: Required count parity.
        center: Required center stitch or center gap.
        centered_part: Count portion governed by ``center``.
        sectors: Number of equal structural sectors.
        sector_part: Count portion divided into sectors.
        explicit_asymmetry: Declared exception to symmetric construction.
    """

    parity: Parity | str = Parity.ANY
    center: CenterType | str = CenterType.NONE
    centered_part: Part | str | None = None
    sectors: Number | None = None
    sector_part: Part | str | None = None
    explicit_asymmetry: str | None = None


@dataclass(frozen=True, slots=True)
class ToleranceRule:
    """Tolerance policy for evaluating candidate size error.

    Attributes:
        mode: YarnAI, absolute, or relative tolerance mode.
        absolute: Maximum absolute error when using absolute mode.
        absolute_unit: Unit of ``absolute``.
        relative_percent: Maximum percentage error in relative mode.
        source: Source of an explicit tolerance rule.
    """

    mode: ToleranceMode | str = ToleranceMode.YARNAI
    absolute: Number | None = None
    absolute_unit: Unit | str = Unit.CM
    relative_percent: Number | None = None
    source: str | None = None


@dataclass(frozen=True, slots=True)
class WidthRequest:
    """Inputs and structural rules for a width calculation.

    Attributes:
        size_kind: Whether ``value`` is a finished size or body measurement.
        value: Requested width or measurement.
        unit: Unit of the width values.
        direction: Candidate-selection direction.
        gauge: Stitch gauge input.
        ease: Ease added to a body measurement.
        explicit_finished_size: Explicit finished size from an external rule.
        explicit_finished_unit: Unit of ``explicit_finished_size``.
        repeat: Stitch repeat size.
        minimum_repeats: Minimum number of complete repeats.
        partial_repeat: Whether a partial repeat is explicitly allowed.
        fixed_components: Non-variable components of the width.
        declared_fixed_on_needle: Declared total fixed on-needle count.
        declared_fixed_visible: Declared total fixed visible count.
        constraints: Parity, centering, and sector constraints.
        tolerance: Candidate error tolerance.
    """

    size_kind: SizeKind | str | None
    value: Number | None
    unit: Unit | str | None
    direction: Direction | str | None
    gauge: GaugeInput | None
    ease: Number | None = None
    explicit_finished_size: Number | None = None
    explicit_finished_unit: Unit | str | None = None
    repeat: Number | None = None
    minimum_repeats: Number | None = None
    partial_repeat: TriState | str | None = None
    fixed_components: tuple[FixedComponent, ...] = ()
    declared_fixed_on_needle: Number | None = None
    declared_fixed_visible: Number | None = None
    constraints: StructuralConstraints = field(default_factory=StructuralConstraints)
    tolerance: ToleranceRule = field(default_factory=ToleranceRule)


@dataclass(frozen=True, slots=True)
class HeightRequest:
    """Inputs and structural rules for a height calculation.

    Attributes:
        value: Requested height.
        unit: Unit of ``value``.
        direction: Candidate-selection direction.
        gauge: Row gauge input.
        start_point: Named start point of the measured zone.
        end_point: Named end point of the measured zone.
        row_counting_rule: Rule used to count rows.
        repeat: Row repeat size.
        fixed_start_rows: Fixed rows before the variable zone.
        fixed_end_rows: Fixed rows after the variable zone.
        end_phase: Required ending phase.
        source_phase_rule: External source rule for the ending phase.
        partial_repeat: Whether a partial repeat is explicitly allowed.
        tolerance: Candidate error tolerance.
    """

    value: Number | None
    unit: Unit | str | None
    direction: Direction | str | None
    gauge: GaugeInput | None
    start_point: str | None
    end_point: str | None
    row_counting_rule: str | None = "full_ordinary_rows"
    repeat: Number | None = None
    fixed_start_rows: Number | None = 0
    fixed_end_rows: Number | None = 0
    end_phase: EndPhase | str = EndPhase.ANY
    source_phase_rule: str | None = None
    partial_repeat: TriState | str | None = None
    tolerance: ToleranceRule = field(default_factory=ToleranceRule)


@dataclass(frozen=True, slots=True)
class CalculationRequest:
    """Complete input contract for the calculation engine.

    Attributes:
        axes: Width and/or height axes to calculate.
        functional_category: Functional use category of the result.
        knitting_mode: Flat or round target knitting mode.
        zone_pattern: Pattern used in the calculated zone.
        pattern_class: Structural class of ``zone_pattern``.
        zone_homogeneous: Whether the zone has a homogeneous gauge.
        fabric_context: Materials and technique of the target fabric.
        width: Width inputs when the width axis is requested.
        height: Height inputs when the height axis is requested.
        explicit_source_rule: External rule that may override ordinary input.
        source_rule_matches_canon: Whether that rule was verified against canon.
        source_rule_source: Reference for the external rule.
        out_of_scope_features: Features intentionally declared out of scope.
    """

    axes: frozenset[Axis | str]
    functional_category: FunctionalCategory | str | None
    knitting_mode: KnittingMode | str | None
    zone_pattern: str | None
    pattern_class: PatternClass | str | None
    zone_homogeneous: TriState | str | None
    fabric_context: FabricContext | None
    width: WidthRequest | None = None
    height: HeightRequest | None = None
    explicit_source_rule: str | None = None
    source_rule_matches_canon: bool | None = None
    source_rule_source: str | None = None
    out_of_scope_features: frozenset[str] = frozenset()


@dataclass(frozen=True, slots=True)
class Diagnostic:
    """Structured explanation of an error, warning, or clarification.

    Attributes:
        code: Stable diagnostic code.
        kind: Diagnostic handling class.
        reason: Human-readable reason.
        field: Related request field, if any.
        axis: Related calculation axis, if any.
        stage: Calculation stage that emitted the diagnostic.
        next_action: Recommended caller or user action.
        normative_reference: Canonical source for the rule.
        parameters: Structured values supporting the diagnostic.
    """

    code: str
    kind: DiagnosticClass
    reason: str
    field: str | None
    axis: Axis | None
    stage: int
    next_action: str
    normative_reference: str
    parameters: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class GaugeAssessment:
    """Normalized gauge and its quality assessment.

    Attributes:
        method: Gauge representation used by the caller.
        source: Origin of the supplied gauge.
        original_measurements: Measurements before normalization.
        normalized_measurements: Count and length values normalized to cm.
        ready_count: Supplied ready count, if used.
        base_length_cm: Ready-value base length normalized to cm.
        densities: Density calculated for each observation.
        density_per_cm: Selected stitches or rows per centimetre.
        minimum: Minimum observed density.
        maximum: Maximum observed density.
        relative_spread_percent: Relative spread of observed densities.
        measurement_count: Number of source measurements.
        quality: Human-readable gauge quality classification.
        context_matches: Whether swatch and target fabric contexts match.
        context_differences: Fields that differ between those contexts.
        swatch_context: Context recorded for the gauge swatch.
        canonical: Whether the gauge satisfies canonical requirements.
    """

    method: GaugeMethod
    source: GaugeSource
    original_measurements: tuple[GaugeMeasurement, ...]
    normalized_measurements: tuple[tuple[Decimal, Decimal], ...]
    ready_count: Decimal | None
    base_length_cm: Decimal | None
    densities: tuple[Decimal, ...]
    density_per_cm: Decimal
    minimum: Decimal
    maximum: Decimal
    relative_spread_percent: Decimal
    measurement_count: int | None
    quality: str
    context_matches: bool | None
    context_differences: tuple[str, ...]
    swatch_context: SwatchContext
    canonical: bool


@dataclass(frozen=True, slots=True)
class Candidate:
    """One structurally valid discrete count near the requested size.

    Attributes:
        working_count: Total stitches or rows worked.
        visible_count: Count contributing to visible size.
        repeats: Number of complete pattern repeats, if applicable.
        position: Position relative to the ideal count.
        actual_size_cm: Produced size in centimetres.
        actual_size_original_unit: Produced size in the requested unit.
        original_unit: Unit requested by the caller.
        signed_error_cm: Signed difference from target size.
        absolute_error_cm: Absolute difference from target size.
        relative_error_percent: Percentage difference from target size.
        direction_satisfied: Whether the requested direction is satisfied.
        tolerance_zone: Assigned tolerance zone.
        structural_checks: Structural checks satisfied by the candidate.
    """

    working_count: int
    visible_count: Decimal
    repeats: int | None
    position: str
    actual_size_cm: Decimal
    actual_size_original_unit: Decimal
    original_unit: Unit
    signed_error_cm: Decimal
    absolute_error_cm: Decimal
    relative_error_percent: Decimal
    direction_satisfied: bool
    tolerance_zone: str | None = None
    structural_checks: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class AxisResult:
    """Calculation details and candidate selection for one axis.

    Attributes:
        axis: Width or height.
        target_size_cm: Normalized target size.
        ideal_count: Continuous count before discrete constraints.
        ideal_variable_count: Continuous variable count.
        fixed_working_count: Fixed stitches or rows worked.
        fixed_visible_count: Fixed count contributing to visible size.
        lower_candidate: Valid candidate below the ideal.
        upper_candidate: Valid candidate above the ideal.
        candidates: All neighboring candidates returned to the caller.
        selected_candidate: Final selected candidate, when available.
        provisional_candidate: Candidate awaiting required confirmation.
        selection_reason: Human-readable selection rationale.
        rounding_direction: Direction used for discrete selection.
        tolerance_first: First tolerance boundary.
        tolerance_second: Second tolerance boundary, if applicable.
        tolerance_mode: Tolerance policy applied to candidates.
        requested_ease_cm: Requested ease for a measurement-based width.
        actual_ease_cm: Ease produced by the selected count.
        ease_change_cm: Difference between actual and requested ease.
        repeat_step_cm: Physical size of one structural repeat.
    """

    axis: Axis
    target_size_cm: Decimal
    ideal_count: Decimal
    ideal_variable_count: Decimal
    fixed_working_count: int
    fixed_visible_count: Decimal
    lower_candidate: Candidate | None
    upper_candidate: Candidate | None
    candidates: tuple[Candidate, ...]
    selected_candidate: Candidate | None
    provisional_candidate: Candidate | None
    selection_reason: str | None
    rounding_direction: str | None
    tolerance_first: Decimal | None
    tolerance_second: Decimal | None
    tolerance_mode: ToleranceMode
    requested_ease_cm: Decimal | None = None
    actual_ease_cm: Decimal | None = None
    ease_change_cm: Decimal | None = None
    repeat_step_cm: Decimal | None = None


@dataclass(frozen=True, slots=True)
class InvariantTrace:
    """Evidence showing how one canonical invariant was handled.

    Attributes:
        number: Canonical invariant number.
        name: Invariant name.
        stage: Calculation stage associated with the invariant.
        state: Application state in this request.
        evidence: Human-readable evidence for the state.
        related_codes: Diagnostic codes emitted for the invariant.
    """

    number: int
    name: str
    stage: str
    state: InvariantState
    evidence: str
    related_codes: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class CalculationResult:
    """Immutable top-level result returned by :func:`calculate`.

    Attributes:
        status: Overall request outcome.
        final: Whether the result can be used without confirmation.
        canon_version: Canon version used by the engine.
        specification_version: Calculation specification version.
        normalized_inputs: Request values normalized for calculation.
        gauges: Gauge assessment for each requested axis.
        axes: Detailed result for each successfully calculated axis.
        errors: Blocking diagnostics.
        warnings: Non-blocking warning diagnostics.
        clarifications: Diagnostics requiring clarification or confirmation.
        explanation: Human-readable calculation explanation.
        invariant_trace: Evidence for canonical invariant handling.
    """

    status: ResultStatus
    final: bool
    canon_version: str
    specification_version: str
    normalized_inputs: dict[str, Any]
    gauges: dict[Axis, GaugeAssessment]
    axes: dict[Axis, AxisResult]
    errors: tuple[Diagnostic, ...]
    warnings: tuple[Diagnostic, ...]
    clarifications: tuple[Diagnostic, ...]
    explanation: tuple[str, ...]
    invariant_trace: tuple[InvariantTrace, ...]
