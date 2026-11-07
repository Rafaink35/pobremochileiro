// E2: testes da interface do motor central (`canonicalize`, `decidePair`, `cluster`, `explain`) em MODO LEGADO. Dados SIMULADOS.
// Fixam que o núcleo expõe o contrato esperado e que cada regra legada, critério, limite e prioridade está onde sempre esteve.
import { describe, expect, it } from 'vitest';
import * as engine from '../engine.js';
import { canonicalize, cluster, decidePair, explain, LEGACY_RULE_SET, LEGACY_RULES } from '../engine.js';

const ms = (m) => m / 111320;
const rec = (id, o = {}) => ({ id, provider: 'osm', sourceId: id, name: `Nome ${id}`, category: 'hotel', lat: 38.7, lon: -9.1, city: null, website: null, phone: null, prices: [], sources: [], ...o });
const at = (m) => ({ lat: 38.7 + ms(m) });
const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === 'object' && !Object.isFrozen(v) && deepFreeze(v)); return Object.freeze(o); };

describe('E2: interface pública do motor', () => {
  it('exporta a interface do roadmap e o conjunto de regras legado, e nada além disso', () => {
    expect(Object.keys(engine).sort()).toEqual(['LEGACY_RULES', 'LEGACY_RULE_SET', 'canonicalize', 'cluster', 'decidePair', 'explain']);
    for (const fn of [canonicalize, decidePair, cluster, explain]) expect(typeof fn).toBe('function');
  });
  it('o conjunto de regras legado traz exatamente os limites e prioridades do código anterior, e é imutável', () => {
    expect(LEGACY_RULE_SET).toEqual({
      id: 'legacy-dedupe-1', cellDegrees: 0.003, reachMeters: 300, nameMeters: 150, siteMeters: 300, phoneMeters: 300, possibleMeters: 250, possibleSimilarity: 0.6,
      sourcePriority: { osm: 0, wikivoyage: 1, community: 2, cadastur: 3 }, unknownSourcePriority: 9,
    });
    expect(Object.isFrozen(LEGACY_RULE_SET) && Object.isFrozen(LEGACY_RULE_SET.sourcePriority)).toBe(true);
  });
  it('o id do conjunto de regras é o mesmo que a E1 publica em ruleSetVersion', async () => {
    const { RULE_SET_VERSION } = await import('../../stays/contract.js');
    expect(LEGACY_RULE_SET.id).toBe(RULE_SET_VERSION);
  });
  it('as regras legadas estão na ordem de avaliação do código anterior (a chave primeiro) e são imutáveis', () => {
    expect(LEGACY_RULES.map((r) => r.id)).toEqual(['L-KEY', 'L-NAMECITY', 'L-NAME', 'L-SITE', 'L-PHONE']);
    expect(LEGACY_RULES.map((r) => r.order)).toEqual([1, 2, 3, 4, 5]);
    expect(Object.isFrozen(LEGACY_RULES) && LEGACY_RULES.every((r) => Object.isFrozen(r))).toBe(true);
  });
});

describe('E2: canonicalize', () => {
  it('normaliza nome, município, domínio e telefone com as mesmas funções de sempre', () => {
    const c = canonicalize(rec('a', { name: 'Hôtel  São José!', city: 'LISBOA', website: 'https://www.Casa-X.test/pt', phone: '+351 211 234 567' }));
    expect(c).toEqual({ nameKey: 'hotel sao jose', cityKey: 'lisboa', domain: 'casa-x.test', phoneKey: '211234567', located: true });
  });
  it('domínio genérico, telefone curto e ausências viram vazio ou nulo', () => {
    const c = canonicalize(rec('a', { name: null, city: undefined, website: 'https://facebook.com/x', phone: '123', lat: null }));
    expect(c).toEqual({ nameKey: '', cityKey: '', domain: null, phoneKey: null, located: false });
  });
  it('é pura: não altera o registro (nem congelado), devolve objeto congelado e o mesmo resultado a cada chamada', () => {
    const r = deepFreeze(rec('a', { website: 'https://x.test' }));
    const before = JSON.stringify(r);
    const c1 = canonicalize(r);
    expect(JSON.stringify(r)).toBe(before);
    expect(Object.isFrozen(c1)).toBe(true);
    expect(canonicalize(r)).toEqual(c1);
  });
});

