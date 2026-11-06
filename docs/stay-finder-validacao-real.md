# Stay Finder — validação controlada com fontes reais (06/11/2026)

Execução do script `scripts/validate-stays.mjs` (consultas em série, limites de cada serviço, User-Agent identificado pelo URL do projeto, sem dado pessoal).
Resultados completos em JSON ficaram **fora do repositório** (pasta de trabalho da sessão). Este arquivo separa **dados reais**, **snapshots reais usados em testes** e **fixtures/simulações**.

> **Correção (06/11/2026 UTC): os JSON do Overpass do Windows tinham o texto corrompido (UTF-8 interpretado como Latin-1).** Métricas que dependem de texto (nomes, deduplicação, nomes repetidos) calculadas **antes** da correção estavam afetadas. As seções abaixo indicam o que foi substituído, o que continua válido (contagens de elementos, de campos preenchidos e de preço, que não dependem da codificação) e o que ainda precisa ser recalculado. Veja a seção final "Auditoria de qualidade da deduplicação".

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

> **Aviso de codificação:** as contagens acima de elementos, nome presente/ausente, site, telefone, cidade, estrelas, horário, `fee` e `charge` dependem só de a tag existir e **não são afetadas** pela corrupção de texto. A linha **"Grupos de nomes repetidos" compara texto** e foi calculada sobre texto corrompido: **a recalcular** (não foi remedida com o texto corrigido).

Leituras e decisões que decorrem dos números:
- **Volume:** de 319 a 1.311 locais por destino. Sem limite, a resposta chegava a ~1,65 MB e a tela desenhava 1.311 itens. Decisão: 100 no total, mais 50 por clique, teto de 500 (P2).
- **Sem nome:** 6% a 9% dos objetos. Decisão: preservar no processamento, não listar, contar (P3).
- **Nomes repetidos (63 grupos, calculados sobre texto corrompido; a recalcular):** não são duplicidade confirmada. Decisão: só agrupar com sinal forte (mesmo nome **e** mesmo lugar, mesmo site ou telefone); o mesmo nome em lugares diferentes continua como locais separados.
- **Preço:** nenhum `charge` nos 2.282 registros e `fee` em 5: com dados só do OSM, **não há preço verificável** e o ranking de preço fica vazio. O aplicativo não gera preço a partir de `fee`.
- **`addr:city` baixo (20% a 49%):** não é confiável como filtro de município; a localização vem das coordenadas.
- **Estrelas:** só quando a tag existe (27% em Lisboa); nunca são deduzidas.

Demonstração da ferramenta com dados **SIMULADOS** (arquivos inventados, que só imitam as contagens acima; **não são dados reais**), para medir o efeito do limite: com limite 100, Lisboa 589 locais com nome → 100 exibidos (56 sem nome ocultados, resposta ≈ 139 KB); Santiago 294 → 100 (20 ocultados, ≈ 130 KB); Tóquio 1.184 → 100 (107 ocultados, ≈ 149 KB). Processamento de 8 a 44 ms por arquivo. Nesses arquivos simulados, nomes repetidos em lugares distintos foram mantidos separados e os do mesmo lugar foram agrupados. Os valores reais só podem ser medidos rodando a ferramenta sobre os JSON reais.

---

## Validação final com os JSON reais (analisador local, REAL; dados de 05/11/2026, resultados recebidos em 06/11/2026 UTC)

Esta seção registra o resultado de `scripts/analyze-overpass-json.mjs` rodado pelo dono sobre os três JSON reais do Overpass. **Os arquivos JSON não estão no repositório e não foram copiados para ele** (licença ODbL). Aqui há só contagens e métricas agregadas.

> **Aviso importante (texto corrompido):** o analisador leu os JSON como estavam, e os textos tinham acentos e caracteres japoneses corrompidos (UTF-8 lido como Latin-1, provavelmente pelo roteiro PowerShell 5.1 que baixou os dados). As métricas **dependentes de texto** desta seção foram **recalculadas** com o texto corrigido na auditoria (seção final) ou marcadas **"a recalcular"**. Os valores anteriores ficam registrados na tabela "O que mudou com a correção", abaixo, só para rastreabilidade: **não devem ser usados**.

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
| Locais após agrupar (texto corrigido) | 626 | 317 | **1.287** |
| Exibíveis (com nome, após agrupar) | 570 | 297 | a recalcular |
| Hotel / pousada / hostel / camping | 389 / 144 / 114 / 5 | 235 / 13 / 71 / 0 | 1.082 / 76 / 146 / 7 |
| `tourism` bruto | hotel 388, guest_house 144, hostel 114, caravan_site 3, camp_site 2, motel 1 | hotel 219, hostel 71, motel 16, guest_house 13 | hotel 1.071, hostel 146, guest_house 76, motel 11, camp_site 6, caravan_site 1 |
| Com site / telefone / cidade / estrelas / horário | 347 / 319 / 321 / 179 / 25 | 64 / 57 / 146 / 12 / 8 | 443 / 299 / 266 / 57 / 35 |

