# Motor de viagens (Fase 1)

Núcleo próprio de recomendação, **sem LLM e sem API paga**. Tudo roda no navegador, com funções puras em `src/services/trip/`.
A tela é `#descubra` ("Descubra até onde seu dinheiro leva você", também chamada pelo banner da página inicial).

> A base de conhecimento está **vazia** (`src/data/knowledge/base.json`). Sem dados reais, a tela mostra um estado vazio.
> Os dados de `src/services/trip/__tests__/fixtures.js` são fictícios e só existem nos testes.

## Preço (`price.js`)
Todo valor é um objeto `price`:

| Campo | Significado |
|---|---|
| `status` | `confirmed` (reconfirmado), `published` (publicado, ainda não reconfirmado), `estimate` (estimativa explicada em `note`), `unknown` |
| `amount`, `currency` | valor e moeda (ISO, ex. `BRL`). Ausente = `null`, **nunca 0** |
| `unit` | `{ basis, period }`: `basis` = `person` \| `group` \| `room`; `period` = `once` \| `night` \| `day` (diária) \| `leg` (trecho) \| `round_trip` |
| `origin` | `{ sourceId, name }`, a fonte do preço (precisa existir em `sources`) |
| `referenceUrl`, `collectedAt`, `validUntil` | link de referência, data da coleta e validade (quando conhecida) |

Preço `confirmed`/`published` sem valor, moeda, unidade, origem ou data de coleta **vira `unknown`** (com `issues`). Preço
vencido (`validUntil`) ou coletado há mais de 30 dias é tratado como **`stale`**: conta como estimativa, nunca como confirmado.

## Base de conhecimento (`knowledge.js`)
`loadKnowledgeBase(json)` valida e devolve `{ kb, errors, warnings }`; registro inválido é descartado com o motivo.
Coleções: `sources` (metadados com licença: reutiliza `createSourceMetadata`), `origins`, `destinations` (com `dailyFood` e
`localTransportDaily`), `transportOptions` (`mode`: bus/flight/train/ferry/car), `lodgings`, `workExchanges`, `activities`.
Cada preço cita uma fonte cadastrada; preço com fonte inexistente vira `unknown`. Adaptadores em `adapters.js` convertem
campings do OpenStreetMap e oportunidades de work exchange (preço só se a fonte der).

### Como adicionar uma fonte e dados
1. Confirme a **licença e o uso comercial** da fonte (`docs/data-sources.md`).
2. Em `src/data/knowledge/base.json`, cadastre a fonte em `sources` (`id`, `name`, `url`, `license`, `attribution`, `obtainedAt`,
   `commercialUse`). Nada de scraping indiscriminado: só fontes cujo uso é permitido.
3. Cadastre destinos e, para cada preço, `status`, `amount`, `currency`, `unit`, `origin.sourceId`, `referenceUrl`, `collectedAt`.
   Se você não sabe o valor, **omita o preço**: ele ficará "não informado".
4. Rode `npm test` e abra `#descubra`. Avisos de validação aparecem no console de testes/`knowledgeWarnings`.

## Orçamento (`budget.js`)
`computeBudget` calcula, por linha, `preço × base (pessoas, quartos, grupo) × período (noites, dias, trechos)`.
- Falta um número necessário (ex.: quartos) ou a moeda não é BRL sem cotação → a linha fica **pendente**, não vira zero.
- `knownTotal` (confirmado/publicado dentro da validade), `estimatedTotal` (estimativa, desatualizado, convertido),
  reserva de imprevistos (padrão 10% do conhecido + estimado), `minimumTotal`, `pending[]` e `balance`.
- `finalCostClaim`: só `confirmed` pode ser apresentado como custo final. Com pendências é `incomplete` e o saldo é "máximo".
- `fit`: `within`, `within_partial`, `over`, `unknown`.

## Recomendador (`recommender.js`)
Determinístico. Ordem de decisão (não há "notas"): 1) compatibilidade com o orçamento; 2) proporção de linhas com preço
confirmado/publicado e atual; 3) preferências atendidas (tags do destino, atividades, tipo de hospedagem); 4) transporte e
hospedagem conhecidos; 5) menos custos essenciais pendentes; 6) menor custo mínimo; 7) nome. Cada resultado traz `reasons[]`
com a evidência (fonte, licença, link, data). Destinos acima do orçamento ficam ocultos (contados em `hidden.over`).
Sem carro nunca sugere carro. Premissas: pessoas dormem em `ceil(pessoas/2)` quartos; transporte conta 2 trechos.
Estados: `ok`, `insufficient_data`, `unknown_origin`, `unknown_destination`, `invalid_request`, `none_within_budget`.

## Interpretador sem LLM (`requestParser.js`)
Regras e padrões em português: orçamento ("R$ 600", "3 mil reais"), origem ("saio do Rio"), duração ("quatro dias", "5 noites",
"uma semana"), preferências, carro e pessoas. Falta de dado ou ambiguidade vira **pergunta de esclarecimento**; suposições
(ex.: "Rio" = Rio de Janeiro) são listadas. **Não entende frase livre.** A interface `interpret(text) → Promise` permite trocar
por um LLM local no futuro sem mexer na tela (`createRuleInterpreter`, `assertInterpreter`).

## Fontes reais que ainda precisam ser importadas
Nenhuma. Falta cadastrar: preços de transporte (ônibus, voos, trens) com fonte e data, hospedagens, custo diário de
alimentação por destino, atrações e oportunidades de work exchange aprovadas. Candidatos já mapeados: OpenStreetMap
(campings, via adaptador), GTFS autorizados (`docs/data-sources.md`) e o cadastro de work exchange no Supabase.
