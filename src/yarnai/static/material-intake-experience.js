"use strict";

(function exposeMaterialIntakeExperience(globalObject) {
  const MAX_FILE_BYTES = 50 * 1024 * 1024;
  const IMAGE_EXTENSIONS = Object.freeze([
    "avif", "bmp", "gif", "heic", "heif", "jpeg", "jpg", "png", "svg", "webp",
  ]);
  const PDF_EXTENSIONS = Object.freeze(["pdf"]);
  const TEXT_EXTENSIONS = Object.freeze(["md", "markdown", "text", "txt"]);
  const MATERIAL_PURPOSES = Object.freeze(["garment_photo", "chart", "unknown"]);
  const PURPOSE_LABELS = Object.freeze({
    garment_photo: "Это фото вещи",
    chart: "Это схема",
    unknown: "Не уверен",
  });
  const KIND_LABELS = Object.freeze({
    image: "Изображение",
    pdf: "PDF",
    text: "Описание",
    unknown: "Файл",
  });

  function normalizeProjectContext(input) {
    const source = isRecord(input?.project) ? input.project : input;
    const id = cleanText(source?.project_id) || cleanText(source?.id);
    const title = cleanText(source?.title);
    return Object.freeze({
      available: Boolean(id),
      id,
      title: title || "Новый проект",
    });
  }

  function normalizePurpose(value) {
    return MATERIAL_PURPOSES.includes(value) ? value : "unknown";
  }

  function classifySupportedFormat(input) {
    const name = cleanFileName(input?.displayName ?? input?.name);
    const extension = fileExtension(name);
    const mime = cleanText(input?.mediaType ?? input?.mime ?? input?.type)?.toLowerCase() || "";
    if (PDF_EXTENSIONS.includes(extension)) {
      return mime && mime !== "application/pdf"
        ? classification(false, "unknown", "UNSUPPORTED_MIME")
        : classification(true, "pdf", null);
    }
    if (IMAGE_EXTENSIONS.includes(extension)) {
      return mime && !mime.startsWith("image/")
        ? classification(false, "unknown", "UNSUPPORTED_MIME")
        : classification(true, "image", null);
    }
    if (TEXT_EXTENSIONS.includes(extension)) {
      return mime && !mime.startsWith("text/")
        ? classification(false, "unknown", "UNSUPPORTED_MIME")
        : classification(true, "text", null);
    }
    return classification(false, "unknown", "UNSUPPORTED_EXTENSION");
  }

  function normalizeFileMetadata(input, sourceIndex = 0) {
    if (!isRecord(input)) {
      return invalidMaterial("CORRUPTED_METADATA", sourceIndex);
    }
    const name = cleanFileName(input.displayName ?? input.name);
    if (!name) {
      return invalidMaterial("MISSING_NAME", sourceIndex);
    }
    const size = Number(input.size ?? input.byte_size);
    if (!Number.isSafeInteger(size) || size <= 0) {
      return invalidMaterial("MISSING_SIZE", sourceIndex, name);
    }
    const declaredKind = ["image", "pdf", "text"].includes(input.kind ?? input.materialKind)
      ? input.kind ?? input.materialKind
      : null;
    const classificationResult = declaredKind
      ? classification(true, declaredKind, null)
      : classifySupportedFormat(input);
    if (!classificationResult.supported) {
      return Object.freeze({
        ...invalidMaterial(classificationResult.code, sourceIndex, name),
        size,
      });
    }
    if (size > MAX_FILE_BYTES) {
      return Object.freeze({
        ...invalidMaterial("FILE_TOO_LARGE", sourceIndex, name),
        size,
        kind: classificationResult.kind,
      });
    }
    const id = cleanText(input.id ?? input.materialId ?? input.material_id);
    const mediaType =
      cleanText(input.mediaType ?? input.mime ?? input.type)?.toLowerCase() || "";
    const order = positiveInteger(input.order) ? input.order : sourceIndex + 1;
    const purpose = classificationResult.kind === "image"
      ? normalizePurpose(input.purpose)
      : null;
    const material = {
      id,
      name,
      displayName: name,
      size,
      mediaType,
      kind: classificationResult.kind,
      purpose,
      order,
      sourceIndex,
      valid: true,
      validationCode: null,
      validationMessage: "",
    };
    return Object.freeze({
      ...material,
      duplicateKey: duplicateIdentity(material),
    });
  }

  function normalizeMaterials(inputs) {
    const values = Array.isArray(inputs) ? inputs : [];
    return stableOrderMaterials(values.map((entry, index) =>
      normalizeFileMetadata(entry, index),
    ));
  }

  function stableOrderMaterials(materials) {
    const values = Array.isArray(materials) ? materials : [];
    return Object.freeze(values.map((entry, index) => ({ entry, index }))
      .sort((left, right) => {
        const leftOrder = positiveInteger(left.entry?.order)
          ? left.entry.order
          : left.index + 1;
        const rightOrder = positiveInteger(right.entry?.order)
          ? right.entry.order
          : right.index + 1;
        return leftOrder - rightOrder || left.index - right.index;
      })
      .map(({ entry }) => Object.freeze({ ...entry })));
  }

  function duplicateIdentity(input) {
    if (!isRecord(input)) {
      return "";
    }
    const id = cleanText(input.id ?? input.materialId ?? input.material_id);
    return id ? `id:${id}` : fileSignature(input);
  }

  function fileSignature(input) {
    if (!isRecord(input)) {
      return "";
    }
    const name = cleanFileName(input.displayName ?? input.name)?.toLocaleLowerCase("ru") || "";
    const size = Number(input.size ?? input.byte_size);
    const mime = cleanText(input.mediaType ?? input.mime ?? input.type)?.toLowerCase() || "";
    const kind = cleanText(input.kind ?? input.materialKind) || "";
    if (!name || !Number.isSafeInteger(size) || size <= 0) {
      return "";
    }
    return `file:${name}|${size}|${kind || mime}`;
  }

  function detectDuplicates(materials) {
    const seenIdentities = new Map();
    const seenFiles = new Map();
    const duplicates = [];
    (Array.isArray(materials) ? materials : []).forEach((material, index) => {
      const identity = duplicateIdentity(material);
      const signature = fileSignature(material);
      const firstIndex = identity && seenIdentities.has(identity)
        ? seenIdentities.get(identity)
        : signature && seenFiles.has(signature)
          ? seenFiles.get(signature)
          : null;
      if (firstIndex !== null) {
        duplicates.push(Object.freeze({
          key: identity || signature,
          firstIndex,
          duplicateIndex: index,
          name: cleanFileName(material.displayName ?? material.name) || "Файл",
        }));
        return;
      }
      if (identity) {
        seenIdentities.set(identity, index);
      }
      if (signature) {
        seenFiles.set(signature, index);
      }
    });
    return Object.freeze(duplicates);
  }

  function isDuplicate(candidate, materials) {
    const key = duplicateIdentity(candidate);
    const signature = fileSignature(candidate);
    return (Array.isArray(materials) ? materials : []).some((entry) => {
      const sameIdentity = Boolean(key) && duplicateIdentity(entry) === key;
      const sameFile = Boolean(signature) && fileSignature(entry) === signature;
      return sameIdentity || sameFile;
    });
  }

  function computeReadiness(input = {}) {
    const materials = normalizeMaterials(input.materials);
    const validFiles = materials.filter((entry) => entry.valid);
    const description = typeof input.description === "string"
      ? input.description.trim()
      : "";
    const ready = validFiles.length > 0 || description.length > 0;
    return Object.freeze({
      ready,
      fileCount: validFiles.length,
      hasDescription: Boolean(description),
      sourceCount: validFiles.length + (description ? 1 : 0),
      title: ready ? "Можно продолжать" : "Добавь хотя бы один источник",
      message: ready
        ? sourceSummary(validFiles.length, Boolean(description))
        : "Добавь файл или описание, чтобы продолжить.",
    });
  }

  function buildSummary(input = {}) {
    const readiness = computeReadiness(input);
    return Object.freeze({
      ...readiness,
      actionLabel: "Проверить материалы",
      receivedLabel: readiness.ready
        ? `YarnAI получил: ${readiness.message}`
        : "YarnAI пока не получил материалов.",
    });
  }

  function buildViewModel(input = {}) {
    const project = normalizeProjectContext(input.project);
    const materials = normalizeMaterials(input.materials);
    const description = typeof input.description === "string"
      ? input.description
      : "";
    return Object.freeze({
      project,
      materials,
      description,
      duplicates: detectDuplicates(materials),
      summary: buildSummary({ materials, description }),
      missingProject: !project.available,
    });
  }

  function validationMessage(code, name = "Файл") {
    const messages = {
      CORRUPTED_METADATA: "Не удалось прочитать данные файла.",
      MISSING_NAME: "У файла отсутствует имя.",
      MISSING_SIZE: `Не удалось определить размер файла «${name}».`,
      UNSUPPORTED_EXTENSION: "Этот формат пока не поддерживается.",
      UNSUPPORTED_MIME: "Тип файла не соответствует его расширению.",
      FILE_TOO_LARGE: `Файл «${name}» слишком большой. Максимум — 50 МБ.`,
      DUPLICATE: `Файл «${name}» уже добавлен.`,
      UNKNOWN_PURPOSE: "Выбрано неизвестное назначение материала.",
      PROJECT_MISSING: "Проект не найден.",
      STORAGE_ERROR: "Не удалось сохранить материалы.",
      SOURCE_REQUIRED: "Добавь файл или описание, чтобы продолжить.",
    };
    return messages[code] || "Не удалось добавить этот файл.";
  }

  function humanReadableFileKind(value) {
    const kind = typeof value === "string" ? value : value?.kind;
    return KIND_LABELS[kind] || KIND_LABELS.unknown;
  }

  function formatFileSize(bytes) {
    const size = Number(bytes);
    if (!Number.isFinite(size) || size < 0) {
      return "";
    }
    if (size < 1024) {
      return `${Math.round(size)} Б`;
    }
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} КБ`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
  }

  function classification(supported, kind, code) {
    return Object.freeze({ supported, kind, code });
  }

  function invalidMaterial(code, sourceIndex, name = "") {
    return Object.freeze({
      id: null,
      name,
      displayName: name,
      size: null,
      mediaType: "",
      kind: "unknown",
      purpose: null,
      order: sourceIndex + 1,
      sourceIndex,
      valid: false,
      validationCode: code,
      validationMessage: validationMessage(code, name || "Файл"),
      duplicateKey: "",
    });
  }

  function sourceSummary(fileCount, hasDescription) {
    const parts = [];
    if (fileCount) {
      parts.push(`${fileCount} ${materialWord(fileCount)}`);
    }
    if (hasDescription) {
      parts.push("текстовое описание");
    }
    return parts.join(" и ");
  }

  function materialWord(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) {
      return "файл";
    }
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) {
      return "файла";
    }
    return "файлов";
  }

  function cleanFileName(value) {
    if (typeof value !== "string") {
      return "";
    }
    const characters = [...value.replace(/[\u0000-\u001f\u007f]/g, "").trim()];
    if (characters.length <= 200) {
      return characters.join("");
    }
    return [...characters.slice(0, 150), "…", ...characters.slice(-49)].join("");
  }

  function cleanText(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  function fileExtension(value) {
    const match = String(value || "").toLowerCase().match(/\.([^.]+)$/);
    return match ? match[1] : "";
  }

  function positiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  const api = Object.freeze({
    MAX_FILE_BYTES,
    IMAGE_EXTENSIONS,
    MATERIAL_PURPOSES,
    PURPOSE_LABELS,
    KIND_LABELS,
    normalizeProjectContext,
    normalizePurpose,
    classifySupportedFormat,
    normalizeFileMetadata,
    normalizeMaterials,
    stableOrderMaterials,
    duplicateIdentity,
    fileSignature,
    detectDuplicates,
    isDuplicate,
    computeReadiness,
    buildSummary,
    buildViewModel,
    validationMessage,
    humanReadableFileKind,
    formatFileSize,
  });

  globalObject.YarnAIMaterialIntakeExperience = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
