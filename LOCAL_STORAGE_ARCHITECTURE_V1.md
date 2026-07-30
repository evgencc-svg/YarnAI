# LOCAL_STORAGE_ARCHITECTURE_V1 — архитектура локального хранения YarnAI V1

Версия документа: **1.0**  
Статус: **DESIGN SPECIFICATION**  
Дата: **2026-07-30**  
Область: локальное browser storage Web/PWA-клиента YarnAI V1

## 0. Назначение, границы и нормативность

Документ определяет полную целевую архитектуру локального хранения YarnAI V1: логическую модель, физическую схему IndexedDB, транзакционные границы, автосохранение, восстановление, media storage, очистку, переносимость и контракты для будущей облачной синхронизации.

Ключевые слова **ДОЛЖЕН**, **НЕЛЬЗЯ**, **СЛЕДУЕТ** и **МОЖЕТ** задают обязательность требования.

Документ относится к инфраструктуре хранения. Он:

- не меняет расчётные формулы, математический канон или Calculation Engine;
- не меняет пользовательские сценарии Smart Start и Step Assistant;
- не определяет UI;
- не реализует аккаунты, серверное хранение или multi-device sync;
- не делает браузерное хранилище резервной копией;
- не разрешает хранить credentials, access token, refresh token или пароль;
- не отменяет контракты `PROJECT_SYSTEM_V1.md` и `SYNC_ARCHITECTURE_V1.md`.

Если продуктовая граница V1 не активирует фотографии, соответствующие stores остаются пустыми. Их схема всё равно фиксируется в первой версии, чтобы включение media и Sync V2 не требовало смены локальной модели данных.

Главная цель совместимости: **при появлении Sync V2 существующая локальная база остаётся local source of immediate truth; к ней подключается Sync Adapter, а идентификаторы, aggregates, ссылки, snapshots, операции и media metadata не преобразуются в другую предметную модель**. Допустимы только заполнение заранее предусмотренных sync-полей, новые значения enum, дополнительные индексы и последующие обратимо мигрируемые расширения.

---

## 1. Общая архитектура хранения

YarnAI V1 использует local-first архитектуру из пяти слоёв:

```text
UI / Smart Start / Step Assistant / Project workflows
                         |
                  Storage Facade
                         |
        Validation + repositories + unit of work
                         |
      IndexedDB: snapshots + operations + media
                         |
        Backup/Restore     Future Sync Adapter
```

### 1.1. Роли слоёв

1. **UI и workflow** работают с предметными командами: создать проект, сохранить расчёт, перейти к следующему ряду, добавить фото, изменить настройку. Они не знают имён object stores, индексов и legacy keys.
2. **Storage Facade** предоставляет стабильный асинхронный API и является единственной разрешённой границей доступа к долговременным данным.
3. **Repositories** валидируют record schema и инварианты, формируют transaction plan, сравнивают revision и собирают aggregates.
4. **IndexedDB** атомарно хранит materialized snapshots, immutable records, журнал операций, checkpoints, blobs и служебные записи.
5. **Backup/Restore** переносит логические данные, а не физический dump IndexedDB.
6. **Future Sync Adapter** читает существующий operation journal/outbox и применяет remote changes через те же repositories.

### 1.2. Источники истины

| Данные | Local source of truth V1 | Правило |
|---|---|---|
| Проект и его lifecycle | `projects` | Versioned materialized snapshot |
| Расчёт | `calculations` | Immutable snapshot |
| Smart Start / Step Assistant progress | `progress` | Versioned materialized snapshot |
| Значимая мутация | `operations` | Append-only до безопасной compaction |
| Recovery state | `checkpoints` | Не менее двух валидных поколений |
| Фото metadata | `photos` | Versioned metadata/tombstone |
| Фото bytes и варианты | `photo_blobs` | Blob, отдельно от metadata |
| Настройки | `settings` | Scoped key/value records |
| Производные временные данные | `cache` | Replaceable, не source of truth |

`localStorage` не является source of truth новой системы. Он допускается только для:

- legacy-read существующих `yarnai.*` records во время миграции;
- малого некритичного bootstrap hint, если без него нельзя быстро открыть приложение;
- compatibility marker с номером успешно завершённой миграции.

Потеря или очистка `localStorage` не должна уничтожать проект, расчёт, progress или фото. После успешной миграции dual-write в legacy keys запрещён.

### 1.3. Транзакционная модель

Одна пользовательская команда образует один unit of work. В одной IndexedDB read-write transaction фиксируются:

- новый materialized snapshot либо immutable entity;
- новая монотонная revision изменённого aggregate;
- `updated_at`;
- append-only operation с уникальным `operation_id`;
- необходимые ссылки и recovery metadata.

Либо фиксируются все части, либо ни одна. Сетевой запрос, создание preview, тяжёлый hash и другой долгий процесс не удерживают IndexedDB transaction открытой: они выполняются до неё, после чего короткая transaction проверяет ожидаемую base revision и делает commit.

### 1.4. Владение и изоляция

- Все entity IDs создаются на клиенте до первой записи как lowercase UUIDv7 по RFC 9562.
- `project_id` не зависит от title, fingerprint, устройства, owner или browser key.
- Каждый проект принадлежит ровно одному локальному `partition_key`.
- В V1 `partition_key` имеет вид `guest:<installation_id>`.
- В Sync V2 допустим `account:<owner_user_id>`. Claim проекта меняет ownership/partition metadata, но не `project_id` и не IDs дочерних сущностей.
- Любое list/read/delete выполняется внутри явной partition/project scope.

---

## 2. Почему выбрана IndexedDB

IndexedDB выбрана как каноническое локальное хранилище по следующим причинам:

- асинхронный API не блокирует main thread синхронной сериализацией больших payload;
- поддерживает атомарные transaction над несколькими object stores;
- хранит structured clone values без превращения каждого record в строку;
- нативно хранит `Blob`, что необходимо для фотографий и preview;
- поддерживает primary keys, составные ключи, unique и non-unique indexes;
- позволяет читать и обновлять отдельный project aggregate без загрузки всей базы;
- имеет существенно более подходящую квоту, чем `localStorage`, хотя точная квота зависит от браузера;
- соответствует local-first/outbox модели Sync V2;
- позволяет отделить metadata от больших binary values;
- допускает безопасное версионирование физической схемы через `onupgradeneeded`.

### 2.1. Почему не альтернативы

| Вариант | Почему не является основой |
|---|---|
| `localStorage` | Синхронный, малый, строковый, без multi-record transactions и indexes; непригоден для blobs и outbox |
| Cache API | Оптимизирован под Request/Response и offline resources, а не под предметные aggregates и запросы по индексам |
| OPFS | Полезен для больших файлов, но сам по себе не даёт предметных indexes и общей transaction с project metadata; V1 не делает его обязательным |
| File System Access API | Требует пользовательского выбора файлов, не является прозрачным application repository и поддерживается не везде |
| In-memory state | Теряется при reload/crash |
| Cookies | Малы, отправляются по сети и не предназначены для project data |

