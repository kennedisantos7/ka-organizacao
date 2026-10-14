// Servidor do cofre: entrega as páginas estáticas e uma API JSON sobre o
// Postgres da Coolify. Sem login — quem abre o endereço usa o cofre.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const RAIZ = fileURLToPath(new URL(".", import.meta.url));
const PORTA = Number(process.env.PORT || 3000);
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
// Conexão ociosa derrubada pelo banco (reinício, rede): o pool descarta e abre outra.
// Sem este ouvinte, o Node encerra o processo inteiro.
db.on("error", (e) => console.error("conexão ociosa do banco caiu:", e.message));

/* ---------------- Banco ---------------- */

const ESQUEMA = `

create table if not exists empresas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (length(trim(nome)) > 0),
  responsavel text not null default '',
  link_drive  text not null default '',
  link_canva  text not null default '',
  criado_em   timestamptz not null default now()
);
create unique index if not exists empresas_nome_uniq on empresas (lower(nome));

create table if not exists anotacoes (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references empresas (id) on delete cascade,
  conteudo     text not null check (length(trim(conteudo)) > 0),
  data_criacao timestamptz not null default now()
);
create index if not exists anotacoes_empresa_idx on anotacoes (empresa_id, data_criacao desc);

create table if not exists empresa_tarefas (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  titulo     text not null check (length(trim(titulo)) > 0),
  concluida  boolean not null default false,
  criado_em  timestamptz not null default now()
);
create index if not exists empresa_tarefas_idx on empresa_tarefas (empresa_id, concluida, criado_em desc);

create table if not exists tarefas (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null check (length(trim(titulo)) > 0),
  concluida    boolean not null default false,
  criado_em    timestamptz not null default now(),
  concluida_em timestamptz
);
create index if not exists tarefas_ordem_idx on tarefas (concluida, criado_em desc);
`;

// Importação única dos dados antigos (exportados do Supabase). Só aceita com o
// banco vazio, então depois da primeira carga a rota não altera mais nada.
// Mantém os ids, então os links continuam valendo.
const TABELAS_IMPORT = {
  empresas: ["id", "nome", "responsavel", "link_drive", "link_canva", "criado_em"],
  anotacoes: ["id", "empresa_id", "conteudo", "data_criacao"],
  empresa_tarefas: ["id", "empresa_id", "titulo", "concluida", "criado_em"],
  tarefas: ["id", "titulo", "concluida", "criado_em", "concluida_em"],
};

async function importar(dados) {
  const cliente = await db.connect();
  try {
    await cliente.query("begin");
    await cliente.query("lock table empresas in exclusive mode");
    const { rows: [{ n }] } = await cliente.query("select count(*)::int as n from empresas");
    if (n > 0) throw new ErroHttp(409, "O banco já tem dados; importação recusada.");
    const totais = {};
    for (const [t, cols] of Object.entries(TABELAS_IMPORT)) {
      const linhas = Array.isArray(dados[t]) ? dados[t] : [];
      for (const r of linhas) {
        await cliente.query(
          `insert into ${t} (${cols.join(", ")}) values (${cols.map((_, i) => "$" + (i + 1)).join(", ")})`,
          cols.map((c) => r[c])
        );
      }
      totais[t] = linhas.length;
    }
    await cliente.query("commit");
    return totais;
  } catch (e) {
    await cliente.query("rollback");
    throw e;
  } finally {
    cliente.release();
  }
}

/* ---------------- API ---------------- */

class ErroHttp extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

const texto = (v, campo) => {
  const s = String(v ?? "").trim();
  if (!s) throw new ErroHttp(400, `Informe ${campo}.`);
  return s;
};

const EMPRESA = "id, nome, responsavel, link_drive, link_canva";
const um = async (sql, params) => (await db.query(sql, params)).rows[0] || null;
const todos = async (sql, params) => (await db.query(sql, params)).rows;

