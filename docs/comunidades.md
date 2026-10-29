# Comunidades

Grupos por tema ou destino dentro da aba **Comunidade**. Cada comunidade filtra o feed de relatos.

## Regras
- **Leitura pública** das comunidades e dos relatos.
- **Entrar e sair:** só logado. A lista de membros é privada (cada pessoa vê só as próprias entradas); a contagem pública vem de
  `community_member_counts()`.
- **Publicar:** logado e, numa comunidade, **membro dela** (a regra está no banco, em `posts: autor publica`, e na interface).
  Sem comunidade selecionada, o relato fica sem grupo.
- **Criar e editar comunidades:** só a moderação, direto no painel do Supabase (tabela `communities`), para evitar spam.
  O `schema.sql` cadastra 5 comunidades iniciais (apenas nome e descrição, sem relatos de exemplo). Para uma de destino, use `kind = 'destino'`.

## Para ligar
1. Criar o projeto no Supabase e rodar `supabase/schema.sql` (a parte "Comunidades" é idempotente).
2. Configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. Sem o Supabase, a aba mostra só os exemplos de interface identificados como tal; comunidades não aparecem.

## Limites atuais
- Sem comentários, curtidas nem moderação de relatos dentro do app (só pelo painel).
- Quem apaga a própria comunidade ou relato depende das políticas do banco; relatos antigos sem comunidade continuam visíveis em "Todas".
- Não validado contra um Supabase real: só testes de regras e a interface com respostas simuladas.