OPFS МОЖЕТ быть исследован позже как внутренний backend для очень больших локальных media bytes. Даже в этом случае `photos` остаётся metadata source of truth, `photo_id` не меняется, а размещение bytes скрыто за Media Repository. Это инфраструктурная оптимизация, а не изменение архитектуры данных.

---

## 3. Структура базы данных

### 3.1. Идентичность базы

| Параметр | Значение V1 |
|---|---|
| Database name | `yarnai-local` |
| IndexedDB version | `1` |
| Storage model | Materialized snapshots + append-only operations |
| Primary ID format | UUIDv7 |
| Timestamp format | UTC ISO 8601 с миллисекундами и `Z` |
| Content checksum | SHA-256 canonical bytes |
| JSON canonicalization | RFC 8785 для экспортируемых/checkpoint JSON payload |

Имя базы стабильно между V1 и Sync V2. Нельзя создавать отдельную «cloud database» и копировать в неё проекты. Account isolation реализуется через `partition_key`, а не через динамическое имя базы.

### 3.2. Общий record envelope

Каждая доменная запись, кроме строго локального cache и простых `meta` entries, содержит:

| Поле | Назначение |
|---|---|
| `schema_version` | Версия логического record contract |
| entity-specific ID | Неизменяемый UUIDv7 |
| `partition_key` или выводимая ссылка на project | Изоляция локального владельца |
| `created_at` | Время создания |
| `updated_at` | Время последней подтверждённой мутации, если запись mutable |
| `revision` | Монотонная локальная revision mutable aggregate |
| `deleted_at` | `null` или время soft delete |
| `purge_after` | `null` или минимальное время физической очистки |

Поля синхронизации существуют с V1 и имеют нейтральные значения:

| Поле | Значение до Sync V2 |
|---|---|
| `server_version` | `null` |
| `server_updated_at` | `null` |
| `sync_status` | `LOCAL_ONLY` |
| `last_synced_at` | `null` |
| `conflict_id` | `null` |

Не все эти поля обязаны дублироваться в immutable child records, если их состояние однозначно определяется соответствующей operation или owning aggregate. Однако serializers и validators должны принимать их в зафиксированных местах уже в V1.

### 3.3. Связи

```text
partition
  ├── projects
  │     ├── calculations
  │     ├── progress
  │     ├── operations
  │     ├── checkpoints
  │     └── photos ── photo_blobs
  ├── settings
  ├── sync_state
  └── transfer_receipts

cache, quarantine и migration_records — служебные stores со ссылками
на partition/project/entity, когда такая ссылка существует.
```

IndexedDB не предоставляет foreign keys. Referential integrity обеспечивается repository validation и transaction boundaries. Физический purge выполняется только по полному заранее построенному deletion plan.

---

## 4. Object Stores

V1 создаёт следующие object stores сразу. Неиспользуемые функции могут оставлять соответствующие stores пустыми.

| Store | `keyPath` | Содержимое и политика |
|---|---|---|
| `meta` | `key` | Database manifest, `installation_id`, counters, feature/migration markers |
| `projects` | `project_id` | Project metadata, lifecycle, active calculation, ownership, tombstone |
| `calculations` | `calculation_id` | Immutable input/result snapshots и provenance |
| `progress` | `progress_id` | Materialized Smart Start/Step Assistant state |
| `operations` | `operation_id` | Append-only local event journal и future outbox |
| `checkpoints` | `checkpoint_id` | Recovery snapshots, checksum и generation metadata |
| `photos` | `photo_id` | Photo metadata, privacy, lifecycle, sync/upload state |
| `photo_blobs` | `blob_id` | Original/thumbnail/preview/normalized `Blob` variants |
| `settings` | `setting_id` | Device/account-scoped user preferences |
| `cache` | `cache_key` | Replaceable derived/temporary structured values |
| `sync_state` | `partition_key` | Future cursor, device identity, bootstrap и sync health |
| `transfer_receipts` | `transfer_id` | Идемпотентность export/import/restore |
| `quarantine` | `quarantine_id` | Corrupted/rejected records до диагностики или expiry |
| `migration_records` | `migration_id` | Идемпотентные результаты legacy/schema migrations |

### 4.1. Правила разделения stores

- Большой `Blob` НЕЛЬЗЯ помещать в `projects`, `calculations`, `progress` или `operations`.
- Photo metadata НЕЛЬЗЯ хранить только внутри blob record.
- Cache НЕЛЬЗЯ использовать как единственную копию пользовательских данных.
- Checkpoint НЕЛЬЗЯ считать обычной историей пользователя; это recovery-механизм.
- Operation payload содержит только данные самой мутации, а не полный dump проекта, если полная копия не требуется типом операции.
- `meta` НЕЛЬЗЯ превращать в универсальный store произвольных данных.
- Quarantine record не участвует в обычных list/open запросах.

### 4.2. Обязательные транзакционные группы

| Команда | Stores одной transaction |
|---|---|
| Создание проекта | `projects`, `calculations`, начальный `progress` при наличии, `operations`, `meta` |
| Изменение project metadata | `projects`, `operations` |
| Изменение progress | `progress`, `operations`, recovery metadata |
| Новый расчёт | `calculations`, `projects`, `operations` |
| Добавление подготовленного фото | `photos`, `photo_blobs`, `operations` |
| Soft delete/restore | owning store, `operations`, связанные tombstone metadata |
| Import/restore commit | все затрагиваемые domain stores, `transfer_receipts`, `operations` |
| Claim/bootstrap Sync V2 | `projects`, `operations`, `sync_state` и затрагиваемые sync metadata |

Если объём полного restore превышает практический размер одной browser transaction, restore сначала записывается в изолированную staging partition, проверяется, а затем публикуется короткой атомарной сменой manifest/partition state. Частично опубликованный проект запрещён.

---

## 5. Индексы

Все индексы создаются в IndexedDB version `1`. Имена индексов являются частью storage contract.

### 5.1. `projects`

| Индекс | Key path | Unique | Назначение |
|---|---|---:|---|
| `by_partition_status_updated` | `[partition_key, workspace_status, updated_at]` | Нет | Основной список проектов |
| `by_partition_last_opened` | `[partition_key, last_opened_at]` | Нет | Последний открытый проект |
| `by_updated_at` | `updated_at` | Нет | Диагностика и future change scan |
| `by_purge_after` | `purge_after` | Нет | Garbage collection |

### 5.2. `calculations`

| Индекс | Key path | Unique | Назначение |
|---|---|---:|---|
| `by_project_created` | `[project_id, created_at]` | Нет | История snapshots проекта |
| `by_project_fingerprint` | `[project_id, fingerprint]` | Нет | Проверка содержимого и legacy migration |
| `by_fingerprint` | `fingerprint` | Нет | Диагностика одинакового calculation content |
| `by_supersedes` | `supersedes_calculation_id` | Нет | Lineage расчётов |

