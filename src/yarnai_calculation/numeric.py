from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from .models import Unit

INCH_TO_CM = Decimal("2.54")


def decimal_or_none(value: Any) -> Decimal | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None
    return result if result.is_finite() else None


def is_integer(value: Any) -> bool:
    number = decimal_or_none(value)
    return number is not None and number == number.to_integral_value()


def to_cm(value: Any, unit: Unit | str | None) -> Decimal:
    number = Decimal(str(value))
    if unit == Unit.CM or unit == Unit.CM.value:
        return number
    if unit == Unit.INCH or unit == Unit.INCH.value:
        return number * INCH_TO_CM
    raise ValueError(f"Unsupported unit: {unit!r}")


def enum_value(enum_type: type, value: Any):
    try:
        return enum_type(value)
    except (ValueError, TypeError):
        return None


def median(values: list[Decimal]) -> Decimal:
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / Decimal(2)

