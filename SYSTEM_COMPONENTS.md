# YarnAI — подсистемы предметной платформы

Статус: **PROPOSAL FOR DISCUSSION**. Ни одна граница не считается принятой до решения команды.

## 1. Правило выделения подсистем

Подсистема получает независимую границу, если у неё есть собственная предметная ответственность, инварианты, словарь, жизненный цикл и Source of Truth. Название «Engine» не означает отдельный сервис, AI-модель или процесс развёртывания.

## 2. Карта компонентов

| Компонент | Владеет | Получает | Производит | Не имеет права |
|---|---|---|---|---|
| Intent Engine | Intent Hypothesis текущего обращения | utterance, context references | working interaction goal | менять Project/Garment |
| User State Engine | Interaction Situation projection | intent, active context, signals | situation assessment | владеть lifecycle проекта |
| Learning State Engine | skill-specific inferred state | learning evidence | learning assessment/candidate update | повышать навык по числу сообщений |
| Project Engine | project goal, scope, commitments, lifecycle | accepted decisions/events | project projection, milestones | хранить конструкцию изделия внутри проекта |
| Garment Engine | Garment Definition и Artifact identity | requirements, design decisions, observations | design versions, twin alignment | считать фото конструкцией |
| Decision Engine | Decision Case и Decision Record | options, constraints, evidence, risk | accepted/declined/deferred decision | придумывать варианты вместо planners |
| Technology Planner | Technology Plan candidates | garment, material/tool constraints, knowledge | alternatives, prerequisites, checkpoints | выбирать вариант без критериев |
| Material Engine | material/tool/specimen truth | labels, measurements, tests, requirements | compatibility and allocation candidates | гарантировать поведение по бренду |
| Pattern Engine | formal Pattern Model | released design/plan/material assumptions | executable pattern versions and views | использовать prose как единственный SoT |
| Computer Vision Engine | observations from evidence assets | photo/video + observation request | atomic observations and quality limits | ставить окончательный диагноз |
| Memory Engine | retention, recall, provenance, consent policy | facts/events from owning contexts | scoped recall packages | становиться владельцем чужих фактов |
| Recommendation Engine | next-interaction recommendation | current projections, allowed actions | candidate next act | менять предметную истину |
| Verification Engine | criteria, evidence sets, verdicts | expected vs observed | pass/fail/indeterminate/deviation | считать отсутствие дефекта доказательством качества |
| Confidence Engine | claim assessments | evidence, conflicts, consequence | practical confidence and missing evidence | давать одно число на ответ |
| Explanation Engine | explanation artifacts | decision rationale, learning/context | audience-adapted explanation | создавать новые доменные факты |

## 3. Intent Engine

### Ответственность

Выяснить, какой результат требуется от текущего взаимодействия. Intent — версия рабочей гипотезы, а не постоянное свойство User и не маршрут продукта.

### Обязательные различия

- слова пользователя;
- интерпретированная цель;
- возможные конкурирующие цели;
- степень подтверждения;
- критерий завершения текущего обращения.

### Независимость

Полностью независим от Learning State и Recommendation. Он может использовать их контекст, но не должен подгонять Intent под доступные сценарии.

### Пересмотр текущего решения

Intent обязателен до доменного действия, но Safety Gate и восстановление активного объекта могут предшествовать окончательной классификации.

## 4. User State Engine

### Предлагаемое переименование

`Interaction Situation Engine`, потому что «состояние пользователя» создаёт ложное впечатление владения психологическим или проектным статусом.

### Ответственность

Описывать ситуацию текущего обращения: exploring, planning, executing, diagnosing, verifying, recovering, closing. Это вычисляемая проекция, а не долгоживущий агрегат.

### Не включает

- Project Lifecycle State;
- Workpiece Lifecycle State;
- Learning State;
- эмоцию как достоверный диагноз.

## 5. Learning State Engine

### Ответственность

Поддерживать доказательную модель способностей по конкретному Skill и условиям выполнения.

### Source of Truth

Learning Evidence Ledger: демонстрация, проверенный результат, самообъяснение, повторяющаяся ошибка, самостоятельное исправление.

### Вывод

Learning State — временная проекция вида «skill X подтверждён при условиях Y, на основании E, актуальность Z». Общего уровня пользователя нет.

### Полная независимость

Learning State не должен жить внутри Project: один Project даёт evidence, но не владеет выводом.

## 6. Project Engine

### Ответственность

Управлять обязательством создать, исследовать, исправить или проверить результат в заданных границах.

### Владеет

Project Goal, scope, status, participants, constraints, linked artifacts, milestones, unresolved issues, project event journal.

### Не владеет

Garment Definition, Pattern, material knowledge, пользовательскими навыками.

### Почему независим

Один дизайн можно изготовить несколько раз; один проект может включать specimen, prototype и final artifact; физическое изделие может продолжить жизнь после закрытия Project.

## 7. Garment Engine

### Ответственность

Удерживать идентичность изделия и различать замысел, проектную спецификацию и физические экземпляры.

### Внутренние подобласти

- Garment Design: требования и as-designed;
- Garment Artifact: экземпляры и компоненты;
- Twin Alignment: known gaps между designed/planned/built.

### Инвариант

Ни одно изображение, Pattern или Artifact не заменяет Garment Definition. Они связаны, но имеют разные жизненные циклы.

