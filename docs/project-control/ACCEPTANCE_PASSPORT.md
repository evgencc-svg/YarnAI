# ACCEPTANCE PASSPORT — паспорт приёмки Yarn AI

**Статус:** CURRENT — `GARMENT PHOTO YARN CHARACTERIZATION AND OPTIONS V1` имеет verdict `BLOCKED`
**Проверено:** 2026-09-02
**Контрольный проект:** `Контроль Flax PDF — 20260829T064744Z`, `01a04c4a-769d-7cc8-9d3a-bc8fcbbda06b`

## Приёмка GARMENT PHOTO YARN CHARACTERIZATION AND OPTIONS V1

| Обязательное доказательство | Наблюдение | Статус |
|---|---|---|
| Отдельный strict contract и три варианта | Domain/schema/UI/tests реализованы; thinner/middle/thicker order и units валидируются | `PASS — CODE` |
| Не смешивать evidence и recommendation | Раздельные поля, exact provenance, никаких brand/composition claims | `PASS — CODE` |
| Не автозаполнять yarn/gauge | Existing inputs после real attempt пусты; blockers сохранены | `PASS` |
| Ровно одна платная попытка | YarnAI POST `1`, provider call `1`, retries `0`, `$0.033528 < $0.05` | `PASS` |
| Strict real result | Completed provider response отклонён `HTTP 422`; exact reason `unknown` | `BLOCKED` |
| Persistence/reload/reopen real recommendation | Artifact отсутствует, recommendation count `0` | `BLOCKED` |

**Итог:** `BLOCKED`. Кодовая граница доказана, но обязательный real `GARMENT_YARN_RECOMMENDATION_V1` не существует; без нового owner approval повторный provider request запрещён.

## Правило статусов

- `PROVEN E2E` — полный заявленный маршрут доказан через обычный интерфейс.
- `PARTIAL` — значимая часть работает, но обязательный разрыв остаётся.
- `CODE ONLY` — код и/или тесты существуют, но пользовательский маршрут не доказан.
- `NOT IMPLEMENTED` — пользовательского результата нет.
- `EXTERNAL BLOCKER` — следующая обязательная проверка зависит от внешнего человека или физического действия.

## Evidence matrix — таблица доказательств пяти функций

| Пользовательская задача | Существующая точка входа | Фактически реализованный маршрут | Основные компоненты / contracts | Persistence — что сохраняется | Существующие автоматические тесты | Доказанный live path | Статус | Конкретный пробел | Что требуется для E2E |
|---|---|---|---|---|---|---|---|---|---|
| Фото или идея → план вязания | `/saved-projects` → garment analysis → authoritative garment + yarn profiles → manual intake | Exact confirmed manual decision → `GARMENT_MEASUREMENT_REQUIREMENTS_V1` + `GARMENT_YARN_REQUIREMENTS_V1` → factual draft → deterministic validation; industrial route informational | `garment-reference-analysis*`, `garment-measurement-requirements.js`, `garment-yarn-requirements.js`, `manual-calculation-intake*`, `manual-intake-validation.js` | Analysis, profile-bound intake и validation в existing progress; new store/migration отсутствуют | Garment-photo Node `90/90`; Python UI `4/4`; full Node `54 + 75 + 1997`; full Python `1594 passed, 1 skipped`; build/syntax PASS | Real Scenario A: owner-confirmed `tech_02` → resolved set-in garment/yarn profiles → empty intake → incomplete/ABSTAIN validation → reload/normal reopen exact | Requirements contracts + real Scenario A `PASS`; весь путь до плана `PARTIAL` | Фактические данные, выбор пряжи и расчёт отсутствуют | Отдельно утвердить следующий минимальный блок; не выдумывать и не вводить данные за владельца |

## Приёмка GARMENT PHOTO YARN REQUIREMENTS V1

| Обязательное доказательство | Результат | Статус |
|---|---|---|
| Exact confirmed decision → deterministic yarn profile | Same exact upstream даёт stable profile ID/fingerprint; `seamed_set_in_sleeve` и `top_down_raglan` supported | `PASS` |
| Fail-closed unknown/unconfirmed/mismatch | `unresolved + ABSTAIN + YARN_REQUIREMENTS_UNRESOLVED`; corrupt canonical profile rejected | `PASS` |
| Required имеет downstream consumer | Только identity и explicit positive-integer strand count; derived description не дублирует input | `PASS` |
| Optional/informational не блокируют | Composition/length/mass/quantity optional; weight/color/dye lot/needle range/manual method informational | `PASS` |
| Photo evidence advisory only | Поля не заполняются; exact real result честно сообщает, что сведений о пряже нет | `PASS` |
| Integration и blockers | Удалён только `YARN_REQUIREMENTS_UNRESOLVED`; `YARN_NOT_SELECTED`, garment и gauge/needle blockers unchanged; `incomplete + ABSTAIN`, confirmation disabled | `PASS` |
| Persistence/idempotency | Exact profile/intake/validation IDs и fingerprints stable после reload → «Мои проекты» → exact reopen; counts `1/1`, stale/duplicates `0` | `PASS` |
| User data untouched | Yarn identity, strand count, composition, length, mass и quantity все пусты | `PASS` |
| Security/exclusions | Только ordinary loopback GET; Analysis POST/provider/credential/external network `0`, cost `$0.00`; calculation/Stage 19/21/22 absent | `PASS` |