### Exibição (limite)
| Limite | Lisboa (restantes) | Santiago (restantes) | Tóquio (restantes) |
|---|---:|---:|---:|
| 100 | 100 (470) | 100 (197) | a recalcular |
| 150 | 150 (420) | 150 (147) | a recalcular |
| 200 | 200 (370) | 200 (97) | a recalcular |

Tamanho da resposta (100 / 150 / 200), **medido com texto corrompido, portanto superestimado, sobretudo em Tóquio (cada caractere japonês corrompido ocupa mais bytes)**: Lisboa 142 / 208 / 274 KB; Santiago 133 / 196 / 260 KB; Tóquio 152 / 216 / 280 KB. Processamento (idem, a recalcular): 150–275 ms (Lisboa), 51–88 ms (Santiago), 200–260 ms (Tóquio). Registros sem nome ficam preservados no processamento, não aparecem na lista principal e são contados.

### Agrupamento e possíveis duplicatas (recalculado com o texto corrigido)
| | Lisboa | Santiago | Tóquio |
|---|---:|---:|---:|
| Grupos confirmados (≥2 registros) | 16 (10 pares, 4 trios, 2 grupos de 5) | 2 (pares) | **24** (pares) |
| Registros absorvidos pelos grupos | 26 | 2 | **24** |
| Possíveis duplicatas: pares marcados | **13** | 11 | **19** |
| Possíveis duplicatas: locais envolvidos (só marcados, nunca agrupados nem ocultados) | **18** | 20 | **34** |
| Grupos de nome repetido / elementos | a recalcular | a recalcular | a recalcular |

- Registros sem nome nunca foram unidos a registros com nome.
- Nome repetido não é duplicidade: só há agrupamento com sinal forte (mesma fonte e id; mesma categoria, nome e ≤150 m; mesmo site ou telefone ≤300 m). O resultado da auditoria mostra, porém, que **o critério de site gera agrupamentos incorretos** (ver seção final).
- O número anterior de possíveis duplicatas em Tóquio (**179, ~14%**) e a explicação de "ruído em nomes japoneses curtos" **estavam errados**: vinham de texto corrompido. Com o texto corrigido são 19 pares (34 locais) e **nenhum par tem nome de até 4 caracteres**.
- Diferenças em relação à contagem bruta do PowerShell: sites em Tóquio 443 contra 442 (o analisador também conta `url`). A comparação de grupos de nomes repetidos (56 contra 40) foi feita com texto corrompido e fica sem valor até ser recalculada. Total, sem nome, telefone, cidade, estrelas, horário, `fee` e `charge` coincidem.

### O que mudou com a correção
| Métrica | Valor anterior (texto corrompido; **não usar**) | Valor atual |
|---|---|---|
| Tóquio: locais após agrupar | 1.285 | 1.287 |
| Tóquio: grupos confirmados / registros absorvidos | 26 | 24 / 24 |
| Tóquio: possíveis duplicatas (locais) | 179 (~14%) | 34 (19 pares) |
| Lisboa: possíveis duplicatas (locais) | 19 | 18 (13 pares) |
| Santiago: possíveis duplicatas (locais) | 20 | 20 (11 pares) |
| Lisboa e Santiago: grupos confirmados e locais após agrupar | 16 / 626 e 2 / 317 | sem mudança |
| Tóquio: exibíveis 1.178; exibição com limite 100/150/200 (restantes 1.078 / 1.028 / 978); grupos de nomes repetidos 56 (184 elementos; 49 separados, 7 agrupados); Lisboa 14 (31) e Santiago 9 (18) | medidos com texto corrompido | **a recalcular** |

