import { PdvApi, ApiError, unwrapList } from "./api.js";
import {
  MODULES,
  PAGE_LABELS,
  currency,
  getPathValue,
  labelValue,
} from "./model.js";

const $ = (s, root = document) => root.querySelector(s);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (x) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        x
      ],
  );
const state = {
  page: "dashboard",
  user: null,
  cache: {},
  query: {},
  pages: {},
  perPage: 10,
  rate: null,
  requests: [],
  salePending: null,
  modal: null,
};
const api = new PdvApi((rec) => {
  state.requests.unshift({
    time: new Date().toLocaleTimeString("pt-BR"),
    ...rec,
  });
  state.requests = state.requests.slice(0, 35);
  if (rec.meta && (rec.meta.limit !== null || rec.meta.remaining !== null))
    state.rate = rec.meta;
  const dot = $("#sidebar-dot");
  if (dot)
    dot.className =
      "status-dot " +
      (rec.status >= 200 && rec.status < 400
        ? "ok"
        : rec.status === "OFF"
          ? "bad"
          : "warn");
  if ($("#sidebar-status"))
    $("#sidebar-status").textContent =
      rec.status === "OFF"
        ? "Backend indisponível"
        : `Última resposta: ${rec.status}`;
  if (state.page === "integracao" && state.user) updateMonitor();
});

function toast(msg, tone = "success") {
  const item = document.createElement("div");
  item.className = `toast toast-${tone}`;
  item.innerHTML = `<span class="toast-icon">${tone === "error" ? "!" : tone === "warn" ? "!" : "✓"}</span><span>${esc(msg)}</span><button aria-label="Fechar aviso">×</button>`;
  $("#toast-stack").append(item);
  item.querySelector("button").onclick = () => item.remove();
  setTimeout(() => item.remove(), 6500);
}
function errorText(err) {
  if (err instanceof ApiError && err.status === 429)
    return `${err.message} Limite atingido. Tente novamente em ${err.meta.retryAfter || "?"} segundos.`;
  if (err instanceof ApiError && err.status === 401)
    return `${err.message} Confira a autenticação ou entre novamente.`;
  return err?.message || "Erro inesperado.";
}
function reportError(err) {
  toast(errorText(err), "error");
}
function loadingButton(btn, busy, label) {
  btn.disabled = busy;
  if (busy) {
    btn.dataset.original = btn.innerHTML;
    btn.innerHTML = `<span class="btn-spinner"></span> ${esc(label)}`;
  } else if (btn.dataset.original) {
    btn.innerHTML = btn.dataset.original;
    delete btn.dataset.original;
  }
}
function setAccount() {
  const name = state.user?.nome || "Não autenticado";
  $("#account-name").textContent = name;
  $("#avatar-initials").textContent = state.user
    ? name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((s) => s[0])
        .join("")
        .toUpperCase()
    : "PD";
}
function navigate(page) {
  if (!PAGE_LABELS[page] || !state.user) return;
  state.page = page;
  location.hash = page;
  $("#breadcrumb-title").textContent = PAGE_LABELS[page];
  document
    .querySelectorAll(".nav-link[data-page]")
    .forEach((btn) =>
      btn.classList.toggle("active", btn.dataset.page === page),
    );
  $("#sidebar").classList.remove("opened");
  if (page === "dashboard") renderDashboard();
  else if (page === "integracao") renderIntegracao();
  else renderModule(page);
}

async function login(evt) {
  evt.preventDefault();
  const button = $("#login-submit");
  const error = $("#login-error");
  error.classList.add("hidden");
  const values = new FormData(evt.target);
  loadingButton(button, true, "Autenticando…");
  try {
    const res = await api.login(
      String(values.get("email")).trim(),
      String(values.get("senha")),
    );
    if (!res.data?.apiKey)
      throw new Error(
        "A API não retornou apiKey. Confira o contrato do login.",
      );
    api.key = res.data.apiKey;
    state.user = {
      id: res.data.usuarioId,
      nome: res.data.nome || "Operador",
      email: String(values.get("email")),
    };
    $("#login-overlay").classList.add("hidden");
    evt.target.reset();
    setAccount();
    toast(`Bem-vindo(a), ${state.user.nome}!`);
    navigate(
      (location.hash || "").slice(1) in PAGE_LABELS
        ? location.hash.slice(1)
        : "dashboard",
    );
  } catch (err) {
    error.textContent = errorText(err);
    error.classList.remove("hidden");
  } finally {
    loadingButton(button, false);
  }
}
async function logout() {
  if (!state.user) return;
  try {
    await api.logout();
    toast("Chave revogada. Sessão encerrada.");
  } catch (err) {
    toast(
      "Sessão local encerrada; a revogação no servidor não foi confirmada: " +
        errorText(err),
      "warn",
    );
  }
  api.clearSession();
  state.user = null;
  state.cache = {};
  state.salePending = null;
  state.page = "dashboard";
  $("#login-overlay").classList.remove("hidden");
  setAccount();
  closeModal();
  $("#content").innerHTML =
    '<div class="empty-state"><h2>Faça login para carregar os dados.</h2></div>';
}

