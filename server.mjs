/** Servidor local sem dependências, com proxy same-origin para o Spring Boot. Node 18+. */
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, extname, sep } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5500);
const BACKEND =
  process.env.PDV_API_URL || "https://pdv-loja-roupas-api.onrender.com";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
]);
// O navegador conversa com este servidor na mesma origem. Repassar Origin ao
// Spring faria o backend interpretar a chamada do proxy como cross-origin.
const REQUEST_HEADERS_OMITTED_BY_PROXY = new Set([
  ...HOP_BY_HOP,
  "expect",
  "origin",
]);

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (url.pathname.startsWith("/api/")) {
        const destination = new URL(url.pathname + url.search, BACKEND);
        const headers = Object.fromEntries(
          Object.entries(req.headers).filter(
            ([name]) => !REQUEST_HEADERS_OMITTED_BY_PROXY.has(name),
          ),
        );
        const body =
          req.method === "GET" || req.method === "HEAD"
            ? undefined
            : await readBody(req);
        const upstream = await fetch(destination, {
          method: req.method,
          headers,
          body,
          redirect: "manual",
        });
        res.statusCode = upstream.status;
        upstream.headers.forEach((value, name) => {
          if (
            !HOP_BY_HOP.has(name) &&
            name !== "content-encoding" &&
            name !== "content-length"
          )
            res.setHeader(name, value);
        });
        const raw = Buffer.from(await upstream.arrayBuffer());
        res.end(raw);
        return;
      }
      const route =
        url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
      const file = resolve(ROOT, "." + route);
      if (!file.startsWith(ROOT + sep) && file !== ROOT) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      if (!existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      createReadStream(file).pipe(res);
    } catch (err) {
      console.error(err);
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          message: "Erro ao acessar o backend ou arquivo estático.",
          details: String(err.message || err),
        }),
      );
    }
  })
  .listen(PORT, "127.0.0.1", () =>
    console.log(`PDV web: http://localhost:${PORT} | Backend: ${BACKEND}`),
  );

async function readBody(req) {
  let length = 0;
  const chunks = [];
  for await (const piece of req) {
    length += piece.length;
    if (length > 1024 * 1024) {
      req.destroy();
      throw new Error("Body excede 1MB");
    }
    chunks.push(piece);
  }
  return Buffer.concat(chunks);
}