### Preços
**Nenhum preço foi verificável nos dados OSM analisados.**
- `charge` e `check_date:charge`: 0 nas três cidades.
- `fee` (apenas observação, nunca preço, gratuidade, zero, filtro ou ranking): Lisboa no=2, yes=1; Santiago nenhum; Tóquio no=1, yes=1.
- Classe de preço `unavailable` em todos os exibíveis (Lisboa 570, Santiago 297; Tóquio: todos, quantidade exata a recalcular); ranking de preço vazio (0). As chaves de preço (`charge`, `fee`) são ASCII: **esta conclusão não depende da codificação do texto**.
- Outras chaves com aparência de preço, ignoradas por não serem preço de hospedagem: `internet_access:fee` (149 / 24 / 118), `toilets:fee` (1 / 1 / 0), `breakfast:charge` 1 e `breakfast:fee` 1 (só Tóquio).
- Nenhum preço, disponibilidade, estrela ou avaliação foi inventado.

### Limitações
- Três destinos, um instante no tempo; Buenos Aires e Paraty não foram revalidados no Overpass (falharam com 502 no teste do dono).
- Os JSON são instantâneos do OSM gravados em 05/11/2026 (horário local do dono); a cobertura varia por cidade.
- Sem preço verificável nos dados OSM, o ranking de preço depende de outras fontes (publicadas, comunidade) que não entraram nesta medição.
- `addr:city` é pouco preenchido (20% a 49%); a localização vem das coordenadas.
- A avaliação de duplicatas é feita só com o conteúdo dos JSON (ver a auditoria abaixo), **sem conferência externa**: "provável" não é confirmação.
- Os JSON do Windows têm texto corrompido (UTF-8 lido como Latin-1); as métricas dependentes de texto só valem após a correção ou o recálculo.
- O limite público do Overpass é de ordem de ~100 consultas por dia; as ferramentas de chat `search_campings` e `search_lodging` ainda consultam o Overpass diretamente no servidor.

---

## Auditoria de qualidade da deduplicação (REAL; 06/11/2026 UTC)

Diagnóstico técnico feito só com leitura dos três JSON reais do Overpass e da implementação do commit `6e9559c` (`groupDuplicates` em `src/services/stays/dedupe.js`). **Nada foi alterado no algoritmo, nos scripts, nos testes ou nas funcionalidades.** Os JSON não estão no repositório. Este registro **não contém nomes, identificadores, coordenadas, telefones, endereços nem domínios**: só contagens e padrões.

### Corrupção de texto nos JSON
- **Evidência objetiva:** os JSON tinham acentos e caracteres japoneses corrompidos (UTF-8 interpretado como Latin-1). Contagem de sequências de bytes que não ocorrem em UTF-8 correto: Lisboa 38, Santiago 58, **Tóquio 19.890**. Os símbolos escritos pelo próprio script de auditoria saíram corretos, e só o texto vindo dos JSON estava corrompido.
- **Inferência (causa):** o roteiro PowerShell 5.1 que baixou o Overpass provavelmente leu a resposta como Latin-1. O aplicativo não é afetado, porque lê o Overpass como UTF-8.
- **Correção na auditoria:** reversão exata, só na memória, de cada texto (Lisboa 335 de 6.247 textos; Santiago 155 de 1.994; Tóquio 2.645 de 10.497). Os arquivos originais não são alterados. Os hashes SHA-256 foram verificados e idênticos após a primeira execução da auditoria; **não foram reverificados** após a segunda (que só lê).
- **Efeito:** sem a correção, o japonês virava poucas letras latinas soltas e muitos nomes pareciam quase iguais (as 179 possíveis duplicatas de Tóquio eram em grande parte artefato). Em Lisboa, a corrupção também criou um par marcado falso e fez sumir um verdadeiro (um albergue chamado em português e em inglês, que deixou de ser marcado após a correção).

### Escopo e critérios
| Conjunto | Quantidade | O que é |
|---|---:|---|
| Grupos confirmados | **42** (Lisboa 16, Santiago 2, Tóquio 24) | Grupos de ≥2 registros formados por `groupDuplicates`: mesma fonte e id; ou mesma categoria, nome idêntico normalizado e ≤150 m; ou mesmo site ≤300 m; ou mesmo telefone ≤300 m. Todos analisados, sem amostragem. |
| Pares marcados como possível duplicata | **43** (13, 11, 19) | Pares não agrupados, com categoria compatível, a ≤250 m e similaridade de nome ≥0,6. Só marcam; nunca agrupam nem ocultam. Todos analisados. |
| Pares não marcados | **43** (19, 7, 17) | Pares a ≤150 m, não agrupados, com similaridade <0,6 e ao menos um outro sinal: mesmo endereço (rua e número), mesma marca ou operador, mesmo wikidata, um nome contido no outro, nome igual a um nome alternativo ou de outro idioma, mesmo site ou telefone. **Limite:** pares sem nenhum desses sinais não aparecem; pode haver duplicatas fora dessa lista. |