function modal(title, body, options = {}) {
  closeModal();
  const el = document.createElement("div");
  el.className = "modal-backdrop";
  el.id = "active-modal";
  el.innerHTML = `<section class="modal-card ${options.wide ? "modal-wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><p class="eyebrow">SISTEMA PDV V2</p><h2 id="modal-title">${esc(title)}</h2></div><button class="icon-button" data-close aria-label="Fechar">×</button></div><div class="modal-body">${body}</div></section>`;
  $("#modal-root").append(el);
  state.modal = el;
  el.addEventListener("click", (e) => {
    if (e.target === el || e.target.closest("[data-close]")) closeModal();
  });
  const auto = el.querySelector("input,select,button");
  if (auto) auto.focus();
  return el;
}
function closeModal() {
  if (state.modal) state.modal.remove();
  state.modal = null;
}

function heading(title, subtitle, actions = "") {
  return `<div class="page-heading"><div><div class="eyebrow">PAINEL ADMINISTRATIVO / API V2</div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="heading-actions">${actions}</div></div>`;
}
function emptyRows(text = "Nenhum registro encontrado.") {
  return `<div class="empty-state"><div class="empty-symbol">◇</div><h3>Nada por aqui</h3><p>${esc(text)}</p></div>`;
}

async function renderDashboard() {
  $("#content").innerHTML =
    heading(
      "Visão geral",
      "Informações da sua loja em tempo real.",
      `<button class="btn btn-primary" id="quick-sale">+ Nova venda</button>`,
    ) +
    `<div class="stat-grid" id="stats"><div class="card skeleton" style="height:130px"></div><div class="card skeleton" style="height:130px"></div><div class="card skeleton" style="height:130px"></div><div class="card skeleton" style="height:130px"></div></div><div class="dashboard-grid"><section class="card table-card"><div class="card-head"><div><h2>Últimas vendas</h2><p>Registros recentes no sistema</p></div><button class="link-action" data-goto="vendas">Ver todas →</button></div><div id="recent-sales" class="table-placeholder">Carregando…</div></section><section class="card table-card"><div class="card-head"><div><h2>Estoque baixo</h2><p>Peças que precisam de atenção</p></div><button class="link-action" data-goto="estoques">Ver estoque →</button></div><div id="low-stock" class="table-placeholder">Carregando…</div></section></div>`;
  $("#quick-sale").onclick = () => openForm("vendas");
  document
    .querySelectorAll("[data-goto]")
    .forEach((b) => (b.onclick = () => navigate(b.dataset.goto)));
  const resources = ["vendas", "produtos", "clientes", "categorias"];
  const results = await Promise.allSettled(
    resources.map((x) =>
      api.list(x, { page: 0, size: 5, sort: MODULES[x].sort }),
    ),
  );
  if (state.page !== "dashboard") return;
  const stats = results.map((r) =>
    r.status === "fulfilled" ? unwrapList(r.value.data) : null,
  );
  const labels = [
    ["Vendas registradas", "◫"],
    ["Produtos cadastrados", "◈"],
    ["Clientes cadastrados", "♙"],
    ["Categorias", "▧"],
  ];
  $("#stats").innerHTML = labels
    .map(
      (label, i) =>
        `<div class="card stat-card"><div class="stat-top"><span class="stat-symbol stat-${i}">${label[1]}</span><span class="stat-label">${label[0]}</span></div><strong class="stat-number">${stats[i] ? (stats[i].page.totalElements ?? stats[i].items.length) : "—"}</strong><div class="stat-note">${stats[i] ? "Dados da API" : "Não foi possível consultar"}</div></div>`,
    )
    .join("");
  const sales = stats[0]?.items || [];
  $("#recent-sales").innerHTML = sales.length
    ? `<div class="table-scroll"><table class="data-table dashboard-table"><thead><tr><th>VENDA</th><th>CLIENTE</th><th>VALOR</th></tr></thead><tbody>${sales
        .slice(0, 5)
        .map(
          (x) =>
            `<tr><td>#${esc(x.id)}</td><td>${esc(x.cliente?.nome || "—")}</td><td class="bold-cell">${esc(currency(x.valorTotal))}</td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : emptyRows("Ainda não há vendas para exibir.");
  try {
    const stock = unwrapList(
      (await api.list("estoques/baixo", { page: 0, size: 5 })).data,
    );
    if (state.page !== "dashboard") return;
    $("#low-stock").innerHTML = stock.items.length
      ? `<div class="table-scroll"><table class="data-table dashboard-table"><thead><tr><th>PRODUTO</th><th>QTD.</th><th>ALERTA</th></tr></thead><tbody>${stock.items
          .slice(0, 5)
          .map(
            (x) =>
              `<tr><td>${esc(x.produto?.nome || "—")}</td><td>${esc(x.quantidade)}</td><td><span class="pill pill-warn">Baixo</span></td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : emptyRows("Nenhum produto abaixo do mínimo.");
  } catch (err) {
    if (state.page === "dashboard")
      $("#low-stock").innerHTML =
        `<div class="inline-error">${esc(errorText(err))}</div>`;
  }
}

