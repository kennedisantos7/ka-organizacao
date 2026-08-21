// Módulo compartilhado: cliente Supabase, autenticação, camada de dados,
// lógica de busca e utilitários de UI.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const configurado =
  /^https:\/\/.+\.supabase\.co\/?$/.test(SUPABASE_URL || "") && (SUPABASE_ANON_KEY || "").length > 30;

export const sb = configurado ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

/* ---------------- Autenticação ---------------- */

export async function sessaoAtual() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session || null;
}

// Usar no topo de toda página protegida. Redireciona para o login se não houver sessão.
export async function exigirLogin() {
  if (!configurado) {
    document.body.innerHTML =
      '<div class="wrap"><section><h2>Configuração pendente</h2>' +
      '<div class="empty-state">Preencha <strong>config.js</strong> com a URL e a chave anon do seu ' +
      'projeto Supabase. O passo a passo está em <strong>SETUP.md</strong>.</div></section></div>';
    return null;
  }
  const sessao = await sessaoAtual();
  if (!sessao) {
    const destino = location.pathname.split("/").pop() + location.search;
    location.replace("login.html?next=" + encodeURIComponent(destino));
    return null;
  }
  return sessao;
}

export async function sair() {
  await sb.auth.signOut();
  location.replace("login.html");
}

// Cabeçalho de navegação, igual em todas as páginas. Marca o item da página
// atual e mostra "Tarefas" apenas para o perfil ADM.
export async function montarCabecalho(el, sessao) {
  const pagina = (location.pathname.split("/").pop() || "index.html").toLowerCase();

  const itens = [
    { href: "index.html", texto: "Cofre", em: ["", "index.html"] },
    { href: "empresas.html", texto: "Empresas", em: ["empresas.html", "empresa.html"] },
  ];
  if (await api.souAdmin()) itens.push({ href: "tarefas.html", texto: "Tarefas", em: ["tarefas.html"] });
  itens.push({ href: "conta.html", texto: "Conta", em: ["conta.html"] });

  const cadeado =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="4" y="10" width="16" height="11" rx="2"></rect>' +
    '<path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>';

  el.innerHTML =
    '<div class="topnav-inner">' +
      `<a class="marca" href="index.html">${cadeado}<span>Cofre</span></a>` +
      '<nav class="menu">' +
        itens.map((i) =>
          `<a href="${i.href}" class="item${i.em.includes(pagina) ? " ativo" : ""}">${esc(i.texto)}</a>`
        ).join("") +
      "</nav>" +
      '<div class="conta">' +
        `<span class="email" title="${esc(sessao.user.email)}">${esc(sessao.user.email)}</span>` +
        '<button class="ghost" id="sair">Sair</button>' +
      "</div>" +
    "</div>";

  el.querySelector("#sair").addEventListener("click", sair);
}

/* ---------------- Dados ---------------- */

function erro(e, acao) {
  console.error(acao, e);
  toast("Erro ao " + acao + ": " + (e.message || "falha de conexão"));
  throw e;
}

const CAMPOS_EMPRESA = "id, user_id, nome, responsavel, compartilhada, link_drive, link_canva";