### Método de classificação
- **Evidência objetiva:** o que está nos JSON (nome, endereço, wikidata, site, telefone, distância, tags).
- **Inferência:** conclusão que usa conhecimento geral (por exemplo, "anexo" ser outro prédio, "1" e "2" serem unidades distintas, transliteração do mesmo nome). Está marcada como tal.
- **Sem conferência externa:** nenhum estabelecimento foi verificado em fonte externa. **"Provável" não é confirmação externa.** Onde os dados não fecham, a classificação é **inconclusivo**.
- "Provável falso positivo" significa que o agrupamento ou a marcação provavelmente junta estabelecimentos distintos.

### Quadro comparativo
| Destino | Conjunto | Analisados | Prováveis duplicatas | Prováveis falsos positivos | Inconclusivos |
|---|---|---:|---:|---:|---:|
| Lisboa | Grupos confirmados | 16 | 7 | 8 | 1 |
| Lisboa | Pares marcados | 13 | 0 | 12 | 1 |
| Lisboa | Pares não marcados | 19 | 5 | 0 | 14 |
| Santiago | Grupos confirmados | 2 | 1 | 0 | 1 |
| Santiago | Pares marcados | 11 | 3 | 4 | 4 |
| Santiago | Pares não marcados | 7 | 0 | 0 | 7 |
| Tóquio | Grupos confirmados | 24 | 7 | 10 | 7 |
| Tóquio | Pares marcados | 19 | 2 | 10 | 7 |
| Tóquio | Pares não marcados | 17 | 6 | 0 (2 provavelmente distintos, corretamente separados) | 9 |
| **Total** | Grupos confirmados | **42** | 15 | 18 | 9 |
| **Total** | Pares marcados | **43** | 5 | 26 | 12 |
| **Total** | Pares não marcados | **43** | 11 | 0 (2 provavelmente distintos) | 30 |

### Principais conclusões
- **Objetivo:** todos os 18 grupos confirmados que provavelmente juntam estabelecimentos distintos foram formados pelo critério **"mesmo site"** (Lisboa 8, Tóquio 10; Santiago 0). Nenhum agrupamento por "mesmo nome" é um falso positivo claro.
- **Objetivo, causas do critério de site:** site corporativo comum a vários hotéis da mesma rede; site de um prédio com vários hotéis; domínio de agência de reservas (não do estabelecimento); numeração de unidades ("1" e "2", "No.1" e "No.2").
- **Objetivo, transitividade:** o agrupamento por ligações encadeia registros além do limite de 300 m (pares a 314, 330 e 331 m em Lisboa). A ligação é feita por registros intermediários.
- **Objetivo, nomes só de marca:** em áreas densas, o critério de mesmo nome a ≤150 m deixou 4 grupos inconclusivos (Tóquio).
- **Objetivo, pares marcados:** 26 de 43 provavelmente falsos positivos. Causas: uma palavra de bairro ou estação em comum; termos genéricos fora da lista de exclusão (por exemplo, "business hotel" e "campground" em japonês); sufixos de anexo, ala e numeração.
- **Objetivo, Tóquio:** nenhum par marcado tem nome de até 4 caracteres (o menor tem 5, depois de retirar palavras genéricas de hospedagem). A hipótese de ruído por nomes japoneses curtos **não é sustentada** pelos dados corrigidos.
- **Objetivo, pares não marcados:** o mesmo endereço aparece em 15 dos 19 pares de Lisboa, mas o algoritmo não usa endereço. Há duplicatas prováveis que o algoritmo não vê: mesmo wikidata com nomes diferentes, nome em outro idioma, nome contido no outro, registro sem nome no mesmo endereço, variante de caractere japonês.
- **Inferência:** cerca de 12 hotéis de Lisboa podem desaparecer como itens separados por causa dos falsos positivos de site. Casos de mesmo endereço com nomes diferentes (vários negócios no mesmo prédio ou renomeação) **não devem ser agrupados** sem outro sinal.
- **Risco futuro (inferência):** o agrupamento reúne os preços de todos os membros; com outras fontes de preço, o preço de um hotel poderia ser atribuído a outro.