**Итог:** `PASS` для `GARMENT_YARN_REQUIREMENTS_V1`. Это не выбор или рекомендация пряжи, не расчёт расхода и не полный photo-to-pattern path.

## Приёмка GARMENT PHOTO GARMENT REQUIREMENTS CONTRACT V1

| Обязательное доказательство | Результат | Статус |
|---|---|---|
| Exact confirmed decision → deterministic authoritative profile | Два exact manual names дают stable construction/category/requirements/fingerprint; same input identical | `PASS` |
| Fail-closed unknown/unconfirmed | `unresolved`, `ABSTAIN`, `GARMENT_REQUIREMENTS_UNRESOLVED`, одно first action | `PASS` |
| Input types и levels разделены | BODY / FINISHED GARMENT / FIT / CONSTRUCTION; required / optional / conditional проверяются различно | `PASS` |
| Photo observation не заменяет мерку | Missing user measurement остаётся blocker даже при одноимённом observation | `PASS` |
| Persistence, binding, stale, idempotency | Exact profile/upstream binding survives reload; decision/contract change stale; progress duplicates `0` | `PASS` |
| UI Scenario B | TEST ONLY `:8026`: все garment blockers закрыты, yarn unresolved, `incomplete/ABSTAIN`, confirmation disabled; normal reopen exact | `PASS` |
| UI Scenario A | Real project `01a05c3e-a029-7ca7-a949-b8cf5d27e5b0`: `tech_02` selected/confirmed once; `seamed_set_in_sleeve`; profile `fnv1a32:8caa5190`; empty intake + `incomplete/ABSTAIN`; reload → «Мои проекты» → exact reopen; duplicates/stale `0` | `PASS` |
| Exclusions/security | Analysis POST/provider/credential/network/cost `0`; yarn contract/calculation/PATTERN_ANALYSIS_REVIEW/Stage 19/21/22 absent | `PASS` |