Fingerprint намеренно не unique: одинаковое нормативное содержание допустимо в разных проектах и snapshots и никогда не определяет project identity.

### 5.3. `progress`

| Индекс | Key path | Unique | Назначение |
|---|---|---:|---|
| `by_scope_epoch` | `[project_id, calculation_id, kind, epoch]` | Да | Один active snapshot для логического progress epoch |
| `by_project_updated` | `[project_id, updated_at]` | Нет | Resume и export |
| `by_calculation_kind` | `[calculation_id, kind]` | Нет | Получение progress расчёта |
| `by_purge_after` | `purge_after` | Нет | Очистка tombstones |

### 5.4. `operations`

| Индекс | Key path | Unique | Назначение |
|---|---|---:|---|
| `by_device_sequence` | `[device_id, device_sequence]` | Да | Порядок и idempotency future push |
| `by_partition_sync_time` | `[partition_key, sync_status, occurred_at]` | Нет | Outbox |
| `by_aggregate_revision` | `[aggregate_type, aggregate_id, resulting_revision]` | Нет | Replay/recovery |
| `by_project_time` | `[project_id, occurred_at]` | Нет | Project history/export |
| `by_retention_until` | `retention_until` | Нет | Безопасная compaction |

### 5.5. `checkpoints`

| Индекс | Key path | Unique | Назначение |
|---|---|---:|---|
| `by_aggregate_revision` | `[aggregate_type, aggregate_id, revision]` | Нет | Поиск поколений и divergent recovery candidates |
| `by_project_created` | `[project_id, created_at]` | Нет | Recovery проекта |
| `by_retention_until` | `retention_until` | Нет | Очистка старых поколений |

### 5.6. `photos` и `photo_blobs`

| Store / индекс | Key path | Unique | Назначение |
|---|---|---:|---|
| `photos.by_project_created` | `[project_id, created_at]` | Нет | Галерея проекта |
| `photos.by_project_status` | `[project_id, status]` | Нет | Pending/ready/deleted |
| `photos.by_sha256` | `sha256` | Нет | Integrity и необязательная byte-level оптимизация |
| `photos.by_purge_after` | `purge_after` | Нет | Media GC |
| `photo_blobs.by_photo_variant` | `[photo_id, variant_kind]` | Да | Один current blob каждого варианта |
| `photo_blobs.by_state_accessed` | `[storage_state, last_accessed_at]` | Нет | Eviction локальных производных |
| `photo_blobs.by_purge_after` | `purge_after` | Нет | Очистка bytes |

Совпадающий `sha256` не объединяет Photo entities автоматически. Возможное физическое deduplication bytes не должно связывать lifecycle или права удаления двух фотографий.

### 5.7. Служебные stores

| Store / индекс | Key path | Unique |
|---|---|---:|
| `settings.by_partition_key` | `[partition_key, setting_key]` | Да |
| `settings.by_sync_scope_updated` | `[sync_scope, updated_at]` | Нет |
| `cache.by_expires_at` | `expires_at` | Нет |
| `cache.by_priority_accessed` | `[priority, last_accessed_at]` | Нет |
| `transfer_receipts.by_external_checksum` | `[transfer_kind, external_id, checksum]` | Да |
| `transfer_receipts.by_created_at` | `created_at` | Нет |
| `quarantine.by_expires_at` | `expires_at` | Нет |
| `quarantine.by_source` | `[source_store, source_key]` | Нет |
| `migration_records.by_source_status` | `[source_kind, status]` | Нет |

Поля со значением `null`, которое не является допустимым IndexedDB key, могут не попадать в индекс. Repository обязан обрабатывать это явно и не полагаться на range query по `null`.

---

## 6. Версионирование схемы

YarnAI различает три независимые версии:

1. **IndexedDB version** — целое число физической схемы stores/indexes.
2. **Record `schema_version`** — версия логического контракта конкретной сущности.
3. **Export `schema_version`** — major version переносимого package.

Изменение одной версии не обязано менять остальные. Добавление индекса повышает IndexedDB version, но не меняет семантику project record. Добавление обязательного project field требует record migration.

### 6.1. Правила upgrade

- Structural upgrade выполняется только в `onupgradeneeded`.
- Upgrade не делает network request и не зависит от аккаунта.
- Создание stores/indexes идемпотентно относительно ожидаемой предыдущей версии.
- Все открытые вкладки обрабатывают `versionchange`, прекращают новые записи, закрывают connection и предлагают reload.
- Если другая вкладка блокирует upgrade, приложение не делает запись в частично совместимом режиме.
- Ошибка upgrade abort-ит transaction; старая база остаётся доступной в предыдущей целостной версии.
- Downgrade базы не поддерживается.
- Неизвестная более новая major record schema не переписывается и открывается только в безопасном read-only/quarantine flow.

### 6.2. Тяжёлые data migrations

`onupgradeneeded` не должен выполнять длительную перекодировку изображений или массовый пересчёт payload. Для тяжёлых миграций применяется expand/migrate/contract:

1. structural upgrade добавляет новое поле/store/index;
2. `migration_records` фиксирует deterministic migration ID и cursor;
3. background batches создают новые records рядом со старыми;
4. каждый batch транзакционно проверяется;
5. чтение поддерживает старый и новый формат в compatibility window;
6. после полного read-back и backup старый формат помечается для cleanup;
7. физическая очистка является отдельным обратимым этапом.

### 6.3. Legacy `localStorage` migration

Миграция существующих Smart Start/Step Assistant records:

1. Инвентаризирует только известные `yarnai.*` keys.
2. Читает source record без изменения.
3. Валидирует schema, calculation fingerprint и progress invariants.
4. Создаёт новые UUIDv7 для Project/Calculation/Progress/Operation.
5. Записывает полный aggregate и `migration_record` одной transaction.
6. Делает read-back, повторно валидирует ссылки и checksum.
7. Помечает source key как migrated только после успешной проверки.
8. При повторном запуске использует тот же deterministic migration ID и не создаёт дубликат.
9. Невалидный source оставляет без изменений и создаёт diagnostic/quarantine record без приватного payload в telemetry.
10. Legacy key не удаляется автоматически до отдельного rollback-window решения.

Fingerprint сохраняет прежнюю семантику и не становится `project_id`.

---

## 7. Хранение проектов

### 7.1. Project record

`projects` содержит:

- `schema_version`;
- `project_id`;
- `partition_key`;
- `owner_user_id: null` в guest V1;
- `title`, `notes`;
- `workspace_status`;
- `status_before_archive`, `status_before_delete`;
- `active_calculation_id`;
- `created_at`, `updated_at`, `last_opened_at`;
- `archived_at`, `deleted_at`, `purge_after`;
- `revision`;
- `duplicated_from_project_id`, `imported_from_project_id`;
- `sync_status`, `server_version`, `last_synced_at`, `conflict_id`;
- checksum materialized payload или ссылку на соответствующий checkpoint.

