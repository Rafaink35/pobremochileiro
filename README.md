# Pobre Mochileiro — protótipo em React

Protótipo mobile-first do app **Pobre Mochileiro** — *"Mais mundo. Menos boletos."*
Inspiração de destinos, planejamento de orçamento e comunidade de viajantes, construído
em React + Vite.

## Requisitos
- Node.js 18+ (recomendado)

## Executar localmente
```bash
npm install
npm run dev
```
Abra a URL local mostrada pelo Vite (normalmente `http://localhost:5173`).

## Build de produção
```bash
npm run build
npm run preview
```
O build foi testado e gera `dist/` sem erros (ver seção "Status" abaixo).

## Telas implementadas
1. **Início** — hero, categorias em destaque, prévia de destinos e de dicas da comunidade.
2. **Explorar destinos** — busca por texto, filtros por categoria, grade de destinos e estado vazio quando nada combina com a busca.
3. **Detalhe do destino** — hero do destino, checklist "antes de ir", atalho para o Planejador e botão de salvar/remover favorito.
4. **Planejador** — formulário de orçamento (nome da viagem, origem, dias, valor), resumo reativo ao lado e lista do que entra na conta. Os campos começam vazios — nenhum valor é pré-preenchido ou calculado.
5. **Comunidade** — feed de dicas/relatos (conteúdo demonstrativo, claramente identificado como tal) e call-to-action para publicar (ainda não habilitado).
6. **Salvos** — lista dos destinos favoritados, com estado vazio quando não há nenhum.

Navegação funciona por estado interno **e** por hash da URL (`#inicio`, `#explorar`,
`#detalhe-<id>`, `#planejador`, `#comunidade`, `#salvos`), então o botão voltar/avançar
do navegador funciona e cada tela pode ser aberta por link direto.

## O que foi alterado nesta revisão
O protótipo React já existia e funcionava (todas as 5 telas prioritárias + Salvos já
estavam implementadas em um único arquivo `main.jsx`). O trabalho desta etapa foi:

- **Organização do código**: o app foi dividido em componentes e telas reutilizáveis
  (`src/components`, `src/screens`, `src/data`, `src/hooks`), sem remover ou reescrever
  o conteúdo/copy original — apenas reestruturado para facilitar manutenção.
- **Tipografia corrigida**: trocado "DM Sans" por **Nunito Sans** no texto corrido,
  mantendo **Fredoka** nos títulos, conforme identidade aprovada.
- **Favoritos e rascunho do Planejador agora persistem** no navegador via
  `localStorage` (antes duravam apenas durante a sessão/aba aberta). Não há conta,
  login nem sincronização entre dispositivos — é armazenamento local do navegador.
- **Navegação por URL** (hash routing leve, sem biblioteca extra): suporte a
  voltar/avançar do navegador e link direto para cada tela.
- **Acessibilidade**: link "pular para o conteúdo", `aria-current` nos itens de
  navegação ativos, `aria-pressed` em botões de alternância (favoritar/filtrar),
  rótulo associado ao campo de busca, `aria-live` no toast de feedback, textos
  alternativos/`aria-hidden` corrigidos em ícones decorativos.
- **Robustez visual**: cor de fundo de reserva nos cards de destino e no hero de
  detalhe, para o layout não quebrar caso as imagens do Unsplash não carreguem
  (sem internet, bloqueio de rede etc.).
- **Build**: adicionado `vite.config.js` registrando o plugin oficial do React
  (Fast Refresh em desenvolvimento); dependências antes fixadas em `"latest"` agora
  têm versão fixa, para builds reproduzíveis; favicon em SVG com a identidade da
  marca.
- **Status do build**: `npm run build` executa sem erros ou avisos (ver abaixo).

## Identidade visual aplicada
- Nome: **Pobre Mochileiro** (sem "AI").
- Slogan: **Mais mundo. Menos boletos.**
- Paleta: verde-floresta `#0B3D2E`, amarelo `#F4C542`, creme `#F6F0E4`, coral `#E8785D`.
- Tipografia: **Fredoka** nos títulos, **Nunito Sans** no texto corrido.
- Mochila ilustrada (SVG inline) como elemento visual protagonista da marca.

## Dados e conteúdo — nada é real
- **Nenhum preço, nota, avaliação ou disponibilidade real** é exibido em nenhuma tela.
- Os cards de destino (`src/data/destinations.js`) são conteúdo de **inspiração
  visual**, sinalizado como tal diretamente na tela de Explorar.
- Os posts da Comunidade (`src/data/posts.js`) são **exemplos de interface**,
  explicitamente identificados como não sendo depoimentos reais verificados.
- O Planejador **não calcula nem busca cotações reais** — é um formulário de
  rascunho pessoal, com aviso visível disso.
