# YarnAI — самокритика предложенной архитектуры

Статус: **PROPOSAL FOR DISCUSSION**. Документ намеренно оспаривает предложения из остальных новых файлов.

## 1. Executive assessment

Предложенная архитектура сильнее текущей в разделении истины, lifecycle и ответственности, но рискует быть слишком сложной для раннего продукта. Главная задача команды — принять семантические границы, не превращая их немедленно в организационную и техническую сложность.

## 2. Самые сильные решения предложения

### Project ≠ Garment Definition ≠ Garment Artifact

Это необходимая основа для repeat, prototype, repair, change и final verification. Без неё цифровой двойник невозможен.

### As-designed / as-planned / as-built

Даёт точное место каждому конфликту и исключает подгонку обещания под получившийся результат.

### Evidence-first и immutable records

Защищает проект от hallucination, model drift и потери причин прошлых решений.

### Observation ≠ diagnosis ≠ decision

Это ключевой safety boundary для Computer Vision.

### Formal Pattern Model

Позволяет согласовать text/chart/video, пересчитывать и проверять. Но это одновременно самое дорогое решение.

### Memory without ownership of truth

Уменьшает privacy risk и дублирование; позволяет заменить retrieval technology.

## 3. Где предложение может быть ошибочным

### 3.1. Garment как слишком узкое название

YarnAI хочет поддерживать игрушки, аксессуары, декор и другие crafts. `Garment Definition` семантически узок. Возможные альтернативы: `Made Object Definition`, `Craft Object Definition`, `Product Definition`. Однако слишком общий `Item` уже показал проблему.

Рекомендация: утвердить пару понятий на knitting vertical и только потом выбрать platform-wide umbrella term.

### 3.2. Technology Plan и Pattern могут пересекаться

Для простого изделия distinction «construction strategy» и «executable operations» ясна; для маленького repair она может быть искусственной. Возможно, Technology Plan должен быть optional layer или Pattern иметь design-independent construction plan.

### 3.3. Decision Engine может быть не bounded context

Decisions встречаются во всех contexts. Централизованный Decision Engine рискует стать workflow god-object. Альтернатива: каждый context владеет своими decisions, а общий Decision Record/Evidence protocol является shared kernel.

Предпочтение: общий protocol и cross-context Decision Case только для решений, затрагивающих несколько owners.

### 3.4. Confidence Engine также может быть policy library

Confidence зависит от типа claim. Универсальный engine может скрыть доменные различия. Нужна общая evidence vocabulary, но calibration должна принадлежать verification capability конкретного домена.

### 3.5. Recommendation Engine может оказаться orchestration, а не доменом

Он не владеет долгоживущей истиной. Возможно, это application policy, которую не следует называть bounded context. В документах он выделен из-за явного пользовательского требования и важности границы, но это требует решения команды.

### 3.6. Digital Twin может быть преждевременным брендингом

Если as-built evidence редок, twin будет mostly unknown. Это нормально архитектурно, но продукт может создать ложное ожидание полной копии. Термин следует использовать только с явной моделью неизвестного.

## 4. Complexity budget

Нельзя реализовывать все названные сущности одинаково глубоко. Для MVP обязательны только понятия, предотвращающие необратимый долг:

- Project identity/goal;
- Artifact identity;
- source Pattern/reference provenance;
- evidence/observation;
- decision and expected outcome;
- execution/checkpoint events;
- confidence limitations;
- resume projection.

Garment Definition, formal Pattern и full Technology Plan могут начинаться узкими, но не заменяться текстовым blob.

## 5. Проверка против требований исходных документов

| Исходный принцип | Поддержка | Напряжение |
|---|---|---|
| Intent-first | Intent остаётся обязательным для action | safety/context могут вычисляться раньше |
| вход на любом этапе | reconstruction mode | нужно честно сохранять unknowns |
| не общий уровень | Learning Evidence per skill | всё равно потребуется user-facing simplification |
| один надёжный шаг | Recommendation/Verification loop | архитектура не должна задерживать response бюрократией |
| честное «не знаю» | indeterminate verdict | нужны ясные operational policies D-005/D-006 |
| до завершённой вещи | separate Project/Artifact completion | D-003 всё ещё открыт |
| проверяемый результат | criteria/evidence/verdict | criteria coverage дорого создавать |

## 6. Неразрешённые вопросы

1. Platform umbrella term вместо Garment/Item.
2. Может ли один Project иметь несколько final Artifacts?
3. Является ли Pattern интеллектуальной собственностью пользователя, дизайнера или совместным производным?
4. Кто имеет право release Design/Pattern version?
5. Где проходит accepted human confirmation для observations?
6. Какие actions требуют deterministic hard gate?
7. Какая шкала consequence classes?
8. Какие criteria достаточны для `Verified Complete` по типам изделия?
9. Как представить unknown/indeterminate без потери доверия?
10. Как отделить product recommendation от профессионального заключения?
11. Как долго learning evidence остаётся применимым?
12. Как formalize pattern incrementally без полной DSL upfront?

## 7. Проверка на over-engineering

Признаки, что команда зашла слишком далеко:

- проектирует универсальные taxonomies без реальных cases;
- создаёт отдельную команду/сервис на каждый Engine;
- тратит больше времени на state names, чем на verified outcomes;
- formal model не улучшает конкретный next-step decision;
- traceability собирается, но не используется для проверки/объяснения;
- versioning не имеет user-visible change problem;
- architecture vocabulary не понимают craft experts.

## 8. Проверка на under-engineering

Признаки опасного упрощения:

- chat summary является единственным контекстом;
- фото сразу меняет status;
- PDF — единственный Pattern artifact;
- одно поле `Item` хранит желаемое и фактическое;
- «AI уверен» без claim/evidence;
- изменение дизайна переписывает текущий plan;
- completion объявляется кликом пользователя без сохранения criteria;
- learning state меняется по самооценке.

## 9. Как валидировать архитектуру до утверждения

Провести event storming минимум на шести историях:

1. пользователь застрял на импортированном Pattern;
2. по фото хочет адаптированный свитер;
3. меняет пряжу после swatch;
4. обнаруживает ошибку после 30 рядов;
5. одновременно делает два рукава и возвращается через неделю;
6. завершает, блокирует, измеряет и принимает отклонение.

Для каждой истории проверить:

- кто владелец каждого факта;
- какие версии активны;
- что immutable;
- где Decision Case;
- какое evidence требуется;
- что считается progress/completion;
- можно ли восстановить всё без transcript.

## 10. Решения, которые нельзя принимать пакетом

Отдельного утверждения требуют:

- изменение абсолютного Intent-first правила;
- замена Item на Definition/Artifact;
- принятие Digital Twin;
- formal Pattern Model как SoT;
- четыре независимых state machines;
- memory ownership/consent model;
- immutable event/decision/evidence model;
- границы Decision/Confidence/Recommendation;
- completion verdict model;
- craft extension architecture.

## 11. Итоговая рекомендация

Принять сначала не список компонентов, а пять необратимых семантических границ:

1. Project не является изделием.
2. Проект изделия не является физическим экземпляром.
3. Наблюдение не является диагнозом.
4. Текст не является конструктивным Source of Truth.
5. История фактов не переписывается новой интерпретацией.

Остальные engines и названия можно адаптировать после event storming и domain expert review.

