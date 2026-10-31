-- Rode no SQL Editor do Supabase. Todo mundo lê; só quem está logado publica; cada pessoa apaga só o que é seu.
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  author_name text not null check (char_length(author_name) between 1 and 40),
  type text not null check (type in ('Planejamento', 'Natureza', 'Cidade', 'Praia', 'Dica')),
  title text not null check (char_length(title) between 3 and 120),
  body text not null check (char_length(body) between 3 and 2000),
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;

create policy "posts: leitura pública" on public.posts for select using (true);
create policy "posts: autor publica" on public.posts for insert to authenticated with check (user_id = auth.uid());
create policy "posts: autor apaga" on public.posts for delete to authenticated using (user_id = auth.uid());

-- Login por código de e-mail: em Authentication > Email Templates (Magic Link / Confirm signup),
-- inclua {{ .Token }} no corpo para o usuário receber o código de 6 dígitos.

-- ───────────── Work exchange (trabalho em troca de hospedagem) ─────────────
-- Todo mundo lê SOMENTE oportunidades aprovadas. Quem está logado cadastra como "pending".
-- A aprovação (status = 'approved') é feita pela moderação, direto no painel do Supabase (service role).
create table if not exists public.work_exchange_opportunities (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade default auth.uid(),
  host_name text not null check (char_length(host_name) between 1 and 80),
  place_name text,
  lat double precision check (lat between -90 and 90),
  lon double precision check (lon between -180 and 180),
  city text,
  state text,
  host_type text,
  tasks text[] not null default '{}',
  skills text[] not null default '{}',
  hours_per_week integer check (hours_per_week >= 0),
  days_off_per_week integer check (days_off_per_week between 0 and 7),
  accommodation text,
  meals text,
  start_date date,
  end_date date,
  spots integer check (spots >= 0),
  requirements text,
  expenses text,
  conditions text,
  external_url text check (external_url ~* '^https?://'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'closed', 'rejected')),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.work_exchange_opportunities enable row level security;

create policy "work_exchange: leitura pública só aprovadas"
  on public.work_exchange_opportunities for select using (status = 'approved');
create policy "work_exchange: autor vê as suas"
  on public.work_exchange_opportunities for select to authenticated using (created_by = auth.uid());
create policy "work_exchange: autor cadastra como pendente"
  on public.work_exchange_opportunities for insert to authenticated
  with check (created_by = auth.uid() and status = 'pending');
-- Sem política de update/delete para o público: alterações e aprovação ficam com a moderação.

-- ───────────────── Comunidades (grupos por tema ou destino) ─────────────────
-- Todo mundo lê. Quem está logado entra e sai das comunidades e só publica nas que entrou.
-- Criar ou editar comunidades fica com a moderação (painel do Supabase), para evitar spam.
create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  name text not null check (char_length(name) between 3 and 60),
  description text check (char_length(description) <= 300),
  kind text not null check (kind in ('tema', 'destino')),
  created_at timestamptz not null default now()
);

create table if not exists public.community_members (
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

alter table public.posts add column if not exists community_id uuid references public.communities (id) on delete set null;

alter table public.communities enable row level security;
alter table public.community_members enable row level security;

create policy "communities: leitura pública" on public.communities for select using (true);
-- A lista de membros é privada: cada pessoa só enxerga as próprias entradas.
create policy "members: vê a própria" on public.community_members for select to authenticated using (user_id = auth.uid());
create policy "members: entra" on public.community_members for insert to authenticated with check (user_id = auth.uid());
create policy "members: sai" on public.community_members for delete to authenticated using (user_id = auth.uid());

-- Contagem pública de membros, sem expor quem são.
create or replace function public.community_member_counts()
returns table (community_id uuid, members bigint)
language sql security definer set search_path = public as $$
  select m.community_id, count(*) from public.community_members m group by m.community_id;
$$;
grant execute on function public.community_member_counts() to anon, authenticated;

-- Publicar: só em comunidade da qual a pessoa é membro (ou sem comunidade).
drop policy if exists "posts: autor publica" on public.posts;
create policy "posts: autor publica" on public.posts for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      community_id is null
      or exists (select 1 from public.community_members m where m.community_id = posts.community_id and m.user_id = auth.uid())
    )
  );

-- Comunidades iniciais (só os nomes; nenhum conteúdo de exemplo). Ajuste ou apague à vontade.
insert into public.communities (slug, name, description, kind) values
  ('mochileiros-do-brasil', 'Mochileiros do Brasil', 'Dicas e relatos de quem viaja pelo país com pouco dinheiro.', 'tema'),
  ('camping-e-natureza', 'Camping e natureza', 'Campings, trilhas e acampamento livre: onde, como e com que cuidado.', 'tema'),
  ('trabalho-em-troca', 'Trabalho em troca e voluntariado', 'Experiências com work exchange: o que combinar, como se proteger.', 'tema'),
  ('viagem-barata', 'Voos e ônibus baratos', 'Como achar passagem mais barata e montar combos.', 'tema'),
  ('mochilao-internacional', 'Mochilão internacional', 'Roteiros e dúvidas de quem vai para fora do Brasil.', 'tema')
on conflict (slug) do nothing;

-- ───────────────── Feed com fotos, dicas, curtidas e comentários ─────────────────
alter table public.posts
  add column if not exists images text[] not null default '{}' check (cardinality(images) <= 4),
  add column if not exists place_name text check (char_length(place_name) <= 80),
  add column if not exists tip text check (char_length(tip) <= 500),
  add column if not exists trip_cost_brl numeric(10, 2) check (trip_cost_brl >= 0),
  add column if not exists trip_days integer check (trip_days between 1 and 365),
  add column if not exists hidden boolean not null default false;

