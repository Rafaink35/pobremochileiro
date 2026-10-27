# Checklist de publicação

1. **Código**: branch enviada para `Rafaink35/pobremochileiro`; abra um PR para `main`.
2. **Chaves**: só em variáveis de ambiente do servidor (nunca `VITE_` para segredos, nunca no GitHub).
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (públicas por design, protegidas por RLS)
   - `TRAVELPAYOUTS_TOKEN`, `TRAVELPAYOUTS_MARKER` (voos, a criar em `/api/flights`)
   - `ANTHROPIC_API_KEY` (assistente, opcional, em `/api/assistant`)
3. **Supabase**: criar projeto, rodar `supabase/schema.sql`, preencher `VITE_SUPABASE_*`.
4. **Netlify**: build `npm run build`, pasta `dist`; criar `netlify.toml` e functions.
5. **Google Play**: empacotar o PWA (Bubblewrap ou Capacitor) com o site em HTTPS.
