# YarnAI — эволюция архитектуры на 10 лет

Статус: **PROPOSAL FOR DISCUSSION**. Это архитектурные горизонты, а не roadmap и не обязательства команды.

## 1. Принцип эволюции

Платформа должна расширяться по трём независимым измерениям:

- глубина сопровождения одного craft;
- новые crafts и способы изготовления;
- новые actors: learner, designer, expert reviewer, teacher, manufacturer.

Ядро User–Project–Definition–Plan–Artifact–Evidence–Decision остаётся стабильным. Craft-specific semantics подключаются как расширения, а не поля общего Project.

## 2. Архитектурные горизонты

### Horizon 1 — Trusted Next Step

Цель: доказать MVP-003 для ручного вязания спицами.

Обязательные foundations:

- Project Goal и Artifact identity;
- context reconstruction;
- limited Pattern normalization;
- Decision Case и Confidence Assessment;
- immutable evidence/execution history;
- photo capture guidance and observations;
- checkpoint-based verification;
- resume without transcript dependence.

Не требуется полный генератор изделий.

### Horizon 2 — Verified Project Companion

Цель: сопровождать выбранные типы изделий от preflight до final verification.

Добавляются:

- formal operation model для ограниченных конструкций;
- components and checkpoints;
- material lots/specimens/gauge;
- change impact;
- final acceptance;
- multiple projects;
- robust Learning Evidence.

### Horizon 3 — Co-Design and Digital Twin

Цель: идея → design baseline → technology alternatives → executable Pattern → as-built tracking.

Добавляются:

- structured Design Intent/Requirements;
- Garment Definition versions;
- Technology Planner;
- explainable Decision Cases;
- as-designed/as-planned/as-built alignment;
- design freeze/release;
- version-aware visualization.

### Horizon 4 — Multi-craft Platform

После доказанного knitting core:

- crochet operation/topology extension;
- machine knitting compilation extension;
- sewing pattern/component extension;
- embroidery/macramé только после проверки fit общей модели.

Общими остаются Project, Evidence, Decision, Memory, Verification. Pattern semantics и material mechanics не насильно унифицируются.

### Horizon 5 — Collaborative Making Network

Добавляются roles и accountability:

- designer publishes Definition;
- expert releases Pattern/criteria;
- test maker creates evidence;
- learner executes Artifact;
- reviewer verifies high-risk cases;
- manufacturer consumes released specifications.

Каждый verdict и change имеет actor/provenance.

### Horizon 6 — Outcome Learning Platform

С consent накапливается dataset:

`requirements → plan → material/tool/specimen → process observations → interventions → final outcome`.

Это позволяет улучшать не генерацию текста, а prediction of failure, checkpoint placement, material behavior и completion probability.

## 3. Стабильное ядро

Должно пережить смену AI-моделей, UI и организационной структуры:

- identity and lineage;
- versioning and baseline;
- claims/evidence/provenance;
- decisions and supersession;
- design/plan/built separation;
- Project vs Artifact lifecycle;
- verification and accepted deviation;
- memory ownership/consent;
- craft extension boundary.

## 4. Extension model

Каждый новый craft должен определить:

- vocabulary;
- Definition semantics;
- Component/topology model;
- Operations and constraints;
- Pattern formalism;
- material/tool properties;
- checkpoints and failure modes;
- CV observation capabilities;
- verification criteria;
- supported/unsupported boundary.

Он не изменяет meaning User, Project, Decision Record или Evidence.

## 5. Pattern evolution

### Stage A

Imported Pattern как source document + manually/AI extracted operations with explicit uncertainty.

### Stage B

Normalized operation model для selected constructions; human-readable views generated from it.

### Stage C

Parametric Pattern tied to Garment Definition and Material Specimen; formal invariant verification.

### Stage D

Bidirectional design changes с impact assessment и controlled regeneration.

### Stage E

Interchange format между YarnAI, designers, machines и external tools, сохраняя provenance/licensing.

## 6. Vision evolution

### Stage A

Capture quality and narrow observations.

### Stage B

Checkpoint-specific counting/measurement/anomaly detection.

### Stage C

Multi-view and temporal observations linked to Artifact topology.

### Stage D

Predictive risk: где вероятно накопится deviation, но с human/verification gate.

### Stage E

Continuous optional companion via wearable/stand, только с privacy-by-design и без автоматического переписывания twin.

## 7. Memory evolution

- от project resume к evidence-backed cross-project learning;
- от preferences к user-controlled personal craft profile;
- от transcript retrieval к semantic traceability;
- от passive storage к staleness/conflict management;
- от single user к shared projects with scoped visibility;
- от cloud dependence к portable/exportable project and garment history.

## 8. Decision intelligence evolution

- deterministic policy для high-risk gates;
- knowledge-assisted alternatives;
- user-specific trade-offs without changing facts;
- outcome feedback tied to original Decision Record;
- calibration by consequence class;
- expert escalation marketplace;
- organizational governance for released patterns/designs.

## 9. Что не следует делать заранее

- не строить generic ontology всех ремёсел;
- не выделять каждый Engine в microservice;
- не создавать marketplace до provenance/quality;
- не обещать autonomous design-to-garment;
- не собирать массовый dataset без consent/use case;
- не фиксировать vendor AI model в доменных понятиях;
- не создавать универсальный Pattern DSL до доказанных вертикалей;
- не расширять роли до появления accountability needs.

## 10. Архитектурные fitness functions предметной области

Периодически проверять:

1. Можно ли объяснить происхождение каждого critical recommendation?
2. Можно ли восстановить состояние Project без chat transcript?
3. Можно ли отличить design change от physical deviation?
4. Можно ли повторить verification с новым evidence?
5. Можно ли заменить AI-модель без миграции доменной истины?
6. Может ли один Definition породить два Artifact без копирования истории?
7. Может ли User удалить personal memory, сохранив экспорт Project?
8. Может ли новый craft добавиться без изменения User/Project core?
9. Можно ли определить impact изменения до необратимого действия?
10. Считается ли unsupported/indeterminate нормальным результатом?

## 11. Организационная эволюция

Рекомендуемые владельцы домена со временем:

- Product Interaction/Intent;
- Craft Knowledge and Pattern;
- Garment/Manufacturing;
- Execution/Verification;
- Vision/Evidence;
- User Learning/Memory;
- Trust, Safety, Provenance and Governance.

Организационные границы должны следовать bounded contexts, но ранняя команда может совмещать роли.

## 12. Долгосрочный moat

Moat YarnAI — не доступ к LLM и не каталог изображений. Это проверяемая сеть связей между намерением, design decisions, physical evidence, interventions и завершёнными изделиями. Такой graph становится ценнее с каждым подтверждённым outcome и остаётся переносимым между поколениями моделей.

