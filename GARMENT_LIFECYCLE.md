# YarnAI — жизненный цикл изделия

Статус: **PROPOSAL FOR DISCUSSION**. Термин Garment используется как кандидат на замену неоднозначного Item.

## 1. Является ли изделие самостоятельной сущностью?

Да, но требуется две самостоятельные сущности:

- **Garment Definition** — воспроизводимый проект того, каким изделие должно быть;
- **Garment Artifact** — конкретная физическая вещь.

Без этого нельзя корректно поддержать прототип, два изготовления одной модели, замену материала, ремонт готовой вещи или сравнение ожидания с результатом.

## 2. Lifecycle Garment Definition

### Concept

Существуют Design Intent, references и неизвестные. Нет обещания manufacturability.

### Requirements Defined

Зафиксированы назначение, размеры/fit, critical features, constraints, allowed deviations и verification intents.

### Candidate Design

Создана структурная модель components/dimensions/features. Возможны несколько вариантов.

### Design Baseline

Пользователь/ответственный actor утвердил конкретную version как основу planning. Референс и render не являются baseline.

### Manufacturability Assessed

Проверена реализуемость доступными технологиями, material/tool constraints и supported knowledge.

### Released

Definition пригодна для создания Technology Plan/Pattern с явной областью применимости.

### Superseded

Новая version заменила прежнюю для будущих Artifact. Старые Artifact сохраняют ссылку на свою version.

### Retired

Не рекомендуется для нового изготовления, но lineage и прошлые изделия сохраняются.

## 3. Lifecycle Garment Artifact

### Proposed

Запланирован физический экземпляр с purpose: specimen, prototype, wearable final, gift, repair target.

### Materialized

Материал выделен и начато физическое создание. Artifact получает постоянную identity.

### In Progress

Создаются Components; Workpiece State меняется через execution events.

### Deviated

Наблюдаемое состояние расходится с active plan/design или неизвестно. Это не всегда defect.

### Under Remediation

Выполняется approved remediation с собственными checkpoints.

### Assembled

Основные components соединены; финальная обработка и verification ещё могут быть не выполнены.

### Finished

Все planned finishing operations выполнены. Это ещё не Verified Complete.

### Verified Complete

Пройден final verification по конкретной criteria version, deviations приняты, intended use подтверждён в допустимой степени.

### In Use

Изделие носится/используется; могут появляться care observations, wear и repairs.

### Altered / Repaired

Новая физическая configuration имеет lineage с исходным Artifact и отдельным Project/decisions.

### Retired / Deconstructed

Изделие больше не используется или разобрано; материалы могут получить новую lineage.

## 4. Digital Twin

Digital Twin — не одна сущность и не 3D-модель. Это traceable композиция:

### As-Designed

Definition version, requirements, dimensions, structure, visual/tactile target и acceptance criteria.

### As-Planned

Technology Plan, Pattern, material allocations, tools, operation states, checkpoints и assumptions.

### As-Built

Artifact identity, component tree, execution events, measurements, accepted observations, deviations и repairs.

### Alignment Model

Для каждого критичного свойства показывает:

- target;
- planned realization;
- observed value/state;
- evidence and uncertainty;
- deviation classification;
- required decision.

## 5. Как связать цепочку

```text
Reference / conversation
  → Design Intent
  → Requirements
  → Garment Definition baseline
  → Technology Plan decision
  → Material/Tool plan + Specimen evidence
  → Pattern Model release
  → Artifact + Execution Events
  → Checkpoint Observations
  → Verification / Deviations / Remediation
  → Final Acceptance
  → In-use learning and future lineage
```

Каждая стрелка создаёт versioned trace link. Нельзя перескочить от Sketch напрямую к Pattern без requirements и assumptions.

## 6. Как изделие изменяется во времени

Изменяется не «одна запись Item», а:

- Definition получает новую version;
- Artifact получает execution event;
- observed property уточняется evidence;
- Deviation принимается или исправляется;
- Artifact может сменить lifecycle state;
- ремонт/переделка создаёт новую configuration и lineage.

История не переписывается. Фраза «теперь рукав короче» должна означать либо новую design version, либо observed deviation, либо approved alteration — это три разных факта.

## 7. Completion

Предлагается разделить:

- Process Complete — операции закончены;
- Verified Complete — критерии проверены;
- User Accepted — пользователь принял результат;
- Fit for Intended Use — подтверждена пригодность в согласованных границах.

Project completion policy может требовать комбинацию этих verdicts. D-003 следует закрывать на этой основе, а не одним полем `completed`.

## 8. Эскиз

Sketch/Reference/Render — Evidence Asset и presentation Design Intent. Он не является Garment Definition, не доказывает Technology и не может быть единственным критерием сходства.

## 9. Особые сущности вязания

- Swatch/Specimen как полноценный Artifact subtype;
- Gauge Observation до и после обработки;
- Yarn Lot и Dye Lot;
- Needle/Tool Configuration;
- Stitch Structure/Repeat;
- Component Live State: live stitches, held stitches, bound edges;
- Blocking/Finishing State;
- reversible vs destructive actions.

Они должны быть craft extensions общей платформы, а не полями универсального Project.

