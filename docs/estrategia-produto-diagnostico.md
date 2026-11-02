# Direção estratégica de produto: diagnóstico e proposta de MVP

Data: 02/11/2026. Só diagnóstico e proposta: **nenhuma refatoração foi iniciada**. Base: branch `claude/brave-faraday-iufng4`
(`main` em `9614ea6` mais a camada nacional de dados da Fase 2).

Promessa: "Descubra até onde seu dinheiro pode te levar." Slogan: "Mais mundo. Menos boletos."

## 1. Diagnóstico da arquitetura existente

| Camada | Como está hoje |
|---|---|
| App | React 19 + Vite 8, página única com rotas por hash (`App.jsx`), PWA. ~10 mil linhas de código, 286 testes (285 passando; a falha é uma pasta alheia, `server/`) |
| Estado do usuário | **localStorage** no navegador: rascunho de planejamento (itens, hospedagens, vários planos) e destinos salvos. Não sincroniza entre aparelhos e não é compartilhável |
| Servidor | `server.mjs` (Render) reaproveitando funções `netlify/functions/*.mjs`: voos, calendário, datas flexíveis, chat, roteiro, feeds GTFS. Netlify está sendo aposentada |
| Banco | Supabase: login por link, perfis, comunidades, posts com fotos, work exchange, e (novo, ainda sem rodar) as tabelas da camada nacional de dados |
| IA | Chat com ferramentas (Gemini como padrão, Claude opcional), com verificação de valores. **Opcional**: o app funciona sem ela |
| Motor de viagens | `src/services/trip/`: preço rastreável (confirmado, publicado, estimado, desconhecido), motor de orçamento determinístico, recomendador determinístico, interpretador de pedidos em português **sem IA**. Tela **Descubra**. **A base de dados dele está vazia** (`base.json`) |
| Dados | OSM (hotel, hostel, camping), Aviasales via Travelpayouts (voos reais), GTFS (importador validado com amostra real da SPTrans), camada nacional (Fase 2, não validada com rede real) |

**Conclusão central:** o "orçamento primeiro, destino depois" já existe como **código** (Descubra, orçamento e recomendador). O que falta
é **dado** (a base está vazia, então a tela mostra um estado vazio honesto) e **costura** entre as peças. O problema do produto hoje não é
falta de funcionalidade: é falta de conteúdo real e de uma navegação que conte a história do orçamento.

## 2. Mapa de funcionalidades já implementadas

| Visão | O que já existe | Onde | Estado |
|---|---|---|---|
| Descobrir pelo orçamento | Formulário (orçamento, origem, dias, pessoas, preferências, carro) e pedido em texto livre; ranking por encaixe no orçamento; fonte e data em cada valor | `screens/Discover.jsx`, `services/trip/*` | Código pronto; **sem destinos** (base vazia) |
| Motor de orçamento | Soma por categoria (transporte, hospedagem, alimentação, atividades, deslocamentos locais, outros), separa confirmado, estimado e pendente; contingência; "cabe / não cabe / cabe parcial" | `trip/budget.js`, `trip/price.js` | Pronto e testado |
| Comparar | Voos com preço real e link; "De A para B"; hotéis e hostels (OSM, sem preço); campings; combos ônibus + voo; comparação de planos | `RouteExplorer`, `FlightsCard`, `Stays`, `ComparePlans` | Parcial: não há categorias econômico/custo-benefício/confortável nem imagem, nota ou data de atualização por oferta |
| Organizar a viagem | Planejador em abas, itens por categoria, hospedagens guardadas, **vários planos**, companhia e parceiro por item, botão "Adicionar ao plano" em todas as buscas | `Planner`, `TripPlan`, `plans.js` | Funciona, só no navegador |
| Calcular custos | Total parcial que nunca trata desconhecido como zero; "mais barato" só quando dá para afirmar | `planner/stays.js`, `plans.js` | **Duplicado**: o planejador usa um cálculo (`planSummary`) e o Descubra outro (`computeBudget`) |
| Economizar | Nada | | **Ausente** |
| Favoritos | Coração em 4 cartões de inspiração (**demonstrativos**) | `Saved.jsx`, `data/destinations.js` | Só conteúdo de demonstração |
| IA | Chat com ferramentas reais, persona de mochileiro, ranking do mais barato confirmado | `ChatAgent`, `netlify/functions/chat.mjs` | Código pronto; Gemini ainda sem teste real aprovado |
| Monetização | Links de afiliado com `rel="sponsored"`, cartões de parceiros quando o link existe, aviso de afiliado | `partners.js`, `BeforeTrip` | Estrutura pronta, **links vazios**; sem selo visível de "oferta patrocinada" nas ofertas |
| Comunidade | Perfis, avatar, feed, comunidades | `Community`, `Profile` | Pronto (fora dos 5 pilares; ver seção 4) |