- As fotos usam imagens remotas do Unsplash (precisam de internet); se a imagem não
  carregar, o card mostra um fundo sólido em vez de quebrar.

## Status do build / testes
Este projeto não tem suíte de testes automatizados configurada (não havia uma antes
desta revisão). A verificação feita foi:
- `npm run build` (produção) — concluído sem erros.
- `npm run preview` + inspeção visual em viewport desktop (1440px) e mobile (390px)
  para as 5 telas e o menu mobile.
- Testes funcionais manuais (via navegador automatizado): busca sem resultado →
  estado vazio; limpar filtros; filtro por categoria; favoritar → persiste após
  recarregar a página; Planejador preenchido → persiste após recarregar; remover
  favorito → estado vazio em Salvos; ordem de navegação por teclado (Tab) passando
  pelo link de pular conteúdo e pelos itens de navegação na ordem correta.
- Nenhum erro de console JavaScript encontrado durante os testes acima.

## Limites conhecidos / o que ainda falta
- **Sem backend**: não há login, conta de usuário, servidor, banco de dados ou API
  real conectada. Favoritos e rascunho do Planejador ficam salvos **apenas neste
  navegador** (não sincronizam entre dispositivos).
- **Sem preços ou cotações reais**: o Planejador não calcula custo nenhum; é só um
  formulário de rascunho pessoal.
- **Comunidade é somente leitura**: o botão "Novo relato" e o de salvar relato
  mostram apenas uma mensagem de que a função chega em uma próxima etapa — não
  publicam nada de fato.
- **Imagens dependem de internet** (Unsplash). Sem conexão, os cards caem no fundo
  de reserva (verde) em vez de mostrar a foto.
- **Fontes do Google** (Fredoka, Nunito Sans) também dependem de internet para
  carregar; sem conexão, o navegador usa a fonte padrão do sistema como alternativa.
- **Sem testes automatizados**: não há Jest/Vitest/Playwright configurado no
  projeto; a verificação desta etapa foi manual (ver seção acima).

## APIs conectadas (v0.3)
| Recurso | API | Chave? | Onde |
|---|---|---|---|
| Câmbio | AwesomeAPI (BRL ↔ USD/EUR/GBP/ARS/CLP) | não | `src/api/fx.js`, Planejador |
| Lugares e fotos | Wikipédia (pt) | não | `src/api/places.js`, Explorar |
| Conta e comunidade | Supabase (login por código de e-mail) | sim, chave `anon` | `src/api/supabase.js`, Comunidade |

Sem as variáveis do Supabase, a Comunidade continua em modo demonstração.

### Ligar o Supabase
1. Crie um projeto, rode `supabase/schema.sql` no SQL Editor.
2. Em Authentication > Email Templates, inclua `{{ .Token }}` no e-mail (código de 6 dígitos).
3. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

### Pendente
- **Voos e hospedagem:** a API self-service da Amadeus foi desativada em jul/2026. Falta escolher outro provedor (e com ele um pequeno backend para guardar a chave).
- **Google Play:** o app já é um PWA (`public/manifest.webmanifest`, `public/sw.js`). Falta publicar o site em HTTPS e empacotar com Bubblewrap (TWA) ou Capacitor.


## Transporte e fontes de dados abertas (nova camada)

Camada própria para pesquisar deslocamentos entre origem e destino, em `src/services/transport/`.
Telas novas: **Transporte** (`#transporte`) e **Fontes de dados** (`#fontes`).

### O que realmente funciona hoje
- **Importação e validação de GTFS Schedule** (testada com arquivos GTFS sintéticos nos testes automatizados).
- **Busca de viagens diretas** (sem baldeação) entre paradas de um GTFS importado, com horários após a meia-noite,
  calendário/exceções e tarifa **somente** quando `fare_attributes`/`fare_rules` a determinam sem ambiguidade.
- **Metadados de fonte** (licença, atribuição, uso comercial, datas) e a tela de atribuição.
- **Estados da interface**: carregando, nenhuma rota, fonte indisponível, não configurada, dados desatualizados,
  preço não informado e dados incompletos.

### O que ainda é só interface preparada
- **OpenTripPlanner** (`openTripPlannerProvider.js`): consulta a GTFS GraphQL API, **não testada contra um servidor
  real**. Sem `VITE_ROUTING_API_BASE_URL`, informa que o roteamento não está disponível. Aceita origem/destino como
  `lat,lon` (não há geocodificação).
- **GTFS Realtime**: a arquitetura permite adicionar um provedor, mas nada é simulado.
- **Nenhuma fonte externa real foi integrada.** Os sites oficiais não puderam ser acessados no desenvolvimento;
  ver `docs/data-sources.md`.