export const api = {
  // Traz as empresas do usuário + as que o outro membro compartilhou.
  async listarEmpresas() {
    const { data, error } = await sb.from("empresas").select(CAMPOS_EMPRESA);
    if (error) erro(error, "carregar empresas");
    // Ordenação com acentos corretos (o banco não conhece a locale pt-BR).
    return data.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  },

  async obterEmpresa(id) {
    const { data, error } = await sb.from("empresas").select(CAMPOS_EMPRESA).eq("id", id).maybeSingle();
    if (error) erro(error, "carregar empresa");
    return data;
  },

  // Links fixados da empresa (Drive e Canva). Só o dono consegue alterar.
  async atualizarLinks(id, linkDrive, linkCanva) {
    const { error } = await sb
      .from("empresas")
      .update({ link_drive: linkDrive || "", link_canva: linkCanva || "" })
      .eq("id", id);
    if (error) erro(error, "salvar os links");
  },

  /* ---- Tarefas de uma empresa ---- */

  async listarTarefasEmpresa(empresaId) {
    const { data, error } = await sb
      .from("empresa_tarefas")
      .select("id, user_id, titulo, concluida, criado_em")
      .eq("empresa_id", empresaId)
      .order("concluida")
      .order("criado_em", { ascending: false });
    if (error) erro(error, "carregar tarefas");
    return data;
  },

  async criarTarefaEmpresa(empresaId, titulo) {
    const { error } = await sb.from("empresa_tarefas").insert({ empresa_id: empresaId, titulo });
    if (error) erro(error, "criar tarefa");
  },

  async atualizarTarefaEmpresa(id, campos) {
    const { error } = await sb.from("empresa_tarefas").update(campos).eq("id", id);
    if (error) erro(error, "atualizar tarefa");
  },

  async excluirTarefaEmpresa(id) {
    const { error } = await sb.from("empresa_tarefas").delete().eq("id", id);
    if (error) erro(error, "excluir tarefa");
  },

  // Liga/desliga o compartilhamento com o outro membro (só o dono consegue).
  async definirCompartilhamento(id, valor) {
    const { error } = await sb.from("empresas").update({ compartilhada: valor }).eq("id", id);
    if (error) erro(error, valor ? "compartilhar empresa" : "remover compartilhamento");
  },

  async criarEmpresa(nome, responsavel) {
    const { data, error } = await sb
      .from("empresas")
      .insert({ nome, responsavel: responsavel || "" })
      .select(CAMPOS_EMPRESA)
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Já existe uma empresa com esse nome.");
      erro(error, "cadastrar empresa");
    }
    return data;
  },

  async atualizarEmpresa(id, nome, responsavel) {
    const { error } = await sb.from("empresas").update({ nome, responsavel: responsavel || "" }).eq("id", id);
    if (error) {
      if (error.code === "23505") throw new Error("Já existe uma empresa com esse nome.");
      erro(error, "atualizar empresa");
    }
  },

  async excluirEmpresa(id) {
    // As anotações somem junto (ON DELETE CASCADE no banco).
    const { error } = await sb.from("empresas").delete().eq("id", id);
    if (error) erro(error, "excluir empresa");
  },

  // Sem empresaId, traz todas as anotações do usuário (usado pela busca global).
  async listarAnotacoes(empresaId) {
    let q = sb
      .from("anotacoes")
      .select("id, empresa_id, user_id, conteudo, data_criacao")
      .order("data_criacao", { ascending: false });
    if (empresaId) q = q.eq("empresa_id", empresaId);
    const { data, error } = await q;
    if (error) erro(error, "carregar anotações");
    return data.map((a) => ({ ...a, data_criacao: new Date(a.data_criacao).getTime() }));
  },

  async contarPorEmpresa() {
    const { data, error } = await sb.from("anotacoes").select("empresa_id");
    if (error) erro(error, "contar anotações");
    const mapa = {};
    data.forEach((a) => { mapa[a.empresa_id] = (mapa[a.empresa_id] || 0) + 1; });
    return mapa;
  },

  async criarAnotacao(empresaId, conteudo) {
    const { error } = await sb.from("anotacoes").insert({ empresa_id: empresaId, conteudo });
    if (error) erro(error, "salvar anotação");
  },

  async excluirAnotacao(id) {
    const { error } = await sb.from("anotacoes").delete().eq("id", id);
    if (error) erro(error, "excluir anotação");
  },

  /* ---- Tarefas: exclusivas do perfil ADM (a primeira conta do cofre) ---- */

  async souAdmin() {
    const { data, error } = await sb.rpc("eh_admin");
    if (error) { console.error("eh_admin", error); return false; }
    return data === true;
  },

  async listarTarefas() {
    const { data, error } = await sb
      .from("tarefas")
      .select("id, titulo, concluida, criado_em")
      .order("concluida")
      .order("criado_em", { ascending: false });
    if (error) erro(error, "carregar tarefas");
    return data;
  },

  async criarTarefa(titulo) {
    const { error } = await sb.from("tarefas").insert({ titulo });
    if (error) erro(error, "criar tarefa");
  },

  async definirConcluida(id, concluida) {
    const { error } = await sb
      .from("tarefas")
      .update({ concluida, concluida_em: concluida ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) erro(error, "atualizar tarefa");
  },

  async excluirTarefa(id) {
    const { error } = await sb.from("tarefas").delete().eq("id", id);
    if (error) erro(error, "excluir tarefa");
  },
};

