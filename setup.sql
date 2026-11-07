-- =====================================================================
--  Desafio da Água: banco de dados completo (Supabase)
-- =====================================================================
--  Para que serve: criar o banco do zero num projeto Supabase novo, com
--  tudo o que o app usa hoje. Junta todas as migrações antigas num lugar.
--
--  Como usar: SQL Editor → aba nova → cole este arquivo inteiro → Run.
--  Depois, rode o agendar-envios.sql (e-mails e lembretes automáticos).
--
--  É seguro rodar de novo: nada aqui apaga dados. Num banco que já existe,
--  ele só recria funções e regras de acesso na versão atual.
--
--  Partes:
--    1. Tabelas            5. Permissões das funções
--    2. Funções auxiliares 6. Regras de acesso (RLS)
--    3. Gatilhos           7. Armazenamento de fotos
--    4. Funções do app     8. Tempo real e segredo do agendamento
-- =====================================================================


-- =====================================================================
-- 1. TABELAS
-- =====================================================================

-- Perfil de cada pessoa (criado sozinho no cadastro, ver parte 3)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  goal_ml int not null default 2000 check (goal_ml between 500 and 10000),       -- meta diária pessoal
  email_freq text not null default 'none'
    check (email_freq in ('none', 'weekly', 'monthly', 'both')),                 -- resumo por e-mail
  reminder_every int not null default 0 check (reminder_every in (0, 2, 3)),     -- lembretes: 0 = desligado
  test_email_at timestamptz,                                                      -- último teste de e-mail
  avatar_emoji text check (avatar_emoji is null or char_length(avatar_emoji) between 1 and 8),
  avatar_color text check (avatar_color is null or avatar_color ~ '^#[0-9a-f]{6}$'),
  avatar_path text,                                                               -- foto de perfil (bucket avatars)
  bottles jsonb not null default '[{"name": "Garrafinha", "ml": 500}]'::jsonb,    -- garrafinhas (até 6)
  constraint profiles_avatar_path_ck check (avatar_path is null or avatar_path like id::text || '/%'),
  constraint profiles_bottles_ck check (jsonb_typeof(bottles) = 'array'
    and jsonb_array_length(bottles) between 1 and 6 and pg_column_size(bottles) < 2000)
);

-- Grupos e suas regras
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  require_photo boolean not null default false,                                  -- foto obrigatória em todo registro
  goal_ml int check (goal_ml is null or goal_ml between 500 and 10000)          -- vazio = cada um usa a própria meta
);

-- Quem está em qual grupo
create table if not exists public.members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists members_user_idx on public.members(user_id);

-- Cada registro de água
create table if not exists public.logs (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  day date not null,
  ml int not null check (ml between 1 and 5000),
  photo_path text,                                                                -- foto de prova (bucket proofs)
  created_at timestamptz not null default now(),
  constraint logs_foto_propria check (photo_path is null or photo_path like user_id::text || '/%')
);
create index if not exists logs_group_day_idx on public.logs(group_id, day);

-- Reações nas fotos de prova
create table if not exists public.reactions (
  log_id bigint not null references public.logs(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👏', '💦', '🔥', '😂')),
  created_at timestamptz not null default now(),
  primary key (log_id, user_id, emoji)
);
create index if not exists reactions_log_idx on public.reactions(log_id);

-- Aparelhos inscritos para receber lembretes (um por aparelho)
create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

-- Registro (log) dos envios de e-mail e lembretes, para depurar.
-- Sem nenhuma regra de acesso: o app não lê nem escreve. Só a função "notify" e o SQL Editor.
create table if not exists public.notify_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null,
  status text not null,
  detail text,
  user_id uuid
);
create index if not exists notify_log_created_idx on public.notify_log(created_at desc);


-- =====================================================================
-- 2. FUNÇÕES AUXILIARES (usadas pelas regras de acesso)
-- =====================================================================

-- Eu sou membro deste grupo?
create or replace function public.is_member(gid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.members where group_id = gid and user_id = auth.uid())
$$;

-- Eu estou em algum grupo junto com esta pessoa?
create or replace function public.shares_group(uid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.members a join public.members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = uid
  )
$$;

-- Eu estou em algum grupo? (evita contas-robô enviando fotos)
create or replace function public.in_any_group() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.members where user_id = auth.uid())
$$;

-- Eu sou o dono deste grupo?
create or replace function public.is_owner(gid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.groups where id = gid and owner_id = auth.uid())
$$;

