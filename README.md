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
