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
