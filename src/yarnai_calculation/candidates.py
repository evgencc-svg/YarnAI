from __future__ import annotations

from dataclasses import replace
from decimal import Decimal, ROUND_CEILING, ROUND_FLOOR
from math import gcd

from .models import (
    Axis,
    Candidate,
    CenterType,
    Direction,
    EndPhase,
    Parity,
    Part,
    StructuralConstraints,
    Unit,
)
from .numeric import INCH_TO_CM, enum_value


def _lcm(left: int, right: int) -> int:
    return left * right // gcd(left, right)


def width_allowed_pattern(
    repeat: int | None,
    minimum_repeats: int,
    fixed_working: int,
    constraints: StructuralConstraints,
) -> tuple[tuple[int, ...], int]:
    step = repeat or 1
    moduli = [step]
    parity = enum_value(Parity, constraints.parity) or Parity.ANY
    center = enum_value(CenterType, constraints.center) or CenterType.NONE
    centered_part = enum_value(Part, constraints.centered_part)
    sectors = int(constraints.sectors) if constraints.sectors is not None else 1
    sector_part = enum_value(Part, constraints.sector_part)
    if parity is not Parity.ANY or center is not CenterType.NONE:
        moduli.append(2)
    if sectors > 1:
        moduli.append(sectors)
    period = 1
    for modulus in moduli:
        period = _lcm(period, modulus)
    minimum = minimum_repeats * step
    residues: list[int] = []
    for variable in range(0, period, step):
        total = fixed_working + variable
        if parity is Parity.EVEN and total % 2:
            continue
        if parity is Parity.ODD and total % 2 == 0:
            continue
        center_value = total if centered_part is Part.ALL else variable
        if center is CenterType.STITCH and center_value % 2 == 0:
            continue
        if center is CenterType.GAP and center_value % 2:
            continue
        sector_value = total if sector_part is Part.ALL else variable
        if sectors > 1 and sector_value % sectors:
            continue
        residues.append(variable)
    if not residues:
        return (), period
    normalized: set[int] = set()
    for residue in residues:
        if residue < minimum:
            jumps = (minimum - residue + period - 1) // period
            normalized.add(residue + jumps * period)
        else:
            normalized.add(residue)
    return tuple(sorted(normalized)), period


def height_allowed_pattern(
    repeat: int | None,
    fixed_rows: int,
    end_phase: EndPhase,
) -> tuple[tuple[int, ...], int]:
    step = repeat or 1
    period = _lcm(step, 2) if end_phase in (EndPhase.EVEN, EndPhase.ODD) else step
    residues: list[int] = []
    for variable in range(0, period, step):
        total = fixed_rows + variable
        if end_phase is EndPhase.EVEN and total % 2:
            continue
        if end_phase is EndPhase.ODD and total % 2 == 0:
            continue
        residues.append(variable)
    return tuple(residues), period


def neighbor_values(ideal_variable: Decimal, residues: tuple[int, ...], period: int) -> tuple[int | None, int | None]:
    lower: int | None = None
    upper: int | None = None
    for base in residues:
        ratio = (ideal_variable - Decimal(base)) / Decimal(period)
        down_steps = max(0, int(ratio.to_integral_value(rounding=ROUND_FLOOR)))
        up_steps = max(0, int(ratio.to_integral_value(rounding=ROUND_CEILING)))
        down = base + down_steps * period
        up = base + up_steps * period
        if Decimal(down) <= ideal_variable and (lower is None or down > lower):
            lower = down
        if Decimal(up) >= ideal_variable and (upper is None or up < upper):
            upper = up
        if Decimal(base) > ideal_variable and (upper is None or base < upper):
            upper = base
    return lower, upper


def make_candidate(
    axis: Axis,
    variable: int,
    fixed_working: int,
    fixed_visible: Decimal,
    repeat: int | None,
    target_cm: Decimal,
    density: Decimal,
    ideal_variable: Decimal,
    direction: Direction,
    original_unit: Unit,
) -> Candidate:
    working = fixed_working + variable
    visible = (fixed_visible + Decimal(variable)) if axis is Axis.WIDTH else Decimal(working)
    actual = visible / density
    signed = actual - target_cm
    absolute = abs(signed)
    relative = Decimal(100) * signed / target_cm
    if direction is Direction.NOT_LESS:
        direction_ok = actual >= target_cm
    elif direction is Direction.NOT_MORE:
        direction_ok = actual <= target_cm
    else:
        direction_ok = True
    position = "exact" if Decimal(variable) == ideal_variable else ("lower" if Decimal(variable) < ideal_variable else "upper")
    return Candidate(
        working_count=working,
        visible_count=visible,
        repeats=(variable // repeat if repeat else None),
        position=position,
        actual_size_cm=actual,
        actual_size_original_unit=(actual if original_unit is Unit.CM else actual / INCH_TO_CM),
        original_unit=original_unit,
        signed_error_cm=signed,
        absolute_error_cm=absolute,
        relative_error_percent=relative,
        direction_satisfied=direction_ok,
        structural_checks=("integer", "repeat", "parity", "center", "sectors"),
    )


def with_tolerance(candidate: Candidate, zone: str) -> Candidate:
    return replace(candidate, tolerance_zone=zone)
