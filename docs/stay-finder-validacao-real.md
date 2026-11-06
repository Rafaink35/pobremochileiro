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

## Validação do Overpass no Windows do dono (05/11/2026, horário local) — REAL

> **Nota sobre as datas:** os três JSON foram gravados no Windows do dono em 05/11/2026 (Lisboa 22:30:19, Santiago 22:31:22, Tóquio 22:32:20, horário local, conforme `CreationTime`/`LastWriteTime` informados pelo dono). O registro da sessão recebeu os resultados em 06/11/2026 (01:34 UTC). As consultas do sandbox (Nominatim e Wikivoyage) seguem datadas em 06/11/2026 (UTC).

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

### Resultado da suíte de testes (registro; não equivale a 100% aprovado)
- **Commit `72fc13e` (P1, P4 e P6): `npm test` = 474 de 475 testes passam (1 falha).** A falha é `server/__tests__/server.test.js > não sai da pasta do site (path traversal)`, em uma pasta local `server/` **fora do repositório** (ignorada pelo git), que já falhava antes das mudanças. Não é classificado como 100% aprovado.
- Os 37 arquivos de `src` passaram por inteiro (467 de 467) nesse commit.
- Correção do P4 (demonstração com relógio simulado): resultado da suíte registrado na mensagem do commit e no relatório de entrega; o teste de path traversal da pasta local continua falhando, pelo mesmo motivo.

---

## Análise local dos JSON reais do Overpass (REAL, feita pelo dono no Windows; dados coletados em 05/11/2026, resultados recebidos em 06/11/2026 UTC)

Contagens informadas pelo dono por arquivo (roteiro PowerShell de análise; os JSON ficaram só no computador do dono):

| | Lisboa | Santiago | Tóquio | Total |
|---|---:|---:|---:|---:|
| Elementos | 652 | 319 | 1.311 | 2.282 |
| Com nome | 596 (91,4%) | 299 (93,7%) | 1.204 (91,8%) | 2.099 |
| **Sem nome** | 56 (8,6%) | 20 (6,3%) | 107 (8,2%) | 183 |
| Com site | 347 (53%) | 64 (20%) | 442 (34%) | 853 |
| Com telefone | 319 (49%) | 57 (18%) | 299 (23%) | 675 |
| Com cidade (`addr:city`) | 321 (49%) | 146 (46%) | 266 (20%) | 733 |
| Com estrelas | 179 (27%) | 12 (4%) | 57 (4%) | 248 |
| Com horário | 25 | 8 | 35 | 68 |
| Grupos de nomes repetidos | 14 | 9 | 40 | 63 |
| `fee` | 3 | 0 | 2 | 5 |
| `charge` | 0 | 0 | 0 | 0 |

Leituras e decisões que decorrem dos números:
- **Volume:** de 319 a 1.311 locais por destino. Sem limite, a resposta chegava a ~1,65 MB e a tela desenhava 1.311 itens. Decisão: 100 no total, mais 50 por clique, teto de 500 (P2).
- **Sem nome:** 6% a 9% dos objetos. Decisão: preservar no processamento, não listar, contar (P3).
- **Nomes repetidos (63 grupos):** não são duplicidade confirmada. Decisão: só agrupar com sinal forte (mesmo nome **e** mesmo lugar, mesmo site ou telefone); o mesmo nome em lugares diferentes continua como locais separados.
- **Preço:** nenhum `charge` nos 2.282 registros e `fee` em 5: com dados só do OSM, **não há preço verificável** e o ranking de preço fica vazio. O aplicativo não gera preço a partir de `fee`.
- **`addr:city` baixo (20% a 49%):** não é confiável como filtro de município; a localização vem das coordenadas.
- **Estrelas:** só quando a tag existe (27% em Lisboa); nunca são deduzidas.

