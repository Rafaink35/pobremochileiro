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

## Chat com streaming (`POST /api/chat`)
Substitui o formulário no Planejador (`ChatAgent`). A função `netlify/functions/chat.mjs` responde em **NDJSON** (um evento
JSON por linha): `tool` (o que a IA está consultando), `text` (trechos da resposta), `proposal` (itens sugeridos, já verificados),
`warning`, `error` e `done` (com o uso de tokens).

- **Ferramentas:** câmbio, voos, datas flexíveis, combo ônibus + voo, campings, trabalho em troca, leitura do plano,
  `record_user_value` (valor dito pelo usuário) e `propose_plan_items`.
- **Verificação:** itens propostos só têm valor se baterem com uma fonte (`verify.js`). Valores em reais citados no
  **texto** sem origem (ferramenta, plano ou fala do usuário) geram um aviso (`amounts.js`). A IA nunca altera o plano:
  o usuário toca em "Adicionar ao plano".
- **Conversa:** o navegador envia as últimas 12 mensagens de texto e um resumo do plano; o servidor não guarda nada.
- **Variáveis:** `CHAT_MODEL` (padrão `claude-opus-5-5`), `CHAT_DAILY_LIMIT` (padrão 30 mensagens por usuário por dia).
- **Riscos ainda não validados:** streaming em funções da Netlify e o tempo máximo de execução (o padrão costuma ser curto
  e uma resposta com várias ferramentas pode demorar mais). Teste em produção; se cortar, é preciso outro tipo de
  hospedagem para essa rota. A verificação de texto livre é uma rede de segurança, não uma garantia.
