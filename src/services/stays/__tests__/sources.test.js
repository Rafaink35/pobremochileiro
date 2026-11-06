import { describe, expect, it } from 'vitest';
import { createOsmAdapter, buildQuery, expandScope } from '../../datalayer/sources/osm.js';
import { createOsmStaySource, toStayRecord } from '../sources/osm.js';
import { createWikivoyageSource, parseSleepListings, parseTemplates } from '../sources/wikivoyage.js';
import { createCadasturStaySource } from '../sources/cadastur.js';
import { createCommunityStaySource } from '../sources/community.js';
import { createCadasturAdapter } from '../../datalayer/sources/cadastur.js';
import { createEstablishment } from '../../datalayer/model.js';
import { CITIES, fakeFetch, overpassBody, jsonResponse, NOW } from './fixtures/index.js';

const instant = { run: (fn) => fn() };
const osmSource = (fetchImpl) => createOsmStaySource({ adapter: createOsmAdapter({ fetchImpl, limiter: instant, sleep: async () => {}, cache: { get: () => undefined, set: () => {} }, now: () => NOW }), now: () => NOW });
const dest = (key) => { const n = CITIES[key].nominatim.at(-1); return { id: 'x', name: n.name, nameEn: n.namedetails['name:en'], lat: Number(n.lat), lon: Number(n.lon), radiusM: 8000, countryCode: n.address.country_code.toUpperCase(), regionCode: n.address['ISO3166-2-lvl4'] ?? null }; };

describe('consulta Overpass por centro e raio (qualquer país)', () => {
  it('monta consulta circular com só as categorias pedidas', () => {
    const q = buildQuery({ kind: 'around', lat: 35.68, lon: 139.69, radiusM: 5000, tourism: ['hostel', 'camp_site'] });
    expect(q).toContain('(around:5000,35.68,139.69)');
    expect(q).toContain('^(hostel|camp_site)$');
    expect(q).not.toContain('BR-');
  });
  it('recusa raio fora do limite, coordenadas inválidas e categorias fora da lista (sem injeção)', () => {
    expect(() => expandScope({ kind: 'around', lat: 0, lon: 0, radiusM: 100 })).toThrow();
    expect(() => expandScope({ kind: 'around', lat: 0, lon: 0, radiusM: 99999 })).toThrow();
    expect(() => expandScope({ kind: 'around', lat: 91, lon: 0, radiusM: 5000 })).toThrow();
    expect(() => expandScope({ kind: 'around', lat: 1, lon: 1, radiusM: 5000, tourism: ['hostel"];out;'] })).toThrow();
  });
});

