-- Desafio da Água: rode este arquivo inteiro no SQL Editor do Supabase.
--
-- JÁ RODOU UMA VERSÃO ANTERIOR (setup.sql sem grupos, convite.sql)?
-- Então rode ANTES o bloco abaixo, tirando o "-- " do começo de cada linha.
-- ATENÇÃO: isso apaga os registros que já existirem.
--
-- drop trigger if exists check_invite_before_signup on auth.users;
-- drop function if exists public.check_invite();
-- drop table if exists public.app_settings, public.logs, public.members, public.groups, public.profiles cascade;
-- drop trigger if exists on_auth_user_created on auth.users;
-- drop function if exists public.handle_new_user();

-- ========== 1) Tabelas ==========
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  goal_ml int not null default 2000 check (goal_ml between 500 and 10000)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index members_user_idx on public.members(user_id);

create table public.logs (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  day date not null,
  ml int not null check (ml between 1 and 5000),
  photo_path text,
  created_at timestamptz not null default now()
);
create index logs_group_day_idx on public.logs(group_id, day);

-- ========== 2) Perfil criado automaticamente no cadastro ==========
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(nullif(left(new.raw_user_meta_data->>'name', 30), ''), split_part(new.email, '@', 1))
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ========== 3) Funções auxiliares das regras de segurança ==========
create or replace function public.is_member(gid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.members where group_id = gid and user_id = auth.uid())
$$;

create or replace function public.shares_group(uid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.members a join public.members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = uid
  )
$$;

-- ========== 4) Criar grupo, entrar com código, gerar novo código ==========
create or replace function public.create_group(gname text) returns public.groups
language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'nao_logado'; end if;
  if char_length(trim(coalesce(gname, ''))) not between 1 and 40 then raise exception 'nome_invalido'; end if;
  insert into public.groups (name, owner_id) values (trim(gname), auth.uid()) returning * into g;
  insert into public.members (group_id, user_id) values (g.id, auth.uid());
  return g;
end $$;

create or replace function public.join_group(code text) returns public.groups
language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'nao_logado'; end if;
  select * into g from public.groups where invite_code = lower(trim(coalesce(code, '')));
  if not found then raise exception 'convite_invalido'; end if;
  insert into public.members (group_id, user_id) values (g.id, auth.uid()) on conflict do nothing;
  return g;
end $$;

create or replace function public.regenerate_invite(gid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not exists (select 1 from public.groups where id = gid and owner_id = auth.uid()) then
    raise exception 'sem_permissao';
  end if;
  update public.groups
     set invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)
   where id = gid returning invite_code into c;
  return c;
end $$;

revoke execute on function public.create_group(text), public.join_group(text), public.regenerate_invite(uuid),
  public.is_member(uuid), public.shares_group(uuid) from public, anon;
grant execute on function public.create_group(text), public.join_group(text), public.regenerate_invite(uuid),
  public.is_member(uuid), public.shares_group(uuid) to authenticated;

-- ========== 5) Segurança (RLS): cada um só vê os grupos de que participa ==========
alter table public.profiles enable row level security;
alter table public.groups  enable row level security;
alter table public.members enable row level security;
alter table public.logs    enable row level security;

drop policy if exists "ver perfis do grupo" on public.profiles;
create policy "ver perfis do grupo" on public.profiles
  for select to authenticated using (id = auth.uid() or public.shares_group(id));
drop policy if exists "editar proprio perfil" on public.profiles;
create policy "editar proprio perfil" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "ver meus grupos" on public.groups;
create policy "ver meus grupos" on public.groups
  for select to authenticated using (public.is_member(id));

drop policy if exists "ver membros do grupo" on public.members;
create policy "ver membros do grupo" on public.members
  for select to authenticated using (public.is_member(group_id));
drop policy if exists "sair do grupo" on public.members;
create policy "sair do grupo" on public.members
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "ver registros do grupo" on public.logs;
create policy "ver registros do grupo" on public.logs
  for select to authenticated using (public.is_member(group_id));
drop policy if exists "inserir proprio registro" on public.logs;
create policy "inserir proprio registro" on public.logs
  for insert to authenticated with check (user_id = auth.uid() and public.is_member(group_id));
drop policy if exists "apagar proprio registro" on public.logs;
create policy "apagar proprio registro" on public.logs
  for delete to authenticated using (user_id = auth.uid());

-- ========== 6) Fotos de prova (leitura pública por link; só o dono grava na própria pasta) ==========
insert into storage.buckets (id, name, public)
values ('proofs', 'proofs', true)
on conflict (id) do nothing;

drop policy if exists "enviar foto na propria pasta" on storage.objects;
create policy "enviar foto na propria pasta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "apagar propria foto" on storage.objects;
create policy "apagar propria foto" on storage.objects
  for delete to authenticated
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);

-- ========== 7) Placar em tempo real ==========
do $$ begin
  alter publication supabase_realtime add table public.logs;
exception when duplicate_object then null;
end $$;

-- ========== 8) Ranking da semana/mês e streak ==========
create or replace function public.group_totals(gid uuid, since date)
returns table (user_id uuid, day date, ml int)
language sql stable security invoker set search_path = public as $$
  select l.user_id, l.day, sum(l.ml)::int
    from public.logs l
   where l.group_id = gid and l.day >= since
   group by l.user_id, l.day
$$;
revoke execute on function public.group_totals(uuid, date) from public, anon;
grant execute on function public.group_totals(uuid, date) to authenticated;