### Recomendações (nenhuma implementada; dependem de decisão e de novos testes)
- **Necessárias:** restringir o critério de site (segundo sinal obrigatório e lista de domínios de agências); limitar o diâmetro do grupo ou exigir ligação direta; usar wikidata igual como sinal forte e wikidata diferente como impedimento; exigir mais um sinal para nomes só de marca; ampliar palavras genéricas por idioma e tratar sufixos de anexo, ala e numeração como parte que distingue; não listar registros cujo nome é uma observação.
- **Podem piorar a precisão:** baixar o limiar de 0,6 ou aumentar 250 m; agrupar só por telefone, só por endereço ou só por marca; remover "hotel" por completo e comparar só a marca; transliteração automática ou uso de `name:en` como equivalência sem outro sinal; aumentar o limite de 150 m para nome idêntico.
- **Devem continuar sem agrupamento:** mesma rede com nomes e endereços diferentes; unidades numeradas e anexos (no máximo "relacionados"); vários negócios no mesmo endereço; prédios compartilhados; só o mesmo bairro ou estação em comum; nome idêntico a mais de 150 m sem outro sinal.
- **Operação global:** normalização NFKC e variantes de caracteres; comparação de todos os nomes alternativos (`name:en`, `int_name`, `alt_name`, `old_name`, `name:ja-Latn`) combinada com distância e categoria; uso da tag `branch`; listas de palavras genéricas por idioma, versionadas e testadas; detecção de texto corrompido na entrada; conjunto de referência rotulado por região para medir precisão e revocação; decisão de produto sobre como mostrar anexos e alas.

### Registro item a item (sem nomes nem identificadores)
Siglas: **C** grupo confirmado, **P** par marcado, **N** par não marcado; **L** Lisboa, **S** Santiago, **T** Tóquio. "Dist." é a distância entre os registros. "Sim." é a similaridade de nome.

#### Grupos confirmados (42)

Lisboa (16)

| ID | Registros | Critério | Evidência objetiva | Avaliação |
|---|---|---|---|---|
| L-C01 | 5 | nome ≤24 m | mesmo nome e mesmo endereço; só um registro tem site e wikidata | Provável duplicata |
| L-C02 | 5 | nome (2 pares) + site | 3 nomes e 3 endereços diferentes; site e telefone de rede; 2 pares a 331 e 314 m só por transitividade | Provável falso positivo (parcial: contém 2 pares prováveis duplicatas) |
| L-C03 | 3 | site | 3 endereços em ruas diferentes; 1 par a 330 m só por transitividade | Provável falso positivo |
| L-C04 | 3 | site + nome 47 m | 1 membro com endereço, telefone e wikidata próprios; 2 de mesmo nome a 47 m | Provável falso positivo (parcial) |
| L-C05 | 3 | site | wikidata diferentes; 3 endereços; estrelas 3/5/3 | Provável falso positivo |
| L-C06 | 3 | site | 3 wikidata diferentes; endereços diferentes; 29–59 m | Provável falso positivo |
| L-C07 | 2 | nome 7 m | mesmo endereço; o nome é uma observação ("encerrado"), não nome comercial | Provável duplicata (de um registro que provavelmente não deveria ser listado) |
| L-C08 | 2 | nome 39 m | endereços "3-A" e "3" na mesma rua | Provável duplicata |
| L-C09 | 2 | nome 9 m | mesmo endereço; nó e way | Provável duplicata |
| L-C10 | 2 | nome 35 m | números de porta diferentes; sem site nem telefone | Inconclusivo |
| L-C11 | 2 | site | nomes, endereços e estrelas diferentes (3 e 5); 34 m | Provável falso positivo |
| L-C12 | 2 | site | wikidata diferentes; ruas diferentes; 204 m | Provável falso positivo |
| L-C13 | 2 | nome 9 m | mesmo endereço; nó e way | Provável duplicata |
| L-C14 | 2 | nome 43 m | um dos registros só tem o nome (certeza moderada) | Provável duplicata |
| L-C15 | 2 | nome 3 m | 2 ways sobrepostos; um com endereço e site | Provável duplicata |
| L-C16 | 2 | site | nomes, endereços e telefones diferentes; 41 m | Provável falso positivo |

Santiago (2)

| ID | Registros | Critério | Evidência objetiva | Avaliação |
|---|---|---|---|---|
| S-C01 | 2 | nome 74 m | mesmo nome; ruas diferentes; um com wikidata | Inconclusivo (inclina para duplicata) |
| S-C02 | 2 | nome 21 m | nó e way; o way tem site e endereço | Provável duplicata |

Tóquio (24)

