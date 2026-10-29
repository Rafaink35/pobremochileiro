# Campings e trabalho em troca

## Fluxo
Hospedagem (`#hospedagem`) → busca por cidade/região → lista → detalhes (fonte, licença, data) →
**Como chegar** (usa os provedores de transporte) → **Adicionar ao planejador**.

## Campings (OpenStreetMap)
- Consulta Overpass: `tourism=camp_site` e `tourism=caravan_site` dentro das áreas administrativas com o nome digitado.
  Nomes ambíguos (ex.: cidade e estado com o mesmo nome) trazem as duas áreas.
- Endpoint padrão: `https://overpass-api.de/api/interpreter` (política de uso justo: não automatize consultas em massa).
- Tag ausente = desconhecido. `fee=no` vira "gratuito segundo a fonte"; `charge` só vira preço com moeda explícita
  (ex.: `30 BRL`) e a unidade (noite, pessoa, barraca) nunca é inferida.
- O OSM **não** informa se o local está aberto ou aceita hóspedes hoje; a tela diz isso.
- Cada registro guarda: id original (`node/123`), URL da fonte, licença ODbL 1.0, atribuição, **data de coleta** e a
  data da última edição no OSM.
- Deduplicação conservadora (`lodgingModel.js`): só une registros do mesmo tipo, com nome idêntico (normalizado) e a
  até 150 m, ou repetidos da mesma origem. Divergências viram `conflicts`; nada é sobrescrito em silêncio.
- Filtros: tipo, estado, município, comodidades, barracas, preço máximo, com site. Quem não tem a informação não passa
  em filtro positivo e é contado como "ocultado por falta de informação".

## Work exchange
- Tabela `work_exchange_opportunities` em `supabase/schema.sql`. Leitura pública **somente** de `status = 'approved'`;
  logado só cadastra como `pending`; aprovação e encerramento pela moderação no painel do Supabase.
- Aparece como disponível: aprovada, `end_date` não vencida, `spots` ≠ 0 (vagas não informadas não bloqueiam).
- **Não há tela de cadastro de anfitriões ainda** e nenhum registro vem por padrão: sem Supabase, a lista mostra
  que o recurso exige o banco. Não há anúncios de exemplo.

## Planejador
`draft.stays` guarda local, coordenadas, custo (`free`/`exchange`/`paid_reference`/`paid_unknown`/`unknown`),
transporte (`not_calculated` ou confirmado pelo usuário), datas, contato e fonte com data de verificação.
O total é **parcial** enquanto houver custo ou transporte pendente, e a tela lista o que falta.
O rascunho fica no `localStorage` do próprio navegador (um dispositivo, sem sincronização): não é persistência
multiusuário. Salvar planos por conta exige backend.

## Licenças
| Fonte | Licença | Atribuição | Obrigações a revisar |
|---|---|---|---|
| OpenStreetMap | ODbL 1.0 | © OpenStreetMap contributors (exibida nas listas e detalhes) | Atribuição; compartilhamento de bases derivadas se combinar e redistribuir uma base; não presuma que outra licença possa ser aplicada ao conjunto combinado |
| Oportunidades cadastradas | Termos próprios (a definir) | Nome do anfitrião | Consentimento do anfitrião para publicar; sem fotos de terceiros |

## O que ainda exige infraestrutura
- Projeto Supabase (tabela e moderação) para work exchange.
- Fonte de transporte configurada (GTFS autorizado importado ou OpenTripPlanner) para mostrar rotas.
- Para escala: cache/servidor próprio do Overpass ou extrato OSM, evitando consultas públicas repetidas.
