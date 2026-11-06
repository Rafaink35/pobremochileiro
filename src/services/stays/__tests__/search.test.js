import { describe, expect, it } from 'vitest';
import { createDefaultStayService } from '../index.js';
import { createStaySearch } from '../search.js';
import { createBreaker, createStaleCache } from '../cache.js';
import { CITIES, fakeFetch, jsonResponse, NOW } from './fixtures/index.js';

const instant = { run: (fn) => fn() };
const service = (fetchImpl, { env = {}, now = () => NOW, searchOptions } = {}) =>
  createDefaultStayService(env, { fetchImpl, limiter: instant, sleep: async () => {}, now, searchOptions });
const all = (g) => [...g.ranked, ...g.withPrice, ...g.stalePrice, ...g.noPrice];

describe('Stay Finder: destinos de validação', () => {
  it.each([
    ['lisboa', 'Lisboa', 'PT'],
    ['buenosAires', 'Buenos Aires', 'AR'],
    ['paraty', 'Paraty', 'BR'],
  ])('%s: pesquisa ponta a ponta, com fontes, datas e separação com/sem preço', async (key, query, cc) => {
    const r = await service(fakeFetch()).search({ query, categories: 'camping,hostel,pousada,hotel' });
    expect(['ok', 'partial']).toContain(r.status);
    expect(r.destination.countryCode).toBe(cc);
    expect(r.collectedAt).toBe(NOW.toISOString());
    expect(r.sources.map((s) => s.id)).toEqual(['osm', 'wikivoyage', 'cadastur', 'community']);
    expect(r.sources.find((s) => s.id === 'osm')).toMatchObject({ status: 'ok', license: 'ODbL 1.0', attribution: '© OpenStreetMap contributors' });
    expect(r.sources.find((s) => s.id === 'community').status).toBe('not_configured');
    expect(r.counts.total).toBe(all(r.groups).length);
    for (const i of r.groups.noPrice) expect(i.pricing.class).toBe('unavailable');
    for (const i of r.groups.ranked) expect(i.pricing.amount).toBeGreaterThan(0);
    expect(r.groups.ranked.length).toBeLessThanOrEqual(3);
  });

  it('Lisboa: o hostel com preço publicado entra no ranking; o hotel com preço antigo é "desatualizado"; sem preço nunca é ranqueado', async () => {
    const r = await service(fakeFetch()).search({ query: 'Lisboa', categories: 'camping,hostel,pousada,hotel' });
    expect(r.groups.ranked.map((i) => i.name)).toEqual(['Hostel Exemplo Alfama']);
    expect(r.groups.withPrice).toEqual([]);
    expect(r.groups.stalePrice.map((i) => i.name)).toEqual(['Hotel Fictício Chiado']);
    // `fee=no` do campismo é só observação: sem preço, sem gratuidade, sem ranking
    expect(r.groups.noPrice.map((i) => i.name)).toEqual(['Casa de Hóspedes Teste', 'Parque de Campismo Fictício']);
    expect(r.groups.noPrice.find((i) => i.name === 'Parque de Campismo Fictício')).toMatchObject({ feeTag: 'no', pricing: { class: 'unavailable', amount: null } });
    expect(r.rankNotes.join(' ')).toMatch(/Só 1 opção/);
  });

  it('Paraty: 3 opções verificáveis de unidades diferentes → ranking só do grupo comparável; as outras aparecem separadas', async () => {
    const r = await service(fakeFetch()).search({ query: 'Paraty', categories: 'camping,hostel,pousada,hotel' });
    expect(r.rankKey).toBe('BRL|person|night');
    expect(r.groups.ranked.map((i) => i.name)).toEqual(['Camping Exemplo Trindade', 'Hostel Exemplo Paraty']);
    expect(r.groups.withPrice.map((i) => i.name)).toEqual(['Pousada Fictícia do Centro']); // por quarto: unidade diferente
    expect(r.groups.noPrice.map((i) => i.name)).toEqual(['Pousada Sem Preço']);
  });

  it('Buenos Aires: preço em pesos é comparável só entre si; sem preço fica separado', async () => {
    const r = await service(fakeFetch()).search({ query: 'Buenos Aires', categories: 'hostel,pousada' });
    expect(r.groups.ranked.map((i) => i.pricing.currency)).toEqual(['ARS']);
    expect(r.groups.noPrice.map((i) => i.name).sort()).toEqual(['Hostel Sin Precio San Telmo', 'Posada de Prueba']);
  });

  it('Santiago é ambíguo: devolve candidatos; escolhido o do Chile, pesquisa normalmente', async () => {
    const f = fakeFetch();
    const svc = service(f);
    const amb = await svc.search({ query: 'Santiago', categories: 'hostel,camping' });
    expect(amb.status).toBe('ambiguous');
    expect(amb.groups).toBeNull();
    expect(f.calls.overpass).toBe(0); // não pesquisa antes de a pessoa escolher
    const chile = amb.candidates.find((c) => c.countryCode === 'CL');
    const r = await svc.search({ lat: chile.lat, lon: chile.lon, name: chile.name, nameEn: chile.nameEn, label: chile.label, countryCode: chile.countryCode, radiusM: chile.radiusM, categories: 'hostel,camping' });
    expect(['ok', 'partial']).toContain(r.status);
    expect(r.groups.ranked.map((i) => i.name)).toEqual(['Hostal Ejemplo Bellavista']);
    expect(r.groups.noPrice.map((i) => i.name)).toEqual(['Camping Ficticio Cajón']); // pago, sem valor: sem preço
  });

  it('Tóquio (japonês): nomes em kana, categorias e atribuição preservados', async () => {
    const r = await service(fakeFetch()).search({ query: '東京', categories: 'hostel,pousada,camping' });
    const names = all(r.groups).map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(['渋谷ゲストハウス', 'ホステル浅草', 'ゲストハウス上野', 'キャンプ場 多摩']));
    expect(r.groups.ranked.map((i) => i.pricing.currency)).toEqual(['JPY']);
    expect(r.groups.noPrice.length).toBe(3); // inclui o camping com fee=no, que não é preço nem gratuidade
  });

  it('ecovila e hospedagem colaborativa: sem fonte aberta, resposta honesta e vazia', async () => {
    for (const cat of ['ecovila', 'colaborativa']) {
      const r = await service(fakeFetch()).search({ query: 'Lisboa', categories: cat });
      expect(r.status).toBe('ok');
      expect(all(r.groups)).toEqual([]);
      expect(r.categoryNotes.join(' ')).toMatch(/fonte aberta|dados abertos/);
      expect(r.message).toMatch(/Nenhuma fonte disponível/);
    }
  });

  it('categoria inválida e destino inexistente não quebram', async () => {
    expect((await service(fakeFetch()).search({ query: 'Lisboa', categories: 'castelo' })).status).toBe('invalid');
    expect((await service(fakeFetch()).search({ query: 'Nenhum Lugar' })).status).toBe('not_found');
  });

  it('resultado vazio nas fontes: mensagem diz que isso não prova inexistência', async () => {
    const empty = { vazio: { query: 'Vilarejo', nominatim: [CITIES.lisboa.nominatim[0]], elements: [] } };
    const r = await service(fakeFetch({ cities: empty })).search({ query: 'Vilarejo', categories: 'hostel' });
    expect(r.groups.ranked).toEqual([]);
    expect(r.message).toMatch(/não prova/);
  });
});

