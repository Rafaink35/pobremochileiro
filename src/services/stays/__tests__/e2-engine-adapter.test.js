// E2: PARIDADE do adaptador do Stay Finder (motor central) com a implementação anterior (cópia verbatim em fixtures) e GUARDAS
// estáticas de que a produção tem uma só implementação das regras e de que nenhum outro consumidor foi ativado. Dados SIMULADOS.
// A paridade compara a SAÍDA SERIALIZADA (JSON), então vale também para a ordem dos campos, dos grupos e dos motivos.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { groupDuplicates } from '../dedupe.js';
import { groupStayRecords } from '../dedupe-adapter.js';
import { groupDuplicates as legacyGroupDuplicates } from './fixtures/legacy-dedupe-reference.js';
import { cluster, explain } from '../../dedupe/engine.js';
import { structureGroupReasons } from '../contract.js';

// ---- gerador pseudoaleatório com semente fixa: corpora que provocam todas as regras, sem nome, sem coordenadas, ids repetidos ----
const makeRng = (seed) => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
function corpus(seed, { maxSize = 80, coordlessShare = 0.15, spread = 0.02 } = {}) {
  const rnd = makeRng(seed);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const NAMES = [null, '', '   ', 'Casa Sol', 'casa sol', 'Hotel Mar', 'Pousada Lua', '---', 'Hostel Alfama', '渋谷ゲストハウス', 'Casa do Mar Verde', 'Mar Verde Casa', 'Ünï Çode'];
  const SITES = [null, null, 'https://a.test', 'https://www.a.test/x', 'https://b.test', 'https://facebook.com/x', 'nao-e-url'];
  const PHONES = [null, null, '211234567', '+351 211 234 567', '911000111', '123'];
  const CATS = ['hotel', 'hotel', 'hostel', 'pousada', 'nao_classificada'];
  const CITIES = [null, 'Lisboa', 'lisboa', 'LISBOA', 'Porto', 'São Paulo', 'sao paulo'];
  const PROVIDERS = ['osm', 'osm', 'wikivoyage', 'cadastur', 'community', 'outro'];
  const n = 1 + Math.floor(rnd() * maxSize);
  const lat0 = pick([38.7, 60, -33.4, 35.65]);
  return Array.from({ length: n }, (_, i) => {
    const located = rnd() >= coordlessShare;
    const provider = pick(PROVIDERS);
    const sid = pick([`s${i}`, `s${i}`, `k${Math.floor(rnd() * 6)}`]);
    const lat = located ? lat0 + (rnd() - 0.5) * spread : null;
    const partialCoords = rnd() < 0.03; // só latitude, ou só longitude: casos de borda do código antigo
    return {
      id: `${provider}:${rnd() < 0.08 ? 'dup' : i}`, provider, sourceId: sid, name: pick(NAMES), category: pick(CATS), osmKind: 'hotel',
      lat: partialCoords ? (rnd() < 0.5 ? lat : null) : lat, lon: partialCoords ? (rnd() < 0.5 ? null : -9.1 + (rnd() - 0.5) * spread) : (located ? -9.1 + (rnd() - 0.5) * spread : null),
      city: pick(CITIES), website: pick(SITES), phone: pick(PHONES), address: rnd() < 0.5 ? 'Rua X' : null, openingHours: rnd() < 0.3 ? 'Mo-Su' : null,
      registry: provider === 'cadastur' ? 'cadastur' : undefined,
      prices: rnd() < 0.4 ? [{ status: 'published', amount: 5 + Math.floor(rnd() * 90), currency: 'EUR', unit: { basis: 'person', period: 'night' }, observedAt: '2026-10-20T00:00:00.000Z', source: { name: 'F' } }] : (rnd() < 0.1 ? undefined : []),
      sources: [{ provider, name: 'x', license: 'x', attribution: 'x', originalId: sid, sourceUrl: null }, ...(rnd() < 0.1 ? [{ provider: 'outra', name: 'y', license: 'y', attribution: 'y', originalId: `o${i}`, sourceUrl: null }] : [])],
    };
  });
}
const same = (records) => JSON.stringify(groupDuplicates(records)) === JSON.stringify(legacyGroupDuplicates(records));