### 7.2. Правила

- `project_id` неизменяем и уникален.
- Title не обязан быть уникальным и не участвует в key.
- `active_calculation_id` указывает только на существующий calculation того же проекта.
- Archive не удаляет данные.
- User delete создаёт `DELETED` tombstone и `purge_after`, а не физическое удаление.
- Duplicate создаёт новые project/calculation/progress/operation IDs и сохраняет lineage.
- Совпадающий fingerprint не разрешает merge, overwrite или delete.
- `last_opened_at` не заменяет content revision и не порождает sync operation, если future product policy не требует синхронизировать этот факт.

### 7.3. Загрузка проекта

Проект открывается в следующем порядке:

1. Прочитать `projects` по `project_id`.
2. Проверить partition, schema, status и project invariants.
3. Прочитать active calculation по точному ID.
4. Прочитать progress по составному индексу.
5. При необходимости проверить latest checkpoint/operations.
6. Собрать domain aggregate в памяти.
7. Только после полной валидации показать editable state.

Не допускается silent fallback к пустому project/progress. Повреждённый aggregate переходит в recovery flow.

---

## 8. Хранение расчётов

Calculation snapshot в `calculations` неизменяем после commit и содержит:

- `schema_version`;
- `calculation_id`, `project_id`;
- content `fingerprint`;
- исходный публичный request;
- нормализованный input;
- полный структурированный result;
- итоговый domain status, warnings и diagnostics;
- версии engine, canon и specification;
- `created_at`, `created_by_device_id`;
- `supersedes_calculation_id`;
- payload checksum;
- нейтральные sync metadata, если они нужны для server mapping.

### 8.1. Правила immutable snapshot

- Исправление входа создаёт новый calculation ID.
- Пересчёт новой версией engine создаёт новый snapshot, даже если UI считает его продолжением.
- Старый snapshot не меняется и остаётся объяснимым без повторного вызова Engine.
- Новый snapshot становится active только явной project operation.
- Progress остаётся связан со своим calculation ID и не переносится автоматически.
- Calculation payload хранится как structured value; двойная сериализация JSON-строкой не требуется.
- Fingerprint проверяет content identity, но не заменяет checksum, calculation ID, project ID или operation ID.

Большой trace, который можно детерминированно восстановить из immutable input/result и версии engine, МОЖЕТ быть вынесен в cache. Данные, необходимые для объяснения сохранённого результата без повторного расчёта, должны оставаться в snapshot.

---

## 9. Хранение фотографий

Фото разделено на entity metadata (`photos`) и binary variants (`photo_blobs`). Это соответствует будущему разделению PostgreSQL metadata и private object storage, но локально обе части остаются в IndexedDB.

### 9.1. Photo metadata

Photo record содержит:

- `schema_version`, `photo_id`, `project_id`;
- `partition_key`;
- `purpose` и необязательную связь с calculation/progress/checkpoint;
- очищенное display name, если оно нужно;
- source MIME, normalized MIME;
- byte size исходного import и каждого variant;
- width, height, orientation;
- SHA-256;
- `status`: `PREPARING`, `READY`, `FAILED`, `DELETED`;
- `privacy_class`, `consent_state`, `sync_policy`;
- `created_at`, `updated_at`, `deleted_at`, `purge_after`, `revision`;
- future `remote_object_key`, `upload_status`, `server_version`, `last_synced_at`.

`remote_object_key` остаётся `null` в V1. Локальные абсолютные пути и object URL никогда не сохраняются.

### 9.2. Blob variants

`photo_blobs` поддерживает:

- `ORIGINAL` — сохраняемый YarnAI original;
- `THUMBNAIL` — малый вариант для списка;
- `PREVIEW` — экранный вариант;
- `AI_NORMALIZED` — приватный нормализованный вариант только при явной цели/consent.

Blob record содержит `blob_id`, `photo_id`, `variant_kind`, `blob`, MIME, byte size, dimensions, checksum, storage/upload state, timestamps и retention metadata.

### 9.3. Privacy и provenance

- По умолчанию производные варианты очищаются от EXIF/GPS.
- Если требуется byte-identical исходник как evidence, он хранится с отдельным признаком `RAW_PRIVATE` и `sync_policy = NEVER` до явного согласия.
- Обычный YarnAI original для будущей загрузки должен пройти документированную privacy normalization policy.
- Фото не используется для AI, telemetry или cross-project memory без purpose и consent.
- Удаление Photo создаёт tombstone; bytes очищаются только после retention и проверки ссылок.
- Object URL создаётся на время отображения и обязательно отзывается.

### 9.4. Атомарность ingest

1. Source file проходит MIME/signature/size validation вне transaction.
2. Создаются dimensions, checksum и необходимые variants.
3. Короткая transaction атомарно пишет `photos`, все обязательные `photo_blobs` и operation.
4. `READY` ставится только при наличии и проверке обязательных variants.
5. Прерванные `PREPARING` records не видны как готовые и удаляются GC после recovery window.

---

## 10. Хранение настроек пользователя

Настройки хранятся в `settings` отдельными records, а не одним глобальным JSON blob.

### 10.1. Setting record

- `setting_id` — UUIDv7;
- `partition_key`;
- `setting_key`;
- typed `value`;
- `value_type`;
- `sync_scope`: `LOCAL_DEVICE`, `ACCOUNT` или `NONE`;
- `schema_version`, `revision`;
- `created_at`, `updated_at`;
- `sync_status`, `server_version`.

Unique index `[partition_key, setting_key]` не допускает две current values одного ключа.

### 10.2. Scope

| Пример | Scope | Синхронизация V2 |
|---|---|---|
| Последний открытый проект | `LOCAL_DEVICE` | Нет |
| Признак закрытого onboarding на устройстве | `LOCAL_DEVICE` | Обычно нет |
| Theme | Product decision | Возможна |
| Locale и единицы отображения | `ACCOUNT` после подтверждения | Да |
| Предпочтения объяснений | `ACCOUNT` только с явной политикой | Да |
| Feature/debug flags | `NONE` или managed config | Нет |

Проектные факты, progress, Learning State и фото НЕЛЬЗЯ хранить как settings. Credentials и raw auth tokens запрещены независимо от scope.

Неизвестный setting key игнорируется безопасно, но не удаляется автоматически: более новая версия клиента может знать его семантику.

---

## 11. Кэш временных данных

`cache` хранит только данные, которые можно безопасно удалить и получить заново:

- готовые view projections;
- результаты безопасной локальной нормализации;
- диагностические summaries без чувствительного raw payload;
- feature metadata с TTL;
- derived thumbnails только если канонический variant существует в `photo_blobs`;
- последние доступные server responses после появления Sync V2, если они не являются единственной копией.

