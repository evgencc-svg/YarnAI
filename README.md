# YarnAI Calculation

`yarnai-calculation` is the standalone calculation core for YarnAI's first
function. Its stable public API is exposed only from the package root:

```python
from yarnai_calculation import calculate
```

Modules below `yarnai_calculation` are implementation details. Applications
should import `calculate`, request models, result models, and enums directly
from `yarnai_calculation`.

## Installation

For local product integration, install the package from the repository root:

```console
python -m pip install -e .
```

This installs the calculation package and the Starlette/Uvicorn dependencies
used by the HTTP service. To install the dependencies needed to run the test
suite as well:

```console
python -m pip install -e ".[test]"
```

The package requires Python 3.12 or newer.

## Minimal example

```python
from yarnai_calculation import (
    Axis,
    CalculationRequest,
    Direction,
    FabricContext,
    FunctionalCategory,
    GaugeInput,
    GaugeMethod,
    GaugeSource,
    KnittingMode,
    PatternClass,
    ProcessingState,
    SizeKind,
    SwatchContext,
    SwatchMode,
    TriState,
    Unit,
    WidthRequest,
    calculate,
)

fabric = FabricContext(
    yarn="example yarn",
    yarn_batch="batch-1",
    strands=1,
    strands_description="one strand",
    needle_mm=4,
    needle_type="metal circular",
    pattern="stockinette",
    mode=KnittingMode.FLAT,
    processing="wash and dry flat",
)
swatch = SwatchContext(
    off_needles=TriState.YES,
    processing_state=ProcessingState.AFTER,
    fully_dry=TriState.YES,
    rest_hours=12,
    measurement_state="relaxed",
    fabric=fabric,
    mode=SwatchMode.FLAT,
    heavy_or_large=TriState.NO,
)
gauge = GaugeInput(
    method=GaugeMethod.READY_VALUE,
    source=GaugeSource.PERSONAL_SWATCH,
    ready_count=20,
    base_length=10,
    source_measurement_count=3,
    context=swatch,
)
request = CalculationRequest(
    axes=frozenset({Axis.WIDTH}),
    functional_category=FunctionalCategory.ORDINARY,
    knitting_mode=KnittingMode.FLAT,
    zone_pattern="stockinette",
    pattern_class=PatternClass.CONSTANT,
    zone_homogeneous=TriState.YES,
    fabric_context=fabric,
    width=WidthRequest(
        size_kind=SizeKind.FINISHED,
        value=50,
        unit=Unit.CM,
        direction=Direction.NEAREST,
        gauge=gauge,
    ),
)

result = calculate(request)
selected = result.axes[Axis.WIDTH].selected_candidate
print(result.status.name)
print(selected.working_count if selected else None)
```

For this exact input, the selected width is 100 stitches.

## YarnAI application integration

The first application boundary is exposed separately from the calculation
core:

```python
from yarnai import run_first_function
from yarnai_calculation import CalculationRequest

request: CalculationRequest = ...
output = run_first_function(request)
```

`run_first_function` accepts the public `CalculationRequest` contract and
calls only `yarnai_calculation.calculate`. It converts the complete core result
to `FirstFunctionOutput`; domain outcomes such as invalid input, impossible
calculations, and out-of-scope requests remain ordinary result statuses.

Passing a value that is not a `CalculationRequest` raises
`InvalidCalculationRequestError`. If an unexpected technical exception escapes
the core, the boundary raises `CalculationCoreError` with the original
exception available as `original_exception` and as the chained `__cause__`.
Application code never imports modules below `yarnai_calculation`.

## First-function command line interface

Run the first executable vertical slice from the repository root:

```console
python -m yarnai [--input PATH]
```

The command uses only the public `yarnai` integration API. It writes a
calculation result as JSON to stdout and errors as JSON to stderr. Decimal
result values are serialized as strings so that no precision is lost. The
top-level `status` uses stable enum names such as `READY`,
`READY_WITH_WARNINGS`, and `INPUT_ERROR`; complete domain diagnostics,
warnings, clarifications, and invariant traces remain in the response.

The repository contains a working canonical width example at
`examples/first_function_width.json`. Run it from a file:

```console
python -m yarnai --input examples/first_function_width.json
```

Omit `--input`, or use `--input -`, to read JSON from stdin. For example, in
PowerShell:

```console
Get-Content -Raw examples/first_function_width.json | python -m yarnai
```

On shells with input redirection:

```console
python -m yarnai < examples/first_function_width.json
```

The canonical example produces a complete response whose key fields are:

```json
{
  "status": "READY",
  "final": true,
  "canon_version": "1.0",
  "specification_version": "1.0",
  "axes": {
    "width": {
      "selected_candidate": {
        "working_count": 100,
        "visible_count": "100",
        "actual_size_cm": "50"
      }
    }
  },
  "errors": [],
  "warnings": [],
  "clarifications": []
}
```

This is a shortened view of the successful JSON: the actual response also
contains normalized inputs, gauge assessment, neighboring candidates,
explanations, and the full invariant trace.

## First-function HTTP API

After installation, start the local HTTP service with the public command:

```console
yarnai-http
```

The equivalent module command is `python -m yarnai.http`. The service listens
at `http://127.0.0.1:8000`.

Check its health:

```console
curl.exe http://127.0.0.1:8000/health
```

Send the canonical example with curl:

```console
curl.exe --request POST http://127.0.0.1:8000/api/v1/calculate --header "Content-Type: application/json" --data-binary "@examples/first_function_width.json"
```

Or send the same request from PowerShell:

```powershell
$body = Get-Content -Raw examples/first_function_width.json
Invoke-RestMethod `
  -Uri http://127.0.0.1:8000/api/v1/calculate `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

The successful response is the complete structured first-function result. Its
key fields for the canonical example are:

```json
{
  "status": "READY",
  "final": true,
  "axes": {
    "width": {
      "selected_candidate": {
        "working_count": 100
      }
    }
  },
  "errors": [],
  "warnings": []
}
```

| HTTP status | Meaning |
| ---: | --- |
| `200` | The calculation returned a structured domain result. This includes `READY`, `INPUT_ERROR`, `IMPOSSIBLE`, and other normal domain statuses. |
| `400` | The request body is not valid JSON. |
| `422` | The JSON is valid but does not match the YarnAI application input contract. |
| `500` | A technical failure occurred in the integration layer, calculation core, or result serialization. |

Domain errors are not HTTP failures: they are returned with HTTP `200` and
remain available through `status`, `final`, `errors`, `warnings`, and the rest
of the structured result.

## CLI exit codes

| Code | Meaning |
| ---: | --- |
| `0` | The calculation completed and returned structured JSON. This includes ordinary domain outcomes such as `INPUT_ERROR`, `IMPOSSIBLE`, or `CONFIRMATION_REQUIRED`. |
| `2` | User input could not be read or parsed, or its JSON shape does not match the application contract. |
| `3` | A technical failure occurred in the integration layer, calculation core, or result serialization. |