| ID | Registros | Critério | Evidência objetiva | Avaliação |
|---|---|---|---|---|
| T-C01 | 2 | site | marcas diferentes no mesmo prédio (site do prédio); 15 m | Provável falso positivo |
| T-C02 | 2 | site | nomes diferem só por um espaço; way com wikidata; 70 m | Provável duplicata |
| T-C03 | 2 | nome 18 m | nome só da marca; nó e way com endereço | Provável duplicata |
| T-C04 | 2 | nome 8 m | 2 nós | Provável duplicata |
| T-C05 | 2 | site | nomes numerados "1" e "2" (também em name:en); 46 m | Provável falso positivo |
| T-C06 | 2 | site | nomes e wikidata diferentes; 178 m | Provável falso positivo |
| T-C07 | 2 | site | name:en numerados 1 e 2; mesmo operador; 23 m | Provável falso positivo (provável unidades distintas) |
| T-C08 | 2 | site | domínio de agência de reservas on-line (não do estabelecimento); nomes diferentes; 9 m | Provável falso positivo (claro) |
| T-C09 | 2 | nome 5 m | 2 nós; name:en igual | Provável duplicata |
| T-C10 | 2 | telefone | nomes diferentes; mesmo telefone; 60 m | Inconclusivo |
| T-C11 | 2 | telefone | prédio principal e ala (o nome de um acrescenta "ala"); 101 m | Inconclusivo |
| T-C12 | 2 | nome + site | 61 m | Provável duplicata |
| T-C13 | 2 | site + telefone | nomes numerados "No.1" e "No.2"; 71 m | Provável falso positivo |
| T-C14 | 2 | nome 5 m | nó e way | Provável duplicata |
| T-C15 | 2 | nome 39 m | nome só da marca, sem endereço | Inconclusivo |
| T-C16 | 2 | nome 6 m | o nome sugere "unidade 1 de 3"; categoria OSM motel | Inconclusivo |
| T-C17 | 2 | nome 19 m | um com wikidata e name:en | Provável duplicata |
| T-C18 | 2 | nome 58 m | nome só da marca; o name:en de um indica uma estação específica | Inconclusivo (inclina para duplicata) |
| T-C19 | 2 | site | wikidata diferentes; 177 m | Provável falso positivo |
| T-C20 | 2 | nome 124 m | nome só da marca; name:en de um indica estação específica; outros da marca na vizinhança | Inconclusivo (risco de falso positivo) |
| T-C21 | 2 | site + telefone | torres distintas do mesmo complexo; wikidata e estrelas diferentes; 158 m | Inconclusivo |
| T-C22 | 2 | site | hotéis irmãos de nomes diferentes; 135 m | Provável falso positivo |
| T-C23 | 2 | site | nomes (estação/bairro) e telefones diferentes; 80 m | Provável falso positivo |
| T-C24 | 2 | site | nomes diferentes; telefones consecutivos; 90 m | Provável falso positivo (provável distintos) |

#### Pares marcados como possível duplicata (43)

Lisboa (13)

| ID | Sim. | Dist. | Evidência objetiva | Avaliação |
|---|---|---|---|---|
| L-P01 | 0,67 | 230 m | endereços e sites diferentes | Provável falso positivo |
| L-P02 | 0,67 | 199 m | endereços e sites diferentes | Provável falso positivo |
| L-P03 | 0,75 | 97 m | 3 palavras em comum; um dos registros (way) sem endereço | Inconclusivo |
| L-P04 | 0,63 | 207 m | wikidata, sites, telefones e estrelas diferentes | Provável falso positivo |
| L-P05 | 0,77 | 186 m | wikidata e sites diferentes | Provável falso positivo |
| L-P06 | 0,63 | 213 m | wikidata diferentes | Provável falso positivo |
| L-P07 | 0,63 | 216 m | wikidata, sites e operadores diferentes | Provável falso positivo |
| L-P08 | 0,63 | 103 m | sites e endereços diferentes | Provável falso positivo |
| L-P09 | 0,67 | 45 m | último termo do nome diferente; endereço só em um | Provável falso positivo (inferência pelo nome) |
| L-P10 | 0,67 | 140 m | nomes diferentes; wikidata em um | Provável falso positivo |
| L-P11 | 0,67 | 179 m | mesmo local do par anterior (outro registro do grupo) | Provável falso positivo |
| L-P12 | 0,67 | 209 m | marcas e operadores diferentes | Provável falso positivo |
| L-P13 | 0,67 | 155 m | sites e operadores diferentes | Provável falso positivo |

Santiago (11)

