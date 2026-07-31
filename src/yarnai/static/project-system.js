"use strict";

(function initializeProjectSystem(global) {
  const DB_NAME = "yarnai-local";
  const DB_VERSION = 4;
  const RECORD_SCHEMA_VERSION = 1;
  const EXPORT_SCHEMA_VERSION = 1;
  const EXPORT_FORMAT = "yarnai-project";
  const PARTITION_KEY = "guest:local";
  const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
  const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
  const DELETE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
  const CHECKPOINT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
  const UUID_V7_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const TIMESTAMP_PATTERN =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const ACTIVE_STATUSES = new Set(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"]);
  const DEFAULT_CALCULATION_PROGRESS_KINDS = Object.freeze([
    "SMART_START",
    "STEP_ASSISTANT",
  ]);
  const SUPPORTED_CALCULATION_PROGRESS_KINDS = Object.freeze([
    ...DEFAULT_CALCULATION_PROGRESS_KINDS,
    "FIRST_FABRIC_SECTION",
    "FIRST_SIMPLE_SHAPING",
    "FIRST_BIND_OFF",
    "SECOND_IDENTICAL_PIECE",
    "FIRST_ASSEMBLY_PREPARATION",
    "FIRST_ASSEMBLY_JOIN",
    "FIRST_ASSEMBLY_INSPECTION",
    "FIRST_TAIL_SECURING",
    "FIRST_BLOCKING",
    "PATTERN_IMPORT",
    "PATTERN_ANALYSIS",
    "PATTERN_CONTENT_EXTRACTION",
  ]);
  const ALL_STATUSES = new Set([...ACTIVE_STATUSES, "ARCHIVED", "DELETED"]);
  const RESTORABLE_STATUSES = new Set([
    "DRAFT",
    "ACTIVE",
    "PAUSED",
    "COMPLETED",
    "ARCHIVED",
  ]);
  const STORE_NAMES = [
    "meta",
    "projects",
    "calculations",
    "progress",
    "operations",
    "checkpoints",
    "photos",
    "photo_blobs",
    "pattern_files",
    "pattern_file_blobs",
    "settings",
    "cache",
    "sync_state",
    "transfer_receipts",
    "quarantine",
    "migration_records",
  ];
  const INDEX_MANIFEST = {
    projects: [
      ["by_partition_status_updated", ["partition_key", "workspace_status", "updated_at"]],
      ["by_partition_last_opened", ["partition_key", "last_opened_at"]],
      ["by_updated_at", "updated_at"],
      ["by_purge_after", "purge_after"],
    ],
    calculations: [
      ["by_project_created", ["project_id", "created_at"]],
      ["by_project_fingerprint", ["project_id", "fingerprint"]],
      ["by_fingerprint", "fingerprint"],
      ["by_supersedes", "supersedes_calculation_id"],
    ],
    progress: [
      ["by_scope_epoch", ["project_id", "calculation_id", "kind", "epoch"], { unique: true }],
      ["by_project_updated", ["project_id", "updated_at"]],
      ["by_calculation_kind", ["calculation_id", "kind"]],
      ["by_kind_updated", ["kind", "updated_at"]],
      ["by_purge_after", "purge_after"],
    ],
    operations: [
      ["by_device_sequence", ["device_id", "device_sequence"], { unique: true }],
      ["by_partition_sync_time", ["partition_key", "sync_status", "occurred_at"]],
      ["by_state_created", ["state", "created_at"]],
      ["by_aggregate_revision", ["aggregate_type", "aggregate_id", "resulting_revision"]],
      ["by_project_time", ["project_id", "occurred_at"]],
      ["by_retention_until", "retention_until"],
    ],
    checkpoints: [
      ["by_aggregate_revision", ["aggregate_type", "aggregate_id", "revision"]],
      ["by_project_created", ["project_id", "created_at"]],
      ["by_retention_until", "retention_until"],
    ],
    photos: [
      ["by_project_created", ["project_id", "created_at"]],
      ["by_project_status", ["project_id", "status"]],
      ["by_sha256", "sha256"],
      ["by_purge_after", "purge_after"],
    ],
    photo_blobs: [
      ["by_photo_variant", ["photo_id", "variant_kind"], { unique: true }],
      ["by_state_accessed", ["storage_state", "last_accessed_at"]],
      ["by_purge_after", "purge_after"],
    ],
    pattern_files: [
      ["by_project_material", ["project_id", "material_id"], { unique: true }],
      ["by_project_created", ["project_id", "created_at"]],
    ],
    pattern_file_blobs: [
      ["by_pattern_file", "pattern_file_id", { unique: true }],
    ],
    settings: [
      ["by_partition_key", ["partition_key", "setting_key"], { unique: true }],
      ["by_sync_scope_updated", ["sync_scope", "updated_at"]],
    ],
    cache: [
      ["by_expires_at", "expires_at"],
      ["by_priority_accessed", ["priority", "last_accessed_at"]],
    ],
    transfer_receipts: [
      ["by_external_checksum", ["transfer_kind", "external_id", "checksum"], { unique: true }],
      ["by_created_at", "created_at"],
    ],
    quarantine: [
      ["by_expires_at", "expires_at"],
      ["by_source", ["source_store", "source_key"]],
    ],
    migration_records: [
      ["by_source_status", ["source_kind", "status"]],
    ],
  };

  let lastUuidTimestamp = -1;

  class ProjectRepositoryError extends Error {
    constructor(code, userMessage, options = {}) {
      super(userMessage);
      this.name = "ProjectRepositoryError";
      this.code = code;
      this.userMessage = userMessage;
      this.transient = Boolean(options.transient);
      this.details = options.details ?? {};
      if (options.cause) {
        this.cause = options.cause;
      }
    }
  }

  function uuidv7(now = Date.now()) {
    if (!global.crypto?.getRandomValues) {
      throw new ProjectRepositoryError(
        "UUID_UNAVAILABLE",
        "Браузер не может безопасно создать идентификатор проекта.",
      );
    }
    const timestamp = Math.max(Number(now), lastUuidTimestamp);
    lastUuidTimestamp = timestamp;
    const bytes = new Uint8Array(16);
    global.crypto.getRandomValues(bytes);
    let value = BigInt(timestamp);
    for (let index = 5; index >= 0; index -= 1) {
      bytes[index] = Number(value & 0xffn);
      value >>= 8n;
    }
    bytes[6] = 0x70 | (bytes[6] & 0x0f);
    bytes[8] = 0x80 | (bytes[8] & 0x3f);
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10).join(""),
    ].join("-");
  }

  function utcNow() {
    return new Date().toISOString();
  }

  function isUuidv7(value) {
    return typeof value === "string" && UUID_V7_PATTERN.test(value);
  }

  function isTimestamp(value, nullable = false) {
    if (nullable && value === null) {
      return true;
    }
    return (
      typeof value === "string" &&
      TIMESTAMP_PATTERN.test(value) &&
      Number.isFinite(Date.parse(value))
    );
  }

  function clone(value) {
    if (global.structuredClone) {
      return global.structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function canonicalize(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string") {
      return JSON.stringify(value);
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw new ProjectRepositoryError(
          "INVALID_NUMBER",
          "Данные содержат недопустимое числовое значение.",
        );
      }
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
    }
    if (value && typeof value === "object") {
      return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
        .join(",")}}`;
    }
    throw new ProjectRepositoryError(
      "INVALID_VALUE",
      "Данные содержат неподдерживаемое значение.",
    );
  }

  async function sha256Text(text) {
    if (!global.crypto?.subtle) {
      throw new ProjectRepositoryError(
        "CHECKSUM_UNAVAILABLE",
        "Браузер не поддерживает безопасную проверку целостности данных.",
      );
    }
    const bytes = new TextEncoder().encode(text);
    const digest = await global.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  async function checksumPayload(payload) {
    return sha256Text(canonicalize(payload));
  }

  function projectChecksumPayload(project) {
    const value = clone(project);
    delete value.materialized_checksum;
    return value;
  }

  function normalizeTitle(value, fallback = null) {
    const normalized =
      typeof value === "string" ? value.normalize("NFC").trim() : "";
    const title = normalized || fallback;
    if (!title || [...title].length > 120) {
      throw new ProjectRepositoryError(
        "INVALID_TITLE",
        "Название проекта должно содержать от 1 до 120 символов.",
        { details: { field: "title" } },
      );
    }
    return title;
  }

  function normalizeNotes(value) {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== "string" || [...value].length > 10000) {
      throw new ProjectRepositoryError(
        "INVALID_NOTES",
        "Заметка проекта не должна превышать 10 000 символов.",
        { details: { field: "notes" } },
      );
    }
    return value.normalize("NFC");
  }

  function mapStorageError(error, fallbackCode = "STORAGE_ERROR") {
    if (error instanceof ProjectRepositoryError) {
      return error;
    }
    const name = error?.name ?? "";
    if (name === "QuotaExceededError") {
      return new ProjectRepositoryError(
        "STORAGE_QUOTA_EXCEEDED",
        "Недостаточно места в браузере. Освободите место или экспортируйте проекты.",
        { transient: false, cause: error },
      );
    }
    if (name === "AbortError" || name === "TransactionInactiveError") {
      return new ProjectRepositoryError(
        "STORAGE_TEMPORARILY_UNAVAILABLE",
        "Локальное сохранение временно недоступно. YarnAI повторит попытку.",
        { transient: true, cause: error },
      );
    }
    if (name === "ConstraintError") {
      return new ProjectRepositoryError(
        "STORAGE_CONSTRAINT",
        "Изменение конфликтует с уже сохранёнными данными.",
        { cause: error },
      );
    }
    return new ProjectRepositoryError(
      fallbackCode,
      "Не удалось обратиться к локальному хранилищу проектов.",
      { transient: true, cause: error },
    );
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function transactionComplete(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => {
        // onabort provides the final transaction error.
      };
    });
  }

  function createStore(database, name, keyPath) {
    if (!database.objectStoreNames.contains(name)) {
      return database.createObjectStore(name, { keyPath });
    }
    return null;
  }

  function ensureIndexes(store, definitions) {
    if (!store) {
      return;
    }
    definitions.forEach(([name, keyPath, options]) => {
      if (!store.indexNames.contains(name)) {
        store.createIndex(name, keyPath, options ?? {});
      }
    });
  }

  function applySchemaMigration(database, transaction, oldVersion) {
    if (oldVersion < 1) {
      const stores = {
        meta: createStore(database, "meta", "key"),
        projects: createStore(database, "projects", "project_id"),
        calculations: createStore(database, "calculations", "calculation_id"),
        progress: createStore(database, "progress", "progress_id"),
        operations: createStore(database, "operations", "operation_id"),
        checkpoints: createStore(database, "checkpoints", "checkpoint_id"),
        photos: createStore(database, "photos", "photo_id"),
        photo_blobs: createStore(database, "photo_blobs", "blob_id"),
        pattern_files: createStore(database, "pattern_files", "pattern_file_id"),
        pattern_file_blobs: createStore(database, "pattern_file_blobs", "blob_id"),
        settings: createStore(database, "settings", "setting_id"),
        cache: createStore(database, "cache", "cache_key"),
        sync_state: createStore(database, "sync_state", "partition_key"),
        transfer_receipts: createStore(database, "transfer_receipts", "transfer_id"),
        quarantine: createStore(database, "quarantine", "quarantine_id"),
        migration_records: createStore(database, "migration_records", "migration_id"),
      };
      Object.entries(INDEX_MANIFEST).forEach(([storeName, definitions]) => {
        ensureIndexes(stores[storeName] ?? transaction.objectStore(storeName), definitions);
      });
      stores.meta.put({
        key: "database_manifest",
        database_name: DB_NAME,
        indexeddb_version: DB_VERSION,
        record_schema_version: RECORD_SCHEMA_VERSION,
        created_at: utcNow(),
      });
    }
    if (oldVersion < 2) {
      const operations = transaction.objectStore("operations");
      ensureIndexes(operations, [
        ["by_state_created", ["state", "created_at"]],
      ]);
      const cursorRequest = operations.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          return;
        }
        const operation = cursor.value;
        operation.operation_type = operation.operation_type ?? operation.kind;
        operation.revision =
          operation.revision ?? operation.resulting_revision;
        operation.state =
          operation.state ??
          (operation.sync_status === "SYNCED" ? "uploaded" : "pending");
        cursor.update(operation);
        cursor.continue();
      };
    }
    if (oldVersion < 3) {
      const progress = transaction.objectStore("progress");
      ensureIndexes(progress, [
        ["by_kind_updated", ["kind", "updated_at"]],
      ]);
      const timestamp = utcNow();
      const cursorRequest = progress.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const source = cursor.value;
        if (
          source.kind === "PATTERN_IMPORT" &&
          source.state?.status === "completed" &&
          Number.isInteger(source.state?.revision) &&
          source.state.revision > 0 &&
          Array.isArray(source.state?.materials) &&
          source.state.materials.length > 0
        ) {
          const existingRequest = progress
            .index("by_scope_epoch")
            .get([
              source.project_id,
              source.calculation_id,
              "PATTERN_ANALYSIS",
              1,
            ]);
          existingRequest.onsuccess = () => {
            if (!existingRequest.result) {
              progress.add({
                schema_version: RECORD_SCHEMA_VERSION,
                progress_id: uuidv7(),
                project_id: source.project_id,
                calculation_id: source.calculation_id,
                partition_key: source.partition_key ?? PARTITION_KEY,
                kind: "PATTERN_ANALYSIS",
                epoch: 1,
                state: {
                  projectId: source.project_id,
                  revision: 1,
                  status: "waiting",
                  createdAt: timestamp,
                  updatedAt: timestamp,
                  sourceImportRevision: source.state.revision,
                  filesCount: source.state.materials.length,
                  analysisVersion: 1,
                  result: {
                    patternDetected: false,
                    garmentType: null,
                    construction: null,
                    confidence: 0,
                    missingInformation: [],
                    notes: [],
                  },
                  warnings: [],
                  errors: [],
                },
                created_at: timestamp,
                updated_at: timestamp,
                revision: 1,
                deleted_at: null,
                purge_after: null,
                sync_status: "LOCAL_ONLY",
                server_version: null,
                last_synced_at: null,
                conflict_id: null,
              });
            }
          };
        }
        cursor.continue();
      };
      const meta = transaction.objectStore("meta");
      const manifestRequest = meta.get("database_manifest");
      manifestRequest.onsuccess = () => {
        const manifest = manifestRequest.result;
        if (manifest) {
          manifest.indexeddb_version = DB_VERSION;
          manifest.updated_at = timestamp;
          meta.put(manifest);
        }
      };
    }
    if (oldVersion < 4) {
      const patternFiles = createStore(database, "pattern_files", "pattern_file_id");
      const patternFileBlobs = createStore(database, "pattern_file_blobs", "blob_id");
      ensureIndexes(patternFiles, INDEX_MANIFEST.pattern_files);
      ensureIndexes(patternFileBlobs, INDEX_MANIFEST.pattern_file_blobs);
      const timestamp = utcNow();
      const meta = transaction.objectStore("meta");
      const manifestRequest = meta.get("database_manifest");
      manifestRequest.onsuccess = () => {
        const manifest = manifestRequest.result;
        if (manifest) {
          manifest.indexeddb_version = DB_VERSION;
          manifest.updated_at = timestamp;
          meta.put(manifest);
        }
      };
    }
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) {
        reject(
          new ProjectRepositoryError(
            "INDEXEDDB_UNAVAILABLE",
            "Локальное хранилище IndexedDB недоступно в этом браузере.",
          ),
        );
        return;
      }
      let request;
      try {
        request = global.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (error) {
        reject(mapStorageError(error, "INDEXEDDB_UNAVAILABLE"));
        return;
      }
      request.onupgradeneeded = (event) => {
        try {
          applySchemaMigration(request.result, request.transaction, event.oldVersion);
        } catch (error) {
          request.transaction.abort();
          reject(mapStorageError(error, "SCHEMA_MIGRATION_FAILED"));
        }
      };
      request.onblocked = () => {
        reject(
          new ProjectRepositoryError(
            "SCHEMA_UPGRADE_BLOCKED",
            "Другая вкладка YarnAI мешает обновить хранилище. Закройте её и обновите страницу.",
            { transient: true },
          ),
        );
      };
      request.onerror = () => reject(mapStorageError(request.error));
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          global.dispatchEvent?.(new CustomEvent("yarnai-storage-versionchange"));
        };
        resolve(database);
      };
    });
  }

  async function readByProject(database, storeName, indexName, projectId) {
    const transaction = database.transaction(storeName, "readonly");
    const index = transaction.objectStore(storeName).index(indexName);
    const range = global.IDBKeyRange.bound(
      [projectId, ""],
      [projectId, "\uffff"],
    );
    const result = await requestResult(index.getAll(range));
    await transactionComplete(transaction);
    return result;
  }

  function baseProject(projectId, title, notes, timestamp) {
    return {
      schema_version: RECORD_SCHEMA_VERSION,
      project_id: projectId,
      partition_key: PARTITION_KEY,
      owner_user_id: null,
      title,
      notes,
      workspace_status: "DRAFT",
      status_before_archive: null,
      status_before_delete: null,
      active_calculation_id: null,
      current_stage: null,
      draft_input: null,
      has_unfinished_calculation: false,
      created_at: timestamp,
      updated_at: timestamp,
      last_opened_at: null,
      archived_at: null,
      deleted_at: null,
      purge_after: null,
      revision: 1,
      duplicated_from_project_id: null,
      imported_from_project_id: null,
      sync_status: "LOCAL_ONLY",
      server_version: null,
      server_updated_at: null,
      last_synced_at: null,
      conflict_id: null,
      materialized_checksum: "",
    };
  }

  function validateProjectRecord(project) {
    if (!project || typeof project !== "object" || Array.isArray(project)) {
      throw new ProjectRepositoryError(
        "INVALID_PROJECT",
        "Запись проекта имеет неверный формат.",
      );
    }
    if (project.schema_version !== RECORD_SCHEMA_VERSION) {
      throw new ProjectRepositoryError(
        "UNSUPPORTED_PROJECT_SCHEMA",
        "Версия локального проекта не поддерживается этой версией YarnAI.",
      );
    }
    if (!isUuidv7(project.project_id)) {
      throw new ProjectRepositoryError(
        "INVALID_PROJECT_ID",
        "Идентификатор проекта повреждён.",
      );
    }
    normalizeTitle(project.title);
    normalizeNotes(project.notes);
    if (!ALL_STATUSES.has(project.workspace_status)) {
      throw new ProjectRepositoryError(
        "INVALID_PROJECT_STATUS",
        "Состояние проекта не поддерживается.",
      );
    }
    if (
      !Number.isInteger(project.revision) ||
      project.revision < 1 ||
      !isTimestamp(project.created_at) ||
      !isTimestamp(project.updated_at)
    ) {
      throw new ProjectRepositoryError(
        "INVALID_PROJECT_METADATA",
        "Служебные данные проекта повреждены.",
      );
    }
    if (
      project.active_calculation_id !== null &&
      !isUuidv7(project.active_calculation_id)
    ) {
      throw new ProjectRepositoryError(
        "INVALID_ACTIVE_CALCULATION",
        "Ссылка на активный расчёт повреждена.",
      );
    }
    return project;
  }

  function validateCalculationRecord(calculation, projectId) {
    if (
      !calculation ||
      calculation.schema_version !== RECORD_SCHEMA_VERSION ||
      !isUuidv7(calculation.calculation_id) ||
      calculation.project_id !== projectId ||
      typeof calculation.fingerprint !== "string" ||
      calculation.fingerprint.length !== 64 ||
      !isTimestamp(calculation.created_at)
    ) {
      throw new ProjectRepositoryError(
        "INVALID_CALCULATION",
        "Сохранённый расчёт проекта повреждён.",
      );
    }
  }

  function validateProgressRecord(progress, projectId, calculationId, kind) {
    if (
      !progress ||
      progress.schema_version !== RECORD_SCHEMA_VERSION ||
      !isUuidv7(progress.progress_id) ||
      progress.project_id !== projectId ||
      progress.calculation_id !== calculationId ||
      progress.kind !== kind ||
      !Number.isInteger(progress.epoch) ||
      progress.epoch < 1 ||
      !progress.state ||
      typeof progress.state !== "object" ||
      Array.isArray(progress.state) ||
      !Number.isInteger(progress.revision) ||
      progress.revision < 1 ||
      !isTimestamp(progress.created_at) ||
      !isTimestamp(progress.updated_at)
    ) {
      throw new ProjectRepositoryError(
        "INVALID_PROGRESS",
        "Сохранённый прогресс проекта повреждён. Исходная запись не изменена.",
      );
    }
    return progress;
  }

  function createOperation(project, kind, payload, timestamp, baseRevision, resultRevision) {
    return {
      schema_version: RECORD_SCHEMA_VERSION,
      operation_id: uuidv7(),
      partition_key: PARTITION_KEY,
      project_id: project.project_id,
      aggregate_type: "PROJECT",
      aggregate_id: project.project_id,
      device_id: null,
      device_sequence: null,
      base_revision: baseRevision,
      resulting_revision: resultRevision,
      revision: resultRevision,
      kind,
      operation_type: kind,
      payload: {
        ...clone(payload ?? {}),
        project: clone(project),
      },
      occurred_at: timestamp,
      created_at: timestamp,
      retention_until: new Date(Date.parse(timestamp) + CHECKPOINT_RETENTION_MS).toISOString(),
      sync_status: "LOCAL_ONLY",
      state: "pending",
      server_version: null,
      uploaded_at: null,
      last_error: null,
      retryable: false,
    };
  }

  function createCheckpoint(project, checksum, generation, timestamp, status = "VALID") {
    return {
      schema_version: RECORD_SCHEMA_VERSION,
      checkpoint_id: uuidv7(),
      project_id: project.project_id,
      aggregate_type: "PROJECT",
      aggregate_id: project.project_id,
      revision: project.revision,
      generation,
      snapshot: clone(project),
      payload_checksum: checksum,
      included_operation_from: null,
      included_operation_to: null,
      created_at: timestamp,
      retention_until: new Date(Date.parse(timestamp) + CHECKPOINT_RETENTION_MS).toISOString(),
      validation_status: status,
    };
  }

  async function allocateOperationMetadata(transaction, operation) {
    const meta = transaction.objectStore("meta");
    const deviceRecord = await requestResult(meta.get("device_identity"));
    const counterRecord = await requestResult(meta.get("device_sequence"));
    const timestamp = utcNow();
    const deviceId = deviceRecord?.device_id ?? uuidv7();
    const sequence = (counterRecord?.value ?? 0) + 1;
    if (!deviceRecord) {
      meta.put({ key: "device_identity", device_id: deviceId, created_at: timestamp });
    }
    meta.put({ key: "device_sequence", value: sequence, updated_at: timestamp });
    operation.device_id = deviceId;
    operation.device_sequence = sequence;
    return operation;
  }

  class ProjectRepository {
    constructor(options = {}) {
      this._databasePromise = options.database
        ? Promise.resolve(options.database)
        : openDatabase();
      this._writeQueues = new Map();
      this._channel =
        typeof global.BroadcastChannel === "function"
          ? new global.BroadcastChannel("yarnai-projects-v1")
          : null;
    }

    async initialize() {
      const database = await this._database();
      if (!STORE_NAMES.every((name) => database.objectStoreNames.contains(name))) {
        throw new ProjectRepositoryError(
          "SCHEMA_INCOMPLETE",
          "Локальная база проектов имеет неполную схему.",
        );
      }
      return this;
    }

    async close() {
      const database = await this._databasePromise.catch(() => null);
      database?.close();
      this._channel?.close();
    }

    async _database() {
      try {
        return await this._databasePromise;
      } catch (error) {
        throw mapStorageError(error);
      }
    }

    async getOutboxOperations(options = {}) {
      const states = new Set(options.states ?? ["pending"]);
      const limit = Math.max(1, Math.min(Number(options.limit) || 50, 100));
      const database = await this._database();
      const transaction = database.transaction("operations", "readonly");
      const stored = await requestResult(
        transaction.objectStore("operations").getAll(),
      );
      await transactionComplete(transaction);
      const selected = stored
        .map((operation) => ({
          ...operation,
          operation_type: operation.operation_type ?? operation.kind,
          revision: operation.revision ?? operation.resulting_revision,
          state:
            operation.state ??
            (operation.sync_status === "SYNCED" ? "uploaded" : "pending"),
        }))
        .filter(
          (operation) =>
            states.has(operation.state) &&
            (!options.projectId || operation.project_id === options.projectId),
        )
        .sort(
          (left, right) =>
            left.created_at.localeCompare(right.created_at) ||
            left.device_sequence - right.device_sequence,
        )
        .slice(0, limit);
      const projects = new Map();
      for (const operation of selected) {
        if (!operation.payload?.project && !projects.has(operation.project_id)) {
          projects.set(
            operation.project_id,
            await this._getRawProject(operation.project_id),
          );
        }
      }
      return selected.map((operation) => {
        const result = clone(operation);
        if (!result.payload?.project) {
          result.payload = {
            ...clone(result.payload ?? {}),
            project: clone(projects.get(result.project_id)),
          };
        }
        return result;
      });
    }

    async getOutboxSummary(projectId = null) {
      const operations = await this.getOutboxOperations({
        states: ["pending", "uploading", "failed", "uploaded"],
        limit: 100,
        projectId,
      });
      return operations.reduce(
        (summary, operation) => {
          summary[operation.state] += 1;
          if (operation.state === "failed" && operation.retryable) {
            summary.retryable_failed += 1;
          }
          return summary;
        },
        {
          pending: 0,
          uploading: 0,
          uploaded: 0,
          failed: 0,
          retryable_failed: 0,
        },
      );
    }

    async _updateOutboxState(operationIds, state, details = {}) {
      if (!Array.isArray(operationIds) || operationIds.length === 0) {
        return;
      }
      const database = await this._database();
      const transaction = database.transaction("operations", "readwrite");
      const store = transaction.objectStore("operations");
      try {
        for (const operationId of operationIds) {
          const operation = await requestResult(store.get(operationId));
          if (!operation) {
            continue;
          }
          operation.state = state;
          operation.sync_status =
            state === "uploaded" ? "SYNCED" : "LOCAL_ONLY";
          operation.uploaded_at =
            state === "uploaded" ? details.uploaded_at ?? utcNow() : null;
          operation.server_version =
            details.server_version?.[operation.project_id] ??
            operation.server_version ??
            null;
          operation.last_error = details.error ?? null;
          operation.retryable = Boolean(details.retryable);
          store.put(operation);
        }
        await transactionComplete(transaction);
      } catch (error) {
        throw mapStorageError(error);
      }
    }

    async markOperationsUploading(operationIds) {
      return this._updateOutboxState(operationIds, "uploading");
    }

    async markOperationsUploaded(confirmations) {
      const serverVersion = {};
      for (const confirmation of confirmations) {
        serverVersion[confirmation.project_id] = confirmation.server_revision;
      }
      return this._updateOutboxState(
        confirmations.map((confirmation) => confirmation.operation_id),
        "uploaded",
        { server_version: serverVersion },
      );
    }

    async markOperationsFailed(errors, options = {}) {
      for (const error of errors) {
        await this._updateOutboxState([error.operation_id], "failed", {
          error: {
            code: error.code ?? "SYNC_UPLOAD_FAILED",
            message: error.message ?? "Operation upload failed.",
            status: error.status ?? 0,
          },
          retryable: Boolean(options.retryable ?? error.retryable),
        });
      }
    }

    async resetUploadingOperations() {
      const uploading = await this.getOutboxOperations({
        states: ["uploading"],
        limit: 100,
      });
      await this._updateOutboxState(
        uploading.map((operation) => operation.operation_id),
        "pending",
      );
    }

    async requeueRetryableFailedOperations() {
      const failed = await this.getOutboxOperations({
        states: ["failed"],
        limit: 100,
      });
      await this._updateOutboxState(
        failed
          .filter((operation) => operation.retryable)
          .map((operation) => operation.operation_id),
        "pending",
      );
    }

    _serialize(projectId, command) {
      const previous = this._writeQueues.get(projectId) ?? Promise.resolve();
      const current = previous.catch(() => undefined).then(command);
      const tracked = current.catch(() => undefined).finally(() => {
        if (this._writeQueues.get(projectId) === tracked) {
          this._writeQueues.delete(projectId);
        }
      });
      this._writeQueues.set(projectId, tracked);
      return current;
    }

    _notify(projectId, revision, kind) {
      this._channel?.postMessage({ project_id: projectId, revision, kind });
      global.dispatchEvent?.(
        new CustomEvent("yarnai-project-changed", {
          detail: { project_id: projectId, revision, kind },
        }),
      );
    }

    async _getRawProject(projectId) {
      if (!isUuidv7(projectId)) {
        throw new ProjectRepositoryError(
          "INVALID_PROJECT_ID",
          "Идентификатор проекта имеет неверный формат.",
        );
      }
      const database = await this._database();
      const transaction = database.transaction("projects", "readonly");
      const project = await requestResult(
        transaction.objectStore("projects").get(projectId),
      );
      await transactionComplete(transaction);
      return project ?? null;
    }

    async createProject(input = {}) {
      const title = normalizeTitle(
        input.title,
        `Новый проект · ${new Intl.DateTimeFormat("ru", {
          dateStyle: "short",
        }).format(new Date())}`,
      );
      const notes = normalizeNotes(input.notes ?? "") ?? "";
      const timestamp = utcNow();
      const project = baseProject(uuidv7(), title, notes, timestamp);
      if (input.draft_input !== undefined) {
        project.draft_input = clone(input.draft_input);
        project.has_unfinished_calculation = Boolean(input.draft_input);
      }
      project.materialized_checksum = await checksumPayload(
        projectChecksumPayload(project),
      );
      const operation = createOperation(
        project,
        "PROJECT_CREATED",
        { title: project.title },
        timestamp,
        0,
        1,
      );
      const checkpoint = createCheckpoint(
        project,
        project.materialized_checksum,
        1,
        timestamp,
      );
      const previousCheckpoint = createCheckpoint(
        project,
        project.materialized_checksum,
        0,
        timestamp,
      );
      const database = await this._database();
      const transaction = database.transaction(
        ["projects", "operations", "checkpoints", "meta"],
        "readwrite",
      );
      try {
        await allocateOperationMetadata(transaction, operation);
        transaction.objectStore("projects").add(project);
        transaction.objectStore("operations").add(operation);
        transaction.objectStore("checkpoints").add(previousCheckpoint);
        transaction.objectStore("checkpoints").add(checkpoint);
        await transactionComplete(transaction);
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already be closed.
        }
        throw mapStorageError(error);
      }
      this._notify(project.project_id, project.revision, "PROJECT_CREATED");
      return clone(project);
    }

    async _validatedCurrentProject(projectId) {
      const project = await this._getRawProject(projectId);
      if (!project) {
        throw new ProjectRepositoryError(
          "PROJECT_NOT_FOUND",
          "Проект не найден в локальном хранилище.",
        );
      }
      validateProjectRecord(project);
      const checksum = await checksumPayload(projectChecksumPayload(project));
      if (project.materialized_checksum !== checksum) {
        return this._recoverProject(projectId, project);
      }
      return project;
    }

    async _recoverProject(projectId, corruptedProject) {
      const database = await this._database();
      const checkpoints = await readByProject(
        database,
        "checkpoints",
        "by_project_created",
        projectId,
      );
      const candidates = checkpoints
        .filter((entry) => entry.validation_status === "VALID")
        .sort((left, right) => right.revision - left.revision);
      let recovered = null;
      for (const checkpoint of candidates) {
        try {
          validateProjectRecord(checkpoint.snapshot);
          const checksum = await checksumPayload(
            projectChecksumPayload(checkpoint.snapshot),
          );
          if (checksum === checkpoint.payload_checksum) {
            recovered = clone(checkpoint.snapshot);
            break;
          }
        } catch {
          // A damaged recovery generation is skipped.
        }
      }
      if (!recovered) {
        throw new ProjectRepositoryError(
          "PROJECT_RECOVERY_FAILED",
          "Проект повреждён, и исправная локальная копия не найдена.",
        );
      }
      const timestamp = utcNow();
      const previousRevision = recovered.revision;
      recovered.revision += 1;
      recovered.updated_at = timestamp;
      recovered.materialized_checksum = await checksumPayload(
        projectChecksumPayload(recovered),
      );
      const operation = createOperation(
        recovered,
        "PROJECT_RECOVERED",
        { recovered_from_revision: previousRevision },
        timestamp,
        previousRevision,
        recovered.revision,
      );
      const checkpoint = createCheckpoint(
        recovered,
        recovered.materialized_checksum,
        recovered.revision,
        timestamp,
      );
      const quarantine = {
        quarantine_id: uuidv7(),
        source_store: "projects",
        source_key: projectId,
        reason_code: "CHECKSUM_MISMATCH",
        record: clone(corruptedProject),
        created_at: timestamp,
        expires_at: new Date(Date.parse(timestamp) + CHECKPOINT_RETENTION_MS).toISOString(),
      };
      const transaction = database.transaction(
        ["projects", "operations", "checkpoints", "quarantine", "meta"],
        "readwrite",
      );
      try {
        await allocateOperationMetadata(transaction, operation);
        transaction.objectStore("quarantine").add(quarantine);
        transaction.objectStore("projects").put(recovered);
        transaction.objectStore("operations").add(operation);
        transaction.objectStore("checkpoints").add(checkpoint);
        await transactionComplete(transaction);
      } catch (error) {
        throw mapStorageError(error);
      }
      this._notify(projectId, recovered.revision, "PROJECT_RECOVERED");
      recovered.recovery_notice =
        "Проект восстановлен из последней исправной локальной копии.";
      return recovered;
    }

    async getProject(projectId, options = {}) {
      const project = await this._validatedCurrentProject(projectId);
      if (project.workspace_status === "DELETED" && !options.includeDeleted) {
        throw new ProjectRepositoryError(
          "PROJECT_DELETED",
          "Проект находится в корзине.",
        );
      }
      const database = await this._database();
      const [calculations, progress, operations, photos, stagedDraft] =
        await Promise.all([
          readByProject(database, "calculations", "by_project_created", projectId),
          readByProject(database, "progress", "by_project_updated", projectId),
          readByProject(database, "operations", "by_project_time", projectId),
          readByProject(database, "photos", "by_project_created", projectId),
          this._readLatestRecoveryDraft(projectId),
        ]);
      calculations.forEach((calculation) =>
        validateCalculationRecord(calculation, projectId),
      );
      if (
        project.active_calculation_id &&
        !calculations.some(
          (entry) => entry.calculation_id === project.active_calculation_id,
        )
      ) {
        throw new ProjectRepositoryError(
          "ACTIVE_CALCULATION_MISSING",
          "Активный расчёт проекта не найден. Доступно восстановление из экспорта.",
        );
      }
      return {
        project: clone(project),
        calculations: clone(calculations),
        progress: clone(progress),
        operations: clone(operations),
        photos: clone(photos),
        recovery_draft: stagedDraft,
      };
    }

    async getCalculationProgress(projectId, calculationId, kind) {
      if (!isUuidv7(projectId) || !isUuidv7(calculationId)) {
        throw new ProjectRepositoryError(
          "INVALID_PROGRESS_SCOPE",
          "Ссылка на прогресс проекта повреждена.",
        );
      }
      if (typeof kind !== "string" || !kind.trim()) {
        throw new ProjectRepositoryError(
          "INVALID_PROGRESS_KIND",
          "Тип прогресса проекта не указан.",
        );
      }
      const database = await this._database();
      const transaction = database.transaction("progress", "readonly");
      const record = await requestResult(
        transaction
          .objectStore("progress")
          .index("by_scope_epoch")
          .get([projectId, calculationId, kind, 1]),
      );
      await transactionComplete(transaction);
      if (!record) {
        return null;
      }
      validateProgressRecord(record, projectId, calculationId, kind);
      return clone(record);
    }

    async ensureCalculationProgress(
      projectId,
      calculationId,
      kind,
      initialState,
      options = {},
    ) {
      if (
        !isUuidv7(projectId) ||
        !isUuidv7(calculationId) ||
        typeof kind !== "string" ||
        !kind.trim() ||
        !initialState ||
        typeof initialState !== "object" ||
        Array.isArray(initialState)
      ) {
        throw new ProjectRepositoryError(
          "INVALID_PROGRESS_SCOPE",
          "Не удалось безопасно подготовить состояние проекта.",
        );
      }
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId);
        if (before.workspace_status === "DELETED") {
          throw new ProjectRepositoryError(
            "INVALID_LIFECYCLE_TRANSITION",
            "Нельзя изменять прогресс проекта из корзины.",
          );
        }
        if (before.active_calculation_id !== calculationId) {
          throw new ProjectRepositoryError(
            "CALCULATION_MISMATCH",
            "Прогресс относится не к активному расчёту проекта.",
          );
        }
        const database = await this._database();
        const readTransaction = database.transaction("progress", "readonly");
        const existing = await requestResult(
          readTransaction
            .objectStore("progress")
            .index("by_scope_epoch")
            .get([projectId, calculationId, kind, 1]),
        );
        await transactionComplete(readTransaction);
        if (existing) {
          validateProgressRecord(existing, projectId, calculationId, kind);
          return clone(existing);
        }

        const timestamp = options.timestamp ?? utcNow();
        const progress = this._initialProgress(
          projectId,
          calculationId,
          kind,
          timestamp,
        );
        progress.state = clone(initialState);
        const nextProject = clone(before);
        if (typeof options.projectStage === "string") {
          nextProject.current_stage = options.projectStage;
        }
        nextProject.updated_at = timestamp;
        nextProject.revision = before.revision + 1;
        nextProject.materialized_checksum = await checksumPayload(
          projectChecksumPayload(nextProject),
        );
        const operation = createOperation(
          nextProject,
          options.operationKind ?? "PROGRESS_CREATED",
          {
            calculation_id: calculationId,
            progress_id: progress.progress_id,
            progress_kind: kind,
            progress_revision: progress.revision,
            progress_state: clone(progress.state),
          },
          timestamp,
          before.revision,
          nextProject.revision,
        );
        const checkpoint = createCheckpoint(
          nextProject,
          nextProject.materialized_checksum,
          nextProject.revision,
          timestamp,
        );
        const transaction = database.transaction(
          ["projects", "progress", "operations", "checkpoints", "meta"],
          "readwrite",
        );
        try {
          const storedProject = await requestResult(
            transaction.objectStore("projects").get(projectId),
          );
          if (!storedProject || storedProject.revision !== before.revision) {
            transaction.abort();
            throw new ProjectRepositoryError(
              "PROGRESS_REVISION_CONFLICT",
              "Проект изменён в другой вкладке. Обновите страницу.",
            );
          }
          await allocateOperationMetadata(transaction, operation);
          transaction.objectStore("progress").add(progress);
          transaction.objectStore("projects").put(nextProject);
          transaction.objectStore("operations").add(operation);
          transaction.objectStore("checkpoints").add(checkpoint);
          await transactionComplete(transaction);
        } catch (error) {
          throw mapStorageError(error);
        }
        this._notify(projectId, nextProject.revision, operation.kind);
        return clone(progress);
      });
    }

    async updateCalculationProgress(
      projectId,
      calculationId,
      kind,
      state,
      options = {},
    ) {
      if (!state || typeof state !== "object" || Array.isArray(state)) {
        throw new ProjectRepositoryError(
          "INVALID_PROGRESS_STATE",
          "Новое состояние прогресса имеет неверный формат.",
        );
      }
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId);
        if (before.workspace_status === "DELETED") {
          throw new ProjectRepositoryError(
            "INVALID_LIFECYCLE_TRANSITION",
            "Нельзя изменять прогресс проекта из корзины.",
          );
        }
        if (before.active_calculation_id !== calculationId) {
          throw new ProjectRepositoryError(
            "CALCULATION_MISMATCH",
            "Прогресс относится не к активному расчёту проекта.",
          );
        }
        const database = await this._database();
        const readTransaction = database.transaction("progress", "readonly");
        const currentProgress = await requestResult(
          readTransaction
            .objectStore("progress")
            .index("by_scope_epoch")
            .get([projectId, calculationId, kind, 1]),
        );
        await transactionComplete(readTransaction);
        if (!currentProgress) {
          throw new ProjectRepositoryError(
            "PROGRESS_NOT_FOUND",
            "Запись прогресса проекта не найдена.",
          );
        }
        validateProgressRecord(
          currentProgress,
          projectId,
          calculationId,
          kind,
        );
        if (
          options.baseProgressRevision !== undefined &&
          currentProgress.revision !== options.baseProgressRevision
        ) {
          throw new ProjectRepositoryError(
            "PROGRESS_REVISION_CONFLICT",
            "Прогресс изменён в другой вкладке. Обновите страницу.",
          );
        }

        const timestamp = options.timestamp ?? utcNow();
        const nextProgress = clone(currentProgress);
        nextProgress.state = clone(state);
        nextProgress.updated_at = timestamp;
        nextProgress.revision = currentProgress.revision + 1;

        const nextProject = clone(before);
        if (typeof options.projectStage === "string") {
          nextProject.current_stage = options.projectStage;
        }
        if (
          options.projectDraftInput !== undefined &&
          options.projectDraftInput !== null
        ) {
          nextProject.draft_input = clone(options.projectDraftInput);
          nextProject.has_unfinished_calculation = false;
        }
        nextProject.updated_at = timestamp;
        nextProject.revision = before.revision + 1;
        nextProject.materialized_checksum = await checksumPayload(
          projectChecksumPayload(nextProject),
        );
        validateProjectRecord(nextProject);

        const operation = createOperation(
          nextProject,
          options.operationKind ?? "PROGRESS_UPDATED",
          {
            calculation_id: calculationId,
            progress_id: nextProgress.progress_id,
            progress_kind: kind,
            progress_revision: nextProgress.revision,
            progress_state: clone(nextProgress.state),
          },
          timestamp,
          before.revision,
          nextProject.revision,
        );
        const checkpoint = createCheckpoint(
          nextProject,
          nextProject.materialized_checksum,
          nextProject.revision,
          timestamp,
        );
        const transaction = database.transaction(
          ["projects", "progress", "operations", "checkpoints", "meta"],
          "readwrite",
        );
        try {
          const storedProject = await requestResult(
            transaction.objectStore("projects").get(projectId),
          );
          const storedProgress = await requestResult(
            transaction.objectStore("progress").get(nextProgress.progress_id),
          );
          if (
            !storedProject ||
            storedProject.revision !== before.revision ||
            !storedProgress ||
            storedProgress.revision !== currentProgress.revision
          ) {
            transaction.abort();
            throw new ProjectRepositoryError(
              "PROGRESS_REVISION_CONFLICT",
              "Прогресс изменён параллельно и не был перезаписан.",
            );
          }
          await allocateOperationMetadata(transaction, operation);
          transaction.objectStore("progress").put(nextProgress);
          transaction.objectStore("projects").put(nextProject);
          transaction.objectStore("operations").add(operation);
          transaction.objectStore("checkpoints").add(checkpoint);
          await transactionComplete(transaction);
        } catch (error) {
          throw mapStorageError(error);
        }
        this._notify(projectId, nextProject.revision, operation.kind);
        return {
          project: clone(nextProject),
          progress: clone(nextProgress),
        };
      });
    }

    async openProject(projectId, options = {}) {
      const aggregate = await this.getProject(projectId, options);
      const status = aggregate.project.workspace_status;
      if (status === "DELETED" && !options.includeDeleted) {
        throw new ProjectRepositoryError(
          "PROJECT_DELETED",
          "Сначала восстановите проект из корзины.",
        );
      }
      const timestamp = utcNow();
      const database = await this._database();
      const project = clone(aggregate.project);
      project.last_opened_at = timestamp;
      project.materialized_checksum = await checksumPayload(
        projectChecksumPayload(project),
      );
      const settingId = `last-opened:${PARTITION_KEY}`;
      const transaction = database.transaction(
        ["projects", "settings"],
        "readwrite",
      );
      try {
        transaction.objectStore("projects").put(project);
        transaction.objectStore("settings").put({
          setting_id: settingId,
          partition_key: PARTITION_KEY,
          setting_key: "last_opened_project_id",
          value: projectId,
          value_type: "UUID",
          sync_scope: "LOCAL_DEVICE",
          schema_version: 1,
          revision: 1,
          created_at: timestamp,
          updated_at: timestamp,
          sync_status: "LOCAL_ONLY",
          server_version: null,
        });
        await transactionComplete(transaction);
      } catch (error) {
        throw mapStorageError(error);
      }
      aggregate.project = project;
      return aggregate;
    }

    async listProjects(options = {}) {
      const section = options.section ?? "active";
      if (!["active", "archive", "trash", "all"].includes(section)) {
        throw new ProjectRepositoryError(
          "INVALID_LIST_SECTION",
          "Неизвестный раздел списка проектов.",
        );
      }
      const database = await this._database();
      const transaction = database.transaction("projects", "readonly");
      const projects = await requestResult(
        transaction.objectStore("projects").getAll(),
      );
      await transactionComplete(transaction);
      return projects
        .filter((project) => project.partition_key === PARTITION_KEY)
        .filter((project) => {
          if (section === "active") {
            return ACTIVE_STATUSES.has(project.workspace_status);
          }
          if (section === "archive") {
            return project.workspace_status === "ARCHIVED";
          }
          if (section === "trash") {
            return project.workspace_status === "DELETED";
          }
          return true;
        })
        .sort(
          (left, right) =>
            right.updated_at.localeCompare(left.updated_at) ||
            right.created_at.localeCompare(left.created_at) ||
            right.project_id.localeCompare(left.project_id),
        )
        .map(clone);
    }

    async _mutateProject(projectId, kind, mutator, payload = {}, options = {}) {
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId);
        if (
          options.baseRevision !== undefined &&
          before.revision !== options.baseRevision
        ) {
          throw new ProjectRepositoryError(
            "REVISION_CONFLICT",
            "Проект изменён в другой вкладке. Перезагрузите его перед сохранением.",
            {
              details: {
                expected_revision: options.baseRevision,
                current_revision: before.revision,
              },
            },
          );
        }
        const next = clone(before);
        mutator(next, before);
        validateProjectRecord(next);
        const timestamp = options.timestamp ?? utcNow();
        next.updated_at = timestamp;
        next.revision = before.revision + 1;
        next.materialized_checksum = await checksumPayload(
          projectChecksumPayload(next),
        );
        const operation = createOperation(
          next,
          kind,
          payload,
          timestamp,
          before.revision,
          next.revision,
        );
        const checkpoint = createCheckpoint(
          next,
          next.materialized_checksum,
          next.revision,
          timestamp,
        );
        const database = await this._database();
        const transaction = database.transaction(
          ["projects", "operations", "checkpoints", "meta"],
          "readwrite",
        );
        try {
          const current = await requestResult(
            transaction.objectStore("projects").get(projectId),
          );
          if (!current || current.revision !== before.revision) {
            transaction.abort();
            throw new ProjectRepositoryError(
              "REVISION_CONFLICT",
              "Проект изменён параллельно. Изменения не были перезаписаны.",
            );
          }
          await allocateOperationMetadata(transaction, operation);
          transaction.objectStore("projects").put(next);
          transaction.objectStore("operations").add(operation);
          transaction.objectStore("checkpoints").add(checkpoint);
          await transactionComplete(transaction);
        } catch (error) {
          throw mapStorageError(error);
        }
        this._notify(projectId, next.revision, kind);
        return clone(next);
      });
    }

    async updateProject(projectId, patch, options = {}) {
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        throw new ProjectRepositoryError(
          "INVALID_PROJECT_UPDATE",
          "Изменения проекта имеют неверный формат.",
        );
      }
      const allowed = new Set([
        "title",
        "notes",
        "draft_input",
        "has_unfinished_calculation",
      ]);
      const unknown = Object.keys(patch).filter((key) => !allowed.has(key));
      if (unknown.length) {
        throw new ProjectRepositoryError(
          "UNKNOWN_PROJECT_FIELD",
          "Изменение содержит неподдерживаемые поля.",
          { details: { fields: unknown } },
        );
      }
      const normalizedPatch = {};
      if ("title" in patch) {
        normalizedPatch.title = normalizeTitle(patch.title);
      }
      if ("notes" in patch) {
        normalizedPatch.notes = normalizeNotes(patch.notes);
      }
      if ("draft_input" in patch) {
        normalizedPatch.draft_input =
          patch.draft_input === null ? null : clone(patch.draft_input);
      }
      if ("has_unfinished_calculation" in patch) {
        normalizedPatch.has_unfinished_calculation = Boolean(
          patch.has_unfinished_calculation,
        );
      }
      return this._mutateProject(
        projectId,
        "PROJECT_UPDATED",
        (next) => {
          if (next.workspace_status === "DELETED") {
            throw new ProjectRepositoryError(
              "INVALID_LIFECYCLE_TRANSITION",
              "Нельзя редактировать проект в корзине.",
            );
          }
          Object.assign(next, normalizedPatch);
        },
        { changed_fields: Object.keys(normalizedPatch) },
        options,
      );
    }

    async _transition(projectId, kind, transition, payload = {}) {
      return this._mutateProject(projectId, kind, transition, payload);
    }

    async archiveProject(projectId) {
      const current = await this._validatedCurrentProject(projectId);
      if (current.workspace_status === "ARCHIVED") {
        return clone(current);
      }
      if (!ACTIVE_STATUSES.has(current.workspace_status)) {
        throw new ProjectRepositoryError(
          "INVALID_LIFECYCLE_TRANSITION",
          "Этот проект нельзя архивировать в текущем состоянии.",
        );
      }
      return this._transition(projectId, "PROJECT_ARCHIVED", (next) => {
        next.status_before_archive = next.workspace_status;
        next.workspace_status = "ARCHIVED";
        next.archived_at = utcNow();
      });
    }

    async transitionProjectStatus(projectId, targetStatus) {
      if (!ACTIVE_STATUSES.has(targetStatus)) {
        throw new ProjectRepositoryError(
          "INVALID_PROJECT_STATUS",
          "Запрошено неподдерживаемое рабочее состояние проекта.",
        );
      }
      const current = await this._validatedCurrentProject(projectId);
      if (current.workspace_status === targetStatus) {
        return clone(current);
      }
      const allowed = new Set([
        "DRAFT:ACTIVE",
        "ACTIVE:PAUSED",
        "PAUSED:ACTIVE",
        "ACTIVE:COMPLETED",
      ]);
      if (!allowed.has(`${current.workspace_status}:${targetStatus}`)) {
        throw new ProjectRepositoryError(
          "INVALID_LIFECYCLE_TRANSITION",
          `Переход ${current.workspace_status} → ${targetStatus} недопустим.`,
        );
      }
      return this._transition(
        projectId,
        "PROJECT_STATUS_CHANGED",
        (next) => {
          next.workspace_status = targetStatus;
        },
        {
          from_status: current.workspace_status,
          to_status: targetStatus,
        },
      );
    }

    async restoreProject(projectId) {
      return this._transition(projectId, "PROJECT_RESTORED_FROM_ARCHIVE", (next) => {
        if (next.workspace_status !== "ARCHIVED") {
          throw new ProjectRepositoryError(
            "INVALID_LIFECYCLE_TRANSITION",
            "Проект не находится в архиве.",
          );
        }
        next.workspace_status = ACTIVE_STATUSES.has(next.status_before_archive)
          ? next.status_before_archive
          : "PAUSED";
        next.status_before_archive = null;
        next.archived_at = null;
      });
    }

    async softDeleteProject(projectId) {
      const current = await this._validatedCurrentProject(projectId);
      if (current.workspace_status === "DELETED") {
        return clone(current);
      }
      const timestamp = utcNow();
      return this._mutateProject(
        projectId,
        "PROJECT_DELETED",
        (next) => {
          next.status_before_delete = next.workspace_status;
          next.workspace_status = "DELETED";
          next.deleted_at = timestamp;
          next.purge_after = new Date(
            Date.parse(timestamp) + DELETE_RETENTION_MS,
          ).toISOString();
        },
        {},
        { timestamp },
      );
    }

    async restoreDeletedProject(projectId) {
      return this._transition(
        projectId,
        "PROJECT_RESTORED_FROM_TRASH",
        (next) => {
          if (next.workspace_status !== "DELETED") {
            throw new ProjectRepositoryError(
              "INVALID_LIFECYCLE_TRANSITION",
              "Проект не находится в корзине.",
            );
          }
          next.workspace_status = RESTORABLE_STATUSES.has(
            next.status_before_delete,
          )
            ? next.status_before_delete
            : "PAUSED";
          next.status_before_delete = null;
          next.deleted_at = null;
          next.purge_after = null;
        },
      );
    }

    async permanentlyDeleteProject(projectId, options = {}) {
      if (options.confirmed !== true) {
        throw new ProjectRepositoryError(
          "CONFIRMATION_REQUIRED",
          "Для безвозвратного удаления требуется явное подтверждение.",
        );
      }
      return this._serialize(projectId, async () => {
        const project = await this._validatedCurrentProject(projectId);
        if (project.workspace_status !== "DELETED") {
          throw new ProjectRepositoryError(
            "INVALID_LIFECYCLE_TRANSITION",
            "Сначала переместите проект в корзину.",
          );
        }
        const database = await this._database();
        const [calculations, progress, operations, checkpoints, photos, patternFiles] =
          await Promise.all([
            readByProject(database, "calculations", "by_project_created", projectId),
            readByProject(database, "progress", "by_project_updated", projectId),
            readByProject(database, "operations", "by_project_time", projectId),
            readByProject(database, "checkpoints", "by_project_created", projectId),
            readByProject(database, "photos", "by_project_created", projectId),
            readByProject(database, "pattern_files", "by_project_created", projectId),
          ]);
        const photoBlobs = [];
        for (const photo of photos) {
          const tx = database.transaction("photo_blobs", "readonly");
          const blobs = await requestResult(
            tx
              .objectStore("photo_blobs")
              .index("by_photo_variant")
              .getAll(
                global.IDBKeyRange.bound(
                  [photo.photo_id, ""],
                  [photo.photo_id, "\uffff"],
                ),
              ),
          );
          await transactionComplete(tx);
          photoBlobs.push(...blobs);
        }
        const patternFileBlobs = [];
        for (const file of patternFiles) {
          const tx = database.transaction("pattern_file_blobs", "readonly");
          const blob = await requestResult(
            tx.objectStore("pattern_file_blobs").index("by_pattern_file").get(file.pattern_file_id),
          );
          await transactionComplete(tx);
          if (blob) patternFileBlobs.push(blob);
        }
        const transaction = database.transaction(
          [
            "projects",
            "calculations",
            "progress",
            "operations",
            "checkpoints",
            "photos",
            "photo_blobs",
            "pattern_files",
            "pattern_file_blobs",
            "meta",
          ],
          "readwrite",
        );
        try {
          transaction.objectStore("projects").delete(projectId);
          calculations.forEach((entry) =>
            transaction.objectStore("calculations").delete(entry.calculation_id),
          );
          progress.forEach((entry) =>
            transaction.objectStore("progress").delete(entry.progress_id),
          );
          operations.forEach((entry) =>
            transaction.objectStore("operations").delete(entry.operation_id),
          );
          checkpoints.forEach((entry) =>
            transaction.objectStore("checkpoints").delete(entry.checkpoint_id),
          );
          photos.forEach((entry) =>
            transaction.objectStore("photos").delete(entry.photo_id),
          );
          photoBlobs.forEach((entry) =>
            transaction.objectStore("photo_blobs").delete(entry.blob_id),
          );
          patternFiles.forEach((entry) =>
            transaction.objectStore("pattern_files").delete(entry.pattern_file_id),
          );
          patternFileBlobs.forEach((entry) =>
            transaction.objectStore("pattern_file_blobs").delete(entry.blob_id),
          );
          transaction.objectStore("meta").put({
            key: `project_tombstone:${projectId}`,
            project_id: projectId,
            deleted_at: project.deleted_at,
            purged_at: utcNow(),
            revision: project.revision,
          });
          await transactionComplete(transaction);
        } catch (error) {
          throw mapStorageError(error);
        }
        this._notify(projectId, project.revision, "PROJECT_PURGED");
        return {
          project_id: projectId,
          deleted_related: {
            calculations: calculations.length,
            progress: progress.length,
            operations: operations.length,
            checkpoints: checkpoints.length,
            photos: photos.length,
            photo_blobs: photoBlobs.length,
            pattern_files: patternFiles.length,
            pattern_file_blobs: patternFileBlobs.length,
          },
        };
      });
    }

    async duplicateProject(projectId, options = {}) {
      const source = await this.getProject(projectId);
      if (source.project.workspace_status === "DELETED") {
        throw new ProjectRepositoryError(
          "INVALID_LIFECYCLE_TRANSITION",
          "Восстановите проект из корзины перед дублированием.",
        );
      }
      const timestamp = utcNow();
      const newProjectId = uuidv7();
      const suffix = " — копия";
      const maximumBase = 120 - [...suffix].length;
      const title = normalizeTitle(
        options.title ??
          `${[...source.project.title].slice(0, maximumBase).join("")}${suffix}`,
      );
      const project = baseProject(
        newProjectId,
        title,
        source.project.notes,
        timestamp,
      );
      project.duplicated_from_project_id = projectId;
      project.draft_input = clone(source.project.draft_input);
      project.has_unfinished_calculation =
        source.project.has_unfinished_calculation;
      const calculationMap = new Map();
      const calculations = source.calculations.map((entry) => {
        const calculationId = uuidv7();
        calculationMap.set(entry.calculation_id, calculationId);
        return {
          ...clone(entry),
          calculation_id: calculationId,
          project_id: newProjectId,
          created_at: timestamp,
          created_by_device_id: null,
          supersedes_calculation_id: null,
        };
      });
      if (source.project.active_calculation_id) {
        project.active_calculation_id =
          calculationMap.get(source.project.active_calculation_id) ?? null;
      }
      project.materialized_checksum = await checksumPayload(
        projectChecksumPayload(project),
      );
      const progress = project.active_calculation_id
        ? DEFAULT_CALCULATION_PROGRESS_KINDS.map((kind) =>
            this._initialProgress(
              newProjectId,
              project.active_calculation_id,
              kind,
              timestamp,
            ),
          )
        : [];
      const operation = createOperation(
        project,
        "PROJECT_DUPLICATED",
        { source_project_id: projectId },
        timestamp,
        0,
        1,
      );
      const checkpoint = createCheckpoint(
        project,
        project.materialized_checksum,
        1,
        timestamp,
      );
      const previousCheckpoint = createCheckpoint(
        project,
        project.materialized_checksum,
        0,
        timestamp,
      );
      const database = await this._database();
      const transaction = database.transaction(
        ["projects", "calculations", "progress", "operations", "checkpoints", "meta"],
        "readwrite",
      );
      try {
        await allocateOperationMetadata(transaction, operation);
        transaction.objectStore("projects").add(project);
        calculations.forEach((entry) =>
          transaction.objectStore("calculations").add(entry),
        );
        progress.forEach((entry) => transaction.objectStore("progress").add(entry));
        transaction.objectStore("operations").add(operation);
        transaction.objectStore("checkpoints").add(previousCheckpoint);
        transaction.objectStore("checkpoints").add(checkpoint);
        await transactionComplete(transaction);
      } catch (error) {
        throw mapStorageError(error);
      }
      this._notify(newProjectId, 1, "PROJECT_DUPLICATED");
      return clone(project);
    }

    _initialProgress(projectId, calculationId, kind, timestamp) {
      return {
        schema_version: RECORD_SCHEMA_VERSION,
        progress_id: uuidv7(),
        project_id: projectId,
        calculation_id: calculationId,
        partition_key: PARTITION_KEY,
        kind,
        epoch: 1,
        state:
          kind === "SMART_START"
            ? { current_step: 0, completed: false }
            : kind === "FIRST_FABRIC_SECTION"
              ? { version: 0, initialized: false }
              : kind === "FIRST_SIMPLE_SHAPING"
                ? { version: 0, initialized: false }
              : kind === "FIRST_BIND_OFF"
                ? { version: 0, initialized: false }
              : kind === "SECOND_IDENTICAL_PIECE"
                ? { version: 0, initialized: false }
              : kind === "FIRST_ASSEMBLY_PREPARATION"
                ? { version: 0, initialized: false }
              : kind === "FIRST_ASSEMBLY_JOIN"
                ? { version: 0, initialized: false }
              : kind === "FIRST_ASSEMBLY_INSPECTION"
                ? { version: 0, initialized: false }
              : kind === "FIRST_TAIL_SECURING"
                ? { version: 0, initialized: false }
              : kind === "FIRST_BLOCKING"
                ? { version: 0, initialized: false }
              : kind === "PATTERN_IMPORT"
                ? { version: 0, initialized: false }
              : {
                  current_row: 1,
                  current_stitch: 0,
                  completed_rows: [],
                },
        created_at: timestamp,
        updated_at: timestamp,
        revision: 1,
        deleted_at: null,
        purge_after: null,
        sync_status: "LOCAL_ONLY",
        server_version: null,
        last_synced_at: null,
        conflict_id: null,
      };
    }

    async addCalculation(projectId, requestPayload, resultPayload, options = {}) {
      if (!requestPayload || typeof requestPayload !== "object") {
        throw new ProjectRepositoryError(
          "INVALID_CALCULATION_INPUT",
          "Входные данные расчёта имеют неверный формат.",
        );
      }
      if (
        !resultPayload ||
        !["READY", "READY_WITH_WARNINGS"].includes(resultPayload.status)
      ) {
        throw new ProjectRepositoryError(
          "INVALID_CALCULATION_RESULT",
          "Можно сохранить только успешно завершённый расчёт.",
        );
      }
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId);
        if (before.workspace_status === "DELETED") {
          throw new ProjectRepositoryError(
            "INVALID_LIFECYCLE_TRANSITION",
            "Нельзя добавить расчёт в проект из корзины.",
          );
        }
        const timestamp = utcNow();
        const calculationId = uuidv7();
        const fingerprint = await checksumPayload({
          request: requestPayload,
          normalized_inputs: resultPayload.normalized_inputs ?? null,
          result: resultPayload,
        });
        const calculation = {
          schema_version: RECORD_SCHEMA_VERSION,
          calculation_id: calculationId,
          project_id: projectId,
          partition_key: PARTITION_KEY,
          fingerprint,
          request: clone(requestPayload),
          normalized_input: clone(resultPayload.normalized_inputs ?? null),
          result: clone(resultPayload),
          domain_status: resultPayload.status,
          warnings: clone(resultPayload.warnings ?? []),
          diagnostics: {
            errors: clone(resultPayload.errors ?? []),
            clarifications: clone(resultPayload.clarifications ?? []),
          },
          engine_version: options.engine_version ?? null,
          canon_version: resultPayload.canon_version ?? null,
          specification_version: resultPayload.specification_version ?? null,
          created_at: timestamp,
          created_by_device_id: null,
          supersedes_calculation_id: before.active_calculation_id,
          payload_checksum: await checksumPayload({
            request: requestPayload,
            result: resultPayload,
          }),
          sync_status: "LOCAL_ONLY",
          server_version: null,
        };
        const next = clone(before);
        next.active_calculation_id = calculationId;
        next.draft_input = clone(requestPayload);
        next.has_unfinished_calculation = false;
        if (next.workspace_status === "DRAFT") {
          next.workspace_status = "ACTIVE";
        }
        next.updated_at = timestamp;
        next.revision += 1;
        next.materialized_checksum = await checksumPayload(
          projectChecksumPayload(next),
        );
        const progress = DEFAULT_CALCULATION_PROGRESS_KINDS.map((kind) =>
          this._initialProgress(projectId, calculationId, kind, timestamp),
        );
        const operation = createOperation(
          next,
          "CALCULATION_CREATED",
          {
            calculation_id: calculationId,
            supersedes_calculation_id: calculation.supersedes_calculation_id,
          },
          timestamp,
          before.revision,
          next.revision,
        );
        const checkpoint = createCheckpoint(
          next,
          next.materialized_checksum,
          next.revision,
          timestamp,
        );
        const database = await this._database();
        const transaction = database.transaction(
          ["projects", "calculations", "progress", "operations", "checkpoints", "meta"],
          "readwrite",
        );
        try {
          const current = await requestResult(
            transaction.objectStore("projects").get(projectId),
          );
          if (!current || current.revision !== before.revision) {
            transaction.abort();
            throw new ProjectRepositoryError(
              "REVISION_CONFLICT",
              "Проект изменён параллельно; расчёт не был перезаписан.",
            );
          }
          await allocateOperationMetadata(transaction, operation);
          calculation.created_by_device_id = operation.device_id;
          transaction.objectStore("calculations").add(calculation);
          progress.forEach((entry) => transaction.objectStore("progress").add(entry));
          transaction.objectStore("projects").put(next);
          transaction.objectStore("operations").add(operation);
          transaction.objectStore("checkpoints").add(checkpoint);
          await transactionComplete(transaction);
        } catch (error) {
          throw mapStorageError(error);
        }
        await this.clearRecoveryDraft(projectId);
        this._notify(projectId, next.revision, "CALCULATION_CREATED");
        return {
          project: clone(next),
          calculation: clone(calculation),
          progress: clone(progress),
        };
      });
    }

    async stageRecoveryDraft(projectId, patch) {
      if (!patch || typeof patch !== "object") {
        return;
      }
      const project = await this._validatedCurrentProject(projectId);
      const timestamp = utcNow();
      const snapshot = {
        project_id: projectId,
        base_revision: project.revision,
        patch: clone(patch),
        staged_at: timestamp,
      };
      const checksum = await checksumPayload(snapshot);
      const checkpoint = {
        schema_version: RECORD_SCHEMA_VERSION,
        checkpoint_id: uuidv7(),
        project_id: projectId,
        aggregate_type: "RECOVERY_DRAFT",
        aggregate_id: projectId,
        revision: project.revision,
        generation: Date.now(),
        snapshot,
        payload_checksum: checksum,
        included_operation_from: null,
        included_operation_to: null,
        created_at: timestamp,
        retention_until: new Date(
          Date.parse(timestamp) + 24 * 60 * 60 * 1000,
        ).toISOString(),
        validation_status: "PENDING_DRAFT",
      };
      const database = await this._database();
      const transaction = database.transaction("checkpoints", "readwrite");
      transaction.objectStore("checkpoints").add(checkpoint);
      try {
        await transactionComplete(transaction);
      } catch (error) {
        throw mapStorageError(error);
      }
    }

    async _readLatestRecoveryDraft(projectId) {
      const database = await this._database();
      const checkpoints = await readByProject(
        database,
        "checkpoints",
        "by_project_created",
        projectId,
      );
      const drafts = checkpoints
        .filter(
          (entry) =>
            entry.aggregate_type === "RECOVERY_DRAFT" &&
            entry.validation_status === "PENDING_DRAFT",
        )
        .sort((left, right) => right.created_at.localeCompare(left.created_at));
      for (const draft of drafts) {
        try {
          const checksum = await checksumPayload(draft.snapshot);
          if (
            checksum === draft.payload_checksum &&
            draft.snapshot.project_id === projectId
          ) {
            return clone(draft.snapshot);
          }
        } catch {
          // Corrupted recovery drafts never block project opening.
        }
      }
      return null;
    }

    async clearRecoveryDraft(projectId) {
      const database = await this._database();
      const checkpoints = await readByProject(
        database,
        "checkpoints",
        "by_project_created",
        projectId,
      );
      const draftIds = checkpoints
        .filter((entry) => entry.aggregate_type === "RECOVERY_DRAFT")
        .map((entry) => entry.checkpoint_id);
      if (!draftIds.length) {
        return;
      }
      const transaction = database.transaction("checkpoints", "readwrite");
      draftIds.forEach((id) => transaction.objectStore("checkpoints").delete(id));
      try {
        await transactionComplete(transaction);
      } catch (error) {
        throw mapStorageError(error);
      }
    }

    async savePatternFile(projectId, materialId, blob, metadata = {}) {
      if (!isUuidv7(projectId) || typeof materialId !== "string" || !materialId.trim()) {
        throw new ProjectRepositoryError(
          "INVALID_PATTERN_FILE_SCOPE",
          "Не удалось связать файл с импортом материалов.",
        );
      }
      if (!(blob instanceof Blob) || blob.size <= 0 || blob.size > 50 * 1024 * 1024) {
        throw new ProjectRepositoryError(
          "INVALID_PATTERN_FILE",
          "Файл пуст или превышает безопасный лимит 50 МБ.",
        );
      }
      await this._validatedCurrentProject(projectId);
      const database = await this._database();
      const existingTx = database.transaction("pattern_files", "readonly");
      const existing = await requestResult(
        existingTx.objectStore("pattern_files").index("by_project_material").get([projectId, materialId]),
      );
      await transactionComplete(existingTx);
      if (existing) return clone(existing);
      const timestamp = utcNow();
      const bytes = await blob.arrayBuffer();
      const hash = await global.crypto.subtle.digest("SHA-256", bytes);
      const checksum = [...new Uint8Array(hash)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const patternFileId = uuidv7();
      const record = {
        schema_version: 1,
        pattern_file_id: patternFileId,
        project_id: projectId,
        material_id: materialId,
        display_name: String(metadata.displayName ?? "material").slice(0, 200),
        media_type: String(metadata.mediaType ?? blob.type ?? "application/octet-stream").slice(0, 120),
        byte_size: blob.size,
        checksum,
        created_at: timestamp,
        updated_at: timestamp,
      };
      const blobRecord = {
        blob_id: uuidv7(),
        pattern_file_id: patternFileId,
        blob,
        byte_size: blob.size,
        checksum,
        created_at: timestamp,
      };
      const transaction = database.transaction(
        ["pattern_files", "pattern_file_blobs"],
        "readwrite",
      );
      try {
        transaction.objectStore("pattern_files").add(record);
        transaction.objectStore("pattern_file_blobs").add(blobRecord);
        await transactionComplete(transaction);
      } catch (error) {
        throw mapStorageError(error);
      }
      return clone(record);
    }

    async getPatternFile(projectId, materialId) {
      const database = await this._database();
      const metadataTx = database.transaction("pattern_files", "readonly");
      const metadata = await requestResult(
        metadataTx.objectStore("pattern_files").index("by_project_material").get([projectId, materialId]),
      );
      await transactionComplete(metadataTx);
      if (!metadata) return null;
      const blobTx = database.transaction("pattern_file_blobs", "readonly");
      const blobRecord = await requestResult(
        blobTx.objectStore("pattern_file_blobs").index("by_pattern_file").get(metadata.pattern_file_id),
      );
      await transactionComplete(blobTx);
      if (!blobRecord) return null;
      return { metadata: clone(metadata), blob: blobRecord.blob };
    }

    async deletePatternFile(projectId, materialId) {
      const database = await this._database();
      const readTx = database.transaction("pattern_files", "readonly");
      const metadata = await requestResult(
        readTx.objectStore("pattern_files").index("by_project_material").get([projectId, materialId]),
      );
      await transactionComplete(readTx);
      if (!metadata) return false;
      const blobReadTx = database.transaction("pattern_file_blobs", "readonly");
      const blobRecord = await requestResult(
        blobReadTx.objectStore("pattern_file_blobs").index("by_pattern_file").get(metadata.pattern_file_id),
      );
      await transactionComplete(blobReadTx);
      const transaction = database.transaction(
        ["pattern_files", "pattern_file_blobs"],
        "readwrite",
      );
      transaction.objectStore("pattern_files").delete(metadata.pattern_file_id);
      if (blobRecord) transaction.objectStore("pattern_file_blobs").delete(blobRecord.blob_id);
      await transactionComplete(transaction);
      return true;
    }

    async getPatternContentExtraction(projectId, calculationId) {
      return this.getCalculationProgress(
        projectId,
        calculationId,
        "PATTERN_CONTENT_EXTRACTION",
      );
    }

    async ensurePatternContentExtraction(projectId, calculationId, state, options = {}) {
      if (state?.status !== "waiting") {
        throw new ProjectRepositoryError(
          "INVALID_EXTRACTION_INITIAL_STATE",
          "Начальная запись извлечения должна ожидать запуска.",
        );
      }
      return this.ensureCalculationProgress(
        projectId,
        calculationId,
        "PATTERN_CONTENT_EXTRACTION",
        state,
        options,
      );
    }

    async _transitionPatternContentExtraction(
      projectId,
      calculationId,
      state,
      allowedFrom,
      allowedTo,
      options = {},
    ) {
      const current = await this.getPatternContentExtraction(projectId, calculationId);
      if (!current || !allowedFrom.includes(current.state?.status) || !allowedTo.includes(state?.status)) {
        throw new ProjectRepositoryError(
          "PATTERN_CONTENT_EXTRACTION_TRANSITION_INVALID",
          "Недопустимый переход состояния извлечения содержимого.",
        );
      }
      if (
        state.projectId !== projectId ||
        state.kind !== "PATTERN_CONTENT_EXTRACTION" ||
        state.revision !== current.state.revision + 1 ||
        state.filesCount !== current.state.filesCount
      ) {
        throw new ProjectRepositoryError(
          "PATTERN_CONTENT_EXTRACTION_REVISION_INVALID",
          "Ревизия записи извлечения содержимого недопустима.",
        );
      }
      for (const field of ["sourceImportId", "sourceImportRevision", "sourceAnalysisId", "sourceAnalysisRevision"]) {
        if (current.state[field] !== state[field]) {
          throw new ProjectRepositoryError(
            "SOURCE_REVISION_MISMATCH",
            "Связи исходного импорта или анализа изменились.",
          );
        }
      }
      return this.updateCalculationProgress(
        projectId,
        calculationId,
        "PATTERN_CONTENT_EXTRACTION",
        state,
        { ...options, baseProgressRevision: current.revision },
      );
    }

    async startPatternContentExtraction(projectId, calculationId, state, options = {}) {
      return this._transitionPatternContentExtraction(
        projectId, calculationId, state,
        ["waiting", "partial", "failed", "completed"], ["extracting"], options,
      );
    }

    async completePatternContentExtraction(projectId, calculationId, state, options = {}) {
      return this._transitionPatternContentExtraction(
        projectId, calculationId, state, ["extracting"], ["completed", "partial"], options,
      );
    }

    async failPatternContentExtraction(projectId, calculationId, state, options = {}) {
      return this._transitionPatternContentExtraction(
        projectId, calculationId, state, ["waiting", "extracting"], ["failed"], options,
      );
    }

    async retryPatternContentExtraction(projectId, calculationId, state, options = {}) {
      return this.startPatternContentExtraction(projectId, calculationId, state, options);
    }

    async addPhoto(projectId, blob, metadata = {}) {
      if (!(blob instanceof Blob) || !blob.type.startsWith("image/")) {
        throw new ProjectRepositoryError(
          "INVALID_PHOTO",
          "Выберите поддерживаемый файл изображения.",
        );
      }
      if (blob.size <= 0 || blob.size > MAX_PHOTO_BYTES) {
        throw new ProjectRepositoryError(
          "PHOTO_TOO_LARGE",
          "Изображение должно быть меньше 20 МБ.",
        );
      }
      const project = await this._validatedCurrentProject(projectId);
      if (project.workspace_status === "DELETED") {
        throw new ProjectRepositoryError(
          "INVALID_LIFECYCLE_TRANSITION",
          "Нельзя добавить фото в проект из корзины.",
        );
      }
      const timestamp = utcNow();
      const bytes = await blob.arrayBuffer();
      const hash = await global.crypto.subtle.digest("SHA-256", bytes);
      const sha256 = [...new Uint8Array(hash)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const photoId = uuidv7();
      const photo = {
        schema_version: 1,
        photo_id: photoId,
        project_id: projectId,
        partition_key: PARTITION_KEY,
        purpose: metadata.purpose ?? "PROJECT_REFERENCE",
        calculation_id: metadata.calculation_id ?? null,
        display_name: String(metadata.display_name ?? "Изображение").slice(0, 120),
        source_mime: blob.type,
        normalized_mime: blob.type,
        byte_size: blob.size,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        orientation: null,
        sha256,
        status: "READY",
        privacy_class: "PRIVATE",
        consent_state: "LOCAL_ONLY",
        sync_policy: "NEVER",
        created_at: timestamp,
        updated_at: timestamp,
        deleted_at: null,
        purge_after: null,
        revision: 1,
        remote_object_key: null,
        upload_status: "LOCAL_ONLY",
        server_version: null,
        last_synced_at: null,
      };
      const photoBlob = {
        blob_id: uuidv7(),
        photo_id: photoId,
        variant_kind: "ORIGINAL",
        blob,
        mime: blob.type,
        byte_size: blob.size,
        width: photo.width,
        height: photo.height,
        checksum: sha256,
        storage_state: "LOCAL",
        upload_state: "LOCAL_ONLY",
        created_at: timestamp,
        updated_at: timestamp,
        last_accessed_at: timestamp,
        purge_after: null,
      };
      const operation = createOperation(
        project,
        "PHOTO_ADDED",
        { photo_id: photoId },
        timestamp,
        project.revision,
        project.revision,
      );
      const database = await this._database();
      const transaction = database.transaction(
        ["photos", "photo_blobs", "operations", "meta"],
        "readwrite",
      );
      try {
        await allocateOperationMetadata(transaction, operation);
        transaction.objectStore("photos").add(photo);
        transaction.objectStore("photo_blobs").add(photoBlob);
        transaction.objectStore("operations").add(operation);
        await transactionComplete(transaction);
      } catch (error) {
        throw mapStorageError(error);
      }
      return clone(photo);
    }

    async exportProject(projectId) {
      const aggregate = await this.getProject(projectId);
      if (aggregate.project.workspace_status === "DELETED") {
        throw new ProjectRepositoryError(
          "EXPORT_DELETED_PROJECT",
          "Восстановите проект из корзины перед экспортом.",
        );
      }
      const payload = {
        project: clone(aggregate.project),
        calculations: clone(aggregate.calculations),
        progress: clone(aggregate.progress),
        events: clone(aggregate.operations),
        photos: aggregate.photos.map((photo) => ({
          ...clone(photo),
          binary_omitted: true,
        })),
        media_policy: "binary_omitted",
      };
      const envelope = {
        format: EXPORT_FORMAT,
        schema_version: EXPORT_SCHEMA_VERSION,
        export_id: uuidv7(),
        exported_at: utcNow(),
        application_version: "0.1.0",
        payload,
        payload_checksum: await checksumPayload(payload),
      };
      return {
        envelope,
        json: `${canonicalize(envelope)}\n`,
        filename: `${projectId}.yarnai-project.json`,
        mime_type: "application/json",
      };
    }

    async _readImportSource(source) {
      if (source instanceof Blob) {
        if (source.size > MAX_IMPORT_BYTES) {
          throw new ProjectRepositoryError(
            "IMPORT_TOO_LARGE",
            "Файл проекта превышает допустимый размер 5 МБ.",
          );
        }
        return source.text();
      }
      if (typeof source === "string") {
        if (new TextEncoder().encode(source).byteLength > MAX_IMPORT_BYTES) {
          throw new ProjectRepositoryError(
            "IMPORT_TOO_LARGE",
            "Файл проекта превышает допустимый размер 5 МБ.",
          );
        }
        return source;
      }
      if (source && typeof source === "object") {
        return JSON.stringify(source);
      }
      throw new ProjectRepositoryError(
        "INVALID_IMPORT",
        "Выбранный файл не является проектом YarnAI.",
      );
    }

    async importProject(source) {
      const text = await this._readImportSource(source);
      let envelope;
      try {
        envelope = JSON.parse(text);
      } catch {
        throw new ProjectRepositoryError(
          "INVALID_IMPORT_JSON",
          "Файл проекта содержит некорректный JSON.",
        );
      }
      if (!envelope || envelope.format !== EXPORT_FORMAT) {
        throw new ProjectRepositoryError(
          "INVALID_IMPORT_FORMAT",
          "Файл не является экспортом проекта YarnAI.",
        );
      }
      if (envelope.schema_version !== EXPORT_SCHEMA_VERSION) {
        throw new ProjectRepositoryError(
          "UNSUPPORTED_SCHEMA_VERSION",
          "Версия импортируемого проекта не поддерживается.",
          { details: { schema_version: envelope.schema_version } },
        );
      }
      if (!isUuidv7(envelope.export_id) || !isTimestamp(envelope.exported_at)) {
        throw new ProjectRepositoryError(
          "INVALID_IMPORT_METADATA",
          "Служебные данные файла проекта повреждены.",
        );
      }
      if (!envelope.payload || typeof envelope.payload !== "object") {
        throw new ProjectRepositoryError(
          "INVALID_IMPORT_PAYLOAD",
          "В файле отсутствуют данные проекта.",
        );
      }
      const actualChecksum = await checksumPayload(envelope.payload);
      if (actualChecksum !== envelope.payload_checksum) {
        throw new ProjectRepositoryError(
          "IMPORT_CHECKSUM_MISMATCH",
          "Контрольная сумма файла не совпадает. Импорт отменён.",
        );
      }
      const sourceProject = clone(envelope.payload.project);
      validateProjectRecord(sourceProject);
      if (sourceProject.workspace_status === "DELETED") {
        throw new ProjectRepositoryError(
          "INVALID_IMPORT_STATUS",
          "Экспорт удалённого проекта не поддерживается.",
        );
      }
      const calculations = Array.isArray(envelope.payload.calculations)
        ? clone(envelope.payload.calculations)
        : null;
      const progress = Array.isArray(envelope.payload.progress)
        ? clone(envelope.payload.progress)
        : null;
      const events = Array.isArray(envelope.payload.events)
        ? clone(envelope.payload.events)
        : null;
      if (!calculations || !progress || !events) {
        throw new ProjectRepositoryError(
          "INVALID_IMPORT_STRUCTURE",
          "Файл проекта не содержит обязательные связанные записи.",
        );
      }
      calculations.forEach((entry) =>
        validateCalculationRecord(entry, sourceProject.project_id),
      );
      if (
        sourceProject.active_calculation_id &&
        !calculations.some(
          (entry) =>
            entry.calculation_id === sourceProject.active_calculation_id,
        )
      ) {
        throw new ProjectRepositoryError(
          "INVALID_IMPORT_REFERENCE",
          "Файл ссылается на отсутствующий активный расчёт.",
        );
      }
      const database = await this._database();
      const receiptTransaction = database.transaction(
        "transfer_receipts",
        "readonly",
      );
      const existingReceipt = await requestResult(
        receiptTransaction
          .objectStore("transfer_receipts")
          .index("by_external_checksum")
          .get(["IMPORT", envelope.export_id, envelope.payload_checksum]),
      );
      await transactionComplete(receiptTransaction);
      if (existingReceipt) {
        return {
          status: "ALREADY_IMPORTED",
          project_id: existingReceipt.project_id,
          collision: existingReceipt.collision,
        };
      }
      const existingProject = await this._getRawProject(sourceProject.project_id);
      const collision = Boolean(existingProject);
      const sourceProjectId = sourceProject.project_id;
      const projectId = collision ? uuidv7() : sourceProjectId;
      const calculationMap = new Map();
      if (collision) {
        calculations.forEach((entry) =>
          calculationMap.set(entry.calculation_id, uuidv7()),
        );
      }
      const importedProject = clone(sourceProject);
      importedProject.project_id = projectId;
      importedProject.partition_key = PARTITION_KEY;
      importedProject.owner_user_id = null;
      importedProject.imported_from_project_id = collision
        ? sourceProjectId
        : importedProject.imported_from_project_id;
      if (collision && importedProject.active_calculation_id) {
        importedProject.active_calculation_id = calculationMap.get(
          importedProject.active_calculation_id,
        );
      }
      if (collision) {
        importedProject.created_at = utcNow();
        importedProject.updated_at = importedProject.created_at;
        importedProject.last_opened_at = null;
        importedProject.revision = 1;
      }
      importedProject.materialized_checksum = await checksumPayload(
        projectChecksumPayload(importedProject),
      );
      const importedCalculations = calculations.map((entry) => ({
        ...entry,
        project_id: projectId,
        calculation_id: collision
          ? calculationMap.get(entry.calculation_id)
          : entry.calculation_id,
        supersedes_calculation_id:
          collision && entry.supersedes_calculation_id
            ? calculationMap.get(entry.supersedes_calculation_id) ?? null
            : entry.supersedes_calculation_id,
      }));
      const progressMap = new Map();
      const importedProgress = progress.map((entry) => {
        if (
          entry.project_id !== sourceProjectId ||
          !isUuidv7(entry.progress_id) ||
          !SUPPORTED_CALCULATION_PROGRESS_KINDS.includes(entry.kind)
        ) {
          throw new ProjectRepositoryError(
            "INVALID_IMPORT_PROGRESS",
            "Файл содержит повреждённый прогресс проекта.",
          );
        }
        const progressId = collision ? uuidv7() : entry.progress_id;
        progressMap.set(entry.progress_id, progressId);
        const importedState = clone(entry.state);
        if (
          collision &&
          importedState?.projectId === sourceProjectId
        ) {
          importedState.projectId = projectId;
        }
        return {
          ...entry,
          progress_id: progressId,
          project_id: projectId,
          calculation_id: collision
            ? calculationMap.get(entry.calculation_id)
            : entry.calculation_id,
          partition_key: PARTITION_KEY,
          state: importedState,
        };
      });
      const timestamp = utcNow();
      importedProgress.forEach((entry) => {
        if (entry.kind !== "PATTERN_CONTENT_EXTRACTION") return;
        const sourceImportId = progressMap.get(entry.state?.sourceImportId);
        const sourceAnalysisId = progressMap.get(entry.state?.sourceAnalysisId);
        if (!sourceImportId || !sourceAnalysisId) {
          throw new ProjectRepositoryError(
            "INVALID_IMPORT_REFERENCE",
            "Запись извлечения ссылается на отсутствующий импорт или анализ.",
          );
        }
        entry.state.sourceImportId = sourceImportId;
        entry.state.sourceAnalysisId = sourceAnalysisId;
        entry.state.status = "failed";
        entry.state.revision = Math.max(1, Number(entry.state.revision) || 1) + 1;
        entry.state.updatedAt = timestamp;
        entry.state.startedAt = entry.state.startedAt || timestamp;
        entry.state.completedAt = timestamp;
        entry.state.processedFilesCount = 0;
        entry.state.successfulFilesCount = 0;
        entry.state.unsupportedFilesCount = 0;
        entry.state.failedFilesCount = 0;
        entry.state.error = {
          code: "file_blob_missing",
          message: "Бинарные материалы не входят в экспорт; добавьте исходные файлы локально и повторите извлечение.",
        };
        entry.state.result = {
          schemaVersion: 1,
          files: [],
          combinedText: "",
          warnings: [
            {
              code: "file_blob_missing",
              message: "Бинарные материалы не были перенесены вместе с проектом.",
            },
          ],
        };
      });
      const importedEvents = events.map((entry) => ({
        ...entry,
        operation_id: collision ? uuidv7() : entry.operation_id,
        project_id: projectId,
        aggregate_id:
          entry.aggregate_type === "PROJECT" ? projectId : entry.aggregate_id,
        partition_key: PARTITION_KEY,
        device_id: null,
        device_sequence: null,
        sync_status: "LOCAL_ONLY",
      }));
      const importOperation = createOperation(
        importedProject,
        "PROJECT_IMPORTED",
        {
          export_id: envelope.export_id,
          source_project_id: sourceProjectId,
          collision,
        },
        timestamp,
        importedProject.revision,
        importedProject.revision,
      );
      importedEvents.push(importOperation);
      const checkpoint = createCheckpoint(
        importedProject,
        importedProject.materialized_checksum,
        importedProject.revision,
        timestamp,
      );
      const previousCheckpoint = createCheckpoint(
        importedProject,
        importedProject.materialized_checksum,
        0,
        timestamp,
      );
      const receipt = {
        transfer_id: uuidv7(),
        transfer_kind: "IMPORT",
        external_id: envelope.export_id,
        checksum: envelope.payload_checksum,
        project_id: projectId,
        collision,
        created_at: timestamp,
      };
      const transaction = database.transaction(
        [
          "projects",
          "calculations",
          "progress",
          "operations",
          "checkpoints",
          "transfer_receipts",
          "meta",
        ],
        "readwrite",
      );
      try {
        transaction.objectStore("projects").add(importedProject);
        importedCalculations.forEach((entry) =>
          transaction.objectStore("calculations").add(entry),
        );
        importedProgress.forEach((entry) =>
          transaction.objectStore("progress").add(entry),
        );
        for (const operation of importedEvents) {
          await allocateOperationMetadata(transaction, operation);
          transaction.objectStore("operations").add(operation);
        }
        transaction.objectStore("checkpoints").add(previousCheckpoint);
        transaction.objectStore("checkpoints").add(checkpoint);
        transaction.objectStore("transfer_receipts").add(receipt);
        await transactionComplete(transaction);
      } catch (error) {
        throw mapStorageError(error, "IMPORT_ATOMIC_COMMIT_FAILED");
      }
      this._notify(projectId, importedProject.revision, "PROJECT_IMPORTED");
      return {
        status: "IMPORTED",
        project_id: projectId,
        collision,
        source_project_id: sourceProjectId,
      };
    }
  }

  class ProjectAutosave {
    constructor(repository, projectId, options = {}) {
      if (!(repository instanceof ProjectRepository) || !isUuidv7(projectId)) {
        throw new ProjectRepositoryError(
          "INVALID_AUTOSAVE_TARGET",
          "Автосохранение не может быть запущено для этого проекта.",
        );
      }
      this.repository = repository;
      this.projectId = projectId;
      this.delay = Math.min(Math.max(options.delay ?? 500, 0), 750);
      this.onStateChange = options.onStateChange ?? (() => {});
      this.state = "CLEAN";
      this.pendingPatch = {};
      this.timer = null;
      this.writePromise = Promise.resolve();
      this.recoveryTimer = null;
      this.retryDelays = options.retryDelays ?? [200, 500, 1000];
      this.destroyed = false;
    }

    _setState(state, error = null) {
      this.state = state;
      this.onStateChange({ state, error });
    }

    update(patch) {
      if (this.destroyed) {
        return;
      }
      Object.assign(this.pendingPatch, clone(patch));
      this._setState("DIRTY");
      global.clearTimeout(this.timer);
      this.timer = global.setTimeout(() => {
        this.flush().catch(() => undefined);
      }, this.delay);
      global.clearTimeout(this.recoveryTimer);
      this.recoveryTimer = global.setTimeout(() => {
        this.repository
          .stageRecoveryDraft(this.projectId, this.pendingPatch)
          .catch((error) => this._setState("SAVE_FAILED", mapStorageError(error)));
      }, Math.min(100, this.delay));
    }

    async _attempt(patch) {
      let lastError;
      for (let attempt = 0; attempt <= this.retryDelays.length; attempt += 1) {
        try {
          return await this.repository.updateProject(this.projectId, patch);
        } catch (error) {
          lastError = mapStorageError(error);
          if (!lastError.transient || attempt === this.retryDelays.length) {
            throw lastError;
          }
          await new Promise((resolve) =>
            global.setTimeout(resolve, this.retryDelays[attempt]),
          );
        }
      }
      throw lastError;
    }

    async flush() {
      if (this.destroyed || Object.keys(this.pendingPatch).length === 0) {
        return this.writePromise;
      }
      global.clearTimeout(this.timer);
      global.clearTimeout(this.recoveryTimer);
      this.timer = null;
      this.recoveryTimer = null;
      const patch = this.pendingPatch;
      this.pendingPatch = {};
      this.writePromise = this.writePromise
        .catch(() => undefined)
        .then(async () => {
          this._setState("SAVING");
          try {
            const project = await this._attempt(patch);
            await this.repository.clearRecoveryDraft(this.projectId);
            this._setState("SAVED_LOCAL");
            if (Object.keys(this.pendingPatch).length > 0) {
              global.setTimeout(() => {
                this.flush().catch(() => undefined);
              }, 0);
            }
            return project;
          } catch (error) {
            Object.assign(this.pendingPatch, patch, this.pendingPatch);
            this._setState("SAVE_FAILED", mapStorageError(error));
            throw error;
          }
        });
      return this.writePromise;
    }

    async destroy() {
      global.clearTimeout(this.timer);
      global.clearTimeout(this.recoveryTimer);
      try {
        await this.flush();
      } finally {
        this.destroyed = true;
      }
    }
  }

  global.YarnAIProjectSystem = Object.freeze({
    DB_NAME,
    DB_VERSION,
    STORE_NAMES: Object.freeze([...STORE_NAMES]),
    INDEX_MANIFEST: Object.freeze(clone(INDEX_MANIFEST)),
    ProjectRepository,
    ProjectRepositoryError,
    ProjectAutosave,
    uuidv7,
    isUuidv7,
    canonicalize,
    checksumPayload,
    applySchemaMigration,
  });
})(typeof window !== "undefined" ? window : globalThis);
