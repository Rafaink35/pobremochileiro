// E1: campos ADITIVOS do contrato do Stay Finder (especificação v8.5, etapa E1). Nada aqui decide, agrupa, ordena ou filtra:
// são metadados derivados do resultado que o agrupamento legado JÁ produziu. Nenhum campo preexistente muda de valor.
//
// - ruleSetVersion: identifica o conjunto de regras em vigor. Hoje é o agrupamento legado, sem alteração.
// - unnamed.instances: instâncias recebidas pelo agrupamento SEM nome (hasName falso), contadas ANTES de qualquer agrupamento,
//   inclusive as que o legado absorve num grupo com nome (o legado as tira de `unnamed.count`; esta contagem não).
// - unnamed.records: registros consolidados classificados como sem nome. Sem OP1 efetiva (E1), cada instância é um registro,
//   então records = instances para QUALQUER regra de classificação de registro misto (UN-2): a E1 não depende de D45.
// - groupReasonDetails: forma estruturada dos motivos que o código atual JÁ registra em `groupReasons`. É derivada do texto
//   existente, só descreve (LG-3, ST-10), e herda a limitação do legado: cada par registra só o PRIMEIRO motivo que casa.
//   É uma estrutura TRANSITÓRIA: depende do TEXTO dos motivos atuais (se `dedupe.js` mudar o texto, a regra vira
//   `UNRECOGNIZED`). O futuro motor deve produzir os motivos estruturados DIRETAMENTE, sem reler texto, e este derivador sai.
// - Reversão: o parâmetro `additiveFields: false` (em `assembleResults` e `createStaySearch`) devolve a forma anterior à E1.
//   É um mecanismo de reversão POR CÓDIGO; não é feature flag operacional (nenhuma variável de ambiente, parâmetro de URL ou
//   tela o aciona).
import { hasName } from './display.js';

/** Conjunto de regras em vigor na E1: o agrupamento legado, inalterado. Mudar o texto só com mudança de regras. */
export const RULE_SET_VERSION = 'legacy-dedupe-1';

// Motivos que `dedupe.js` (strongReason) escreve hoje. A regra (L-*) segue a especificação v8.5, seção 1.3.6.
const REASON_PATTERNS = [
  { rule: 'L-KEY', kind: 'same_source_key', test: (t) => t === 'mesmo registro da fonte' },
  { rule: 'L-NAMECITY', kind: 'same_name_and_city_no_coordinates', test: (t) => t === 'mesmo nome e município (sem coordenadas)' },
  { rule: 'L-NAME', kind: 'same_name_nearby', test: (t) => /^mesmo nome a \d+ m$/.test(t), extra: (t) => ({ distanceM: Number(/\d+/.exec(t)[0]) }) },
  { rule: 'L-SITE', kind: 'same_site_nearby', test: (t) => /^mesmo site \(.+\)$/.test(t) },
  { rule: 'L-PHONE', kind: 'same_phone_nearby', test: (t) => t === 'mesmo telefone' },
];

/**
 * `groupReasons` (textos do código atual) → lista estruturada na mesma ordem. Texto desconhecido vira `UNRECOGNIZED`, sem inventar
 * regra. `origin: 'legacy'` marca que não é evidência de identidade nem tem peso de decisão.
 */
export function structureGroupReasons(groupReasons) {
  return (groupReasons ?? []).map((text) => {
    const hit = REASON_PATTERNS.find((p) => p.test(text));
    return hit
      ? { rule: hit.rule, kind: hit.kind, origin: 'legacy', text, ...(hit.extra ? hit.extra(text) : {}) }
      : { rule: 'UNRECOGNIZED', kind: 'unrecognized', origin: 'legacy', text };
  });
}

/** Instâncias sem nome entre os registros recebidos (antes de agrupar). */
export const countUnnamedInstances = (records) => records.filter((r) => !hasName(r)).length;

/** Registros sem nome após consolidação. Sem OP1 efetiva há uma instância por registro (UN-2). */
export const countUnnamedRecords = (unnamedInstances) => unnamedInstances;