| ID | Sim. | Dist. | Evidência objetiva | Avaliação |
|---|---|---|---|---|
| S-P01 | 1,00 | 234 m | nomes idênticos; um com site | Inconclusivo |
| S-P02 | 0,67 | 42 m | o segundo nome acrescenta a cidade (também em name:en) | Provável duplicata |
| S-P03 | 0,71 | 73 m | o termo em comum é o nome da rua | Inconclusivo |
| S-P04 | 0,75 | 142 m | nomes com uma letra de diferença | Inconclusivo |
| S-P05 | 0,67 | 36 m | mesmo nome com espaçamento diferente | Provável duplicata |
| S-P06 | 0,67 | 184 m | nomes e endereços diferentes | Provável falso positivo |
| S-P07 | 0,75 | 37 m | o segundo nome insere uma palavra ("boutique") | Provável duplicata |
| S-P08 | 0,67 | 127 m | endereços e categorias OSM diferentes | Provável falso positivo |
| S-P09 | 1,00 | 191 m | nomes idênticos; mesma rua e cidade; um com número de porta | Inconclusivo |
| S-P10 | 0,91 | 110 m | ruas diferentes; numeração no nome | Provável falso positivo (provável distintos) |
| S-P11 | 0,63 | 132 m | endereços diferentes | Provável falso positivo |

Tóquio (19)

| ID | Sim. | Dist. | Evidência objetiva | Avaliação |
|---|---|---|---|---|
| T-P01 | 0,80 | 130 m | nome com acréscimo "anexo" | Inconclusivo |
| T-P02 | 0,67 | 208 m | nome com acréscimo "anexo" | Inconclusivo |
| T-P03 | 0,76 | 204 m | nome com acréscimo "anexo" | Inconclusivo |
| T-P04 | 0,67 | 51 m | marcas diferentes; só o nome da estação em comum | Provável falso positivo |
| T-P05 | 0,73 | 7 m | nó só com a marca; way com o local | Provável duplicata |
| T-P06 | 0,75 | 155 m | estações diferentes na mesma rede | Provável falso positivo |
| T-P07 | 0,83 | 132 m | nó só com nome genérico da marca | Inconclusivo |
| T-P08 | 0,62 | 66 m | name:en numerados 1 e 2 | Provável falso positivo |
| T-P09 | 0,67 | 23 m | um nome contém o outro | Provável duplicata |
| T-P10 | 0,60 | 17 m | só o termo genérico "business hotel" em comum | Provável falso positivo |
| T-P11 | 0,67 | 224 m | só o termo genérico em comum | Provável falso positivo |
| T-P12 | 0,67 | 238 m | só o termo genérico em comum | Provável falso positivo |
| T-P13 | 0,67 | 206 m | estações diferentes na mesma rede | Provável falso positivo |
| T-P14 | 0,67 | 34 m | sufixo que diferencia o nome; endereço e wikidata em lados diferentes | Inconclusivo |
| T-P15 | 0,62 | 95 m | só o termo genérico "campground"; categorias OSM diferentes | Provável falso positivo |
| T-P16 | 0,73 | 52 m | nome com acréscimo "ala"; wikidata em um | Inconclusivo |
| T-P17 | 0,67 | 19 m | nome com acréscimo "anexo"; endereços diferentes | Inconclusivo |
| T-P18 | 0,67 | 184 m | name:en diferencia uma variante ("norte") | Provável falso positivo |
| T-P19 | 0,67 | 142 m | estações diferentes na mesma rede | Provável falso positivo |

#### Pares não marcados com outro sinal (43)

Lisboa (19)

