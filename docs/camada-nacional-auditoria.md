# Camada nacional de dados: auditoria e plano (Fase 1)

Data: 02/11/2026. Só diagnóstico: **nenhum código de produção foi alterado**. Base: `main` no commit `9614ea6`
(251 testes, 250 passando; a falha é `server/__tests__/server.test.js`, pasta que não é nossa).

## 1. O que já existe (e deve ser reaproveitado)

| Área | Onde | Estado real |
|---|---|---|
| Hospedagem via OSM | `src/services/lodging/osmCamping.js` | Overpass por **nome de área administrativa**; categorias hotel, hostel, camping; `endpoint` e `fetchImpl` injetáveis; normaliza com **proveniência e licença** (ODbL, atribuição, id original, data de coleta); campos desconhecidos viram `null`; testado só com respostas simuladas |
| Deduplicação | `src/services/lodging/lodgingModel.js` | Mescla só mesma origem (provedor + id) ou mesmo tipo + mesmo nome normalizado + até 150 m; guarda `sources[]` e `conflicts[]`; filtros que nunca tratam "desconhecido" como positivo |
| Contrato de transporte | `src/services/transport/transportProvider.js` | `id, name, getSource, isConfigured, search`; `safeSearch` com timeout; status `ok/empty/not_configured/unavailable` |
| GTFS | `gtfsProvider.js`, `brazilFeeds.js`, `netlify/functions/gtfs.mjs` | Importa ZIP (fflate), valida, busca direta A→B, calendário (bug de `start_date/end_date` corrigido hoje), tarifa só se inequívoca. Validado com **amostra real da SPTrans** (654 paradas). Feeds Rio/SPTrans/ANTT só por URL de variável de ambiente |
| Metadados de fonte | `sourceMetadata.js` | Licença, atribuição, `commercialUse` (padrão "não verificado"), aviso ODbL/share-alike, status de integração, lista `INVESTIGATED_SOURCES`; tela **Fontes de dados** (`screens/DataSources.jsx`) |
| Preço rastreável | `src/services/trip/price.js` | `confirmed/published/estimate/unknown`, base (pessoa/grupo/quarto), período, validade. **É o molde do `PriceObservation`** |
| Base de conhecimento | `src/services/trip/knowledge.js` | Esquema validado (destinos, hospedagens, transporte) com fonte, licença e data; hoje vazia |
| Servidor | `server.mjs` (Render) + `netlify/functions/*.mjs` | Funções Request→Response reaproveitadas pelas duas hospedagens |
| Banco | `supabase/schema.sql` | Só tabelas sociais, work exchange e perfis. **Nada** de estabelecimentos, transporte ou sincronização |
| UI | `Stays.jsx`, `RouteExplorer.jsx`, `TransportSearch.jsx`, `BrazilFeeds.jsx` | Abas de hospedagem, "De A para B", importação GTFS |
| Testes | vitest, fixtures e mocks | Padrão a seguir; nenhum teste depende de rede |

## 2. Lacunas frente ao pedido

1. **Sem armazenamento próprio.** Hoje cada pessoa consulta a Overpass **do navegador**, sem cache, sem limite, sem histórico. Para "todo o Brasil" isso não escala e fere o uso justo do servidor público.
2. **Sem sincronização**: nenhuma rotina agendada, nenhum registro de execução, saúde ou falha por fonte.
3. **Consulta por nome de município** (frágil: homônimos, nome local no OSM). Falta consulta por UF, região e caixa geográfica.
4. **Sem Cadastur, Mobility Database, Transitland ou MONITRIIP.** Só estavam "investigadas" na documentação.
5. **Modelo único ausente**: lodging (OSM), `knowledge.js` e GTFS têm formatos próprios. O pedido (Establishment, TransportOperator/Route/Stop/Schedule, Price/AvailabilityObservation) exige uma camada comum, com `source`, `source_id`, `license`, `last_synced_at`.
6. **Histórico de atualização e correspondência entre fontes** (vincular registros sem apagar origem) não existem; hoje a mescla é só dentro do OSM.
7. **Operação**: Render grátis dorme e não tem agendador; função serverless tem limite de tempo e de resposta (~6 MB no Netlify).

## 3. Disponibilidade das fontes (o que sei e o que não sei)

**Nenhuma das fontes abaixo abre a partir desta sessão** (testadas hoje: Overpass, dados.turismo.gov.br, Mobility Database, Transitland, ANTT/MONITRIIP, wiki OSM). Só `www.sptrans.com.br` e `quadros-horarios.antt.gov.br` abriram em momentos anteriores. Portanto **nada abaixo está validado**:

