# Stay Finder (Etapa 2): pesquisa de hospedagens com fontes verificáveis

## Em uma frase
Pesquisa por destino (qualquer país) → fontes públicas independentes → normalização → deduplicação conservadora → classificação de
preço → ranking só entre preços verificáveis. **Nada é inventado**: sem preço, o local aparece como "Preço indisponível"; sem
fonte, a tela diz isso. Disponibilidade nunca é presumida.

## Arquitetura
```
Stays.jsx ── fetchStays (src/api/stays.js) ──▶ /api/stays (netlify/functions/stays.mjs, rota em server.mjs)
                                                  │  limite de 20 consultas/min por IP
                                                  ▼
   createStaySearch (src/services/stays/search.js)
     1. destination.js   texto/coordenadas → centro + raio (Nominatim, no servidor); ambíguo → devolve candidatos
     2. sources/*.js     fontes em paralelo, cada uma isolada (cache 24 h, interruptor, tempo limite)
     3. dedupe.js        grupos conservadores, sem misturar campos entre licenças
     4. price.js         classificação (confirmado 30 d / publicado 180 d / desatualizado / indisponível)
     5. rank.js          até 3 melhores entre preços verificáveis e comparáveis; sem preço nunca ranqueia
```
Sem banco: cache em memória no processo do servidor. Sem chaves e sem alterar o Supabase.
Se `/api/stays` não existir (ex.: `npm run dev` sem o `server.mjs`), a tela usa a busca direta antiga para camping, hostel e hotel.

## Fontes
| Fonte | Papel | Licença | Estado real |
|---|---|---|---|
| OpenStreetMap (Overpass) | Principal: localização, tipo, site, telefone; preço só pela tag `charge` | ODbL 1.0 | Código testado com respostas **simuladas**; **não validado com a rede real** |
| Nominatim | Resolve o destino (só servidor, 1 consulta/s, cache 24 h) | Dados OSM (ODbL); política de uso a confirmar | Testado com respostas simuladas |
| Wikivoyage | Candidata: listagens "Sleep" da página do destino | CC BY-SA 3.0 (confirmar por edição) | Testada com wikitexto **fictício**; não validada com a rede real |
| Cadastur | Só Brasil; complementar (selo "cadastrado"); sem preço nem coordenadas | A confirmar | Exige `CADASTUR_CSV_URL`; formato real **nunca validado**; sem a variável aparece "não configurada" |
| Cadastro próprio (comunidade) | Arquitetura pronta, **sem dados**: ecovilas, hospedagem colaborativa, preço confirmado | Termos próprios (a definir) | "Não configurada" até a fase com banco e moderação |
| Wikidata | **Não implementada** | CC0 | Sem rede para validar consultas e identificadores de classe; deixada para a próxima fase |

### Categorias
Camping (`camp_site`, `caravan_site`), hostel (`hostel`), pousada (`guest_house`) e hotel (`hotel`, `motel`) vêm da tag `tourism` do OSM.
**Ecovila e hospedagem colaborativa não têm marcação confiável em fonte aberta**: não são inferidas por palavra no nome; a tela
explica isso e oferece links de pesquisa (Global Ecovillage Network, Couchsurfing, Worldpackers...). Trabalho em troca e Au pair
continuam como estavam. No Wikivoyage a categoria só vale quando o nome do local traz a palavra (hostel, camping, pousada, hotel...).

## Preço
| Classe | Regra |
|---|---|
| Confirmado | Informado e verificado (moderação, com evidência e data); vale 30 dias |
| Publicado, não confirmado | Valor e moeda numa fonte aberta (tag `charge`, Wikivoyage); vale 180 dias |
| Desatualizado | Era confirmado ou publicado e o prazo (ou `validUntil`) venceu |
| Indisponível | Sem valor, moeda **e data de observação da fonte** |

A data de um preço do OSM é a da última edição do elemento (a idade real do preço é desconhecida). A unidade (por pessoa ou por
quarto, por noite) só vale se estiver escrita na fonte. Estimativa nunca é aceita. "Gratuito" (`fee=no`) é um valor publicado, sem unidade, e não entra no ranking.

