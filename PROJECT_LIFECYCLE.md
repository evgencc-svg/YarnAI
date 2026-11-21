# YarnAI — жизненный цикл проекта

Статус: **PROPOSAL FOR DISCUSSION**. Состояния не утверждены командой.

## 1. Project — не изделие

Project — ограниченное во времени обязательство достичь результата, проверить гипотезу, изготовить/исправить Artifact или осознанно остановиться. Project управляет scope, decisions и progress. Физическое изделие имеет отдельный lifecycle.

## 2. Предлагаемые состояния Project

### 2.1. Captured

Обращение связано с возможным долгоживущим результатом. Зафиксированы исходная формулировка и provenance, но обязательство ещё не принято.

### 2.2. Framed

Определены Project Goal, scope, владелец, активный craft, ограничения и критерий следующего решения. Intent текущей сессии может меняться, Goal стабильнее.

### 2.3. Feasibility Assessment

Проверяются достаточность данных, IP/provenance, риски, поддерживаемость, материалы, инструменты, skill gaps и возможность верификации.

Выходы: feasible, feasible-with-assumptions, needs-evidence, unsupported, declined.

### 2.4. Designed

Существует согласованная Garment Definition baseline с requirements и acceptance criteria. Эскиз сам по себе не переводит Project в это состояние.

### 2.5. Planned

Приняты Technology Plan, material/tool plan, checkpoints и способ проверки. Все критичные assumptions видимы.

### 2.6. Ready for Execution

Выпущена применимая Pattern version; выделены материалы; создан Artifact; выполнены preflight checks и specimen decisions.

### 2.7. In Execution

Есть подтверждённые execution events и active Workpiece. Project может переходить во внутренние режимы progressing, waiting, diagnosing, remediating, verifying без смены главного lifecycle state.

### 2.8. Blocked

Нет безопасного допустимого действия из-за missing evidence, resource, decision, unsupported case или unresolved deviation. Blocked содержит причину и условие разблокировки, а не только status.

### 2.9. Change Assessment

После изменения цели, материала, размеров, технологии или обнаружения существенного deviation прежняя baseline не применяется автоматически. Создаётся Change Set и impact assessment.

### 2.10. Final Verification

Основные операции закончены; проверяются completion criteria, intended use, dimensions, critical connections, finish и user acceptance.

### 2.11. Completed

Project obligations выполнены. Completion связывается с конкретным Verification Verdict и accepted deviations. Это не означает идеальность Artifact или завершение его дальнейшей жизни.

### 2.12. Stopped

Осознанная остановка без заявленного успеха. Причины: user choice, unsupported, resource loss, risk, obsolete goal. Stopped не маскируется как Completed.

### 2.13. Archived

Project не активен, history и artifacts доступны. Возврат создаёт Resume Assessment; если goal существенно изменён, возможен новый Project с lineage.

## 3. Не линейность

- Designed → Feasibility, если материал недоступен.
- In Execution → Change Assessment при смене размера.
- Final Verification → Remediation/In Execution при дефекте.
- Blocked → любой допустимый этап после получения evidence.
- Completed → новый repair/alteration Project, а не переписывание старого.

## 4. Вход пользователя на любом этапе

Пользователь может начать с уже существующего Workpiece. Тогда платформа создаёт Project в режиме reconstruction:

1. идентифицирует Artifact и цель обращения;
2. фиксирует unknown lineage;
3. восстанавливает только подтверждаемый as-built context;
4. импортирует Pattern/reference как evidence, не как истину;
5. создаёт open assumptions;
6. определяет безопасный следующий Decision Case.

Это сохраняет принцип входа на любом этапе без фиктивного прохождения начальных состояний.

## 5. Критерии переходов

Переход определяется evidence-backed guard, а не намерением UI:

- нельзя стать Designed без baseline/criteria;
- нельзя стать Ready без выпущенного применимого Pattern и preflight;
- нельзя продолжить после critical checkpoint без verdict;
- нельзя стать Completed без final verification или явно принятого exception;
- нельзя снять Blocked без удовлетворения named condition.

## 6. Project Event Journal

Неизменяемые события:

- goal framed/reframed;
- feasibility assessed;
- baseline released;
- plan/pattern released;
- artifact created;
- execution started/paused/resumed;
- checkpoint passed/failed/indeterminate;
- deviation detected/accepted/remediated;
- change requested/approved/rejected;
- project completed/stopped/archived.

`Current Project State` вычисляется из событий и открытых обязательств.

## 7. Progress

Progress не равен проценту рядов. Он многомерный:

- requirement coverage;
- planned operations completed;
- verified outcomes;
- unresolved risk/deviation;
- material commitment;
- learning goal evidence, если оно входит в Project Goal.

Показываемый человеку progress должен объяснять свою основу.

## 8. Change control

Любое изменение после baseline отвечает:

- что изменилось и почему;
- какие requirements затронуты;
- что уже физически изготовлено;
- можно ли сохранить Artifact;
- какие plan/pattern/material/checkpoints устарели;
- нужны ли новые decisions;
- какая baseline теперь активна.

Изменение текста инструкции без Change Set запрещено архитектурно.

## 9. MVP-подмножество

MVP-003 может использовать: Framed → Reconstruction/Feasibility → In Execution or Blocked → Verification → In Execution. Garment design может быть импортирован частично, но unknowns должны оставаться явными.