- **OSM/Overpass**: formato e tags conhecidos; limites do servidor público a conferir na política de uso. Já integrado em código, **nunca executado contra a rede real**.
- **Cadastur / dados.turismo.gov.br**: formato (CSV/XLSX/API?), periodicidade e licença **desconhecidos**; não presumir API.
- **Mobility Database**: API com autenticação por token (a confirmar no Swagger); útil para **descobrir** feeds e licenças, não para consultar passagens.
- **Transitland**: API REST com chave (a confirmar), cotas por plano; paginação por cursor.
- **ANTT/MONITRIIP**: dados históricos e indicadores; **não** é consulta de tarifa nem de assento. `quadros-horarios.antt.gov.br` é um painel Power BI, sem arquivo nem API. O portal `dados.antt.gov.br` ainda não pôde ser aberto.
- **Comerciais** (Booking, Expedia, Busbud, Distribusion, Amadeus): ficam desativados. Amadeus Self-Service foi relatado como descontinuado (a confirmar).

## 4. Arquitetura proposta (mesmo stack: JavaScript ESM, vitest, sem TypeScript)

```
src/services/datalayer/
  model.js            tipos e validação (Establishment, Operator, Route, Stop, Schedule, Price/AvailabilityObservation)
  match.js            correspondência entre fontes (sem apagar origem), reaproveitando lodgingModel.js
  cache.js            cache com TTL + backoff exponencial + limite de requisições por fonte
  health.js           saúde e estatísticas de cada sincronização
  sources/
    osm.js            reaproveita osmCamping.js (consulta por UF/região, endpoint configurável)
    cadastur.js       importador do formato realmente publicado
    mobilityDatabase.js  descoberta de feeds (token em variável de ambiente)
    transitland.js    operadores, rotas, paradas (chave em variável de ambiente, paginação)
    gtfs.js           reaproveita gtfsProvider.js
    antt.js           bases abertas disponíveis
    commercial/       adaptadores desativados (Booking, Expedia, Busbud, Distribusion, Amadeus)
  sync/               runner por fonte: fetch → normalize → validate → upsert → registro de execução
supabase/national-layer.sql   tabelas, índices, RLS e histórico
```

Cada adaptador implementa `fetch/normalize/validate/sync/getHealth`. Chaves só em variáveis de ambiente do servidor. Dados abertos e comerciais ficam em campos/tabelas distintos (`origin_kind: open|commercial`).

## 5. Decisões que dependem do dono do projeto

1. **Onde guardar os dados sincronizados.** Escrever tabelas pelo servidor exige uma **chave com permissão de escrita** no Supabase (service role). Em conversas anteriores a regra foi *não usar a chave secreta no app*. Opções: (a) job fora do app (GitHub Actions agendado, com a chave só nos segredos do GitHub) que grava no Supabase; (b) aceitar a chave só como variável do servidor no Render; (c) sem banco: arquivos de resultado (NDJSON) gerados pelo job e servidos como estáticos. **Recomendo (a).**
2. **Agendador.** Render grátis não tem cron; GitHub Actions agendado é gratuito e tem saída de rede aberta.
3. **Escopo da primeira entrega.** Sugiro OSM + Cadastur (hospedagem) e só então transporte.
4. **Licenças**: ODbL (OSM) exige atribuição e pode exigir compartilhar bases derivadas; revisão necessária antes de divulgar.

## 6. Plano de execução

- **Fase 1 (esta):** auditoria e este documento.
- **Fase 2:** `model.js`, `match.js`, `cache.js`, migração SQL, adaptador OSM (consulta por UF e região, cache, backoff, endpoint configurável) e importador Cadastur. **Bloqueio:** precisa abrir `dados.turismo.gov.br` para ver o formato real; sem isso, só o esqueleto e os testes com fixtures.
- **Fase 3:** Mobility Database (descoberta), Transitland, GTFS existentes.
- **Fase 4:** ANTT (arquivos de horários do portal de dados abertos).
- **Fase 5:** painel de saúde das fontes e indicadores de qualidade (estende a tela Fontes de dados).
- **Fase 6:** adaptadores comerciais **desligados**, sem simulação de disponibilidade.

Critério de "integrada": só depois de **execução real validada** ou teste de integração documentado. Hoje, **nenhuma** das fontes novas atende esse critério.
