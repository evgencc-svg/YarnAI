"""Pure reference math for the versioned Stage 79 sleeve policies.

This module is deliberately independent of Stage 79 domain state, persistence, and UI.
It is also not part of the general ``calculate()`` engine, whose V1 scope excludes
shaping.  The public names and constants map directly to the authoritative policy
identities in ``KNITTING_MATH_CANON.md``.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Iterable, Literal

from .candidates import neighbor_values, width_allowed_pattern
from .models import CenterType, Parity, Part, StructuralConstraints


BOTTOM_UP_SLEEVE_TAPER_DISTRIBUTION_V1 = (
    "bottom-up-sleeve-taper-distribution:v1"
)
JOINT_SLEEVE_ENDPOINT_ROUNDING_V1 = "joint-sleeve-endpoint-rounding:v1"

EndpointStatus = Literal["selected", "tie", "no_valid_candidate"]


class SleeveMathError(ValueError):
    """Fail-closed validation error from a versioned sleeve math policy."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class EndpointConstraintV1:
    """One endpoint's repeat/fixed-stitch/parity admissibility contract."""

    repeat: int = 1
    fixed_stitches: int = 0
    parity: Parity = Parity.ANY

    def __post_init__(self) -> None:
        if not _positive_integer(self.repeat):
            raise SleeveMathError("INVALID_ENDPOINT_REPEAT", "repeat must be a positive integer")
        if not _nonnegative_integer(self.fixed_stitches):
            raise SleeveMathError(
                "INVALID_ENDPOINT_FIXED_STITCHES",
                "fixed_stitches must be a nonnegative integer",
            )
        try:
            normalized_parity = self.parity if isinstance(self.parity, Parity) else Parity(self.parity)
        except ValueError as error:
            raise SleeveMathError("INVALID_ENDPOINT_PARITY", "parity is not recognized") from error
        object.__setattr__(self, "parity", normalized_parity)


@dataclass(frozen=True)
class EndpointCandidatePairV1:
    cuff_stitches: int
    upper_stitches: int
    cuff_signed_error_cm: Decimal
    upper_signed_error_cm: Decimal
    score: tuple[Decimal, Decimal]

    @property
    def increase_event_count(self) -> int:
        return (self.upper_stitches - self.cuff_stitches) // 2


@dataclass(frozen=True)
class JointSleeveEndpointResultV1:
    policy_identity: str
    status: EndpointStatus
    raw_cuff_stitches: Decimal
    raw_upper_stitches: Decimal
    cuff_candidates: tuple[int, ...]
    upper_candidates: tuple[int, ...]
    valid_pairs: tuple[EndpointCandidatePairV1, ...]
    selected_pair: EndpointCandidatePairV1 | None
    tied_pairs: tuple[EndpointCandidatePairV1, ...]


@dataclass(frozen=True)
class IncreaseEventV1:
    ordinal: int
    eligible_index: int
    main_round: int
    delta_stitches: int
    resulting_stitch_count: int


@dataclass(frozen=True)
class BottomUpSleeveTaperResultV1:
    policy_identity: str
    direction: str
    increase_event_size: int
    start_stitch_count: int
    target_stitch_count: int
    stitch_delta: int
    increase_event_count: int
    available_shaping_round_span: int
    eligible_increase_rounds: tuple[int, ...]
    excluded_rounds: tuple[int, ...]
    cell_center_tie_direction: str
    selected_eligible_indices: tuple[int, ...]
    eligible_index_spacings: tuple[int, ...]
    cell_widths: tuple[int, ...]
    events: tuple[IncreaseEventV1, ...]
    final_stitch_count: int


def build_sleeve_endpoint_candidates_v1(
    raw_stitches: Decimal | int | str,
    constraint: EndpointConstraintV1,
) -> tuple[int, ...]:
    """Return the nearest lower/upper positive counts in an admissible residue set.

    Candidate generation reuses the canon-backed repeat/parity machinery used by the
    general calculation core.  Joint sleeve selection remains specialized and happens
    only after both endpoint sets exist.
    """

    raw = _positive_decimal(raw_stitches, "INVALID_RAW_ENDPOINT")
    residues, period = width_allowed_pattern(
        repeat=constraint.repeat,
        minimum_repeats=0,
        fixed_working=constraint.fixed_stitches,
        constraints=StructuralConstraints(
            parity=constraint.parity,
            center=CenterType.NONE,
            centered_part=Part.ALL,
        ),
    )
    if not residues:
        return ()
    lower, upper = neighbor_values(
        raw - Decimal(constraint.fixed_stitches), residues, period
    )
    return tuple(
        sorted(
            {
                constraint.fixed_stitches + variable
                for variable in (lower, upper)
                if variable is not None and constraint.fixed_stitches + variable > 0
            }
        )
    )