Cache record содержит:

- `cache_key` с версионированным namespace;
- `schema_version`;
- optional `partition_key`, `project_id`, `source_entity_id`, `source_revision`;
- `value`;
- `created_at`, `expires_at`, `last_accessed_at`;
- `priority`: `LOW`, `NORMAL`, `HIGH`;
- approximate `byte_size`.

### 11.1. Правила cache validity

- Cache hit валиден только при совпадении `source_revision` и cache schema.
- TTL не заменяет revision check.
- Ошибка чтения cache трактуется как miss, а не как повреждение проекта.
- Cache write не входит в критическую transaction пользовательской мутации.
- Cache eviction не создаёт operation и не изменяет domain revision.
- В cache нельзя хранить единственную копию unsaved edit, import staging или pending upload.

---

## 12. Автосохранение

### 12.1. Классы commit

**Немедленный durable commit:**

- создание проекта;
- переход шага, ряда или петли;
- reset/rewind;
- смена active calculation;
- создание calculation snapshot;
- добавление/удаление фото после подготовки;
- duplicate, archive, restore, delete;
- import/restore publish;
- явный status transition.

**Debounced commit:**

- title;
- notes;
- неопасные editable preferences.

Debounce не превышает 750 ms после последнего изменения. Pending edit дополнительно сохраняется при blur, `visibilitychange → hidden`, переходе к другому проекту и перед lifecycle operation. `beforeunload` не считается надёжным save trigger.

### 12.2. Состояния сохранения

| Состояние | Значение |
|---|---|
| `CLEAN` | In-memory state равен последней подтверждённой revision |
| `DIRTY` | Есть несохранённое изменение |
| `SAVING` | Transaction выполняется |
| `SAVED_LOCAL` | Transaction завершена успешно |
| `SAVE_FAILED` | Изменение осталось в памяти, commit не подтверждён |
| `CONFLICT_LOCAL` | Base revision устарела из-за другой вкладки/операции |

UI может говорить «Сохранено на устройстве» только после `transaction.oncomplete`. После Sync V2 слово «Синхронизировано» разрешено только после server acknowledgement.

### 12.3. Ошибки и retry

При quota, I/O, abort или validation error система:

- не увеличивает подтверждённую revision;
- сохраняет dirty state в памяти, пока вкладка жива;
- повторяет только transient error с ограниченным exponential backoff;
- не повторяет validation/constraint error бесконечно;
- не удаляет последний валидный snapshot/checkpoint;
- блокирует destructive action, если обязательный preceding save не состоялся;
- предлагает export последнего согласованного состояния;
- явно сообщает пользователю, что последние изменения могут быть потеряны.

---

## 13. Crash Recovery

Recovery состоит из трёх уровней:

1. **IndexedDB atomicity**: незавершённая transaction полностью откатывается браузером.
2. **Operation replay**: валидные операции новее checkpoint восстанавливают materialized state.
3. **Checkpoint fallback**: предыдущие валидные поколения используются при логическом повреждении current snapshot.

### 13.1. Checkpoint record

Checkpoint содержит:

- `checkpoint_id`, `project_id`;
- `aggregate_type`, `aggregate_id`;
- `revision`, `generation`;
- canonical snapshot payload;
- `payload_checksum`;
- диапазон включённых operations;
- `created_at`, `retention_until`;
- `validation_status`.

Для каждого важного aggregate сохраняются не менее двух проверенных поколений. Checkpoint создаётся:

- после критического lifecycle action;
- перед compaction;
- после восстановления;
- периодически после настраиваемого количества операций или времени;
- перед публикацией restore/import.

Точные пороги являются operational config и не входят в record schema.

### 13.2. Алгоритм открытия

1. Проверить current record schema, checksum и инварианты.
2. Найти latest валидный checkpoint.
3. Проверить непрерывность и валидность операций после checkpoint.
4. Replay операции по `resulting_revision`, а не по wall-clock timestamp.
5. Сравнить восстановленный snapshot с current materialized snapshot.
6. Если current повреждён, сохранить его в `quarantine`.
7. Зафиксировать восстановленное состояние и `PROJECT_RECOVERED` новой transaction.
8. Показать пользователю факт восстановления и возможную границу потери.

Если есть два валидных расходящихся варианта одной revision, автоматический merge запрещён. Открывается последний однозначный checkpoint в read-only recovery state, а варианты сохраняются для явного выбора.

### 13.3. Cross-tab coordination

- Каждая write command содержит `base_revision`.
- Transaction повторно читает current revision перед update.
- При mismatch команда не применяет blind last-write-wins.
- `BroadcastChannel` используется для invalidation открытых projections.
- Web Locks API МОЖЕТ сериализовать команды одного aggregate там, где поддерживается, но correctness не зависит от него.
- Истиной остаются IndexedDB transaction и optimistic revision check.

Recovery не защищает от ручной очистки site data, удаления browser profile, потери устройства или повреждения всех локальных копий. Для этого нужен backup или cloud.

---

## 14. Работа с большими изображениями

### 14.1. Pipeline

1. До чтения bytes проверить reported size и доступную storage estimate.
2. Декодировать изображение вне main interaction path через доступный browser worker/`createImageBitmap`.
3. Учитывать ориентацию.
4. Создавать thumbnail и preview по bounded dimensions, не удерживая одновременно несколько full-size bitmap.
5. Вычислять checksum без base64 и без JSON serialization binary data.
6. Освобождать bitmap, canvas и object URL сразу после использования.
7. Записывать готовые `Blob` variants одной короткой transaction.

Base64 запрещён для долговременного media storage: он увеличивает объём, требует большие строки и создаёт лишние копии в памяти.

### 14.2. Dynamic admission control

У браузеров нет единого надёжного фиксированного лимита. До ingest приложение использует `navigator.storage.estimate()` там, где он доступен, и:

- учитывает source bytes, временную рабочую копию и variants;
- сохраняет configurable safety headroom;
- отклоняет ingest до начала тяжёлой обработки, если места явно недостаточно;
- повторно проверяет quota перед commit;
- не обещает сохранение только на основании приблизительной estimate.

Hard limits на размер файла, megapixels и dimensions являются конфигурацией реализации и могут ужесточаться без изменения schema. Они должны быть документированы в UI и тестах.

### 14.3. Форматы и деградация

- Минимально переносимые decodable форматы V1: JPEG, PNG и WebP.
- MIME header сверяется с фактической сигнатурой.
- Не поддерживаемый браузером формат не считается готовой фотографией только по расширению.
- Animated images не декодируются без явной продуктовой поддержки.
- Ошибка preview не должна уничтожать уже подтверждённый original; Photo получает диагностируемый state.
- UI загружает thumbnail, затем preview; original читается только по явному запросу.

---

## 15. Ограничения браузеров

Архитектура учитывает следующие ограничения:

