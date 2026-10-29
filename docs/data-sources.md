# Fontes de dados de transporte

Estado em **28/10/2026**. Todas as fontes abaixo foram **pesquisadas na web**; durante o desenvolvimento o ambiente
não conseguiu abrir os sites oficiais (rede restrita), então **nenhuma conexão ou conjunto de dados foi validado**.
Licenças e URLs de download precisam ser confirmados nas páginas oficiais antes de qualquer uso.

Legenda de estado: **Preparada** = interface pronta, sem fonte validada · **Investigada** = só pesquisa ·
**Sem fonte atual** = nada oficial e atual encontrado.

| Fonte | URL oficial | Formato | Licença (informada) | Cobertura | Atualização | Acesso | Estado |
|---|---|---|---|---|---|---|---|
| transport.data.gouv.fr | https://transport.data.gouv.fr/ | GTFS, GTFS-RT, NeTEx | Varia por conjunto (Licence Ouverte; ODbL em alguns) | França | Por conjunto | Download por conjunto; API de listagem anunciada, endpoint não confirmado | Investigada |
| Transport Canberra | https://www.transport.act.gov.au/contact-us/information-for-developers | GTFS, GTFS-RT | CC BY (página de desenvolvedores); "não especificada" em registros antigos de portais | Canberra (ônibus, metrô leve) | Feeds antigos descontinuados | Página de desenvolvedores; URL atual a confirmar | Investigada |
| ODPT (Tóquio) | https://tokyochallenge.odpt.org/ | API ODPT (JSON-LD) | Termos próprios, não confirmados | Região de Tóquio | Desafio 2019-2020 encerrado | Chave de API por cadastro | Investigada |
| Eurolines / Isilines | https://data.gouv.fr/en/datasets/horaires-theoriques-du-reseau-europeen-eurolines-isilines-gtfs | GTFS | ODbL | Rede europeia de ônibus | Última: maio de 2019 | Download na ficha | Sem fonte atual |
| GTFS ônibus do Rio (data.rio / SMTR) | https://community.openstreetmap.org/t/gtfs-dos-onibus-do-rio-de-janeiro/142895 | GTFS | CC BY citada em discussão pública; confirmar | Município do Rio | A confirmar | Portal data.rio | Investigada |
| SPTrans (São Paulo) | https://www.sptrans.com.br/desenvolvedores/ | GTFS | Não confirmada | Município de São Paulo | A confirmar | Cadastro (a confirmar) | Investigada |
| OpenStreetMap (Overpass) | https://www.openstreetmap.org/copyright | Overpass JSON | ODbL 1.0 | Mundial (mapeamento voluntário) | Contínua, irregular | API pública, uso justo | Preparada (testada só com respostas simuladas) |
| Cadastro próprio de work exchange | supabase/schema.sql | Tabela Supabase | Termos a definir | Só o aprovado | Pela moderação | Requer Supabase | Preparada |
| OpenTripPlanner | https://www.opentripplanner.org/ | Motor de roteamento (GTFS + OSM; API GraphQL) | Software livre | Depende dos dados carregados | n/a | Serviço próprio a instalar | Preparada |

## Observações

- A lista de operadores do Rome2Rio **não** é lista de parceiros do Pobre Mochileiro e não foi copiada.
- Para a França, a lista de autoridades e operadores locais deve ser explorada **pelo catálogo**, e não por integrações
  individuais: primeiro confirmar quais conjuntos têm GTFS acessível, licença e área de cobertura.
- Não há evidência de que fontes europeias ou asiáticas cubram o Brasil. A primeira cobertura útil provavelmente virá
  de GTFS brasileiros (Rio, São Paulo, outros municípios e operadores), cada um com licença própria.
- Licenças ODbL podem exigir atribuição e compartilhamento de bases derivadas. O código marca esses casos como
  "revisar antes de publicar" e **não** aplica uma interpretação jurídica genérica.
- Os dados desta tabela vivem em `src/services/transport/sourceMetadata.js` (`INVESTIGATED_SOURCES`) e aparecem na tela
  **Fontes de dados**. Atualize os dois juntos.
