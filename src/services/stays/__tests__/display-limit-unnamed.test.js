// P2 (limite e "mostrar mais") e P3 (registros sem nome). Registros SIMULADOS e fictícios, só para teste.
import { describe, expect, it } from 'vitest';
import { createStaySearch } from '../search.js';
import { INITIAL_LIMIT, MAX_LIMIT, normalizeLimit, PAGE_SIZE } from '../display.js';
import { createStaleCache } from '../cache.js';
import handler from '../../../../netlify/functions/stays.mjs';
import { NOW } from './fixtures/index.js';

const C = { lat: 38.7, lon: -9.1 };
const day = '2026-10-20T00:00:00.000Z';
const chargePrice = (amount) => ({ status: 'published', amount, currency: 'EUR', unit: { basis: 'person', period: 'night' }, observedAt: day, source: { name: 'OSM' } });
let n = 0;
const rec = (o = {}) => {
  n += 1;
  return {
    id: `osm:node/${n}`, provider: 'osm', sourceId: `node/${n}`, name: `Local ${n}`, category: 'hotel', osmKind: 'hotel', lat: C.lat + n * 0.0001, lon: C.lon, city: null, website: null, phone: null,
    feeTag: null, prices: [], sources: [{ provider: 'osm', name: 'OpenStreetMap', license: 'ODbL 1.0', attribution: 'x', originalId: `node/${n}`, sourceUrl: `https://osm.test/${n}`, collectedAt: NOW.toISOString() }], ...o,
  };
};
const source = (records) => {
  const s = { calls: 0, id: 'osm', describe: () => ({ id: 'osm', name: 'OpenStreetMap (Overpass)', license: 'ODbL 1.0', attribution: 'x' }), supports: () => ({ ok: true }), async search() { s.calls += 1; return { records, collectedAt: NOW.toISOString() }; } };
  return s;
};
const svc = (src) => createStaySearch({ resolver: null, sources: [src], now: () => NOW, cache: createStaleCache({ now: () => NOW.getTime() }) });
const run = (s, extra = {}) => s.search({ lat: C.lat, lon: C.lon, name: 'Teste', categories: 'hotel', ...extra });
const flat = (g) => [...g.ranked, ...g.withPrice, ...g.stalePrice, ...g.noPrice];