Demonstração da ferramenta com dados **SIMULADOS** (arquivos inventados, que só imitam as contagens acima; **não são dados reais**), para medir o efeito do limite: com limite 100, Lisboa 589 locais com nome → 100 exibidos (56 sem nome ocultados, resposta ≈ 139 KB); Santiago 294 → 100 (20 ocultados, ≈ 130 KB); Tóquio 1.184 → 100 (107 ocultados, ≈ 149 KB). Processamento de 8 a 44 ms por arquivo. Nesses arquivos simulados, nomes repetidos em lugares distintos foram mantidos separados e os do mesmo lugar foram agrupados. Os valores reais só podem ser medidos rodando a ferramenta sobre os JSON reais.

---

## Validação final com os JSON reais (analisador local, REAL; dados de 05/11/2026, resultados recebidos em 06/11/2026 UTC)

Esta seção registra o resultado de `scripts/analyze-overpass-json.mjs` rodado pelo dono sobre os três JSON reais do Overpass. **Os arquivos JSON não estão no repositório e não foram copiados para ele** (licença ODbL). Aqui há só contagens e métricas agregadas.

### Metodologia
- Código: commit `f5498b1`; Node v24.19.0 no Windows do dono.
- Ferramenta: lê só o JSON local, bloqueia rede (`fetch` e `net.Socket.connect`), não grava nada e não transmite dados. Usa a mesma função de montagem da busca (`assembleResults`): normalização, classificação, agrupamento (`groupDuplicates`), classificação de preço e seleção para exibição.
- Centros: Lisboa 38.7078,-9.1366; Santiago -33.4377,-70.6511; Tóquio 35.6769,139.7639. Limites testados: 100, 150 e 200. Três execuções, resultados idênticos.
- Os três arquivos tinham BOM UTF-8 (padrão do PowerShell 5.1). O BOM é ignorado só na leitura; o arquivo original não é alterado.
- Integridade: o SHA-256 dos três JSON no passo A (antes) e no passo D (depois) é **idêntico**, ou seja, os originais não foram modificados:
  - Lisboa.json `728A5D08F4EA5BC7BEF1FA7F4C757BA44E11F2FBD623E0655E81AAAC2E4E8F16`
  - Santiago.json `0018F27812FB3957FE6D6CB7E16B11BCB52B378DA88C7BCA5F9417287B80C094`
  - Toquio.json `CDBAB27E302061366E692634A9C2DA64374B4AACB564DE6667ECCFA0947D0607`
- O algoritmo de deduplicação e as funcionalidades do Stay Finder não foram alterados para esta validação.

### Contagens
| | Lisboa | Santiago | Tóquio |
|---|---:|---:|---:|
| Elementos recebidos | 652 | 319 | 1.311 |
| Válidos (rejeitados) | 652 (0) | 319 (0) | 1.311 (0) |
| node / way / relation | 482 / 164 / 6 | 187 / 131 / 1 | 887 / 415 / 9 |
| Sem nome | 56 | 20 | 107 |
| Locais após agrupar | 626 | 317 | 1.285 |
| Exibíveis (com nome, após agrupar) | 570 | 297 | 1.178 |
| Hotel / pousada / hostel / camping | 389 / 144 / 114 / 5 | 235 / 13 / 71 / 0 | 1.082 / 76 / 146 / 7 |
| `tourism` bruto | hotel 388, guest_house 144, hostel 114, caravan_site 3, camp_site 2, motel 1 | hotel 219, hostel 71, motel 16, guest_house 13 | hotel 1.071, hostel 146, guest_house 76, motel 11, camp_site 6, caravan_site 1 |
| Com site / telefone / cidade / estrelas / horário | 347 / 319 / 321 / 179 / 25 | 64 / 57 / 146 / 12 / 8 | 443 / 299 / 266 / 57 / 35 |