alter table public.posts drop constraint if exists posts_type_check;
alter table public.posts add constraint posts_type_check check (
  type in ('Planejamento', 'Natureza', 'Cidade', 'Praia', 'Dica', 'Camping', 'Trabalho em troca', 'Ônibus e voos', 'Perrengue')
);

-- Relatos ocultos (denúncias) só o autor enxerga.
drop policy if exists "posts: leitura pública" on public.posts;
create policy "posts: leitura pública" on public.posts for select using (hidden = false or user_id = auth.uid());

create table if not exists public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  primary key (post_id, user_id)
);
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  author_name text not null check (char_length(author_name) between 1 and 40),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create table if not exists public.post_reports (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  reason text check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_reports enable row level security;

create policy "likes: vê as próprias" on public.post_likes for select to authenticated using (user_id = auth.uid());
create policy "likes: curte" on public.post_likes for insert to authenticated with check (user_id = auth.uid());
create policy "likes: descurte" on public.post_likes for delete to authenticated using (user_id = auth.uid());
create policy "comments: leitura pública" on public.post_comments for select using (true);
create policy "comments: autor comenta" on public.post_comments for insert to authenticated with check (user_id = auth.uid());
create policy "comments: autor apaga" on public.post_comments for delete to authenticated using (user_id = auth.uid());
-- Denúncias: qualquer logado denuncia; só a moderação lê (painel do Supabase).
create policy "reports: denuncia" on public.post_reports for insert to authenticated with check (user_id = auth.uid());

-- Contagem pública de curtidas sem expor quem curtiu.
create or replace function public.post_like_counts(ids uuid[])
returns table (post_id uuid, likes bigint)
language sql security definer set search_path = public as $$
  select l.post_id, count(*) from public.post_likes l where l.post_id = any (ids) group by l.post_id;
$$;
grant execute on function public.post_like_counts(uuid[]) to anon, authenticated;

-- Com 3 denúncias de pessoas diferentes o relato fica oculto até a moderação revisar. Não substitui moderação humana.
create or replace function public.hide_reported_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.post_reports r where r.post_id = new.post_id) >= 3 then
    update public.posts set hidden = true where id = new.post_id;
  end if;
  return new;
end $$;
drop trigger if exists post_reports_hide on public.post_reports;
create trigger post_reports_hide after insert on public.post_reports for each row execute function public.hide_reported_post();

-- Fotos: bucket público para leitura; cada pessoa escreve só na própria pasta (<user_id>/arquivo.jpg).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 2097152, array['image/jpeg', 'image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "post-images: leitura pública" on storage.objects for select using (bucket_id = 'post-images');
create policy "post-images: envia na própria pasta" on storage.objects for insert to authenticated
  with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "post-images: apaga as próprias" on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ───────────────── Perfil mochileiro ─────────────────
-- O nome público passa a ser o nome de usuário (nunca o e-mail). Rode este bloco uma vez, depois dos anteriores.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  username text not null unique
    check (username ~ '^[a-z0-9_]{3,20}$' and username !~ '^[0-9_]+$'
           and username not in ('admin', 'administrador', 'moderador', 'moderacao', 'suporte', 'equipe', 'oficial', 'pobremochileiro', 'pobre_mochileiro')),
  display_name text check (char_length(display_name) <= 40),
  bio text check (char_length(bio) <= 160),
  home_city text check (char_length(home_city) <= 60),
  travel_styles text[] not null default '{}' check (cardinality(travel_styles) <= 5),
  avatar_color text not null default 'green' check (avatar_color in ('green', 'yellow', 'coral', 'cream', 'sage')),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "profiles: leitura pública ou própria" on public.profiles for select using (is_public or id = auth.uid());
create policy "profiles: cria o próprio" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles: edita o próprio" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles: apaga o próprio" on public.profiles for delete to authenticated using (id = auth.uid());

-- Publicar e comentar exigem perfil, e o nome exibido vem SEMPRE do perfil (não dá para forjar nem expor o e-mail).
create or replace function public.set_author_name() returns trigger
language plpgsql security definer set search_path = public as $$
declare u text;
begin
  select username into u from public.profiles where id = new.user_id;
  if u is null then raise exception 'Crie seu perfil antes de publicar.'; end if;
  new.author_name := u;
  return new;
end $$;
drop trigger if exists posts_author_name on public.posts;
create trigger posts_author_name before insert on public.posts for each row execute function public.set_author_name();
drop trigger if exists comments_author_name on public.post_comments;
create trigger comments_author_name before insert on public.post_comments for each row execute function public.set_author_name();

-- Ao criar ou trocar o nome de usuário, relatos e comentários antigos passam a mostrar o novo nome
-- (isso troca o nome que antes era o começo do e-mail).
create or replace function public.sync_author_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.posts set author_name = new.username where user_id = new.id;
  update public.post_comments set author_name = new.username where user_id = new.id;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists profiles_sync_author on public.profiles;
create trigger profiles_sync_author after insert or update of username on public.profiles for each row execute function public.sync_author_name();

-- Apagar a própria conta: remove o usuário e, em cascata, perfil, relatos, curtidas e comentários.
-- (As fotos no Storage são apagadas pelo app antes de chamar esta função.)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
