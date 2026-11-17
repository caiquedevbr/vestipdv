/** Formulários e colunas fundamentados nos schemas do openapi.json anexado. */
export const MODULES = {
  vendas: {
    title: "Vendas",
    singular: "Venda",
    subtitle: "Acompanhe as transações e registre novas vendas.",
    noun: "venda",
    icon: "◫",
    columns: [
      ["id", "Nº"],
      ["cliente.nome", "Cliente"],
      ["formaPagamento", "Pagamento"],
      ["produtos.length", "Itens"],
      ["valorTotal", "Total", "money"],
      ["dataVenda", "Data", "date"],
    ],
    fields: [
      {
        key: "cliente",
        label: "Cliente",
        type: "relation",
        source: "clientes",
        required: true,
      },
      {
        key: "formaPagamento",
        label: "Forma de pagamento",
        type: "select",
        options: ["DINHEIRO", "CARTAO_CREDITO", "CARTAO_DEBITO", "PIX"],
        required: true,
      },
      {
        key: "produtos",
        label: "Produtos (uma unidade por produto)",
        type: "multi-relation",
        source: "produtos",
        required: true,
        full: true,
      },
    ],
    sort: "dataVenda,desc",
  },
  produtos: {
    title: "Produtos",
    singular: "Produto",
    subtitle: "Cadastre e organize as peças da sua loja.",
    noun: "produto",
    icon: "◈",
    columns: [
      ["id", "ID"],
      ["nome", "Produto"],
      ["categoria.nome", "Categoria"],
      ["tamanho", "Tamanho"],
      ["preco", "Preço", "money"],
      ["descricao", "Descrição"],
    ],
    fields: [
      {
        key: "nome",
        label: "Nome",
        required: true,
        minlength: 3,
        maxlength: 100,
        placeholder: "Ex.: Camiseta básica",
      },
      {
        key: "descricao",
        label: "Descrição",
        required: true,
        maxlength: 500,
        full: true,
        placeholder: "Descrição da peça",
      },
      {
        key: "preco",
        label: "Preço (R$)",
        type: "number",
        step: "0.01",
        min: "0.01",
        required: true,
      },
      {
        key: "tamanho",
        label: "Tamanho",
        type: "select",
        options: ["PP", "P", "M", "G", "GG"],
        required: true,
      },
      {
        key: "categoria",
        label: "Categoria",
        type: "relation",
        source: "categorias",
        required: true,
      },
    ],
    sort: "id,desc",
    search: true,
    searchLabel: "Buscar por nome",
    searchParam: "nome",
  },
  estoques: {
    title: "Estoque",
    singular: "Estoque",
    subtitle: "Controle quantidades e monitore o estoque mínimo.",
    noun: "registro de estoque",
    icon: "▤",
    columns: [
      ["id", "ID"],
      ["produto.nome", "Produto"],
      ["quantidade", "Quantidade"],
      ["estoqueMinimo", "Mínimo"],
      ["stockState", "Status"],
    ],
    fields: [
      {
        key: "produto",
        label: "Produto",
        type: "relation",
        source: "produtos",
        required: true,
      },
      {
        key: "quantidade",
        label: "Quantidade",
        type: "number",
        step: "1",
        min: "0",
        required: true,
      },
      {
        key: "estoqueMinimo",
        label: "Estoque mínimo",
        type: "number",
        step: "1",
        min: "0",
        required: true,
      },
    ],
    sort: "id,desc",
  },
  clientes: {
    title: "Clientes",
    singular: "Cliente",
    subtitle: "Gerencie o cadastro de consumidores.",
    noun: "cliente",
    icon: "♙",
    columns: [
      ["id", "ID"],
      ["nome", "Nome"],
      ["cpf", "CPF"],
      ["telefone", "Telefone"],
      ["genero", "Gênero"],
      ["idade", "Idade"],
    ],
    fields: [
      {
        key: "nome",
        label: "Nome completo",
        required: true,
        minlength: 3,
        maxlength: 100,
        placeholder: "Ex.: Maria Silva",
        full: true,
      },
      {
        key: "idade",
        label: "Idade",
        type: "number",
        step: "1",
        min: "1",
        max: "130",
        required: true,
      },
      {
        key: "genero",
        label: "Gênero",
        type: "select",
        options: ["MASCULINO", "FEMININO", "OUTRO"],
        required: true,
      },
      {
        key: "telefone",
        label: "Telefone (somente números)",
        type: "tel",
        pattern: "[0-9]{10,11}",
        required: true,
        placeholder: "11999999999",
      },
      {
        key: "cpf",
        label: "CPF (11 dígitos)",
        pattern: "[0-9]{11}",
        required: true,
        placeholder: "12345678901",
      },
    ],
    sort: "id,desc",
  },
  categorias: {
    title: "Categorias",
    singular: "Categoria",
    subtitle: "Organize seus produtos em coleções.",
    noun: "categoria",
    icon: "▧",
    columns: [
      ["id", "ID"],
      ["nome", "Categoria"],
      ["descricao", "Descrição"],
    ],
    fields: [
      {
        key: "nome",
        label: "Nome da categoria",
        required: true,
        minlength: 3,
        maxlength: 100,
        placeholder: "Ex.: Camisetas",
      },
      {
        key: "descricao",
        label: "Descrição",
        required: true,
        maxlength: 500,
        full: true,
        placeholder: "Ex.: Camisetas e regatas para o dia a dia",
      },
    ],
    sort: "nome,asc",
    search: true,
    searchLabel: "Buscar por nome",
    searchParam: "nome",
  },
};
export const PAGE_LABELS = {
  dashboard: "Visão geral",
  vendas: "Vendas",
  produtos: "Produtos",
  estoques: "Estoque",
  clientes: "Clientes",
  categorias: "Categorias",
  integracao: "API e monitoramento",
};
export const currency = (value) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value || 0),
  );
export function getPathValue(obj, path) {
  if (path === "produtos.length")
    return Array.isArray(obj?.produtos) ? obj.produtos.length : 0;
  if (path === "stockState")
    return Number(obj?.quantidade) <= Number(obj?.estoqueMinimo)
      ? "BAIXO"
      : "OK";
  return path.split(".").reduce((x, k) => x?.[k], obj);
}
export function labelValue(value, type, path) {
  if (value === undefined || value === null || value === "") return "—";
  if (type === "money") return currency(value);
  if (type === "date") {
    const d = new Date(value);
    return isNaN(d)
      ? String(value)
      : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }
  if (path === "formaPagamento")
    return (
      {
        DINHEIRO: "Dinheiro",
        CARTAO_CREDITO: "Crédito",
        CARTAO_DEBITO: "Débito",
        PIX: "Pix",
      }[value] || value
    );
  if (path === "genero")
    return (
      { MASCULINO: "Masculino", FEMININO: "Feminino", OUTRO: "Outro" }[value] ||
      value
    );
  return String(value);
}