def select_joint_sleeve_endpoint_pair_v1(
    *,
    raw_cuff_stitches: Decimal | int | str,
    raw_upper_stitches: Decimal | int | str,
    cuff_stitches_per_cm: Decimal | int | str,
    upper_stitches_per_cm: Decimal | int | str,
    cuff_candidates: Iterable[int],
    upper_candidates: Iterable[int],
    cuff_tolerance_cm: Decimal | int | str | None = None,
    upper_tolerance_cm: Decimal | int | str | None = None,
) -> JointSleeveEndpointResultV1:
    """Jointly select endpoint counts without an arbitrary tie-breaker."""

    raw_cuff = _positive_decimal(raw_cuff_stitches, "INVALID_RAW_CUFF_STITCHES")
    raw_upper = _positive_decimal(raw_upper_stitches, "INVALID_RAW_UPPER_STITCHES")
    cuff_gauge = _positive_decimal(cuff_stitches_per_cm, "INVALID_CUFF_GAUGE")
    upper_gauge = _positive_decimal(upper_stitches_per_cm, "INVALID_UPPER_GAUGE")
    cuff_tolerance = _optional_nonnegative_decimal(cuff_tolerance_cm, "INVALID_CUFF_TOLERANCE")
    upper_tolerance = _optional_nonnegative_decimal(
        upper_tolerance_cm, "INVALID_UPPER_TOLERANCE"
    )
    normalized_cuff = _candidate_tuple(cuff_candidates, "INVALID_CUFF_CANDIDATE")
    normalized_upper = _candidate_tuple(upper_candidates, "INVALID_UPPER_CANDIDATE")

    valid: list[EndpointCandidatePairV1] = []
    for cuff in normalized_cuff:
        for upper in normalized_upper:
            if upper < cuff or (upper - cuff) % 2:
                continue
            cuff_signed = (Decimal(cuff) - raw_cuff) / cuff_gauge
            upper_signed = (Decimal(upper) - raw_upper) / upper_gauge
            cuff_error = abs(cuff_signed)
            upper_error = abs(upper_signed)
            if cuff_tolerance is not None and cuff_error > cuff_tolerance:
                continue
            if upper_tolerance is not None and upper_error > upper_tolerance:
                continue
            valid.append(
                EndpointCandidatePairV1(
                    cuff_stitches=cuff,
                    upper_stitches=upper,
                    cuff_signed_error_cm=cuff_signed,
                    upper_signed_error_cm=upper_signed,
                    score=(max(cuff_error, upper_error), cuff_error + upper_error),
                )
            )

    valid_pairs = tuple(sorted(valid, key=lambda pair: (pair.cuff_stitches, pair.upper_stitches)))
    if not valid_pairs:
        return JointSleeveEndpointResultV1(
            policy_identity=JOINT_SLEEVE_ENDPOINT_ROUNDING_V1,
            status="no_valid_candidate",
            raw_cuff_stitches=raw_cuff,
            raw_upper_stitches=raw_upper,
            cuff_candidates=normalized_cuff,
            upper_candidates=normalized_upper,
            valid_pairs=(),
            selected_pair=None,
            tied_pairs=(),
        )

    best_score = min(pair.score for pair in valid_pairs)
    best = tuple(pair for pair in valid_pairs if pair.score == best_score)
    status: EndpointStatus = "selected" if len(best) == 1 else "tie"
    return JointSleeveEndpointResultV1(
        policy_identity=JOINT_SLEEVE_ENDPOINT_ROUNDING_V1,
        status=status,
        raw_cuff_stitches=raw_cuff,
        raw_upper_stitches=raw_upper,
        cuff_candidates=normalized_cuff,
        upper_candidates=normalized_upper,
        valid_pairs=valid_pairs,
        selected_pair=best[0] if status == "selected" else None,
        tied_pairs=() if status == "selected" else best,
    )