## 3. Gaps em relação à visão

1. **Dados (bloqueio nº 1).** Sem destinos e preços reais, a promessa central não aparece. Preço de ônibus intermunicipal não tem fonte aberta; hospedagem do OSM não tem preço; só voos têm preço real de API.
2. **Imagens, avaliações e preço de oferta**: não há fonte licenciada ligada. Os 4 cartões da página inicial são fotos de demonstração.
3. **Entradas do Descubra:** faltam datas (hoje só duração), tipo de hospedagem e preferência de transporte explícitos, e a modalidade "orçamento por pessoa".
4. **Comparador com três categorias** (mais econômico, melhor custo-benefício, mais confortável): não existe. "Mais confortável" exige um critério determinístico com dados que temos (voo direto, tipo de hospedagem, quarto privado).
5. **Cartão `MinhaSelecao`:** não existe componente reutilizável de oferta (imagem, preço em destaque, selo, vantagens, link).
6. **Minha viagem:** falta a entidade "viagem" com destino, datas, **itinerário por dia** e **compartilhamento** (exige guardar no servidor).
7. **Meu orçamento:** não há **gasto realizado**, meta de viagem nem valor economizado. É o pilar 5 e o gancho de retenção.
8. **Meu próximo destino:** ausente.
9. **Dois motores de orçamento** com regras parecidas e resultados diferentes: risco de números diferentes em telas diferentes.
10. **Navegação:** hoje 6 itens (Início, Explorar, Planejador, Transporte, Hospedagem, Comunidade); **Descubra fora do menu**; Favoritos fora do menu. A história do orçamento não aparece.
11. **Monetização transparente:** falta o selo visível "oferta patrocinada" e uma regra de ordenação que não misture patrocínio com ranking.
12. **Medição de uso e retenção:** nada.

## 4. Proposta de implementação do MVP

**Princípios:** reutilizar o motor existente; nada de reescrever o app; fases pequenas com testes; dados de demonstração sempre rotulados; a descoberta básica nunca atrás de assinatura.

**Navegação (5 áreas), mapeada no que existe**

| Nova área | Aproveita | Observação |
|---|---|---|
| Descubra | `Discover` + Explorar (os 4 cartões de demonstração saem quando houver destinos reais) | Vira a tela inicial do uso |
| Compare | `Transporte` + `Hospedagem` + voos, com abas por tipo | Uma tela, três categorias de ordenação |
| Minha viagem | `Planejador` (abas, planos, itens) | Ganha datas, itinerário e compartilhar |
| Meu orçamento | resumo do `Planner` + novo acompanhamento | Gasto planejado × realizado e meta |
| Favoritos | `Saved` | Passa a guardar destinos, hospedagens e viagens |

A **Comunidade** (feed, perfis, avatar) **não é removida**: proponho mantê-la como entrada secundária (perfil/menu), porque tem valor e não foi pedido tirá-la. **Decisão sua.**

**Fases**

- **P1: Descoberta pelo orçamento (valor central).**
  - Região piloto e base inicial de destinos, com planilha editorial validada pelo `loadKnowledgeBase`.
  - Entradas novas: datas, tipo de hospedagem, preferência de transporte, orçamento total ou por pessoa.
  - Unificar o orçamento: o planejador passa a usar `computeBudget`, com ajuste manual de valores e selos "confirmado / estimado / indisponível".
- **P2: Comparação e `MinhaSelecao`.**
  - Ordenação determinística em três categorias, com critério explícito de "confortável".
  - Componente `MinhaSelecao` (imagem, preço em destaque, selo, vantagens, link, fonte e data) com os tokens visuais atuais.
  - Leitura das tabelas da camada nacional e fotos de fonte licenciada.
- **P3: Minha viagem, Meu orçamento, Favoritos.**
  - Entidade de viagem no Supabase com compartilhamento por link, itinerário por dia, gasto realizado, meta e economia.
- **P4: Meu próximo destino, IA e monetização.**
  - Meta financeira por destino, retenção, selo "oferta patrocinada", registro de parceiros, base para o Premium (sinalizadores de recurso, sem travar a descoberta).