describe('E2: paridade do adaptador com a implementação anterior (saída serializada idêntica)', () => {
  it('dedupe.js continua exportando groupDuplicates, agora o adaptador do Stay Finder', () => {
    expect(groupDuplicates).toBe(groupStayRecords);
  });
  it('700 corpora aleatórios (semente fixa), de 1 a 80 registros, com todas as regras e casos de borda: saída idêntica', () => {
    let groups = 0;
    let linked = 0;
    for (let seed = 1; seed <= 700; seed += 1) {
      const records = corpus(seed);
      const a = JSON.stringify(groupDuplicates(records));
      expect(a).toBe(JSON.stringify(legacyGroupDuplicates(records)));
      const parsed = JSON.parse(a);
      groups += parsed.length;
      linked += parsed.filter((g) => g.groupSize > 1).length;
    }
    expect(linked).toBeGreaterThan(300); // o corpus de fato exercita agrupamentos, não só registros isolados
    expect(groups).toBeGreaterThan(5000);
  });
  it('corpora com muitos registros sem coordenadas, muito densos e em latitudes altas: saída idêntica', () => {
    for (let seed = 1000; seed < 1060; seed += 1) {
      expect(same(corpus(seed, { coordlessShare: 0.6 }))).toBe(true);
      expect(same(corpus(seed + 100, { spread: 0.004, maxSize: 120 }))).toBe(true);
    }
  });
  it('a ordem de entrada (permutada) produz a mesma saída que o código anterior para a mesma permutação', () => {
    for (let seed = 2000; seed < 2060; seed += 1) {
      const records = corpus(seed);
      const rnd = makeRng(seed);
      const shuffled = [...records].sort(() => rnd() - 0.5);
      expect(same(shuffled)).toBe(true);
      expect(same([...records].reverse())).toBe(true);
    }
  });
  it('lista grande e densa (4.000 pontos): idêntica ao código anterior e no mesmo regime de tempo', () => {
    const big = Array.from({ length: 4000 }, (_, i) => ({ id: `b${i}`, provider: 'osm', sourceId: `b${i}`, name: `Lugar ${i % 900}`, category: 'hostel', lat: -30 + (i % 80) * 0.0012, lon: -50 + Math.floor(i / 80) * 0.0012, city: null, website: null, phone: null, prices: [], sources: [] }));
    const t0 = Date.now();
    const a = JSON.stringify(groupDuplicates(big));
    const dtNew = Date.now() - t0;
    const t1 = Date.now();
    const b = JSON.stringify(legacyGroupDuplicates(big));
    const dtOld = Date.now() - t1;
    expect(a).toBe(b);
    expect(dtNew).toBeLessThan(Math.max(3000, dtOld * 3)); // não mais lento que o código anterior além de uma margem folgada
  });
  it('entradas vazias e de borda: idêntica', () => {
    expect(same([])).toBe(true);
    expect(same([{ id: 'x', provider: 'osm', sourceId: 'x', name: 'A', category: 'hotel', lat: 1, lon: 1, sources: [], prices: [] }])).toBe(true);
    expect(same([{ id: 'x', provider: 'osm', sourceId: 'x', name: 'A', category: 'hotel', lat: 1, lon: null, sources: [], prices: [] }, { id: 'y', provider: 'osm', sourceId: 'y', name: 'A', category: 'hotel', lat: 1, lon: null, sources: [] }])).toBe(true);
  });
  it('não altera os registros de entrada', () => {
    for (let seed = 3000; seed < 3040; seed += 1) {
      const records = corpus(seed);
      const before = JSON.stringify(records);
      groupDuplicates(records);
      expect(JSON.stringify(records)).toBe(before);
    }
  });
  it('um erro do código antigo também continua sendo erro: registro sem `sources` (o adaptador não o tolera nem o esconde)', () => {
    const bad = [{ id: 'x', provider: 'osm', sourceId: 'x', name: 'A', category: 'hotel', lat: 1, lon: 1, prices: [] }];
    expect(() => legacyGroupDuplicates(bad)).toThrow();
    expect(() => groupDuplicates(bad)).toThrow();
  });
});

describe('E2: o item do Stay Finder continua montado pelo adaptador, com o mesmo formato', () => {
  it('campos e ordem: os do principal (com sources e prices reescritos na posição de origem), depois registries, groupSize, groupReasons, memberIds, possibleDuplicates', () => {
    const input = [{ id: 'a', provider: 'osm', sourceId: 'k', name: 'A', category: 'hotel', lat: 1, lon: 1, city: null, website: null, phone: null, prices: [], sources: [{ provider: 'osm', originalId: 'k' }] }];
    const [g] = groupDuplicates(input);
    expect(Object.keys(g).slice(-4)).toEqual(['groupSize', 'groupReasons', 'memberIds', 'possibleDuplicates']);
    expect(Object.keys(g)).toEqual(Object.keys(legacyGroupDuplicates(input)[0])); // mesma ordem de campos que o código anterior
  });
  it('soma de preços e de fontes sem mover nem filtrar ofertas: duas cópias com o mesmo preço continuam sendo dois preços', () => {
    const p = { status: 'published', amount: 20, currency: 'EUR', unit: { basis: 'person', period: 'night' }, observedAt: '2026-10-20T00:00:00.000Z', source: { name: 'F' } };
    const mk = (id, lat) => ({ id, provider: 'osm', sourceId: 'K', name: id, category: 'hotel', lat, lon: -9.1, prices: [p], sources: [{ provider: 'osm', originalId: 'K' }] });
    const [g] = groupDuplicates([mk('a', 38.7), mk('b', 38.7005)]);
    expect(g.prices).toHaveLength(2);
    expect(g.sources).toHaveLength(1);
    expect(g.groupSize).toBe(2);
  });
});

