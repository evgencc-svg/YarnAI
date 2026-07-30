"use strict";

(function initializeCloudAccounts(global) {
  class CloudApiError extends Error {
    constructor(code, message, status, details = {}) {
      super(message);
      this.name = "CloudApiError";
      this.code = code;
      this.status = status;
      this.details = details;
    }
  }

  class CloudAccountClient {
    constructor(options = {}) {
      this.fetch = options.fetch ?? global.fetch?.bind(global);
      this.cookieReader = options.cookieReader ?? (() => global.document?.cookie ?? "");
      this.accessToken = null;
      this.user = null;
      this.refreshPromise = null;
      if (!this.fetch) {
        throw new CloudApiError("FETCH_UNAVAILABLE", "Сетевые запросы недоступны.", 0);
      }
    }

    async register(email, password) {
      const result = await this._request("/api/v1/auth/register", {
        method: "POST",
        body: { email, password },
        authenticated: false,
      });
      return this._acceptAuth(result);
    }

    async login(email, password) {
      const result = await this._request("/api/v1/auth/login", {
        method: "POST",
        body: { email, password },
        authenticated: false,
      });
      return this._acceptAuth(result);
    }

    async restoreSession() {
      if (this.refreshPromise) {
        return this.refreshPromise;
      }
      this.refreshPromise = this._restoreSession();
      try {
        return await this.refreshPromise;
      } finally {
        this.refreshPromise = null;
      }
    }

    async _restoreSession() {
      try {
        const result = await this._request("/api/v1/auth/refresh", {
          method: "POST",
          body: null,
          csrf: true,
          authenticated: false,
        });
        return this._acceptAuth(result);
      } catch (error) {
        this.accessToken = null;
        this.user = null;
        if (
          error instanceof CloudApiError &&
          (
            error.status === 404 ||
            ["SESSION_INVALID", "SESSION_EXPIRED", "REFRESH_TOKEN_REUSED", "CSRF_FAILED"].includes(error.code)
          )
        ) {
          return null;
        }
        throw error;
      }
    }

    async currentUser() {
      const result = await this._request("/api/v1/auth/me");
      this.user = result.user;
      return this.user;
    }

    async logout() {
      try {
        await this._request("/api/v1/auth/logout", {
          method: "POST",
          body: null,
          csrf: true,
          authenticated: false,
          expectEmpty: true,
        });
      } finally {
        this.accessToken = null;
        this.user = null;
      }
    }

    async listProjects(status = "active", cursor = null, limit = 20) {
      const parameters = new URLSearchParams({ status, limit: String(limit) });
      if (cursor) {
        parameters.set("cursor", cursor);
      }
      return this._request(`/api/v1/projects?${parameters}`);
    }

    async getProject(projectId) {
      return this._request(`/api/v1/projects/${encodeURIComponent(projectId)}`);
    }

    async saveLocalProject(aggregate) {
      const project = aggregate?.project;
      if (!project?.project_id) {
        throw new CloudApiError(
          "LOCAL_PROJECT_REQUIRED",
          "Сначала откройте локальный проект.",
          0,
        );
      }
      const allowedStatus = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"].includes(
        project.workspace_status,
      )
        ? project.workspace_status
        : "ACTIVE";
      return this._request("/api/v1/projects", {
        method: "POST",
        idempotencyKey: `cloud-copy:${project.project_id}`,
        body: {
          project_id: project.project_id,
          schema_version: 1,
          status: allowedStatus,
          title: project.title,
          payload: aggregate,
          source_device_id: project.device_id ?? null,
          sync_metadata: {
            import_kind: "EXPLICIT_LOCAL_COPY",
            local_revision: project.revision,
          },
          operation_id: `cloud-copy:${project.project_id}`,
        },
      });
    }

    _acceptAuth(result) {
      this.accessToken = result.access_token;
      this.user = result.user;
      return result;
    }

    _csrfToken() {
      const entry = this.cookieReader()
        .split(";")
        .map((value) => value.trim())
        .find((value) => value.startsWith("yarnai_csrf="));
      return entry ? decodeURIComponent(entry.slice("yarnai_csrf=".length)) : "";
    }

    async _request(path, options = {}) {
      const headers = { Accept: "application/json" };
      if (options.body !== undefined && options.body !== null) {
        headers["Content-Type"] = "application/json";
      }
      if (options.authenticated !== false) {
        if (!this.accessToken) {
          throw new CloudApiError(
            "AUTH_REQUIRED",
            "Войдите, чтобы использовать облачные проекты.",
            401,
          );
        }
        headers.Authorization = `Bearer ${this.accessToken}`;
      }
      if (options.csrf) {
        const token = this._csrfToken();
        if (!token) {
          throw new CloudApiError(
            "CSRF_FAILED",
            "Не удалось подтвердить безопасную сессию.",
            403,
          );
        }
        headers["X-CSRF-Token"] = token;
      }
      if (options.idempotencyKey) {
        headers["Idempotency-Key"] = options.idempotencyKey;
      }
      let response;
      try {
        response = await this.fetch(path, {
          method: options.method ?? "GET",
          credentials: "same-origin",
          headers,
          body:
            options.body !== undefined && options.body !== null
              ? JSON.stringify(options.body)
              : undefined,
        });
      } catch {
        throw new CloudApiError(
          "NETWORK_ERROR",
          "Нет связи с сервером. Локальные проекты продолжают работать.",
          0,
        );
      }
      if (options.expectEmpty && response.ok) {
        return null;
      }
      const contentType = response.headers.get("content-type") ?? "";
      const payload = contentType.includes("application/json")
        ? await response.json()
        : null;
      if (!response.ok) {
        const error = payload?.error ?? {};
        if (
          response.status === 401 &&
          options.authenticated !== false &&
          options.retryAfterRefresh !== false &&
          error.code === "ACCESS_TOKEN_INVALID"
        ) {
          const restored = await this.restoreSession();
          if (restored) {
            return this._request(path, {
              ...options,
              retryAfterRefresh: false,
            });
          }
        }
        throw new CloudApiError(
          error.code ?? "CLOUD_REQUEST_FAILED",
          error.message ?? "Облачный запрос не выполнен.",
          response.status,
          error.details ?? {},
        );
      }
      return payload;
    }
  }

  global.YarnAICloudAccounts = Object.freeze({
    CloudAccountClient,
    CloudApiError,
  });
})(typeof window !== "undefined" ? window : globalThis);
