-- Cofre de Informações — estrutura do banco.
-- Rode este arquivo inteiro em: Supabase -> projeto kanote -> SQL Editor -> New query -> Run.
-- Pode rodar novamente sem problema: tudo é idempotente.

-- ---------------------------------------------------------------- tabelas

create table if not exists public.empresas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome          text not null check (length(trim(nome)) > 0),
  responsavel   text not null default '',
  compartilhada boolean not null default false,  -- visível para o outro membro
  link_drive    text not null default '',        -- pasta de arquivos no Drive
  link_canva    text not null default '',        -- pasta no Canva
  criado_em     timestamptz not null default now()
);

-- Para bancos criados antes destas colunas existirem:
alter table public.empresas add column if not exists compartilhada boolean not null default false;
alter table public.empresas add column if not exists link_drive text not null default '';
alter table public.empresas add column if not exists link_canva text not null default '';

create table if not exists public.anotacoes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  empresa_id   uuid not null references public.empresas (id) on delete cascade,
  conteudo     text not null check (length(trim(conteudo)) > 0),
  data_criacao timestamptz not null default now()
);

-- Uma empresa não pode repetir nome para o mesmo dono (ignorando maiúsculas).
create unique index if not exists empresas_user_nome_uniq
  on public.empresas (user_id, lower(nome));

create index if not exists anotacoes_empresa_idx on public.anotacoes (empresa_id);
create index if not exists anotacoes_user_data_idx on public.anotacoes (user_id, data_criacao desc);

-- ------------------------------------------------- limite de 2 contas
-- Impede que uma terceira pessoa se cadastre no cofre.

create or replace function public.limite_de_usuarios()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from auth.users) >= 2 then
    raise exception 'Limite de 2 contas atingido neste cofre.';
  end if;
  return new;
end;
$$;

drop trigger if exists limite_usuarios on auth.users;
create trigger limite_usuarios
  before insert on auth.users
  for each row execute function public.limite_de_usuarios();

-- ------------------------------------------------- segurança (RLS)
-- Sem isto, a chave anon daria acesso a tudo. Regra geral: cada pessoa vê as
-- próprias empresas, mais as que a outra marcou como compartilhadas.

alter table public.empresas  enable row level security;
alter table public.anotacoes enable row level security;

drop policy if exists empresas_proprias   on public.empresas;
drop policy if exists empresas_ler        on public.empresas;
drop policy if exists empresas_criar      on public.empresas;
drop policy if exists empresas_atualizar  on public.empresas;
drop policy if exists empresas_excluir    on public.empresas;

-- Ler: as suas e as compartilhadas pelo outro membro.
create policy empresas_ler on public.empresas
  for select using (auth.uid() = user_id or compartilhada);

-- Criar / alterar / excluir empresa: só o dono. Isso inclui ligar e desligar
-- o compartilhamento, que é uma alteração da própria empresa.
create policy empresas_criar on public.empresas
  for insert with check (auth.uid() = user_id);

create policy empresas_atualizar on public.empresas
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy empresas_excluir on public.empresas
  for delete using (auth.uid() = user_id);

drop policy if exists anotacoes_proprias  on public.anotacoes;
drop policy if exists anotacoes_ler       on public.anotacoes;
drop policy if exists anotacoes_criar     on public.anotacoes;
drop policy if exists anotacoes_atualizar on public.anotacoes;
drop policy if exists anotacoes_excluir   on public.anotacoes;

-- Ler anotações de qualquer empresa que você enxerga (sua ou compartilhada).
create policy anotacoes_ler on public.anotacoes
  for select using (
    exists (
      select 1 from public.empresas e
      where e.id = anotacoes.empresa_id
        and (e.user_id = auth.uid() or e.compartilhada)
    )
  );

-- Escrever anotação também vale em empresa compartilhada, sempre como autor.
create policy anotacoes_criar on public.anotacoes
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.empresas e
      where e.id = empresa_id
        and (e.user_id = auth.uid() or e.compartilhada)
    )
  );

-- Alterar ou apagar anotação: só quem escreveu.
create policy anotacoes_atualizar on public.anotacoes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy anotacoes_excluir on public.anotacoes
  for delete using (auth.uid() = user_id);

-- ------------------------------------------------- tarefas de cada empresa
-- Seguem a visibilidade da empresa: quem enxerga a empresa, enxerga as tarefas.

create table if not exists public.empresa_tarefas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  titulo     text not null check (length(trim(titulo)) > 0),
  concluida  boolean not null default false,
  criado_em  timestamptz not null default now()
);

create index if not exists empresa_tarefas_idx
  on public.empresa_tarefas (empresa_id, concluida, criado_em desc);

alter table public.empresa_tarefas enable row level security;

drop policy if exists empresa_tarefas_ler       on public.empresa_tarefas;
drop policy if exists empresa_tarefas_criar     on public.empresa_tarefas;
drop policy if exists empresa_tarefas_atualizar on public.empresa_tarefas;
drop policy if exists empresa_tarefas_excluir   on public.empresa_tarefas;

create policy empresa_tarefas_ler on public.empresa_tarefas
  for select using (
    exists (
      select 1 from public.empresas e
      where e.id = empresa_tarefas.empresa_id
        and (e.user_id = auth.uid() or e.compartilhada)
    )
  );

create policy empresa_tarefas_criar on public.empresa_tarefas
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.empresas e
      where e.id = empresa_id and (e.user_id = auth.uid() or e.compartilhada)
    )
  );

-- Marcar concluída e editar o texto são colaborativos em empresa compartilhada.
create policy empresa_tarefas_atualizar on public.empresa_tarefas
  for update using (
    exists (
      select 1 from public.empresas e
      where e.id = empresa_tarefas.empresa_id
        and (e.user_id = auth.uid() or e.compartilhada)
    )
  ) with check (
    exists (
      select 1 from public.empresas e
      where e.id = empresa_id and (e.user_id = auth.uid() or e.compartilhada)
    )
  );

-- Apagar: quem criou a tarefa, ou o dono da empresa.
create policy empresa_tarefas_excluir on public.empresa_tarefas
  for delete using (
    auth.uid() = user_id
    or exists (
      select 1 from public.empresas e
      where e.id = empresa_tarefas.empresa_id and e.user_id = auth.uid()
    )
  );

-- ------------------------------------------------- tarefas (perfil ADM)
-- Administrador = a primeira conta criada no cofre.

create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and auth.uid() = (select u.id from auth.users u order by u.created_at asc limit 1);
$$;

grant execute on function public.eh_admin() to authenticated;

create table if not exists public.tarefas (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null check (length(trim(titulo)) > 0),
  concluida    boolean not null default false,
  criado_em    timestamptz not null default now(),
  concluida_em timestamptz
);

create index if not exists tarefas_ordem_idx on public.tarefas (concluida, criado_em desc);

alter table public.tarefas enable row level security;

-- Só o administrador enxerga e mexe nas tarefas.
drop policy if exists tarefas_admin on public.tarefas;
create policy tarefas_admin on public.tarefas
  for all using (public.eh_admin()) with check (public.eh_admin());
