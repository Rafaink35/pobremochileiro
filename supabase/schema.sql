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