function filterMarkup(resource) {
  const q = state.query[resource] || {};
  if (resource === "produtos" || resource === "categorias")
    return `<form class="filter-bar" id="filter-form"><input class="input" name="nome" aria-label="Buscar por nome" placeholder="Buscar ${resource} por nome…" value="${esc(q.nome || "")}"><button class="btn btn-dark" type="submit">Buscar</button><button class="btn btn-secondary" type="button" id="reset-filter">Limpar</button></form>`;
  if (resource === "clientes")
    return `<form class="filter-bar" id="filter-form"><input class="input" name="cpf" aria-label="CPF" placeholder="Consultar pelo CPF (11 dígitos)" value="${esc(q.cpf || "")}"><button class="btn btn-dark" type="submit">Consultar</button><button class="btn btn-secondary" type="button" id="reset-filter">Limpar</button></form>`;
  if (resource === "estoques")
    return `<form class="filter-bar" id="filter-form"><select class="input select-filter" name="tipo"><option value="todos" ${q.tipo === "todos" ? "selected" : ""}>Todos os estoques</option><option value="baixo" ${q.tipo === "baixo" ? "selected" : ""}>Somente estoque baixo</option><option value="produto" ${q.tipo === "produto" ? "selected" : ""}>Buscar por ID do produto</option></select><input class="input filter-id" type="number" min="1" name="produtoId" placeholder="ID do produto" value="${esc(q.produtoId || "")}"><button class="btn btn-dark" type="submit">Aplicar filtro</button><button class="btn btn-secondary" type="button" id="reset-filter">Limpar</button></form>`;
  if (resource === "vendas")
    return `<form class="filter-bar" id="filter-form"><input class="input" type="number" min="1" name="clienteId" placeholder="Buscar vendas pelo ID do cliente" value="${esc(q.clienteId || "")}"><button class="btn btn-dark" type="submit">Buscar</button><button class="btn btn-secondary" type="button" id="reset-filter">Limpar</button></form>`;
  return "";
}
function renderModule(resource) {
  const def = MODULES[resource];
  const version = (state.page = resource);
  $("#content").innerHTML =
    heading(
      def.title,
      def.subtitle,
      `<button class="btn btn-secondary" id="module-refresh">↻ Atualizar</button><button class="btn btn-primary" id="module-new">+ Novo ${def.singular.toLowerCase()}</button>`,
    ) +
    `<div class="card table-card"><div class="module-toolbar"><div><h2>Lista de ${def.title.toLowerCase()}</h2><p id="list-count">Consultando registros…</p></div><div class="toolbar-right"><label class="size-label">Por página <select class="size-select" id="per-page"><option value="5">5</option><option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option></select></label></div></div>${filterMarkup(resource)}<div id="module-list"><div class="table-placeholder">Carregando dados…</div></div><div id="pagination" class="pagination"></div></div>`;
  $("#module-new").onclick = () => openForm(resource);
  $("#module-refresh").onclick = () => loadRows(resource);
  $("#per-page").value = String(state.perPage);
  $("#per-page").onchange = (e) => {
    state.perPage = Number(e.target.value);
    state.pages[resource] = 0;
    loadRows(resource);
  };
  const filter = $("#filter-form");
  if (filter) {
    filter.addEventListener("submit", (e) => {
      e.preventDefault();
      state.query[resource] = Object.fromEntries(new FormData(filter));
      state.pages[resource] = 0;
      loadRows(resource);
    });
    $("#reset-filter").onclick = () => {
      state.query[resource] = {};
      state.pages[resource] = 0;
      renderModule(resource);
    };
  }
  loadRows(resource);
}
async function loadRows(resource) {
  const currentPage = state.pages[resource] || 0;
  const q = state.query[resource] || {};
  $("#module-list").innerHTML =
    '<div class="table-placeholder"><span class="spinner small"></span> Carregando registros…</div>';
  $("#pagination").innerHTML = "";
  try {
    let path = resource,
      params = {
        page: currentPage,
        size: state.perPage,
        sort: MODULES[resource].sort,
      },
      single = false;
    if (
      (resource === "categorias" || resource === "produtos") &&
      q.nome?.trim()
    ) {
      path += "/busca";
      params.nome = q.nome.trim();
    }
    if (resource === "clientes" && q.cpf?.trim()) {
      if (!/^\d{11}$/.test(q.cpf.trim()))
        throw new Error("Informe um CPF com exatamente 11 números.");
      path += "/cpf/" + encodeURIComponent(q.cpf.trim());
      single = true;
    }
    if (resource === "estoques") {
      if (q.tipo === "baixo") path += "/baixo";
      if (q.tipo === "produto") {
        if (!q.produtoId || Number(q.produtoId) < 1)
          throw new Error("Informe o ID do produto.");
        path += "/produto/" + encodeURIComponent(q.produtoId);
        single = true;
      }
    }
    if (resource === "vendas" && q.clienteId) {
      path += "/cliente/" + encodeURIComponent(q.clienteId);
    }
    const result = (await api.list(path, single ? {} : params)).data;
    if (state.page !== resource) return;
    const parsed = single
      ? {
          items: result ? [result] : [],
          page: { number: 0, totalPages: 1, totalElements: result ? 1 : 0 },
        }
      : unwrapList(result);
    state.cache[resource] = parsed.items;
    paintRows(resource, parsed);
  } catch (err) {
    if (state.page !== resource) return;
    $("#list-count").textContent = "Não foi possível consultar";
    $("#module-list").innerHTML =
      `<div class="inline-error">${esc(errorText(err))}<br><button class="btn btn-secondary btn-sm" id="retry-list">Tentar novamente</button></div>`;
    $("#retry-list").onclick = () => loadRows(resource);
  }
}
function paintRows(resource, result) {
  const rows = result.items,
    def = MODULES[resource],
    page = result.page || {};
  $("#list-count").textContent =
    `${page.totalElements ?? rows.length} registro(s) encontrado(s)`;
  if (!rows.length) {
    $("#module-list").innerHTML = emptyRows(
      "Nenhum registro corresponde ao filtro informado.",
    );
    $("#pagination").innerHTML = "";
    return;
  }
  const th = def.columns
    .map((c) => `<th>${esc(c[1].toUpperCase())}</th>`)
    .join("");
  const tr = rows
    .map(
      (item) =>
        `<tr>${def.columns
          .map(([path, , type]) => {
            const value = getPathValue(item, path);
            const text = esc(labelValue(value, type, path));
            if (path === "stockState")
              return `<td><span class="pill ${value === "BAIXO" ? "pill-warn" : "pill-good"}">${value === "BAIXO" ? "Estoque baixo" : "Normal"}</span></td>`;
            return `<td class="${path === "nome" ? "bold-cell" : ""}">${text}</td>`;
          })
          .join(
            "",
          )}<td class="row-actions"><button class="small-action" data-act="view" data-id="${esc(item.id)}" title="Visualizar">Ver</button><button class="small-action" data-act="edit" data-id="${esc(item.id)}" title="Editar">Editar</button><button class="small-action danger" data-act="delete" data-id="${esc(item.id)}" title="Excluir">Excluir</button></td></tr>`,
    )
    .join("");
  $("#module-list").innerHTML =
    `<div class="table-scroll"><table class="data-table"><thead><tr>${th}<th class="actions-th">AÇÕES</th></tr></thead><tbody>${tr}</tbody></table></div>`;
  $("#module-list")
    .querySelectorAll("button[data-act]")
    .forEach(
      (btn) =>
        (btn.onclick = () => {
          const { act, id } = btn.dataset;
          if (act === "view") openDetail(resource, id);
          if (act === "edit") openForm(resource, id);
          if (act === "delete") confirmRemove(resource, id);
        }),
    );
  const number = Number(page.number ?? 0),
    total = Number(page.totalPages ?? 1);
  $("#pagination").innerHTML =
    `<span>Página ${number + 1} de ${Math.max(total, 1)}</span><div class="pager-buttons"><button class="btn btn-secondary btn-sm" id="prev" ${number <= 0 ? "disabled" : ""}>← Anterior</button><button class="btn btn-secondary btn-sm" id="next" ${number >= total - 1 ? "disabled" : ""}>Próxima →</button></div>`;
  $("#prev").onclick = () => {
    state.pages[resource] = Math.max(0, number - 1);
    loadRows(resource);
  };
  $("#next").onclick = () => {
    state.pages[resource] = number + 1;
    loadRows(resource);
  };
}

