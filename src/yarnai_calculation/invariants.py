from __future__ import annotations

from .models import (
    Axis,
    CalculationRequest,
    Diagnostic,
    FunctionalCategory,
    InvariantState,
    InvariantTrace,
    ResultStatus,
)
from .numeric import enum_value


INVARIANTS = (
    (1, "Единственный источник истины", "1"),
    (2, "Размер задаётся явно", "3, 6"),
    (3, "Итоговая геометрия проверяется", "15"),
    (4, "Плотность принадлежит конкретному полотну", "7–9"),
    (5, "Обе оси независимы", "2, 8"),
    (6, "Используется плотность после обработки", "7–9"),
    (7, "Промежуточные значения не округляются", "5–16"),
    (8, "Петли и ряды целочисленны", "3, 12, 14"),
    (9, "Сначала допустимость, затем близость", "12–14"),
    (10, "Раппорт не нарушается молча", "12–14, 20"),
    (11, "Фиксированные петли не масштабируются", "11"),
    (12, "Кромочные считаются в двух смыслах", "11, 15"),
    (13, "Пропорция имеет область применимости", "4"),
    (14, "Прибавки и убавки сохраняют баланс", "4"),
    (15, "Остаток распределяется", "4"),
    (16, "Форма проверяется вместе с количеством", "4"),
    (17, "Парные детали согласованы", "4"),
    (18, "Все контрольные размеры согласованы", "2, 4, 20"),
    (19, "Допуск не скрывает конфликт", "16"),
    (20, "Источник каждого решения видим", "20"),
    (21, "Альтернативная школа названа", "3, 7, 20"),
    (22, "Неопределённость не маскируется точностью", "3, 8, 9, 20"),
    (23, "Сложность не сводится к линейной формуле", "4"),
    (24, "Функциональность важнее арифметики", "18"),
    (25, "Пользователь понимает компромисс", "14, 16, 20"),
)


def build_trace(
    request: CalculationRequest,
    status: ResultStatus,
    diagnostics: list[Diagnostic],
    has_axes: bool,
    requires_decision: bool,
) -> tuple[InvariantTrace, ...]:
    codes = tuple(item.code for item in diagnostics)
    traces: list[InvariantTrace] = []
    input_block = status is ResultStatus.INPUT_ERROR
    scope_block = status is ResultStatus.OUT_OF_SCOPE
    impossible = status is ResultStatus.IMPOSSIBLE
    for number, name, stage in INVARIANTS:
        state = InvariantState.FULFILLED
        evidence = "Проверка выполнена по нормативному профилю 1.0."
        related: tuple[str, ...] = ()
        if input_block:
            if number in (1, 20, 22):
                state = InvariantState.FULFILLED
                evidence = "Нормативная версия и причина безопасной остановки явно сохранены."
            elif number == 2 and any(code in codes for code in ("ОШ-04", "ОШ-05", "ОШ-06", "ОШ-07", "ОШ-25")):
                state = InvariantState.BLOCKED
                evidence = "Определение целевого размера заблокировало вычисление."
                related = codes
            elif number in (4, 6) and any(code in codes for code in ("ОШ-09", "ОШ-10", "ОШ-11", "ОШ-12", "ОШ-13", "ОШ-14", "ОШ-15")):
                state = InvariantState.BLOCKED
                evidence = "Плотность или её контекст не прошли входной контракт."
                related = codes
            elif number == 5 and any(code in codes for code in ("ОШ-02", "ОШ-09")):
                state = InvariantState.BLOCKED
                evidence = "Независимый вход одной из осей отсутствует."
                related = codes
            elif number == 8 and any(code in codes for code in ("ОШ-16", "ОШ-17", "ОШ-22")):
                state = InvariantState.BLOCKED
                evidence = "Рабочее количество не удовлетворяет целочисленному контракту."
                related = codes
            elif number == 21 and "ОШ-28" in codes:
                state = InvariantState.BLOCKED
                evidence = "Источник альтернативного правила не определён."
                related = codes
            else:
                state = InvariantState.NOT_APPLICABLE
                evidence = "Математический этап не применялся из-за ошибки входа."
        elif scope_block:
            if number in (13, 14, 15, 16, 17, 18, 23, 24):
                state = InvariantState.BLOCKED
                evidence = "Шлюз области остановил запрещённое линейное упрощение."
                related = codes
            elif number in (1, 2, 4, 5, 6, 7, 8, 20, 21, 22):
                state = InvariantState.FULFILLED
                evidence = "Предварительная проверка завершена до шлюза области."
            else:
                state = InvariantState.NOT_APPLICABLE
                evidence = "Расчёт кандидатов не запускался для случая вне области."
        elif impossible:
            if number in (8, 9, 10, 11, 12, 19, 22, 25):
                state = InvariantState.BLOCKED
                evidence = "Проверка допустимости доказала отсутствие разрешённого результата."
                related = codes
            elif number in (3, 20):
                state = InvariantState.NOT_APPLICABLE
                evidence = "Итоговый кандидат отсутствует, поэтому обратный контроль не применим."
        elif requires_decision:
            decision_codes = {
                10: {"ПР-20", "ПР-22"},
                19: {"ПР-17", "ПР-18"},
                21: {"ПР-22"},
                22: {"ПР-08", "ПР-09", "ПР-10", "ПР-11", "ПР-12", "ПР-13", "ПР-26"},
                24: {"ПР-23", "ПР-24", "ПР-25", "ПР-26"},
                25: {"ПР-17", "ПР-18", "ПР-20", "ПР-22"},
            }
            relevant = tuple(code for code in codes if code in decision_codes.get(number, set()))
            if relevant:
                state = InvariantState.REQUIRES_DECISION
                evidence = "Предварительный результат не повышен до окончательного без решения пользователя."
                related = relevant
            elif _not_applicable(number, request):
                state = InvariantState.NOT_APPLICABLE
                evidence = "Инвариант не применим к заявленной области этой попытки."
            else:
                state = InvariantState.FULFILLED
                evidence = "Проверка выполнена и не является причиной текущего решения пользователя."
        elif not has_axes and number not in (1, 2, 20, 22):
            state = InvariantState.NOT_APPLICABLE
            evidence = "Для попытки отсутствует вычисленный осевой результат."
        elif _not_applicable(number, request):
            state = InvariantState.NOT_APPLICABLE
            evidence = "Инвариант не применим к заявленной области этой попытки."
        traces.append(
            InvariantTrace(
                number=number,
                name=name,
                stage=stage,
                state=state,
                evidence=evidence,
                related_codes=related,
            )
        )
    return tuple(traces)


def _not_applicable(number: int, request: CalculationRequest) -> bool:
    if number == 10:
        return not (
            (request.width is not None and request.width.repeat is not None)
            or (request.height is not None and request.height.repeat is not None)
        )
    if number in (11, 12):
        return request.width is None or not request.width.fixed_components
    if number == 21:
        return not request.explicit_source_rule and not (
            request.height is not None and request.height.source_phase_rule
        )
    if number == 24:
        category = enum_value(FunctionalCategory, request.functional_category)
        return category is FunctionalCategory.ORDINARY
    return False
