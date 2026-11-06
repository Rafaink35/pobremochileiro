// E1: valida os campos ADITIVOS (ruleSetVersion, unnamed.instances, unnamed.records, groupReasonDetails) e a compatibilidade da
// resposta pública. Dados SIMULADOS e fictícios. A chave `additiveFields: false` devolve exatamente a forma anterior à E1; por isso
// "resposta com os campos novos, sem eles" deve ser IGUAL à resposta sem eles, em todo cenário.
import { describe, expect, it } from 'vitest';
import { createStaySearch } from '../search.js';
import { createBreaker, createStaleCache } from '../cache.js';
import { RESOLVE_STATUS } from '../destination.js';
import handler from '../../../../netlify/functions/stays.mjs';
import { groupDuplicates } from '../dedupe.js';
import { countUnnamedInstances, RULE_SET_VERSION, structureGroupReasons } from '../contract.js';
import { NOW } from './fixtures/index.js';

const C = { lat: 38.7, lon: -9.1 };
const ms = (m) => m / 111320;
const at = (m) => ({ lat: C.lat + ms(m) });
const day = '2026-10-20T00:00:00.000Z';
const price = (amount, o = {}) => ({ status: 'published', amount, currency: 'EUR', unit: { basis: 'person', period: 'night' }, observedAt: day, source: { name: 'Fonte' }, ...o });
const rec = (id, o = {}) => ({
  id, provider: 'osm', sourceId: id, name: `Local ${id}`, category: 'hotel', osmKind: 'hotel', lat: C.lat, lon: C.lon, city: null, website: null, phone: null, feeTag: null, prices: [],
  sources: [{ provider: o.provider ?? 'osm', name: 'x', license: 'ODbL 1.0', attribution: 'x', originalId: o.sourceId ?? id, sourceUrl: `https://osm.test/${id}`, collectedAt: NOW.toISOString() }], ...o,
});
const source = (records) => ({ id: 'osm', describe: () => ({ id: 'osm', name: 'OpenStreetMap (Overpass)', license: 'ODbL 1.0', attribution: 'x' }), supports: () => ({ ok: true }), async search() { return { records, collectedAt: NOW.toISOString() }; } });
const svc = (records, extra = {}) => createStaySearch({ resolver: null, sources: [source(records)], now: () => NOW, cache: createStaleCache({ now: () => NOW.getTime() }), ...extra });
const run = (records, extra = {}, query = {}) => svc(records, extra).search({ lat: C.lat, lon: C.lon, name: 'Teste', categories: 'hotel', ...query });
const all = (g) => [...g.ranked, ...g.withPrice, ...g.stalePrice, ...g.noPrice];

// Remove só os campos da E1. O resto da resposta tem de ficar intacto.
const withoutE1 = (r) => {
  const copy = JSON.parse(JSON.stringify(r));
  delete copy.ruleSetVersion;
  if (copy.unnamed) { delete copy.unnamed.instances; delete copy.unnamed.records; }
  for (const item of all(copy.groups ?? { ranked: [], withPrice: [], stalePrice: [], noPrice: [] })) delete item.groupReasonDetails;
  return copy;
};

