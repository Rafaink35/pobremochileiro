import { describe, expect, it } from 'vitest';
import { rankStays } from '../rank.js';
import { groupDuplicates } from '../dedupe.js';
import { NOW } from './fixtures/index.js';

const at = (days) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const src = (provider, id) => ({ provider, name: provider, license: provider === 'osm' ? 'ODbL 1.0' : 'CC BY-SA 3.0', attribution: provider, originalId: id, sourceUrl: null, collectedAt: at(0), lastEditedAt: at(1) });
const price = (amount, o = {}) => ({ status: 'published', amount, currency: 'EUR', unit: { basis: 'person', period: 'night' }, observedAt: at(10), source: { name: 'OSM' }, ...o });
let n = 0;
const rec = (o = {}) => {
  n += 1;
  const provider = o.provider ?? 'osm';
  return { id: `${provider}:${n}`, provider, sourceId: String(n), name: `Local ${n}`, category: 'hostel', lat: 38.7 + n * 0.01, lon: -9.1, city: null, website: null, phone: null, prices: [], sources: [src(provider, String(n))], ...o };
};

describe('ranking das opções com preço verificável', () => {
  it('nenhum preço verificável: sem ranking, e quem não tem preço nunca é "mais barato"', () => {
    const r = rankStays([rec(), rec(), rec()], NOW);
    expect(r.ranked).toEqual([]);
    expect(r.noPrice).toHaveLength(3);
    expect(r.notes.join(' ')).toMatch(/Nenhuma opção com preço verificável/);
  });
  it('1 opção verificável: mostra 1; 2: mostra 2; 3 ou mais: as 3 melhores', () => {
    const one = rankStays([rec({ prices: [price(30)] }), rec(), rec()], NOW);
    expect(one.ranked.map((i) => i.pricing.amount)).toEqual([30]);
    expect(one.noPrice).toHaveLength(2);
    const two = rankStays([rec({ prices: [price(30)] }), rec({ prices: [price(20)] }), rec()], NOW);
    expect(two.ranked.map((i) => i.pricing.amount)).toEqual([20, 30]);
    const five = rankStays([40, 10, 30, 20, 50].map((a) => rec({ prices: [price(a)] })), NOW);
    expect(five.ranked.map((i) => i.pricing.amount)).toEqual([10, 20, 30]);
    expect(five.ranked.map((i) => i.rank)).toEqual([1, 2, 3]);
    expect(five.withPrice.map((i) => i.pricing.amount)).toEqual([40, 50]);
  });
  it('sem preço nunca entra no ranking, mesmo havendo menos de 3 com preço', () => {
    const r = rankStays([rec({ prices: [price(30)] }), rec(), rec()], NOW);
    expect(r.ranked.every((i) => i.pricing.amount > 0)).toBe(true);
    expect(r.noPrice.every((i) => i.pricing.class === 'unavailable')).toBe(true);
  });
  it('preço desatualizado fica separado e não concorre', () => {
    const r = rankStays([rec({ prices: [price(5, { observedAt: at(400) })] }), rec({ prices: [price(30)] })], NOW);
    expect(r.ranked.map((i) => i.pricing.amount)).toEqual([30]);
    expect(r.stalePrice).toHaveLength(1);
  });
  it('moedas ou unidades diferentes não são comparadas entre si', () => {
    const r = rankStays([
      rec({ prices: [price(20)] }), rec({ prices: [price(25)] }), rec({ prices: [price(3, { currency: 'JPY' })] }),
      rec({ prices: [price(90, { unit: { basis: 'room', period: 'night' } })] }),
    ], NOW);
    expect(r.rankKey).toBe('EUR|person|night');
    expect(r.ranked.map((i) => i.pricing.amount)).toEqual([20, 25]);
    expect(r.withPrice).toHaveLength(2);
    expect(r.notes.join(' ')).toMatch(/não entraram no ranking/);
  });
  it('preço sem unidade por noite aparece em "com preço", sem ranking', () => {
    const r = rankStays([rec({ prices: [price(20, { unit: null })] })], NOW);
    expect(r.ranked).toEqual([]);
    expect(r.withPrice).toHaveLength(1);
    expect(r.notes.join(' ')).toMatch(/nenhum comparável/);
  });
  it('gratuito segundo a fonte fica em "com preço" e não vira o mais barato do ranking', () => {
    const r = rankStays([rec({ prices: [{ status: 'published', free: true, observedAt: at(3), source: { name: 'OSM' } }] }), rec({ prices: [price(20)] })], NOW);
    expect(r.ranked.map((i) => i.pricing.amount)).toEqual([20]);
    expect(r.withPrice[0].pricing.free).toBe(true);
  });
  it('desempate: confirmado antes de publicado, depois nome', () => {
    const a = rec({ name: 'B', prices: [price(20)] });
    const b = rec({ name: 'A', prices: [price(20, { status: 'confirmed' })] });
    const c = rec({ name: 'C', prices: [price(20)] });
    expect(rankStays([a, c, b], NOW).ranked.map((i) => i.name)).toEqual(['A', 'B', 'C']);
  });
  it('é determinístico: a ordem de entrada não muda o resultado', () => {
    const items = [30, 10, 20, 40].map((a) => rec({ prices: [price(a)] }));
    expect(rankStays([...items].reverse(), NOW).ranked.map((i) => i.pricing.amount)).toEqual(rankStays(items, NOW).ranked.map((i) => i.pricing.amount));
  });
});