-- Este registro é de um grupo meu?
create or replace function public.log_in_my_group(lid bigint) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.logs l join public.members m on m.group_id = l.group_id
     where l.id = lid and m.user_id = auth.uid()
  )
$$;

-- Esta foto de prova é de um grupo do qual eu sou dono?
create or replace function public.can_mod_photo(path text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.logs l join public.groups g on g.id = l.group_id
     where l.photo_path = path and g.owner_id = auth.uid()
  )
$$;

-- Uma pasta do armazenamento (o id da pessoa) é de alguém que está num grupo comigo?
create or replace function public.folder_shares_group(folder text) returns boolean
language sql security definer stable set search_path = public as $$
  select case
    when folder ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.shares_group(folder::uuid)
    else false
  end
$$;


-- =====================================================================
-- 3. GATILHOS
-- =====================================================================

-- Cria o perfil quando alguém se cadastra
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

-- Registro válido: data entre ontem e amanhã e no máximo 6000 ml por pessoa por dia
-- (beber água demais faz mal). Para mudar o limite, troque o 6000 e rode de novo.
create or replace function public.check_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare total int;
begin
  if new.day < current_date - 1 or new.day > current_date + 1 then
    raise exception 'dia_invalido';
  end if;
  select coalesce(sum(ml), 0) into total from public.logs
   where user_id = new.user_id and day = new.day;
  if total + new.ml > 6000 then
    raise exception 'limite_diario';
  end if;
  return new;
end $$;

drop trigger if exists check_log_before_insert on public.logs;
create trigger check_log_before_insert
before insert on public.logs
for each row execute function public.check_log();

-- Foto obrigatória: recusa registro sem foto quando o grupo exige
create or replace function public.check_group_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.photo_path is null
     and exists (select 1 from public.groups where id = new.group_id and require_photo) then
    raise exception 'foto_obrigatoria';
  end if;
  return new;
end $$;

drop trigger if exists check_group_rules_before_insert on public.logs;
create trigger check_group_rules_before_insert
before insert on public.logs
for each row execute function public.check_group_rules();


-- =====================================================================
-- 4. FUNÇÕES DO APP
-- =====================================================================

-- ----- Grupos -----
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
  if not public.is_owner(gid) then raise exception 'sem_permissao'; end if;
  update public.groups
     set invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)
   where id = gid returning invite_code into c;
  return c;
end $$;

-- Regras do grupo (só o dono)
create or replace function public.set_group_rules(gid uuid, p_require_photo boolean, p_goal_ml int)
returns public.groups
language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if not public.is_owner(gid) then raise exception 'sem_permissao'; end if;
  if p_goal_ml is not null and (p_goal_ml < 500 or p_goal_ml > 10000) then raise exception 'meta_invalida'; end if;
  update public.groups set require_photo = coalesce(p_require_photo, false), goal_ml = p_goal_ml
   where id = gid returning * into g;
  return g;
end $$;

