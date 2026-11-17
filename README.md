# Vesti PDV | Frontend para API V2

Painel básico e responsivo em **HTML, CSS e JavaScript puro**, sem framework e sem dependências NPM. Implementado a partir do `openapi.json` anexado (PDV API v2.0.0).

## Como executar

1. Inicie a aplicação Spring Boot na porta **8080**:
   ```bash
   ./mvnw spring-boot:run
   ```
2. Abra um segundo terminal nesta pasta e execute (Node 18+):
   ```bash
   npm start
   ```
   Não é necessário `npm install`.
3. Abra **http://localhost:5500**.
4. Faça login usando o **e-mail e a senha de um `UsuarioSistema` existente** no banco do backend. O frontend não gera credenciais automaticamente.

O `server.mjs` entrega arquivos estáticos e encaminha todas as requisições `/api/*` à API hospedada em `https://pdv-loja-roupas-api.onrender.com`, evitando problemas de CORS durante desenvolvimento. O proxy não encaminha o cabeçalho `Origin`: para o navegador a chamada já é same-origin (`http://localhost:5500/api/*`), e a API não deve tratá-la como uma chamada CORS. Para usar outro backend:

```bash
# PowerShell
$env:PDV_API_URL='http://localhost:8081'; npm start
# Linux/macOS
PDV_API_URL=http://localhost:8081 npm start
```

Alternativa: copie `index.html`, `styles.css`, `js/` e `openapi.json` para `src/main/resources/static/` no projeto Spring Boot. Assim, a própria API servirá a interface e não será preciso o `server.mjs`.

## Funcionalidades e endpoints

| Módulo | Operações disponíveis |
|---|---|
| Autenticação | `POST /api/v2/auth/login`, `POST /api/v2/auth/logout` |
| Categorias | `GET` lista, `POST` cadastrar, `GET /{id}`, `PUT /{id}`, `DELETE /{id}`, `GET /busca?nome=` |
| Clientes | `GET` lista, `POST` cadastrar, `GET /{id}`, `PUT /{id}`, `DELETE /{id}`, `GET /cpf/{cpf}` |
| Produtos | `GET` lista, `POST` cadastrar, `GET /{id}`, `PUT /{id}`, `DELETE /{id}`, `GET /busca?nome=` |
| Estoques | `GET` lista, `POST` cadastrar, `GET /{id}`, `PUT /{id}`, `DELETE /{id}`, `GET /baixo`, `GET /produto/{produtoId}` |
| Vendas | `GET` lista, `POST` cadastrar, `GET /{id}`, `PUT /{id}`, `DELETE /{id}`, `GET /cliente/{clienteId}` |

**Total: 33 operações documentadas no OpenAPI.** A aba “API e monitoramento” carrega `openapi.json` e mostra as operações e o histórico de requisições realizadas.

## Regras de integração

- Toda chamada utiliza `X-API-Version: 2`.
- Após o login, a chave `X-API-Key` é enviada nas requisições autenticadas. A chave fica **somente em memória**, sem `localStorage`; ao recarregar, é necessário entrar novamente.
- No `POST /api/v2/vendas`, `X-Idempotency-Key` recebe um UUID. Se ocorrer erro ou timeout e o usuário repetir o envio do **mesmo corpo**, a mesma chave é reutilizada nessa aba; uma nova composição de venda recebe uma nova chave. O backend é responsável por verificar e armazenar a idempotência.
- Cada produto em `Venda.produtos` representa **uma unidade**; o formulário oferece seleção de produtos distintos e a API calcula `valorTotal` e baixa o estoque.
- Cabeçalhos `X-RateLimit-*`, `Retry-After` e `Idempotent-Replayed` são lidos da resposta. Erro HTTP 429 é exibido sem repetição automática.
- Respostas paginadas Spring HATEOAS (`_embedded`, `page`, `_links`) são interpretadas no frontend.
- Erros `application/problem+json` mostram `detail`, `mensagem` ou `title`.
- Recursos vinculados nos formulários (categoria, cliente, produto) são carregados por listagens com `size=100`; caso não apareçam, informe o ID manualmente.
- Os campos de request seguem os schemas reais do OpenAPI: `Produto` possui `nome`, `descricao`, `preco`, `tamanho`, `categoria`; `Estoque` possui `quantidade`, `estoqueMinimo`, `produto`; `Venda` possui `cliente`, `formaPagamento`, `produtos`.

## Observações importantes

- O ambiente pressupõe `UsuarioSistema` já cadastrado, com senha BCrypt válida. Não há endpoint público de criação de usuário no contrato anexado.
- O frontend **não modifica a API**. É necessário que a API esteja rodando, com dados e usuários compatíveis.
- O menu da V2 envia chave em todas as operações após login, conforme o contrato OpenAPI que declara `apiKeyAuth` nos endpoints. Verifique no backend quais rotas realmente exigem a chave.
- Os dados exibidos são exclusivamente retornados pela API. Não há dados falsos ou persistência local de clientes, vendas ou produtos.
- Para produção: configurar HTTPS, autenticação/autorizações adequadas, headers HTTP, regras CORS e logs seguros (não registrar chaves). O servidor Node incluso é destinado a desenvolvimento.
- A folha de estilos tenta carregar DM Sans/Outfit do Google Fonts; na ausência de internet, usa as fontes do sistema.

## Testes automatizados do cliente HTTP

```bash
npm test
```

Os testes unitários verificam autenticação, cabeçalhos da V2 e da idempotência, paginação HAL, erro 429 e exclusão 204. Eles não substituem testes de ponta a ponta com o Spring Boot em execução.