describe('deduplicação conservadora', () => {
  const a = (o) => rec({ lat: 38.7110, lon: -9.1290, name: 'Hostel Alfama', ...o });

  it('mesma origem (fonte e id) agrupa', () => {
    const x = a({ sourceId: '9', id: 'osm:9' });
    const y = a({ sourceId: '9', id: 'osm:9b' });
    expect(groupDuplicates([x, y])).toHaveLength(1);
  });
  it('mesmo tipo, mesmo nome e até 150 m agrupa; todas as fontes ficam listadas', () => {
    const x = a({});
    const y = a({ provider: 'wikivoyage', lat: 38.7115, lon: -9.1292 });
    const [g] = groupDuplicates([x, y]);
    expect(groupDuplicates([x, y])).toHaveLength(1);
    expect(g.sources.map((s) => s.provider).sort()).toEqual(['osm', 'wikivoyage']);
    expect(g.provider).toBe('osm'); // principal: OpenStreetMap
    expect(g.groupSize).toBe(2);
    expect(g.groupReasons.join(' ')).toMatch(/mesmo nome/);
  });
  it('não mistura campos entre fontes de licenças diferentes', () => {
    const osm = a({ phone: null, website: null });
    const wiki = a({ provider: 'wikivoyage', phone: '+351 21 123 4567', website: 'https://exemplo.test' });
    const [g] = groupDuplicates([osm, wiki]);
    expect(g.phone).toBeNull();
    expect(g.website).toBeNull();
  });
  it('preços de cada fonte são preservados com a atribuição de cada uma', () => {
    const osm = a({ prices: [price(20, { source: { name: 'OSM' } })] });
    const wiki = a({ provider: 'wikivoyage', prices: [price(22, { source: { name: 'Wikivoyage' } })] });
    const [g] = groupDuplicates([osm, wiki]);
    expect(g.prices.map((p) => p.source.name).sort()).toEqual(['OSM', 'Wikivoyage']);
  });
  it('nome igual mas longe (> 150 m) não agrupa', () => {
    expect(groupDuplicates([a({}), a({ lat: 38.7210 })])).toHaveLength(2);
  });
  it('categorias diferentes não agrupam, mesmo com o mesmo nome e lugar', () => {
    expect(groupDuplicates([a({ category: 'hostel' }), a({ category: 'hotel' })])).toHaveLength(2);
  });
  it('mesmo site próprio ou mesmo telefone, até 300 m, agrupa; site de rede social não', () => {
    expect(groupDuplicates([a({ name: 'A' , website: 'https://casa-x.test' }), a({ name: 'Outro nome', lat: 38.7125, website: 'https://www.casa-x.test/pt' })])).toHaveLength(1);
    expect(groupDuplicates([a({ name: 'A', phone: '+351 211 234 567' }), a({ name: 'Outro nome', lat: 38.7125, phone: '211234567' })])).toHaveLength(1);
    expect(groupDuplicates([a({ name: 'A', website: 'https://facebook.com/x' }), a({ name: 'Outro', lat: 38.7125, website: 'https://facebook.com/x' })])).toHaveLength(2);
  });
  it('nome parecido e próximo só vira "possível duplicata", sem esconder nenhum', () => {
    const out = groupDuplicates([a({ name: 'Casa do Mar Verde' }), a({ name: 'Mar Verde Casa', lat: 38.7125 })]);
    expect(out).toHaveLength(2);
    expect(out.every((g) => g.possibleDuplicates.length === 1)).toBe(true);
  });
  it('registro sem coordenadas (Cadastur) agrupa com nome e município idênticos e leva o selo de registro', () => {
    const osm = a({ city: 'Lisboa' });
    const cad = rec({ provider: 'cadastur', name: 'Hostel Alfama', lat: null, lon: null, city: 'LISBOA', registry: 'cadastur' });
    const out = groupDuplicates([osm, cad]);
    expect(out).toHaveLength(1);
    expect(out[0].registries).toEqual(['cadastur']);
    expect(out[0].lat).not.toBeNull();
  });
  it('sem coordenadas e município diferente não agrupa', () => {
    const cad = rec({ provider: 'cadastur', name: 'Hostel Alfama', lat: null, lon: null, city: 'Porto' });
    expect(groupDuplicates([a({ city: 'Lisboa' }), cad])).toHaveLength(2);
  });
  it('nomes em outros alfabetos: japonês igual e próximo agrupa', () => {
    const x = rec({ name: '渋谷ゲストハウス', lat: 35.658, lon: 139.701, category: 'pousada' });
    const y = rec({ name: '渋谷ゲストハウス', provider: 'wikivoyage', lat: 35.6582, lon: 139.7011, category: 'pousada' });
    expect(groupDuplicates([x, y])).toHaveLength(1);
  });
  it('lista grande não é quadrática: 4.000 pontos espalhados agrupam rápido', () => {
    const big = Array.from({ length: 4000 }, (_, i) => rec({ name: `Lugar ${i}`, lat: -30 + (i % 80) * 0.02, lon: -50 + Math.floor(i / 80) * 0.02 }));
    const t = Date.now();
    expect(groupDuplicates(big)).toHaveLength(4000);
    expect(Date.now() - t).toBeLessThan(3000);
  });
});
