import test from "node:test";
import assert from "node:assert/strict";
import { PdvApi, ApiError, unwrapList } from "../js/api.js";

globalThis.localStorage = {
  data: new Map(),
  getItem(k) {
    return this.data.get(k) || null;
  },
  setItem(k, v) {
    this.data.set(k, v);
  },
};
globalThis.location = { origin: "http://localhost:5500" };

const makeResponse = (body, code = 200, headers = {}) =>
  new Response(code === 204 ? null : JSON.stringify(body), {
    status: code,
    headers: { "content-type": "application/json", ...headers },
  });

test("login V2 envia cabeçalho de versão, mas não envia API Key", async () => {
  const calls = [];
  globalThis.fetch = async (url, opt) => {
    calls.push({ url: String(url), opt });
    return makeResponse({ apiKey: "pdv_123", usuarioId: 1, nome: "Operador" });
  };
  const api = new PdvApi();
  const response = await api.login("operador@pdv.com", "SenhaSegura123");
  assert.equal(response.data.apiKey, "pdv_123");
  assert.ok(calls[0].url.endsWith("/api/v2/auth/login"));
  assert.equal(calls[0].opt.headers["X-API-Version"], "2");
  assert.equal(calls[0].opt.headers["X-API-Key"], undefined);
  assert.deepEqual(JSON.parse(calls[0].opt.body), {
    email: "operador@pdv.com",
    senha: "SenhaSegura123",
  });
});

test("venda recebe X-API-Key e X-Idempotency-Key", async () => {
  let headers;
  globalThis.fetch = async (url, opt) => {
    headers = opt.headers;
    return makeResponse({ id: 42 }, 201, { "Idempotent-Replayed": "false" });
  };
  const api = new PdvApi();
  api.key = "pdv_chave";
  const res = await api.create(
    "vendas",
    { cliente: { id: 1 }, formaPagamento: "PIX", produtos: [{ id: 2 }] },
    "uuid-test",
  );
  assert.equal(headers["X-API-Version"], "2");
  assert.equal(headers["X-API-Key"], "pdv_chave");
  assert.equal(headers["X-Idempotency-Key"], "uuid-test");
  assert.equal(res.status, 201);
});

test("paginação HATEOAS extrai _embedded e page", () => {
  const result = unwrapList({
    _embedded: { entityModelClienteList: [{ id: 1 }, { id: 2 }] },
    page: { number: 1, totalPages: 4, totalElements: 14 },
  });
  assert.equal(result.items.length, 2);
  assert.equal(result.page.totalElements, 14);
});

test("429 produz ApiError e informa Retry-After", async () => {
  globalThis.fetch = async () =>
    makeResponse({ title: "Limite excedido", detail: "Aguarde" }, 429, {
      "Retry-After": "20",
      "X-RateLimit-Remaining": "0",
    });
  const api = new PdvApi();
  await assert.rejects(
    api.list("produtos"),
    (err) =>
      err instanceof ApiError &&
      err.status === 429 &&
      err.meta.retryAfter === "20",
  );
});

test("204 de exclusão não exige JSON", async () => {
  globalThis.fetch = async () => makeResponse(null, 204);
  const api = new PdvApi();
  const result = await api.remove("categorias", 7);
  assert.equal(result.status, 204);
  assert.equal(result.data, null);
});