/* ---------------- Texto ---------------- */

const STOPWORDS = ("a o as os um uma uns umas de do da dos das em no na nos nas por para com sem sobre " +
  "qual quais que e ou eu meu minha seu sua ao aos me diga mostra mostre saber preciso " +
  "empresa cliente aqui esta este essa esse isso lembre lembra qualquer tem ter eh sao " +
  "quero onde quando como").split(/\s+/);
const STOP = Object.fromEntries(STOPWORDS.map((w) => [w, true]));

export function norm(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9@._\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function tokens(s) {
  return norm(s).split(" ").filter((t) => t.length > 1);
}
function keywords(s) {
  return tokens(s).filter((t) => !STOP[t]);
}
export function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
// Endereços dentro do texto: "https://...", "www...." ou "drive.google.com/...".
const RE_URL = /((?:https?:\/\/|www\.)[^\s<>"']+|[a-z0-9-]+(?:\.[a-z0-9-]+)+\/[^\s<>"']*)/gi;

// Encurta o meio de endereços longos (links do Drive são enormes) sem perder o destino.
function textoDoLink(url, max = 58) {
  if (url.length <= max) return url;
  return url.slice(0, max - 14) + "…" + url.slice(-13);
}

// Escapa o conteúdo e converte endereços em links que abrem em nova guia.
export function conteudoComLinks(texto) {
  const original = String(texto);
  let out = "";
  let fim = 0;

  for (const m of original.matchAll(RE_URL)) {
    let url = m[0];

    // Pontuação final costuma ser da frase, não do endereço.
    const cauda = url.match(/[.,;:!?]+$/);
    if (cauda) url = url.slice(0, -cauda[0].length);
    // Fecha-parênteses só conta se houver um abre correspondente dentro do endereço.
    while (url.endsWith(")") && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length) {
      url = url.slice(0, -1);
    }
    if (!url) continue;

    const href = /^https?:\/\//i.test(url) ? url : "https://" + url;
    out += esc(original.slice(fim, m.index));
    out +=
      `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="${esc(url)}">` +
      `${esc(textoDoLink(url))}<span class="ext">↗</span></a>`;
    fim = m.index + url.length;
  }

  out += esc(original.slice(fim));
  return out;
}

// Aceita o endereço colado de qualquer jeito e devolve algo clicável.
export function normalizarUrl(valor) {
  const v = String(valor || "").trim();
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : "https://" + v.replace(/^\/+/, "");
}

export function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/* ---------------- Busca ---------------- */

// Passo 1: identificar a empresa citada na pergunta.
export function detectarEmpresa(pergunta, empresas) {
  const q = " " + norm(pergunta) + " ";
  let melhor = null;

  // Nome citado literalmente; vence o nome mais longo (mais específico).
  empresas.forEach((e) => {
    const n = norm(e.nome);
    if (!n) return;
    if (q.includes(" " + n + " ") && (!melhor || n.length > norm(melhor.nome).length)) melhor = e;
  });
  if (melhor) return melhor;

  // Fallback: nome citado parcialmente ("Julia" -> "Julia Panza Doces").
  const qt = tokens(pergunta);
  const candidatos = [];
  empresas.forEach((e) => {
    const nt = tokens(e.nome).filter((t) => !STOP[t]);
    if (!nt.length) return;
    const hits = nt.filter((t) => qt.includes(t)).length;
    if (hits) candidatos.push({ empresa: e, hits, prop: hits / nt.length });
  });
  if (!candidatos.length) return null;

  candidatos.sort((a, b) => b.hits - a.hits || b.prop - a.prop);
  // Só aceita quando não há empate: com duas "Julia" cadastradas, é melhor
  // avisar que não deu para identificar do que devolver a senha da errada.
  if (candidatos.length === 1 || candidatos[0].hits > candidatos[1].hits) return candidatos[0].empresa;
  return null;
}

// Passos 2 e 3: pontuar as anotações pelas palavras-chave da pergunta.
function pontuar(anotacao, termos) {
  const conteudo = norm(anotacao.conteudo);
  const rotulo = norm(anotacao.conteudo.split(/[:=\-–]/)[0]); // trecho antes do ":" pesa mais
  let score = 0;
  const achados = [];
  termos.forEach((t) => {
    const raiz = t.length > 4 ? t.slice(0, Math.max(4, t.length - 2)) : t;
    const re = new RegExp("(^|[^a-z0-9])" + raiz.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (re.test(conteudo)) {
      score += 1;
      achados.push(t);
      if (re.test(rotulo)) score += 1.5;
    }
  });
  return { score, achados };
}

// empresas: lista completa; anotacoes: todas as anotações do usuário.
export function buscar(pergunta, empresas, anotacoes) {
  const empresa = detectarEmpresa(pergunta, empresas);
  const universo = empresa ? anotacoes.filter((a) => a.empresa_id === empresa.id) : anotacoes.slice();
  if (!universo.length) return { empresa, resultados: [], motivo: empresa ? "sem-anotacoes" : "vazio" };

  const nomeTokens = empresa ? tokens(empresa.nome) : [];
  const termos = keywords(pergunta).filter((t) => !nomeTokens.includes(t));
  if (!termos.length) {
    // Pergunta só cita a empresa: devolve as anotações mais recentes.
    return {
      empresa,
      resultados: universo.slice(0, 3).map((a) => ({ anotacao: a, score: 0 })),
      motivo: "sem-termos",
    };
  }

  const ranked = universo
    .map((a) => ({ anotacao: a, ...pontuar(a, termos) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.anotacao.data_criacao - a.anotacao.data_criacao);

  return { empresa, resultados: ranked.slice(0, 4), motivo: ranked.length ? "ok" : "sem-match" };
}

/* ---------------- UI ---------------- */

let toastTimer;
export function toast(msg) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

export function copiar(texto) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texto).then(
      () => toast("Copiado."),
      () => toast("Não foi possível copiar.")
    );
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = texto;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); toast("Copiado."); } catch { toast("Não foi possível copiar."); }
  document.body.removeChild(ta);
}

export function linkEmpresa(id, texto) {
  return `<a href="empresa.html?id=${encodeURIComponent(id)}">${esc(texto)}</a>`;
}

/* ---------------- Migração do localStorage ---------------- */

// Dados antigos deste navegador (versão sem nuvem), se ainda não importados.
export function dadosLocaisPendentes() {
  try {
    if (localStorage.getItem("cofre.v1.importado")) return null;
    const d = JSON.parse(localStorage.getItem("cofre.v1") || "null");
    if (!d || !Array.isArray(d.empresas) || !d.empresas.length) return null;
    return d;
  } catch {
    return null;
  }
}

export async function importarDadosLocais(d) {
  let empresas = 0, anotacoes = 0;
  const existentes = await api.listarEmpresas();
  const porNome = new Map(existentes.map((e) => [norm(e.nome), e.id]));

  for (const emp of d.empresas) {
    let novoId = porNome.get(norm(emp.nome));
    if (!novoId) {
      const criada = await api.criarEmpresa(emp.nome, emp.responsavel || "");
      novoId = criada.id;
      porNome.set(norm(emp.nome), novoId);
      empresas++;
    }
    const notas = (d.anotacoes || []).filter((a) => a.empresa_id === emp.id);
    if (notas.length) {
      const { error } = await sb.from("anotacoes").insert(
        notas.map((a) => ({
          empresa_id: novoId,
          conteudo: a.conteudo,
          data_criacao: new Date(a.data_criacao).toISOString(),
        }))
      );
      if (error) erro(error, "importar anotações");
      anotacoes += notas.length;
    }
  }
  localStorage.setItem("cofre.v1.importado", new Date().toISOString());
  return { empresas, anotacoes };
}
