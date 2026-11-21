# IMPLEMENTATION PASSPORT — паспорт реализации Yarn AI

**Статус:** CURRENT — `GARMENT PHOTO YARN CHARACTERIZATION AND OPTIONS V1` имеет verdict `BLOCKED`
**Проверено:** 2026-09-02
**Источник текущей правды:** [PROJECT_STATE.md](./PROJECT_STATE.md)

## GARMENT_YARN_RECOMMENDATION_V1 — implemented, real artifact blocked

- Pure JS domain хранит отдельный immutable artifact с exact source bindings, visual evidence, тремя ordered ranges, surface/swatch guidance, confidence/provenance и fingerprint; persistence использует существующий `progress` без нового store/migration.
- Manual intake UI читает recommendation отдельно и ничего не записывает в yarn/gauge. Legacy supplement запускается только explicit checkbox/button и не имеет retry/fallback.
- Python gateway/schema/runtime enforce one-shot authorization, exact project/photo binding, strict JSON schema/semantics, `store=false`, `tools=[]`, hard cap `$0.05` и Credential Manager boundary.
- Real call дошёл до completed provider response, но server вернул `HTTP 422`; recommendation не была сохранена. Audit сохранил counts/usage/cost, но не raw response и не validation error code, поэтому конкретный validation defect остаётся `unknown`.

## Canonical environment — основная пользовательская среда

- Repository: `C:\Users\User\YarnAI`.
- Branch / HEAD: `main` / `1461cd87e7a4c291324635c482a33ea9cc0579bd`.
- Server: проектная `.venv` запускает `python -m yarnai.http`.
- Origin: `http://127.0.0.1:8000`.
- Canonical browser: Google Chrome, profile `Default`.
- Persistence — долговременное хранение: IndexedDB `yarnai-local`, version `4`, partition `guest:local`.
- Blob-backed storage — хранение бинарных файлов: sibling-каталоги `.leveldb + .blob`; один `.leveldb` не является полной копией.

## Реализация пяти канонических функций

| Функция | Пользовательский вход и фактический маршрут | Основные компоненты и contracts | Persistence | Автоматические доказательства | Live-граница |
|---|---|---|---|---|---|
| Фото/идея → план | `/saved-projects` → garment analysis → exact confirmed manual option → authoritative garment + yarn profiles → intake → deterministic validation | `garment-reference-analysis*`, `GARMENT_MEASUREMENT_REQUIREMENTS_V1`, `GARMENT_YARN_REQUIREMENTS_V1`, `MANUAL_CALCULATION_INTAKE_V1`, `MANUAL_INTAKE_VALIDATION_V1` | Existing IndexedDB `progress` плюс `photos/photo_blobs`; новый store, API и DB migration не добавлены | Garment-photo Node `90/90`; Python UI `4/4`; full Node `54 + 75 + 1997`; full Python `1594 passed, 1 skipped`; build/syntax PASS | Exact real Scenario A `PASS`: confirmed `tech_02`, both profiles/intake/validation survive reload/normal reopen; yarn selection/calculation/plan не начаты |

## GARMENT PHOTO YARN REQUIREMENTS V1

- `garment-yarn-requirements.js` — pure deterministic resolver `GARMENT_YARN_REQUIREMENTS_V1` с exact analysis/request/decision/garment-profile binding, stable profile ID/fingerprint, deep immutability и fail-closed `YARN_REQUIREMENTS_UNRESOLVED` для unknown/unconfirmed/incomplete/mismatch inputs.
- Required: `yarn.name` и explicit positive-integer `yarn.strandCount`. Они имеют реальные consumers в `FabricContext`, gauge comparison и downstream yarn identity binding. `strandsDescription` выводится детерминированно и не создаёт дублирующее поле.
- Optional: composition, skein length, skein mass, available quantity. Informational: manual selection method, weight category, color/dye lot, manufacturer needle range. Conditional requirements отсутствуют, потому что текущая кодовая цепочка не доказывает conditional blocker.
- Intake хранит полный immutable profile и compact binding внутри существующего progress artifact; exact same decision обновляет active intake in-place. Validation читает profile как authoritative, отдельно сохраняет `YARN_NOT_SELECTED` до выбора и после выбора блокирует missing/invalid strand count.
- UI показывает русские classification/unit/reason и photo advisory. Advisory не заполняет поле; в exact real analysis честно показано отсутствие релевантной информации о пряже.
- Exact real IDs: profile `garment-yarn-requirements:5af5b583` / `fnv1a32:0620fe29`; intake `01a061a3-9e69-7b63-9913-258a8b0d3389` / `fnv1a32:00fee403`; validation `01a0616b-e378-7ad0-a4b5-5ba33a613d02` rev `2` / `fnv1a32:5177a8bd`; normal reload/reopen stable, progress counts `1/1`.
- Нет new store/API/migration/Stage, provider/network/credential/Analysis POST, recommendation, quantity calculation или hidden defaults. Cost `$0.00`.