**Regra de honestidade (aplica a tudo):** dado sem fonte aparece como "indisponível"; estimativa nunca é exibida como preço confirmado; avaliação só com fonte licenciada.

## 5. Dependências técnicas e comerciais

| Dependência | Quem | Efeito se faltar |
|---|---|---|
| Definir região piloto e cidades de origem iniciais | Você | Sem isso não há como montar a base |
| Fonte das **estimativas diárias** (comida, deslocamento local) e quem as define | Você + eu | Sem referência declarada, o orçamento fica incompleto |
| Preço de ônibus: parceria (Busbud, Buser, ClickBus), preço informado por usuários, ou horários da ANTT (sem preço) | Você (contatos) | Ônibus continua "informado pelo usuário" |
| Imagens licenciadas (Wikimedia Commons, Unsplash com crédito, ou fotos próprias) | Você + eu | Cartões sem foto ou com foto de demonstração |
| Avaliações: Tripadvisor (plano Discover: 1.000 entidades grátis e depois US$ 0,015 por entidade; política de cache a confirmar) | Você | Sem nota nas ofertas |
| Aprovação de afiliados (Travelpayouts, Omio, Busbud, CJ) | Você | Sem links de reserva e sem receita |
| Camada nacional validada (rodar SQL, segredos do GitHub, dry-run) | Você | Hospedagem sem base própria |
| Termos de uso e política de privacidade (obrigatórios para compartilhar e para a Google Play) | Eu escrevo, você revisa | Bloqueia lançamento público |
| Chave de IA (Gemini) com limite de gasto | Você | Sem assistente (o app funciona sem) |
| Tabelas novas no Supabase (viagens, metas) com RLS | Eu preparo, você roda | Sem compartilhar nem sincronizar |

## 6. Estimativa de esforço por etapa

Estimativa **minha**, em dias de desenvolvimento, **sem** contar o trabalho de levantar dados e esperar aprovações (que domina o prazo e depende de você):

| Etapa | Desenvolvimento | Trabalho seu (aprox.) |
|---|---|---|
| P1.1 Base piloto: planilha, importador e validação | 3 a 5 dias | 8 a 15 h levantando preços e fontes |
| P1.2 Entradas novas do Descubra + testes | 2 a 3 dias | |
| P1.3 Unificar orçamento + ajuste manual + selos | 2 a 3 dias | |
| Navegação em 5 áreas (desktop e celular) | 2 a 3 dias | decidir a Comunidade |
| **Total P1** | **9 a 14 dias** | |
| P2.1 Três categorias de ordenação + testes | 2 dias | |
| P2.2 `MinhaSelecao` + tela Compare | 3 a 4 dias | |
| P2.3 Camada nacional no app + fotos licenciadas | 3 a 5 dias | rodar a validação |
| **Total P2** | **8 a 11 dias** | |
| P3.1 Minha viagem (entidade, datas, itinerário) + compartilhar | 7 a 10 dias | |
| P3.2 Meu orçamento (realizado, meta, economia) | 4 a 5 dias | |
| P3.3 Favoritos ampliados | 1 a 2 dias | |
| **Total P3** | **12 a 17 dias** | |
| P4 Próximo destino, selo de patrocínio, base do Premium | 5 a 7 dias | |
| **Total geral** | **34 a 49 dias** de desenvolvimento | |

## 7. Riscos

- **Prometer demais cedo.** "Destinos compatíveis" só é honesto se a base tiver dado. Sugestão: lançar com poucas origens e poucos destinos bem cobertos, mostrando a **confiabilidade** de cada valor.
- **Ônibus**: sem fonte de preço, a conta fica parcial. O app já trata isso como "indisponível" e aceita o valor informado pelo usuário.
- **Receita**: depende de aprovações externas fora do nosso controle.
- **Escopo**: P1 sozinho já entrega a promessa central. Recomendo **não começar P3 antes de validar P1 com usuários reais** (beta fechado).

## 8. Decisões necessárias antes de começar

1. Região piloto e origens iniciais (sugestão: uma origem, por exemplo São Paulo, e um conjunto de 10 a 15 destinos).
2. Manter a Comunidade como entrada secundária? (sugestão: sim)
3. Quem define as estimativas diárias e com que método declarado.
4. O orçamento padrão é **total do grupo** (como na visão); manter a opção "por pessoa"?
5. Imagens: fonte licenciada ou fotos próprias.
6. Aprovar o início do **P1.1** (base piloto), a única parte que muda o produto de forma visível.
