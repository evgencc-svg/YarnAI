"use strict";

(function initializeFullProjectBackup(globalObject) {
  const system = globalObject.YarnAIProjectSystem;
  const FORMAT = "yarnai-full-project-backup";
  const FORMAT_VERSION = 1;
  const MIME_TYPE = "application/vnd.yarnai.full-project-backup+json";
  const RECORD_STORES = Object.freeze([
    "projects",
    "calculations",
    "progress",
    "operations",
    "checkpoints",
    "photos",
    "photo_blobs",
    "pattern_files",
    "pattern_file_blobs",
  ]);
  const DIRECT_PROJECT_STORES = Object.freeze([
    "calculations",
    "progress",
    "operations",
    "checkpoints",
    "photos",
    "pattern_files",
  ]);
  const EXCLUDED_STORES = Object.freeze([
    "meta",
    "settings",
    "cache",
    "sync_state",
    "transfer_receipts",
    "quarantine",
    "migration_records",
  ]);
  const PRIMARY_KEYS = Object.freeze({
    projects: "project_id",
    calculations: "calculation_id",
    progress: "progress_id",
    operations: "operation_id",
    checkpoints: "checkpoint_id",
    photos: "photo_id",
    photo_blobs: "blob_id",
    pattern_files: "pattern_file_id",
    pattern_file_blobs: "blob_id",
  });
  const LIMITS = Object.freeze({
    maxBackupBytes: 192 * 1024 * 1024,
    maxBinaryBytes: 128 * 1024 * 1024,
    maxSingleBinaryBytes: 64 * 1024 * 1024,
    maxRecords: 5000,
    maxBinaryFiles: 256,
    maxDepth: 80,
    maxObjectNodes: 2000000,
  });
  const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
  const SHA256_PATTERN = /^[0-9a-f]{64}$/;
  const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

  class FullProjectBackupError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "FullProjectBackupError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = details;
    }
  }

  function fail(code, message, details = {}) {
    throw new FullProjectBackupError(code, message, details);
  }

  function clone(value) {
    if (globalObject.structuredClone) return globalObject.structuredClone(value);
    return JSON.parse(JSON.stringify(value));
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
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("transaction aborted"));
    });
  }

  function assertObject(value, code, message) {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail(code, message);
    return value;
  }

  function assertExactKeys(value, expected, code, message) {
    assertObject(value, code, message);
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
      fail(code, message, { actual, expected: wanted });
    }
  }

  function assertSafeObjectGraph(value) {
    const seen = new Set();
    let nodes = 0;
    function visit(current, depth) {
      if (!current || typeof current !== "object") return;
      if (depth > LIMITS.maxDepth) fail("BACKUP_NESTING_TOO_DEEP", "Структура резервной копии слишком глубоко вложена.");
      if (seen.has(current)) fail("BACKUP_CYCLIC_DATA", "Резервная копия содержит циклическую структуру.");
      seen.add(current);
      nodes += 1;
      if (nodes > LIMITS.maxObjectNodes) fail("BACKUP_STRUCTURE_TOO_LARGE", "В резервной копии слишком много структурных объектов.");
      if (!Array.isArray(current)) {
        for (const key of Object.keys(current)) {
          if (FORBIDDEN_KEYS.has(key)) fail("BACKUP_FORBIDDEN_KEY", `Обнаружено недопустимое поле «${key}».`);
        }
      }
      for (const child of Array.isArray(current) ? current : Object.values(current)) visit(child, depth + 1);
      seen.delete(current);
    }
    visit(value, 0);
  }

  function containsOmittedBinary(value) {
    if (value === "binary_omitted") return true;
    if (!value || typeof value !== "object") return false;
    if (!Array.isArray(value) && value.binary_omitted === true) return true;
    return (Array.isArray(value) ? value : Object.values(value)).some(containsOmittedBinary);
  }

  async function sha256Bytes(bytes) {
    const input = bytes instanceof ArrayBuffer
      ? bytes
      : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const digest = await globalObject.crypto.subtle.digest("SHA-256", input);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function sha256Value(value) {
    const bytes = new TextEncoder().encode(system.canonicalize(value));
    return sha256Bytes(bytes);
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return globalObject.btoa(binary);
  }

  function base64ToBytes(value) {
    if (typeof value !== "string" || !value.length || value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) {
      fail("BACKUP_BINARY_ENCODING_INVALID", "Бинарный файл имеет повреждённое base64-кодирование.");
    }
    let binary;
    try {
      binary = globalObject.atob(value);
    } catch {
      fail("BACKUP_BINARY_ENCODING_INVALID", "Бинарный файл имеет повреждённое base64-кодирование.");
    }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function safeFilename(title) {
    let value = String(title || "Проект")
      .normalize("NFKC")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/g, "")
      .slice(0, 90)
      .trim();
    if (!value) value = "Проект";
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) value = `Проект ${value}`;
    return `${value} — полная резервная копия.yarnai-backup.json`;
  }

  function isTimestamp(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
  }

  function manifestRecord(record, store, projectId, sha256) {
    return Object.freeze({ store, id: record[PRIMARY_KEYS[store]], project_id: projectId, sha256 });
  }

  function compareByStoreAndId(left, right) {
    return left.store.localeCompare(right.store) || left.id.localeCompare(right.id);
  }

  function directRange(projectId) {
    return globalObject.IDBKeyRange.bound([projectId, ""], [projectId, "\uffff"]);
  }

  async function collectRawClosure(repository, projectId) {
    if (!system?.isUuidv7(projectId)) fail("BACKUP_PROJECT_ID_INVALID", "Идентификатор проекта повреждён.");
    const database = await repository._database();
    const directTransaction = database.transaction(
      ["projects", "calculations", "progress", "operations", "checkpoints", "photos", "pattern_files"],
      "readonly",
    );
    const projectRequest = directTransaction.objectStore("projects").get(projectId);
    const requests = {
      calculations: directTransaction.objectStore("calculations").index("by_project_created").getAll(directRange(projectId)),
      progress: directTransaction.objectStore("progress").index("by_project_updated").getAll(directRange(projectId)),
      operations: directTransaction.objectStore("operations").index("by_project_time").getAll(directRange(projectId)),
      checkpoints: directTransaction.objectStore("checkpoints").index("by_project_created").getAll(directRange(projectId)),
      photos: directTransaction.objectStore("photos").index("by_project_created").getAll(directRange(projectId)),
      pattern_files: directTransaction.objectStore("pattern_files").index("by_project_created").getAll(directRange(projectId)),
    };
    const [project, calculations, progress, operations, checkpoints, allPhotos, patternFiles] = await Promise.all([
      requestResult(projectRequest),
      requestResult(requests.calculations),
      requestResult(requests.progress),
      requestResult(requests.operations),
      requestResult(requests.checkpoints),
      requestResult(requests.photos),
      requestResult(requests.pattern_files),
    ]);
    await transactionComplete(directTransaction);
    if (!project) fail("BACKUP_PROJECT_NOT_FOUND", "Сохранённый проект не найден.");
    if (project.workspace_status === "DELETED") fail("BACKUP_DELETED_PROJECT", "Сначала восстанови проект из корзины.");
    const photos = allPhotos.filter((entry) => !entry.deleted_at && entry.status !== "DELETED");
    const photoBlobs = [];
    const patternFileBlobs = [];
    for (const photo of photos) {
      const transaction = database.transaction("photo_blobs", "readonly");
      const entries = await requestResult(transaction.objectStore("photo_blobs").index("by_photo_variant").getAll(
        globalObject.IDBKeyRange.bound([photo.photo_id, ""], [photo.photo_id, "\uffff"]),
      ));
      await transactionComplete(transaction);
      if (!entries.length) fail("BACKUP_PHOTO_BLOB_MISSING", `Не найден файл изображения «${photo.display_name || photo.photo_id}».`);
      photoBlobs.push(...entries);
    }
    for (const file of patternFiles) {
      const transaction = database.transaction("pattern_file_blobs", "readonly");
      const entry = await requestResult(transaction.objectStore("pattern_file_blobs").index("by_pattern_file").get(file.pattern_file_id));
      await transactionComplete(transaction);
      if (!entry) fail("BACKUP_PATTERN_BLOB_MISSING", `Не найден исходный файл «${file.display_name || file.pattern_file_id}».`);
      patternFileBlobs.push(entry);
    }
    return {
      records: {
        projects: [project], calculations, progress, operations, checkpoints,
        photos, photo_blobs: photoBlobs, pattern_files: patternFiles, pattern_file_blobs: patternFileBlobs,
      },
      excludedDeletedPhotos: allPhotos.length - photos.length,
    };
  }

  async function serializeClosure(raw, projectId) {
    const records = Object.fromEntries(RECORD_STORES.map((store) => [store, []]));
    const binaries = [];
    for (const store of RECORD_STORES) {
      for (const source of raw.records[store]) {
        const record = clone(source);
        if (store !== "photo_blobs" && store !== "pattern_file_blobs") {
          records[store].push(record);
          continue;
        }
        const blob = record.blob;
        delete record.blob;
        if (!(blob instanceof Blob) || blob.size <= 0) fail("BACKUP_BINARY_MISSING", "Один из связанных файлов не содержит реальных байтов.");
        if (blob.size > LIMITS.maxSingleBinaryBytes) fail("BACKUP_BINARY_TOO_LARGE", "Один из связанных файлов превышает допустимый размер 64 МБ.");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const sha256 = await sha256Bytes(bytes);
        const parentStore = store === "photo_blobs" ? "photos" : "pattern_files";
        const parentId = store === "photo_blobs" ? record.photo_id : record.pattern_file_id;
        const parent = raw.records[parentStore].find((entry) => entry[PRIMARY_KEYS[parentStore]] === parentId);
        if (!parent) fail("BACKUP_BINARY_PARENT_MISSING", "Связанный файл ссылается на отсутствующую запись.");
        const declaredSizes = [record.byte_size, parent.byte_size].filter((value) => value !== undefined && value !== null);
        if (declaredSizes.some((value) => value !== bytes.byteLength)) fail("BACKUP_BINARY_SIZE_MISMATCH", `Размер файла «${parent.display_name || parentId}» не совпадает с сохранёнными данными.`);
        const declaredChecksums = [record.checksum, parent.checksum, parent.sha256].filter(Boolean);
        if (declaredChecksums.some((value) => value !== sha256)) fail("BACKUP_BINARY_CHECKSUM_MISMATCH", `Контрольная сумма файла «${parent.display_name || parentId}» не совпадает с его байтами.`);
        record.byte_size = bytes.byteLength;
        record.checksum = sha256;
        records[store].push(record);
        binaries.push({
          store,
          id: record.blob_id,
          parent_id: parentId,
          name: String(parent.display_name || (store === "photo_blobs" ? parent.photo_id : parent.material_id) || "Файл"),
          mime_type: String(record.mime || parent.media_type || parent.source_mime || blob.type || "application/octet-stream"),
          byte_size: bytes.byteLength,
          sha256,
          data_encoding: "base64",
          data_base64: bytesToBase64(bytes),
        });
      }
    }
    const totalRecords = RECORD_STORES.reduce((sum, store) => sum + records[store].length, 0);
    const totalBinaryBytes = binaries.reduce((sum, entry) => sum + entry.byte_size, 0);
    if (totalRecords > LIMITS.maxRecords) fail("BACKUP_TOO_MANY_RECORDS", "В проекте слишком много записей для резервной копии V1.");
    if (binaries.length > LIMITS.maxBinaryFiles) fail("BACKUP_TOO_MANY_FILES", "В проекте слишком много связанных файлов для резервной копии V1.");
    if (totalBinaryBytes > LIMITS.maxBinaryBytes) fail("BACKUP_TOTAL_BINARY_TOO_LARGE", "Связанные файлы проекта превышают общий лимит 128 МБ.");
    const structuralSha256 = await sha256Value(records);
    const recordManifest = [];
    for (const store of RECORD_STORES) {
      for (const record of records[store]) recordManifest.push(manifestRecord(record, store, projectId, await sha256Value(record)));
    }
    recordManifest.sort(compareByStoreAndId);
    binaries.sort(compareByStoreAndId);
    const binaryManifest = binaries.map(({ data_base64, ...entry }) => entry);
    return {
      records,
      binaries,
      manifest: {
        record_count: totalRecords,
        binary_file_count: binaries.length,
        total_binary_bytes: totalBinaryBytes,
        structural_sha256: structuralSha256,
        records: recordManifest,
        binaries: binaryManifest,
        excluded_stores: [...EXCLUDED_STORES],
      },
    };
  }

  function backupId() {
    const bytes = new Uint8Array(16);
    globalObject.crypto.getRandomValues(bytes);
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function createFullBackup(repository, projectId) {
    if (!system || !repository?._database) fail("BACKUP_REPOSITORY_UNAVAILABLE", "Локальное хранилище проекта недоступно.");
    const raw = await collectRawClosure(repository, projectId);
    const serialized = await serializeClosure(raw, projectId);
    const project = serialized.records.projects[0];
    const envelope = {
      format: FORMAT,
      format_version: FORMAT_VERSION,
      backup_id: backupId(),
      created_at: new Date().toISOString(),
      application_version: "0.1.0",
      source_project_id: projectId,
      project_title: project.title,
      manifest: serialized.manifest,
      data: { records: serialized.records, binaries: serialized.binaries },
    };
    const json = `${system.canonicalize(envelope)}\n`;
    if (new TextEncoder().encode(json).byteLength > LIMITS.maxBackupBytes) fail("BACKUP_FILE_TOO_LARGE", "Резервная копия превышает допустимый размер 192 МБ.");
    return {
      envelope,
      json,
      filename: safeFilename(project.title),
      mime_type: MIME_TYPE,
      report: humanReport(envelope, raw.excludedDeletedPhotos),
    };
  }

  async function readSource(source) {
    if (source instanceof Blob) {
      if (source.size <= 0 || source.size > LIMITS.maxBackupBytes) fail("BACKUP_FILE_SIZE_INVALID", "Размер файла резервной копии недопустим.");
      return source.text();
    }
    if (typeof source === "string") {
      if (!source.length || new TextEncoder().encode(source).byteLength > LIMITS.maxBackupBytes) fail("BACKUP_FILE_SIZE_INVALID", "Размер файла резервной копии недопустим.");
      return source;
    }
    if (source && typeof source === "object") return JSON.stringify(source);
    fail("BACKUP_FILE_INVALID", "Выбранный файл не является резервной копией YarnAI.");
  }

  function validateEnvelopeShape(envelope) {
    assertExactKeys(envelope, ["format", "format_version", "backup_id", "created_at", "application_version", "source_project_id", "project_title", "manifest", "data"], "BACKUP_STRUCTURE_INVALID", "Структура резервной копии не поддерживается.");
    if (envelope.format !== FORMAT) fail("BACKUP_FORMAT_INVALID", "Файл не является полной резервной копией YarnAI.");
    if (envelope.format_version !== FORMAT_VERSION) fail("BACKUP_VERSION_UNSUPPORTED", "Версия резервной копии не поддерживается.");
    if (typeof envelope.backup_id !== "string" || !/^[0-9a-f]{32}$/.test(envelope.backup_id) || !isTimestamp(envelope.created_at)) fail("BACKUP_METADATA_INVALID", "Служебные данные резервной копии повреждены.");
    if (!system.isUuidv7(envelope.source_project_id) || typeof envelope.project_title !== "string" || !envelope.project_title.trim()) fail("BACKUP_PROJECT_METADATA_INVALID", "Название или идентификатор проекта повреждены.");
    assertExactKeys(envelope.manifest, ["record_count", "binary_file_count", "total_binary_bytes", "structural_sha256", "records", "binaries", "excluded_stores"], "BACKUP_MANIFEST_INVALID", "Manifest резервной копии повреждён.");
    assertExactKeys(envelope.data, ["records", "binaries"], "BACKUP_DATA_INVALID", "Данные резервной копии повреждены.");
    assertExactKeys(envelope.data.records, RECORD_STORES, "BACKUP_RECORD_STORES_INVALID", "Набор хранилищ резервной копии повреждён.");
  }

  async function validateFullBackup(source) {
    const text = await readSource(source);
    let envelope;
    try { envelope = JSON.parse(text); }
    catch { fail("BACKUP_JSON_INVALID", "Файл резервной копии содержит некорректный JSON."); }
    assertSafeObjectGraph(envelope);
    validateEnvelopeShape(envelope);
    if (containsOmittedBinary(envelope)) fail("BACKUP_BINARY_OMITTED", "Резервная копия содержит отметку binary_omitted вместо реальных байтов.");
    const projectId = envelope.source_project_id;
    const records = envelope.data.records;
    const allIds = new Set();
    let recordCount = 0;
    for (const store of RECORD_STORES) {
      if (!Array.isArray(records[store])) fail("BACKUP_RECORD_STORE_INVALID", `Раздел ${store} должен быть списком.`);
      for (const record of records[store]) {
        assertObject(record, "BACKUP_RECORD_INVALID", `Запись ${store} повреждена.`);
        const id = record[PRIMARY_KEYS[store]];
        if (!system.isUuidv7(id) || allIds.has(id)) fail("BACKUP_DUPLICATE_ID", "Резервная копия содержит повторяющийся или повреждённый ID.", { store, id });
        allIds.add(id);
        recordCount += 1;
        if (recordCount > LIMITS.maxRecords) fail("BACKUP_TOO_MANY_RECORDS", "В резервной копии слишком много записей.");
      }
    }
    if (records.projects.length !== 1 || records.projects[0].project_id !== projectId) fail("BACKUP_PROJECT_ROOT_INVALID", "Корневая запись проекта отсутствует или не совпадает с manifest.");
    if (records.projects[0].title !== envelope.project_title) fail("BACKUP_PROJECT_TITLE_MISMATCH", "Название проекта не совпадает с корневой записью.");
    for (const store of DIRECT_PROJECT_STORES) {
      for (const record of records[store]) {
        if (record.project_id !== projectId) fail("BACKUP_FOREIGN_PROJECT_RECORD", `Раздел ${store} содержит запись другого проекта.`);
      }
    }
    const photoIds = new Set(records.photos.map((entry) => entry.photo_id));
    const patternFileIds = new Set(records.pattern_files.map((entry) => entry.pattern_file_id));
    for (const record of records.photo_blobs) if (!photoIds.has(record.photo_id)) fail("BACKUP_BLOB_REFERENCE_INVALID", "Файл изображения ссылается на отсутствующую запись.");
    for (const record of records.pattern_file_blobs) if (!patternFileIds.has(record.pattern_file_id)) fail("BACKUP_BLOB_REFERENCE_INVALID", "Исходный файл ссылается на отсутствующую запись.");
    const expectedRecordManifest = [];
    for (const store of RECORD_STORES) {
      for (const record of records[store]) expectedRecordManifest.push(manifestRecord(record, store, projectId, await sha256Value(record)));
    }
    expectedRecordManifest.sort(compareByStoreAndId);
    if (!Array.isArray(envelope.manifest.records) || system.canonicalize(envelope.manifest.records) !== system.canonicalize(expectedRecordManifest)) fail("BACKUP_RECORD_MANIFEST_MISMATCH", "Список записей manifest не совпадает с данными резервной копии.");
    const structuralSha256 = await sha256Value(records);
    if (!SHA256_PATTERN.test(envelope.manifest.structural_sha256) || envelope.manifest.structural_sha256 !== structuralSha256) fail("BACKUP_STRUCTURAL_CHECKSUM_MISMATCH", "Контрольная сумма структурных данных не совпадает.");
    if (envelope.manifest.record_count !== recordCount) fail("BACKUP_RECORD_COUNT_MISMATCH", "Количество записей не совпадает с manifest.");
    if (system.canonicalize(envelope.manifest.excluded_stores) !== system.canonicalize(EXCLUDED_STORES)) fail("BACKUP_EXCLUDED_STORES_INVALID", "Список намеренно исключённых хранилищ изменён.");
    if (!Array.isArray(envelope.data.binaries) || !Array.isArray(envelope.manifest.binaries)) fail("BACKUP_BINARY_LIST_INVALID", "Список бинарных файлов повреждён.");
    if (envelope.data.binaries.length > LIMITS.maxBinaryFiles) fail("BACKUP_TOO_MANY_FILES", "В резервной копии слишком много файлов.");
    const blobRecords = new Map([
      ...records.photo_blobs.map((entry) => [`photo_blobs:${entry.blob_id}`, entry]),
      ...records.pattern_file_blobs.map((entry) => [`pattern_file_blobs:${entry.blob_id}`, entry]),
    ]);
    const binaryIds = new Set();
    const validatedBinaries = [];
    let totalBinaryBytes = 0;
    for (const binary of envelope.data.binaries) {
      assertExactKeys(binary, ["store", "id", "parent_id", "name", "mime_type", "byte_size", "sha256", "data_encoding", "data_base64"], "BACKUP_BINARY_ENTRY_INVALID", "Описание бинарного файла повреждено.");
      if (!["photo_blobs", "pattern_file_blobs"].includes(binary.store) || !system.isUuidv7(binary.id) || binaryIds.has(binary.id)) fail("BACKUP_BINARY_ID_INVALID", "Бинарный файл имеет повторяющийся или повреждённый ID.");
      binaryIds.add(binary.id);
      const record = blobRecords.get(`${binary.store}:${binary.id}`);
      if (!record) fail("BACKUP_EXTRA_BINARY", "Резервная копия содержит лишний бинарный файл, не описанный записью.");
      const expectedParent = binary.store === "photo_blobs" ? record.photo_id : record.pattern_file_id;
      if (binary.parent_id !== expectedParent || !system.isUuidv7(binary.parent_id)) fail("BACKUP_BINARY_PARENT_MISMATCH", "Связь бинарного файла с записью повреждена.");
      if (binary.data_encoding !== "base64" || typeof binary.name !== "string" || !binary.name || typeof binary.mime_type !== "string" || !binary.mime_type) fail("BACKUP_BINARY_METADATA_INVALID", "Имя, MIME type или кодирование бинарного файла повреждены.");
      const bytes = base64ToBytes(binary.data_base64);
      if (!Number.isInteger(binary.byte_size) || binary.byte_size <= 0 || binary.byte_size > LIMITS.maxSingleBinaryBytes || bytes.byteLength !== binary.byte_size) fail("BACKUP_BINARY_SIZE_MISMATCH", `Размер файла «${binary.name}» не совпадает с manifest.`);
      const sha256 = await sha256Bytes(bytes);
      if (!SHA256_PATTERN.test(binary.sha256) || sha256 !== binary.sha256 || record.checksum !== sha256 || record.byte_size !== bytes.byteLength) fail("BACKUP_BINARY_CHECKSUM_MISMATCH", `SHA-256 файла «${binary.name}» не совпадает.`);
      totalBinaryBytes += bytes.byteLength;
      if (totalBinaryBytes > LIMITS.maxBinaryBytes) fail("BACKUP_TOTAL_BINARY_TOO_LARGE", "Общий размер бинарных файлов превышает 128 МБ.");
      validatedBinaries.push({ ...binary, bytes });
    }
    if (binaryIds.size !== blobRecords.size) fail("BACKUP_BINARY_MISSING", "Для одной или нескольких файловых записей отсутствуют реальные байты.");
    for (const photo of records.photos) {
      const matching = validatedBinaries.filter((entry) => entry.store === "photo_blobs" && entry.parent_id === photo.photo_id);
      if (!matching.length || matching.every((entry) => entry.sha256 !== photo.sha256)) fail("BACKUP_PHOTO_CHECKSUM_MISMATCH", `SHA-256 изображения «${photo.display_name || photo.photo_id}» не совпадает.`);
    }
    for (const file of records.pattern_files) {
      const matching = validatedBinaries.filter((entry) => entry.store === "pattern_file_blobs" && entry.parent_id === file.pattern_file_id);
      if (matching.length !== 1 || matching[0].sha256 !== file.checksum || matching[0].byte_size !== file.byte_size) fail("BACKUP_PATTERN_FILE_MISMATCH", `Исходный файл «${file.display_name || file.pattern_file_id}» не совпадает с metadata.`);
    }
    const expectedBinaryManifest = envelope.data.binaries.map(({ data_base64, ...entry }) => entry).sort(compareByStoreAndId);
    if (system.canonicalize(envelope.manifest.binaries) !== system.canonicalize(expectedBinaryManifest)) fail("BACKUP_BINARY_MANIFEST_MISMATCH", "Список бинарных файлов manifest не совпадает с данными.");
    if (envelope.manifest.binary_file_count !== validatedBinaries.length || envelope.manifest.total_binary_bytes !== totalBinaryBytes) fail("BACKUP_BINARY_TOTALS_MISMATCH", "Количество или общий размер файлов не совпадает с manifest.");
    return Object.freeze({
      envelope: clone(envelope),
      records: clone(records),
      binaries: validatedBinaries,
      report: humanReport(envelope, 0),
      text,
    });
  }

  function parseOrigin(value, field) {
    let url;
    try { url = new URL(value); }
    catch { fail("BACKUP_ORIGIN_INVALID", `Адрес ${field} недопустим.`); }
    if (url.origin !== value || !["127.0.0.1", "localhost"].includes(url.hostname) || !url.port || url.protocol !== "http:") fail("BACKUP_ORIGIN_INVALID", `Адрес ${field} должен быть локальным HTTP origin с явным портом.`);
    return url;
  }

  function assertIsolatedOrigin(currentOrigin, canonicalOrigin) {
    const current = parseOrigin(currentOrigin, "изолированной среды");
    const canonical = parseOrigin(canonicalOrigin, "основного приложения");
    if (current.origin === canonical.origin || current.hostname !== canonical.hostname || current.port === canonical.port) fail("BACKUP_CANONICAL_RESTORE_FORBIDDEN", "Восстановление в основном Chrome запрещено. Открой отдельный локальный порт.");
    return { current: current.origin, canonical: canonical.origin };
  }

  function isolatedOriginFor(canonicalOrigin) {
    const canonical = parseOrigin(canonicalOrigin, "основного приложения");
    const port = Number(canonical.port);
    if (!Number.isInteger(port) || port >= 65535) fail("BACKUP_ISOLATED_PORT_UNAVAILABLE", "Не удалось выбрать отдельный локальный порт.");
    return `${canonical.protocol}//${canonical.hostname}:${port + 1}`;
  }

  async function restoreFullBackup(repository, validated, environment) {
    const proof = validated?.envelope ? validated : await validateFullBackup(validated);
    const origins = assertIsolatedOrigin(environment?.currentOrigin, environment?.canonicalOrigin);
    const database = await repository._database();
    const transaction = database.transaction(RECORD_STORES, "readwrite");
    try {
      const projectCount = await requestResult(transaction.objectStore("projects").count());
      if (projectCount !== 0) fail("BACKUP_ISOLATED_STORAGE_NOT_EMPTY", "Изолированное хранилище уже содержит проект. Выбери чистый отдельный origin.");
      const collisions = [];
      for (const store of RECORD_STORES) {
        for (const record of proof.records[store]) {
          const existing = await requestResult(transaction.objectStore(store).get(record[PRIMARY_KEYS[store]]));
          if (existing) collisions.push({ store, id: record[PRIMARY_KEYS[store]] });
        }
      }
      if (collisions.length) fail("BACKUP_ISOLATED_COLLISION", "В изолированном хранилище уже существуют записи с такими ID.", { collisions });
      const binaryMap = new Map(proof.binaries.map((entry) => [`${entry.store}:${entry.id}`, entry]));
      for (const store of RECORD_STORES) {
        for (const sourceRecord of proof.records[store]) {
          const record = clone(sourceRecord);
          if (store === "photo_blobs" || store === "pattern_file_blobs") {
            const binary = binaryMap.get(`${store}:${record.blob_id}`);
            if (!binary) fail("BACKUP_BINARY_MISSING", "Для файловой записи отсутствуют проверенные байты.");
            record.blob = new Blob([binary.bytes], { type: binary.mime_type });
          }
          transaction.objectStore(store).add(record);
        }
      }
      await transactionComplete(transaction);
    } catch (error) {
      try { transaction.abort(); } catch { /* transaction already closed */ }
      if (error instanceof FullProjectBackupError) throw error;
      fail("BACKUP_ISOLATED_ATOMIC_RESTORE_FAILED", "Изолированное восстановление отменено целиком: ни одна неполная запись не сохранена.", { cause: String(error) });
    }
    const restoredRaw = await collectRawClosure(repository, proof.envelope.source_project_id);
    const restored = await serializeClosure(restoredRaw, proof.envelope.source_project_id);
    if (restored.manifest.structural_sha256 !== proof.envelope.manifest.structural_sha256 || system.canonicalize(restored.manifest.binaries) !== system.canonicalize(proof.envelope.manifest.binaries)) fail("BACKUP_RESTORE_VERIFICATION_FAILED", "Записанная изолированная копия не совпала с резервной копией.");
    return Object.freeze({
      status: "RESTORED_AND_VERIFIED",
      project_id: proof.envelope.source_project_id,
      project_title: proof.envelope.project_title,
      origin: origins.current,
      canonical_origin: origins.canonical,
      record_count: proof.envelope.manifest.record_count,
      binary_file_count: proof.envelope.manifest.binary_file_count,
      structural_sha256: proof.envelope.manifest.structural_sha256,
      binaries: clone(proof.envelope.manifest.binaries),
      execution: executionSummary(proof.records.progress),
    });
  }

  function latestState(progress, kind) {
    return progress.filter((entry) => entry.kind === kind && entry.state).sort((left, right) =>
      Number(left.epoch || 0) - Number(right.epoch || 0) || Number(left.state.revision || 0) - Number(right.state.revision || 0),
    ).at(-1)?.state || null;
  }

  function executionSummary(progress) {
    const stage21 = latestState(progress, "PATTERN_TECHNOLOGY_REVIEW");
    const stage22 = latestState(progress, "PATTERN_EXECUTION_PLAN");
    const sessions = progress.filter((entry) => entry.kind === "PATTERN_EXECUTION_SESSION" && entry.state).map((entry) => entry.state);
    const currentSession = sessions.sort((left, right) => Number(left.revision || 0) - Number(right.revision || 0)).at(-1) || null;
    const steps = stage22?.plan?.steps || stage22?.plan?.userSteps || [];
    const virtualCompleted = Number(currentSession?.virtualDryRun?.completedStepIds?.length || currentSession?.virtualDryRun?.result?.completedStepCount || 0);
    const physicalCompleted = Number(currentSession?.physicalProgress?.completedStepIds?.length || currentSession?.physicalProgress?.completedStepCount || currentSession?.completedStepIds?.length || 0);
    return {
      stage21_revision: stage21?.revision ?? null,
      stage22_revision: stage22?.revision ?? null,
      stage22_fingerprint: stage22?.planFingerprint ?? null,
      step_count: steps.length,
      virtual_completed: virtualCompleted,
      physical_completed: physicalCompleted,
      physical_session_revision: currentSession?.revision ?? null,
    };
  }

  function humanReport(envelope, excludedDeletedPhotos = 0) {
    return {
      project_title: envelope.project_title,
      project_id: envelope.source_project_id,
      record_count: envelope.manifest.record_count,
      binary_file_count: envelope.manifest.binary_file_count,
      total_binary_bytes: envelope.manifest.total_binary_bytes,
      structural_sha256: envelope.manifest.structural_sha256,
      files: envelope.manifest.binaries.map((entry) => ({ name: entry.name, mime_type: entry.mime_type, byte_size: entry.byte_size, sha256: entry.sha256, checksum_ok: true })),
      excluded_stores: [...envelope.manifest.excluded_stores],
      excluded_deleted_photos: excludedDeletedPhotos,
      checksum_status: "PASS",
      restore_scope: "isolated_origin_only",
      canonical_unchanged: true,
      execution: executionSummary(envelope.data.records.progress),
    };
  }

  globalObject.YarnAIFullProjectBackup = Object.freeze({
    FORMAT,
    FORMAT_VERSION,
    MIME_TYPE,
    RECORD_STORES,
    EXCLUDED_STORES,
    LIMITS,
    FullProjectBackupError,
    safeFilename,
    isolatedOriginFor,
    assertIsolatedOrigin,
    createFullBackup,
    validateFullBackup,
    restoreFullBackup,
    executionSummary,
  });
})(typeof window !== "undefined" ? window : globalThis);
