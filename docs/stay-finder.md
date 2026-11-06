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
| Wikivoyage | Candidata: listagens de hospedagem da página do destino | CC BY-SA 4.0 (conteúdo antigo pode estar em 3.0) | Ver relatório de validação real |
| Cadastur | Só Brasil; complementar (selo "cadastrado"); sem preço nem coordenadas | A confirmar | Exige `CADASTUR_CSV_URL`; formato real **nunca validado**; sem a variável aparece "não configurada" |
| Cadastro próprio (comunidade) | Arquitetura pronta, **sem dados**: ecovilas, hospedagem colaborativa, preço confirmado | Termos próprios (a definir) | "Não configurada" até a fase com banco e moderação |
| Wikidata | **Não implementada** | CC0 | Sem rede para validar consultas e identificadores de classe; deixada para a próxima fase |

### Categorias
Camping (`camp_site`, `caravan_site`), hostel (`hostel`), pousada (`guest_house`) e hotel (`hotel`, `motel`) vêm da tag `tourism` do OSM.
**Ecovila e hospedagem colaborativa não têm marcação confiável em fonte aberta**: não são inferidas por palavra no nome; a tela
explica isso e oferece links de pesquisa (Global Ecovillage Network, Couchsurfing, Worldpackers...). Trabalho em troca e Au pair
continuam como estavam. **A categoria nunca é deduzida de palavras no nome.** O Wikivoyage não traz o tipo do local: seus registros ficam "não classificados" e só ganham categoria se forem o mesmo local de um registro classificado por tag ou dado estruturado (OSM, Cadastur). Locais não classificados só aparecem sozinhos se a pessoa marcar "Incluir locais sem tipo identificado".

## Preço
| Classe | Regra |
|---|---|
| Confirmado | Informado e verificado (moderação, com evidência e data); vale 30 dias |
| Publicado, não confirmado | Valor e moeda numa fonte aberta (tag `charge`, Wikivoyage); vale 180 dias |
| Desatualizado | Era confirmado ou publicado e o prazo (ou `validUntil`) venceu |
| Indisponível | Sem valor, moeda **e data de observação da fonte** |

A data de um preço do OSM é a da tag `check_date:charge`, quando existir (a data de edição do objeto não vale). A unidade (por pessoa ou por
quarto, por noite) só vale se estiver escrita na fonte. Estimativa nunca é aceita.

**A tag `fee` do OpenStreetMap nunca é preço, gratuidade, custo zero, filtro nem critério de ranking.** Ela fica em `feeTag` (valor bruto) e a tela a mostra como observação ("a fonte marca fee=…; não é o preço da diária"). Não existe preço "gratuito" ou zero no Stay Finder, no planejador, no motor da Etapa 1 nem nas ferramentas de chat.

**A data de edição do objeto OSM não é a data do preço.** O preço do OSM só tem data quando a tag `check_date:charge` traz a verificação do preço; sem ela o preço é "indisponível" (o texto original continua visível).

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

## Políticas de uso e licenças — verificadas em 06/11/2026
Páginas consultadas nesta data (texto lido; as políticas podem mudar sem aviso). **Isto não é parecer jurídico nem declaração de conformidade definitiva**: revise com advogado antes de persistir ou distribuir dados.