## GARMENT PHOTO GARMENT REQUIREMENTS CONTRACT V1

- `garment-measurement-requirements.js` — pure deterministic resolver `GARMENT_MEASUREMENT_REQUIREMENTS_V1`. Он принимает только current confirmed `GARMENT_TECHNOLOGY_DECISION_HANDOFF_V1`, exact option name и upstream identities; любые unconfirmed/unknown/incomplete inputs дают `unresolved + ABSTAIN + GARMENT_REQUIREMENTS_UNRESOLVED`.
- Exact mapping закрыт двумя production profiles: `Вязание сверху вниз с рукавами реглан` → `top_down_raglan` (`hand_knitting`, `top_down`, `raglan`, `mostly_seamless`); `Вязание отдельными деталями с втачным рукавом` → `seamed_set_in_sleeve` (`hand_knitting`, `bottom_up_flat_pieces`, `set_in_sleeve`, `seamed`). Общая category — `sleeved_upper_body_garment`.
- Requirements разделены на `BODY_MEASUREMENT`, `FINISHED_GARMENT_MEASUREMENT`, `FIT_PREFERENCE`, `CONSTRUCTION_INPUT`; каждый хранит stable ID, applicability, level, Russian label/explanation/reason, unit, allowed source, value path или technology-resolved value и canonical normalization.
- Intake хранит normalized contract context и compact binding (type/version/profile fingerprint + analysis/decision IDs/revisions/fingerprints), не копируя полный analysis/decision. Старый active intake для того же exact decision обновляется in-place через существующий progress; new store и migration отсутствуют.
- Validation использует authoritative profile вместо generic construction guesses. AI observations не читаются как мерки, empty/null остаются missing, numeric/enum values нормализуются детерминированно, inactive conditional не блокирует, active missing блокирует. Profile/decision version mismatch использует существующий `stale` механизм.
- UI «Мерки и параметры изделия» показывает required/optional/conditional, filled/missing/inactive, единицу, инструкцию, причину и первое действие; fingerprints/reason codes доступны только в diagnostic data attributes.
- Live Scenario B: `:8026`, project `01a06134-c2b3-7653-866b-0c35ed96ff71`, profile `fnv1a32:3acd7ec6`, one intake + one validation progress после reload/normal reopen. Scenario A `PASS`: real project `01a05c3e-a029-7ca7-a949-b8cf5d27e5b0` хранит exact confirmed decision `garment-technology-decision:40c92e79` rev `7` / `fnv1a32:27b54bd9`, construction `seamed_set_in_sleeve`, profile `fnv1a32:8caa5190`; normal UI transition, reload/reopen и progress counts `1 + 1` доказаны.
| Схема → объяснение/адаптация | `/saved-projects` → exact Flax → technology review → execution plan; отдельные actions для print export и full backup | Существующие `pattern-*`; `pattern-execution-export.js`; новые `project-backup.js` и `project-backup-assistant.js` | Print/export только читает canonical DB; backup download read-only; restore разрешён только в пустой isolated origin на другом порту | Backup focused Node `5/5`, focused Python UI `15/15`; full Node `1997/1997`; full Python `1507 passed, 1 skipped`; build/syntax/compileall/diff PASS | Full backup скачан обычной карточкой; exact isolated restore/reopen доказан executable test, но normal Chrome restore заблокирован file chooser, поэтому backup live acceptance `PARTIAL` |
| Пошаговое сопровождение | Stage 22 → экран начала вязания / `pattern-execution-session`; отдельный virtual режим | `pattern-execution-session*`, step/checkpoint/progress/completion/result/runtime; `PATTERN_EXECUTION_VIRTUAL_DRY_RUN_V1` внутри `PATTERN_EXECUTION_SESSION` | Session и receipts в `progress`; operations/checkpoints отдельно; physical и virtual поля разделены | `pattern-execution-session.test.cjs`, step/checkpoint/progress/completion tests и Python UI tests | Pre-start и virtual E2E доказаны; physical session waiting `0/127`, поэтому physical guidance не принято |
| Ошибка → причина/исправление | Runtime → monitoring → intervention → action → evidence → verification → decision → follow-up | `pattern-execution-monitoring*`, `intervention*`, `action*`, `evidence*`, `verification*`, `decision*`, `follow-up*` | Versioned records в `progress`, repository CRUD/import/export/quarantine gates | Соответствующие Node contract tests и Python UI tests существуют | Путь не доказан через обычную карточку реального проекта и не принят человеком; интерфейс остаётся техническим |
| Готовое изделие → продаваемая схема | Пользовательской точки входа нет; персональная print page сюда не относится | `pattern-evolution-*` хранит proposal/review/decision/execution/acceptance/closure, но closure — только administrative record | Versioned evolution records в `progress` | Stage 45–52 tests проверяют contracts | Персональная инструкция не включает исходный Flax PDF и не даёт права распространения; sellable output отсутствует |