describe('E2: os motivos nativos do motor coincidem com os motivos estruturados da E1 (derivados do texto)', () => {
  it('em 400 corpora, explain(grupo).reasons == structureGroupReasons(groupReasons) (rule, kind, text, distanceM, origin)', () => {
    let compared = 0;
    for (let seed = 5000; seed < 5400; seed += 1) {
      const records = corpus(seed);
      const legacyGroups = legacyGroupDuplicates(records);
      const native = cluster(records).map((c) => explain(c).reasons);
      expect(native).toEqual(legacyGroups.map((g) => structureGroupReasons(g.groupReasons)));
      compared += native.reduce((n, r) => n + r.length, 0);
    }
    expect(compared).toBeGreaterThan(500);
  });
});

// ---- guardas estáticas sobre a produção (arquivos fora de __tests__) ----
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  if (f === '__tests__' || f === 'node_modules') return [];
  return statSync(p).isDirectory() ? walk(p) : /\.(js|jsx|mjs)$/.test(f) ? [p] : [];
});
const prod = [...walk(join(root, 'src')), join(root, 'server.mjs'), ...walk(join(root, 'netlify')), ...walk(join(root, 'scripts'))];
const text = (f) => readFileSync(f, 'utf8');
const where = (re) => prod.filter((f) => re.test(text(f))).map((f) => relative(root, f)).sort();

describe('E2: guardas estáticas (uma só implementação das regras; nenhum outro consumidor ativado)', () => {
  it('os textos dos motivos legados são produzidos só no motor (o derivador da E1 apenas os lê)', () => {
    expect(where(/mesmo registro da fonte/)).toEqual(['src/services/dedupe/engine.js', 'src/services/stays/contract.js']);
    expect(where(/mesmo nome e município \(sem coordenadas\)/)).toEqual(['src/services/dedupe/engine.js', 'src/services/stays/contract.js']);
  });
  it('os limites e a grade do agrupamento só existem no conjunto de regras do motor', () => {
    expect(where(/cellDegrees|reachMeters|possibleSimilarity/)).toEqual(['src/services/dedupe/engine.js']);
    expect(where(/CELL\s*=\s*0\.003|dist\s*<=\s*150|dist\s*<=\s*250/)).toEqual([]);
  });
  it('dedupe.js não tem mais lógica: só reexporta o adaptador', () => {
    const src = text(join(root, 'src/services/stays/dedupe.js')).split('\n').filter((l) => !l.startsWith('//') && l.trim());
    expect(src).toEqual(["export { groupStayRecords as groupDuplicates } from './dedupe-adapter.js';"]);
  });
  it('só o adaptador do Stay Finder usa o motor; o chat (lodgingModel) e o roteiro continuam independentes', () => {
    expect(where(/from '[^']*dedupe\/engine[^']*'/)).toEqual(['src/services/stays/dedupe-adapter.js']);
    expect(where(/from '[^']*dedupe-adapter[^']*'/)).toEqual(['src/services/stays/dedupe.js']);
    expect(text(join(root, 'src/services/lodging/lodgingModel.js'))).not.toMatch(/dedupe\/engine|dedupe-adapter|stays\//);
    expect(text(join(root, 'src/services/roteiro/tools.js'))).toMatch(/dedupeLodgings/);
    expect(text(join(root, 'src/services/roteiro/tools.js'))).not.toMatch(/dedupe\/engine|dedupe-adapter/);
  });
  it('search.js continua chamando groupDuplicates por ./dedupe.js (consumidor inalterado)', () => {
    expect(text(join(root, 'src/services/stays/search.js'))).toMatch(/import \{ groupDuplicates \} from '\.\/dedupe\.js';/);
  });
  it('o oráculo (implementação anterior) só é usado por testes e nunca é importado pela produção', () => {
    expect(where(/legacy-dedupe-reference/)).toEqual([]);
  });
  it('o motor não depende de nada fora de geo, categorias e normalização de texto (núcleo neutro)', () => {
    const imports = [...text(join(root, 'src/services/dedupe/engine.js')).matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort();
    expect(imports).toEqual(['../geo.js', '../stays/categories.js', '../stays/unicode.js']);
  });
});
