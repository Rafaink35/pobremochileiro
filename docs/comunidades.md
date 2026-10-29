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

## Feed com fotos (estilo Instagram)
Cada relato pode ter até 4 fotos, lugar, **dica útil**, quanto gastou e dias de viagem, além de curtidas e comentários.

- **Fotos:** escolhidas no navegador, reduzidas a no máximo 1600 px e salvas como JPEG (o redesenho remove EXIF/GPS). Limite de
  2 MB por foto no bucket `post-images` (público para leitura; cada pessoa grava só na própria pasta `<user_id>/`).
- **Gasto e dias** aparecem como "informado pelo autor, não verificado".
- **Curtidas:** só logado; a contagem é pública (`post_like_counts`), quem curtiu é privado.
- **Comentários:** leitura pública, só logado comenta e cada pessoa apaga os próprios.
- **Denúncias:** o botão de bandeira registra em `post_reports` (só a moderação lê, no painel). Com **3 denúncias de pessoas
  diferentes** o relato fica oculto (`hidden`) até a moderação revisar.
- Ao apagar um relato, as fotos dele também são removidas do bucket.

### Moderação e riscos (leia antes de abrir ao público)
- Não há análise automática de conteúdo das fotos. As denúncias e a regra das 3 denúncias são só uma primeira barreira:
  alguém precisa olhar o painel do Supabase com frequência.
- Termos de uso, política de privacidade e canal de remoção de conteúdo são necessários (LGPD, direito de imagem, menores).
- Custos: armazenamento e tráfego de imagens contam no plano do Supabase.
- Validado só com testes de regras e com a interface contra respostas simuladas do Supabase, nunca contra um projeto real.
