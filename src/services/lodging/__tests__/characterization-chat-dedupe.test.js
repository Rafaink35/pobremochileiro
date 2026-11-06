// E0: TESTES DE CARACTERIZAÇÃO do agrupamento do chat (`dedupeLodgings`, usado por roteiro/tools.js).
// [CARACTERIZAÇÃO: comportamento atual, NÃO é requisito definitivo.] Documenta o que o código faz hoje, inclusive o indesejado
// (algoritmo guloso, regra de chave sem limites, nomes não latinos, mistura de campos). Dados SIMULADOS e fictícios.
import { describe, expect, it } from 'vitest';
import { dedupeLodgings } from '../lodgingModel.js';

const L = (id, o = {}) => ({
  id, kind: 'camp_site', name: `Nome ${id}`, lat: -27.6, lon: -48.5, state: null, city: null, website: null, phone: null, email: null,
  openingHours: null, price: null, chargeText: null, tents: null, caravans: null, feeTag: null, amenities: {},
  sources: [{ provider: 'osm', originalId: id }], ...o,
});
const withSource = (r, provider, originalId) => ({ ...r, sources: [{ provider, originalId }] });
const dlat = (m) => m / 111320;
const groups = (list) => dedupeLodgings(list).map((r) => r.sources.map((s) => s.originalId).join('+')).sort();

describe('CARACTERIZAÇÃO CHAT, regra de chave (mesma origem) isolada', () => {
  it('mesma origem funde mesmo com nomes, tipos e coordenadas completamente diferentes (sem limite de distância)', () => {
    const a = L('k', { name: 'Alfa', kind: 'camp_site' });
    const b = L('k2', { name: 'Beta', kind: 'hotel', lat: -20, lon: -40, sources: [{ provider: 'osm', originalId: 'k' }] });
    expect(dedupeLodgings([a, b])).toHaveLength(1);
  });
  it('controle: a mesma entrada com origens diferentes não funde (a chave é a única ligação)', () => {
    const a = L('k', { name: 'Alfa', kind: 'camp_site' });
    const b = L('k2', { name: 'Beta', kind: 'hotel', lat: -20, lon: -40 });
    expect(dedupeLodgings([a, b])).toHaveLength(2);
  });
  it('a chave funde mesmo sem nome; a regra de nome nunca funde sem nome', () => {
    expect(dedupeLodgings([L('u', { name: null }), L('u2', { name: null, sources: [{ provider: 'osm', originalId: 'u' }] })])).toHaveLength(1);
    expect(dedupeLodgings([L('u', { name: null }), L('v', { name: null, ...{ lat: -27.6 + dlat(10) } })])).toHaveLength(2);
  });
  it('um sem nome perto de um com nome, origens diferentes: não funde', () => {
    expect(dedupeLodgings([L('u', { name: null }), L('v', { name: 'Com nome', lat: -27.6 + dlat(10) })])).toHaveLength(2);
  });
  it('basta UMA fonte em comum entre as listas de fontes para fundir', () => {
    const a = L('a', { sources: [{ provider: 'osm', originalId: 'a' }, { provider: 'x', originalId: '9' }] });
    const b = L('b', { name: 'Outro', kind: 'hotel', lat: -10, sources: [{ provider: 'x', originalId: '9' }] });
    expect(dedupeLodgings([a, b])).toHaveLength(1);
  });
});

