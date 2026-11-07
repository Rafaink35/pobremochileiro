// Motor central de deduplicação (especificação v8.5/v8.6, etapa E2: centralização ESTRUTURAL, sem mudar regra nenhuma).
//
// O que existe aqui é o agrupamento LEGADO do Stay Finder, movido de `stays/dedupe.js` para um núcleo único, com os mesmos critérios,
// prioridades, limites e resultados (o teste de paridade compara este motor com a cópia verbatim do código antigo, em corpus aleatório).
// Nenhuma regra nova de identidade, similaridade ou relacionamento. Nada de OP1, de chaves por variante nem de PairAssessment: isso é
// de etapas futuras (E3a em diante). Nenhum adaptador além do Stay Finder está ativo; o chat segue com `dedupeLodgings` (E14).
//
// Interface pública (nomes do roadmap da especificação). Todas as formas de retorno abaixo são do MODO LEGADO e TRANSITÓRIAS: serão
// substituídas pelo contrato definitivo (PairAssessment, catálogo, `decisionRef`) na E4, sem herdar estas formas.
//   canonicalize(record)            → características normalizadas do registro (função pura; não altera o registro)
//   decidePair(a, b, ruleSet?)      → decisão legada de UM par: alcance, ligação (primeiro motivo que casa) e possível duplicata
//   cluster(records, ruleSet?)      → agrupamento por fecho transitivo; devolve, por grupo, o principal, os membros e os motivos
//   explain(clusterResult, ruleSet?)→ descrição estruturada de um grupo, produzida diretamente pelo motor (não relê texto)
//
// O que NÃO está aqui (de propósito): soma de fontes, preços, selos de registro e o formato da resposta do Stay Finder. Isso é do
// adaptador (`stays/dedupe-adapter.js`); a agregação de preços do grupo continua sendo a exceção de transição TE da especificação.
import { haversineMeters } from '../geo.js';
import { UNCLASSIFIED } from '../stays/categories.js';
import { nameSimilarity, normText, phoneDigits, websiteDomain } from '../stays/unicode.js';

/** Parâmetros do conjunto de regras legado. Valores IGUAIS aos literais de `dedupe.js` (150, 250, 300, 0,003, 0,6, prioridades). */
export const LEGACY_RULE_SET = Object.freeze({
  id: 'legacy-dedupe-1',
  cellDegrees: 0.003, // ~330 m de latitude; mesma largura em longitude (limitação conhecida em latitudes altas)
  reachMeters: 300, // par com coordenadas nos dois e mais longe que isso nem é avaliado
  nameMeters: 150,
  siteMeters: 300,
  phoneMeters: 300,
  possibleMeters: 250,
  possibleSimilarity: 0.6,
  sourcePriority: Object.freeze({ osm: 0, wikivoyage: 1, community: 2, cadastur: 3 }),
  unknownSourcePriority: 9,
});

/** Regras legadas, na ORDEM em que são avaliadas por par; só a primeira que casa é registrada (limitação do legado, LG-10). */
export const LEGACY_RULES = Object.freeze([
  Object.freeze({ id: 'L-KEY', order: 1, kind: 'same_source_key' }),
  Object.freeze({ id: 'L-NAMECITY', order: 2, kind: 'same_name_and_city_no_coordinates' }),
  Object.freeze({ id: 'L-NAME', order: 3, kind: 'same_name_nearby' }),
  Object.freeze({ id: 'L-SITE', order: 4, kind: 'same_site_nearby' }),
  Object.freeze({ id: 'L-PHONE', order: 5, kind: 'same_phone_nearby' }),
]);
const KIND = Object.fromEntries(LEGACY_RULES.map((r) => [r.id, r.kind]));

// "Não classificado" é compatível com qualquer categoria (só vale a categoria de quem tem evidência estruturada).
const sameCategory = (a, b) => a.category === b.category || a.category === UNCLASSIFIED || b.category === UNCLASSIFIED;
const completeness = (r) => ['website', 'phone', 'city', 'openingHours', 'address'].filter((f) => r[f]).length + (r.lat != null ? 2 : 0);
const reason = (rule, text, extra) => ({ rule, kind: KIND[rule], text, ...extra });