async function fetchChoices(resource) {
  const result = unwrapList(
    (await api.list(resource, { page: 0, size: 100, sort: "id,asc" })).data,
  );
  return result.items;
}
function fieldHtml(field, item, choices) {
  const value = item?.[field.key];
  const fieldId = "field-" + field.key;
  const attr = `name="${field.key}" id="${fieldId}" ${field.required ? "required" : ""} ${field.min !== undefined ? 'min="' + field.min + '"' : ""} ${field.max !== undefined ? 'max="' + field.max + '"' : ""} ${field.minlength ? 'minlength="' + field.minlength + '"' : ""} ${field.maxlength ? 'maxlength="' + field.maxlength + '"' : ""} ${field.pattern ? 'pattern="' + field.pattern + '"' : ""} ${field.step ? 'step="' + field.step + '"' : ""}`;
  const label = `<span class="field-name">${esc(field.label)}${field.required ? " <em>*</em>" : ""}</span>`;
  let input = "";
  if (field.type === "select")
    input = `<select ${attr}><option value="">Selecione…</option>${field.options.map((opt) => `<option value="${esc(opt)}" ${value === opt ? "selected" : ""}>${esc(labelValue(opt, undefined, field.key))}</option>`).join("")}</select>`;
  else if (field.type === "relation") {
    const opts = choices[field.source] || [];
    const selected = value?.id ?? "";
    input = `<select ${attr} class="relation-select"><option value="">Selecione…</option>${opts.map((x) => `<option value="${esc(x.id)}" ${String(selected) === String(x.id) ? "selected" : ""}>#${esc(x.id)} · ${esc(x.nome || x.produto?.nome || x.id)}</option>`).join("")}<option value="__manual" ${selected && !opts.some((x) => String(x.id) === String(selected)) ? "selected" : ""}>Informar ID manualmente</option></select><input type="number" min="1" class="relation-manual" data-for="${field.key}" placeholder="ID existente" value="${esc(selected && !opts.some((x) => String(x.id) === String(selected)) ? selected : "")}" style="display:none"><span class="field-hint">São exibidos os primeiros 100 registros. Use ID manual para outros.</span>`;
  } else if (field.type === "multi-relation") {
    const opts = choices[field.source] || [];
    const selected = new Set((value || []).map((x) => String(x.id)));
    input = `<div class="product-checklist">${opts.length ? opts.map((x) => `<label class="product-check"><input type="checkbox" name="produtos_ids" value="${esc(x.id)}" ${selected.has(String(x.id)) ? "checked" : ""}><span><strong>${esc(x.nome)}</strong><small>${esc(currency(x.preco))} · Tamanho ${esc(x.tamanho)}</small></span></label>`).join("") : '<p class="muted">Nenhum produto cadastrado.</p>'}</div><div class="manual-product-row"><label for="product-ids-extra">Outros IDs (separados por vírgula)</label><input id="product-ids-extra" type="text" name="produtos_extras" placeholder="Ex.: 101, 102" value="${esc(
      (value || [])
        .filter((x) => !opts.some((opt) => String(opt.id) === String(x.id)))
        .map((x) => x.id)
        .join(", "),
    )}"></div><span class="field-hint">Cada ID distinto representa uma unidade. Quantidade e total são controlados pelo servidor.</span>`;
  } else
    input = `<input ${attr} type="${field.type || "text"}" value="${esc(value ?? "")}" placeholder="${esc(field.placeholder || "")}" ${field.type === "number" ? 'inputmode="decimal"' : ""}>`;
  return `<label class="field ${field.full ? "field-full" : ""}" ${field.type === "multi-relation" ? 'data-multi="true"' : ""} for="${fieldId}">${label}${input}</label>`;
}
async function openForm(resource, id = null) {
  const def = MODULES[resource];
  const dialog = modal(
    `${id ? "Editar" : "Novo"} ${def.singular.toLowerCase()}`,
    `<div class="table-placeholder"><span class="spinner small"></span> Preparando formulário…</div>`,
    { wide: true },
  );
  try {
    const sources = [
      ...new Set(def.fields.filter((f) => f.source).map((f) => f.source)),
    ];
    const [item, ...lists] = await Promise.all([
      id ? api.get(resource, id).then((x) => x.data) : Promise.resolve(null),
      ...sources.map((x) => fetchChoices(x)),
    ]);
    if (!dialog.isConnected) return;
    const choices = Object.fromEntries(sources.map((x, i) => [x, lists[i]]));
    dialog.querySelector(".modal-body").innerHTML =
      `<form id="entity-form"><div class="form-grid">${def.fields.map((f) => fieldHtml(f, item, choices)).join("")}</div><div id="save-error" class="form-error hidden" role="alert"></div><div class="modal-actions"><button type="button" class="btn btn-secondary" data-close>Cancelar</button><button type="submit" class="btn btn-primary" id="save-entity">${id ? "Salvar alterações" : "Cadastrar " + def.singular.toLowerCase()}</button></div></form>`;
    dialog.querySelectorAll("select.relation-select").forEach((sel) => {
      const manual = dialog.querySelector(`[data-for="${sel.name}"]`);
      const sync = () => {
        manual.style.display = sel.value === "__manual" ? "block" : "none";
        manual.required = sel.value === "__manual";
      };
      sel.onchange = sync;
      sync();
    });
    dialog
      .querySelectorAll("[data-close]")
      .forEach((b) => (b.onclick = closeModal));
    dialog.querySelector("#entity-form").onsubmit = async (e) => {
      e.preventDefault();
      const btn = dialog.querySelector("#save-entity");
      const form = e.target;
      try {
        const data = new FormData(form),
          payload = {};
        for (const f of def.fields) {
          let value = data.get(f.key);
          if (f.type === "number") {
            value = Number(value);
            if (!Number.isFinite(value))
              throw new Error(`Valor inválido: ${f.label}`);
          } else if (f.type === "relation") {
            if (value === "__manual")
              value = dialog.querySelector(`[data-for="${f.key}"]`).value;
            if (!value || Number(value) < 1)
              throw new Error(`Selecione um(a) ${f.label}.`);
            value = { id: Number(value) };
          } else if (f.type === "multi-relation") {
            const extras = String(data.get("produtos_extras") || "")
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean);
            const ids = [
              ...new Set(
                [...data.getAll("produtos_ids"), ...extras].map((x) =>
                  Number(x),
                ),
              ),
            ];
            if (
              !ids.length ||
              ids.some((x) => !Number.isSafeInteger(x) || x <= 0)
            )
              throw new Error("Selecione ao menos um produto válido.");
            value = ids.map((n) => ({ id: n }));
          }
          payload[f.key] = value;
        }
        loadingButton(btn, true, id ? "Salvando…" : "Cadastrando…");
        let res;
        if (id) res = await api.update(resource, id, payload);
        else if (resource === "vendas") {
          const signature = JSON.stringify(payload);
          if (!state.salePending || state.salePending.signature !== signature)
            state.salePending = { signature, key: crypto.randomUUID() };
          res = await api.create(resource, payload, state.salePending.key);
        } else res = await api.create(resource, payload);
        if (resource === "vendas" && !id) state.salePending = null;
        toast(
          (id ? "Registro atualizado." : "Registro cadastrado.") +
            (res.meta.replayed === "true"
              ? " Resposta idempotente reutilizada."
              : ""),
        );
        closeModal();
        if (state.page === resource) loadRows(resource);
        else navigate(resource);
      } catch (err) {
        const el = dialog.querySelector("#save-error");
        if (el) {
          el.textContent = errorText(err);
          el.classList.remove("hidden");
        }
        reportError(err);
      } finally {
        if (btn.isConnected) loadingButton(btn, false);
      }
    };
  } catch (err) {
    if (dialog.isConnected)
      dialog.querySelector(".modal-body").innerHTML =
        `<div class="inline-error">${esc(errorText(err))}</div><div class="modal-actions"><button class="btn btn-secondary" data-close>Fechar</button></div>`;
    dialog.querySelector("[data-close]")?.addEventListener("click", closeModal);
  }
}
async function openDetail(resource, id) {
  const def = MODULES[resource];
  const dialog = modal(
    `Detalhes de ${def.singular.toLowerCase()} #${id}`,
    `<div class="table-placeholder">Carregando…</div>`,
  );
  try {
    const item = (await api.get(resource, id)).data;
    if (!dialog.isConnected) return;
    const filtered = Object.entries(item || {}).filter(([k]) => k !== "_links");
    dialog.querySelector(".modal-body").innerHTML =
      `<div class="detail-grid">${filtered.map(([k, v]) => `<div class="detail-item"><span>${esc(k)}</span><strong>${esc(typeof v === "object" ? JSON.stringify(v) : labelValue(v, k === "valorTotal" || k === "preco" ? "money" : undefined, k))}</strong></div>`).join("")}</div><details class="raw-json"><summary>Ver resposta JSON completa</summary><pre>${esc(JSON.stringify(item, null, 2))}</pre></details><div class="modal-actions"><button class="btn btn-secondary" data-close>Fechar</button><button class="btn btn-primary" id="edit-detail">Editar</button></div>`;
    dialog.querySelector("[data-close]").onclick = closeModal;
    dialog.querySelector("#edit-detail").onclick = () => openForm(resource, id);
  } catch (err) {
    if (dialog.isConnected)
      dialog.querySelector(".modal-body").innerHTML =
        `<div class="inline-error">${esc(errorText(err))}</div>`;
  }
}
function confirmRemove(resource, id) {
  const def = MODULES[resource];
  const d = modal(
    "Confirmar exclusão",
    `<p>Deseja excluir ${esc(def.noun)} <strong>#${esc(id)}</strong>? Esta operação pode afetar dados vinculados e não pode ser desfeita.</p><div class="modal-actions"><button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-danger" id="confirm-delete">Excluir definitivamente</button></div>`,
  );
  d.querySelector("[data-close]").onclick = closeModal;
  d.querySelector("#confirm-delete").onclick = async (e) => {
    const btn = e.currentTarget;
    loadingButton(btn, true, "Excluindo…");
    try {
      await api.remove(resource, id);
      toast(`${def.singular} excluído(a).`);
      closeModal();
      loadRows(resource);
    } catch (err) {
      reportError(err);
    } finally {
      if (btn.isConnected) loadingButton(btn, false);
    }
  };
}

