# YarnAI Calculation

`yarnai-calculation` is the standalone calculation core for YarnAI's first
function. Its stable public API is exposed only from the package root:

```python
from yarnai_calculation import calculate
```

Modules below `yarnai_calculation` are implementation details. Applications
should import `calculate`, request models, result models, and enums directly
from `yarnai_calculation`.

## Quick start

YarnAI requires Python 3.12 or newer. From the repository root:

```console
python -m pip install -e ".[test]"
yarnai-http
```

Open `http://127.0.0.1:8000/`. The public demonstration includes:

- `/` — start page and width-calculation form;
- `/about` — what the first function calculates and how to read its result;
- `/example` — the canonical example, filled and calculated automatically.

No frontend installation or build is required.

## Public demonstration

![YarnAI start page](docs/screenshots/start-page.png)

![Canonical example with 100-stitch result](docs/screenshots/canonical-example.png)

![Explanation of the first function](docs/screenshots/about-first-function.png)

The demonstration uses packaged HTML, CSS, and vanilla JavaScript. It can fill
or clear the canonical example, copy a shareable URL containing the current
form values as query parameters, and print the form and result. JavaScript is
required for filling and calculating; the page shows an explicit message when
it is disabled.

The application version is shown in the header and footer. The calculation
core does not currently expose an independent public version value, so the UI
does not invent or display one.

## Purpose of the first function

The first function converts a requested finished width or measurement into a
working stitch count. It needs the requested width, gauge, swatch state,
knitting context, and yarn/tool context. A successful result is the working
number of stitches to cast on; warnings and diagnostics explain incomplete,
incompatible, or unsupported inputs.

For the canonical example, a width of 50 cm at 20 stitches per 10 cm produces
100 working stitches.

## First-version limitations

- Only the first width-calculation function is demonstrated.
- The application does not save projects, history, calculations, or user data.
- The demonstration does not replace making and measuring a representative
  swatch.
- There is no authentication, database, analytics, or cloud integration.
- Shareable URLs contain form inputs in plain query parameters and should not
  be used for sensitive information.
- The independent calculation-core version is not displayed because the core
  does not currently publish one through its stable public API.

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

### Demonstration web interface

The HTTP service also serves the public demonstration of the first
width-calculation function. Start it with:

```console
yarnai-http
```

Then open `http://127.0.0.1:8000/` in a browser. The pages use only packaged
HTML, CSS, and vanilla JavaScript; it has no frontend build step or external
frontend dependencies. Every calculation is sent to the existing
`POST /api/v1/calculate` endpoint.

Use **Заполнить пример** to restore the values from
`examples/first_function_width.json`, **Очистить форму** to remove all values,
and **Скопировать ссылку** to copy the current form as a shareable URL. Open
`http://127.0.0.1:8000/example` to load and calculate the canonical example
automatically; the result is **100 петель**.

The interface treats the main domain statuses as user-facing states:

- `READY` and `READY_WITH_WARNINGS` show the selected working stitch count;
- `INPUT_ERROR` asks the user to correct the supplied data;
- `IMPOSSIBLE` explains that the requested conditions are incompatible;
- warnings are shown in a separate notice;
- HTTP `400`, `422`, and `500`, network failures, and incomplete responses
  produce safe messages without tracebacks or internal exception details.

This page is intentionally limited to local manual testing of YarnAI's first
function. It does not store calculations or user data.

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

## Verification

Run the UI smoke test:

```console
python -m pytest tests/integration/test_demo_smoke.py
```

Run all tests and compile every Python module:

```console
python -m pytest
python -m compileall -q src tests
```

## CLI exit codes

| Code | Meaning |
| ---: | --- |
| `0` | The calculation completed and returned structured JSON. This includes ordinary domain outcomes such as `INPUT_ERROR`, `IMPOSSIBLE`, or `CONFIRMATION_REQUIRED`. |
| `2` | User input could not be read or parsed, or its JSON shape does not match the application contract. |
| `3` | A technical failure occurred in the integration layer, calculation core, or result serialization. |
