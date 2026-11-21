# YarnAI — архитектура памяти

Статус: **PROPOSAL FOR DISCUSSION**. Документ не утверждает политику хранения или реализацию.

## 1. Главный принцип

Memory Engine не должен быть Source of Truth. Память — управляемая способность найти релевантный факт у его владельца, объяснить происхождение и решить, допустимо ли применить его сейчас.

Если «память» удалить, доменные факты, проектная история и изделие не должны исчезнуть. Исчезнуть может только удобный индекс, персонализация или разрешённый перенос контекста.

## 2. Четыре независимых вида памяти

### 2.1. User Memory

Устойчивые факты, применимые вне одного проекта:

- ведущая рука и accessibility needs;
- подтверждённые предпочтения формата объяснения;
- долговременные ограничения, сообщённые пользователем;
- собственные инструменты/материалы, если пользователь разрешил;
- consent and retention choices.

Не хранит общий «уровень», эмоциональные ярлыки или выводы модели без evidence.

### 2.2. Learning Memory

Evidence Ledger по конкретным Skills:

- что наблюдалось;
- в каких условиях;
- кем/как проверено;
- что это поддерживает;
- срок актуальности;
- противоречащие свидетельства.

Learning State вычисляется из ledger и не копируется в User profile как вечный факт.

### 2.3. Project Memory

Память о работе и решениях:

- Project Goal versions;
- decisions and assumptions;
- selected baselines;
- unresolved issues;
- execution and verification history;
- place to resume, вычисленное из подтверждённых events;
- причины substitutions, rollback и остановки.

Project Memory принадлежит Project History, а не разговору.

### 2.4. Garment Memory

Память самого изделия:

- lineage design/plans/patterns/materials;
- component and artifact history;
- measurements and accepted observations;
- deviations, repairs, finishing, care and later alterations;
- final verification and actual outcome.

Она переживает закрытие Project: готовую вещь можно ремонтировать, переделывать или повторять.

## 3. Дополнительные слои

### Interaction Memory

Краткоживущая память текущего разговора: unresolved references, working intent hypotheses, questions asked. Она не переносится автоматически между проектами.

### Knowledge Memory

Версионированные доменные утверждения с источниками, лицензиями и областью применимости. Это общая knowledge base, не персональная память.

### Decision Memory

Неизменяемые Decision Records. Объяснение решения может быть создано заново, но исходные options/evidence/constraints сохраняются.

## 4. Memory Entry

Каждая запоминаемая ссылка должна иметь:

- owner context;
- subject;
- purpose;
- scope (session/project/user/garment/global);
- source/provenance;
- status: asserted, confirmed, inferred, contested, superseded;
- confidence/limitations, если это claim;
- sensitivity;
- consent basis;
- retention and expiry;
- freshness/staleness rule;
- correction history;
- allowed consumers.

Фраза «пользователь предпочитает короткие ответы» без источника, области и возможности исправить — невалидная память.

## 5. Запись памяти

### Автоматически допустимо

- индексировать подтверждённый domain event;
- фиксировать provenance;
- создать candidate memory entry;
- вычислить staleness;
- связать evidence с существующим claim.

### Требует подтверждения или явной политики

- перенос личного факта между проектами;
- долгосрочное сохранение предпочтения;
- вывод о навыке;
- сохранение чувствительного ограничения;
- изменение значения, сообщённого пользователем;
- использование проекта как training/benchmark evidence.

### Никогда автоматически

- психологический диагноз;
- общий skill label;
- предположение о бюджете/возрасте/физических возможностях;
- вывод о причинности из корреляции;
- перенос accepted deviation одного изделия на другое.

## 6. Извлечение памяти

Recall должен отвечать не «что похоже по тексту», а:

1. какой объект сейчас активен;
2. какая цель запроса;
3. кто владелец факта;
4. действует ли он для этой версии/техники/материала;
5. не superseded ли он;
6. разрешено ли его использовать;
7. нужно ли подтвердить актуальность;
8. какое решение он может изменить.

Векторная близость допустима только как поиск кандидата, но не как основание истинности.

## 7. Конфликт и устаревание

- Новый факт не затирает старый; создаётся contradiction/supersession link.
- Проектный факт имеет приоритет только внутри своего scope.
- Фактическое измерение Artifact не переписывает Design target; появляется Deviation.
- Последняя реплика не всегда сильнее проверенного evidence.
- Пользователь может исправить факт; correction сохраняет audit trail.
- Навык и предпочтение имеют разные правила устаревания.

## 8. Resume after a week

Возобновление должно строиться из:

- active Project Goal and baseline;
- exact Artifact/Component;
- last confirmed Execution Event;
- open Checkpoint/Decision/Deviation;
- materials/tools currently allocated;
- last unresolved uncertainty;
- short human-readable recap generated from these facts.

Нельзя хранить «пользователь на 17-м ряду» как единственный текст. Должны существовать Operation identity, component, repeat/iteration, counts и confirmation status.

## 9. Несколько проектов

Каждый Project изолирован. User Memory и Learning Evidence могут быть общими, но Project facts не смешиваются. Перед применением прошлого опыта система должна проверить technique/material/tool context.

## 10. Privacy и agency как предметные свойства

Пользователь должен иметь возможность:

- видеть, что система считает известным;
- видеть источник вывода;
- исправить факт;
- запретить перенос между проектами;
- удалить персональную память, не разрушая экспортируемую историю проекта;
- отделить личный проект от reusable Garment Definition;
- управлять использованием media/evidence.

## 11. Архитектурные анти-паттерны

- transcript-as-memory;
- один summary, переписываемый после каждой сессии;
- embeddings-as-truth;
- профиль User с полем `level`;
- копирование Project History в «long-term memory»;
- память без provenance;
- перенос контекста по умолчанию;
- сохранение model inference как подтверждённого факта;
- бесконечное хранение фото без purpose/consent.

## 12. MVP-подмножество

Для MVP достаточно:

- один User Memory fact: ведущая рука/формат объяснения с consent;
- узкий Skill Evidence Ledger;
- полноценный Project Event Journal;
- один Artifact и component identity;
- immutable Decision/Verification records;
- resume projection;
- пользовательская коррекция памяти.

Нельзя заменять эту основу одним chat summary даже в MVP.

