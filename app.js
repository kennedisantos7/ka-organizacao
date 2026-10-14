// Módulo compartilhado: camada de dados (API do próprio servidor), lógica de
// busca e utilitários de UI.

/* ---------------- Cabeçalho ---------------- */

// Cabeçalho de navegação, igual em todas as páginas. Marca o item da página atual.
export function montarCabecalho(el) {
  const pagina = (location.pathname.split("/").pop() || "index.html").toLowerCase();

  const itens = [
    { href: "index.html", texto: "Cofre", em: ["", "index.html"] },
    { href: "empresas.html", texto: "Empresas", em: ["empresas.html", "empresa.html"] },
    { href: "tarefas.html", texto: "Tarefas", em: ["tarefas.html"] },
  ];

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
    "</div>";
}

/* ---------------- Dados ---------------- */

// Chama a API do servidor. Erros viram aviso na tela e exceção para quem chamou.
async function chamar(metodo, caminho, corpo, acao) {
  let resp;
  try {
    resp = await fetch("/api" + caminho, {
      method: metodo,
      headers: corpo ? { "Content-Type": "application/json" } : {},
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch (e) {
    toast("Erro ao " + acao + ": falha de conexão");
    throw e;
  }
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const e = new Error(dados.erro || "falha no servidor");
    e.status = resp.status;
    e.code = dados.code;
    if (resp.status !== 404 && e.code !== "23505") toast("Erro ao " + acao + ": " + e.message);
    throw e;
  }
  return dados;
}

export const api = {
  async listarEmpresas() {
    const data = await chamar("GET", "/empresas", null, "carregar empresas");
    // Ordenação com acentos corretos (o banco não conhece a locale pt-BR).
    return data.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  },

  async obterEmpresa(id) {
    try {
      return await chamar("GET", "/empresas/" + encodeURIComponent(id), null, "carregar empresa");
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  },

  // Links fixados da empresa (Drive e Canva).
  async atualizarLinks(id, linkDrive, linkCanva) {
    await chamar("PATCH", "/empresas/" + id, { link_drive: linkDrive || "", link_canva: linkCanva || "" }, "salvar os links");
  },

  /* ---- Tarefas de uma empresa ---- */

  listarTarefasEmpresa(empresaId) {
    return chamar("GET", `/empresas/${empresaId}/tarefas`, null, "carregar tarefas");
  },

  async criarTarefaEmpresa(empresaId, titulo) {
    await chamar("POST", `/empresas/${empresaId}/tarefas`, { titulo }, "criar tarefa");
  },

  async atualizarTarefaEmpresa(id, campos) {
    await chamar("PATCH", "/empresa-tarefas/" + id, campos, "atualizar tarefa");
  },

  async excluirTarefaEmpresa(id) {
    await chamar("DELETE", "/empresa-tarefas/" + id, null, "excluir tarefa");
  },

  /* ---- Empresas ---- */

  async criarEmpresa(nome, responsavel) {
    try {
      return await chamar("POST", "/empresas", { nome, responsavel: responsavel || "" }, "cadastrar empresa");
    } catch (e) {
      if (e.code === "23505") throw new Error("Já existe uma empresa com esse nome.");
      throw e;
    }
  },

  async atualizarEmpresa(id, nome, responsavel) {
    try {
      await chamar("PATCH", "/empresas/" + id, { nome, responsavel: responsavel || "" }, "atualizar empresa");
    } catch (e) {
      if (e.code === "23505") throw new Error("Já existe uma empresa com esse nome.");
      throw e;
    }
  },

  async excluirEmpresa(id) {
    // As anotações e tarefas somem junto (ON DELETE CASCADE no banco).
    await chamar("DELETE", "/empresas/" + id, null, "excluir empresa");
  },

  /* ---- Anotações ---- */

  // Sem empresaId, traz todas as anotações (usado pela busca global).
  async listarAnotacoes(empresaId) {
    const q = empresaId ? "?empresa_id=" + encodeURIComponent(empresaId) : "";
    const data = await chamar("GET", "/anotacoes" + q, null, "carregar anotações");
    return data.map((a) => ({ ...a, data_criacao: new Date(a.data_criacao).getTime() }));
  },

  async contarPorEmpresa() {
    const data = await chamar("GET", "/anotacoes/contagem", null, "contar anotações");
    return Object.fromEntries(data.map((r) => [r.empresa_id, r.total]));
  },

  async criarAnotacao(empresaId, conteudo) {
    await chamar("POST", "/anotacoes", { empresa_id: empresaId, conteudo }, "salvar anotação");
  },

  async excluirAnotacao(id) {
    await chamar("DELETE", "/anotacoes/" + id, null, "excluir anotação");
  },

  /* ---- Tarefas gerais ---- */

  listarTarefas() {
    return chamar("GET", "/tarefas", null, "carregar tarefas");
  },

  async criarTarefa(titulo) {
    await chamar("POST", "/tarefas", { titulo }, "criar tarefa");
  },

  async definirConcluida(id, concluida) {
    await chamar("PATCH", "/tarefas/" + id, { concluida }, "atualizar tarefa");
  },

  async excluirTarefa(id) {
    await chamar("DELETE", "/tarefas/" + id, null, "excluir tarefa");
  },

  async excluirConcluidas() {
    await chamar("DELETE", "/tarefas/concluidas", null, "remover tarefas concluídas");
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
