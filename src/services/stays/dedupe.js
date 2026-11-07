// Deduplicação conservadora. Nada é apagado nem tem campos misturados entre fontes (licenças diferentes, como ODbL e
// CC BY-SA, não podem ser combinadas em um registro só): registros duplicados formam um GRUPO, com um registro principal
// (só dele vêm os campos exibidos) e as demais fontes listadas, cada uma com sua atribuição e seus preços.
//
// Agrupa só com sinal forte: mesma origem (fonte + id); OU mesma categoria + nome idêntico (normalizado) + até 150 m;
// OU mesmo site (domínio próprio) + até 300 m; OU mesmo telefone + até 300 m; OU, sem coordenadas (Cadastur), mesma categoria,
// nome idêntico e mesmo município. Nome parecido (≥ 0,6) a até 250 m só vira "possível duplicata": aparece, nunca some.
//
// E2: as regras agora vivem no motor central (`src/services/dedupe/engine.js`) e a montagem do item do Stay Finder no adaptador
// (`./dedupe-adapter.js`). Este arquivo só mantém o nome e o caminho públicos `groupDuplicates` para os consumidores de sempre
// (`search.js` e os testes): não há mais lógica aqui. A implementação anterior, verbatim, é a referência dos testes de paridade
// (cópia mantida só junto dos testes; nunca é carregada pela produção).
export { groupStayRecords as groupDuplicates } from './dedupe-adapter.js';