## GARMENT PHOTO MANUAL INTAKE VALIDATION V1

- Новый pure domain `manual-intake-validation.js` читает только текущие persisted Project/analysis/decision/intake artifacts и строит deterministic checks/issues/normalized inputs без LLM, OCR, сети или эвристики.
- Exact handoff расширен `analysisRevision` и `technologyDecisionFingerprint`; существующий intake schema не менялся, поэтому ранее сохранённый draft не становится `stale` из-за миграции.
- Persistence использует generic `ensureCalculationProgress` / `updateCalculationProgress` с kind `MANUAL_INTAKE_VALIDATION`; одинаковый input идемпотентен, новый store и migration отсутствуют.
- Confirmation отдельна от validation. Snapshot содержит contract/context, normalized inputs, exact project/analysis/decision/intake revisions/fingerprints; fingerprint защищает неизменность. Reopen/edit/upstream mismatch сохраняет snapshot в history и переводит active result в `stale`.
- Production garment и yarn requirements теперь разрешаются authoritative contracts при exact confirmed manual decision. Отсутствующая фактическая пряжа продолжает fail closed с `YARN_NOT_SELECTED`; strict synthetic fixture остаётся TEST ONLY на отдельном localhost origin.
- UI добавляет русские списки, first action, disabled confirmation, explicit explanatory phrase и locked confirmed form; сырые JSON/IDs/fingerprints не являются основным интерфейсом.

## GARMENT PHOTO MANUAL KNITTING INTAKE V1

- `technologyDecisionHandoff()` дополнен stable analysis/request/technology-decision identities и exact decision revision; полный analysis в intake не копируется.
- `manual-calculation-intake.js` хранит history одного progress-kind: active `draft` и прежние `stale`; смена source binding не удаляет пользовательские данные.
- Размер/мерки представлены тремя раздельными массивами с `measurementType`, `cm` и user provenance; yarn/needles имеют `not_selected`; пустые значения нормализуются в `null`.
- Gauge сохраняет `sourceMeasurement` и отдельно детерминированный `normalizedPer10Cm`. Дополнительные фото используют существующий `ProjectRepository.addPhoto()` с purpose `MANUAL_CALCULATION_INTAKE`, `LOCAL_ONLY` и `NEVER`.
- Controller не содержит `fetch`, API route, provider или credential path. Новый HTTP route отдаёт только статический production screen.

## Доказанный Flax binding

- Project: `01a04c4a-769d-7cc8-9d3a-bc8fcbbda06b`.
- Stage 21: `01a04cc9-5d0f-7fd7-90bf-c8f2dde613a2`, revision `29`, snapshot `fnv1a32:976451ff`.
- Stage 22: `01a04e7e-9162-7d69-bca9-8225583720d1`, revision `36`, plan `fnv1a32:c065298e`, `127` steps.
- Current virtual lineage: revision `129`, Stage 22 rev36, `127/127`.
- Historical virtual lineage: revision `129`, Stage 22 rev33, `127/127`, только history.
- Current physical session: waiting, wrapper revision `130`, `0/127`.
- Presentation screens show Russian human-first content; raw identities remain in closed «Технические данные».
- Export live acceptance после чтения сохранил тот же binding; «Начать вязание» не нажималась.

## Ownership — владение данными

