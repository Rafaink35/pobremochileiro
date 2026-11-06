// Deduplicação conservadora. Nada é apagado nem tem campos misturados entre fontes (licenças diferentes, como ODbL e
// CC BY-SA, não podem ser combinadas em um registro só): registros duplicados formam um GRUPO, com um registro principal
// (só dele vêm os campos exibidos) e as demais fontes listadas, cada uma com sua atribuição e seus preços.
//
// Agrupa só com sinal forte: mesma origem (fonte + id); OU mesma categoria + nome idêntico (normalizado) + até 150 m;
// OU mesmo site (domínio próprio) + até 300 m; OU mesmo telefone + até 300 m; OU, sem coordenadas (Cadastur), mesma categoria,
// nome idêntico e mesmo município. Nome parecido (≥ 0,6) a até 250 m só vira "possível duplicata": aparece, nunca some.
import { haversineMeters } from '../geo.js';
import { nameSimilarity, normText, phoneDigits, websiteDomain } from './unicode.js';

const CELL = 0.003; // ~330 m de latitude
const SOURCE_PRIORITY = { osm: 0, wikivoyage: 1, community: 2, cadastur: 3 };
const completeness = (r) => ['website', 'phone', 'city', 'openingHours', 'address'].filter((f) => r[f]).length + (r.lat != null ? 2 : 0);

function strongReason(a, b, dist, nameA, nameB) {
  if (a.provider === b.provider && a.sourceId === b.sourceId) return 'mesmo registro da fonte';
  if (a.category !== b.category) return null;
  if (dist === null) {
    const ca = normText(a.city);
    const cb = normText(b.city);
    if (nameA && nameA === nameB && ca && ca === cb) return 'mesmo nome e município (sem coordenadas)';
    return null;
  }
  if (nameA && nameA === nameB && dist <= 150) return `mesmo nome a ${Math.round(dist)} m`;
  const da = websiteDomain(a.website);
  if (da && da === websiteDomain(b.website) && dist <= 300) return `mesmo site (${da})`;
  const pa = phoneDigits(a.phone);
  if (pa && pa === phoneDigits(b.phone) && dist <= 300) return 'mesmo telefone';
  return null;
}

export function groupDuplicates(records) {
  const parent = records.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const reasons = new Map(); // índice do grupo → motivos
  const possible = records.map(() => new Set());
  const names = records.map((r) => normText(r.name));

  const cells = new Map();
  const cityBuckets = new Map();
  records.forEach((r, i) => {
    if (r.lat != null && r.lon != null) {
      const key = `${Math.floor(r.lat / CELL)}:${Math.floor(r.lon / CELL)}`;
      cells.set(key, [...(cells.get(key) ?? []), i]);
    } else {
      const c = normText(r.city);
      if (c) cityBuckets.set(c, [...(cityBuckets.get(c) ?? []), i]);
    }
  });

  const consider = (i, j) => {
    if (i === j) return;
    const a = records[i];
    const b = records[j];
    const located = a.lat != null && b.lat != null;
    const dist = located ? haversineMeters({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }) : null;
    if (located && dist > 300) return;
    const why = strongReason(a, b, dist, names[i], names[j]);
    if (why) {
      const ri = find(i);
      const rj = find(j);
      if (ri !== rj) {
        parent[rj] = ri;
        reasons.set(ri, [...(reasons.get(ri) ?? []), ...(reasons.get(rj) ?? []), why]);
      } else reasons.set(ri, [...(reasons.get(ri) ?? []), why]);
    } else if (located && dist <= 250 && a.category === b.category && nameSimilarity(a.name, b.name) >= 0.6) {
      possible[i].add(b.id);
      possible[j].add(a.id);
    }
  };

  records.forEach((r, i) => {
    if (r.lat != null && r.lon != null) {
      const cy = Math.floor(r.lat / CELL);
      const cx = Math.floor(r.lon / CELL);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) for (const j of cells.get(`${cy + dy}:${cx + dx}`) ?? []) if (j > i) consider(i, j);
    } else {
      const c = normText(r.city);
      for (const j of cityBuckets.get(c) ?? []) if (j > i) consider(i, j);
      // Sem coordenadas × com coordenadas: compara por município.
      records.forEach((o, j) => { if (j !== i && o.lat != null && normText(o.city) === c && c) consider(Math.min(i, j), Math.max(i, j)); });
    }
  });

  const buckets = new Map();
  records.forEach((r, i) => buckets.set(find(i), [...(buckets.get(find(i)) ?? []), i]));
  return [...buckets.entries()].map(([root, idxs]) => {
    const members = idxs.map((i) => records[i]);
    const primary = [...members].sort((a, b) => (SOURCE_PRIORITY[a.provider] ?? 9) - (SOURCE_PRIORITY[b.provider] ?? 9) || completeness(b) - completeness(a) || String(a.id).localeCompare(String(b.id)))[0];
    const sources = [];
    for (const m of members) for (const s of m.sources) if (!sources.some((x) => x.provider === s.provider && x.originalId === s.originalId)) sources.push(s);
    const prices = members.flatMap((m) => m.prices ?? []);
    const memberIds = new Set(members.map((m) => m.id));
    return {
      ...primary,
      sources,
      prices,
      registries: [...new Set(members.map((m) => m.registry).filter(Boolean))],
      groupSize: members.length,
      groupReasons: [...new Set(reasons.get(root) ?? [])],
      memberIds: [...memberIds],
      possibleDuplicates: [...new Set(idxs.flatMap((i) => [...possible[i]]))].filter((id) => !memberIds.has(id)),
    };
  });
}