-- Sair do grupo: apaga os registros da pessoa no grupo e devolve os caminhos das fotos
-- (o app apaga os arquivos). Se for o dono, a posse passa ao membro mais antigo;
-- se não houver mais ninguém, o grupo é excluído.
create or replace function public.leave_group(gid uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare nxt uuid; paths text[];
begin
  if auth.uid() is null then raise exception 'nao_logado'; end if;
  if not public.is_member(gid) then raise exception 'nao_e_membro'; end if;
  with d as (
    delete from public.logs where group_id = gid and user_id = auth.uid() returning photo_path
  )
  select array_agg(photo_path) filter (where photo_path is not null) into paths from d;
  if public.is_owner(gid) then
    select user_id into nxt from public.members
     where group_id = gid and user_id <> auth.uid()
     order by joined_at, user_id limit 1;
    if nxt is null then
      delete from public.groups where id = gid;
      return paths;
    end if;
    update public.groups set owner_id = nxt where id = gid;
  end if;
  delete from public.members where group_id = gid and user_id = auth.uid();
  return paths;
end $$;

-- Remover um membro (só o dono): apaga registros e reações dele no grupo.
-- O app apaga as fotos antes de chamar esta função.
create or replace function public.remove_member(gid uuid, uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner(gid) then raise exception 'sem_permissao'; end if;
  if uid = auth.uid() then raise exception 'use_sair_do_grupo'; end if;
  delete from public.reactions r using public.logs l
   where r.log_id = l.id and l.group_id = gid and r.user_id = uid;
  delete from public.logs where group_id = gid and user_id = uid;
  delete from public.members where group_id = gid and user_id = uid;
end $$;

-- ----- Conta -----
-- Excluir a conta: passa os grupos de que a pessoa é dona para o membro mais antigo
-- e apaga a conta com todos os dados. O app apaga as fotos antes de chamar.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare g record; nxt uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'nao_logado'; end if;
  for g in select id from public.groups where owner_id = uid loop
    select user_id into nxt from public.members
     where group_id = g.id and user_id <> uid
     order by joined_at, user_id limit 1;
    if nxt is null then
      delete from public.groups where id = g.id;
    else
      update public.groups set owner_id = nxt where id = g.id;
    end if;
  end loop;
  delete from auth.users where id = uid;
end $$;

-- ----- Placar, histórico -----
-- Soma por pessoa e dia de um grupo (as regras de acesso valem: só membros veem)
create or replace function public.group_totals(gid uuid, since date)
returns table (user_id uuid, day date, ml int)
language sql stable security invoker set search_path = public as $$
  select l.user_id, l.day, sum(l.ml)::int
    from public.logs l
   where l.group_id = gid and l.day >= since
   group by l.user_id, l.day
$$;

-- Meu total por dia, somando todos os meus grupos (histórico do Perfil)
create or replace function public.my_daily_totals()
returns table (day date, ml int, photos int)
language sql stable security invoker set search_path = public as $$
  select l.day, sum(l.ml)::int, count(l.photo_path)::int
    from public.logs l
   where l.user_id = auth.uid()
   group by l.day
$$;

-- ----- Lembretes -----
-- Salva a inscrição deste aparelho; se ele era de outra conta, passa para a atual
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


-- =====================================================================
-- 5. PERMISSÕES DAS FUNÇÕES (ninguém sem login chama nada)
-- =====================================================================
revoke execute on function
  public.is_member(uuid), public.shares_group(uuid), public.in_any_group(), public.is_owner(uuid),
  public.log_in_my_group(bigint), public.can_mod_photo(text), public.folder_shares_group(text),
  public.create_group(text), public.join_group(text), public.regenerate_invite(uuid),
  public.set_group_rules(uuid, boolean, int), public.leave_group(uuid), public.remove_member(uuid, uuid),
  public.delete_my_account(), public.group_totals(uuid, date), public.my_daily_totals(),
  public.save_push_subscription(text, text, text)
  from public, anon;

grant execute on function
  public.is_member(uuid), public.shares_group(uuid), public.in_any_group(), public.is_owner(uuid),
  public.log_in_my_group(bigint), public.can_mod_photo(text), public.folder_shares_group(text),
  public.create_group(text), public.join_group(text), public.regenerate_invite(uuid),
  public.set_group_rules(uuid, boolean, int), public.leave_group(uuid), public.remove_member(uuid, uuid),
  public.delete_my_account(), public.group_totals(uuid, date), public.my_daily_totals(),
  public.save_push_subscription(text, text, text)
  to authenticated;

-- funções internas dos gatilhos: ninguém chama direto
revoke execute on function public.handle_new_user(), public.check_log(), public.check_group_rules()
  from public, anon, authenticated;


-- =====================================================================
-- 6. REGRAS DE ACESSO (RLS): cada um só vê os grupos de que participa
-- =====================================================================
alter table public.profiles           enable row level security;
alter table public.groups             enable row level security;
alter table public.members            enable row level security;
alter table public.logs               enable row level security;
alter table public.reactions          enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notify_log         enable row level security;  -- sem regras de propósito

-- Perfis: vejo o meu e o de quem está num grupo comigo; só edito o meu
drop policy if exists "ver perfis do grupo" on public.profiles;
create policy "ver perfis do grupo" on public.profiles
  for select to authenticated using (id = auth.uid() or public.shares_group(id));
drop policy if exists "editar proprio perfil" on public.profiles;
create policy "editar proprio perfil" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Grupos: vejo só os meus (criar, entrar e mudar regras é pelas funções da parte 4)
drop policy if exists "ver meus grupos" on public.groups;
create policy "ver meus grupos" on public.groups
  for select to authenticated using (public.is_member(id));

-- Membros: vejo os dos meus grupos; posso me retirar
drop policy if exists "ver membros do grupo" on public.members;
create policy "ver membros do grupo" on public.members
  for select to authenticated using (public.is_member(group_id));
drop policy if exists "sair do grupo" on public.members;
create policy "sair do grupo" on public.members
  for delete to authenticated using (user_id = auth.uid());

-- Registros: vejo os dos meus grupos; crio só os meus; apago os meus (ou qualquer um, se for o dono)
drop policy if exists "ver registros do grupo" on public.logs;
create policy "ver registros do grupo" on public.logs
  for select to authenticated using (public.is_member(group_id));
drop policy if exists "inserir proprio registro" on public.logs;
create policy "inserir proprio registro" on public.logs
  for insert to authenticated with check (user_id = auth.uid() and public.is_member(group_id));
drop policy if exists "apagar proprio registro" on public.logs;  -- nome antigo
drop policy if exists "apagar registro" on public.logs;
create policy "apagar registro" on public.logs
  for delete to authenticated using (user_id = auth.uid() or public.is_owner(group_id));

-- Reações: vejo e reajo nos meus grupos; tiro só as minhas
drop policy if exists "ver reacoes do grupo" on public.reactions;
create policy "ver reacoes do grupo" on public.reactions
  for select to authenticated using (public.log_in_my_group(log_id));
drop policy if exists "reagir" on public.reactions;
create policy "reagir" on public.reactions
  for insert to authenticated with check (user_id = auth.uid() and public.log_in_my_group(log_id));
drop policy if exists "tirar propria reacao" on public.reactions;
create policy "tirar propria reacao" on public.reactions
  for delete to authenticated using (user_id = auth.uid());

-- Inscrições de lembrete: só as minhas (salvar é pela função save_push_subscription)
drop policy if exists "ver proprias inscricoes" on public.push_subscriptions;
create policy "ver proprias inscricoes" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "apagar proprias inscricoes" on public.push_subscriptions;
create policy "apagar proprias inscricoes" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());


-- =====================================================================
-- 7. ARMAZENAMENTO DE FOTOS (privado: só quem está num grupo com a pessoa vê)
-- =====================================================================
-- Cada pessoa grava só na própria pasta (o nome da pasta é o id dela).
-- O app mostra as fotos por links temporários (1 hora).

-- Fotos de prova: até 2 MB, só JPEG
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg'];

-- Fotos de perfil: até 512 KB, só JPEG
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 524288, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 524288, allowed_mime_types = array['image/jpeg'];

-- ----- Provas -----
drop policy if exists "enviar foto na propria pasta" on storage.objects;
create policy "enviar foto na propria pasta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text and public.in_any_group());

drop policy if exists "ver fotos do grupo" on storage.objects;
create policy "ver fotos do grupo" on storage.objects
  for select to authenticated
  using (bucket_id = 'proofs' and ((storage.foldername(name))[1] = auth.uid()::text
         or public.folder_shares_group((storage.foldername(name))[1])));

drop policy if exists "apagar propria foto" on storage.objects;
create policy "apagar propria foto" on storage.objects
  for delete to authenticated
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "dono do grupo apaga foto" on storage.objects;
create policy "dono do grupo apaga foto" on storage.objects
  for delete to authenticated
  using (bucket_id = 'proofs' and public.can_mod_photo(name));

-- ----- Perfil -----
drop policy if exists "enviar avatar na propria pasta" on storage.objects;
create policy "enviar avatar na propria pasta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "ver avatares do grupo" on storage.objects;
create policy "ver avatares do grupo" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text
         or public.folder_shares_group((storage.foldername(name))[1])));

drop policy if exists "apagar proprio avatar" on storage.objects;
create policy "apagar proprio avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);


-- =====================================================================
-- 8. TEMPO REAL E SEGREDO DO AGENDAMENTO
-- =====================================================================

-- Placar ao vivo
do $$ begin
  alter publication supabase_realtime add table public.logs;
exception when duplicate_object then null;
end $$;

-- Código aleatório guardado no cofre (Vault). O agendamento manda esse código para a função
-- de envio, e ela confere aqui. Ninguém precisa copiar nada.
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


-- =====================================================================
--  Consultas úteis (rode uma de cada vez)
-- =====================================================================
--  Registro dos envios (horário de Brasília):
--    select created_at at time zone 'America/Sao_Paulo' as quando, kind, status, detail
--      from public.notify_log order by id desc limit 30;
--  Agenda dos envios:
--    select jobname, schedule from cron.job;