| ID | Dist. | Evidência objetiva | Avaliação |
|---|---|---|---|
| L-N01 | 32 m | mesmo endereço; um registro nomeado e outro sem nome | Provável duplicata não marcada |
| L-N02 | 10 m | mesmo endereço; nomes diferentes | Inconclusivo |
| L-N03 | 37 m | mesmo endereço; um nomeado e outro sem nome | Provável duplicata não marcada |
| L-N04 | 3 m | mesmo endereço; nomes diferentes (3 negócios no mesmo endereço) | Inconclusivo |
| L-N05 | 1 m | mesmo endereço; nomes diferentes (idem) | Inconclusivo |
| L-N06 | 2 m | mesmo endereço; nomes diferentes (idem) | Inconclusivo |
| L-N07 | 4 m | um nome contém o outro | Provável duplicata não marcada |
| L-N08 | 4 m | um nome contém o outro; categorias OSM diferentes | Provável duplicata não marcada (com conflito de categoria) |
| L-N09 | 13 m | mesmo endereço; nomes diferentes | Inconclusivo |
| L-N10 | 5–21 m | mesmo endereço; 4 registros sem nome (6 pares) | Inconclusivo |
| L-N11 | 5–21 m | mesmo endereço; 4 registros sem nome (6 pares) | Inconclusivo |
| L-N12 | 5–21 m | mesmo endereço; 4 registros sem nome (6 pares) | Inconclusivo |
| L-N13 | 5–21 m | mesmo endereço; 4 registros sem nome (6 pares) | Inconclusivo |
| L-N14 | 5–21 m | mesmo endereço; 4 registros sem nome (6 pares) | Inconclusivo |
| L-N15 | 5–21 m | mesmo endereço; 4 registros sem nome (6 pares) | Inconclusivo |
| L-N16 | 19 m | mesmo endereço; registro com nota "encerrado" e way sem nome (4 estrelas) | Inconclusivo |
| L-N17 | 19 m | idem, com o outro registro de nota | Inconclusivo |
| L-N18 | 1 m | mesmo endereço; nomes e categorias OSM diferentes | Inconclusivo |
| L-N19 | 59 m | mesmo wikidata; nomes diferentes | Provável duplicata não marcada |

Santiago (7)

| ID | Dist. | Evidência objetiva | Avaliação |
|---|---|---|---|
| S-N01 | 9–24 m | mesmo endereço; 4 negócios no mesmo endereço (6 pares) | Inconclusivo |
| S-N02 | 9–24 m | idem | Inconclusivo |
| S-N03 | 9–24 m | idem | Inconclusivo |
| S-N04 | 20 m | mesmo endereço; nomes diferentes | Inconclusivo |
| S-N05 | 9–24 m | idem ao S-N01 | Inconclusivo |
| S-N06 | 9–24 m | idem | Inconclusivo |
| S-N07 | 9–24 m | idem | Inconclusivo |

Tóquio (17)

| ID | Dist. | Evidência objetiva | Avaliação |
|---|---|---|---|
| T-N01 | 33 m | mesma rede; nome em japonês e nome em latim; endereços e telefones diferentes | Inconclusivo |
| T-N02 | 54 m | mesmo wikidata; um nome contém o outro e coincide com o name:en do outro | Provável duplicata não marcada |
| T-N03 | 16 m | um nome contém o outro; name:en igual | Provável duplicata não marcada |
| T-N04 | 22 m | mesmo wikidata; grafias latinas diferentes do nome | Provável duplicata não marcada |
| T-N05 | 61 m | mesma operadora; nomes, sites e telefones diferentes | Provável distintos (correto não agrupar) |
| T-N06 | 122 m | nome só da marca × nome completo da mesma rede | Inconclusivo |
| T-N07 | 83 m | idem | Inconclusivo |
| T-N08 | 31 m | hotel × hotel "anexo" (um nome contém o outro) | Inconclusivo |
| T-N09 | 95 m | nome em latim igual ao name:en do outro; um com wikidata | Provável duplicata não marcada |
| T-N10 | 20 m | mesma rede; variante de caractere japonês no nome | Inconclusivo |
| T-N11 | 14 m | nome em latim igual ao name:en do outro (transliteração); categorias OSM diferentes | Provável duplicata não marcada (com conflito de categoria) |
| T-N12 | 90 m | nome só da marca × nome completo | Inconclusivo |
| T-N13 | 117 m | nome só da marca × nome em maiúsculas; endereços diferentes | Inconclusivo |
| T-N14 | 3 m | um nome contém o outro | Provável duplicata não marcada |
| T-N15 | 36 m | mesma operadora, marcas diferentes | Provável distintos (correto não agrupar) |
| T-N16 | 121 m | mesma rede; números de endereço diferentes | Inconclusivo |
| T-N17 | 132 m | nome só da marca × nome completo | Inconclusivo |

### Pendências
- Recalcular, com o texto corrigido ou com os dados baixados corretamente, as métricas marcadas "a recalcular" (exibíveis e exibição de Tóquio, tamanho de resposta, tempo de processamento e grupos de nomes repetidos).
- Corrigir o roteiro PowerShell de coleta (gravar os bytes da resposta sem reinterpretar o texto) antes de novas coletas, e considerar um aviso de texto corrompido no analisador local. Nenhuma dessas mudanças foi feita aqui.
- Decidir quais recomendações viram implementação. Nada foi implementado.