### Exibição (limite)
| Limite | Lisboa (restantes) | Santiago (restantes) | Tóquio (restantes) |
|---|---:|---:|---:|
| 100 | 100 (470) | 100 (197) | 100 (1.078) |
| 150 | 150 (420) | 150 (147) | 150 (1.028) |
| 200 | 200 (370) | 200 (97) | 200 (978) |

Tamanho da resposta (100 / 150 / 200): Lisboa 142 / 208 / 274 KB; Santiago 133 / 196 / 260 KB; Tóquio 152 / 216 / 280 KB. Processamento: 150–275 ms (Lisboa), 51–88 ms (Santiago), 200–260 ms (Tóquio). Registros sem nome ficam preservados no processamento, não aparecem na lista principal e são contados.

### Agrupamento e possíveis duplicatas
| | Lisboa | Santiago | Tóquio |
|---|---:|---:|---:|
| Duplicatas confirmadas (agrupadas por sinal forte) | 26 (10 pares, 4 trios, 2 grupos de 5) | 2 (pares) | 26 (pares) |
| Possíveis duplicatas (só marcadas, nunca agrupadas nem ocultadas) | 19 | 20 | 179 (~14%) |
| Grupos de nome repetido (normalizado) / elementos | 14 / 31 | 9 / 18 | 56 / 184 |
| Desses, mantidos separados / totalmente agrupados | 3 / 11 | 7 / 2 | 49 / 7 |

- Registros sem nome nunca foram unidos a registros com nome.
- Nome repetido não é duplicidade: só há agrupamento com sinal forte (mesma fonte e id; mesma categoria, nome e ≤150 m; mesmo site próprio ou telefone ≤300 m).
- Pontos a revisar (sem mudar o algoritmo agora): os 2 grupos de 5 e os 4 trios de Lisboa (mesmo nome a ≤150 m pode ser o mesmo prédio ou unidades distintas); as 179 possíveis duplicatas de Tóquio provavelmente têm ruído em nomes japoneses curtos, mas só marcam e não escondem nada.
- Diferenças em relação à contagem bruta do PowerShell, esperadas: sites em Tóquio 443 contra 442 (o analisador também conta `url`); grupos de nomes repetidos em Tóquio 56 contra 40 (o analisador normaliza acentos, pontuação e escrita; o PowerShell só comparava minúsculas). Total, sem nome, telefone, cidade, estrelas, horário, `fee` e `charge` coincidem.

### Preços
**Nenhum preço foi verificável nos dados OSM analisados.**
- `charge` e `check_date:charge`: 0 nas três cidades.
- `fee` (apenas observação, nunca preço, gratuidade, zero, filtro ou ranking): Lisboa no=2, yes=1; Santiago nenhum; Tóquio no=1, yes=1.
- Classe de preço `unavailable` em todos os exibíveis (570 / 297 / 1.178); ranking de preço vazio (0).
- Outras chaves com aparência de preço, ignoradas por não serem preço de hospedagem: `internet_access:fee` (149 / 24 / 118), `toilets:fee` (1 / 1 / 0), `breakfast:charge` 1 e `breakfast:fee` 1 (só Tóquio).
- Nenhum preço, disponibilidade, estrela ou avaliação foi inventado.

### Limitações
- Três destinos, um instante no tempo; Buenos Aires e Paraty não foram revalidados no Overpass (falharam com 502 no teste do dono).
- Os JSON são instantâneos do OSM gravados em 05/11/2026 (horário local do dono); a cobertura varia por cidade.
- Sem preço verificável nos dados OSM, o ranking de preço depende de outras fontes (publicadas, comunidade) que não entraram nesta medição.
- `addr:city` é pouco preenchido (20% a 49%); a localização vem das coordenadas.
- A avaliação de duplicatas é estatística (contagens e agrupamentos), sem conferência manual item a item.
- O limite público do Overpass é de ordem de ~100 consultas por dia; as ferramentas de chat `search_campings` e `search_lodging` ainda consultam o Overpass diretamente no servidor.
