"use strict";

(function initializeSyncService(global) {
  class SyncServiceError extends Error {
    constructor(code, message, options = {}) {
      super(message);
      this.name = "SyncServiceError";
      this.code = code;
      this.status = options.status ?? 0;
      this.retryable = Boolean(options.retryable);
      this.cause = options.cause;
    }
  }

  function isRetryableError(error) {
    const status = Number(error?.status ?? 0);
    return (
      error?.code === "SYNC_TIMEOUT" ||
      error?.code === "NETWORK_ERROR" ||
      status === 0 ||
      status >= 500
    );
  }

  class SyncService {
    constructor(repository, apiClient, options = {}) {
      if (!repository || !apiClient) {
        throw new SyncServiceError(
          "SYNC_DEPENDENCY_REQUIRED",
          "Sync requires a project repository and account client.",
        );
      }
      this.repository = repository;
      this.apiClient = apiClient;
      this.batchSize = Math.max(1, Math.min(options.batchSize ?? 50, 100));
      this.maxRetries = Math.max(0, options.maxRetries ?? 2);
      this.timeoutMs = Math.max(1, options.timeoutMs ?? 10000);
      this.retryDelayMs = Math.max(0, options.retryDelayMs ?? 250);
      this.sleep = options.sleep ?? ((milliseconds) => new Promise(
        (resolve) => global.setTimeout(resolve, milliseconds),
      ));
      this.uploadPromise = null;
    }

    async uploadPending(options = {}) {
      if (this.uploadPromise) {
        return this.uploadPromise;
      }
      this.uploadPromise = this._uploadPending(options);
      try {
        return await this.uploadPromise;
      } finally {
        this.uploadPromise = null;
      }
    }

    async _uploadPending(options) {
      await this.repository.resetUploadingOperations();
      if (options.retryFailed !== false) {
        await this.repository.requeueRetryableFailedOperations();
      }
      const result = {
        confirmed_operations: [],
        errors: [],
        server_revisions: {},
      };
      while (true) {
        const operations = await this.repository.getOutboxOperations({
          states: ["pending"],
          limit: this.batchSize,
          projectId: options.projectId ?? null,
        });
        if (operations.length === 0) {
          return result;
        }
        const operationIds = operations.map((operation) => operation.operation_id);
        await this.repository.markOperationsUploading(operationIds);
        let response;
        try {
          response = await this._uploadWithRetry(operations);
        } catch (error) {
          const retryable = isRetryableError(error);
          const failures = operations.map((operation) => ({
            operation_id: operation.operation_id,
            project_id: operation.project_id,
            status: error?.status ?? 0,
            code: error?.code ?? "SYNC_UPLOAD_FAILED",
            message: error?.message ?? "Sync upload failed.",
          }));
          await this.repository.markOperationsFailed(failures, { retryable });
          throw new SyncServiceError(
            error?.code ?? "SYNC_UPLOAD_FAILED",
            error?.message ?? "Sync upload failed.",
            { status: error?.status ?? 0, retryable, cause: error },
          );
        }

        const confirmed = Array.isArray(response?.confirmed_operations)
          ? response.confirmed_operations
          : [];
        const errors = Array.isArray(response?.errors) ? response.errors : [];
        const acknowledged = new Set([
          ...confirmed.map((item) => item.operation_id),
          ...errors.map((item) => item.operation_id),
        ]);
        const missing = operations
          .filter((operation) => !acknowledged.has(operation.operation_id))
          .map((operation) => ({
            operation_id: operation.operation_id,
            project_id: operation.project_id,
            status: 502,
            code: "SYNC_ACK_MISSING",
            message: "Server did not acknowledge the operation.",
            retryable: true,
          }));
        if (confirmed.length > 0) {
          await this.repository.markOperationsUploaded(confirmed);
        }
        if (errors.length > 0 || missing.length > 0) {
          await this.repository.markOperationsFailed([...errors, ...missing]);
        }
        result.confirmed_operations.push(...confirmed);
        result.errors.push(...errors, ...missing);
        Object.assign(result.server_revisions, response?.server_revisions ?? {});
      }
    }

    async _uploadWithRetry(operations) {
      let attempt = 0;
      while (true) {
        try {
          return await this._withTimeout(
            this.apiClient.uploadOperations(
              operations.map((operation) => ({
                schema_version: operation.schema_version,
                operation_id: operation.operation_id,
                project_id: operation.project_id,
                revision: operation.revision,
                operation_type: operation.operation_type,
                created_at: operation.created_at,
                payload: operation.payload,
                source_device_id: operation.device_id ?? null,
              })),
            ),
          );
        } catch (error) {
          if (!isRetryableError(error) || attempt >= this.maxRetries) {
            throw error;
          }
          attempt += 1;
          await this.sleep(this.retryDelayMs * attempt);
        }
      }
    }

    async _withTimeout(promise) {
      let timer;
      const timeout = new Promise((_resolve, reject) => {
        timer = global.setTimeout(() => {
          reject(new SyncServiceError(
            "SYNC_TIMEOUT",
            "Sync upload timed out.",
            { retryable: true },
          ));
        }, this.timeoutMs);
      });
      try {
        return await Promise.race([promise, timeout]);
      } finally {
        global.clearTimeout(timer);
      }
    }
  }

  global.YarnAISync = Object.freeze({
    SyncService,
    SyncServiceError,
    isRetryableError,
  });
})(typeof window !== "undefined" ? window : globalThis);