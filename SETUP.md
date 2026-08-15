# Cofre de Informações — como usar

Sistema para guardar e consultar informações de clientes (senhas, logins, links),
com busca por pergunta em linguagem natural. Os dados ficam no Supabase, então
você acessa do PC, do celular ou de qualquer outro aparelho.

## O que já está pronto

O projeto Supabase **kanote** já está configurado:

- Projeto reativado e no ar (`https://cklbqhsaohideafkymdp.supabase.co`)
- Tabelas `empresas` e `anotacoes` criadas
- Segurança por linha (RLS) ligada: cada pessoa só enxerga o que é dela ou o que
  foi compartilhado com ela
- Limite de **2 contas** ativo no banco — a terceira tentativa de cadastro é recusada
- `config.js` preenchido com a URL e a chave pública

Não falta nada no banco. Só falta publicar as páginas e criar as duas contas.

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

## Criar as duas contas

1. Abra o endereço publicado — ele leva para a tela de login
2. Clique em **Criar conta**, informe email e senha (mínimo 6 caracteres)
3. Repita para a segunda pessoa

Se o Supabase pedir confirmação por email, o link chega na caixa de entrada.
Para desligar essa exigência: painel do Supabase → Authentication → Providers →
Email → desmarcar *Confirm email*.

Depois que as duas contas existirem, vale desativar novos cadastros no painel
(Authentication → Providers → Email → *Allow new users to sign up*). O banco já
bloqueia a terceira conta de qualquer forma; isso é só uma trava a mais.

## As três telas

| Página | Para quê |
|---|---|
| `index.html` | Perguntar em linguagem natural e registrar anotações |
| `empresas.html` | Cadastrar empresas (nome + responsável) e compartilhar |
| `empresa.html` | Painel da empresa: links fixados, tarefas e anotações |
| `tarefas.html` | Lista de tarefas gerais — só o perfil ADM |

## Painel da empresa

**Links fixados** — dois atalhos sempre à mão no topo: **Drive** (pasta de
arquivos) e **Canva** (pasta). Clique em *Editar links*, cole os endereços e
salve; eles viram botões que abrem em nova guia. Pode colar sem o `https://`.
Só o dono da empresa edita esses links; o outro membro vê e clica.

**Tarefas da empresa** — lista com quadradinho: marcar conclui (o texto fica
riscado), desmarcar reabre. Dá para **adicionar**, **editar** o texto (Enter
salva, Esc cancela) e **excluir**. Em empresa compartilhada, os dois membros
podem marcar e editar; apagar fica com quem criou a tarefa ou com o dono da
empresa.

Não confunda com `tarefas.html`: aquela é a lista geral do ADM, esta é por cliente.

## Perfil ADM e tarefas

**O administrador é a primeira conta criada no cofre.** Então crie a sua conta
antes da conta da outra pessoa — quem se cadastra primeiro fica com o perfil ADM.

O ADM vê o atalho **Tarefas** no topo da tela inicial. Lá dá para adicionar,
marcar como concluída (a tarefa desce para a lista de concluídas e fica riscada)
e excluir. Desmarcar devolve a tarefa para as pendentes.

Para a outra conta, as tarefas simplesmente não existem: o atalho não aparece e,
mesmo abrindo `tarefas.html` na mão, o banco não devolve nem aceita nada.

## Links nas anotações

Endereços digitados na anotação viram links clicáveis, que abrem em **nova guia**.
Funciona com `https://...`, com `www.algo.com/...` e mesmo sem prefixo, quando há
uma barra no caminho (`drive.google.com/file/...`). Vale para Drive, Canva,
painéis, o que for.

Endereços muito longos aparecem encurtados no meio (`https://drive.google…haring`),
mas o destino continua completo — passe o mouse para ver por inteiro. Emails
**não** viram link, para não abrir o programa de email sem querer.

## Compartilhamento

Cada empresa nasce **privada**: só quem cadastrou enxerga.

- Para liberar: em `empresas.html`, botão **Compartilhar** na linha da empresa
  (ou o botão no topo da sessão dela). A empresa ganha a etiqueta *compartilhada*.
- Para revogar: mesmo botão, agora **Descompartilhar**. O acesso do outro membro
  cai na hora.

Quando uma empresa está compartilhada, o outro membro pode ver as anotações e
escrever novas. Ele **não** pode renomear, excluir a empresa, mexer no
compartilhamento, nem apagar anotações que não escreveu — isso é garantido pelo
banco, não só pela tela.

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
