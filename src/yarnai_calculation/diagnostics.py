from __future__ import annotations

from .models import Axis, Diagnostic, DiagnosticClass


CATALOG: dict[str, tuple[DiagnosticClass, str, str, str]] = {
    "ОШ-01": (DiagnosticClass.INPUT_ERROR, "Отсутствует обязательное поле", "Заполнить указанное поле", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-02": (DiagnosticClass.INPUT_ERROR, "Не выбрана рассчитываемая ось", "Выбрать требуемую ось", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-03": (DiagnosticClass.INPUT_ERROR, "Значение не является конечным числом", "Исправить запись числа", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-04": (DiagnosticClass.INPUT_ERROR, "Размер равен нулю или отрицателен", "Проверить мерку и единицу", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-05": (DiagnosticClass.INPUT_ERROR, "Мерка плюс прибавка не дают положительного готового размера", "Исправить мерку или прибавку", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-06": (DiagnosticClass.INPUT_ERROR, "Для мерки не указана прибавка", "Ввести прибавку, включая нулевую", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-07": (DiagnosticClass.INPUT_ERROR, "К готовому размеру пытаются повторно применить прибавку", "Удалить прибавку либо изменить тип размера", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-08": (DiagnosticClass.INPUT_ERROR, "Неизвестная единица", "Использовать сантиметры или дюймы", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-09": (DiagnosticClass.INPUT_ERROR, "Нет плотности требуемой оси", "Добавить плотность соответствующей оси", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-10": (DiagnosticClass.INPUT_ERROR, "Плотность или базовая длина не положительна", "Повторно ввести измерение", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-11": (DiagnosticClass.INPUT_ERROR, "Пара измерения неполна", "Дополнить пару", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-12": (DiagnosticClass.INPUT_ERROR, "Меньше трёх личных измерений", "Добавить измерения или использовать готовую непроверенную плотность", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-13": (DiagnosticClass.INPUT_ERROR, "Общий размер образца меньше измеряемой зоны", "Исправить размеры образца или зоны", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-14": (DiagnosticClass.INPUT_ERROR, "Одновременно заданы конкурирующие плотности", "Оставить один источник плотности", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-15": (DiagnosticClass.INPUT_ERROR, "Контекст изделия не указан", "Добавить контекст образца и изделия", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-16": (DiagnosticClass.INPUT_ERROR, "Рабочее количество задано дробным", "Исправить рабочее количество", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-17": (DiagnosticClass.INPUT_ERROR, "Раппорт меньше 1", "Исправить раппорт либо убрать ограничение", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-18": (DiagnosticClass.INPUT_ERROR, "Фиксированный компонент имеет отрицательное количество", "Исправить компонент", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-19": (DiagnosticClass.INPUT_ERROR, "Видимый вклад компонента вне диапазона", "Уточнить видимый вклад", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-20": (DiagnosticClass.INPUT_ERROR, "Заявленная сумма фиксированных компонентов не совпадает", "Исправить сумму или детализацию", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-21": (DiagnosticClass.INPUT_ERROR, "Несовместимы тип центра и парность", "Изменить структурное требование", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-22": (DiagnosticClass.INPUT_ERROR, "Число секторов меньше 1", "Исправить число секторов", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-23": (DiagnosticClass.INPUT_ERROR, "Явный допуск отрицателен", "Указать неотрицательный допуск", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-24": (DiagnosticClass.INPUT_ERROR, "Два допуска заданы без правила объединения", "Оставить один допуск", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-25": (DiagnosticClass.INPUT_ERROR, "Противоречат мерка, прибавка и готовый размер", "Выбрать источник истины", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-26": (DiagnosticClass.INPUT_ERROR, "Не определены точки измерения высоты", "Описать обе контрольные точки", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-27": (DiagnosticClass.INPUT_ERROR, "Не определено, что считается рядом", "Уточнить правило подсчёта", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОШ-28": (DiagnosticClass.INPUT_ERROR, "Не определён источник явного правила", "Указать источник правила", "CALCULATION_ENGINE_SPEC §4.1"),
    "ОБЛ-01": (DiagnosticClass.OUT_OF_SCOPE, "Переменное число петель", "Предоставить отдельную модель", "CALCULATION_ENGINE_SPEC §4.2"),
    "ОБЛ-02": (DiagnosticClass.OUT_OF_SCOPE, "Составной ряд", "Уточнить единицу ряда", "CALCULATION_ENGINE_SPEC §4.2"),
    "ОБЛ-03": (DiagnosticClass.OUT_OF_SCOPE, "Неоднородная зона или несколько плотностей", "Разделить расчёт на зоны", "CALCULATION_ENGINE_SPEC §4.2"),
    "ОБЛ-04": (DiagnosticClass.OUT_OF_SCOPE, "Запрошено формообразование", "Ограничить запрос прямым участком", "CALCULATION_ENGINE_SPEC §4.2"),
    "ОБЛ-05": (DiagnosticClass.OUT_OF_SCOPE, "Укороченные ряды или сложная геометрия", "Выполнить специализированный расчёт", "CALCULATION_ENGINE_SPEC §4.2"),
    "ОБЛ-06": (DiagnosticClass.OUT_OF_SCOPE, "Соединение или согласование деталей", "Ограничить запрос одной зоной", "CALCULATION_ENGINE_SPEC §4.2"),
    "ОБЛ-07": (DiagnosticClass.OUT_OF_SCOPE, "Преобразование плоского узора в круговой", "Предоставить проверенную версию и образец", "CALCULATION_ENGINE_SPEC §4.2"),
    "ОБЛ-08": (DiagnosticClass.OUT_OF_SCOPE, "Оценка растяжимости или безопасности", "Добавить функциональные данные и ручную оценку", "CALCULATION_ENGINE_SPEC §4.2"),
    "ОБЛ-09": (DiagnosticClass.OUT_OF_SCOPE, "Частичный или динамический раппорт", "Использовать полный раппорт или авторское правило", "CALCULATION_ENGINE_SPEC §4.2"),
    "ОБЛ-10": (DiagnosticClass.OUT_OF_SCOPE, "Фиксированный компонент имеет другую плотность", "Рассчитать как отдельную зону", "CALCULATION_ENGINE_SPEC §4.2"),
    "НЕВ-01": (DiagnosticClass.IMPOSSIBLE, "Видимая фиксированная часть шире цели", "Изменить фиксированную часть, плотность или цель", "CALCULATION_ENGINE_SPEC §4.3"),
    "НЕВ-02": (DiagnosticClass.IMPOSSIBLE, "Фиксированные ряды выше цели", "Изменить фиксированные ряды или высоту", "CALCULATION_ENGINE_SPEC §4.3"),
    "НЕВ-03": (DiagnosticClass.IMPOSSIBLE, "Раппорт и парность несовместимы", "Изменить раппорт, фиксированные петли или парность", "CALCULATION_ENGINE_SPEC §4.3"),
    "НЕВ-04": (DiagnosticClass.IMPOSSIBLE, "Раппорт, центр и секторы несовместимы", "Ослабить одно ограничение", "CALCULATION_ENGINE_SPEC §4.3"),
    "НЕВ-05": (DiagnosticClass.IMPOSSIBLE, "Нет кандидата для жёсткого ограничения", "Изменить ограничение или компоновку", "CALCULATION_ENGINE_SPEC §4.3"),
}

for number, reason in {
    1: "Измеряемая зона меньше 10 см", 2: "Нет полей вне измеряемой зоны",
    3: "Образец измерен на спицах", 4: "Образец до обработки",
    5: "Образец не полностью высушен", 6: "Образец не отдыхал или время неизвестно",
    7: "Измерение не в расслабленном состоянии", 8: "Плотность не из личного образца",
    9: "Физический образец не подтверждён", 10: "Размах плотности больше 2%",
    11: "Режимы образца и изделия не совпадают", 12: "Контекст образца и изделия не совпадает",
    13: "Тяжёлое или крупное изделие", 14: "Обычное целое нарушает раппорт",
    15: "Результат изменён ради структуры", 16: "Отклонение выше первого порога",
    17: "Отклонение выше второго порога", 18: "Явный допуск превышен",
    19: "Округление изменило прибавку", 20: "Два равноудалённых варианта",
    21: "Шаг раппорта больше первого порога", 22: "Локальное правило отличается от канона",
    23: "Отрицательная прибавка", 24: "Критическое отверстие",
    25: "Чувствительное назначение", 26: "Категория неизвестна",
}.items():
    code = f"ПР-{number:02d}"
    CATALOG[code] = (
        DiagnosticClass.WARNING,
        reason,
        "Проверить предупреждение и выполнить указанную предметную проверку",
        "CALCULATION_ENGINE_SPEC §5",
    )


def diagnostic(
    code: str,
    *,
    axis: Axis | None = None,
    field: str | None = None,
    stage: int,
    parameters: dict | None = None,
    kind: DiagnosticClass | None = None,
    reason: str | None = None,
    next_action: str | None = None,
) -> Diagnostic:
    catalog_kind, catalog_reason, catalog_action, reference = CATALOG[code]
    return Diagnostic(
        code=code,
        kind=kind or catalog_kind,
        reason=reason or catalog_reason,
        field=field,
        axis=axis,
        stage=stage,
        next_action=next_action or catalog_action,
        normative_reference=reference,
        parameters=parameters or {},
    )

