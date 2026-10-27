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
