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

-- ========== 9) Reações nas fotos e moderação do dono ==========
-- ========== Funções auxiliares ==========
create or replace function public.log_in_my_group(lid bigint) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.logs l join public.members m on m.group_id = l.group_id
     where l.id = lid and m.user_id = auth.uid()
  )
$$;

create or replace function public.is_owner(gid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.groups where id = gid and owner_id = auth.uid())
$$;

-- a foto pertence a um registro de um grupo do qual eu sou dono?
create or replace function public.can_mod_photo(path text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.logs l join public.groups g on g.id = l.group_id
     where l.photo_path = path and g.owner_id = auth.uid()
  )
$$;

-- ========== Reações ==========
create table if not exists public.reactions (
  log_id bigint not null references public.logs(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👏', '💦', '🔥', '😂')),
  created_at timestamptz not null default now(),
  primary key (log_id, user_id, emoji)
);
create index if not exists reactions_log_idx on public.reactions(log_id);
alter table public.reactions enable row level security;

drop policy if exists "ver reacoes do grupo" on public.reactions;
create policy "ver reacoes do grupo" on public.reactions
  for select to authenticated using (public.log_in_my_group(log_id));
drop policy if exists "reagir" on public.reactions;
create policy "reagir" on public.reactions
  for insert to authenticated with check (user_id = auth.uid() and public.log_in_my_group(log_id));
drop policy if exists "tirar propria reacao" on public.reactions;
create policy "tirar propria reacao" on public.reactions
  for delete to authenticated using (user_id = auth.uid());

-- ========== Moderação ==========
-- Apagar registro: o próprio, ou qualquer um do grupo se você for o dono
drop policy if exists "apagar proprio registro" on public.logs;
drop policy if exists "apagar registro" on public.logs;
create policy "apagar registro" on public.logs
  for delete to authenticated using (user_id = auth.uid() or public.is_owner(group_id));

-- O dono pode apagar a foto de um registro do grupo (antes de apagar o registro)
drop policy if exists "dono do grupo apaga foto" on storage.objects;
create policy "dono do grupo apaga foto" on storage.objects
  for delete to authenticated
  using (bucket_id = 'proofs' and public.can_mod_photo(name));

-- Remover um membro: apaga os registros e as reações dele no grupo e tira do grupo.
-- (O app apaga as fotos antes de chamar esta função.)
create or replace function public.remove_member(gid uuid, uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.groups where id = gid and owner_id = auth.uid()) then
    raise exception 'sem_permissao';
  end if;
  if uid = auth.uid() then raise exception 'use_sair_do_grupo'; end if;
  delete from public.reactions r using public.logs l
   where r.log_id = l.id and l.group_id = gid and r.user_id = uid;
  delete from public.logs where group_id = gid and user_id = uid;
  delete from public.members where group_id = gid and user_id = uid;
end $$;

revoke execute on function public.log_in_my_group(bigint), public.is_owner(uuid), public.can_mod_photo(text),
  public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.log_in_my_group(bigint), public.is_owner(uuid), public.can_mod_photo(text),
  public.remove_member(uuid, uuid) to authenticated;

-- ========== 10) Histórico e conquistas do Perfil ==========
create or replace function public.my_daily_totals()
returns table (day date, ml int, photos int)
language sql stable security invoker set search_path = public as $$
  select l.day, sum(l.ml)::int, count(l.photo_path)::int
    from public.logs l
   where l.user_id = auth.uid()
   group by l.day
$$;

revoke execute on function public.my_daily_totals() from public, anon;
grant execute on function public.my_daily_totals() to authenticated;

-- ========== 11) Notificações (e-mail e lembretes) ==========
-- ========== Preferências no perfil ==========
alter table public.profiles
  add column if not exists email_freq text not null default 'none'
    check (email_freq in ('none', 'weekly', 'monthly', 'both')),
  add column if not exists reminder_every int not null default 0
    check (reminder_every in (0, 2, 3)),
  add column if not exists test_email_at timestamptz;

-- ========== Inscrições de notificação (um registro por aparelho) ==========
create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;

drop policy if exists "ver proprias inscricoes" on public.push_subscriptions;
create policy "ver proprias inscricoes" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "apagar proprias inscricoes" on public.push_subscriptions;
create policy "apagar proprias inscricoes" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- Salvar a inscrição deste aparelho. Se o aparelho já estava ligado a outra conta, passa para a conta atual.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'nao_logado'; end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then raise exception 'inscricao_invalida'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end $$;

revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- ========== Segredo do agendamento ==========
-- Um código aleatório guardado no cofre (Vault) do Supabase. O agendamento manda esse código
-- para a função de envio, e a função confere aqui. Ninguém precisa copiar nada.
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'notify_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'notify_cron_secret');
  end if;
end $$;

create or replace function public.check_cron_secret(s text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'notify_cron_secret' and decrypted_secret = s)
$$;
revoke execute on function public.check_cron_secret(text) from public, anon, authenticated;
grant execute on function public.check_cron_secret(text) to service_role;

-- ========== 12) Registro (log) dos envios ==========
create table if not exists public.notify_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null,          -- weekly, monthly, reminder, test-email, test-push, auth...
  status text not null,        -- info, ok, erro
  detail text,
  user_id uuid
);
create index if not exists notify_log_created_idx on public.notify_log(created_at desc);
alter table public.notify_log enable row level security;

-- ========== 13) Avatar no perfil ==========
-- ========== Campos no perfil ==========
alter table public.profiles
  add column if not exists avatar_emoji text,
  add column if not exists avatar_color text,
  add column if not exists avatar_path text;

alter table public.profiles drop constraint if exists profiles_avatar_emoji_ck;
alter table public.profiles add constraint profiles_avatar_emoji_ck
  check (avatar_emoji is null or char_length(avatar_emoji) between 1 and 8);
alter table public.profiles drop constraint if exists profiles_avatar_color_ck;
alter table public.profiles add constraint profiles_avatar_color_ck
  check (avatar_color is null or avatar_color ~ '^#[0-9a-f]{6}$');
-- a foto precisa estar na pasta da própria pessoa
alter table public.profiles drop constraint if exists profiles_avatar_path_ck;
alter table public.profiles add constraint profiles_avatar_path_ck
  check (avatar_path is null or avatar_path like id::text || '/%');

-- ========== Fotos de perfil (privadas: só quem está num grupo com a pessoa vê) ==========
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 524288, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 524288, allowed_mime_types = array['image/jpeg'];

drop policy if exists "enviar avatar na propria pasta" on storage.objects;
create policy "enviar avatar na propria pasta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "apagar proprio avatar" on storage.objects;
create policy "apagar proprio avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "ver avatares do grupo" on storage.objects;
create policy "ver avatares do grupo" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or case
           when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then public.shares_group(((storage.foldername(name))[1])::uuid)
           else false
         end
    )
  );