# Cofre de Informações — como funciona

Sistema para guardar e consultar informações de clientes (senhas, logins, links),
com busca por pergunta em linguagem natural, e listas de tarefas.

## Arquitetura

- `server.mjs` — servidor Node que entrega as páginas e uma API JSON em `/api/...`
- Banco **Postgres na Coolify** (sem Supabase). As tabelas são criadas sozinhas
  quando o servidor sobe.
- Hospedagem: Coolify, projeto **KA Organizacao**, app `ka-organizacao-site`
  (Dockerfile, porta 3000). Cada push na `main` + redeploy publica a versão nova.

**Não há login.** Quem tiver o endereço do site vê e altera tudo — inclusive as
senhas guardadas. O site pede aos buscadores para não indexá-lo, mas isso não
protege nada. Não divulgue o endereço.

## Variáveis de ambiente (Coolify)

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Conexão com o Postgres da Coolify (obrigatória) |
| `MIGRAR_SUPABASE_TOKEN` | Opcional. Token de acesso do Supabase (`sbp_...`): na subida, se o banco novo estiver **vazio**, copia empresas, anotações e tarefas (mantendo os ids). Depois da cópia, apague a variável. |

## Rodar no seu PC

```
npm install
DATABASE_URL=postgres://usuario:senha@localhost:5432/cofre node server.mjs
```
e abra `http://localhost:3000`.

## As telas

| Página | Para quê |
|---|---|
| `index.html` | Perguntar em linguagem natural e registrar anotações |
| `empresas.html` | Cadastrar empresas (nome + responsável) |
| `empresa.html` | Painel da empresa: links fixados, tarefas e anotações |
| `tarefas.html` | Lista de tarefas gerais |

## Painel da empresa

**Links fixados** — dois atalhos sempre à mão no topo: **Drive** (pasta de
arquivos) e **Canva** (pasta). Clique em *Editar links*, cole os endereços e
salve; eles viram botões que abrem em nova guia. Pode colar sem o `https://`.

**Tarefas da empresa** — lista com quadradinho: marcar conclui (o texto fica
riscado), desmarcar reabre. Dá para **adicionar**, **editar** o texto (Enter
salva, Esc cancela) e **excluir**.

Não confunda com `tarefas.html`: aquela é a lista geral, esta é por cliente.

## Tarefas gerais

Menu **Tarefas**: adicionar, marcar como concluída (a tarefa desce para a lista
de concluídas e fica riscada) e excluir. Desmarcar devolve a tarefa para as
pendentes. O botão **Remover todas**, no topo das concluídas, apaga de uma vez
todas as tarefas já concluídas (pede confirmação).

## Links nas anotações

Endereços digitados na anotação viram links clicáveis, que abrem em **nova guia**.
Funciona com `https://...`, com `www.algo.com/...` e mesmo sem prefixo, quando há
uma barra no caminho (`drive.google.com/file/...`).

Endereços muito longos aparecem encurtados no meio (`https://drive.google…haring`),
mas o destino continua completo — passe o mouse para ver por inteiro. Emails
**não** viram link, para não abrir o programa de email sem querer.
