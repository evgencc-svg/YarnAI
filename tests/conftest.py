from __future__ import annotations

from dataclasses import replace

import pytest

from yarnai_calculation import (
    Axis,
    CalculationRequest,
    Direction,
    FabricContext,
    FunctionalCategory,
    GaugeInput,
    GaugeMethod,
    GaugeSource,
    HeightRequest,
    KnittingMode,
    MeasurementState,
    PatternClass,
    ProcessingState,
    SizeKind,
    SwatchContext,
    SwatchMode,
    TriState,
    Unit,
    WidthRequest,
)


@pytest.fixture
def fabric() -> FabricContext:
    return FabricContext(
        yarn="test yarn",
        yarn_batch="batch-1",
        strands=1,
        strands_description="one strand",
        needle_mm="4",
        needle_type="metal circular",
        pattern="stockinette",
        mode=KnittingMode.FLAT,
        processing="wash, dry flat",
    )


@pytest.fixture
def swatch_context(fabric: FabricContext) -> SwatchContext:
    return SwatchContext(
        off_needles=TriState.YES,
        processing_state=ProcessingState.AFTER,
        fully_dry=TriState.YES,
        rest_hours=12,
        measurement_state=MeasurementState.RELAXED,
        fabric=fabric,
        mode=SwatchMode.FLAT,
        heavy_or_large=TriState.NO,
    )


@pytest.fixture
def ready_gauge(swatch_context: SwatchContext):
    def make(count, length=10) -> GaugeInput:
        return GaugeInput(
            method=GaugeMethod.READY_VALUE,
            source=GaugeSource.PERSONAL_SWATCH,
            ready_count=count,
            base_length=length,
            source_measurement_count=3,
            context=swatch_context,
        )

    return make


@pytest.fixture
def width_request(ready_gauge):
    def make(*, value=50, gauge_count=20, **changes) -> WidthRequest:
        base = WidthRequest(
            size_kind=SizeKind.FINISHED,
            value=value,
            unit=Unit.CM,
            direction=Direction.NEAREST,
            gauge=ready_gauge(gauge_count),
        )
        return replace(base, **changes)

    return make


@pytest.fixture
def height_request(ready_gauge):
    def make(*, value=60, gauge_count=28, **changes) -> HeightRequest:
        base = HeightRequest(
            value=value,
            unit=Unit.CM,
            direction=Direction.NEAREST,
            gauge=ready_gauge(gauge_count),
            start_point="bottom",
            end_point="top",
        )
        return replace(base, **changes)

    return make


@pytest.fixture
def request_factory(fabric):
    def make(*, axes=(Axis.WIDTH,), width=None, height=None, **changes) -> CalculationRequest:
        base = CalculationRequest(
            axes=frozenset(axes),
            functional_category=FunctionalCategory.ORDINARY,
            knitting_mode=KnittingMode.FLAT,
            zone_pattern="stockinette",
            pattern_class=PatternClass.CONSTANT,
            zone_homogeneous=TriState.YES,
            fabric_context=fabric,
            width=width,
            height=height,
        )
        return replace(base, **changes)

    return make

