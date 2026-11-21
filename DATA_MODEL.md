# YarnAI — концептуальная модель данных предметной области

Статус: **PROPOSAL FOR DISCUSSION**. Это не схема БД, не API и не модель классов.

## 1. Центральное исправление модели

Термин `Item` предлагается вывести из роли универсальной сущности. Он слишком широк и смешивает замысел, спецификацию, процесс и физическую вещь.

Центральная модель:

```text
User
  ├─ Learning Evidence → Learning State
  └─ Project
       ├─ Project Goal / Constraints / Decisions
       ├─ Garment Definition (versioned, as-designed)
       ├─ Technology Plan (versioned, as-planned)
       ├─ Material Plan + Tool Configuration
       ├─ Pattern Model (versioned executable specification)
       └─ Garment Artifact (one or more physical instances)
            ├─ Components / Specimens
            ├─ Execution Events
            ├─ Accepted Observations (as-built)
            ├─ Deviations / Remediation
            └─ Verification Cases / Final Verdict
```

## 2. Aggregate boundaries

### User Aggregate

Идентичность, подтверждённые устойчивые facts, preferences, constraints и consent directives. Не содержит проекты целиком, Learning State или историю чата.

### Project Aggregate

Project Goal, scope, state, linked definition/artifacts, milestones, open decision cases и завершение/остановка. Не содержит внутренние версии Pattern и Garment Definition.

### Garment Definition Aggregate

Самостоятельная проектная сущность, пригодная для повторного изготовления. Владеет Design Requirements, structural composition, target dimensions, visual properties, fit/ease intent, acceptance criteria и baseline versions.

### Garment Artifact Aggregate

Конкретный физический экземпляр. Владеет identity, component tree, observed state, lifecycle, links to exact design/plan/pattern/material versions и accepted deviations.

### Pattern Aggregate

Формальная модель operations, dependencies, parameters, invariants и presentations. Released version неизменяема.

### Material Lot Aggregate

Фактически доступная партия материала, её evidence-backed properties, quantity, allocations и specimens.

### Decision Case Aggregate

Вопрос, варианты, критерии, evidence, risk, resolution и supersession.

### Verification Case Aggregate

Проверяемый claim/criterion, evidence requirements, received evidence, assessments, verdict и remediation link.

## 3. Новые главные сущности

### Project Goal

Определяет ожидаемый outcome проекта, границы, владельца, критерий остановки и relation to user intent. Intent краткоживущий; Project Goal переживает сессии.

### Design Intent

Переводит человеческое желание в проектные свойства: назначение, silhouette, fit, appearance, priorities и допустимые изменения. Не является картинкой.

### Requirement

Атомарное требование с приоритетом, источником, status, verification method и связью с решениями. Например, «обхват готового изделия 102±2 cm» хранится структурно.

### Garment Definition

Версионируемая спецификация типа изделия, его структуры и целевого результата. Может существовать до физического экземпляра и после закрытия проекта.

### Design Baseline

Зафиксированный набор согласованных версий Requirements и Garment Definition, относительно которого измеряется изменение. «Финальный эскиз» без baseline недостаточен.

### Garment Artifact

Конкретная физическая вещь. Один Garment Definition может иметь specimen, prototype, first article и final artifact.

### Workpiece

Текущее производственное состояние Artifact. Это проекция execution events и accepted observations, а не редактируемый текстовый status.

### Component

Физическая или конструктивная часть изделия: body, sleeve, collar, panel, motif. Имеет planned и observed identity. Ошибка может локализоваться в Component, а не «Current Step».

### Specimen

Физический образец, созданный из Material Lot при Tool Configuration и treatment. Содержит измерения до/после обработки и является evidence для gauge/material decisions.

### Technology Plan

Выбранная архитектура изготовления: construction strategy, operation network, prerequisites, skills, checkpoints, reversibility и risks.

### Operation

Доменное действие с preconditions, input state, expected output state, parameters и verification point. Human Step — его presentation, но не сама операция.

### Pattern Model

Параметризованная исполнимая спецификация операций для конкретной design/technology версии.

### Execution Event

Факт физического действия или подтверждённого перехода. Append-only: started, completed, undone, material changed, measurement recorded, deviation accepted.