- Квота зависит от браузера, ОС, свободного диска, origin и режима использования.
- `navigator.storage.estimate()` приблизителен.
- `navigator.storage.persist()` является запросом, а не гарантией.
- Браузер или пользователь может удалить site data.
- Private/incognito режим может давать малую, временную или недоступную базу.
- Данные привязаны к exact origin; смена protocol/host/port создаёт другое storage.
- Safari/iOS и embedded webviews могут агрессивнее выгружать origin data.
- Очень большие Blob/bitmap могут привести к memory pressure раньше исчерпания storage quota.
- IndexedDB upgrade блокируется другими открытыми connections.
- IndexedDB transaction может auto-commit, если control flow надолго покинул очередь IDB requests; network/CPU work внутри transaction запрещён.
- Background tab и mobile OS могут остановить JavaScript без `beforeunload`.
- Service Worker cache и IndexedDB имеют разные lifecycle и не образуют общую transaction.
- Browser storage не является защищённым secret vault.
- Любой script того же origin при XSS потенциально может прочитать локальные данные.

### 15.1. Обязательные меры

- Feature-detect IndexedDB до работы.
- Выполнить canary open/write/read/delete при первом запуске или после storage error.
- Запросить persistent storage после понятного пользовательского действия, если браузер поддерживает API.
- Всегда предоставлять ручной backup/export.
- Не скрывать режим «хранение недоступно».
- Не логировать project payload, фото bytes и личные settings.
- Защищать приложение CSP, безопасным rendering plain text и обычными web security controls.
- Не заявлять «данные в безопасности», если существует только одна browser copy.

---

## 16. Очистка и сборка мусора

GC работает только в idle/background budget и никогда не блокирует critical save. Перед физическим удалением строится deletion plan и повторно проверяются references.

### 16.1. Категории

| Данные | Условие очистки |
|---|---|
| Expired cache | `expires_at <= now`, безопасно немедленно |
| LRU cache | При storage pressure, начиная с `LOW` |
| Неоконченный photo ingest | `PREPARING/FAILED` без активной lease старше 24 часов |
| Orphan `photo_blobs` | Нет живого `photos` record и прошёл recovery window |
| Deleted photo/project | Наступил `purge_after`, нет restore hold и выполнены sync-условия |
| Старые checkpoints | Есть минимум два более новых валидных поколения |
| Operations | Включены в проверенный checkpoint/bootstrap и прошёл retention |
| Quarantine | После explicit export/diagnostic window или решения пользователя |
| Transfer receipts | После срока idempotency, заданного policy |
| Migration records | Только после завершения rollback/support window |

### 16.2. Tombstones и Sync V2

- До Sync V2 локальный purge разрешён после локального retention и backup warning.
- После включения sync tombstone нельзя удалить до server acknowledgement и окончания общей retention policy.
- Pending/unknown outbox operation никогда не compact-ится.
- При первоначальном cloud bootstrap полный snapshot может стать server baseline; старые локальные operations помечаются `BOOTSTRAP_INCLUDED`, а не выдаются за individually acknowledged.
- GC policy может стать строже после Sync V2 без изменения stores или entity identity.

### 16.3. Storage pressure

При приближении к quota:

1. Очистить expired cache.
2. Очистить LRU derived cache.
3. Очистить воспроизводимые локальные photo variants, если original/remote copy гарантированно доступен.
4. Compact acknowledged/bootstrap-included operations в checkpoint.
5. Удалить expired quarantine/staging.
6. Предупредить пользователя и предложить backup/удаление media.

Нельзя автоматически удалять единственный original, project, calculation, progress, pending operation или последний валидный checkpoint.

---

## 17. Backup и Restore

YarnAI поддерживает два уровня переносимости.

### 17.1. Project export

Совместимый с `PROJECT_SYSTEM_V1.md` проектный export:

- один UTF-8 `.yarnai-project.json`;
- один project aggregate;
- metadata, calculations, progress, events и lineage;
- canonical payload и SHA-256;
- без credentials, global settings и других проектов;
- без photo bytes в базовом V1 compatibility format.

Если photos активированы, manifest МОЖЕТ содержать photo metadata и признак `binary_omitted`, но это не должно создавать ложное ожидание полного media backup.

### 17.2. Full local backup

Полный backup использует версионированный archive container с рекомендуемым расширением `.yarnai-backup.zip`:

```text
manifest.json
records/projects.ndjson
records/calculations.ndjson
records/progress.ndjson
records/operations.ndjson
records/photos.ndjson
settings/account-portable.ndjson
media/<photo_id>/<variant_kind>.<ext>
checksums.sha256
```

Manifest содержит:

- `format = yarnai-local-backup`;
- `schema_version`;
- `backup_id` UUIDv7;
- `created_at`, application version;
- source partition kind без credentials;
- counts и byte sizes;
- перечень включённых/исключённых scopes;
- checksum каждого logical file и root checksum;
- признак полного/неполного media backup.

Backup создаётся из согласованного logical snapshot. Для больших архивов применяется streaming, если браузер поддерживает выбранную реализацию; иначе preflight size check должен отклонить операцию до расходования памяти.

### 17.3. Restore

Restore всегда проходит фазы:

1. Parse container без исполнения данных.
2. Проверка format, supported major version, размеров и path traversal.
3. Проверка всех checksums.
4. В-memory/batched migration старой поддерживаемой schema.
5. Проверка IDs, enums, timestamps, references и invariants.
6. Построение collision plan.
7. Dry-run report пользователю.
8. Запись в staging.
9. Read-back и повторная проверка.
10. Атомарная публикация и `transfer_receipt`.

Неизвестная major version отклоняется. Restore не переписывает существующий project автоматически:

- отсутствующий `project_id` сохраняется;
- collision создаёт независимую копию с новыми entity IDs и lineage;
- повтор того же `backup_id` + checksum идемпотентно возвращает `ALREADY_RESTORED`;
- fingerprint не используется для project deduplication;
- частичный restore одного aggregate запрещён, если пользователь явно не выбрал поддерживаемый project-level import.

### 17.4. Границы backup

- Backup не содержит auth sessions и tokens.
- Device-local settings по умолчанию исключены.
- Чувствительные raw-private photos включаются только после явного подтверждения.
- Успешное создание файла не равно проверенному backup: приложение должно уметь выполнить verify/dry-run restore.
- До появления cloud пользователю необходимо явно сообщать, что ручной backup — единственная защита от очистки browser data и потери устройства.

---

## 18. Подготовка к будущей Sync V2

Sync V2 подключается к существующим stores, а не заменяет их.

### 18.1. Уже существующие V1 контракты