describe('E2: decidePair (decisão legada de um par)', () => {
  it('L-KEY: mesma origem liga, sem exigir nome, categoria nem site', () => {
    const d = decidePair(rec('a', { sourceId: 'K', name: 'A' }), rec('b', { sourceId: 'K', name: 'B', category: 'hostel', ...at(100) }));
    expect(d).toMatchObject({ withinReach: true, linked: true, possibleDuplicate: false, reason: { rule: 'L-KEY', kind: 'same_source_key', text: 'mesmo registro da fonte' } });
  });
  it('L-NAME: mesmo nome até 150 m (149 liga, 160 não), com distância arredondada no motivo', () => {
    expect(decidePair(rec('a', { name: 'Casa' }), rec('b', { name: 'CASA', ...at(149) })).reason).toMatchObject({ rule: 'L-NAME', text: expect.stringMatching(/^mesmo nome a 149 m$/), distanceM: 149 });
    expect(decidePair(rec('a', { name: 'Casa' }), rec('b', { name: 'CASA', ...at(160) })).linked).toBe(false);
  });
  it('L-SITE e L-PHONE: até 300 m e com categoria compatível', () => {
    expect(decidePair(rec('a', { website: 'https://s.test' }), rec('b', { website: 'https://www.s.test/x', ...at(250) })).reason).toMatchObject({ rule: 'L-SITE', text: 'mesmo site (s.test)' });
    expect(decidePair(rec('a', { phone: '211234567' }), rec('b', { phone: '+351 211 234 567', ...at(299) })).reason).toMatchObject({ rule: 'L-PHONE', text: 'mesmo telefone' });
    expect(decidePair(rec('a', { phone: '211234567' }), rec('b', { phone: '211234567', ...at(301) })).withinReach).toBe(false);
    expect(decidePair(rec('a', { website: 'https://s.test' }), rec('b', { website: 'https://s.test', category: 'hostel', ...at(50) })).linked).toBe(false);
  });
  it('L-NAMECITY: sem coordenadas, mesmo nome, categoria e município', () => {
    const nc = (id, o = {}) => rec(id, { name: 'Pousada Sol', category: 'pousada', lat: null, lon: null, city: 'Lisboa', ...o });
    expect(decidePair(nc('a'), nc('b', { city: 'lisboa' }))).toMatchObject({ distanceM: null, linked: true, reason: { rule: 'L-NAMECITY', text: 'mesmo nome e município (sem coordenadas)' } });
    expect(decidePair(nc('a'), nc('b', { category: 'hotel' })).linked).toBe(false);
    expect(decidePair(nc('a', { city: null }), nc('b', { city: null })).linked).toBe(false);
  });
  it('só o PRIMEIRO motivo que casa é devolvido (a chave mascara nome, site e telefone)', () => {
    const base = { website: 'https://z.test', phone: '211234567', name: 'Hotel Z' };
    expect(decidePair(rec('a', { sourceId: 'K', ...base }), rec('b', { sourceId: 'K', ...base, ...at(50) })).reason.rule).toBe('L-KEY');
    expect(decidePair(rec('a', { sourceId: 'K1', ...base }), rec('b', { sourceId: 'K2', ...base, ...at(50) })).reason.rule).toBe('L-NAME');
  });
  it('coordenada × sem coordenada: site e telefone iguais não são avaliados', () => {
    const d = decidePair(rec('a', { lat: null, lon: null, city: 'Lisboa', website: 'https://s.test', phone: '211234567', name: 'X' }), rec('b', { city: 'Lisboa', website: 'https://s.test', phone: '211234567', name: 'Y' }));
    expect(d).toMatchObject({ distanceM: null, withinReach: true, linked: false });
  });
  it('além de 300 m com coordenadas: par fora de alcance, nada é avaliado (nem a chave)', () => {
    expect(decidePair(rec('a', { sourceId: 'K' }), rec('b', { sourceId: 'K', ...at(400) }))).toMatchObject({ withinReach: false, linked: false, reason: null, possibleDuplicate: false });
  });
  it('possível duplicata: nome parecido (≥ 0,6) a até 250 m, mesma categoria, sem outra regra; não liga', () => {
    const d = decidePair(rec('a', { name: 'Casa do Mar Verde' }), rec('b', { name: 'Mar Verde Casa', ...at(100) }));
    expect(d).toMatchObject({ linked: false, possibleDuplicate: true, reason: null });
    expect(decidePair(rec('a', { name: 'Casa do Mar Verde' }), rec('b', { name: 'Mar Verde Casa', ...at(260) })).possibleDuplicate).toBe(false);
  });
  it('não altera os registros e aceita registros congelados', () => {
    const a = deepFreeze(rec('a', { sourceId: 'K' }));
    const b = deepFreeze(rec('b', { sourceId: 'K', ...at(10) }));
    expect(() => decidePair(a, b)).not.toThrow();
  });
  it('o conjunto de regras é parametrizável, mas o padrão é o legado', () => {
    const a = rec('a', { name: 'Casa' });
    const b = rec('b', { name: 'Casa', ...at(100) });
    expect(decidePair(a, b).linked).toBe(true);
    expect(decidePair(a, b, { ...LEGACY_RULE_SET, nameMeters: 50 }).linked).toBe(false);
  });
});