## 8. Decision Engine

### Ответственность

Разрешать Decision Case по явным Options, Criteria, Constraints, Evidence, risk и trade-offs.

### Decision Record содержит

что решалось; доступные варианты; выбранный/отклонённый вариант; основания; assumptions; ожидаемые последствия; затрагиваемые версии; actor; момент принятия; условия пересмотра.

### Неизменяемость

Принятое решение не редактируется. Новое решение supersedes прежнее.

### SOLID-граница

Decision Engine оценивает варианты, но не генерирует технологию, материалы или Pattern. Это предотвращает зависимость всего домена от одного «всезнающего» двигателя.

## 9. Technology Planner

### Ответственность

Создавать технологически допустимые планы изготовления и альтернативы.

### План описывает

операции, зависимости, preconditions, reversibility, required skills, material/tool constraints, intermediate states, checkpoints, failure modes, expected outcomes.

### Отличие от Pattern

Technology Plan отвечает «какой принципиальный способ и почему»; Pattern — «какие конкретные операции и параметры выполнить для этой версии изделия».

## 10. Material Engine

### Ответственность

Связывать design/technology requirements с фактическими материалами, инструментами и результатами specimens.

### Критические различия

- Material Type — класс материала;
- Material Product — коммерческое наименование;
- Material Lot — конкретная партия в руках пользователя;
- Material Allocation — сколько этой партии выделено Artifact;
- Specimen — физическая проба при конкретной Tool Configuration и обработке.

### Инвариант

Совместимость товара не равна совместимости партии, а заявленная плотность не равна фактической плотности пользователя.

## 11. Pattern Engine

### Ответственность

Создавать, импортировать, нормализовать, проверять и версионировать формальную модель исполнения.

### Формальная модель должна содержать

operation graph; stitch/count expressions; dimensions; repeats; dependencies; conditions; size parameters; checkpoints; expected component state; provenance; applicability; known limitations.

### Представления

Текст, chart, animation, beginner explanation, professional notation и accessibility view компилируются из одной модели. Они не расходятся по смыслу.

## 12. Computer Vision Engine

### Ответственность

Отвечать только на наблюдательные вопросы: что видно, где, с каким качеством и какие интерпретации допускает изображение.

### Pipeline понятий

Evidence Asset → Capture Quality Assessment → Observation Request → Detected Feature → Observation → Alternative Interpretation.

### Запрет

CV не создаёт Mistake, не обновляет Skill и не переводит Workpiece самостоятельно. Эти действия принадлежат Verification, Learning и Execution.

## 13. Memory Engine

### Ответственность

Реализовать политику запоминания и извлечения, а не стать универсальным хранилищем.

### Модель

Каждый Memory Entry является ссылкой на факт в owning context и имеет purpose, scope, provenance, confirmation, sensitivity, retention, staleness и consent.

### Независимость

Memory может быть заменён без потери доменной истины. Если удаление Memory уничтожает Project History, архитектура нарушена.

## 14. Recommendation Engine

### Ответственность

Определить, какое взаимодействие сейчас принесёт лучший безопасный прогресс: действие, вопрос, проверка, объяснение, альтернатива, остановка или обращение к человеку.

### Входы

Intent, projections, allowed transitions, Decision Records, confidence, risk, Learning State, attention/time constraints.

### Выход

Next Interaction Candidate с целью и expected evidence. Он не является Technology Decision или Pattern Step сам по себе.

## 15. Verification Engine

### Ответственность

Сопоставлять конкретный ожидаемый Claim/criterion с admissible evidence.

### Verdict

`CONFIRMED`, `REJECTED`, `INDETERMINATE`, `ACCEPTED_DEVIATION`. Бинарное «правильно/неправильно» недостаточно.

### Независимость

Criteria принадлежат проверяемой версии design/plan/pattern, а Verdict — Verification context. Это позволяет повторить проверку новым методом без переписывания Artifact.

## 16. Confidence Engine

### Ответственность

Оценивать практическую надёжность одного Claim с учётом качества, независимости и противоречий Evidence, а также Consequence Class.

### Выход не сводится к числу

- supported/unsupported/contested/unknown;
- на чём основано;
- что неизвестно;
- цена ошибки;
- какое evidence изменит решение;
- какое действие разрешено.

## 17. Explanation Engine

### Ответственность

Создать понятное представление уже принятого решения, сохранив точность и traceability.

### Адаптация

Язык, глубина, порядок, модальность, ведущая рука, терминология и когнитивная нагрузка. Нельзя адаптировать факты, риски или обязательные предупреждения.

## 18. Полностью независимые подсистемы

Независимость владения обязательна для:

- User/Consent и Learning;
- Project и Garment;
- Garment Design и Garment Artifact/Execution;
- Technology Planning и Pattern;
- Vision Observation и Verification;
- Decision и Explanation;
- Confidence/Evidence и Recommendation;
- Knowledge/Provenance и generative models.

## 19. Подсистемы, которые можно объединить в MVP

Физически, но не концептуально, MVP может объединить:

- Interaction + Intent + Recommendation;
- Project + Execution projection;
- Decision + Confidence policy;
- Technology + Pattern для строго ограниченного каталога;
- Vision capture + observation.

Граница сохраняется через отдельный словарь, владельца инвариантов и запрет прямого изменения чужих фактов.