- Глобально уникальные client-generated entity IDs.
- Stable `project_id`, независимый от owner/device/fingerprint.
- Immutable calculations.
- Versioned materialized project/progress snapshots.
- Progress scope: project + calculation + kind + epoch.
- Монотонные revisions.
- Уникальные operations с `device_id`, `device_sequence`, `base_revision` и payload.
- Tombstones и retention.
- Нормализованные UTC timestamps.
- Schema version в records, operations и exports.
- Photo metadata отдельно от bytes.
- Storage Facade и repositories скрывают IndexedDB.
- `sync_state` и sync metadata существуют с нейтральными значениями.

### 18.2. Активация sync без remodel

При появлении аккаунта:

1. Сервер назначает `owner_user_id`, не меняя project/entity IDs.
2. `partition_key` переводится из guest scope в account scope атомарной ownership operation.
3. Полный валидный local snapshot отправляется как initial bootstrap.
4. Сервер возвращает aggregate versions и opaque cursor.
5. `sync_state` заполняется cursor/bootstrap metadata.
6. Новые local operations получают `PENDING`, отправляются at-least-once и дедуплицируются по `operation_id`.
7. Acknowledgement переводит operation в `ACKED`.
8. Pull changes применяются через те же validators/reducers в одной local transaction.
9. Неоднозначность создаёт conflict, а не client-timestamp last-write-wins.

### 18.3. Mapping local → cloud

| Local V1 | Sync V2 |
|---|---|
| `projects` | PostgreSQL `Project` |
| `calculations` | PostgreSQL `Calculation` |
| `progress` | PostgreSQL `Progress` snapshot |
| `operations` | `SyncOperation` / `ProgressEvent` |
| `photos` | PostgreSQL `Photo` metadata |
| `photo_blobs` | Private object storage upload source/local cache |
| `settings` с `ACCOUNT` scope | Account preferences |
| `sync_state` | Device cursor/bootstrap state |
| tombstone fields | Server deletion/retention contract |

### 18.4. Запрещённые решения

- Нельзя позже генерировать новый ID только потому, что entity появилась на сервере.
- Нельзя превращать localStorage key или fingerprint в cloud identity.
- Нельзя считать client timestamp concurrency authority.
- Нельзя создавать отдельную cloud-only форму progress.
- Нельзя загружать guest data без явного user action/consent.
- Нельзя удалять local state сразу после upload; local-first cache остаётся рабочей копией.
- Нельзя помечать operation синхронизированной до server acknowledgement.
- Нельзя смешивать partitions при login/logout или смене аккаунта.

Таким образом, Sync V2 добавляет transport, server acknowledgement, cursor и conflict resolution, но не требует изменения локальной предметной схемы.

---

## 19. Инварианты хранения

Ни одна transaction, migration, import, recovery, GC или будущая sync operation не может зафиксировать состояние, нарушающее эти инварианты.

### 19.1. Identity и isolation

**LS-INV-01.** Каждый entity ID валиден, глобально уникален и неизменяем.  
**LS-INV-02.** Title, fingerprint, timestamp, array position и storage key не являются project identity.  
**LS-INV-03.** Запись одного project aggregate не содержит данные другого `project_id`.  
**LS-INV-04.** Чтение и запись выполняются в явной partition scope.  
**LS-INV-05.** Claim аккаунтом не меняет project/entity IDs.

### 19.2. Projects, calculations и progress

**LS-INV-06.** Active calculation существует и принадлежит тому же проекту.  
**LS-INV-07.** Calculation snapshot неизменяем после commit.  
**LS-INV-08.** Новый расчёт создаёт новый snapshot.  
**LS-INV-09.** Одинаковый fingerprint разрешён и не объединяет проекты.  
**LS-INV-10.** Не более одного current progress на project + calculation + kind + epoch.  
**LS-INV-11.** Rewind/reset создаёт новую epoch или явную compensating operation.  
**LS-INV-12.** Progress не переносится на другой calculation ID автоматически.

### 19.3. Transactions и recovery

**LS-INV-13.** Logical mutation атомарно фиксирует snapshot, revision и operation.  
**LS-INV-14.** Revision монотонна и не определяется wall-clock timestamp.  
**LS-INV-15.** Уникальный `operation_id` даёт exactly-once effect при повторном применении.  
**LS-INV-16.** Failed transaction не оставляет частичный aggregate.  
**LS-INV-17.** Последний валидный checkpoint не перезаписывается непроверенным recovery result.  
**LS-INV-18.** Неоднозначные варианты не объединяются автоматически.  
**LS-INV-19.** Повреждённый record не заменяется пустым без уведомления.

### 19.4. Media, deletion и portability

**LS-INV-20.** Photo metadata существует отдельно от bytes и не ссылается на отсутствующий обязательный variant в `READY`.  
**LS-INV-21.** Blob checksum соответствует сохранённым bytes.  
**LS-INV-22.** Derived variant можно удалить только если это не единственная обязательная копия.  
**LS-INV-23.** Soft delete сохраняет tombstone до `purge_after` и sync acknowledgement, когда sync активен.  
**LS-INV-24.** GC не удаляет pending operation, единственный original или последний recovery checkpoint.  
**LS-INV-25.** Backup/restore не содержит credentials и не выполняет импортируемое содержимое.  
**LS-INV-26.** Collision import не перезаписывает локальный проект.  
**LS-INV-27.** Unknown major schema и invalid checksum блокируют import/restore.

### 19.5. Cache и settings

**LS-INV-28.** Cache не является единственной копией пользовательского факта.  
**LS-INV-29.** Cache invalidated при несовпадении source revision.  
**LS-INV-30.** Credentials не хранятся ни в одном IndexedDB/localStorage record.  
**LS-INV-31.** Device-local setting не синхронизируется как account preference без явного изменения policy.

---

## 20. Риски

| Риск | Последствие | Митигация |
|---|---|---|
| Quota исчерпана | Save/photo ingest не завершается | Preflight estimate, headroom, GC, явная ошибка, backup |
| Browser eviction/очистка | Потеря единственной копии | Persistent storage request, предупреждение, backup, future cloud |
| XSS | Чтение локальных приватных данных | CSP, безопасный rendering, dependency hygiene, не хранить secrets |
| Несколько вкладок | Потерянное обновление | Base revision, short transactions, BroadcastChannel, optional Web Locks |
| Upgrade заблокирован старой вкладкой | Новая версия не открывает DB | `versionchange` close protocol и понятный reload flow |
| Длительная/тяжёлая migration | Freeze, partial transform | Expand/migrate/contract, batches, markers, rollback window |
| Повреждённый legacy JSON | Silent reset progress | Validation, quarantine, оригинал не удалять |
| Fingerprint принят за identity | Смешение проектов | UUIDv7 identity, non-unique fingerprint indexes |
| Большое фото | OOM или quota failure | Blob, bounded variants, worker, dynamic admission control |
| EXIF/GPS leakage | Privacy incident | Sanitized derivatives, consent, raw-private sync policy |
| Orphan media | Рост storage | Atomic ingest, reference-aware GC, 24h staging cleanup |
| Чрезмерный operation log | Рост базы и медленное открытие | Checkpoints, safe compaction, bootstrap markers |
| Слишком ранняя compaction | Невозможность recovery/sync | Два checkpoints, ack/bootstrap condition, retention |
| Ошибка restore | Частичный или перезаписанный проект | Dry-run, staging, checksums, collision-safe publish |
| Clock skew | Неверный merge | Revision/device sequence/server version, timestamps только metadata |
| Browser-specific IndexedDB bug | Недоступность данных | Canary test, supported-browser matrix, export, recovery diagnostics |
| Незашифрованное локальное storage | Доступ при компрометации profile/OS | Честная threat model, device security guidance; не обещать secret vault |
| Неограниченная универсальная schema | Сложные миграции | Typed stores, explicit ownership, versioned validators |
| Преждевременная sync-логика в UI | Переписывание V2 | Storage Facade, operation contract, neutral sync metadata |