/** Características normalizadas de um registro. Pura: não altera o registro, não guarda estado entre chamadas. */
export function canonicalize(record) {
  return Object.freeze({
    nameKey: normText(record.name),
    cityKey: normText(record.city),
    domain: websiteDomain(record.website),
    phoneKey: phoneDigits(record.phone),
    located: record.lat != null && record.lon != null,
  });
}

// Primeiro motivo forte que casa (mesma ordem e mesmas condições de `strongReason` do código antigo), ou null.
function strongReason(a, b, dist, ca, cb, rs) {
  if (a.provider === b.provider && a.sourceId === b.sourceId) return reason('L-KEY', 'mesmo registro da fonte');
  if (!sameCategory(a, b)) return null;
  if (dist === null) {
    if (ca.nameKey && ca.nameKey === cb.nameKey && ca.cityKey && ca.cityKey === cb.cityKey) return reason('L-NAMECITY', 'mesmo nome e município (sem coordenadas)');
    return null;
  }
  if (ca.nameKey && ca.nameKey === cb.nameKey && dist <= rs.nameMeters) return reason('L-NAME', `mesmo nome a ${Math.round(dist)} m`, { distanceM: Math.round(dist) });
  if (ca.domain && ca.domain === cb.domain && dist <= rs.siteMeters) return reason('L-SITE', `mesmo site (${ca.domain})`);
  if (ca.phoneKey && ca.phoneKey === cb.phoneKey && dist <= rs.phoneMeters) return reason('L-PHONE', 'mesmo telefone');
  return null;
}

function decide(a, b, ca, cb, rs) {
  const located = a.lat != null && b.lat != null;
  const dist = located ? haversineMeters({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }) : null;
  if (located && dist > rs.reachMeters) return { distanceM: dist, withinReach: false, linked: false, reason: null, possibleDuplicate: false };
  const why = strongReason(a, b, dist, ca, cb, rs);
  if (why) return { distanceM: dist, withinReach: true, linked: true, reason: why, possibleDuplicate: false };
  const possibleDuplicate = Boolean(located && dist <= rs.possibleMeters && sameCategory(a, b) && nameSimilarity(a.name, b.name) >= rs.possibleSimilarity);
  return { distanceM: dist, withinReach: true, linked: false, reason: null, possibleDuplicate };
}

/**
 * Decisão legada de um par, sem a geração de pares candidatos (grade e município são de `cluster`).
 * Devolve { distanceM, withinReach, linked, reason, possibleDuplicate }; `reason` é { rule, kind, text, distanceM? } do PRIMEIRO
 * motivo que casa, ou null. `withinReach: false` = os dois têm coordenadas e estão além do alcance: o par não é avaliado.
 */
export function decidePair(a, b, ruleSet = LEGACY_RULE_SET) {
  return decide(a, b, canonicalize(a), canonicalize(b), ruleSet);
}

// Registro principal do grupo: classificado, com nome, prioridade de fonte, completude e id (mesmo critério e mesmo desempate estável).
function choosePrimary(members, rs) {
  const prio = (r) => rs.sourcePriority[r.provider] ?? rs.unknownSourcePriority;
  return [...members].sort((a, b) => (a.category === UNCLASSIFIED ? 1 : 0) - (b.category === UNCLASSIFIED ? 1 : 0) || (a.name?.trim() ? 0 : 1) - (b.name?.trim() ? 0 : 1) || prio(a) - prio(b) || completeness(b) - completeness(a) || String(a.id).localeCompare(String(b.id)))[0];
}

/**
 * Agrupa por fecho transitivo (sem veto, diâmetro nem tamanho máximo), avaliando só pares candidatos: células vizinhas da grade quando
 * há coordenadas, mesmo município quando falta. Devolve, na ordem do primeiro membro de cada grupo:
 *   { primary, members, memberIndexes, memberIds, reasons, possibleDuplicateIds }
 * `reasons` = motivos estruturados, sem repetição e na ordem em que o código antigo os registrava (primeiro motivo por par).
 * Os registros NÃO são alterados e não devem ser alterados durante a chamada.
 */