- Source file и его blob принадлежат Project repository.
- Source facts принадлежат confirmed evidence snapshot.
- Adaptation profile не переписывает source.
- Solver владеет только deterministic result — детерминированным расчётным результатом — и numeric provenance.
- Stage 21 владеет подтверждённой технологией; Stage 22 — планом; session — progress/receipts.
- Virtual receipts никогда не повышают physical progress, completion или fit confirmation.

## EXPORT ADAPTED INSTRUCTION V1

- Видимое действие добавлено только для корректного `ready` Stage 22; missing, stale и invalid состояния закрываются без полноценного документа.
- `pattern-execution-export.js` строит read-only view из принятого Stage 21, авторитетных Stage 22 phases/steps и существующего session status; сверяет count, order, unique step/source-operation IDs и one-to-one coverage.
- Print page показывает назначение, «Перед началом», доказанные изменения, glossary, virtual/physical status, все шаги и legal notice. UUID, revisions, fingerprints, raw keys и исходный PDF не рендерятся.
- `@page` задаёт A4; навигация и buttons скрываются при печати; step card не разрывается между страницами.
- QA artifact `output/pdf/YarnAI-Flax-personal-adapted-instruction-v1.pdf`: 26 страниц A4, 475,561 bytes, номера `1..127` ровно по одному разу.
- Это персональный производный документ владельца исходника, не backup, не sellable pattern и не physical proof.

## FULL PROJECT BACKUP + ISOLATED RESTORE VERIFICATION V1

### Компоненты и формат

- `project-backup.js`: versioned envelope `yarnai-full-project-backup` v1, canonical serialization, record digests, binary SHA-256, validation и one-transaction restore.
- `project-backup-assistant.js`: download на карточке, human-first pre-write report, explicit restore, isolated-origin handshake и reload link.
- `user-workspace-entry-assistant.js`, `first-user-flow.html/.css`: обычные видимые точки входа без технических форм и UUID.
- Один `.yarnai-backup.json` включает JSON records и base64 binary bytes; максимальный envelope `192 MiB`, binary total `128 MiB`, один binary `64 MiB`, records `5000`, files `256`, depth `80`, object nodes `2,000,000`.

### Project closure и exclusions

- Included: `projects`, `calculations`, `progress`, `operations`, `checkpoints`, `photos`, `photo_blobs`, `pattern_files`, `pattern_file_blobs`.
- Excluded global data: `meta`, `settings`, `cache`, `sync_state`, `transfer_receipts`, `quarantine`, `migration_records`.
- Direct project IDs, nested parent links, exact keys и binary descriptors должны принадлежать одному project; duplicate IDs, foreign IDs, missing/extra blobs, `binary_omitted`, unsupported version и prototype-pollution keys fail before write.

### Restore boundary

- Current origin обязан быть local HTTP, иметь другой порт, тот же hostname и не совпадать с canonical origin.
- Target IndexedDB должна быть пустой; collision закрывается до transaction.
- Все project-owned stores записываются одним atomic transaction с exact keys; restore не создаёт receipt, operation, checkpoint или revision.
- После commit repository перечитывается и повторно проверяет manifest/file hashes. Это executable integrity proof, но не заменяет live browser acceptance.

### Exact Flax artifact

- Real download: `195,762,216` bytes; `819` records; `2` files; structural SHA-256 `54b3085f86cb6c27a7351cc9246216768dfa64d3ecb736d721d3ac0c505caabc`.
- Source PDF: `2,354,250` bytes; SHA-256 `81838c036136795fb3c45c0a95c0045a5dbf8958de31319bc6d80517bc980fa0`.
- Technical isolated restore/reopen сохранил project revision `400`, Stage bindings, current/historical virtual evidence и physical `0/127`.

## Следующая граница: live acceptance closure

Единственная следующая граница — повторить normal UI file selection и restore на `http://127.0.0.1:8001` после разрешения расширению Chrome доступа к local file URLs. Canonical disaster restore и cold-profile backup не реализованы и не входят в этот шаг.

## Доказательственная оговорка

Code/tests evidence доказывает fail-closed model и exact technical restore; live evidence доказывает обычный saved-project download и неизменность видимого Flax binding. Выбор backup-файла и восстановленный browser UI не доказаны из-за Chrome-extension file permission. Ни один уровень не доказывает физическое вязание, посадку, лицензию на распространение, продаваемую схему или безопасный disaster restore в canonical profile.