// [método, padrão, função(params, corpo, query)]
const rotas = [
  ["GET", "/api/empresas", () => todos(`select ${EMPRESA} from empresas`)],
  ["GET", "/api/empresas/:id", (p) => um(`select ${EMPRESA} from empresas where id = $1`, [p.id])],
  ["POST", "/api/empresas", (_, c) =>
    um(`insert into empresas (nome, responsavel) values ($1, $2) returning ${EMPRESA}`,
      [texto(c.nome, "o nome"), String(c.responsavel || "").trim()])],
  ["PATCH", "/api/empresas/:id", async (p, c) => {
    const campos = ["nome", "responsavel", "link_drive", "link_canva"].filter((k) => k in c);
    if (!campos.length) return null;
    if ("nome" in c) c.nome = texto(c.nome, "o nome");
    return um(
      `update empresas set ${campos.map((k, i) => `${k} = $${i + 2}`).join(", ")} where id = $1 returning ${EMPRESA}`,
      [p.id, ...campos.map((k) => String(c[k] ?? ""))]
    );
  }],
  ["DELETE", "/api/empresas/:id", (p) => db.query("delete from empresas where id = $1", [p.id])],

  ["GET", "/api/anotacoes", (_, __, q) => q.get("empresa_id")
    ? todos("select * from anotacoes where empresa_id = $1 order by data_criacao desc", [q.get("empresa_id")])
    : todos("select * from anotacoes order by data_criacao desc")],
  ["GET", "/api/anotacoes/contagem", () =>
    todos("select empresa_id, count(*)::int as total from anotacoes group by empresa_id")],
  ["POST", "/api/anotacoes", (_, c) =>
    um("insert into anotacoes (empresa_id, conteudo) values ($1, $2) returning *",
      [c.empresa_id, texto(c.conteudo, "a anotação")])],
  ["DELETE", "/api/anotacoes/:id", (p) => db.query("delete from anotacoes where id = $1", [p.id])],

  ["GET", "/api/empresas/:id/tarefas", (p) =>
    todos("select id, titulo, concluida, criado_em from empresa_tarefas where empresa_id = $1 " +
      "order by concluida, criado_em desc", [p.id])],
  ["POST", "/api/empresas/:id/tarefas", (p, c) =>
    um("insert into empresa_tarefas (empresa_id, titulo) values ($1, $2) returning *",
      [p.id, texto(c.titulo, "a tarefa")])],
  ["PATCH", "/api/empresa-tarefas/:id", (p, c) => {
    if ("titulo" in c) return um("update empresa_tarefas set titulo = $2 where id = $1 returning *",
      [p.id, texto(c.titulo, "a tarefa")]);
    return um("update empresa_tarefas set concluida = $2 where id = $1 returning *", [p.id, !!c.concluida]);
  }],
  ["DELETE", "/api/empresa-tarefas/:id", (p) => db.query("delete from empresa_tarefas where id = $1", [p.id])],

  ["GET", "/api/tarefas", () =>
    todos("select id, titulo, concluida, criado_em from tarefas order by concluida, criado_em desc")],
  ["POST", "/api/tarefas", (_, c) =>
    um("insert into tarefas (titulo) values ($1) returning *", [texto(c.titulo, "a tarefa")])],
  ["PATCH", "/api/tarefas/:id", (p, c) =>
    um("update tarefas set concluida = $2, concluida_em = case when $2 then now() end where id = $1 returning *",
      [p.id, !!c.concluida])],
  ["DELETE", "/api/tarefas/concluidas", () => db.query("delete from tarefas where concluida")],
  ["POST", "/api/importar", (_, c) => importar(c)],
  ["DELETE", "/api/tarefas/:id", (p) => db.query("delete from tarefas where id = $1", [p.id])],
];

function casar(padrao, caminho) {
  const a = padrao.split("/"), b = caminho.split("/");
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

async function lerCorpo(req) {
  let dados = "";
  for await (const parte of req) {
    dados += parte;
    if (dados.length > 1e6) throw new ErroHttp(413, "Conteúdo grande demais.");
  }
  if (!dados) return {};
  try { return JSON.parse(dados); } catch { throw new ErroHttp(400, "JSON inválido."); }
}

function responder(res, status, corpo) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(corpo === undefined ? "" : JSON.stringify(corpo));
}

async function api(req, res, url) {
  for (const [metodo, padrao, fn] of rotas) {
    if (metodo !== req.method) continue;
    const params = casar(padrao, url.pathname);
    if (!params) continue;
    try {
      const corpo = ["POST", "PATCH"].includes(req.method) ? await lerCorpo(req) : {};
      const r = await fn(params, corpo, url.searchParams);
      if (r === null && req.method !== "DELETE") return responder(res, 404, { erro: "Não encontrado." });
      return responder(res, 200, r && r.command ? { ok: true } : r);
    } catch (e) {
      if (e instanceof ErroHttp) return responder(res, e.status, { erro: e.message });
      if (e.code === "23505") return responder(res, 409, { erro: "Já existe uma empresa com esse nome.", code: e.code });
      if (e.code === "22P02") return responder(res, 404, { erro: "Não encontrado." }); // id que não é uuid
      if (e.code === "23503") return responder(res, 400, { erro: "Empresa não encontrada." });
      console.error(req.method, url.pathname, e);
      return responder(res, 500, { erro: "Falha no servidor." });
    }
  }
  responder(res, 404, { erro: "Rota não encontrada." });
}

/* ---------------- Arquivos estáticos ---------------- */

const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};
const PUBLICOS = new Set(["index.html", "empresas.html", "empresa.html", "tarefas.html", "app.js", "style.css"]);

async function estatico(res, url) {
  const nome = normalize(url.pathname).replace(/^[\\/]+/, "") || "index.html";
  if (!PUBLICOS.has(nome)) { res.writeHead(404); return res.end("Não encontrado"); }
  try {
    const conteudo = await readFile(join(RAIZ, nome));
    res.writeHead(200, {
      "Content-Type": TIPOS[extname(nome)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Robots-Tag": "noindex, nofollow",
    });
    res.end(conteudo);
  } catch {
    res.writeHead(404); res.end("Não encontrado");
  }
}

/* ---------------- Início ---------------- */

await db.query(ESQUEMA);

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/robots.txt") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("User-agent: *\nDisallow: /\n"); }
  if (url.pathname.startsWith("/api/")) return api(req, res, url);
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  estatico(res, url);
}).listen(PORTA, () => console.log("cofre ouvindo na porta " + PORTA));
