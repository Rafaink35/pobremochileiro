# Stay Finder — validação controlada com fontes reais (06/11/2026)

Execução do script `scripts/validate-stays.mjs` (consultas em série, limites de cada serviço, User-Agent identificado pelo URL do projeto, sem dado pessoal).
Resultados completos em JSON ficaram **fora do repositório** (pasta de trabalho da sessão). Este arquivo separa **dados reais**, **snapshots reais usados em testes** e **fixtures/simulações**.

## Legenda dos dados
| Tipo | Onde | O que é |
|---|---|---|
| **REAL** | tabelas abaixo | Resposta de serviço público, consultada em 06/11/2026 (UTC) |
| **Snapshot real** | `src/services/stays/__tests__/fixtures/real-nominatim-snapshots.js` | Respostas reais do Nominatim, abreviadas, usadas para impedir regressão |
| **Fixture/simulação** | `src/services/stays/__tests__/fixtures/index.js` | Dados **inventados** (nomes e preços fictícios), só em testes; nunca em produção |

## Resultado por destino e fonte (REAL)
Raio e centro vêm do Nominatim. Horários em UTC (início → fim da consulta da execução final, `validacao-real-3`).

| Destino | Fonte | Respondeu? | Registros retornados | Registros válidos | Categorias | Preços verificáveis | Sem preço | Normalização / duplicidade | Consulta (UTC) | Limitações |
|---|---|---|---|---|---|---|---|---|---|---|
| **Lisboa** (38,7078, −9,1366; 8,5 km) | Nominatim | Sim | 2 (cidade e distrito homônimo) | 1 | n/a | n/a | n/a | O distrito "Lisboa" (`county`) escondia a cidade e gerava falsa ambiguidade → **corrigido** | 01:17:42 | — |
| | OpenStreetMap/Overpass | **Não** (`ECONNRESET`) | 0 | 0 | — | — | — | — | 01:17:42–01:18:08 | Servidor fecha a conexão após o handshake TLS (ver abaixo) |
| | Wikivoyage | Sim | 0 listagens `sleep` na página "Lisbon" | 0 | — | 0 | 0 | — | 01:18:00 | Página principal sem listagens de hospedagem |
| | Cadastur | Não configurada | — | — | — | — | — | — | — | Só Brasil; exige `CADASTUR_CSV_URL` |
| **Buenos Aires** (−34,6096, −58,3888; 13,4 km) | Nominatim | Sim | 3 (cidade, província, condado da Costa Rica) | 1 | n/a | n/a | n/a | Província e condado estrangeiro de importância bem menor não tornam ambíguo | 01:18:48 | — |
| | Overpass | **Não** (tempo esgotado, 25 s) | 0 | 0 | — | — | — | — | 01:18:48–01:19:13 | idem |
| | Wikivoyage | Sim | 0 listagens `sleep` | 0 | — | 0 | 0 | — | 01:19:00 | idem Lisboa |
| **Santiago** (−33,4377, −70,6511; 23 km) | Nominatim | Sim | 5 (Costa Rica, Chile, Cuba, República Dominicana, Brasil) | 1 após escolha do Chile | n/a | n/a | n/a | **Empate real** de importância (0,729) entre Chile e Costa Rica: pede escolha | 01:19:53 | Escolha feita pelo script (Chile) |
| | Overpass | **Não** (tempo esgotado) | 0 | 0 | — | — | — | — | 01:19:53–01:20:19 | idem |
| | Wikivoyage | Sim | 0 listagens `sleep` | 0 | — | 0 | 0 | — | 01:20:00 | idem Lisboa |
| **Paraty** (−23,2196, −44,7154; 25 km, limite) | Nominatim | Sim | 4 | 1 | n/a | n/a | n/a | O resultado de Araquari (SC) aparecia por nome alternativo com importância igual: ficou de fora por não ser o nome do lugar | 01:20:59 | — |
| | Overpass | **Não** (fonte em pausa após 3 falhas seguidas) | 0 | 0 | — | — | — | — | 01:20:59 | idem |
| | Wikivoyage | Sim | **15** listagens `sleep` | **3** (as com coordenadas) | 3 "não classificadas" | **0** | 3 | 12 sem coordenadas; 0 duplicados | 01:21:01 | Ver preços abaixo |
| **Tóquio** (35,6769, 139,7639; 15 km) | Nominatim | Sim | 1 (província "Tóquio") | 1 | n/a | n/a | n/a | Área administrativa ampla: pede confirmação de pesquisa a 15 km do ponto de referência | 01:21:41 | Não cobre a área inteira |
| | Overpass | **Não** (pausa) | 0 | 0 | — | — | — | — | 01:21:41 | idem |
| | Wikivoyage | Sim | 0 listagens `sleep` | 0 | — | 0 | 0 | — | 01:22:00 | idem Lisboa |