### Arquitetura
| Arquivo | Papel |
|---|---|
| `transportProvider.js` | Contrato dos provedores, status de busca, `safeSearch` (timeout e falhas viram "indisponível") |
| `gtfsProvider.js` | Importador GTFS (usa `fflate`), validação, busca direta |
| `openTripPlannerProvider.js` | Cliente opcional do OpenTripPlanner |
| `providerRegistry.js` | Registro de provedores e `searchAll` (falha de um não afeta os outros) |
| `normalizers.js` | Opção de viagem comum, preço (`null` ≠ 0), horários GTFS > 24h, modalidades |
| `sourceMetadata.js` | Licença, atribuição, uso comercial e fontes investigadas |
| `viewState.js` | Estados visuais e rótulo de preço |

Uma opção de viagem tem: origem, destino, modalidade, partida/chegada, duração, preço (`null` quando desconhecido),
operador, linha, link, indicadores `estimated`/`incomplete` e os metadados da fonte.

### Importar um GTFS autorizado
1. Obtenha o ZIP na fonte oficial e **confirme a licença** (ver `docs/data-sources.md`).
2. Abra **Transporte → Importar um GTFS (avançado)**, preencha nome, URL, licença, atribuição e uso comercial.
3. Selecione o `.zip`. Obrigatórios: `agency`, `stops`, `routes`, `trips`, `stop_times` e `calendar` ou
   `calendar_dates`. Opcionais lidos: `fare_attributes` e `fare_rules`.
4. O conjunto fica **só na memória do navegador** (some ao recarregar) e importar o mesmo arquivo de novo não duplica.
   Persistência e importação no servidor ficam para uma etapa com backend.

### Configurar o OpenTripPlanner
Requer um servidor próprio (custo e manutenção por sua conta). Resumo, a conferir na documentação oficial da versão que
for usada: coloque o(s) GTFS (nome contendo `gtfs`) e um extrato OSM em uma pasta, construa o grafo
(`--build --save`) e suba (`--load --serve`). A GTFS GraphQL API fica em `/otp/gtfs/v1`. Depois defina
`VITE_ROUTING_API_BASE_URL` (ex.: `http://localhost:8080`) e reinicie o build. Libere CORS no servidor.

### Cadastrar uma nova fonte
Adicione um objeto em `INVESTIGATED_SOURCES` (`sourceMetadata.js`) e a linha em `docs/data-sources.md`. Para uma fonte
com integração real, crie um provedor que siga o contrato de `transportProvider.js` e registre-o em
`providerRegistry.js`. Só marque `status: working` depois de validar uma conexão ou um conjunto real.

### Revisar licenças
`createSourceMetadata` marca como pendência: licença ou atribuição ausentes, uso comercial não verificado e licenças
com possível compartilhamento de bases derivadas (ODbL, CC BY-SA). `isPublishable` só é verdadeiro com uso comercial
permitido, licença, atribuição e sem revisão share-alike pendente. Isso **não substitui revisão jurídica**.

### Testes
```bash
npm test      # vitest: GTFS, normalização, preço ausente x zero, horários >24h, falhas, metadados, estados
npm run build
```

### Limitações e custos
- Busca GTFS só de viagens diretas; baldeações exigem OpenTripPlanner.
- Sem geocodificação: origem/destino são nomes de parada (GTFS) ou `lat,lon` (OpenTripPlanner).
- Custos potenciais: hospedagem do OpenTripPlanner e do armazenamento dos GTFS. Nada pago foi adicionado.
- `VITE_TRANSPORT_API_BASE_URL` está reservada e **não é lida** por nenhum código ainda.


## Campings e trabalho em troca
Tela **Hospedagem** (`#hospedagem`): campings do OpenStreetMap (consulta Overpass, **testada só com respostas simuladas**),
oportunidades de work exchange aprovadas (tabela no Supabase, **sem registros por padrão**), detalhes com fonte, licença e
data, ação **Como chegar** (reutiliza os provedores de transporte; sem fonte configurada informa "Roteamento ainda não
configurado" e oferece link externo de mapa, não validado pelo app) e **Adicionar ao planejador**, cujo total fica parcial
enquanto houver custo ou transporte desconhecido. Detalhes, licenças e pendências em `docs/stays.md`.


## Roteiro mais barato com IA
Assistente no Planejador (`/api/roteiro`, Claude API com ferramentas de câmbio, voos, campings e work exchange). Valores sem
fonte são descartados no servidor. Exige `ANTHROPIC_API_KEY` e login; **testado só com simulações**. Ver `docs/roteiro-ai.md`.

**Chat com streaming:** o Planejador agora tem um chat com o assistente (`/api/chat`, respostas em NDJSON). Testado com IA e
fontes simuladas, e a tela no navegador com um servidor simulado; streaming real na Netlify não validado. Ver `docs/roteiro-ai.md`.