describe('Stay Finder: falhas e cache', () => {
  it('uma fonte falha e as outras respondem: status parcial, erro identificado, resultado mantido', async () => {
    const wiki = { query: { pages: [{ title: 'Lisbon', revisions: [{ timestamp: '2026-10-01T00:00:00Z', slots: { main: { content: '' } } }] }] } };
    const f = fakeFetch({ wikivoyage: wiki });
    const flaky = async (url, init) => (String(url).includes('wikivoyage') ? jsonResponse({}, { status: 500 }) : f(url, init));
    const r = await service(flaky).search({ query: 'Lisboa', categories: 'hostel' });
    expect(r.status).toBe('partial');
    expect(r.sources.find((s) => s.id === 'wikivoyage')).toMatchObject({ status: 'failed', error: 'a fonte respondeu 500' });
    expect(r.sources.find((s) => s.id === 'osm').status).toBe('ok');
    expect(r.groups.ranked.length).toBe(1);
  });

  it('todas as fontes fora do ar: indisponível, sem inventar resultado', async () => {
    const f = fakeFetch({ overpassStatus: 504 });
    const flaky = async (url, init) => (String(url).includes('wikivoyage') ? jsonResponse({}, { status: 503 }) : f(url, init));
    const r = await service(flaky).search({ query: 'Lisboa', categories: 'hostel' });
    expect(r.status).toBe('unavailable');
    expect(r.groups).toBeNull();
    expect(r.sources.filter((s) => s.status === 'failed').map((s) => s.id).sort()).toEqual(['osm', 'wikivoyage']);
  });

  it('geocodificador fora do ar: indisponível com mensagem', async () => {
    const down = async (url) => (String(url).includes('nominatim') ? jsonResponse({}, { status: 503 }) : jsonResponse({}));
    const r = await service(down).search({ query: 'Lisboa' });
    expect(r.status).toBe('unavailable');
    expect(r.message).toMatch(/localizar o destino/);
  });

  it('cache de 24 h por fonte: 2ª pesquisa não consulta de novo; após 25 h, consulta', async () => {
    let t = NOW.getTime();
    const f = fakeFetch();
    const cache = createStaleCache({ now: () => t });
    const svc = service(f, { now: () => new Date(t), searchOptions: { cache } });
    await svc.search({ query: 'Lisboa', categories: 'hostel' });
    await svc.search({ query: 'Lisboa', categories: 'hostel' });
    expect(f.calls.overpass).toBe(1);
    expect(f.calls.nominatim).toBe(1);
    t += 25 * 3600_000;
    const r = await svc.search({ query: 'Lisboa', categories: 'hostel' });
    expect(f.calls.overpass).toBe(2);
    expect(r.sources.find((s) => s.id === 'osm').fromCache).toBe(false);
  });

  it('fonte cai depois do prazo: usa a cópia anterior e diz isso (sem apresentar como atual)', async () => {
    let t = NOW.getTime();
    const ok = fakeFetch();
    let down = false;
    const f = async (url, init) => (down && String(url).includes('overpass') ? jsonResponse({}, { status: 503 }) : ok(url, init));
    const cache = createStaleCache({ now: () => t });
    const svc = service(f, { now: () => new Date(t), searchOptions: { cache } });
    await svc.search({ query: 'Lisboa', categories: 'hostel' });
    t += 30 * 3600_000;
    down = true;
    const r = await svc.search({ query: 'Lisboa', categories: 'hostel' });
    const osm = r.sources.find((s) => s.id === 'osm');
    expect(osm).toMatchObject({ status: 'stale', fromCache: true });
    expect(osm.error).toBeTruthy();
    expect(r.status).toBe('partial');
    expect(r.groups.ranked.length).toBe(1);
  });

  it('interruptor: depois de 3 falhas seguidas a fonte entra em pausa e não é mais chamada', async () => {
    const f = fakeFetch({ overpassStatus: 503 });
    const svc = service(f, { searchOptions: { breaker: createBreaker({ threshold: 3, now: () => NOW.getTime() }), cache: createStaleCache({ now: () => NOW.getTime() }) } });
    for (let i = 0; i < 3; i += 1) await svc.search({ lat: 38.7, lon: -9.1 + i * 0.5, name: 'X', categories: 'hostel' });
    const before = f.calls.overpass;
    const r = await svc.search({ lat: 38.7, lon: -7, name: 'X', categories: 'hostel' });
    expect(f.calls.overpass).toBe(before);
    expect(r.sources.find((s) => s.id === 'osm').error).toMatch(/pausa/);
  });

  it('tempo esgotado em uma fonte não trava as outras', async () => {
    const slow = { id: 'lenta', describe: () => ({ id: 'lenta', name: 'Lenta', license: 'x', attribution: 'x' }), supports: () => ({ ok: true }), search: () => new Promise(() => {}) };
    const fast = { id: 'rapida', describe: () => ({ id: 'rapida', name: 'Rápida', license: 'x', attribution: 'x' }), supports: () => ({ ok: true }), search: async () => ({ records: [], collectedAt: NOW.toISOString() }) };
    const svc = createStaySearch({ resolver: null, sources: [slow, fast], timeoutMs: 20, now: () => NOW });
    const r = await svc.search({ lat: 1, lon: 1, name: 'X', categories: 'hostel' });
    expect(r.sources.find((s) => s.id === 'lenta')).toMatchObject({ status: 'failed', error: 'tempo esgotado' });
    expect(r.sources.find((s) => s.id === 'rapida').status).toBe('ok');
  });
});

