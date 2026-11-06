// Categorias do Stay Finder. "Trabalho em troca" e "Au pair" continuam como abas próprias da tela (não são buscas de local).
export const STAY_CATEGORIES = Object.freeze(['camping', 'hostel', 'pousada', 'ecovila', 'colaborativa', 'hotel']);

export const CATEGORY_LABEL = Object.freeze({
  camping: 'Camping', hostel: 'Hostel', pousada: 'Pousada', ecovila: 'Ecovila', colaborativa: 'Hospedagem colaborativa', hotel: 'Hotel',
});

// Valor da tag `tourism` do OpenStreetMap por categoria. Ecovila e hospedagem colaborativa NÃO têm tag confiável no OSM:
// não são inferidas por palavra no nome; só entram por cadastro próprio aprovado.
export const OSM_TOURISM_BY_CATEGORY = Object.freeze({
  camping: ['camp_site', 'caravan_site'],
  hostel: ['hostel'],
  pousada: ['guest_house'],
  hotel: ['hotel', 'motel'],
});

const REVERSE = Object.fromEntries(Object.entries(OSM_TOURISM_BY_CATEGORY).flatMap(([cat, tags]) => tags.map((t) => [t, cat])));
export const categoryOfOsmTourism = (tourism) => REVERSE[tourism] ?? null;

/** Categorias sem fonte aberta confiável: a tela explica isso em vez de listar algo inventado. */
export const COMMUNITY_ONLY_CATEGORIES = Object.freeze(['ecovila', 'colaborativa']);

/** Valida a lista pedida. Vazio = todas as categorias. Devolve null se houver valor desconhecido. */
export function parseCategories(input) {
  const list = (Array.isArray(input) ? input : String(input ?? '').split(',')).map((c) => String(c).trim()).filter(Boolean);
  if (!list.length) return [...STAY_CATEGORIES];
  return list.every((c) => STAY_CATEGORIES.includes(c)) ? [...new Set(list)] : null;
}

// Tipo usado pela tela já existente (PlaceDetail, filtros, planejador): mantém a compatibilidade.
const LEGACY_KIND = { camping: 'camp_site', hostel: 'hostel', pousada: 'guest_house', hotel: 'hotel', ecovila: 'camp_site', colaborativa: 'guest_house' };
export const legacyKindOf = (category, osmKind) => osmKind ?? LEGACY_KIND[category] ?? 'hotel';

// Categoria a partir de palavra explícita no NOME do próprio estabelecimento (usada só para fontes sem tipo, como o Wikivoyage).
// Nunca usada para ecovila ou hospedagem colaborativa.
const NAME_HINTS = [
  ['hostel', /(hostel|hostal|albergue|auberge de jeunesse|ユースホステル|ホステル|青年旅舍|хостел)/iu],
  ['camping', /(camping|campsite|campground|caravan park|キャンプ場|露营|кемпинг)/iu],
  ['pousada', /(pousada|guest ?house|pens[aã]o|pension|posada|bed (and|&) breakfast|b&b|ゲストハウス|民宿|гостевой дом)/iu],
  ['hotel', /(hotel|motel|ホテル|酒店|旅馆|отель)/iu],
];
export function categoryFromName(name) {
  const n = String(name ?? '');
  return NAME_HINTS.find(([, re]) => re.test(n))?.[0] ?? null;
}