**Итог:** `PASS` для `GARMENT_MEASUREMENT_REQUIREMENTS_V1` и обязательного real Scenario A. После отдельного yarn-requirements блока yarn profile также resolved, но фактические исходные данные отсутствуют; это не PASS расчёта или полного photo-to-pattern пути, validation `incomplete + ABSTAIN`, input confirmation disabled.
| Готовая схема → объяснение и адаптация | `/saved-projects` → exact Flax | Saved project → read-only accepted adaptation → current Stage 22 → «Сохранить инструкцию в PDF» → print page | Stage 20–22 плюс `pattern-execution-export.js`, print HTML/CSS/assistant; `PATTERN_EXECUTION_PLAN_V2` остаётся авторитетным источником | Существующие PDF/blob/project records только читаются; export не создаёт persistence records | Focused Node `8/8`; focused Python `5/5`; full Node `1997/1997`; full Python `1504 passed, 1 skipped`; build/syntax/diff PASS | Обычный маршрут без direct URL; начало/середина/конец и шаги 1, 2, 63, 64, 126, 127 проверены; native print preview открылся; Flax state unchanged | Основной путь `PROVEN E2E`; export `PARTIAL` | Инструмент управления Chrome не читает текст выбранного destination внутри нативного print preview, поэтому «Сохранить как PDF» не подтверждено независимым наблюдением | Евгений видит в оставленном print preview назначение «Сохранить как PDF»; после этого export boundary может получить `PASS` без изменения данных |
| Пошаговое сопровождение во время вязания | Current Stage 22 → «Открыть экран начала вязания» | Session waiting → start → step/checkpoint/progress; отдельный virtual path прошёл 127 шагов | `PATTERN_EXECUTION_SESSION`, virtual dry run, step/checkpoint/progress/completion/result/runtime | Session, receipts, operations/checkpoints; virtual и physical fields раздельны | Session/step/checkpoint/progress/completion/result tests и UI tests | Ordinary route доказан только до human-first pre-start; current virtual rev36 `127/127`; physical `0/127` | `EXTERNAL BLOCKER` — `AWAITING KNITTER` | Нет ни одного фактически выполненного physical step и проверки pause/reload/reopen во время реального вязания | Наталья сама нажимает «Начать вязание», без подсказки выполняет шаги 1–5, получает `140` и `20/50/20/50`, затем проверяются pause/reload/list/reopen |
| Ошибка или проблема → причина и исправление | Техническая цепочка runtime → monitoring → intervention; отдельный feedback route только собирает сообщение | Monitoring строит наблюдения/recommendation; intervention выбирает intent; затем action/evidence/verification/decision/follow-up | `pattern-execution-monitoring*`, `intervention*`, `action*`, `evidence*`, `verification*`, `decision*`, `follow-up*` | Versioned progress records, revisions, fingerprints, quarantine/import gates | Соответствующие Node contract tests и Python UI tests | `NOT PROVEN`; прямые routes и тестовые records не являются ordinary user journey | `CODE ONLY` | Нет понятного входа «у меня проблема», принятой классификации причин и безопасного результата на реальном проекте | Из обычного текущего шага пользователь сообщает наблюдение; Yarn AI отделяет факт от UNKNOWN, объясняет вероятную причину, предлагает безопасное действие и не меняет progress без подтверждения |
| Готовое изделие → продаваемая схема | Пользовательской точки входа нет | Персональная инструкция владельца исходника не входит в этот маршрут; evolution остаётся внутренним административным циклом | `pattern-execution-retrospective*`, `learning*`, `adaptation*`, `pattern-evolution-*` | Versioned internal records в `progress` | Stage 39–52 Node/Python UI tests | Нет; персональный PDF не является sellable artifact | `NOT IMPLEMENTED` | Нет buyer-facing schema, лицензии на распространение, публикации и независимой проверки другим пользователем | Готовое изделие и подтверждённые фактические данные превращаются в читаемую схему; независимый пользователь проходит её, после чего создаётся downloadable sellable artifact |

## Приёмка GARMENT PHOTO MANUAL INTAKE VALIDATION V1

| Обязательное доказательство | Результат | Статус |
|---|---|---|
| Partial draft → `incomplete` + `ABSTAIN` | Missing gauge/needles/yarn структурированы; confirmation disabled | `PASS` |
| Required/recommended/optional разделены | Required блокирует, recommended только warning, optional не влияет на readiness | `PASS` |
| null/numeric/gauge/needle rules deterministic | null не становится 0; nonpositive/fractional counts rejected; `23/12.5/31/14` → `18.4/22.1429`; untreated/mismatch block | `PASS` |
| Photo observation не заменяет calculation input | Только authoritative profile + user/evidence decisions могут закрыть required | `PASS` |
| Unknown domain requirements не угадываются | В real intake garment и yarn profiles resolved exact decision; оба requirements-unresolved отсутствуют, но `YARN_NOT_SELECTED` остаётся; input snapshot не confirmed | `PASS` |
| Explicit confirmation + immutable provenance snapshot | Validation отдельно оставляет snapshot `null`; confirm создаёт exact source revisions/fingerprints; tamper detected | `PASS` |
| Edit/upstream changes → stale/history | Intake edit и explicit reopen сохраняют старый snapshot в append-only history | `PASS` |
| Persistence/idempotency | Один progress record; repeated same input no duplicate; reload и repository reopen exact | `PASS` |
| Production UI scenario A | `:8025` incomplete → blockers/unresolved → disabled confirm → reload → «Мои проекты» → exact reopen | `PASS` |
| Synthetic UI scenario B | TEST ONLY guard → ready → explicit confirm → locked form → reload → «Мои проекты» → confirmed exact values | `PASS` |
| Нет побочных расчётных/внешних действий | Analysis/decision unchanged; POST/provider/credential/network `0`, `$0.00`; PATTERN_ANALYSIS_REVIEW/Stage 21/22 untouched | `PASS` |

## Приёмка GARMENT PHOTO MANUAL KNITTING INTAKE V1

