# YarnAI — Skill Graph вязания спицами

Статус: **PROPOSAL FOR DISCUSSION**  

> Это граф зависимостей, а не лестница уровней. Навык может быть обязательным для одного изделия и необязательным для другого. Полный граф не должен показываться пользователю одновременно.

## 1. Правила Skill Graph

Каждый Skill должен иметь:

- наблюдаемый outcome;
- prerequisites;
- условия применения;
- типичные ошибки;
- критерии допустимого качества;
- evidence для освоения;
- risk/consequence;
- варианты ведущей руки и инструмента;
- связи transfer;
- relevance для типов проектов.

## 2. Типы обязательности

### Universal safety core

Нужен почти для любого самостоятельного проекта:

- остановиться без потери работы;
- определить ориентацию и рабочую сторону;
- считать элементы/ряды выбранным способом;
- прочитать ближайшую операцию;
- сравнить outcome с checkpoint;
- запросить помощь до необратимого действия;
- сохранить место продолжения.

### Project-required

Обязателен только для конкретного Pattern/Technology: вязание по кругу, убавки, cable, colorwork, сборка.

### Optional enrichment

Улучшает вариативность или эстетику, но не требуется для результата: декоративная кромка, alternative cast-on, advanced finishing.

### Professional-required

Не нужен домашнему maker, но обязателен для профессиональной роли: grading, tech editing, costing, test protocol.

## 3. Верхнеуровневый граф

```text
Orientation & Work Control
  ├─ Tool/Material Literacy
  ├─ Motor Foundations
  │    └─ Fabric Formation
  │         ├─ Shaping
  │         ├─ Texture/Color specializations
  │         └─ Construction & Finishing
  ├─ Fabric Reading & Error Detection
  │    └─ Recovery & Repair
  ├─ Pattern Literacy & Quantitative Reasoning
  │    └─ Project Planning
  └─ Self-Regulation

Design Practice
  ← Fabric Reading + Pattern Literacy + Materials + Construction + Planning

Professional Practice
  ← reliable transfer across chosen specialization + quality/documentation/business skills
```

## 4. S0 — Orientation and Work Control

### S0.1 Identify the active project and component

Различать, над какой вещью/деталью ведётся работа. Обязателен для нескольких WIP.

### S0.2 Orient the work

Определять рабочую сторону, направление ряда/круга, положение первой/последней петли.

### S0.3 Hold/pause work safely

Остановиться, убрать работу, перенести/удержать петли и вернуться без потери состояния.

### S0.4 Track position

Отмечать текущую операцию, repeat, row/round и checkpoint структурно.

### S0.5 Recognize irreversible actions

Распознавать обрезание нити, закрепление, соединение, steek/разрез и необратимую обработку.

## 5. S1 — Tools and Materials Literacy

### S1.1 Identify tools

Тип, размер, длина, совместимость спиц и вспомогательных инструментов.

### S1.2 Read yarn information

Состав, масса/метраж, рекомендуемый диапазон, уход, партия; понимать, что этикетка не гарантирует outcome.

### S1.3 Handle yarn

Найти рабочий конец, размотать без повреждения, соединить новый моток подходящим способом.

### S1.4 Build a specimen

Связать репрезентативный образец, дать ему нужную обработку, измерить без искажения.

### S1.5 Reason about material substitution

Сравнить не только «толщину», но состав, структуру, упругость, drape, care и фактический gauge.

Зависимости: S1.1–S1.3 перед первым изделием; S1.4 перед size-sensitive проектом; S1.5 — для substitutions/design.

## 6. S2 — Motor Foundations

### S2.1 Form a stable starting structure

Набрать петли выбранным способом без критического перекручивания/затягивания.

### S2.2 Knit stitch

Выполнить лицевую петлю с корректной orientation и стабильным fabric outcome.

### S2.3 Purl stitch

Выполнить изнаночную петлю, различать side/orientation.

### S2.4 Manage working tension

Поддерживать функционально достаточную, а не «идеально одинаковую» плотность; распознавать влияние позы, захвата и пауз.

### S2.5 Turn and continue rows

Корректно завершить и начать ряд без accidental increases.

### S2.6 Bind off / secure live structure

Закрыть петли с требуемой эластичностью и не потерять элементы.

Зависимости: S2.1 → S2.2; S2.2 → S2.5; S2.2 + S2.3 → большинство textures; S2.4 развивается вместе с практикой, но не является gate «идеальной ровности».

## 7. S3 — Fabric Reading and Counting

### S3.1 Identify knit/purl structure

Видеть V/бугорок и различать петлю на спице от уже провязанной структуры.

### S3.2 Count stitches and rows

Считать по ткани и на инструменте, использовать markers и контрольные суммы.

### S3.3 Read stitch orientation

Определять переднюю/заднюю стенку и перекрученную петлю в применимом контексте.

### S3.4 Locate last confirmed correct state

Находить участок, где работа ещё соответствовала ожидаемому.

