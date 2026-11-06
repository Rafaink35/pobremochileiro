// Seleção do que a tela exibe (P2) e tratamento de registros sem nome (P3).
// - Limite inicial de 100 resultados NO TOTAL (não por categoria nem por seção); "Mostrar mais" libera blocos de 50.
// - A seleção é por PROXIMIDADE do centro do destino. Proximidade não é avaliação nem qualidade.
// - Os "melhores preços verificados" (até 3) entram sempre e contam no total exibido.
// - Registros sem nome ficam no processamento (deduplicação, classificação de preço) e na resposta (contados e em `unnamed.items`),
//   mas fora da lista principal; só os com nome concorrem ao ranking de preço, porque um local sem nome não pode ser indicado.
import { bestPrice } from './price.js';

export const INITIAL_LIMIT = 100;
export const PAGE_SIZE = 50;
export const MAX_LIMIT = 500; // teto de segurança para o tamanho da resposta

export function normalizeLimit(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return INITIAL_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export const hasName = (item) => typeof item?.name === 'string' && item.name.trim() !== '';

const dist = (i) => i.distanceM ?? Number.POSITIVE_INFINITY; // sem coordenadas: depois de quem tem distância
const byProximity = (a, b) => {
  const da = dist(a);
  const db = dist(b);
  if (da !== db) return da < db ? -1 : 1;
  return String(a.name).localeCompare(String(b.name), 'pt-BR') || String(a.id).localeCompare(String(b.id));
};

const SECTIONS = ['withPrice', 'stalePrice', 'noPrice'];

/**
 * ranking: resultado de rankStays() sobre os registros COM nome. unnamedItems: registros sem nome (já agrupados).
 * Devolve { groups, counts, unnamed }.
 */
export function selectForDisplay(ranking, unnamedItems, limit, now = new Date()) {
  const ranked = ranking.ranked;
  const others = SECTIONS.flatMap((section) => ranking[section].map((item) => ({ item, section }))).sort((a, b) => byProximity(a.item, b.item));
  const room = Math.max(0, limit - ranked.length);
  const chosen = others.slice(0, room);
  const groups = { ranked, withPrice: [], stalePrice: [], noPrice: [] };
  for (const { item, section } of chosen) groups[section].push(item); // cada seção mantém a ordem de proximidade
  const total = ranked.length + others.length;
  const shown = ranked.length + chosen.length;
  const totals = { ranked: ranked.length, withPrice: ranking.withPrice.length, stalePrice: ranking.stalePrice.length, noPrice: ranking.noPrice.length };
  return {
    groups,
    counts: {
      // hasMore só é verdadeiro enquanto o limite pode crescer; no teto (500) o botão some e `capped` avisa que ainda há mais
      total, shown, omitted: total - shown, hasMore: shown < total && limit < MAX_LIMIT, capped: shown < total && limit >= MAX_LIMIT, limit, pageSize: PAGE_SIZE, maxLimit: MAX_LIMIT, order: 'proximity',
      ranked: groups.ranked.length, withPrice: groups.withPrice.length, stalePrice: groups.stalePrice.length, noPrice: groups.noPrice.length,
      totals,
      unnamedHidden: unnamedItems.length,
    },
    unnamed: {
      count: unnamedItems.length,
      items: unnamedItems.map((i) => ({
        id: i.id, category: i.category, lat: i.lat, lon: i.lon, distanceM: i.distanceM ?? null, groupSize: i.groupSize,
        sourceUrl: i.sources?.[0]?.sourceUrl ?? null, priceClass: bestPrice(i.prices, now).class,
      })),
    },
  };
}
