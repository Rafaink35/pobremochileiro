# Motor de viagens (Fase 1)

Núcleo próprio de recomendação, **sem LLM e sem API paga**. Tudo roda no navegador, com funções puras em `src/services/trip/`.
A tela é `#descubra` ("Descubra até onde seu dinheiro leva você", também chamada pelo banner da página inicial).

> **Produção:** a base (`src/data/knowledge/base.json`) está **vazia de propósito**. Sem dados reais a tela mostra "Ainda não há preços
> verificados" e os custos aparecem como **"Preço indisponível"** (essenciais) ou **"Estimativa não disponível"** (opcionais). Nada é inventado.
> **Fixtures:** os 5 cenários (Rio→Paraty, Rio→São Paulo, Rio→Buenos Aires, São Paulo→Santiago, São Paulo→Lisboa) existem **só para
> desenvolvimento e testes**, em `src/services/trip/__tests__/fixtures/five-scenarios.json`, com valores fictícios e fonte marcada
> `"fixture": true`. Para vê-los no navegador: `VITE_USE_FIXTURES=1 npm run dev` (aparece o aviso "MODO DESENVOLVIMENTO").
> Três travas impedem que cheguem à produção: (1) `base.json` vazio; (2) `guardProductionKnowledgeBase` descarta qualquer base com fonte
> fixture fora do modo de desenvolvimento; (3) um teste falha se código de produção importar as fixtures.
> Os dados de `src/services/trip/__tests__/fixtures.js` também são fictícios e só existem nos testes.

## Como publicar dados reais
1. Monte o JSON no formato abaixo (fontes, origens, destinos, transportes, hospedagens, custos locais), **só com preço de fonte**.
2. Rode `npm run kb:validate -- caminho/arquivo.json --production`: mostra erros, avisos e a **cobertura** (por destino: transporte, hospedagem,
   alimentação, deslocamento local, preços verificados) e **bloqueia** fonte fixture.
3. Copie o arquivo aprovado para `src/data/knowledge/base.json`. Preço sem fonte cadastrada, sem valor, unidade, moeda ou data vira "indisponível".
Para destino sem alimentação ou deslocamento local, **omita o campo**: o motor mostra "indisponível" e o resultado fica parcial.

## Entradas do Descubra (Etapa 1)
Além de orçamento, origem, dias, pessoas, preferências e carro, a tela aceita: **data de saída** (opcional; data passada é recusada),
**orçamento total do grupo ou por pessoa** (por pessoa é multiplicado pelas pessoas e a premissa é mostrada),
**como prefere chegar** (modos de transporte considerados) e **tipo de hospedagem** (hostel, pousada, hotel, camping; se o tipo pedido
não existe no destino, o motor avisa e usa a mais barata). Destinos trazem `country`, `currency` (moeda local) e `timezone`; os valores
da tela estão sempre em reais. O destino igual à origem não é sugerido.

## Quando "cabe no orçamento"
`fit = within` só existe com **nenhum custo pendente**. Com custo desconhecido o resultado é **parcial** ("não dá para afirmar que cabe") e,
sem nenhum preço verificável, **inconclusivo**. "Passa do orçamento" vale mesmo com pendências, porque o custo mínimo conhecido já excede.
No planejador, a ausência de transporte, alimentação ou (havendo noites) hospedagem torna o resultado parcial (`essentialMissing`).

## Orçamento unificado
O resumo do planejador (`planSummary`) usa o mesmo `computeBudget` da tela Descubra: confirmado/informado, estimado, reserva de
imprevistos (10%), custo mínimo e se cabe no limite. Cada item do plano tem selo (`confirmado`, `publicado`, `estimativa`,
`informado por você`, `valor não informado`). Ao editar o valor de um item vindo da descoberta, ele passa a "informado por você (ajustado)".
`knownTotal` continua sendo a soma de tudo que tem número; item sem valor é pendência, nunca zero.

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
