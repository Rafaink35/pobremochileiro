# Hospedagem no Render

O app roda como **um serviço Node** (`server.mjs`): serve o site (`dist/`) e as rotas `/api/*` (voos, calendário, datas flexíveis, chat, roteiro).
O Render lê o `render.yaml` da raiz. As funções em `netlify/functions/` continuam as mesmas, então voltar à Netlify é só apontar o domínio de novo.

## Variáveis de ambiente (painel do Render → Environment)
| Variável | Para quê | Onde é lida |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | login e banco no navegador | na **construção** (build): mude e refaça o deploy |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | funções validarem o login | servidor |
| `TRAVELPAYOUTS_TOKEN`, `TRAVELPAYOUTS_MARKER`, `TRAVELPAYOUTS_TRS` | voos e links de afiliado | servidor |
| `ANTHROPIC_API_KEY`, `CHAT_MODEL` | chat com IA (padrão Haiku) | servidor |
Nunca coloque segredos no GitHub. Sem as variáveis, as rotas respondem 503 ("não configurado") em vez de quebrar.

## Verificação local
`npm run build && npm start` e abra http://localhost:3000. `/healthz` responde `ok`; `/api/flights` responde 503 sem token.