describe('E2: cluster e explain', () => {
  it('lista vazia → nenhum grupo; um registro → um grupo de um', () => {
    expect(cluster([])).toEqual([]);
    const [g] = cluster([rec('a')]);
    expect(g).toMatchObject({ memberIndexes: [0], memberIds: ['a'], reasons: [], possibleDuplicateIds: [] });
    expect(g.primary.id).toBe('a');
  });
  it('devolve, por grupo, principal, membros, índices de entrada, ids, motivos estruturados e possíveis duplicatas', () => {
    const a = rec('a', { sourceId: 'K', website: 'https://t.test', name: 'Alfa' });
    const b = rec('b', { sourceId: 'K', website: 'https://t.test', name: 'Beta', ...at(60) });
    const c = rec('c', { name: 'Casa do Mar Verde', ...at(2000) });
    const d = rec('d', { name: 'Mar Verde Casa', ...at(2100) });
    const out = cluster([a, b, c, d]);
    expect(out).toHaveLength(3);
    expect(Object.keys(out[0]).sort()).toEqual(['memberIds', 'memberIndexes', 'members', 'possibleDuplicateIds', 'primary', 'reasons']);
    expect(out[0].memberIndexes).toEqual([0, 1]);
    expect(out[0].reasons).toEqual([{ rule: 'L-KEY', kind: 'same_source_key', text: 'mesmo registro da fonte' }]);
    expect(out[1].possibleDuplicateIds).toEqual(['d']);
    expect(out[2].possibleDuplicateIds).toEqual(['c']);
  });
  it('as chaves de cluster/decidePair são a mesma decisão: um par ligado por decidePair fica no mesmo grupo', () => {
    const a = rec('a', { website: 'https://s.test' });
    const b = rec('b', { website: 'https://s.test', ...at(120) });
    expect(decidePair(a, b).linked).toBe(true);
    expect(cluster([a, b])).toHaveLength(1);
  });
  it('não altera os registros e aceita registros congelados', () => {
    const recs = deepFreeze([rec('a', { sourceId: 'K' }), rec('b', { sourceId: 'K', ...at(10) })]);
    expect(() => cluster(recs)).not.toThrow();
  });
  it('explain descreve o grupo diretamente do motor, em modo legado e com a limitação conhecida', () => {
    const [g] = cluster([rec('a', { name: 'Casa' }), rec('b', { name: 'casa', ...at(100) })]);
    expect(explain(g)).toEqual({
      ruleSet: 'legacy-dedupe-1', mode: 'legacy', primaryId: g.primary.id, groupSize: 2,
      reasons: [{ rule: 'L-NAME', kind: 'same_name_nearby', text: 'mesmo nome a 100 m', distanceM: 100, origin: 'legacy' }],
      possibleDuplicateIds: [], limitation: 'first_matching_rule_per_pair',
    });
  });
  it('os motivos de explain nunca são evidência de identidade (nada de basis, evidence ou same_establishment)', () => {
    const [g] = cluster([rec('a', { sourceId: 'K' }), rec('b', { sourceId: 'K', ...at(10) })]);
    expect(JSON.stringify(explain(g))).not.toMatch(/LEGACY_|basis|evidence|same_establishment/);
  });
});