| Обязательное доказательство | Результат | Статус |
|---|---|---|
| Подтверждённые два ручных варианта открывают intake | Exact name allowlist и current decision binding; unit и UI contract tests | `PASS` |
| Неподтверждённый и промышленный варианты не создают intake | Fail-closed errors; точное русское informational message без кнопки | `PASS` |
| Частичный draft, `null` и разделение measurement types | Node assertions для body / finished garment / ease и пустых полей | `PASS` |
| Gauge source отдельно от normalization на 10 см | Source `23/12.5/31/14`; normalized `18.4/22.1429`, оба сохранены | `PASS` |
| Локальные дополнительные фото | Metadata `LOCAL_ONLY`, `sync_policy=NEVER`, `upload_status=LOCAL_ONLY`; fetch calls `0` | `PASS` |
| Exact decision revision и stale history | Снятие подтверждения переводит старый artifact в `stale`, active ID очищается, история остаётся | `PASS` |
| Production UI reload и normal reopen | `:8024`, saved values `48/96/108/12`, yarn, needles, gauge и notes совпали | `PASS` |
| Нет расчёта или внешнего действия | Analysis/provider/credential/external network `0`, cost `$0.00`; Stage 21/22 untouched | `PASS` |

## Точная граница Flax

- Схема → объяснение и адаптация: доказано в обычном интерфейсе.
- Исполнимый план Stage 22 revision `36` и current virtual dry run `127/127`: доказано.
- Historical virtual rev33 `127/127`: только историческое non-physical evidence.
- Физическое сопровождение: `EXTERNAL BLOCKER / AWAITING KNITTER`.
- Physical progress: `0/127`.
- «Начать вязание» не нажималась в этом аудите и ранее оставлена для Натальи.
- После export live acceptance: Stage 21 rev29, Stage 22 rev36/`fnv1a32:c065298e`, current virtual `127/127`, physical session rev130 `0/127` — без изменений.

## Приёмка EXPORT ADAPTED INSTRUCTION V1

### Code evidence

- Export action видим только при `ready` Stage 22; incomplete, missing, stale и invalid состояния fail-closed.
- Read model использует принятый Stage 21, готовый Stage 22 и существующий session status; не вызывает save/ensure и не создаёт новый record.
- Integrity gate требует 127 последовательных шагов, идентичный порядок, уникальные step/source-operation IDs и exact one-to-one coverage.
- В документ не выводятся UUID, revisions, fingerprints, raw keys и исходный Flax PDF.

### Test evidence

- Focused Node: `8/8`.
- Focused Python UI: `5/5`.
- Full Node: `1997/1997`.
- Full Python: `1504 passed, 1 skipped` из `1505`.
- Build, JavaScript syntax, health и `git diff --check`: PASS.
- Chromium PDF: 26 страниц A4, 475,561 bytes; текстовый разбор подтвердил номера `1..127` ровно по одному разу, порядок, статусы и отсутствие print controls/internal terms.

### Live evidence

Пройден ordinary route `/saved-projects` → exact Flax → «Посмотреть принятую адаптацию» → «Вернуться к текущему этапу» → «Сохранить инструкцию в PDF». На print page проверены обязательные разделы, начало/середина/конец и шаги `1`, `2`, `63`, `64`, `126`, `127`. Кнопка печати открыла нативный print preview Chrome, после чего Chrome DevTools Protocol перестал отвечать до закрытия preview — это подтверждает открытие системного окна. Сам текст выбранного назначения внутри native UI инструментом не прочитан.

### Product/legal boundary

Документ предназначен владельцу загруженного исходника и содержит его персональную адаптацию и план Yarn AI. Он не копирует страницы, изображения, схемы, логотипы или вёрстку исходного Flax PDF, не заменяет лицензию и не предназначен для распространения исходного материала. Это не продаваемая схема и не доказательство физического вязания.

**Итог:** `PARTIAL` — code, tests, ordinary route и A4 artifact прошли; для формального `PASS` остаётся одно видимое подтверждение назначения «Сохранить как PDF» в нативном preview.

## Приёмка FULL PROJECT BACKUP + ISOLATED RESTORE VERIFICATION V1

### Acceptance matrix

| Обязательное доказательство | Результат | Статус |
|---|---|---|
| Ordinary `/saved-projects` показывает exact Flax и понятное действие download | Карточка и текст «Включает проект, исходный PDF и связанные файлы» видимы; download создал один файл | `PASS` |
| Backup содержит exact project closure без globals | `819` records из 9 project-owned stores; 7 global stores исключены contract-ом | `PASS` |
| Исходный PDF сохранён byte-for-byte | До/внутри/после technical restore: `2,354,250` bytes, SHA-256 `81838c036136795fb3c45c0a95c0045a5dbf8958de31319bc6d80517bc980fa0` | `PASS` |
| Все binaries перечислены и проверены | PDF и `Описание проекта.txt`; `2` files, `2,354,987` bytes; missing/extra/duplicate закрываются | `PASS` |
| Damaged/wrong checksum/missing blob/unsupported/foreign/canonical/non-empty target fail before write | Focused Node negative scenarios `5/5`; UI contracts покрыты focused Python | `PASS` |
| Exact restore/reload сохраняет identity, records и bindings | Independent executable isolated IndexedDB restore/reopen: project revision `400`, `819` records, Stage 21 rev29, Stage 22 rev36, 127 steps, virtual histories, physical `0/127` | `PASS` как technical evidence |
| Normal Chrome pre-write report → explicit isolated restore → reload/list/reopen | File chooser открылся, но передача локального файла заблокирована Chrome extension (`Not allowed`) | `PARTIAL` |
| Canonical Chrome остаётся без restore/write | Использовались только read-only download и view; restore contract отказывает canonical origin до write; physical control не открывался | `PASS` в границе выполненных действий |