describe('P2: limite inicial de 100 no total, por proximidade, com "mostrar mais" de 50 em 50', () => {
  const many = () => Array.from({ length: 300 }, () => rec());

  it('constantes: 100 iniciais, blocos de 50, teto de segurança de 500', () => {
    expect([INITIAL_LIMIT, PAGE_SIZE, MAX_LIMIT]).toEqual([100, 50, 500]);
  });

  it('mostra 100 no total (não por seção) e informa total, exibidos e restantes', async () => {
    const r = await run(svc(source(many())));
    expect(flat(r.groups)).toHaveLength(100);
    expect(r.counts).toMatchObject({ total: 300, shown: 100, omitted: 200, hasMore: true, limit: 100, pageSize: 50, order: 'proximity' });
  });

  it('os exibidos são os mais próximos do centro, em ordem crescente de distância', async () => {
    const r = await run(svc(source(many())));
    const items = r.groups.noPrice;
    const d = items.map((i) => i.distanceM);
    expect(d).toEqual([...d].sort((a, b) => a - b));
    const farthestShown = d.at(-1);
    // nenhum dos não exibidos é mais próximo que o mais distante exibido
    const all = await run(svc(source(many())), { limit: 500 });
    const hidden = flat(all.groups).filter((i) => !items.some((x) => x.id === i.id));
    expect(hidden.every((i) => i.distanceM >= farthestShown)).toBe(true);
  });

  it('o "melhores preços verificados" entra sempre (mesmo distante) e conta no total de 100', async () => {
    const records = many();
    const far = rec({ name: 'Barato e distante', lat: C.lat + 0.2, prices: [chargePrice(12)] });
    const r = await run(svc(source([...records, far])));
    expect(r.groups.ranked.map((i) => i.name)).toEqual(['Barato e distante']);
    expect(flat(r.groups)).toHaveLength(100);
    expect(r.counts.shown).toBe(100);
    expect(r.counts.total).toBe(301);
  });

  it('"mostrar mais": limite 150 devolve 150 e NÃO consulta a fonte de novo (cache de 24 h)', async () => {
    const src = source(many());
    const s = svc(src);
    await run(s);
    const more = await run(s, { limit: 150 });
    expect(flat(more.groups)).toHaveLength(150);
    expect(more.counts).toMatchObject({ shown: 150, omitted: 150, limit: 150 });
    expect(src.calls).toBe(1);
    const last = await run(s, { limit: 300 });
    expect(last.counts).toMatchObject({ shown: 300, omitted: 0, hasMore: false });
  });

  it('limite inválido volta a 100; acima do teto vira 500', async () => {
    for (const bad of [undefined, null, '', 'abc', 0, -5, 3.7]) expect(normalizeLimit(bad)).toBe(100);
    expect(normalizeLimit('150')).toBe(150);
    expect(normalizeLimit(99999)).toBe(500);
    const r = await run(svc(source(Array.from({ length: 600 }, () => rec()))), { limit: 99999 });
    expect(r.counts.shown).toBe(500);
  });

  it('no teto de 500 o botão deixa de existir e a resposta avisa que há mais (capped)', async () => {
    const s = svc(source(Array.from({ length: 700 }, () => rec())));
    const mid = await run(s, { limit: 450 });
    expect(mid.counts).toMatchObject({ shown: 450, hasMore: true, capped: false });
    const top = await run(s, { limit: 500 });
    expect(top.counts).toMatchObject({ shown: 500, omitted: 200, hasMore: false, capped: true, maxLimit: 500 });
  });

  it('com poucos resultados, mostra todos e não oferece "mostrar mais"', async () => {
    const r = await run(svc(source(Array.from({ length: 12 }, () => rec()))));
    expect(r.counts).toMatchObject({ total: 12, shown: 12, omitted: 0, hasMore: false });
  });

  it('as categorias não são eliminadas: o limite vale para o total, e o pedido de várias categorias mantém todas', async () => {
    const mixed = [...Array.from({ length: 120 }, () => rec({ category: 'hotel' })), ...Array.from({ length: 120 }, () => rec({ category: 'hostel', osmKind: 'hostel' }))];
    const r = await run(svc(source(mixed)), { categories: 'hotel,hostel' });
    expect(flat(r.groups)).toHaveLength(100);
    expect(r.counts.total).toBe(240);
    const all = await run(svc(source(mixed)), { categories: 'hotel,hostel', limit: 500 });
    expect(new Set(flat(all.groups).map((i) => i.category))).toEqual(new Set(['hotel', 'hostel']));
  });

  it('o endpoint repassa o limite pedido', async () => {
    const calls = [];
    const stub = { search: async (p) => { calls.push(p); return { status: 'ok', groups: { ranked: [], withPrice: [], stalePrice: [], noPrice: [] } }; } };
    await handler(new Request('http://x/api/stays?lat=1&lon=2&name=X&limit=150', { headers: { 'x-forwarded-for': '10.7.7.1' } }), { service: stub });
    expect(calls[0].limit).toBe('150');
  });
});