Главный остаточный риск V1: локальная база на одном устройстве не является независимой резервной копией. Архитектура снижает риск crash/corruption, но только export или будущая cloud copy защищают от очистки origin и потери устройства.

---

## 21. Acceptance Criteria

### 21.1. Architecture and schema

- [ ] Каноническая база называется `yarnai-local`, начальная IndexedDB version равна `1`.
- [ ] Все 14 object stores и обязательные индексы создаются атомарным schema upgrade.
- [ ] UI не обращается напрямую к IndexedDB или legacy storage keys.
- [ ] Storage Facade и repositories являются единственной write boundary.
- [ ] `localStorage` не является source of truth после миграции.
- [ ] Database version, record schema version и export schema version разделены.

### 21.2. Projects and calculations

- [ ] Все entity IDs создаются на клиенте как UUIDv7 до первой записи.
- [ ] Project ID не зависит от owner, title, fingerprint или устройства.
- [ ] Calculation snapshot immutable и содержит достаточно provenance для объяснения результата.
- [ ] Новый расчёт создаёт новый calculation ID.
- [ ] Одинаковый fingerprint допустим в нескольких проектах и не вызывает merge.
- [ ] Active calculation и progress всегда ссылаются на существующие entities того же проекта.

### 21.3. Transactions and autosave

- [ ] Каждая значимая мутация атомарно обновляет snapshot/revision и добавляет operation.
- [ ] Immediate save выполняется для progress и lifecycle actions.
- [ ] Text edits сохраняются с debounce не более 750 ms и flush на hidden/blur/navigation.
- [ ] UI показывает `Сохранено на устройстве` только после завершения transaction.
- [ ] Quota/I/O error не подтверждает save и не стирает последний валидный snapshot.
- [ ] Cross-tab stale revision не приводит к blind last-write-wins.

### 21.4. Recovery

- [ ] Незавершённая transaction не оставляет частичный aggregate.
- [ ] Хранятся минимум два валидных checkpoint generations.
- [ ] Snapshot и checkpoint checksums проверяются при recovery.
- [ ] Валидные operations replay-ятся по revision.
- [ ] Corrupted record помещается в quarantine, а не заменяется пустым.
- [ ] Divergent equal-revision states открываются read-only до явного выбора.
- [ ] Crash/reload injection tests не теряют подтверждённую revision.

### 21.5. Photos and large data

- [ ] Photo metadata и Blob variants хранятся отдельно.
- [ ] `READY` photo имеет все обязательные проверенные variants.
- [ ] Большие изображения не сериализуются в base64/JSON.
- [ ] Ingest проверяет MIME/signature, dynamic quota и dimensions.
- [ ] Thumbnail/preview очищены от чувствительного metadata.
- [ ] Raw-private original не синхронизируется без consent.
- [ ] Прерванный ingest не показывается как готовое фото и очищается после recovery window.

### 21.6. Settings, cache and GC

- [ ] Settings имеют явный device/account sync scope.
- [ ] Credentials отсутствуют в settings и других stores.
- [ ] Cache удаляем и валидируется по TTL плюс source revision.
- [ ] GC никогда не удаляет pending operation, единственный original или последний checkpoint.
- [ ] Soft-deleted entities физически удаляются только после retention.
- [ ] При активном sync purge дополнительно требует server acknowledgement.
- [ ] Storage pressure сначала очищает воспроизводимые данные.

### 21.7. Backup and restore

- [ ] Project export совместим с `.yarnai-project.json`.
- [ ] Full backup имеет versioned manifest, per-file checksums и root checksum.
- [ ] Backup явно сообщает, включены ли photo bytes.
- [ ] Restore выполняет preflight, checksum, schema и invariant validation до publish.
- [ ] Unknown major schema и invalid checksum отклоняются без partial write.
- [ ] ID collision создаёт независимую копию с lineage.
- [ ] Повторный restore одного backup/checksum идемпотентен.
- [ ] Restore drill успешно открывает проекты, расчёты, progress и включённые photos.

### 21.8. Browser resilience

- [ ] Есть feature/canary test доступности IndexedDB.
- [ ] Private/limited storage mode обнаруживается и сообщается пользователю.
- [ ] Schema upgrade корректно обрабатывает другую открытую вкладку.
- [ ] Реализация не зависит от `beforeunload`.
- [ ] Документирован supported-browser matrix и media limits.
- [ ] Пользователю доступен backup до destructive cleanup.

### 21.9. Sync V2 readiness

- [ ] V1 operation содержит `operation_id`, `device_id`, `device_sequence`, base/resulting revision, aggregate refs, kind, payload, timestamp и schema version.
- [ ] `sync_state` и neutral sync metadata присутствуют до включения cloud.
- [ ] Guest project можно назначить account owner без смены entity IDs.
- [ ] Initial cloud bootstrap принимает текущий local snapshot без remodel.
- [ ] Future outbox использует существующий `operations` store.
- [ ] Photo metadata напрямую отображается в cloud Photo, а local blob — в upload source/cache.
- [ ] Tombstones сохраняются до sync acknowledgement.
- [ ] Ни один V1 contract не использует client timestamp как concurrency authority.
- [ ] Sync Adapter можно добавить без изменения UI workflow и Calculation Engine.

### 21.10. Definition of Done

Архитектура готова к реализации, когда:

1. schema manifest и record schemas формализованы тестовыми fixtures;
2. transaction matrix покрыта integration tests;
3. migration fixtures покрывают все известные `yarnai.*` variants;
4. quota, crash, cross-tab, corrupted record и blocked upgrade проверены fault injection;
5. backup прошёл restore drill;
6. privacy review подтвердил отсутствие credentials и несанкционированной media передачи;
7. Sync V2 review подтвердил прямой mapping IDs, snapshots, operations, tombstones и photos без перепроектирования локальной модели.

Итоговый архитектурный инвариант: **локальное хранение YarnAI V1 является полноценным local-first repository, а будущая облачная синхронизация добавляет второй durable контур и transport, не заменяя локальную предметную модель и не меняя идентичность пользовательских данных**.