export function cluster(records, ruleSet = LEGACY_RULE_SET) {
  const rs = ruleSet;
  const parent = records.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const reasons = new Map(); // índice do grupo → motivos
  const possible = records.map(() => new Set());
  const canon = records.map(canonicalize);

  const cells = new Map();
  const cityBuckets = new Map();
  records.forEach((r, i) => {
    if (r.lat != null && r.lon != null) {
      const key = `${Math.floor(r.lat / rs.cellDegrees)}:${Math.floor(r.lon / rs.cellDegrees)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(i);
    } else {
      const c = canon[i].cityKey;
      if (c) {
        if (!cityBuckets.has(c)) cityBuckets.set(c, []);
        cityBuckets.get(c).push(i);
      }
    }
  });

  const consider = (i, j) => {
    if (i === j) return;
    const a = records[i];
    const b = records[j];
    const d = decide(a, b, canon[i], canon[j], rs);
    if (!d.withinReach) return;
    if (d.linked) {
      const ri = find(i);
      const rj = find(j);
      if (ri !== rj) {
        parent[rj] = ri;
        reasons.set(ri, [...(reasons.get(ri) ?? []), ...(reasons.get(rj) ?? []), d.reason]);
      } else reasons.set(ri, [...(reasons.get(ri) ?? []), d.reason]);
    } else if (d.possibleDuplicate) {
      possible[i].add(b.id);
      possible[j].add(a.id);
    }
  };

  records.forEach((r, i) => {
    if (r.lat != null && r.lon != null) {
      const cy = Math.floor(r.lat / rs.cellDegrees);
      const cx = Math.floor(r.lon / rs.cellDegrees);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) for (const j of cells.get(`${cy + dy}:${cx + dx}`) ?? []) if (j > i) consider(i, j);
    } else {
      const c = canon[i].cityKey;
      for (const j of cityBuckets.get(c) ?? []) if (j > i) consider(i, j);
      // Sem coordenadas × com coordenadas: compara por município.
      records.forEach((o, j) => { if (j !== i && o.lat != null && canon[j].cityKey === c && c) consider(Math.min(i, j), Math.max(i, j)); });
    }
  });

  const buckets = new Map();
  records.forEach((r, i) => {
    const root = find(i);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root).push(i);
  });
  return [...buckets.entries()].map(([root, idxs]) => {
    const members = idxs.map((i) => records[i]);
    const memberIds = [...new Set(members.map((m) => m.id))];
    const seen = new Set();
    const groupReasons = [];
    for (const r of reasons.get(root) ?? []) {
      if (!seen.has(r.text)) {
        seen.add(r.text);
        groupReasons.push(r);
      }
    }
    const ids = new Set(memberIds);
    return {
      primary: choosePrimary(members, rs),
      members,
      memberIndexes: idxs,
      memberIds,
      reasons: groupReasons,
      possibleDuplicateIds: [...new Set(idxs.flatMap((i) => [...possible[i]]))].filter((id) => !ids.has(id)),
    };
  });
}

/**
 * Descrição estruturada de um grupo, gerada pelo motor (sem reler texto). Modo legado: `origin: 'legacy'` e o aviso de que só o
 * primeiro motivo de cada par é registrado. NÃO é evidência de identidade nem tem peso de decisão.
 */
export function explain(clusterResult, ruleSet = LEGACY_RULE_SET) {
  return {
    ruleSet: ruleSet.id,
    mode: 'legacy',
    primaryId: clusterResult.primary.id,
    groupSize: clusterResult.members.length,
    reasons: clusterResult.reasons.map((r) => ({ ...r, origin: 'legacy' })),
    possibleDuplicateIds: [...clusterResult.possibleDuplicateIds],
    limitation: 'first_matching_rule_per_pair',
  };
}