describe('P3: registros sem nome ficam no processamento e fora da lista principal, contados', () => {
  const sample = () => [
    ...Array.from({ length: 8 }, () => rec()),
    rec({ name: null }), rec({ name: '' }), rec({ name: '   ' }),
  ];

  it('não aparecem na lista, são contados e permanecem na resposta (nada é descartado)', async () => {
    const r = await run(svc(source(sample())));
    expect(flat(r.groups)).toHaveLength(8);
    expect(r.groups.noPrice.every((i) => i.name)).toBe(true);
    expect(r.counts).toMatchObject({ total: 8, shown: 8, unnamedHidden: 3 });
    expect(r.unnamed.count).toBe(3);
    expect(r.unnamed.items).toHaveLength(3);
    expect(r.unnamed.items[0]).toMatchObject({ category: 'hotel', priceClass: 'unavailable' });
    expect(r.unnamed.items[0].sourceUrl).toMatch(/^https:\/\/osm\.test\//);
  });

  it('o sem-nome não entra no ranking de preço, mas o preço dele é classificado no processamento', async () => {
    const records = [rec({ name: 'Com nome', prices: [chargePrice(30)] }), rec({ name: null, prices: [chargePrice(5)] })];
    const r = await run(svc(source(records)));
    expect(r.groups.ranked.map((i) => i.name)).toEqual(['Com nome']);
    expect(r.unnamed.items[0].priceClass).toBe('published'); // classificado, não descartado
  });

  it('continua participando da deduplicação: sem nome + com nome no mesmo site e lugar viram um só (o principal é o com nome)', async () => {
    const a = rec({ name: null, lat: C.lat + 0.001, website: 'https://hotel-x.test' });
    const b = rec({ name: 'Hotel X', lat: C.lat + 0.00105, website: 'https://www.hotel-x.test/pt' });
    const r = await run(svc(source([a, b])));
    expect(flat(r.groups).map((i) => i.name)).toEqual(['Hotel X']);
    expect(r.groups.noPrice[0].groupSize).toBe(2);
    expect(r.counts.unnamedHidden).toBe(0); // o registro sem nome está dentro do grupo, não perdido
  });

  it('só registros sem nome: nada listado, mensagem explica e a contagem fica', async () => {
    const r = await run(svc(source([rec({ name: null }), rec({ name: null })])));
    expect(flat(r.groups)).toEqual([]);
    expect(r.counts.unnamedHidden).toBe(2);
    expect(r.message).toMatch(/sem nome/);
  });
});

describe('nomes repetidos não são duplicidade confirmada', () => {
  it('mesmo nome em lugares diferentes: os dois aparecem, separados; mesmo nome no mesmo lugar: um grupo', async () => {
    const far1 = rec({ name: 'Hotel Central', lat: C.lat + 0.001 });
    const far2 = rec({ name: 'Hotel Central', lat: C.lat + 0.05 }); // ~5 km
    const same1 = rec({ name: 'Pousada Sol', lat: C.lat + 0.002 });
    const same2 = rec({ name: 'Pousada Sol', lat: C.lat + 0.00205 });
    const r = await run(svc(source([far1, far2, same1, same2])));
    const names = flat(r.groups).map((i) => i.name).sort();
    expect(names).toEqual(['Hotel Central', 'Hotel Central', 'Pousada Sol']);
    expect(r.counts.total).toBe(3);
    expect(flat(r.groups).find((i) => i.name === 'Pousada Sol').groupSize).toBe(2);
  });

  it('nenhum estabelecimento some só por ter o mesmo nome (300 registros de mesmo nome em lugares distintos)', async () => {
    const records = Array.from({ length: 300 }, (_, i) => rec({ name: 'Hotel Central', lat: C.lat + i * 0.01 }));
    const r = await run(svc(source(records)), { limit: 500 });
    expect(r.counts.total).toBe(300);
  });
});

describe('fee, preço e avaliação continuam honestos na lista limitada', () => {
  it('feeTag aparece como observação; nenhum preço, estrela ou avaliação é inventado', async () => {
    const r = await run(svc(source([rec({ feeTag: 'no' }), rec({ feeTag: 'yes' })])));
    const items = flat(r.groups);
    expect(items.map((i) => i.feeTag).sort()).toEqual(['no', 'yes']);
    expect(items.every((i) => i.pricing.class === 'unavailable' && i.pricing.amount === null)).toBe(true);
    expect(items.every((i) => i.stars === undefined || i.stars === null)).toBe(true);
    expect(r.counts.order).toBe('proximity'); // a ordem é proximidade, não qualidade
  });
});
