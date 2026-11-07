// E2 (auditoria): ORDEM das regras legadas e SOBREPOSIÇÃO de regras. Compara o motor com a cópia verbatim do código anterior (oráculo)
// em todos os casos em que mais de uma regra pode casar o mesmo par, incluindo `reason`, `groupReasons`, `kind`, `rule` e a ORDEM dos
// motivos. Também fixa que L-NAMECITY só existe quando falta coordenada e as demais só quando há: a ordem entre elas não altera
// nenhum resultado. Dados SIMULADOS.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { groupDuplicates } from '../dedupe.js';
import { groupDuplicates as legacy } from './fixtures/legacy-dedupe-reference.js';
import { cluster, decidePair, explain } from '../../dedupe/engine.js';
import { structureGroupReasons } from '../contract.js';

const ms = (m) => m / 111320;
const J = JSON.stringify;

// ---------------------------------------------------------------------------------------------------------------------------
// 1. Ordem efetiva de avaliação, no texto do código: chave → categoria → (sem coordenadas: nome+município) → nome → site → telefone
// ---------------------------------------------------------------------------------------------------------------------------
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const strongReasonBody = (src, name) => src.slice(src.indexOf(`function ${name}`));
const increasing = (src, tokens) => {
  const idx = tokens.map((t) => src.indexOf(t));
  expect(idx.every((i) => i >= 0)).toBe(true);
  expect(idx).toEqual([...idx].sort((a, b) => a - b));
  expect(new Set(idx).size).toBe(idx.length);
};