function monitorHtml() {
  const limit = state.rate?.limit,
    remaining = state.rate?.remaining,
    retry = state.rate?.retryAfter;
  return `<div class="monitor-cards"><div class="card monitor-stat"><div class="monitor-label">Versão da API</div><strong>V2</strong><small>X-API-Version: 2</small></div><div class="card monitor-stat"><div class="monitor-label">Limite por minuto</div><strong>${esc(limit ?? "—")}</strong><small>Conforme resposta do servidor</small></div><div class="card monitor-stat"><div class="monitor-label">Requisições restantes</div><strong>${esc(remaining ?? "—")}</strong><small>${retry ? "Retry-After: " + esc(retry) + " s" : "Limite monitorado por header"}</small></div></div>`;
}
async function renderIntegracao() {
  $("#content").innerHTML =
    heading(
      "API e monitoramento",
      "Explore o contrato da V2 e acompanhe as chamadas realizadas.",
    ) +
    `<div id="monitor-cards">${monitorHtml()}</div><div class="dashboard-grid monitor-grid"><section class="card panel-pad"><div class="card-head"><div><h2>Configuração da conexão</h2><p>Destino das requisições HTTP</p></div></div><form id="connection-form"><label class="field"><span>Raiz da API</span><input id="connection-url" type="text" required value="${esc(api.base)}"></label><p class="field-hint">Recomendado: <code>/api</code> no servidor com proxy. A autenticação por chave é enviada apenas após login.</p><button class="btn btn-dark" type="submit">Salvar endereço</button></form><hr class="soft-rule"><div class="security-info"><span class="pill pill-good">Sessão autenticada</span><p><strong>${esc(state.user.nome)}</strong> · Chave armazenada só em memória</p><button class="btn btn-secondary" id="monitor-logout">Sair e revogar chave</button></div></section><section class="card panel-pad"><div class="card-head"><div><h2>Recursos avançados</h2><p>Disponíveis no backend</p></div></div><div class="feature-row"><div class="feature-icon">⌁</div><div><strong>API Key</strong><p>Header X-API-Key enviado nas chamadas autenticadas.</p></div></div><div class="feature-row"><div class="feature-icon">↻</div><div><strong>Idempotência</strong><p>UUID em X-Idempotency-Key para criar vendas, reutilizado ao repetir a mesma tentativa.</p></div></div><div class="feature-row"><div class="feature-icon">◷</div><div><strong>Rate limiting</strong><p>Exibição de 429 e do tempo Retry-After, sem tentativas automáticas.</p></div></div></section></div><div class="card table-card api-log"><div class="card-head"><div><h2>Histórico de requisições</h2><p>Registros locais desta aba</p></div><button class="btn btn-secondary btn-sm" id="clear-log">Limpar</button></div><div id="request-logs"></div></div><div class="card table-card contract-card"><div class="card-head"><div><h2>Contrato de endpoints</h2><p>Operações identificadas no OpenAPI fornecido</p></div><span id="endpoint-total" class="pill pill-neutral">Carregando</span></div><div id="api-operations" class="table-placeholder">Carregando contrato…</div></div>`;
  $("#connection-form").onsubmit = (e) => {
    e.preventDefault();
    try {
      api.configureBase($("#connection-url").value);
      toast("URL atualizada. Faça login novamente se mudar de servidor.");
    } catch (err) {
      reportError(err);
    }
  };
  $("#monitor-logout").onclick = logout;
  $("#clear-log").onclick = () => {
    state.requests = [];
    updateMonitor();
  };
  updateMonitor();
  try {
    const res = await fetch("./openapi.json");
    if (!res.ok) throw new Error("Arquivo OpenAPI não foi carregado.");
    const spec = await res.json();
    if (state.page !== "integracao") return;
    const operations = Object.entries(spec.paths).flatMap(([path, verbs]) =>
      Object.entries(verbs).map(([method, desc]) => ({
        method,
        path,
        title: desc.summary || desc.operationId || "Operação",
      })),
    );
    $("#endpoint-total").textContent = operations.length + " operações";
    $("#api-operations").innerHTML =
      `<div class="table-scroll"><table class="data-table"><thead><tr><th>MÉTODO</th><th>ENDPOINT</th><th>OPERAÇÃO</th><th></th></tr></thead><tbody>${operations
        .map((x) => {
          const resource = Object.keys(MODULES).find((r) =>
            x.path.startsWith("/api/v2/" + r),
          );
          const path = resource || "integracao";
          return `<tr><td><span class="method-badge method-${x.method}">${esc(x.method.toUpperCase())}</span></td><td class="mono">${esc(x.path)}</td><td>${esc(x.title)}</td><td><button class="small-action" data-goto="${path}">${resource ? "Abrir módulo" : "Detalhes"}</button></td></tr>`;
        })
        .join("")}</tbody></table></div>`;
    $("#api-operations")
      .querySelectorAll("[data-goto]")
      .forEach((b) => (b.onclick = () => navigate(b.dataset.goto)));
  } catch (err) {
    $("#api-operations").innerHTML =
      `<div class="inline-error">${esc(errorText(err))}</div>`;
  }
}
function updateMonitor() {
  if ($("#monitor-cards")) $("#monitor-cards").innerHTML = monitorHtml();
  const log = $("#request-logs");
  if (!log) return;
  log.innerHTML = state.requests.length
    ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>HORA</th><th>MÉTODO</th><th>ROTA</th><th>STATUS</th><th>DURAÇÃO</th></tr></thead><tbody>${state.requests.map((r) => `<tr><td>${esc(r.time)}</td><td><span class="method-badge method-${r.method.toLowerCase()}">${esc(r.method)}</span></td><td class="mono">${esc(r.path)}</td><td><span class="pill ${Number(r.status) >= 200 && Number(r.status) < 400 ? "pill-good" : "pill-warn"}">${esc(r.status)}</span></td><td>${esc(r.duration)} ms</td></tr>`).join("")}</tbody></table></div>`
    : emptyRows("Nenhuma requisição registrada nesta sessão.");
}

$("#login-form").addEventListener("submit", login);
$("#api-root").value = api.base;
$("#save-api-url").onclick = () => {
  try {
    api.configureBase($("#api-root").value);
    toast("Endereço salvo.");
  } catch (err) {
    reportError(err);
  }
};
$("#main-nav").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-page]");
  if (btn) navigate(btn.dataset.page);
});
$("#refresh-btn").onclick = () => navigate(state.page);
$("#menu-toggle").onclick = () => $("#sidebar").classList.toggle("opened");
$("#account-btn").onclick = () => {
  if (!state.user) return;
  const d = modal(
    "Minha sessão",
    `<div class="account-info"><span class="avatar large">${esc($("#avatar-initials").textContent)}</span><div><strong>${esc(state.user.nome)}</strong><p>${esc(state.user.email)}</p><small>ID do usuário: ${esc(state.user.id)}</small></div></div><div class="modal-actions"><button class="btn btn-secondary" data-close>Voltar</button><button class="btn btn-danger" id="session-logout">Sair e revogar chave</button></div>`,
  );
  d.querySelector("[data-close]").onclick = closeModal;
  d.querySelector("#session-logout").onclick = logout;
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});
window.addEventListener("hashchange", () => {
  if (state.user) {
    const x = location.hash.slice(1);
    if (PAGE_LABELS[x] && x !== state.page) navigate(x);
  }
});
setAccount();