def solve_joint_sleeve_endpoints_v1(
    *,
    raw_cuff_stitches: Decimal | int | str,
    raw_upper_stitches: Decimal | int | str,
    cuff_stitches_per_cm: Decimal | int | str,
    upper_stitches_per_cm: Decimal | int | str,
    cuff_constraint: EndpointConstraintV1 | None = None,
    upper_constraint: EndpointConstraintV1 | None = None,
    cuff_tolerance_cm: Decimal | int | str | None = None,
    upper_tolerance_cm: Decimal | int | str | None = None,
) -> JointSleeveEndpointResultV1:
    """Build both endpoint sets and solve their +2-compatible Cartesian product."""

    cuff_constraint = cuff_constraint or EndpointConstraintV1()
    upper_constraint = upper_constraint or EndpointConstraintV1()
    cuff_candidates = build_sleeve_endpoint_candidates_v1(raw_cuff_stitches, cuff_constraint)
    upper_candidates = build_sleeve_endpoint_candidates_v1(
        raw_upper_stitches, upper_constraint
    )
    return select_joint_sleeve_endpoint_pair_v1(
        raw_cuff_stitches=raw_cuff_stitches,
        raw_upper_stitches=raw_upper_stitches,
        cuff_stitches_per_cm=cuff_stitches_per_cm,
        upper_stitches_per_cm=upper_stitches_per_cm,
        cuff_candidates=cuff_candidates,
        upper_candidates=upper_candidates,
        cuff_tolerance_cm=cuff_tolerance_cm,
        upper_tolerance_cm=upper_tolerance_cm,
    )


def centered_eligible_indices_v1(eligible_count: int, event_count: int) -> tuple[int, ...]:
    """Exact zero-based cell-center indices used by the taper V1 policy."""

    if not _nonnegative_integer(event_count):
        raise SleeveMathError("INVALID_EVENT_COUNT", "event_count must be nonnegative")
    if not _nonnegative_integer(eligible_count):
        raise SleeveMathError("INVALID_ELIGIBLE_COUNT", "eligible_count must be nonnegative")
    if event_count > eligible_count:
        raise SleeveMathError(
            "INSUFFICIENT_ELIGIBLE_ROUNDS",
            "event_count exceeds the number of eligible positions",
        )
    if event_count == 0:
        return ()
    return tuple(
        ((2 * ordinal - 1) * eligible_count) // (2 * event_count)
        for ordinal in range(1, event_count + 1)
    )


