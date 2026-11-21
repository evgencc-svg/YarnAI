"use strict";

(function initializeFullProjectBackupAssistant(globalObject) {
  if (typeof document === "undefined") return;
  const backup = globalObject.YarnAIFullProjectBackup;
  const system = globalObject.YarnAIProjectSystem;
  if (!backup || !system) return;

  const ui = {
    verifyAction: document.querySelector("#backup-verify-action"),
    fileInput: document.querySelector("#backup-file-input"),
    isolatedBanner: document.querySelector("#backup-isolated-banner"),
    panel: document.querySelector("#backup-verification-panel"),
    close: document.querySelector("#backup-verification-close"),
    title: document.querySelector("#backup-verification-title"),
    status: document.querySelector("#backup-verification-status"),
    report: document.querySelector("#backup-verification-report"),
    facts: document.querySelector("#backup-verification-facts"),
    files: document.querySelector("#backup-verification-files"),
    technical: document.querySelector("#backup-verification-technical"),
    restore: document.querySelector("#backup-isolated-restore"),
    reloadOpen: document.querySelector("#backup-reload-open"),
  };
  if (Object.values(ui).some((element) => !element)) return;

  const parameters = new URLSearchParams(globalObject.location.search);
  const isolatedMode = parameters.get("backup-isolated") === "1";
  const declaredCanonicalOrigin = parameters.get("canonical-origin") || "";
  let pendingValidation = null;
  let pendingText = "";
  let busy = false;

  ui.isolatedBanner.hidden = !isolatedMode;
  ui.verifyAction.addEventListener("click", () => ui.fileInput.click());
  ui.fileInput.addEventListener("change", validateSelectedFile);
  ui.close.addEventListener("click", closePanel);
  ui.restore.addEventListener("click", beginIsolatedRestore);
  document.addEventListener("click", handleProjectBackupDownload);
  globalObject.addEventListener("message", receiveBackupTransfer);

  if (isolatedMode && globalObject.opener && declaredCanonicalOrigin) {
    try {
      backup.assertIsolatedOrigin(globalObject.location.origin, declaredCanonicalOrigin);
      globalObject.opener.postMessage({
        type: "YARNAI_ISOLATED_BACKUP_READY_V1",
        isolated_origin: globalObject.location.origin,
      }, declaredCanonicalOrigin);
      openPanel("Изолированная среда готова");
      setStatus("Ожидаем проверенную резервную копию из основного окна. Пока ничего не записано.");
    } catch (error) {
      openPanel("Изолированная среда не подтверждена");
      setError(error);
    }
  }

  async function handleProjectBackupDownload(event) {
    const button = event.target.closest("[data-full-project-backup]");
    if (!button || busy) return;
    const projectId = button.dataset.fullProjectBackup;
    busy = true;
    button.disabled = true;
    const previousLabel = button.textContent;
    button.textContent = "Готовим полную копию…";
    let repository;
    try {
      repository = new system.ProjectRepository();
      await repository.initialize();
      const exported = await backup.createFullBackup(repository, projectId);
      const blob = new Blob([exported.json], { type: exported.mime_type });
      const objectUrl = globalObject.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = exported.filename;
      document.body.append(link);
      link.click();
      link.remove();
      globalObject.setTimeout(() => globalObject.URL.revokeObjectURL(objectUrl), 0);
      openPanel("Полная резервная копия скачана");
      setStatus(`Создан один файл «${exported.filename}». В него включены проект и ${exported.report.binary_file_count} связанных файла.`);
      renderReport(exported.report);
      pendingValidation = null;
      pendingText = "";
      ui.restore.hidden = true;
    } catch (error) {
      openPanel("Не удалось создать полную резервную копию");
      setError(error);
    } finally {
      await repository?.close().catch(() => undefined);
      busy = false;
      button.disabled = false;
      button.textContent = previousLabel;
    }
  }

  async function validateSelectedFile() {
    const file = ui.fileInput.files?.[0];
    ui.fileInput.value = "";
    if (!file || busy) return;
    busy = true;
    openPanel("Проверяем резервную копию");
    setStatus("Читаем структуру, размеры и SHA-256. До подтверждения ничего не записывается.");
    ui.report.hidden = true;
    try {
      const validation = await backup.validateFullBackup(file);
      pendingValidation = validation;
      pendingText = validation.text;
      ui.title.textContent = "Резервная копия проверена";
      setStatus("Все записи, связи, размеры и SHA-256 совпадают. В хранилище пока ничего не записано.");
      renderReport(validation.report);
      ui.restore.hidden = false;
      ui.restore.disabled = false;
      ui.reloadOpen.hidden = true;
    } catch (error) {
      pendingValidation = null;
      pendingText = "";
      ui.title.textContent = "Резервная копия не прошла проверку";
      setError(error);
      ui.report.hidden = true;
    } finally {
      busy = false;
    }
  }

  async function beginIsolatedRestore() {
    if (!pendingValidation || !pendingText || busy) return;
    if (isolatedMode) {
      await restoreHere(pendingValidation, declaredCanonicalOrigin);
      return;
    }
    let isolatedOrigin;
    try { isolatedOrigin = backup.isolatedOriginFor(globalObject.location.origin); }
    catch (error) { setError(error); return; }
    const isolatedUrl = new URL("/saved-projects", isolatedOrigin);
    isolatedUrl.searchParams.set("backup-isolated", "1");
    isolatedUrl.searchParams.set("canonical-origin", globalObject.location.origin);
    const target = globalObject.open(isolatedUrl.href, "yarnai-isolated-backup-v1");
    if (!target) {
      setStatus(`Открой вручную ${isolatedUrl.href}, выбери тот же backup-файл и нажми кнопку восстановления.`, "error");
      return;
    }
    busy = true;
    ui.restore.disabled = true;
    setStatus(`Открываем изолированную среду ${isolatedOrigin}. Основной Chrome остаётся без изменений.`);
    const timeout = globalObject.setTimeout(() => {
      globalObject.removeEventListener("message", transferWhenReady);
      busy = false;
      ui.restore.disabled = false;
      setStatus(`Изолированная среда ${isolatedOrigin} не ответила. Проверь, что приложение запущено на этом порту.`, "error");
    }, 15000);
    function transferWhenReady(event) {
      if (event.origin !== isolatedOrigin || event.source !== target || event.data?.type !== "YARNAI_ISOLATED_BACKUP_READY_V1") return;
      globalObject.clearTimeout(timeout);
      globalObject.removeEventListener("message", transferWhenReady);
      target.postMessage({
        type: "YARNAI_FULL_BACKUP_TRANSFER_V1",
        canonical_origin: globalObject.location.origin,
        backup_text: pendingText,
      }, isolatedOrigin);
      busy = false;
      ui.restore.disabled = false;
      setStatus(`Проверенная копия передана только в ${isolatedOrigin}. Результат откроется в изолированном окне.`);
    }
    globalObject.addEventListener("message", transferWhenReady);
  }

  async function receiveBackupTransfer(event) {
    if (!isolatedMode || event.source !== globalObject.opener || event.data?.type !== "YARNAI_FULL_BACKUP_TRANSFER_V1") return;
    const canonicalOrigin = event.data.canonical_origin;
    if (event.origin !== canonicalOrigin || canonicalOrigin !== declaredCanonicalOrigin) {
      setStatus("Источник резервной копии не совпал с основным origin. Восстановление отменено.", "error");
      return;
    }
    try {
      backup.assertIsolatedOrigin(globalObject.location.origin, canonicalOrigin);
      const validation = await backup.validateFullBackup(event.data.backup_text);
      pendingValidation = validation;
      pendingText = validation.text;
      renderReport(validation.report);
      await restoreHere(validation, canonicalOrigin);
    } catch (error) {
      setError(error);
    }
  }

  async function restoreHere(validation, canonicalOrigin) {
    if (busy) return;
    busy = true;
    ui.restore.disabled = true;
    setStatus("Восстанавливаем одной атомарной записью и сразу сверяем сохранённые байты…");
    let repository;
    try {
      repository = new system.ProjectRepository();
      await repository.initialize();
      const result = await backup.restoreFullBackup(repository, validation, {
        currentOrigin: globalObject.location.origin,
        canonicalOrigin,
      });
      ui.title.textContent = "Изолированная копия восстановлена и проверена";
      setStatus(`Проект «${result.project_title}» открывается на ${result.origin}. Все ${result.binary_file_count} файла и их SHA-256 совпадают.`);
      renderReport(validation.report, result);
      ui.restore.hidden = true;
      ui.reloadOpen.hidden = false;
      const destination = new URL("/saved-projects", globalObject.location.origin);
      destination.searchParams.set("backup-isolated", "1");
      destination.searchParams.set("canonical-origin", canonicalOrigin);
      destination.hash = `project-${result.project_id}`;
      ui.reloadOpen.href = destination.href;
    } catch (error) {
      setError(error);
      ui.restore.disabled = false;
    } finally {
      await repository?.close().catch(() => undefined);
      busy = false;
    }
  }

  function renderReport(report, restoreResult = null) {
    const execution = report.execution || {};
    const facts = [
      ["Проект", report.project_title],
      ["Записей", String(report.record_count)],
      ["Прикреплённых файлов", String(report.binary_file_count)],
      ["Общий размер файлов", formatBytes(report.total_binary_bytes)],
      ["Проверка файлов", report.checksum_status === "PASS" ? "Все SHA-256 совпадают" : "Не подтверждено"],
      ["Среда восстановления", restoreResult ? restoreResult.origin : "Только отдельный локальный адрес"],
      ["План вязания", Number.isInteger(execution.step_count) && execution.step_count > 0 ? `${execution.step_count} шагов` : "Нет исполнимого плана"],
      ["Физический прогресс", Number.isInteger(execution.physical_completed) ? `${execution.physical_completed} шагов` : "Не найден"],
    ];
    ui.facts.replaceChildren(...facts.map(([label, value]) => {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = label;
      description.textContent = value;
      row.append(term, description);
      return row;
    }));
    ui.files.replaceChildren(...report.files.map((file) => {
      const item = document.createElement("li");
      item.textContent = `${file.name} — ${formatBytes(file.byte_size)} — проверен`;
      return item;
    }));
    ui.technical.textContent = JSON.stringify({
      project_id: report.project_id,
      structural_sha256: report.structural_sha256,
      records: report.record_count,
      binaries: report.files.map((file) => ({ name: file.name, mime_type: file.mime_type, byte_size: file.byte_size, sha256: file.sha256 })),
      execution,
      isolated_restore: restoreResult ? { origin: restoreResult.origin, canonical_origin: restoreResult.canonical_origin, status: restoreResult.status } : null,
    }, null, 2);
    ui.report.hidden = false;
  }

  function openPanel(title) {
    ui.panel.hidden = false;
    ui.title.textContent = title;
    ui.panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function closePanel() {
    if (busy) return;
    ui.panel.hidden = true;
    pendingValidation = null;
    pendingText = "";
    ui.report.hidden = true;
    ui.restore.hidden = false;
    ui.reloadOpen.hidden = true;
    ui.verifyAction.focus();
  }

  function setStatus(message, state = "") {
    ui.status.textContent = message;
    ui.status.dataset.state = state;
  }

  function setError(error) {
    const message = error instanceof backup.FullProjectBackupError
      ? error.userMessage
      : "Не удалось безопасно проверить резервную копию. Ни одна запись не выполнена.";
    setStatus(message, "error");
  }

  function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  }
})(typeof window !== "undefined" ? window : globalThis);