### Observation

Атомарный факт восприятия: «в области X видно N элементов». Имеет source asset, method, quality, interpretation limits. Observation не равно Diagnosis.

### Claim

Проверяемое утверждение: «число петель соответствует plan», «эта петля перекручена», «компонент достиг длины». Claim связывает Evidence, Confidence и Verdict.

### Evidence

Измерение, accepted observation, document statement, calculation result, domain rule или user confirmation с provenance и областью применимости.

### Assumption

Явное временное допущение с owner, impact, validation plan и expiry. Допущение не маскируется внутри текста.

### Deviation

Разница между planned и observed, классифицированная как defect, acceptable variation, user-approved change или unknown.

### Acceptance Criteria

Версионируемый набор критериев на design, component, checkpoint и final artifact. Должен существовать до проверки.

### Decision Case / Decision Record

Case — открытая развилка; Record — неизменяемый результат. Это устраняет смешение Recommendation и принятого решения.

### Change Set / Impact Assessment

Изменение baseline и вычисленная область влияния: dimensions, materials, operations, Pattern, already-built components, checkpoints и acceptance criteria.

## 4. Ключевые связи

- User владеет Project, но Garment Definition может быть переиспользуемой с явными правами.
- Project может ссылаться на несколько Garment Artifact и Specimen.
- Project имеет одну актуальную Goal version, но историю целей нельзя переписывать.
- Garment Definition имеет много versions и Design Baselines.
- Artifact обязан ссылаться на точные версии Definition, Technology Plan, Pattern и Material Allocation.
- Technology Plan реализует Garment Definition и ограничивается Material/Tool/Skill constraints.
- Pattern Model конкретизирует Technology Plan, но не выбирает технологию.
- Execution Event относится к Artifact/Component и Operation version.
- Observation относится к Evidence Asset и наблюдаемому объекту.
- Verification Case проверяет Claim по Acceptance Criteria и Evidence.
- Deviation связывает expected state и observed state.
- Decision Record изменяет проект только через новый Change Set/version.
- Learning Evidence может ссылаться на Verification Result, но Project не владеет Learning State.

## 5. Что должно храниться внутри Garment Definition

- назначение и тип;
- design intent и priorities;
- component topology;
- target dimensions, ease и tolerances;
- size/fit context;
- visual and tactile properties;
- structural requirements;
- functional requirements;
- critical features из референса;
- допускаемые вариации;
- acceptance criteria;
- provenance и IP constraints;
- baseline and change history.

Не должны находиться внутри Definition: progress пользователя, фото процесса, Learning State, conversational history и фактическая партия пряжи.

## 6. Что должно храниться внутри Garment Artifact

- identity и purpose (specimen/prototype/final/rework);
- exact source versions;
- component instances;
- material allocations и фактические substitutions;
- execution event history;
- measurements and accepted observations;
- deviations and repairs;
- verification verdicts;
- completion/use/maintenance status;
- lineage, если Artifact переделан из другого.

## 7. Что является производным

- Current Step — проекция Operation/Execution Event, а не master field;
- Progress — проекция выполненных и подтверждённых outcomes;
- Project State — проекция lifecycle events/open obligations;
- Workpiece State — проекция Artifact events and observations;
- User Interaction State — проекция текущего обращения;
- Learning State — проекция evidence ledger;
- Confidence — assessment Claim при текущем evidence set;
- Digital Twin view — композиция трёх независимых truths.

## 8. Запрещённые универсальные сущности

Следует избегать:

- `Context` как одного JSON/текста обо всём;
- `Memory` как копии фактов без владельца;
- `State` без указания автомата;
- `Item` без различения Definition/Artifact;
- `Result` без критерия и evidence;
- `Confidence Score` без Claim и consequence;
- `Recommendation` как контейнера принятого решения;
- `Pattern Text` как единственной модели изготовления.

## 9. Traceability chain

Каждая критичная операция должна быть прослеживаема:

`User statement → Intent/Project Goal → Requirement → Design Decision → Garment Definition version → Technology Decision → Operation/Pattern version → Execution Event → Observation/Evidence → Verification Verdict → Final Acceptance`.

Разрыв цепочки означает, что система не может обосновать обещание результата.