## Ranking
Concorrem só preços confirmados ou publicados, dentro do prazo, comparáveis (mesma moeda e unidade por noite). 1 opção: mostra 1; 2: mostra 2;
3 ou mais: as 3 melhores. Empate: confirmado antes de publicado, preço observado mais recentemente, cadastro mais completo, nome.
A tela separa: **melhores preços verificados**, **com preço informado** (fora do ranking), **preço desatualizado** e **sem preço informado**.

## Deduplicação
Agrupa por: mesma origem; ou mesma categoria + nome idêntico (normalizado em qualquer alfabeto) + até 150 m; ou mesmo site próprio ou telefone + até 300 m;
ou, sem coordenadas (Cadastur), mesma categoria, nome e município. Nome parecido (≥ 0,6) a até 250 m só marca "possível duplicata". O registro principal
fornece os campos; as demais fontes ficam listadas com atribuição, e cada fonte mantém seus próprios preços. **Campos nunca são misturados entre fontes.**

## Falhas
Fontes independentes: uma falha não derruba a resposta (status `partial`, fonte marcada `failed`). Após o prazo de 24 h, se a fonte cair, usa a cópia anterior
(até 7 dias) e avisa (`stale`). Interruptor: 3 falhas seguidas pausam a fonte por 10 minutos. Tempo limite de 25 s por fonte. Destino ambíguo, amplo demais,
inexistente ou geocodificador fora do ar têm respostas próprias. Erros internos nunca devolvem detalhes.

## Licenças e obrigações (ODbL) — documentar antes de publicar bases derivadas
Isto não é parecer jurídico; revise com advogado antes de persistir ou distribuir dados.
- **Atribuição:** exibir "© OpenStreetMap contributors" com link para https://www.openstreetmap.org/copyright em qualquer lista ou detalhe que use dados do OSM (já exibida).
- **Obra produzida × banco derivado:** mostrar resultados na tela é uma *obra produzida* (basta atribuição). **Guardar ou distribuir uma base que combine OSM com outros dados**
  (por exemplo, a camada nacional no Supabase) pode ser um *banco de dados derivado*, que a ODbL exige oferecer sob a mesma licença (compartilhamento pela mesma licença).
- **Separação:** por isso cada registro guarda `source` e `license`; registros OSM ficam separáveis. Nunca misturar campos do OSM (ODbL) com Wikivoyage (CC BY-SA) ou
  Cadastur (licença a confirmar) num registro só.
- **Wikivoyage:** atribuição ("Wikivoyage contributors") e CC BY-SA 3.0 (compartilhamento pela mesma licença nas obras derivadas).
- **Serviços públicos:** Overpass e Nominatim pedem uso moderado, cache e identificação (User-Agent com contato). Confirme as políticas vigentes. Não use para coleta em massa.
- **Sem scraping:** nenhum site de reserva é raspado; Booking, Airbnb, Hostelworld, Park4Night, Hipcamp, Couchsurfing e Workaway aparecem só como links de pesquisa.

## Cadastro próprio com moderação (preparado, sem painel)
`submissions.js` define as regras: proposta de estabelecimento (consentimento, contato privado, categoria, localização) e de preço (valor, moeda, unidade por noite, data,
evidência). Preço "confirmado" exige evidência; a moderação aprova (confirmado vale 30 dias a partir da observação) ou rejeita (exige motivo); o contato nunca é público.
`sources/community.js` só lê registros **aprovados** de um carregador injetável. Esquema sugerido para a fase com banco (NÃO executado): tabelas `stay_submissions` e
`stay_price_submissions` com RLS (inserção por usuário autenticado, leitura pública só de `status = 'approved'`, moderação pelo painel).

## O que não foi feito nesta etapa
Persistência no Supabase (a camada nacional continua sem execução em produção), Wikidata, painel de moderação, validação com fontes reais (aguarda autorização), integração dos
resultados com o motor de descoberta da Etapa 1 (o planejador recebe os locais como antes, com o preço como referência).
Alteração em `supabase/national-layer.sql`: **apenas o arquivo** (tipos `ecovillage` e `collaborative`, `region` e país ISO) antes da primeira execução, que continua pendente.