// Cenários variados: chave, nome, site, telefone, sem nome (absorvido e separado), preços, categorias e município sem coordenadas.
const SCENARIOS = {
  'sem registros': () => [],
  'só nomeados distintos': () => [rec('a'), rec('b', at(1000)), rec('c', at(2000))],
  'agrupa por chave (nomes diferentes)': () => [rec('a', { sourceId: 'K' }), rec('b', { sourceId: 'K', ...at(80) })],
  'agrupa por nome': () => [rec('a', { name: 'Casa' }), rec('b', { name: 'casa', ...at(100) })],
  'agrupa por site e por telefone': () => [rec('a', { website: 'https://s.test' }), rec('b', { website: 'https://www.s.test/x', ...at(80) }), rec('c', { phone: '211234567', ...at(1500) }), rec('d', { phone: '+351 211 234 567', ...at(1580) })],
  'sem nome absorvido por site': () => [rec('u', { name: null, website: 'https://s.test' }), rec('n', { name: 'Hotel S', website: 'https://s.test', ...at(80) })],
  'sem nome separados': () => [rec('u1', { name: null }), rec('u2', { name: '   ', ...at(1000) }), rec('n', { ...at(2000) })],
  'só sem nome': () => [rec('u1', { name: null }), rec('u2', { name: null, ...at(1000) })],
  'preços em grupo e fora dele': () => [rec('a', { sourceId: 'K', prices: [price(90)] }), rec('b', { sourceId: 'K', ...at(50), prices: [price(10)] }), rec('c', { ...at(3000), prices: [price(30)] }), rec('d', { ...at(4000) })],
  'preço do sem nome absorvido': () => [rec('u', { name: null, website: 'https://s.test', prices: [price(5)] }), rec('n', { name: 'Hotel S', website: 'https://s.test', ...at(80) })],
  'sem coordenadas com município': () => [rec('c', { lat: null, lon: null, city: 'Lisboa', name: 'Hotel Alfama' }), rec('o', { city: 'lisboa', name: 'Hotel Alfama' })],
  'categorias misturadas': () => [rec('a', { category: 'hostel', osmKind: 'hostel' }), rec('b', { ...at(900) }), rec('c', { category: 'hostel', osmKind: 'hostel', ...at(1900) })],
  'muitos registros': () => Array.from({ length: 160 }, (_, i) => rec(`m${i}`, { ...at(i * 30), name: i % 7 === 0 ? null : `Local m${i}` })),
};

describe('E1: ruleSetVersion', () => {
  it('a resposta com resultado traz ruleSetVersion = a constante do conjunto de regras em vigor (legado)', async () => {
    const r = await run([rec('a')]);
    expect(r.ruleSetVersion).toBe(RULE_SET_VERSION);
    expect(RULE_SET_VERSION).toBe('legacy-dedupe-1');
  });
  it('com additiveFields: false, nenhum campo novo aparece (forma anterior à E1)', async () => {
    const r = await run([rec('u', { name: null }), rec('n', at(1000))], { additiveFields: false });
    expect('ruleSetVersion' in r).toBe(false);
    expect('instances' in r.unnamed || 'records' in r.unnamed).toBe(false);
    expect(all(r.groups).some((i) => 'groupReasonDetails' in i)).toBe(false);
  });
});

describe('E1: compatibilidade da resposta pública (os campos novos só acrescentam)', () => {
  for (const [label, build] of Object.entries(SCENARIOS)) {
    it(`"${label}": a resposta sem os campos da E1 é IDÊNTICA à resposta anterior à E1`, async () => {
      const withE1 = await run(build());
      const legacyShape = await run(build(), { additiveFields: false });
      expect(withoutE1(withE1)).toEqual(JSON.parse(JSON.stringify(legacyShape)));
    });
  }
  it('o limite de exibição e "mostrar mais" também permanecem idênticos', async () => {
    for (const limit of [50, 100, 150, 500]) {
      const a = await run(SCENARIOS['muitos registros'](), {}, { limit });
      const b = await run(SCENARIOS['muitos registros'](), { additiveFields: false }, { limit });
      expect(withoutE1(a)).toEqual(JSON.parse(JSON.stringify(b)));
    }
  });
  it('unnamed.count e counts.unnamedHidden mantêm o valor e continuam iguais entre si', async () => {
    const r = await run(SCENARIOS['sem nome separados']());
    expect(r.unnamed.count).toBe(2);
    expect(r.counts.unnamedHidden).toBe(2);
    expect(r.unnamed.items).toHaveLength(2);
  });
  it('preços, ordem e ranking dos itens não mudam (nenhuma oferta é transferida)', async () => {
    const a = await run(SCENARIOS['preços em grupo e fora dele']());
    const b = await run(SCENARIOS['preços em grupo e fora dele'](), { additiveFields: false });
    expect(all(a.groups).map((i) => [i.id, i.prices.length, i.pricing.amount, i.groupSize])).toEqual(all(b.groups).map((i) => [i.id, i.prices.length, i.pricing.amount, i.groupSize]));
    expect(a.groups.ranked.map((i) => i.id)).toEqual(b.groups.ranked.map((i) => i.id));
    expect(a.rankKey).toBe(b.rankKey);
  });
});