### Exact artifact

- Path: `C:\Users\User\Downloads\Контроль Flax PDF — 20260829T064744Z — полная резервная копия.yarnai-backup.json`.
- Envelope: `195,762,216` bytes.
- Structural SHA-256: `54b3085f86cb6c27a7351cc9246216768dfa64d3ecb736d721d3ac0c505caabc`.
- `04-pattern-source.pdf`: `2,354,250` bytes; SHA-256 `81838c036136795fb3c45c0a95c0045a5dbf8958de31319bc6d80517bc980fa0`.
- `Описание проекта.txt`: `737` bytes; SHA-256 `db9cffed1fc1921c79813ddab906b5fe3fb94d7c0f3e026761c1e74342e68cc6`.

### Test evidence

- Focused Node backup: `5/5`.
- Focused Python UI plus saved-project integration: `15/15`.
- Full Node: `1997/1997`.
- Full Python: `1507 passed, 1 skipped` из `1508`.
- Build, new JavaScript syntax, Python compileall, canonical/isolated health и `git diff --check`: `PASS`.

### Live evidence и точный разрыв

Normal Chrome download доказан. Экран проверки и native file chooser открылись, но расширение управления Chrome не имеет разрешения «Allow access to file URLs», поэтому инструмент не смог передать скачанный файл. Browser-origin restore на `127.0.0.1:8001`, reload/list/reopen, PDF open и steps `1`, `2`, `63`, `64`, `126`, `127` не наблюдались.

Прямая запись в IndexedDB не использовалась: это сохранило честную границу normal UI acceptance. Technical exact restore подтверждает реализуемость и integrity, но не повышает live verdict.

**Итог:** `PARTIAL`.

## Documentation drift — найденное расхождение

1. `PRODUCT_PASSPORT`, `IMPLEMENTATION_PASSPORT` и прежний `ACCEPTANCE_PASSPORT` были датированы 30 августа и объявляли current Stage 21 stale revision `20` / Stage 22 revision `33`. Текущая верхняя граница `PROJECT_STATE` уже подтверждала revision `29` / `36`.
2. `PROJECT_STATE` одновременно содержал current и superseded sections, включая противоречивые `AWAITING USER CHECK`, stale rev33 и нынешний rev36. Это нарушало роль «только текущая правда».
3. Active plan одновременно называл активными уже завершённые cleanup, stale-route и старые rev33 contracts.
4. `SYSTEM_MAP` говорил «без реализации» и «только место подключения», хотя source содержит обычный idea/photo entry, physical execution UI и monitoring/intervention code. Эти функции всё равно не supported: их доказательный статус — `CODE ONLY` или `EXTERNAL BLOCKER`.
5. Стартовый экран обещает «от идеи до готовой вещи», хотя файл прямо «не распознаётся автоматически», а E2E от фото до плана не доказан.
6. Pattern evolution выглядел как возможная готовая схема, но closure прямо запрещает canonical-pattern change, rollout и deployment; sellable artifact отсутствует.
7. `DECISION_LOG` содержал повторный заголовок и дубликат решения о LevelDB в конце.
8. Старые числа тестов в паспортах отставали от последнего существующего evidence; в этом аудите suites не перезапускались.

## Решение владельца и ровно одна следующая граница

Выбранный owner block реализован; новый feature block не начинается, пока его normal-UI acceptance остаётся `PARTIAL`.

`LIVE ISOLATED RESTORE ACCEPTANCE CLOSURE` — включить Chrome extension доступ к local file URLs, выбрать существующий backup обычным file chooser, увидеть pre-write report, выполнить explicit restore только на `127.0.0.1:8001`, затем reload/list/reopen, открыть PDF и проверить steps `1`, `2`, `63`, `64`, `126`, `127`.

**Статус:** `NEXT / NOT STARTED`. Canonical disaster restore, cold-profile backup, физическое вязание и другие функции не входят в эту границу.
