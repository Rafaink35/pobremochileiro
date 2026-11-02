# Camada nacional de dados: Fase 2 (modelo, OSM e Cadastur)

Data: 02/11/2026. Complementa `docs/camada-nacional-auditoria.md`.

## Status honesto

| Fonte | Adaptador | Testes (mocks/fixtures) | Execução real | Registros importados |
|---|---|---|---|---|
| OpenStreetMap / Overpass | pronto (UF, região, município, caixa; cache; limite; recuo; endpoint configurável) | sim | **não executada** (rede bloqueada na sessão de desenvolvimento) | **0** |
| Cadastur | pronto para **CSV** (separador detectado; colunas por alias) | sim, com fixture inventada só para teste | **não executada**; formato real e licença **não verificados** | **0** |

**Nenhuma fonte desta fase pode ser chamada de "integrada"** até uma execução real validada (ver "Como validar").

## O que foi criado

- `src/services/datalayer/model.js`: Establishment, PriceObservation, AvailabilityObservation (validação, `null` para desconhecido, proveniência, hash de conteúdo).
- `src/services/datalayer/cache.js`: cache com TTL, limitador de intervalo, recuo exponencial com `Retry-After`.
- `src/services/datalayer/match.js`: vínculos **candidatos** entre fontes diferentes (sem mesclar nem apagar).
- `src/services/datalayer/sources/osm.js` e `cadastur.js`: adaptadores (`fetch`, `normalize`, `validate`; saúde via runner).
- `src/services/datalayer/sync/store.js` (memória e Supabase REST) e `runner.js` (execução, upsert com histórico, saúde).
- `scripts/sync.mjs`: linha de comando (`osm --uf SC`, `osm --region Sul`, `cadastur --file x.csv`, `--dry-run`).
- `supabase/national-layer.sql`: tabelas `establishments`, `establishment_history`, `establishment_links`, `price_observations`, `availability_observations`, `source_sync_runs`, `source_state`, com RLS (leitura pública, **sem** política de escrita).
- `.github/workflows/sync-national-data.yml`: execução agendada (segundas) e manual, fora do app.
- `src/services/datalayer/__tests__/datalayer.test.js`: 35 testes, sem rede.

O app (telas) **ainda não lê** essas tabelas: isso é uma fase seguinte.

## Como validar (você)

1. Supabase > SQL Editor: rodar `supabase/national-layer.sql` (idempotente).
2. GitHub > Settings > Secrets and variables > Actions: criar os segredos `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (a chave de serviço fica **só** aqui) e, opcionalmente, a variável `OVERPASS_CONTACT` (e-mail de contato para o servidor público).
3. Actions > "Sincronizar dados nacionais" > Run workflow com `uf = SC` e `dry_run = true`: confere a conexão com a Overpass sem gravar. Depois com `dry_run = false`.
4. Conferir em `source_sync_runs` e `source_state` o resultado e a saúde.

## Limites e riscos conhecidos

- A Overpass pública tem política de uso justo: o runner espera 5 s entre consultas e recua em 429/504. UFs grandes podem estourar o tempo; nesse caso, usar `municipio` ou caixa geográfica.
- OSM `last_verified_at` fica vazio de propósito: a data de edição no OSM não prova que o local está aberto (ela vai em `extra.osm_last_edit`).
- Cadastur: sem coordenadas (só município/UF). Categorias sem equivalente (por exemplo "resort") são rejeitadas e contadas.
- Licença ODbL (OSM) exige atribuição e pode exigir compartilhar bases derivadas: revisar antes de divulgar.
- Custos: GitHub Actions (grátis em repositório dentro da cota), Supabase (grátis até o limite do plano; o volume do Brasil inteiro pode chegar a dezenas de milhares de linhas), Overpass pública (grátis, uso moderado).

## Próximas etapas

Fase 3 (Mobility Database, Transitland e GTFS existentes), Fase 4 (ANTT), Fase 5 (painel de saúde na tela Fontes de dados e leitura das tabelas pelo app) e Fase 6 (adaptadores comerciais desligados).