| Serviço | Página consultada | Atribuição e licença | Restrições relevantes |
|---|---|---|---|
| Nominatim (OSMF) | https://operations.osmfoundation.org/policies/nominatim/ | Dados ODbL; exibir atribuição adequada ao meio | **Máx. 1 requisição/segundo**; User-Agent ou Referer que identifique o aplicativo (agente padrão de biblioteca não vale); uso disparado pelo usuário final é aceito com número moderado de usuários; o limite vale **por aplicativo**, somando todos os usuários; fazer proxy e **cache**; o app deve poder trocar de serviço a pedido; **proibido**: autocompletar, consultas sistemáticas (grade, listas completas), raspar a página de detalhes; consultas periódicas = geocodificação em massa (desencorajada); clientes que repetem a mesma consulta podem ser bloqueados; o serviço público não deve ser embutido como serviço genérico de geocodificação |
| Overpass (instância FOSSGIS, overpass-api.de) | https://wiki.openstreetmap.org/wiki/Overpass_API (seção "Public Overpass API instances") | Dados ODbL (atribuição OpenStreetMap) | Sem incomodar outros: **menos de 10.000 consultas/dia**, menos de 1 GB/dia; se usar **regularmente** (app ou site), dividir por 100 (**menos de ~100 consultas e ~10 MB por dia**), somando todos os usuários; User-Agent ou Referer que identifique o app; sem execução paralela de vários scripts; **uso comercial deve usar instância própria ou paga** |
| Overpass (private.coffee, antiga kumi.systems) | mesma página | idem | "Sem limite de taxa"; avisar antes de uso em larga escala |
| Wikimedia (API do Wikivoyage) | https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy e https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use | Conteúdo sob licença de Wikivoyage:Copyleft | User-Agent **descritivo com contato** (senão pode ser bloqueado sem aviso); usos automatizados que sobrecarreguem a API são proibidos; na prática a API respondeu "You are making too many requests" a uma rajada de ~12 consultas em poucos segundos (ver relatório) |
| Wikivoyage (conteúdo) | https://en.wikivoyage.org/wiki/Wikivoyage:Copyleft | Atribuição e **CC BY-SA 4.0** (a página afirma 4.0 ou compatível; conteúdo antigo pode estar em 3.0) | Compartilhamento pela mesma licença em obras derivadas; atribuir "Wikivoyage contributors" com link |
| OpenStreetMap (licença) | https://www.openstreetmap.org/copyright | Exibir "© OpenStreetMap contributors" e deixar claro que os dados estão sob a ODbL (link para a página de copyright) | Quem altera ou constrói sobre os dados só pode distribuir o resultado sob a mesma licença (compartilhamento pela mesma licença). Diretrizes de atribuição completas: não consultadas (osmfoundation.org não estava liberado) |

### Consequências para este projeto
- **Nominatim:** o servidor limita a 1 consulta/s e guarda cache de 24 h por texto. O cache é em memória: reiniciar o servidor perde o cache. O uso é disparado pela pesquisa de cada usuário (permitido para um número moderado de usuários); se o app crescer, usar instância própria. Não há autocompletar.
- **Overpass:** o uso regular de um app público pela instância FOSSGIS deve ficar abaixo de ~100 consultas/dia (soma de todos os usuários). O cache de 24 h por área ajuda, mas **não basta para escala**: antes de divulgar o app, usar instância própria, paga ou um espelho com autorização. O endpoint é configurável (`OVERPASS_URL`).
- **Navegador:** nenhuma consulta externa sai do navegador. A tela não faz mais a busca direta antiga no Overpass quando o servidor de pesquisa está indisponível.
- **ODbL:** exibir resultados na tela é uma *obra produzida* (atribuição); guardar ou distribuir uma base que combine OSM com outros dados (por exemplo, a camada nacional no Supabase) pode ser um *banco de dados derivado*, que a ODbL exige oferecer sob a mesma licença. Cada registro guarda `source` e `license`; registros do OSM ficam separáveis. Nunca misturar campos do OSM (ODbL) com Wikivoyage (CC BY-SA) ou Cadastur (licença a confirmar) num registro só.
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

## Validação real
Ver `docs/stay-finder-validacao-real.md` (06/11/2026): Nominatim e Wikivoyage responderam; o **Overpass não respondeu** de nenhuma tentativa do ambiente de desenvolvimento; preços verificáveis encontrados: 0.

## Política de tempo, novas tentativas e circuito (Overpass)
- **Um endpoint**: `OVERPASS_URL` (padrão `overpass-api.de`). Não há consulta de `/api/status` e **não há alternância automática entre espelhos**. Outra instância só entra se o operador a configurar e tiver autorização dela.
- **Tempo**: cada requisição ao Overpass tem 65 s; o prazo total da operação (incluindo esperas) é 70 s; o limite da fonte na pesquisa é 75 s. As demais fontes têm 25 s. Como as fontes rodam em paralelo, a pesquisa termina dentro do maior limite.
- **Novas tentativas**: erros 429, 502, 503, 504 e falhas de rede têm **no máximo 1 nova tentativa**, após no mínimo 30 s (entre 30 e 60 s). Se houver `Retry-After`, ele é respeitado (nunca se espera menos); se não couber no prazo total, não espera e devolve o erro na hora. Erros 4xx não são repetidos.
- **Circuito**: 3 falhas seguidas pausam a fonte por 10 minutos; durante a pausa, a fonte não é chamada.
- **Mensagem**: "OpenStreetMap (Overpass) ocupado ou indisponível (HTTP 502)", sem esconder o status.

## Verificação do pacote de produção
`npm run build:verify` (build + `scripts/check-bundle.mjs`) falha se a pasta `dist` contiver marcadores de fixtures, snapshots de validação ou frases do relatório de validação real. Testes automáticos impedem importar fixtures em código de produção e fixar números reais fora da documentação.