Fontes que **responderam de fato**: Nominatim (5/5) e Wikivoyage (5/5 na execução final). **Overpass: 0/5.** Cadastur: não configurada (não consultada). Cadastro próprio: não ativado.

### Falhas registradas (REAL)
- **Overpass (`overpass-api.de`)**: nas 3 execuções, a conexão é aberta pelo proxy da sessão e fechada logo após o handshake (`tunnel closed (code 1006) after 8s; 517 B sent, 39 B received`), ou fica sem resposta até o tempo limite de 25 s. `curl` deu `Connection reset by peer`. Causa não determinável daqui (bloqueio do servidor ao IP de saída ou falha do túnel). **Nenhum dado do OpenStreetMap foi obtido.**
- **Espelhos do Overpass** (`overpass.private.coffee`, antiga `overpass.kumi.systems`): sem resposta em 80 s. Os outros espelhos globais gratuitos da página do OSM não foram tentados.
- **Wikivoyage**: respondeu **429 "You are making too many requests"** quando fiz ~12 consultas em poucos segundos durante o diagnóstico, e de novo a uma 2ª consulta 20 s após a 1ª (01:13:27). Com 40 s de intervalo, as 5 consultas foram aceitas. O limite é do lado da Wikimedia.
- **Comportamento do sistema nessas falhas** (validado): status `partial`, fonte marcada `failed` com o motivo, interruptor abre após 3 falhas seguidas, nenhum resultado inventado.

### Exemplos reais retornados (REAL)
Nominatim (© OpenStreetMap contributors, ODbL): Lisboa https://www.openstreetmap.org/relation/5400890 · Buenos Aires https://www.openstreetmap.org/relation/1224652 · Santiago (Chile) https://www.openstreetmap.org/node/50016356 · Paraty https://www.openstreetmap.org/relation/1277591 · Tóquio https://www.openstreetmap.org/relation/1543125.