### S3.5 Distinguish variation from deviation

Различать косметическую неровность, material behavior и конструктивную проблему.

S3 развивается параллельно S2 и не должен откладываться «до сложных проектов». Это ядро самостоятельности.

## 8. S4 — Pattern and Symbol Literacy

### S4.1 Read materials, size and gauge sections

### S4.2 Decode abbreviations and operation syntax

### S4.3 Follow row/round instructions

### S4.4 Execute repeats and nested conditions

### S4.5 Select one size across interleaved values

### S4.6 Relate written instructions, chart and fabric

### S4.7 Handle simultaneous instructions

### S4.8 Detect inconsistency or missing information

Зависимости: S4.2 + S3.1 перед самостоятельным чтением; S4.4 требует уверенного tracking S0.4; S4.8 требует количественного reasoning и fabric reading.

## 9. S5 — Shaping and Fabric Control

### S5.1 Increase

Выбрать/выполнить указанную прибавку и распознать направление/визуальный эффект.

### S5.2 Decrease

Выполнить и проверить orientation, count и shape effect.

### S5.3 Maintain edge structures

### S5.4 Work flat vs in the round

### S5.5 Join and separate sections

### S5.6 Hold and resume live stitches

### S5.7 Short rows / localized shaping

S5.1–S5.2 требуют S2 + S3.2; S5.4 требует S0.2; S5.7 — advanced project-specific.

## 10. S6 — Recovery and Repair

### S6.1 Undo one or several stitches safely (tink)

### S6.2 Rip back to a controlled point (frog)

### S6.3 Recover a dropped stitch in supported structures

### S6.4 Correct an extra/missing stitch when appropriate

### S6.5 Use lifelines/markers/preventive controls

### S6.6 Decide repair vs accept deviation vs rebuild

### S6.7 Verify after remediation

S6 зависит от S3 и должен преподаваться рано в безопасной форме. Пользователь, который может исправлять, меньше боится ошибаться.

## 11. S7 — Construction and Finishing

### S7.1 Understand component topology

### S7.2 Pick up stitches

### S7.3 Join/seam components

### S7.4 Weave and secure ends

### S7.5 Block/finish according to material

### S7.6 Check dimensions and intended use

### S7.7 Care, repair and alteration

Зависимости зависят от конструкции. S7.4–S7.6 обязательны для honest completion, даже если моторно просты.

## 12. S8 — Texture and Color Specializations

- ribbing and reversible structures;
- lace/yarn overs;
- cables;
- stranded colorwork and floats;
- intarsia;
- slipped-stitch/mosaic;
- brioche/double knitting;
- specialty fibers and structures.

Это ветви, а не следующая «ступень». Пользователь выбирает их по Intent и эстетике.

## 13. S9 — Project Planning and Self-Regulation

### S9.1 Define intended result and constraints

### S9.2 Estimate time/material uncertainty

### S9.3 Break work into checkpoints

### S9.4 Maintain project state and notes

### S9.5 Monitor fatigue/attention and pause safely

### S9.6 Request the right kind of help

### S9.7 Reflect and transfer lessons

Эти Skills не должны считаться «soft extras»: они напрямую связаны с completion.

## 14. S10 — Design Practice

### S10.1 Translate inspiration into requirements

### S10.2 Analyze construction alternatives

### S10.3 Use specimen evidence

### S10.4 Calculate dimensions/counts/repeats

### S10.5 Prototype and evaluate

### S10.6 Make controlled modifications

### S10.7 Document an executable Pattern

### S10.8 Define acceptance criteria

### S10.9 Validate/test and revise

Design requires a portfolio of dependencies, но не обязательно mastery всех decorative techniques.

## 15. S11 — Teaching and Facilitation

- model an action visibly;
- identify critical cue;
- choose scaffold;
- give autonomy-supportive choices;
- adjust feedback frequency;
- distinguish child’s work from adult correction;
- assess without shaming;
- support reflection and independence;
- maintain physical/tool safety.

## 16. S12 — Professional Practice

### Maker/Seller branch

Quality repeatability, production timing, costing, inventory, customer requirements, care information, repair/returns.

### Designer/Pattern Author branch

Requirements, construction, grading, notation, testing, revision, accessibility, provenance and licensing.

### Tech Editor/Test Knitter branch

Independent verification, arithmetic, ambiguity detection, issue reporting, version control and evidence.

### Teacher branch

Facilitation Skills, learner safety, differentiation, feedback, boundaries and safeguarding for children.

Профессионализм — не верх одной лестницы, а доказанная надёжность в выбранной роли.

## 17. Как проверить граф

Для каждого реального Pattern команда должна построить skill envelope и проверить:

1. нет ли скрытого prerequisite;
2. можно ли наблюдать outcome;
3. что является critical vs cosmetic;
4. где нужен checkpoint;
5. какой Skill переносится в следующий проект;
6. какая поддержка должна исчезнуть;
7. не назван ли compound capability одним Skill.