describe('E1: unnamed.instances e unnamed.records', () => {
  it('sem registros sem nome: ambos 0', async () => {
    const r = await run(SCENARIOS['só nomeados distintos']());
    expect([r.unnamed.count, r.unnamed.instances, r.unnamed.records]).toEqual([0, 0, 0]);
  });
  it('sem nome separados: count, instances e records coincidem', async () => {
    const r = await run(SCENARIOS['sem nome separados']());
    expect([r.unnamed.count, r.unnamed.instances, r.unnamed.records]).toEqual([2, 2, 2]);
  });
  it('sem nome ABSORVIDO por um grupo com nome: unnamed.count cai a 0 (legado), mas instances e records continuam contando a instância', async () => {
    const r = await run(SCENARIOS['sem nome absorvido por site']());
    expect(r.unnamed.count).toBe(0);
    expect(r.counts.unnamedHidden).toBe(0);
    expect(r.unnamed.instances).toBe(1);
    expect(r.unnamed.records).toBe(1);
  });
  it('dois sem nome agrupados entre si: count 1 (um item), instances 2 e records 2', async () => {
    const r = await run([rec('u1', { name: null, website: 'https://s.test' }), rec('u2', { name: null, website: 'https://s.test', ...at(80) })]);
    expect([r.unnamed.count, r.unnamed.instances, r.unnamed.records]).toEqual([1, 2, 2]);
  });
  it('records = instances e records ≤ instances (sem OP1 efetiva, uma instância por registro)', async () => {
    for (const build of Object.values(SCENARIOS)) {
      const r = await run(build());
      expect(r.unnamed.records).toBe(r.unnamed.instances);
      expect(r.unnamed.records).toBeLessThanOrEqual(r.unnamed.instances);
      expect(r.unnamed.count).toBeLessThanOrEqual(r.unnamed.instances);
    }
  });
  it('só conta registros que entram no agrupamento: categoria não pedida fica de fora; não classificada entra', async () => {
    const r = await run([rec('a', { name: null, category: 'hostel', osmKind: 'hostel' }), rec('b', { name: null, ...at(1000) }), rec('w', { provider: 'wikivoyage', name: null, category: 'nao_classificada', ...at(2000) })]);
    expect(r.unnamed.count).toBe(1); // só o 'b' é item sem nome da categoria pedida
    expect(r.unnamed.instances).toBe(2); // 'b' e o não classificado (que entra no agrupamento); o hostel não foi pedido
  });
  it('countUnnamedInstances usa o mesmo predicado hasName do código atual', () => {
    expect(countUnnamedInstances([{ name: '' }, { name: '  ' }, { name: null }, { name: 123 }, { name: '---' }, { name: 'Hotel' }])).toBe(4);
  });
});

