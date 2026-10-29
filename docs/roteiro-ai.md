# Roteiro mais barato com IA

`POST /api/roteiro` (função Netlify `netlify/functions/roteiro.mjs`) usa a API da Anthropic com **tool use**.

## Como funciona
1. O app envia destino, origem, dias, passageiros, mês e orçamento, com o token de login do Supabase.
2. A função confere o login, aplica o limite diário e chama o modelo com 4 ferramentas: câmbio, voos (Travelpayouts),
   campings (OpenStreetMap) e work exchange aprovado (Supabase). Cada resultado recebe um **id**.
3. O modelo devolve um JSON. O servidor **descarta todo valor em reais que não bata com o resultado da ferramenta citado
   em `fonte_id`** (`src/services/roteiro/verify.js`). Ônibus, comida e passeios não têm fonte e ficam "não confirmados".
4. O total é só dos valores confirmados; "cabe no orçamento" só aparece como "sim" quando nada falta.

## Configuração (todas só no servidor)
`ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `TRAVELPAYOUTS_TOKEN`, `TRAVELPAYOUTS_MARKER`
(+ opcionais `ROTEIRO_MODEL`, `ROTEIRO_DAILY_LIMIT`). Sem `ANTHROPIC_API_KEY` a função responde 503; sem login, 401.

## Custos e riscos
- Modelo padrão `claude-opus-5-5` (US$ 4 / US$ 20 por milhão de tokens, entrada / saída; confira os preços atuais).
  `ROTEIRO_MODEL=claude-sonnet-5-5` custa menos. Cada roteiro faz de 2 a 6 chamadas; a resposta traz `usage`.
- O limite por usuário é guardado **em memória da instância** da função: serve de freio, não de garantia. Configure
  também um **limite de gasto** no Console da Anthropic.
- Não testado contra a API real nem contra Travelpayouts/Overpass/Supabase neste ambiente (só com simulações).
- A IA pode errar nos textos (resumo, observações); só os valores em reais são verificados.