describe('CARACTERIZAÇÃO CHAT, regra de nome e distância', () => {
  it('mesmo tipo, mesmo nome (sem acento e caixa) e até 150 m funde; 160 m não', () => {
    expect(dedupeLodgings([L('a', { name: 'Camping do Sol' }), withSource(L('b', { name: 'CAMPING DO SOL', lat: -27.6 + dlat(149) }), 'outra', 'b')])).toHaveLength(1);
    expect(dedupeLodgings([L('a', { name: 'Camping do Sol' }), withSource(L('b', { name: 'CAMPING DO SOL', lat: -27.6 + dlat(160) }), 'outra', 'b')])).toHaveLength(2);
  });
  it('tipos diferentes não fundem pelo nome', () => {
    expect(dedupeLodgings([L('a', { name: 'Casa', kind: 'camp_site' }), withSource(L('b', { name: 'Casa', kind: 'hotel' }), 'outra', 'b')])).toHaveLength(2);
  });
  it('dois nomes NÃO latinos DIFERENTES, no mesmo lugar, fundem (a normalização só ASCII reduz ambos a vazio)', () => {
    const out = dedupeLodgings([L('j1', { name: '渋谷キャンプ場' }), L('j2', { name: '新宿オートキャンプ', lat: -27.6 + dlat(55) })]);
    expect(out).toHaveLength(1);
    expect(out[0].sources.map((s) => s.originalId)).toEqual(['j1', 'j2']);
  });
  it('nomes latinos diferentes não fundem', () => {
    expect(dedupeLodgings([L('a', { name: 'Camping do Sol' }), L('b', { name: 'Camping da Lua', lat: -27.6 + dlat(10) })])).toHaveLength(2);
  });
});

describe('CARACTERIZAÇÃO CHAT, algoritmo guloso: sem transitividade e dependente da ordem', () => {
  const a = L('a', { name: 'Casa', lat: -27.6 });
  const b = L('b', { name: 'Casa', lat: -27.6 + dlat(133) });
  const c = L('c', { name: 'Casa', lat: -27.6 + dlat(267) });

  it('a–b a 133 m e b–c a 134 m, mas a–c a 267 m: a ordem a,b,c separa c', () => {
    expect(groups([a, b, c])).toEqual(['a+b', 'c']);
  });
  it('a mesma entrada em outra ordem produz outra partição (b,a,c junta tudo)', () => {
    expect(groups([b, a, c])).toEqual(['b+a+c']);
  });
  it('a ordem a,c,b mantém a+b e c', () => {
    expect(groups([a, c, b])).toEqual(['a+b', 'c']);
  });
});

describe('CARACTERIZAÇÃO CHAT, mistura de campos entre registros fundidos', () => {
  it('preenche campos desconhecidos do principal com os de OUTRO registro (site, preço, comodidades) e preserva as duas fontes', () => {
    const a = L('m1', { name: 'Z', website: null, price: null, amenities: { toilets: null } });
    const b = withSource(L('m2', { name: 'z', website: 'https://z.test', price: { amount: 30, currency: 'BRL' }, amenities: { toilets: true }, lat: -27.6 + dlat(10) }), 'outra', 'm2');
    const [m] = dedupeLodgings([a, b]);
    expect(m.website).toBe('https://z.test');
    expect(m.price).toEqual({ amount: 30, currency: 'BRL' });
    expect(m.amenities.toilets).toBe(true);
    expect(m.conflicts).toEqual([]);
    expect(m.sources.map((s) => s.provider)).toEqual(['osm', 'outra']);
  });
  it('valores diferentes e ambos conhecidos: mantém o do principal e registra conflito (inclusive preço)', () => {
    const a = L('m1', { name: 'Z', website: 'https://a.test', price: { amount: 10, currency: 'BRL' } });
    const b = withSource(L('m2', { name: 'z', website: 'https://b.test', price: { amount: 30, currency: 'BRL' }, lat: -27.6 + dlat(10) }), 'outra', 'm2');
    const [m] = dedupeLodgings([a, b]);
    expect(m.website).toBe('https://a.test');
    expect(m.price).toEqual({ amount: 10, currency: 'BRL' });
    expect([...m.conflicts].sort()).toEqual(['price', 'website']);
  });
  it('o principal é o primeiro registro da lista (sem critério de escolha por fonte ou completude)', () => {
    const rich = L('r', { name: 'Z', website: 'https://r.test', phone: '1' });
    const poor = withSource(L('p', { name: 'Z', lat: -27.6 + dlat(10) }), 'outra', 'p');
    expect(dedupeLodgings([poor, rich])[0].id).toBe('p');
    expect(dedupeLodgings([rich, poor])[0].id).toBe('r');
  });
});