describe('E1: motivos estruturados (groupReasonDetails)', () => {
  const mk = (id, o = {}) => rec(id, o);
  const pair = (a, b) => groupDuplicates([mk('x', a), mk('y', { ...b, ...at(50) })])[0];

  it('cada regra legada vira uma entrada estruturada, na mesma ordem e quantidade de groupReasons', () => {
    const cases = [
      [pair({ sourceId: 'K' }, { sourceId: 'K' }), { rule: 'L-KEY', kind: 'same_source_key' }],
      [pair({ name: 'Casa' }, { name: 'casa' }), { rule: 'L-NAME', kind: 'same_name_nearby', distanceM: 50 }],
      [pair({ website: 'https://s.test' }, { website: 'https://s.test' }), { rule: 'L-SITE', kind: 'same_site_nearby' }],
      [pair({ phone: '211234567' }, { phone: '211234567' }), { rule: 'L-PHONE', kind: 'same_phone_nearby' }],
      [groupDuplicates([mk('p', { name: 'Pousada Sol', category: 'pousada', lat: null, lon: null, city: 'Lisboa' }), mk('q', { name: 'Pousada Sol', category: 'pousada', lat: null, lon: null, city: 'lisboa' })])[0], { rule: 'L-NAMECITY', kind: 'same_name_and_city_no_coordinates' }],
    ];
    for (const [group, expected] of cases) {
      const details = structureGroupReasons(group.groupReasons);
      expect(details).toHaveLength(group.groupReasons.length);
      expect(details[0]).toMatchObject({ ...expected, origin: 'legacy', text: group.groupReasons[0] });
    }
  });
  it('o texto original é preservado e groupReasons não muda', async () => {
    const r = await run([rec('a', { sourceId: 'K', website: 'https://z.test' }), rec('b', { sourceId: 'K', website: 'https://z.test', ...at(50) })]);
    const [item] = all(r.groups);
    expect(item.groupReasons).toEqual(['mesmo registro da fonte']);
    expect(item.groupReasonDetails.map((d) => d.text)).toEqual(item.groupReasons);
  });
  it('o motivo registrado continua sendo só o PRIMEIRO que casa (limitação do legado): chave mascara site e nome', () => {
    const g = pair({ sourceId: 'K', website: 'https://z.test', name: 'Z' }, { sourceId: 'K', website: 'https://z.test', name: 'Z' });
    expect(structureGroupReasons(g.groupReasons).map((d) => d.rule)).toEqual(['L-KEY']);
  });
  it('registro sem grupo tem lista vazia', async () => {
    const r = await run([rec('a')]);
    expect(all(r.groups)[0].groupReasonDetails).toEqual([]);
  });
  it('texto desconhecido vira UNRECOGNIZED, sem inventar regra; entrada vazia ou nula devolve lista vazia', () => {
    expect(structureGroupReasons(['motivo novo'])).toEqual([{ rule: 'UNRECOGNIZED', kind: 'unrecognized', origin: 'legacy', text: 'motivo novo' }]);
    expect(structureGroupReasons([])).toEqual([]);
    expect(structureGroupReasons(undefined)).toEqual([]);
  });
  it('os motivos estruturados não trazem códigos de evidência de identidade (nada de LEGACY_*, basis ou evidence)', async () => {
    const r = await run(SCENARIOS['agrupa por chave (nomes diferentes)']());
    for (const item of all(r.groups)) {
      for (const d of item.groupReasonDetails) {
        expect(Object.keys(d).sort()).toEqual(expect.arrayContaining(['kind', 'origin', 'rule', 'text']));
        expect(JSON.stringify(d)).not.toMatch(/LEGACY_|basis|evidence|same_establishment/);
      }
    }
  });
});