describe('fonte OpenStreetMap do Stay Finder', () => {
  it.each([['lisboa', 4], ['buenosAires', 3], ['paraty', 4], ['tokyo', 4]])('%s: normaliza elementos de nomes em vários alfabetos', async (key, total) => {
    const out = await osmSource(fakeFetch()).search({ destination: dest(key), categories: ['camping', 'hostel', 'pousada', 'hotel'] });
    expect(out.records).toHaveLength(total);
    for (const r of out.records) {
      expect(r.provider).toBe('osm');
      expect(r.sources[0]).toMatchObject({ license: 'ODbL 1.0', attribution: '© OpenStreetMap contributors' });
      expect(r.sources[0].sourceUrl).toMatch(/openstreetmap\.org\/node\//);
      expect(r.sources[0].collectedAt).toBe(NOW.toISOString());
      expect(r.openStatus).toBe('unknown');
    }
  });
  it('categorias: camping, hostel, pousada (guest_house) e hotel; filtro pela categoria pedida', async () => {
    const out = await osmSource(fakeFetch()).search({ destination: dest('lisboa'), categories: ['hostel'] });
    expect(out.records.map((r) => r.category)).toEqual(['hostel']);
    const all = await osmSource(fakeFetch()).search({ destination: dest('lisboa'), categories: ['camping', 'hostel', 'pousada', 'hotel'] });
    expect(all.records.map((r) => r.category).sort()).toEqual(['camping', 'hostel', 'hotel', 'pousada']);
  });
  it('preço: só com valor, moeda e data da fonte; unidade só se escrita; sem tag, sem preço', async () => {
    const out = await osmSource(fakeFetch()).search({ destination: dest('lisboa'), categories: ['camping', 'hostel', 'pousada', 'hotel'] });
    const by = (n) => out.records.find((r) => r.name === n);
    expect(by('Hostel Exemplo Alfama').prices[0]).toMatchObject({ status: 'published', amount: 18, currency: 'EUR', unit: { basis: 'person', period: 'night' } });
    expect(by('Parque de Campismo Fictício').prices[0]).toMatchObject({ free: true });
    expect(by('Casa de Hóspedes Teste').prices).toEqual([]);
    const ba = await osmSource(fakeFetch()).search({ destination: dest('buenosAires'), categories: ['hostel'] });
    expect(ba.records.find((r) => r.name === 'Albergue Ejemplo Palermo').prices[0]).toMatchObject({ amount: 12500, currency: 'ARS' });
    expect(ba.records.find((r) => r.name === 'Hostel Sin Precio San Telmo').prices).toEqual([]);
  });
  it('preço sem data de edição na fonte não é considerado (a idade seria desconhecida)', () => {
    const r = toStayRecord({ type: 'node', id: 1, lat: 1, lon: 1, tags: { tourism: 'hostel', name: 'X', charge: '10 EUR per person per night' } }, { collectedAt: NOW.toISOString() });
    expect(r.prices[0].observedAt).toBeNull(); // será "indisponível" na classificação
  });
  it('ecovila e hospedagem colaborativa não têm marcação no OSM: a fonte não se aplica', () => {
    expect(osmSource(fakeFetch()).supports(['ecovila', 'colaborativa']).ok).toBe(false);
    expect(osmSource(fakeFetch()).supports(['hostel']).ok).toBe(true);
  });
  it('falha da fonte vira erro (tratado pelo orquestrador), nunca resultado inventado', async () => {
    await expect(osmSource(fakeFetch({ overpassStatus: 504 })).search({ destination: dest('lisboa'), categories: ['hostel'] })).rejects.toThrow();
  });
  it('país e região fora do Brasil: estado do OSM vai para `region`, não para UF', () => {
    const { value } = createEstablishment({ name: 'X', type: 'hostel', latitude: 35, longitude: 139, region: 'Tokyo', country: 'JP', source: 'osm', source_id: 'node/1', license: 'ODbL 1.0' });
    expect(value).toMatchObject({ region: 'Tokyo', country: 'JP', state: null });
  });
});

const WIKITEXT = `
== Sleep ==
{{Sleep
| name=[[Hostel Exemplo Wiki]] | url=https://wiki-exemplo.test | lat=38.711 | long=-9.13 | price=€18 per person per night | lastedit=2026-09-01
| content=Quartos {{nowrap|simples}} perto do rio.
}}
{{listing | type=sleep | name=Camping Fictício Wiki | lat=38.75 | long=-9.18 | price=€15-25 | lastedit=2026-09-01}}
{{Sleep | name=Pousada Sem Coordenadas | price=€40 per room per night}}
{{Sleep | name=Casa Misteriosa | lat=38.72 | long=-9.14 | price=€40 per room per night}}
{{Sleep | name=Hotel Distante | lat=41.15 | long=-8.61 | price=€80}}
{{Eat | name=Restaurante | lat=38.7 | long=-9.1}}
`;

describe('fonte Wikivoyage (candidata)', () => {
  it('lê predefinições com outras aninhadas dentro e identifica as que não são de hospedagem', () => {
    const t = parseTemplates(WIKITEXT);
    expect(t.map((x) => x.name)).toEqual(['sleep', 'listing', 'sleep', 'sleep', 'sleep', 'eat']); // a predefinição aninhada {{nowrap}} fica dentro da externa
    expect(t[0].params.name).toBe('[[Hostel Exemplo Wiki]]');
  });
  it('registros só com coordenadas e dentro da área; o tipo NÃO é deduzido do nome: ficam "não classificados"', () => {
    const d = { ...dest('lisboa') };
    const { records, skipped } = parseSleepListings(WIKITEXT, { title: 'Lisbon', revisionAt: '2026-10-01T00:00:00Z', destination: d, collectedAt: NOW.toISOString() });
    expect(records.map((r) => r.name)).toEqual(['Hostel Exemplo Wiki', 'Camping Fictício Wiki', 'Casa Misteriosa']);
    expect(skipped).toMatchObject({ noCoordinates: 1, outsideArea: 1 });
    expect(records.map((r) => r.category)).toEqual(['nao_classificada', 'nao_classificada', 'nao_classificada']); // "Hostel" e "Camping" no nome não bastam
    expect(records[0].sources[0]).toMatchObject({ license: expect.stringContaining('CC BY-SA 4.0'), attribution: 'Wikivoyage contributors' });
  });
  it('preço: único valor com moeda vale; faixa é ambígua e não vira preço', () => {
    const { records } = parseSleepListings(WIKITEXT, { title: 'Lisbon', revisionAt: '2026-10-01T00:00:00Z', destination: dest('lisboa'), collectedAt: NOW.toISOString() });
    expect(records[0].prices[0]).toMatchObject({ amount: 18, currency: 'EUR', status: 'published', observedAt: '2026-09-01T00:00:00.000Z' });
    expect(records[1].prices).toEqual([]);
    expect(records[1].priceText).toBe('€15-25');
  });
  it('sem `lastedit` na listagem o preço fica indisponível: a data da revisão da página não prova a idade do preço', () => {
    const text = '{{Sleep | name=Pousada Real Sem Data | lat=38.71 | long=-9.13 | price=R$192}}';
    const { records } = parseSleepListings(text, { title: 'Paraty', revisionAt: '2026-11-01T17:58:48Z', destination: dest('lisboa'), collectedAt: NOW.toISOString() });
    expect(records[0].priceText).toBe('R$192');
    expect(records[0].prices[0].observedAt).toBeNull(); // classificado como indisponível adiante
    expect(records[0].sources[0].pageRevisionAt).toBe('2026-11-01T17:58:48Z');
  });
  it('busca pela API com o nome em inglês, identifica-se e trata página inexistente sem inventar', async () => {
    const body = { query: { pages: [{ title: 'Lisbon', revisions: [{ timestamp: '2026-10-01T00:00:00Z', slots: { main: { content: WIKITEXT } } }] }] } };
    let url;
    const f = async (u, init) => { url = String(u); expect(init.headers['user-agent']).toMatch(/PobreMochileiro/); return jsonResponse(body); };
    const src = createWikivoyageSource({ fetchImpl: f, limiter: instant, sleep: async () => {}, now: () => NOW, contact: 'x@y.test' });
    const out = await src.search({ destination: dest('lisboa'), categories: ['hostel', 'camping'] });
    expect(url).toContain('titles=Lisbon');
    expect(out.records).toHaveLength(3);
    const none = await createWikivoyageSource({ fetchImpl: fakeFetch(), limiter: instant, now: () => NOW }).search({ destination: dest('lisboa'), categories: ['hostel'] });
    expect(none.records).toEqual([]);
    expect(none.note).toMatch(/Sem página/);
  });
});

const CSV = 'Nome Fantasia;Atividade;Municipio;UF;Telefone\nPousada Fictícia do Centro;Pousada;Paraty;RJ;24 3333-0000\nHostel de Outra Cidade;Hostel;Niterói;RJ;\nCamping Ficticio Sul;Camping;Paraty;SP;\nRestaurante X;Restaurante;Paraty;RJ;\n';
describe('fonte Cadastur (complementar, só Brasil)', () => {
  const adapter = () => createCadasturAdapter({ readText: async () => CSV, now: () => NOW });
  it('não configurada sem arquivo; fora do Brasil não se aplica', () => {
    const none = createCadasturStaySource({ adapter: createCadasturAdapter({ csvUrl: null }) });
    expect(none.supports(['hostel'], { countryCode: 'BR' })).toMatchObject({ ok: false, notConfigured: true });
    const cad = createCadasturStaySource({ adapter: adapter() });
    expect(cad.supports(['hostel'], { countryCode: 'PT' })).toMatchObject({ ok: false });
    expect(cad.supports(['hostel'], { countryCode: 'BR' }).ok).toBe(true);
  });
  it('filtra por município e UF, só categorias com equivalente, sem coordenadas nem preço', async () => {
    const out = await createCadasturStaySource({ adapter: adapter(), now: () => NOW }).search({ destination: dest('paraty'), categories: ['pousada', 'hostel', 'camping', 'hotel'] });
    expect(out.records.map((r) => r.name)).toEqual(['Pousada Fictícia do Centro']);
    expect(out.records[0]).toMatchObject({ lat: null, prices: [], registry: 'cadastur', country: 'BR' });
  });
});

describe('cadastro próprio com moderação (arquitetura)', () => {
  it('sem carregador configurado: não configurada, sem dados', () => {
    expect(createCommunityStaySource().supports(['ecovila'], {})).toMatchObject({ ok: false, notConfigured: true });
  });
  it('só registros aprovados e preços aprovados entram', async () => {
    const rows = [
      { id: 'a', status: 'approved', category: 'ecovila', name: 'Ecovila Fictícia', lat: 1, lon: 1, approvedAt: '2026-10-01T00:00:00Z', prices: [{ approved: true, status: 'confirmed', amount: 40, currency: 'EUR', unit: { basis: 'person', period: 'night' }, observedAt: '2026-10-20T00:00:00Z' }, { approved: false, amount: 1, currency: 'EUR' }] },
      { id: 'b', status: 'pending', category: 'ecovila', name: 'Pendente' },
    ];
    const out = await createCommunityStaySource({ load: async () => rows, now: () => NOW }).search({ destination: {}, categories: ['ecovila'] });
    expect(out.records.map((r) => r.name)).toEqual(['Ecovila Fictícia']);
    expect(out.records[0].prices).toHaveLength(1);
    expect(out.records[0].prices[0].status).toBe('confirmed');
  });
});
