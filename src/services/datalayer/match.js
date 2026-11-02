// Correspondência entre registros de FONTES DIFERENTES. Nunca apaga nem mescla: só sugere vínculos
// ("candidate") com a razão, para revisão. A proveniência de cada lado fica intacta.
import { haversineMeters } from '../geo.js';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['hotel', 'hostel', 'pousada', 'camping', 'de', 'da', 'do', 'das', 'dos', 'e', 'the']);
const tokens = (s) => norm(s).split(' ').filter((t) => t && !STOP.has(t));

/** Similaridade de nomes (0 a 1) pelos termos que sobram sem palavras genéricas. */
export function nameSimilarity(a, b) {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common += 1;
  return common / Math.max(ta.size, tb.size);
}

const NEAR_M = 250;

/**
 * Vínculos candidatos entre dois conjuntos. Regra: fontes diferentes, mesma UF (quando as duas informam),
 * nome parecido (≥ 0,6) E (a menos de 250 m OU mesmo município). Sem nome ou sem lugar, não sugere.
 */
export function findLinkCandidates(left, right) {
  const out = [];
  for (const a of left) {
    for (const b of right) {
      if (a.source === b.source) continue;
      if (a.state && b.state && a.state !== b.state) continue;
      const sim = nameSimilarity(a.name, b.name);
      if (sim < 0.6) continue;
      const reasons = [`nome parecido (${sim.toFixed(2)})`];
      let located = false;
      if (a.latitude != null && b.latitude != null) {
        const d = haversineMeters({ lat: a.latitude, lon: a.longitude }, { lat: b.latitude, lon: b.longitude });
        if (d <= NEAR_M) {
          reasons.push(`a ${Math.round(d)} m`);
          located = true;
        }
      }
      if (!located && a.city && b.city && norm(a.city) === norm(b.city)) {
        reasons.push('mesmo município');
        located = true;
      }
      if (!located) continue;
      out.push({ a_id: a.id, b_id: b.id, score: Number(sim.toFixed(2)), reasons, status: 'candidate' });
    }
  }
  return out;
}
