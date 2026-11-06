-- Camada nacional de dados (Fase 2): estabelecimentos de hospedagem, histórico, vínculos entre fontes,
-- observações de preço e disponibilidade, execuções de sincronização e saúde das fontes.
-- Rode no SQL Editor do Supabase. É idempotente (pode rodar de novo).
--
-- Segurança: RLS ligada em tudo. LEITURA pública (são dados abertos, sem dado pessoal). NÃO há política de
-- escrita: só o job de sincronização, com a chave de serviço guardada nos segredos do GitHub, grava.
-- Desconhecido é NULL: preço e disponibilidade nunca são preenchidos com valor inventado.

create table if not exists public.establishments (
  id text primary key,                         -- "<fonte>:<id na fonte>"
  name text not null,
  type text not null check (type in ('hostel','hotel','pousada','guest_house','camping','caravan_site','ecovillage','collaborative')),
  description text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  address text,
  city text,
  state text check (state is null or state ~ '^[A-Z]{2}$'),
  region text,                                 -- estado/província fora do Brasil (texto livre)
  country text check (country is null or country ~ '^[A-Z]{2}$'),  -- ISO 3166-1 alfa-2; NULL = desconhecido
  phone text,
  website text,
  facilities jsonb,
  source text not null,
  source_id text not null,
  source_url text,
  license text not null,
  attribution text,
  origin_kind text not null default 'open' check (origin_kind in ('open','commercial')),
  last_verified_at timestamptz,
  last_synced_at timestamptz not null,
  status text not null default 'unverified' check (status in ('unverified','active','closed')),
  extra jsonb,
  content_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);
create index if not exists establishments_state_city_idx on public.establishments (state, city);
create index if not exists establishments_type_idx on public.establishments (type);
create index if not exists establishments_geo_idx on public.establishments (latitude, longitude);

create table if not exists public.establishment_history (
  id bigserial primary key,
  establishment_id text not null references public.establishments(id) on delete cascade,
  changed_at timestamptz not null,
  changes jsonb not null,                      -- { campo: [antes, depois] }
  content_hash text not null
);
create index if not exists establishment_history_est_idx on public.establishment_history (establishment_id, changed_at desc);

-- Vínculos SUGERIDOS entre registros de fontes diferentes. Nada é mesclado nem apagado.
create table if not exists public.establishment_links (
  a_id text not null references public.establishments(id) on delete cascade,
  b_id text not null references public.establishments(id) on delete cascade,
  score numeric(3,2) not null,
  reasons jsonb not null,
  status text not null default 'candidate' check (status in ('candidate','confirmed','rejected')),
  created_at timestamptz not null default now(),
  primary key (a_id, b_id),
  check (a_id <> b_id)
);

create table if not exists public.price_observations (
  id bigserial primary key,
  entity_id text not null,
  entity_type text not null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  price_type text not null check (price_type in ('current','historical','estimated','published')),
  observed_at timestamptz not null,
  valid_for_date date,
  source text not null,
  source_url text,
  conditions text
);
create index if not exists price_observations_entity_idx on public.price_observations (entity_type, entity_id, observed_at desc);

create table if not exists public.availability_observations (
  id bigserial primary key,
  entity_id text not null,
  entity_type text not null,
  available boolean,                           -- NULL = desconhecida
  quantity integer check (quantity is null or quantity >= 0),
  observed_at timestamptz not null,
  valid_for_date date,
  source text not null
);
create index if not exists availability_observations_entity_idx on public.availability_observations (entity_type, entity_id, observed_at desc);

create table if not exists public.source_sync_runs (
  id bigserial primary key,
  source text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  ok boolean not null,
  fetched integer not null default 0,
  imported integer not null default 0,
  updated integer not null default 0,
  unchanged integer not null default 0,
  rejected integer not null default 0,
  errors jsonb not null default '[]',
  scopes jsonb not null default '[]'
);
create index if not exists source_sync_runs_source_idx on public.source_sync_runs (source, started_at desc);

create table if not exists public.source_state (
  source text primary key,
  last_run_at timestamptz,
  last_run_ok boolean,
  last_success_at timestamptz,
  last_error text,
  frequency_hours integer,
  health text check (health in ('never_run','healthy','degraded','failing'))
);

do $$
declare t text;
begin
  foreach t in array array['establishments','establishment_history','establishment_links','price_observations','availability_observations','source_sync_runs','source_state']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s: leitura pública" on public.%I', t, t);
    execute format('create policy "%s: leitura pública" on public.%I for select using (true)', t, t);
  end loop;
end $$;
