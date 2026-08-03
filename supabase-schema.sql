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
  criado_em     timestamptz not null default now()
);

-- Para bancos criados antes do compartilhamento existir:
alter table public.empresas add column if not exists compartilhada boolean not null default false;

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