describe('E2: ordem efetiva de avaliação das regras legadas (texto do código)', () => {
  it('no código original (oráculo): chave, categoria, nome+município (só sem coordenadas), nome, site, telefone', () => {
    const body = strongReasonBody(read('./fixtures/legacy-dedupe-reference.js'), 'strongReason');
    increasing(body, ["return 'mesmo registro da fonte'", 'if (!sameCategory(a, b)) return null', 'if (dist === null)', "return 'mesmo nome e município (sem coordenadas)'", 'return `mesmo nome a', 'return `mesmo site', "return 'mesmo telefone'"]);
  });
  it('no motor novo: exatamente a mesma sequência', () => {
    const body = strongReasonBody(read('../../dedupe/engine.js'), 'strongReason');
    increasing(body, ["return reason('L-KEY'", 'if (!sameCategory(a, b)) return null', 'if (dist === null)', "return reason('L-NAMECITY'", "return reason('L-NAME'", "return reason('L-SITE'", "return reason('L-PHONE'"]);
  });
  it('o bloco sem coordenadas devolve ANTES de qualquer regra de nome, site ou telefone (elas só valem com coordenadas)', () => {
    for (const [file, fn, tokens] of [['./fixtures/legacy-dedupe-reference.js', 'strongReason', ['return null;\n  }', 'return `mesmo nome a']], ['../../dedupe/engine.js', 'strongReason', ['return null;\n  }', "return reason('L-NAME'"]]]) {
      const body = strongReasonBody(read(file), fn);
      const block = body.slice(body.indexOf('if (dist === null)'));
      expect(block.indexOf(tokens[0])).toBeGreaterThan(-1);
      expect(block.indexOf(tokens[0])).toBeLessThan(block.indexOf(tokens[1]));
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// 2. Fatorial: TODAS as combinações de sinais para um par (3.888 pares). Para cada um, motor × código original.
// ---------------------------------------------------------------------------------------------------------------------------
const DIMS = {
  key: ['same', 'diff'],
  cat: ['same', 'different', 'unclassified'],
  coord: ['near50', 'edge149', 'near250', 'far400', 'coordlessBoth', 'coordlessOne'],
  name: ['same', 'diff', 'similar'],
  site: ['same', 'diff', 'generic', 'none'],
  phone: ['same', 'diff', 'none'],
  city: ['same', 'diff', 'none'],
};
const DIST = { near50: 50, edge149: 149, near250: 250, far400: 400 };

function build({ key, cat, coord, name, site, phone, city }) {
  const a = {
    id: 'a', provider: 'osm', sourceId: 'ka', name: name === 'similar' ? 'Casa do Mar Verde' : 'Casa Sol', category: 'hotel', lat: 38.7, lon: -9.1,
    city: city === 'none' ? null : 'Lisboa', website: site === 'none' ? null : site === 'generic' ? 'https://facebook.com/x' : 'https://s.test',
    phone: phone === 'none' ? null : '211234567', prices: [], sources: [{ provider: 'osm', originalId: 'ka' }],
  };
  const b = {
    id: 'b', provider: 'osm', sourceId: key === 'same' ? 'ka' : 'kb', name: name === 'same' ? 'CASA SOL' : name === 'similar' ? 'Mar Verde Casa' : 'Outro Nome',
    category: cat === 'same' ? 'hotel' : cat === 'different' ? 'hostel' : 'nao_classificada', lat: 38.7 + ms(DIST[coord] ?? 0), lon: -9.1,
    city: city === 'none' ? null : city === 'same' ? 'lisboa' : 'Porto',
    website: site === 'none' ? null : site === 'same' ? 'https://www.s.test/x' : site === 'diff' ? 'https://t.test' : 'https://facebook.com/x',
    phone: phone === 'none' ? null : phone === 'same' ? '+351 211 234 567' : '911000111', prices: [], sources: [{ provider: 'osm', originalId: key === 'same' ? 'ka' : 'kb' }],
  };
  if (coord === 'coordlessBoth') { a.lat = null; a.lon = null; b.lat = null; b.lon = null; }
  if (coord === 'coordlessOne') { b.lat = null; b.lon = null; }
  return [a, b];
}
const combos = (dims) => Object.entries(dims).reduce((acc, [k, vs]) => acc.flatMap((c) => vs.map((v) => ({ ...c, [k]: v }))), [{}]);
const ALL = combos(DIMS);

// Quais regras casariam de fato, decidido só pelos sinais (independe do motor e do código original).
function matches({ key, cat, coord, name, site, phone, city }, pairLevel = false) {
  const dist = DIST[coord];
  const located = dist !== undefined;
  // Candidato: com coordenadas nos dois, vizinhança de grade e <= 300 m; faltando coordenada de um lado, só se for o mesmo município.
  const reach = located ? dist <= 300 : pairLevel || city === 'same'; // decidePair não gera candidatos: só `cluster` exige o município
  const catOk = cat !== 'different';
  return {
    'L-KEY': key === 'same' && reach,
    'L-NAMECITY': reach && !located && catOk && name === 'same' && city === 'same',
    'L-NAME': reach && located && catOk && name === 'same' && dist <= 150,
    'L-SITE': reach && located && catOk && site === 'same' && dist <= 300,
    'L-PHONE': reach && located && catOk && phone === 'same' && dist <= 300,
  };
}
const CODE_ORDER = ['L-KEY', 'L-NAMECITY', 'L-NAME', 'L-SITE', 'L-PHONE']; // ordem de avaliação no código (linhas 19, 21-25, 27, 29, 31)
const SPEC_TABLE_ORDER = ['L-KEY', 'L-NAME', 'L-SITE', 'L-PHONE', 'L-NAMECITY']; // ordem da tabela da especificação v8.3 a v8.5

describe('E2: sobreposição de regras em todos os pares possíveis (fatorial de 3.888 combinações)', () => {
  it('o fatorial é completo e exercita todas as regras, o "nenhuma" e a sobreposição de 2 ou mais regras', () => {
    expect(ALL).toHaveLength(2 * 3 * 6 * 3 * 4 * 3 * 3);
    const firsts = new Set();
    let overlaps = 0;
    let maxOverlap = 0;
    for (const d of ALL) {
      const m = matches(d);
      const n = Object.values(m).filter(Boolean).length;
      overlaps += n >= 2 ? 1 : 0;
      maxOverlap = Math.max(maxOverlap, n);
      firsts.add(CODE_ORDER.find((r) => m[r]) ?? 'nenhuma');
    }
    expect([...firsts].sort()).toEqual(['L-KEY', 'L-NAME', 'L-NAMECITY', 'L-PHONE', 'L-SITE', 'nenhuma']);
    expect(overlaps).toBeGreaterThan(400);
    expect(maxOverlap).toBe(4); // chave, nome, site e telefone juntos
  });

  it('L-NAMECITY nunca coexiste com nome, site ou telefone no mesmo par: por isso a ordem entre eles não altera nenhum resultado', () => {
    let namecity = 0;
    for (const d of ALL) {
      const m = matches(d);
      if (m['L-NAMECITY']) { namecity += 1; expect(m['L-NAME'] || m['L-SITE'] || m['L-PHONE']).toBe(false); }
      // as duas ordens (a do código e a da tabela da especificação) escolhem o MESMO primeiro motivo em todo par
      expect(CODE_ORDER.find((r) => m[r]) ?? null).toBe(SPEC_TABLE_ORDER.find((r) => m[r]) ?? null);
    }
    expect(namecity).toBeGreaterThan(50);
  });

  it('em TODOS os pares: motor e código original dão o mesmo agrupamento, o mesmo reason, os mesmos groupReasons, kind e rule', () => {
    let linked = 0;
    let overlapped = 0;
    for (const d of ALL) {
      const [a, b] = build(d);
      const m = matches(d);
      const expectedRule = CODE_ORDER.find((r) => m[r]) ?? null; // com geração de candidatos (cluster / código original)
      const mp = matches(d, true);
      const pairRule = CODE_ORDER.find((r) => mp[r]) ?? null; // decisão do par, sem geração de candidatos (decidePair)

      const old = legacy([a, b]); // código original (verbatim)
      const adapted = groupDuplicates([a, b]); // adaptador sobre o motor
      expect(J(adapted)).toBe(J(old)); // agrupamento, campos, ordem, groupReasons, possibleDuplicates
      const oldReasons = old[0].groupReasons;
      expect(adapted[0].groupReasons).toEqual(oldReasons);

      const decision = decidePair(a, b);
      const oldStructured = structureGroupReasons(oldReasons); // rule/kind lidos do texto do código original
      expect(old).toHaveLength(expectedRule ? 1 : 2);
      expect(decision.reason?.rule ?? null).toBe(pairRule);
      if (expectedRule) {
        linked += 1;
        overlapped += Object.values(m).filter(Boolean).length >= 2 ? 1 : 0;
        expect(old).toHaveLength(1); // o código original agrupou
        expect(decision.linked).toBe(true); // (se o cluster ligou, a decisão do par também ligou, pela mesma regra)
        expect(decision.reason.text).toBe(oldReasons[0]); // MESMO primeiro motivo, texto idêntico
        expect(decision.reason.rule).toBe(expectedRule);
        expect(decision.reason.rule).toBe(oldStructured[0].rule); // regra do motor == regra lida do código original
        expect(decision.reason.kind).toBe(oldStructured[0].kind);
        expect(oldReasons).toHaveLength(1); // um par registra um único motivo (o primeiro que casa)
      } else {
        // Sem ligação no agrupamento: ou a decisão do par não liga, ou o par nem é candidato (coordenada faltando e município diferente/ausente).
        expect(decision.linked).toBe(pairRule !== null);
        expect(old).toHaveLength(2); // o código original não agrupou
        expect(oldReasons).toEqual([]);
      }
      // distância do motivo de nome e possível duplicata
      if (expectedRule === 'L-NAME') expect(decision.reason.distanceM).toBe(Number(/\d+/.exec(oldReasons[0])[0]));
      expect(decision.possibleDuplicate).toBe(!pairRule && !expectedRule && old[0].possibleDuplicates.length === 1 && decision.withinReach);
      // explain (motor) == structureGroupReasons (texto do original) na mesma ordem
      const [c] = cluster([a, b]);
      expect(explain(c).reasons).toEqual(structureGroupReasons(old.length === 1 ? oldReasons : []));
    }
    expect(linked).toBeGreaterThan(1500);
    expect(overlapped).toBeGreaterThan(400); // grande parte dos agrupamentos tinha 2 ou mais regras candidatas
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// 3. Casos de sobreposição nomeados, com o resultado esperado escrito à mão (não derivado do motor nem do original)
// ---------------------------------------------------------------------------------------------------------------------------
describe('E2: sobreposições nomeadas (expectativa escrita à mão; motor e código original concordam)', () => {
  const base = { name: 'Casa Sol', website: 'https://s.test', phone: '211234567' };
  const P = (dims) => build({ key: 'diff', cat: 'same', coord: 'near50', name: 'same', site: 'same', phone: 'same', city: 'same', ...dims });
  const CASES = [
    ['chave + nome + site + telefone', { key: 'same' }, { text: 'mesmo registro da fonte', rule: 'L-KEY', kind: 'same_source_key' }],
    ['nome + site + telefone (sem chave)', {}, { text: 'mesmo nome a 50 m', rule: 'L-NAME', kind: 'same_name_nearby' }],
    ['site + telefone (nomes diferentes)', { name: 'diff' }, { text: 'mesmo site (s.test)', rule: 'L-SITE', kind: 'same_site_nearby' }],
    ['só telefone', { name: 'diff', site: 'diff' }, { text: 'mesmo telefone', rule: 'L-PHONE', kind: 'same_phone_nearby' }],
    ['chave com categorias diferentes (a chave vem antes da categoria)', { key: 'same', cat: 'different' }, { text: 'mesmo registro da fonte', rule: 'L-KEY', kind: 'same_source_key' }],
    ['nome + site + telefone com categorias diferentes (a categoria barra todas as demais)', { cat: 'different' }, null],
    ['site genérico + telefone (o site genérico não conta; vale o telefone)', { name: 'diff', site: 'generic' }, { text: 'mesmo telefone', rule: 'L-PHONE', kind: 'same_phone_nearby' }],
    ['nome a 149 m + site + telefone', { coord: 'edge149' }, { text: 'mesmo nome a 149 m', rule: 'L-NAME', kind: 'same_name_nearby' }],
    ['nome + site + telefone a 250 m (nome passa de 150 m; vale o site)', { coord: 'near250' }, { text: 'mesmo site (s.test)', rule: 'L-SITE', kind: 'same_site_nearby' }],
    ['chave a 400 m (fora do alcance, a chave nem é avaliada)', { key: 'same', coord: 'far400' }, null],
    ['sem coordenadas: chave + nome + município', { key: 'same', coord: 'coordlessBoth' }, { text: 'mesmo registro da fonte', rule: 'L-KEY', kind: 'same_source_key' }],
    ['sem coordenadas: nome + município (site e telefone iguais não são avaliados)', { coord: 'coordlessBoth' }, { text: 'mesmo nome e município (sem coordenadas)', rule: 'L-NAMECITY', kind: 'same_name_and_city_no_coordinates' }],
    ['coordenada × sem coordenada: nome + município', { coord: 'coordlessOne' }, { text: 'mesmo nome e município (sem coordenadas)', rule: 'L-NAMECITY', kind: 'same_name_and_city_no_coordinates' }],
    ['sem coordenadas: site + telefone iguais, nome diferente (nada é avaliado)', { coord: 'coordlessBoth', name: 'diff' }, null],
    ['sem coordenadas: nome igual e município diferente', { coord: 'coordlessBoth', city: 'diff' }, null],
  ];
  for (const [label, dims, expected] of CASES) {
    it(`${label}`, () => {
      const [a, b] = P(dims);
      const old = legacy([a, b]);
      const decision = decidePair(a, b);
      if (expected) {
        expect(old[0].groupReasons).toEqual([expected.text]);
        expect(groupDuplicates([a, b])[0].groupReasons).toEqual([expected.text]);
        expect(decision.reason).toMatchObject({ text: expected.text, rule: expected.rule, kind: expected.kind });
        expect(explain(cluster([a, b])[0]).reasons.map((r) => [r.rule, r.kind, r.text])).toEqual([[expected.rule, expected.kind, expected.text]]);
      } else {
        expect(old).toHaveLength(2);
        expect(decision.linked).toBe(false);
        expect(groupDuplicates([a, b])).toHaveLength(2);
      }
      expect(J(groupDuplicates([a, b]))).toBe(J(old));
    });
  }
  it('o desempate por ordem NÃO existe entre regras: o resultado de um par não depende da ordem dos dois registros', () => {
    for (const d of ALL.filter((_, i) => i % 7 === 0)) {
      const [a, b] = build(d);
      const ab = decidePair(a, b).reason;
      const ba = decidePair(b, a).reason;
      expect(ab?.rule ?? null).toBe(ba?.rule ?? null);
    }
    void base;
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// 4. Vários membros: acúmulo, repetição e ORDEM dos motivos, com muitas regras sobrepostas
// ---------------------------------------------------------------------------------------------------------------------------
const makeRng = (seed) => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
function overlapCorpus(seed) {
  const rnd = makeRng(seed);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const n = 3 + Math.floor(rnd() * 5);
  return Array.from({ length: n }, (_, i) => {
    const located = rnd() > 0.25;
    const sid = pick(['k1', 'k2', 'k3', `u${i}`]);
    return {
      id: `r${i}`, provider: 'osm', sourceId: sid, name: pick(['Casa Sol', 'casa sol', 'Hotel Mar', null, 'Pousada Lua']), category: pick(['hotel', 'hotel', 'hostel', 'nao_classificada']),
      lat: located ? 38.7 + ms(rnd() * 260) : null, lon: located ? -9.1 : null, city: pick(['Lisboa', 'lisboa', null]),
      website: pick(['https://s.test', 'https://www.s.test/x', 'https://t.test', null]), phone: pick(['211234567', '+351 211 234 567', '911000111', null]),
      prices: [], sources: [{ provider: 'osm', originalId: sid }],
    };
  });
}

describe('E2: vários membros, regras sobrepostas: reasons, groupReasons, kind, rule e ordem idênticos ao código original', () => {
  it('2.500 corpora de 3 a 7 registros com tudo sobreposto: saída serializada, groupReasons e motivos estruturados idênticos', () => {
    let groups = 0;
    let multiRule = 0;
    let withRepeats = 0;
    for (let seed = 1; seed <= 2500; seed += 1) {
      const recs = overlapCorpus(seed);
      const old = legacy(recs);
      const adapted = groupDuplicates(recs);
      expect(J(adapted)).toBe(J(old));
      const native = cluster(recs).map((c) => explain(c).reasons);
      expect(native).toEqual(old.map((g) => structureGroupReasons(g.groupReasons))); // rule, kind, text, distanceM, origin e ORDEM
      for (const g of old) {
        groups += g.groupSize > 1 ? 1 : 0;
        const rules = structureGroupReasons(g.groupReasons).map((r) => r.rule);
        multiRule += new Set(rules).size >= 2 ? 1 : 0;
        withRepeats += g.groupSize > 2 && g.groupReasons.length < g.groupSize - 1 ? 1 : 0; // mais ligações que motivos distintos: houve repetição removida
      }
    }
    expect(groups).toBeGreaterThan(2000);
    expect(multiRule).toBeGreaterThan(500); // grupos com motivos de 2 ou mais regras diferentes, em ordem
    expect(withRepeats).toBeGreaterThan(100);
  });
  it('a ordem dos motivos de um grupo segue a ordem em que o código original os registrava (exemplo fixo, 4 regras)', () => {
    const mk = (id, o) => ({ id, provider: 'osm', sourceId: id, name: `N${id}`, category: 'hotel', lat: 38.7 + ms(o.d ?? 0), lon: -9.1, city: null, website: null, phone: null, prices: [], sources: [{ provider: 'osm', originalId: id }], ...o });
    const recs = [mk('A', { sourceId: 'K' }), mk('B', { sourceId: 'K', d: 40 }), mk('C', { d: 80, name: 'NB', website: 'https://bc.test' }), mk('D', { d: 120, name: 'ND', website: 'https://bc.test', phone: '211000001' }), mk('E', { d: 160, name: 'NE', phone: '211000001' })];
    const old = legacy(recs);
    expect(old).toHaveLength(1);
    expect(old[0].groupReasons).toEqual(['mesmo registro da fonte', 'mesmo nome a 40 m', 'mesmo site (bc.test)', 'mesmo telefone']);
    expect(groupDuplicates(recs)[0].groupReasons).toEqual(old[0].groupReasons);
    expect(explain(cluster(recs)[0]).reasons.map((r) => r.rule)).toEqual(['L-KEY', 'L-NAME', 'L-SITE', 'L-PHONE']);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// 5. Contrato do adaptador para os consumidores existentes (assembleResults / serviço / testes antigos)
// ---------------------------------------------------------------------------------------------------------------------------
describe('E2: contrato do adaptador groupDuplicates para os consumidores existentes', () => {
  it('campos, ordem de campos, preços, fontes, selos e possíveis duplicados idênticos ao código original, campo a campo', () => {
    const CONTRACT = ['groupSize', 'groupReasons', 'memberIds', 'possibleDuplicates', 'registries', 'sources', 'prices'];
    for (let seed = 7000; seed < 7300; seed += 1) {
      const recs = overlapCorpus(seed).map((r, i) => ({ ...r, registry: i % 3 === 0 ? 'cadastur' : undefined, prices: i % 2 ? [{ status: 'published', amount: 10 + i, currency: 'EUR', unit: { basis: 'person', period: 'night' }, observedAt: '2026-10-20T00:00:00.000Z', source: { name: `F${i}` } }] : [] }));
      const old = legacy(recs);
      const now = groupDuplicates(recs);
      expect(now).toHaveLength(old.length);
      now.forEach((g, i) => {
        expect(Object.keys(g)).toEqual(Object.keys(old[i])); // ordem dos campos
        for (const f of CONTRACT) expect(J(g[f])).toBe(J(old[i][f]));
        expect(g.id).toBe(old[i].id); // principal
        expect(g.prices.length).toBe(old[i].prices.length); // nenhuma oferta movida, filtrada ou deduplicada
      });
    }
  });
  it('assembleResults (consumidor de produção) entrega os mesmos grupos que a reconstrução com o código original, sem os campos da E1', async () => {
    const { assembleResults } = await import('../search.js');
    const { haversineMeters } = await import('../../geo.js');
    const center = { lat: 38.7, lon: -9.1 };
    for (let seed = 8000; seed < 8200; seed += 1) {
      const recs = overlapCorpus(seed);
      const wanted = new Set(['hotel', 'hostel']);
      const out = assembleResults({ records: recs, categories: ['hotel', 'hostel'], center, limit: 100, now: new Date('2026-11-10T12:00:00Z') });
      const expected = legacy(recs.filter((r) => wanted.has(r.category) || r.category === 'nao_classificada')).filter((g) => wanted.has(g.category))
        .map((g) => ({ ...g, distanceM: g.lat != null ? Math.round(haversineMeters(center, { lat: g.lat, lon: g.lon })) : null }));
      expect(J(out.grouped.map(({ groupReasonDetails, ...rest }) => { void groupReasonDetails; return rest; }))).toBe(J(expected));
    }
  });
});