describe('Stay Finder: deduplicação entre fontes na pesquisa', () => {
  it('mesmo local no OSM e no Wikivoyage vira um item com as duas fontes e cada atribuição', async () => {
    const wikitext = '{{Sleep | name=Hostel Exemplo Alfama | lat=38.7111 | long=-9.1291 | price=€20 per person per night | lastedit=2026-10-15}}';
    const wiki = { query: { pages: [{ title: 'Lisbon', revisions: [{ timestamp: '2026-10-16T00:00:00Z', slots: { main: { content: wikitext } } }] }] } };
    const r = await service(fakeFetch({ wikivoyage: wiki })).search({ query: 'Lisboa', categories: 'hostel' });
    expect(r.counts.total).toBe(1);
    const item = all(r.groups)[0];
    expect(item.sources.map((s) => s.provider).sort()).toEqual(['osm', 'wikivoyage']);
    expect(item.prices).toHaveLength(2);
    expect(item.sources.find((s) => s.provider === 'wikivoyage').license).toContain('CC BY-SA 4.0');
    expect(item.category).toBe('hostel'); // a categoria vem da fonte estruturada (OSM), não do nome
    expect(r.counts.duplicatesGrouped).toBe(1);
  });

  it('listagem do Wikivoyage sem correspondência estruturada NÃO é classificada pelo nome nem aparece nas abas por categoria', async () => {
    const wikitext = '{{Sleep | name=Hostel Só Na Wiki | lat=38.7200 | long=-9.1500 | price=€25 per person per night | lastedit=2026-10-15}}';
    const wiki = { query: { pages: [{ title: 'Lisbon', revisions: [{ timestamp: '2026-10-16T00:00:00Z', slots: { main: { content: wikitext } } }] }] } };
    const svc = service(fakeFetch({ wikivoyage: wiki }));
    const byTab = await svc.search({ query: 'Lisboa', categories: 'hostel' });
    expect(all(byTab.groups).map((i) => i.name)).toEqual(['Hostel Exemplo Alfama']);
    expect(byTab.counts.unclassifiedHidden).toBe(1);
    const withUnclassified = await svc.search({ query: 'Lisboa', categories: 'hostel,nao_classificada' });
    const wiki1 = all(withUnclassified.groups).find((i) => i.name === 'Hostel Só Na Wiki');
    expect(wiki1.category).toBe('nao_classificada');
    expect(wiki1.pricing.class).toBe('published');
  });
});