Wikivoyage, página **Paraty** (https://en.wikivoyage.org/wiki/Paraty, "Wikivoyage contributors", CC BY-SA 4.0), as 3 listagens de hospedagem com coordenadas:

| Nome | Coordenadas | Texto do preço na fonte | Data do preço (`lastedit`) | Classificação |
|---|---|---|---|---|
| Pousada Aquarium (https://aquariumparaty.com.br/) | −23,21314, −44,73596 | `R$192` | **ausente** | Preço indisponível (sem data, a idade é desconhecida; o texto original fica visível) |
| Eliconial Paraty Pousada (http://eliconial.com) | −23,20384, −44,72367 | `R$160-230` | ausente | Preço indisponível (faixa é ambígua) |
| The Eco-farm (http://www.eco-farmbrazil.com/) | −23,2166, −44,71946 | (vazio) | ausente | Sem preço |

Textos de preço reais da mesma página (listagens sem coordenadas): `From R$300 including breakfast`, `R$200-340 (check out high/low season prices)`, `From R$115`. São **mínimos, faixas ou condicionados**: o leitor recusa todos como preço.

## Preços: o que a evidência real mostra (item D)
- Wikivoyage/Paraty: das 15 listagens, **10 têm texto de preço, só 3 têm coordenadas e só 2 têm `lastedit`**. Resultado: **0 preços verificáveis** entre os locais exibidos. Dado completo (valor + moeda + unidade por noite + data) **não foi encontrado em nenhum registro real**.
- Unidade "por pessoa/quarto, por noite" não apareceu escrita em nenhum texto real; só o valor e a moeda (`R$192`).
- A data da revisão da página do Wikivoyage **não** é usada como data do preço (qualquer edição na página a atualiza): corrigido nesta validação.
- Texto com "From", "até", "desde", faixa, "including..." deixou de virar preço (corrigido; testes com os textos reais).
- Nenhuma estimativa foi gerada; nenhum preço incomparável entrou em ranking (ranking = 0 em todos os destinos).
- **Preços do OpenStreetMap (`charge`) não puderam ser validados**: o Overpass não respondeu.

## Problemas encontrados e correções (nesta etapa)
1. **Resolvedor**: falsa ambiguidade em Lisboa, Buenos Aires e Paraty (dados reais); província "Tóquio" recusada. Corrigido: nomes alternativos ficam atrás, áreas administrativas homônimas são descartadas, ambiguidade só com importâncias comparáveis (≥ 75%); áreas administrativas amplas pedem confirmação de pesquisa a 15 km do ponto de referência; país/continente continuam recusados.
2. **Categoria por palavra no nome** (Wikivoyage): removida. Registros viram "não classificados"; só ganham categoria se forem o mesmo local de um registro com tag estruturada.
3. **Data do preço**: sem `lastedit` o preço fica indisponível.
4. **Texto de preço ambíguo**: qualquer palavra além de valor, moeda e unidade invalida a leitura.
5. **Fallback do navegador**: removido. Nenhuma tela do navegador consulta Overpass diretamente (a tela de Hospedagem e o explorador de rotas usam `/api/stays`).
6. **Atribuição do Nominatim** passou a aparecer na tela e na resposta; licença do Wikivoyage atualizada para CC BY-SA 4.0 (conteúdo antigo pode estar em 3.0).
7. Diagnóstico de falha mais claro (`ECONNRESET`, `tempo esgotado`, pausa).

## Pendências e riscos
- **Overpass/OSM sem validação real**: é a fonte principal e continua só testada com respostas simuladas. Plano: rodar `scripts/validate-stays.mjs` (ou o roteiro PowerShell abaixo) de uma rede que alcance o Overpass.
- **Wikivoyage**: cobertura real baixa (grandes cidades sem listagens de hospedagem na página principal; locais sem coordenadas ou sem data). Útil como complemento, não como base de preço.
- **Servidor de chat** (`services/roteiro/tools.js`): as ferramentas `search_campings` e `search_lodging` ainda consultam o Overpass diretamente **no servidor** (não pelo `/api/stays`). Não é o navegador, mas não compartilha cache nem limite com o Stay Finder. Centralizar é a próxima melhoria.
- **Escala**: a política da instância pública do Overpass (menos de ~100 consultas/dia para uso regular) e do Nominatim (1 req/s, cache) exige instância própria antes de divulgação ampla.
- Cadastur: nunca validado com o arquivo real.

---

## Validação do Overpass no Windows do dono (06/11/2026) — REAL

O ambiente de desenvolvimento não alcança o Overpass (seção anterior). O dono rodou o roteiro `overpass-teste.ps1` (5 consultas, 1 a cada 10 s, uma por destino, as mesmas consultas por centro e raio do Stay Finder) no próprio computador Windows. **Esse teste usou o roteiro PowerShell, não o código do aplicativo.** Horário de cada consulta: não informado. Os cinco JSON ficaram só no computador do dono (`Documents\PobreMochileiro-Validacao`) e **não estão no repositório** (uma cópia de dados do OSM seria um banco derivado, com compartilhamento pela mesma licença, ODbL).

| Destino | Resultado | Elementos | Tipos (`tourism`) |
|---|---|---:|---|
| Lisboa | OK | 652 | hotel 388, guest_house 144, hostel 114, caravan_site 3, camp_site 2, motel 1 |
| Buenos Aires | HTTP 502 | — | — |
| Santiago | OK | 319 | hotel 219, hostel 71, motel 16, guest_house 13 |
| Paraty | HTTP 502 | — | — |
| Tóquio | OK | 1.311 | hotel 1.071, hostel 146, guest_house 76, motel 11, camp_site 6, caravan_site 1 |

Total: 2.282 elementos reais em três destinos.

Observações do dono, registradas como evidência:
- **Nenhum registro tinha a tag `charge`**: não há preço utilizável nesses dados.
- A tag `fee` apareceu em **cinco** registros no total. **Não é preço de diária**: o aplicativo a guarda só como observação (`feeTag`) e nunca a transforma em preço, gratuidade, custo zero, filtro ou critério de ranking.
- Os **HTTP 502** de Buenos Aires e Paraty são erro do servidor do Overpass (Paraty é uma consulta pequena, e Tóquio, a maior, funcionou): falha transitória do lado do serviço. O Stay Finder agora tenta no máximo mais uma vez, respeitando `Retry-After`, e mostra "ocupado ou indisponível (HTTP 502)".
- Diferença entre ambientes: o Overpass responde na rede residencial do dono e não responde do ambiente de desenvolvimento (IP de saída de datacenter). Causa exata não determinada; provável filtro de IP de nuvem no servidor.
- **Os números acima são evidência de consultas reais, não dados do aplicativo**: não estão fixos em nenhum código ou teste (um teste automático verifica isso) e o pacote de produção é verificado por `npm run build:verify`.

Pendente: a análise local dos JSON (contagens de nome, site, telefone, cidade, estrelas, horário, tipos de elemento, nomes repetidos e chaves de preço) alimenta as decisões de limite de resultados (P2), tratamento de registros sem nome (P3) e ferramenta de análise (P5). Nada disso foi definido ainda.

### Regras de preço consolidadas nesta validação
- Preço do OpenStreetMap só vale com `charge` (valor e moeda) e data de verificação do **próprio preço** (`check_date:charge`). A data de edição do objeto no OSM **não** é a data do preço.
- `fee` nunca é preço.
