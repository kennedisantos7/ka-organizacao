# Cofre de Informações — como usar

Sistema para guardar e consultar informações de clientes (senhas, logins, links),
com busca por pergunta em linguagem natural. Os dados ficam no Supabase, então
você acessa do PC, do celular ou de qualquer outro aparelho.

## O que já está pronto

O projeto Supabase **kanote** já está configurado:

- Projeto reativado e no ar (`https://cklbqhsaohideafkymdp.supabase.co`)
- Tabelas `empresas`, `anotacoes`, `empresa_tarefas` e `tarefas` criadas
- **Cofre privado, de uma conta só**: o dono é a primeira conta criada. Qualquer
  outra conta não enxerga nem altera nada, e novos cadastros são recusados pelo banco
- `config.js` preenchido com a URL e a chave pública

## Passar para conta única (feito uma vez)

1. Supabase → projeto kanote → SQL Editor → New query → cole o
   `supabase-schema.sql` inteiro → **Run**. Isso corta o acesso da outra conta
   na hora e desliga todo compartilhamento.
2. Opcional: apagar a outra conta em Authentication → Users → o usuário →
   *Delete user*. Atenção: isso apaga junto as empresas e anotações que **ela**
   cadastrou. Sem apagar, a conta continua existindo, mas não vê nada.
3. Recomendado: Authentication → Providers → Email → desmarcar
   *Allow new users to sign up*. O banco já bloqueia; isso é uma trava a mais.

A tela de login não tem mais o botão *Criar conta*.

## Publicar (necessário para acessar de outros aparelhos)

As páginas usam módulos JavaScript, então **não funcionam com duplo clique**
(`file://`) — precisam ser servidas por HTTP. Duas opções:

**Opção 1 — Netlify Drop (mais rápido, grátis)**
1. Abra <https://app.netlify.com/drop>
2. Arraste a pasta `kaorganização` inteira para a página
3. Pronto: você recebe um endereço tipo `https://algumnome.netlify.app`
4. Abra esse endereço no celular e no PC

**Opção 2 — testar só no seu PC**
```
cd "caminho/para/kaorganização"
npx serve
```
e abra o endereço que aparecer (algo como `http://localhost:3000`).
Isso serve para testar, mas só funciona nesse computador.

## As telas

| Página | Para quê |
|---|---|
| `index.html` | Perguntar em linguagem natural e registrar anotações |
| `empresas.html` | Cadastrar empresas (nome + responsável) |
| `empresa.html` | Painel da empresa: links fixados, tarefas e anotações |
| `tarefas.html` | Lista de tarefas gerais |
| `conta.html` | Trocar a senha da sua conta |

## Painel da empresa

**Links fixados** — dois atalhos sempre à mão no topo: **Drive** (pasta de
arquivos) e **Canva** (pasta). Clique em *Editar links*, cole os endereços e
salve; eles viram botões que abrem em nova guia. Pode colar sem o `https://`.

**Tarefas da empresa** — lista com quadradinho: marcar conclui (o texto fica
riscado), desmarcar reabre. Dá para **adicionar**, **editar** o texto (Enter
salva, Esc cancela) e **excluir**.

Não confunda com `tarefas.html`: aquela é a lista geral, esta é por cliente.

## Trocar a senha

Menu **Conta** → digite a nova senha duas vezes → salvar. A troca é imediata
e não depende de email, o que importa porque o email de recuperação do Supabase
nem sempre chega. Se ainda assim perder o acesso, dá para redefinir pelo painel:
Authentication → Users → o usuário → Reset password.

## Tarefas gerais

Menu **Tarefas**: adicionar, marcar como concluída (a tarefa desce para a lista
de concluídas e fica riscada) e excluir. Desmarcar devolve a tarefa para as
pendentes. O botão **Remover todas**, no topo das concluídas, apaga de uma vez
todas as tarefas já concluídas (pede confirmação).

## Links nas anotações

Endereços digitados na anotação viram links clicáveis, que abrem em **nova guia**.
Funciona com `https://...`, com `www.algo.com/...` e mesmo sem prefixo, quando há
uma barra no caminho (`drive.google.com/file/...`). Vale para Drive, Canva,
painéis, o que for.

Endereços muito longos aparecem encurtados no meio (`https://drive.google…haring`),
mas o destino continua completo — passe o mouse para ver por inteiro. Emails
**não** viram link, para não abrir o programa de email sem querer.

## Trazer os dados antigos

Se você já tinha usado a versão anterior (que salvava só no navegador), abra o
`index.html` **naquele mesmo navegador** e faça login: aparece um aviso no topo
oferecendo importar as empresas e anotações para a nuvem. É uma vez só.

## Segurança — o que está protegido e o que não está

- O acesso exige login por email e senha, e o banco isola os dados por conta.
- A chave que está no `config.js` é pública por design (é a chave *anon*): sozinha
  ela não abre nada, porque as regras de RLS exigem uma sessão válida.
- **Não** coloque nunca a chave `service_role` / `sb_secret_...` nesses arquivos —
  ela ignora todas as regras.
- As anotações ficam **legíveis no banco**. Quem tiver acesso administrativo ao
  projeto Supabase (você, hoje) consegue lê-las. Se quiser que nem isso seja
  possível, o caminho é criptografia com senha-mestra no navegador — dá para
  fazer depois.

## Pendência sua

O token `sbp_...` que você colou no chat dá acesso administrativo à sua conta
Supabase inteira. **Revogue** em <https://supabase.com/dashboard/account/tokens>
e gere outro quando precisar.