def distribute_bottom_up_sleeve_taper_v1(
    *,
    start_stitch_count: int,
    target_stitch_count: int,
    available_shaping_round_span: int,
    eligible_increase_rounds: Iterable[int],
    excluded_rounds: Iterable[int],
    increase_event_size: int = 2,
    direction: str = "bottom_up",
) -> BottomUpSleeveTaperResultV1:
    """Return the exact +2 increase schedule over the ordered eligible round set."""

    if not _positive_integer(start_stitch_count):
        raise SleeveMathError("INVALID_START_STITCH_COUNT", "start count must be positive")
    if not _positive_integer(target_stitch_count):
        raise SleeveMathError("INVALID_TARGET_STITCH_COUNT", "target count must be positive")
    if direction != "bottom_up":
        raise SleeveMathError("INVALID_DIRECTION", "V1 supports bottom_up only")
    if increase_event_size != 2:
        raise SleeveMathError("INVALID_EVENT_SIZE", "V1 increase events add exactly two stitches")
    if not _positive_integer(available_shaping_round_span):
        raise SleeveMathError("INVALID_ROUND_SPAN", "round span must be positive")
    if target_stitch_count < start_stitch_count:
        raise SleeveMathError("TARGET_BELOW_START", "V1 requires target >= start")

    eligible = _round_tuple(
        eligible_increase_rounds,
        available_shaping_round_span,
        "INVALID_ELIGIBLE_ROUND",
    )
    excluded = _round_tuple(
        excluded_rounds,
        available_shaping_round_span,
        "INVALID_EXCLUDED_ROUND",
    )
    required_boundaries = {1, available_shaping_round_span}
    if not required_boundaries.issubset(excluded):
        raise SleeveMathError(
            "MISSING_BOUNDARY_EXCLUSION",
            "transition round 1 and stop-boundary round T must be excluded",
        )
    if set(eligible).intersection(excluded):
        raise SleeveMathError(
            "ELIGIBLE_EXCLUSION_CONFLICT",
            "an eligible round cannot also be excluded",
        )

    stitch_delta = target_stitch_count - start_stitch_count
    if stitch_delta % increase_event_size:
        raise SleeveMathError(
            "NONINTEGRAL_EVENT_COUNT",
            "stitch delta is not divisible by the +2 event size",
        )
    event_count = stitch_delta // increase_event_size
    selected_indices = centered_eligible_indices_v1(len(eligible), event_count)
    events = tuple(
        IncreaseEventV1(
            ordinal=ordinal,
            eligible_index=index,
            main_round=eligible[index],
            delta_stitches=increase_event_size,
            resulting_stitch_count=start_stitch_count + ordinal * increase_event_size,
        )
        for ordinal, index in enumerate(selected_indices, start=1)
    )
    final_count = start_stitch_count + sum(event.delta_stitches for event in events)
    if final_count != target_stitch_count:
        raise AssertionError("bottom-up sleeve taper balance invariant failed")

    spacings = tuple(
        right - left for left, right in zip(selected_indices, selected_indices[1:])
    )
    cell_widths = (
        tuple(
            (ordinal * len(eligible)) // event_count
            - ((ordinal - 1) * len(eligible)) // event_count
            for ordinal in range(1, event_count + 1)
        )
        if event_count
        else ()
    )
    return BottomUpSleeveTaperResultV1(
        policy_identity=BOTTOM_UP_SLEEVE_TAPER_DISTRIBUTION_V1,
        direction=direction,
        increase_event_size=increase_event_size,
        start_stitch_count=start_stitch_count,
        target_stitch_count=target_stitch_count,
        stitch_delta=stitch_delta,
        increase_event_count=event_count,
        available_shaping_round_span=available_shaping_round_span,
        eligible_increase_rounds=eligible,
        excluded_rounds=excluded,
        cell_center_tie_direction="later",
        selected_eligible_indices=selected_indices,
        eligible_index_spacings=spacings,
        cell_widths=cell_widths,
        events=events,
        final_stitch_count=final_count,
    )


def _candidate_tuple(values: Iterable[int], code: str) -> tuple[int, ...]:
    materialized = tuple(values)
    if any(not _positive_integer(value) for value in materialized):
        raise SleeveMathError(code, "endpoint candidates must be positive integers")
    if len(materialized) != len(set(materialized)):
        raise SleeveMathError(code, "endpoint candidates must not contain duplicates")
    return tuple(sorted(materialized))


def _round_tuple(values: Iterable[int], span: int, code: str) -> tuple[int, ...]:
    materialized = tuple(values)
    if any(not _positive_integer(value) or value > span for value in materialized):
        raise SleeveMathError(code, "rounds must be unique integers inside 1..T")
    if len(materialized) != len(set(materialized)):
        raise SleeveMathError(code, "rounds must be unique integers inside 1..T")
    return tuple(sorted(materialized))


def _positive_decimal(value: Decimal | int | str, code: str) -> Decimal:
    try:
        decimal = value if isinstance(value, Decimal) else Decimal(str(value))
    except (InvalidOperation, ValueError) as error:
        raise SleeveMathError(code, "value must be a finite positive decimal") from error
    if not decimal.is_finite() or decimal <= 0:
        raise SleeveMathError(code, "value must be a finite positive decimal")
    return decimal


def _optional_nonnegative_decimal(
    value: Decimal | int | str | None, code: str
) -> Decimal | None:
    if value is None:
        return None
    try:
        decimal = value if isinstance(value, Decimal) else Decimal(str(value))
    except (InvalidOperation, ValueError) as error:
        raise SleeveMathError(code, "tolerance must be a finite nonnegative decimal") from error
    if not decimal.is_finite() or decimal < 0:
        raise SleeveMathError(code, "tolerance must be a finite nonnegative decimal")
    return decimal


def _positive_integer(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _nonnegative_integer(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0
