/** Cliente HTTP da API PDV V2. Não persiste a chave em localStorage/cookies. */
export class ApiError extends Error {
  constructor(message, status, body, meta = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.meta = meta;
  }
}

export class PdvApi {
  constructor(onRequest = () => {}) {
    this.base = localStorage.getItem("pdvApiRoot") || "/api";
    this.key = null;
    this.onRequest = onRequest;
  }
  configureBase(root) {
    const candidate = root.trim().replace(/\/+$/, "");
    if (
      !candidate ||
      (!candidate.startsWith("/") && !/^https?:\/\//i.test(candidate))
    ) {
      throw new Error(
        "Utilize uma rota absoluta como /api ou URL http(s) terminada em /api.",
      );
    }
    const url = new URL(candidate, location.origin);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      !url.pathname.endsWith("/api")
    ) {
      throw new Error(
        "Informe uma URL HTTP(S) válida, sem credenciais, terminada em /api.",
      );
    }
    this.base = candidate;
    localStorage.setItem("pdvApiRoot", candidate);
  }
  clearSession() {
    this.key = null;
  }
  async call(
    method,
    path,
    { body, params, extraHeaders = {}, noKey = false } = {},
  ) {
    const base = this.base.endsWith("/api") ? this.base : `${this.base}/api`;
    const target = new URL(
      base + "/v2/" + path.replace(/^\//, ""),
      location.origin,
    );
    for (const [name, val] of Object.entries(params || {})) {
      if (val !== undefined && val !== null && val !== "")
        target.searchParams.set(name, String(val));
    }
    const headers = {
      Accept: "application/json",
      "X-API-Version": "2",
      ...extraHeaders,
    };
    if (this.key && !noKey) headers["X-API-Key"] = this.key;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const started = performance.now();
    let response;
    try {
      response = await fetch(target, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
    } catch (err) {
      const message = `Não foi possível conectar à API. Verifique o backend, o endereço ${target.origin} e o CORS/proxy.`;
      this.onRequest({
        method,
        path: target.pathname,
        status: "OFF",
        duration: Math.round(performance.now() - started),
        error: message,
      });
      throw new ApiError(message, 0, null);
    }
    const contentType = response.headers.get("content-type") || "";
    const raw = response.status === 204 ? "" : await response.text();
    let result = null;
    if (raw) {
      if (contentType.includes("json")) {
        try {
          result = JSON.parse(raw);
        } catch {
          result = raw;
        }
      } else result = raw;
    }
    const meta = {
      limit: response.headers.get("X-RateLimit-Limit"),
      remaining: response.headers.get("X-RateLimit-Remaining"),
      reset: response.headers.get("X-RateLimit-Reset"),
      retryAfter: response.headers.get("Retry-After"),
      replayed: response.headers.get("Idempotent-Replayed"),
    };
    this.onRequest({
      method,
      path: target.pathname + target.search,
      status: response.status,
      duration: Math.round(performance.now() - started),
      meta,
    });
    if (!response.ok) {
      const details = typeof result === "object" ? result : null;
      const info =
        details?.detail ||
        details?.mensagem ||
        details?.title ||
        (typeof result === "string" ? result : null) ||
        response.statusText;
      throw new ApiError(
        info || "Falha na requisição",
        response.status,
        result,
        meta,
      );
    }
    return { data: result, meta, status: response.status };
  }
  login(email, senha) {
    return this.call("POST", "auth/login", {
      body: { email, senha },
      noKey: true,
    });
  }
  logout() {
    return this.call("POST", "auth/logout");
  }
  list(resource, params = {}) {
    return this.call("GET", resource, { params });
  }
  get(resource, id) {
    return this.call("GET", `${resource}/${encodeURIComponent(id)}`);
  }
  create(resource, body, idempotencyKey) {
    return this.call("POST", resource, {
      body,
      extraHeaders: idempotencyKey
        ? { "X-Idempotency-Key": idempotencyKey }
        : {},
    });
  }
  update(resource, id, body) {
    return this.call("PUT", `${resource}/${encodeURIComponent(id)}`, { body });
  }
  remove(resource, id) {
    return this.call("DELETE", `${resource}/${encodeURIComponent(id)}`);
  }
}

export function unwrapList(body) {
  if (Array.isArray(body))
    return {
      items: body,
      page: { number: 0, totalPages: 1, totalElements: body.length },
    };
  if (!body || typeof body !== "object")
    return { items: [], page: { number: 0, totalPages: 1, totalElements: 0 } };
  const embedded = body._embedded || {};
  const items = Object.values(embedded).find(Array.isArray) || [];
  return {
    items,
    page: body.page || {
      number: 0,
      totalPages: 1,
      totalElements: items.length,
    },
    links: body._links || {},
  };
}