describe('E1: o contrato novo não toca nas regras', () => {
  it('a partição produzida por groupDuplicates é a mesma com e sem os campos novos (as regras não foram alteradas)', async () => {
    for (const build of Object.values(SCENARIOS)) {
      const a = await run(build());
      const b = await run(build(), { additiveFields: false });
      const part = (r) => all(r.groups).map((i) => [...i.memberIds].sort().join('+')).sort();
      expect(part(a)).toEqual(part(b));
    }
  });
  it('o cache de 24 h continua funcionando e os campos novos não são gravados nele (a fonte é consultada uma vez)', async () => {
    let calls = 0;
    const s = { ...source([rec('a')]), async search() { calls += 1; return { records: [rec('a')], collectedAt: NOW.toISOString() }; } };
    const service = createStaySearch({ resolver: null, sources: [s], now: () => NOW, cache: createStaleCache({ now: () => NOW.getTime() }) });
    await service.search({ lat: C.lat, lon: C.lon, name: 'T', categories: 'hotel' });
    const again = await service.search({ lat: C.lat, lon: C.lon, name: 'T', categories: 'hotel', limit: 150 });
    expect(calls).toBe(1);
    expect(again.ruleSetVersion).toBe(RULE_SET_VERSION);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// Todos os caminhos de resposta. Regra observada e fixada aqui: os campos da E1 aparecem SE E SOMENTE SE a resposta traz o
// resultado do agrupamento (`groups` não nulo: status ok ou parcial, inclusive vazio). Nos demais caminhos, nenhum agrupamento
// rodou e os campos ficam ausentes. Com `additiveFields: false` eles ficam ausentes em TODOS os caminhos.
// ---------------------------------------------------------------------------------------------------------------------------
const mkSource = (id, search, supports = () => ({ ok: true })) => ({ id, describe: () => ({ id, name: id, license: 'x', attribution: 'x' }), supports, search });
const failing = (id = 'falha') => mkSource(id, async () => { throw Object.assign(new Error('x'), { status: 503 }); });
const working = (records, id = 'osm') => mkSource(id, async () => ({ records, collectedAt: NOW.toISOString() }));
const build = (sources, extra = {}) => createStaySearch({ resolver: null, sources, now: () => NOW, cache: createStaleCache({ now: () => NOW.getTime() }), breaker: createBreaker(), ...extra });
const Q = { lat: C.lat, lon: C.lon, name: 'Teste', categories: 'hotel' };
const hasE1 = (r) => 'ruleSetVersion' in r || (r.unnamed && ('instances' in r.unnamed || 'records' in r.unnamed)) || all(r.groups ?? { ranked: [], withPrice: [], stalePrice: [], noPrice: [] }).some((i) => 'groupReasonDetails' in i);
const resolverWith = (status) => ({ resolve: async () => ({ status, message: 'm', candidates: [] }) });

describe('E1: caminhos de resposta COM resultado de agrupamento (ok e parcial): campos novos presentes e consistentes', () => {
  const WITH = {
    'sucesso': () => build([working([rec('a'), rec('u', { name: null, ...at(1000) })])]).search(Q),
    'parcial: uma fonte falha e outra responde': () => build([working([rec('a')]), failing()]).search(Q),
    'vazio: fonte responde sem registros': () => build([working([])]).search(Q),
    'só registros sem nome': () => build([working([rec('u', { name: null })])]).search(Q),
    'nenhuma fonte disponível para as categorias (todas puladas)': () => build([mkSource('osm', async () => ({ records: [] }), () => ({ ok: false, reason: 'x' }))]).search(Q),
  };
  for (const [label, go] of Object.entries(WITH)) {
    it(`"${label}": ruleSetVersion, unnamed.instances e unnamed.records presentes; groupReasonDetails em todo item`, async () => {
      const r = await go();
      expect(['ok', 'partial']).toContain(r.status);
      expect(r.groups).not.toBeNull();
      expect(r.ruleSetVersion).toBe(RULE_SET_VERSION);
      expect(Number.isInteger(r.unnamed.instances) && Number.isInteger(r.unnamed.records)).toBe(true);
      expect(r.unnamed.records).toBe(r.unnamed.instances);
      expect(r.unnamed.count).toBeLessThanOrEqual(r.unnamed.instances);
      expect(r.counts.unnamedHidden).toBe(r.unnamed.count);
      for (const item of all(r.groups)) expect(Array.isArray(item.groupReasonDetails)).toBe(true);
    });
    it(`"${label}": com additiveFields: false nenhum campo novo aparece`, async () => {
      const r = await (label.startsWith('sucesso') ? build([working([rec('a'), rec('u', { name: null, ...at(1000) })])], { additiveFields: false }).search(Q)
        : label.startsWith('parcial') ? build([working([rec('a')]), failing()], { additiveFields: false }).search(Q)
        : label.startsWith('vazio') ? build([working([])], { additiveFields: false }).search(Q)
        : label.startsWith('só') ? build([working([rec('u', { name: null })])], { additiveFields: false }).search(Q)
        : build([mkSource('osm', async () => ({ records: [] }), () => ({ ok: false, reason: 'x' }))], { additiveFields: false }).search(Q));
      expect(hasE1(r)).toBe(false);
    });
  }
  it('parcial por cache vencido (a fonte caiu e a cópia antiga é usada): campos novos presentes', async () => {
    let t = NOW.getTime();
    let fail = false;
    const s = mkSource('osm', async () => { if (fail) throw new Error('x'); return { records: [rec('a')], collectedAt: NOW.toISOString() }; });
    const service = createStaySearch({ resolver: null, sources: [s], now: () => NOW, cache: createStaleCache({ now: () => t }), breaker: createBreaker() });
    await service.search(Q);
    t += 3 * 86_400_000;
    fail = true;
    const r = await service.search(Q);
    expect(r.status).toBe('partial');
    expect(r.ruleSetVersion).toBe(RULE_SET_VERSION);
    expect(r.unnamed.instances).toBe(0);
  });
  it('o vazio e o "nenhuma fonte" continuam com a mesma mensagem e status de antes (só acrescentam campos)', async () => {
    const empty = await build([working([])]).search(Q);
    const legacy = await build([working([])], { additiveFields: false }).search(Q);
    expect([empty.status, empty.message]).toEqual([legacy.status, legacy.message]);
  });
});

describe('E1: caminhos de resposta SEM resultado de agrupamento (erro e destino): nenhum campo novo', () => {
  const WITHOUT = {
    'categoria inválida': () => build([working([rec('a')])]).search({ ...Q, categories: 'xyz' }),
    'todas as fontes falham (indisponível)': () => build([failing('a'), failing('b')]).search(Q),
    'destino ambíguo': () => build([working([rec('a')])], { resolver: resolverWith(RESOLVE_STATUS.AMBIGUOUS) }).search({ query: 'Lisboa', categories: 'hotel' }),
    'destino indisponível': () => build([working([rec('a')])], { resolver: resolverWith(RESOLVE_STATUS.UNAVAILABLE) }).search({ query: 'Lisboa', categories: 'hotel' }),
    'destino amplo': () => build([working([rec('a')])], { resolver: resolverWith('broad') }).search({ query: 'Brasil', categories: 'hotel' }),
    'destino não encontrado': () => build([working([rec('a')])], { resolver: resolverWith('not_found') }).search({ query: 'Xyzzy', categories: 'hotel' }),
    'localizar o destino estoura o prazo': () => build([working([rec('a')])], { resolveTimeoutMs: 5, resolver: { resolve: () => new Promise(() => {}) } }).search({ query: 'Lisboa', categories: 'hotel' }),
  };
  for (const [label, go] of Object.entries(WITHOUT)) {
    it(`"${label}": groups nulo e nenhum campo da E1`, async () => {
      const r = await go();
      expect(r.groups).toBeNull();
      expect(hasE1(r)).toBe(false);
      expect(['invalid', 'unavailable', 'ambiguous', 'broad', 'not_found']).toContain(r.status);
    });
  }
});

describe('E1: o endpoint HTTP repassa o campo novo na resposta 200 e não o inventa nos erros', () => {
  let n = 0;
  const call = async (url, init = {}, service) => {
    n += 1;
    const res = await handler(new Request(url, { headers: { 'x-forwarded-for': `10.77.0.${n}` }, ...init }), { service });
    return { status: res.status, body: await res.json() };
  };
  const real = () => build([working([rec('a'), rec('u', { name: null, ...at(1000) })])]);
  it('200: ruleSetVersion e unnamed.instances/records chegam no corpo; unnamed.count e counts.unnamedHidden idem', async () => {
    const { status, body } = await call('http://x/api/stays?lat=38.7&lon=-9.1&name=T&category=hotel', {}, real());
    expect(status).toBe(200);
    expect(body.ruleSetVersion).toBe(RULE_SET_VERSION);
    expect([body.unnamed.count, body.unnamed.instances, body.unnamed.records, body.counts.unnamedHidden]).toEqual([1, 1, 1, 1]);
  });
  it('400 (categoria inválida e parâmetros ausentes), 405 e 500: sem campos da E1', async () => {
    const out = [
      await call('http://x/api/stays?lat=38.7&lon=-9.1&name=T&category=xyz', {}, real()),
      await call('http://x/api/stays', {}, real()),
      await call('http://x/api/stays?q=a', { method: 'POST' }, real()),
      await call('http://x/api/stays?q=a', {}, { search: async () => { throw new Error('boom'); } }),
    ];
    expect(out.map((o) => o.status)).toEqual([400, 400, 405, 500]);
    for (const o of out) expect('ruleSetVersion' in o.body || 'unnamed' in o.body).toBe(false);
  });
});
