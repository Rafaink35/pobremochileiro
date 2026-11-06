import { describe, expect, it } from 'vitest';
import { contentHash, createAvailabilityObservation, createEstablishment, createPriceObservation } from '../model.js';
import { createCache, createRateLimiter, HttpError, parseRetryAfter, withBackoff } from '../cache.js';
import { findLinkCandidates, nameSimilarity } from '../match.js';
import { buildQuery, createOsmAdapter, expandScope, normalizeElements, REGIONS } from '../sources/osm.js';
import { createCadasturAdapter, mapCategory, mapColumns, normalizeCadasturCsv, parseDelimited } from '../sources/cadastur.js';
import { createMemoryStore, createSupabaseStore, sanitizeError } from '../sync/store.js';
import { computeHealth, diffRecords, runSync, upsertRecords } from '../sync/runner.js';

const NOW = new Date('2026-11-02T12:00:00Z');
const now = () => NOW;
const base = (over = {}) => ({ name: 'Hostel Sol', type: 'hostel', latitude: -27.6, longitude: -48.5, state: 'SC', city: 'Florianópolis', source: 'osm', source_id: 'node/1', license: 'ODbL 1.0', ...over });
const node = (id, tags, extra = {}) => ({ type: 'node', id, lat: -27.6, lon: -48.5, timestamp: '2026-09-01T10:00:00Z', tags, ...extra });

describe('modelo unificado', () => {
  it('cria Establishment com proveniência, id estável e hash; desconhecido é null', () => {
    const { value, problems } = createEstablishment(base(), { now });
    expect(problems).toEqual([]);
    expect(value).toMatchObject({ id: 'osm:node/1', origin_kind: 'open', status: 'unverified', phone: null, website: null, description: null, last_verified_at: null, last_synced_at: NOW.toISOString() });
    expect(value.content_hash).toBe(contentHash(value));
  });
  it('rejeita sem nome, tipo inválido, coordenada fora do intervalo, UF inválida ou sem licença', () => {
    for (const [over, msg] of [[{ name: '' }, /nome/], [{ type: 'resort' }, /tipo/], [{ latitude: 95 }, /coordenadas/], [{ state: 'Santa Catarina' }, /UF/], [{ license: '' }, /licença/], [{ source_id: '' }, /id na fonte/]]) {
      const r = createEstablishment(base(over), { now });
      expect(r.value).toBeNull();
      expect(r.problems.join()).toMatch(msg);
    }
  });
  it('aceita registro sem coordenadas (Cadastur), mas não coordenadas pela metade', () => {
    expect(createEstablishment(base({ latitude: null, longitude: null }), { now }).value).not.toBeNull();
    expect(createEstablishment(base({ longitude: null }), { now }).value).toBeNull();
  });
  it('hash muda com o conteúdo e não muda com a data de sincronização', () => {
    const a = createEstablishment(base(), { now }).value;
    const b = createEstablishment(base({ last_synced_at: '2030-01-01T00:00:00Z' }), { now }).value;
    const c = createEstablishment(base({ name: 'Outro' }), { now }).value;
    expect(a.content_hash).toBe(b.content_hash);
    expect(a.content_hash).not.toBe(c.content_hash);
  });
  it('preço desconhecido ou zero NÃO vira observação; disponibilidade desconhecida é null', () => {
    const p = { entity_id: 'osm:node/1', entity_type: 'establishment', amount: 80, currency: 'BRL', price_type: 'current', observed_at: '2026-11-01', source: 'x' };
    expect(createPriceObservation(p).value).toMatchObject({ amount: 80, currency: 'BRL' });
    for (const bad of [{ amount: 0 }, { amount: '' }, { amount: null }, { currency: 'real' }, { price_type: 'chute' }, { observed_at: '' }]) {
      expect(createPriceObservation({ ...p, ...bad }).value).toBeNull();
    }
    const a = { entity_id: 'x', observed_at: '2026-11-01', source: 's' };
    expect(createAvailabilityObservation(a).value).toMatchObject({ available: null, quantity: null });
    expect(createAvailabilityObservation({ ...a, available: 'sim', quantity: -2 }).value).toMatchObject({ available: null, quantity: null });
    expect(createAvailabilityObservation({ ...a, available: false, quantity: 0 }).value).toMatchObject({ available: false, quantity: 0 });
  });
});

describe('cache, limite e recuo', () => {
  it('cache expira pelo TTL', () => {
    let t = 0;
    const c = createCache({ ttlMs: 100, now: () => t });
    c.set('k', 1);
    expect(c.get('k')).toBe(1);
    t = 101;
    expect(c.get('k')).toBeUndefined();
  });
  it('limitador espera o intervalo mínimo entre chamadas, em ordem', async () => {
    let t = 0;
    const sleeps = [];
    const l = createRateLimiter({ minIntervalMs: 1000, now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; } });
    const order = [];
    await Promise.all([l.run(async () => order.push(1)), l.run(async () => order.push(2)), l.run(async () => order.push(3))]);
    expect(order).toEqual([1, 2, 3]);
    expect(sleeps).toEqual([1000, 1000]);
  });
  it('repete em 429/5xx com recuo, respeita Retry-After e não repete 4xx', async () => {
    const waits = [];
    const sleep = async (ms) => waits.push(ms);
    let n = 0;
    expect(await withBackoff(async () => { n += 1; if (n < 3) throw new HttpError(503); return 'ok'; }, { sleep, random: () => 0, baseMs: 1000 })).toBe('ok');
    expect(waits).toEqual([500, 1000]);
    waits.length = 0;
    n = 0;
    await withBackoff(async () => { n += 1; if (n < 2) throw new HttpError(429, 7000); return 1; }, { sleep });
    expect(waits).toEqual([7000]);
    let calls = 0;
    await expect(withBackoff(async () => { calls += 1; throw new HttpError(404); }, { sleep })).rejects.toThrow('HTTP 404');
    expect(calls).toBe(1);
    await expect(withBackoff(async () => { throw new HttpError(500); }, { sleep, retries: 2 })).rejects.toThrow('HTTP 500');
  });
  it('lê Retry-After em segundos e em data', () => {
    expect(parseRetryAfter('5')).toBe(5000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('Mon, 02 Nov 2026 12:00:10 GMT', () => NOW.getTime())).toBe(10000);
  });
});

describe('OpenStreetMap: escopos e consultas', () => {
  it('UF, região, município e caixa geram consultas diferentes; endpoint não entra na consulta', () => {
    expect(buildQuery({ kind: 'uf', uf: 'SC' })).toContain('"ISO3166-2"="BR-SC"');
    expect(buildQuery({ kind: 'municipio', uf: 'SC', name: 'Florianópolis' })).toContain('"name"~"^Florianópolis$"');
    expect(buildQuery({ kind: 'bbox', bbox: [-28, -49, -27, -48] })).toContain('(-28,-49,-27,-48)');
    for (const k of ['hotel', 'hostel', 'guest_house', 'motel', 'camp_site', 'caravan_site']) expect(buildQuery({ kind: 'uf', uf: 'SC' })).toContain(k);
  });
  it('região vira lista de UFs; escopos inválidos são recusados', () => {
    expect(expandScope({ kind: 'region', name: 'Sul' }).map((s) => s.uf)).toEqual(REGIONS.Sul);
    expect(() => expandScope({ kind: 'region', name: 'Marte' })).toThrow();
    expect(() => expandScope({ kind: 'uf', uf: 'XX' })).toThrow();
    expect(() => expandScope({ kind: 'bbox', bbox: [10, 10, 5, 5] })).toThrow();
    expect(() => expandScope({ kind: 'municipio', uf: 'SC', name: '' })).toThrow();
  });
  it('nome com caracteres de regex é escapado', () => {
    expect(buildQuery({ kind: 'municipio', uf: 'SC', name: 'A.B(C)' })).toContain('A\\.B\\(C\\)');
  });
});

describe('OpenStreetMap: normalização', () => {
  const scope = { kind: 'uf', uf: 'SC' };
  it('mapeia tipos, guarda proveniência, UF da consulta e deixa o que não sabe como null', () => {
    const els = [
      node(1, { tourism: 'hostel', name: 'Hostel A', 'addr:street': 'Rua X', 'addr:housenumber': '10' }),
      node(2, { tourism: 'motel', name: 'Motel B' }),
      node(3, { tourism: 'guest_house', name: 'Pousada C', website: 'https://c.example', phone: '+55 48 0000-0000' }),
      node(4, { tourism: 'camp_site', name: 'Camping D', fee: 'no', tents: 'yes' }),
    ];
    const { records, rejected } = normalizeElements(els, { scope, collectedAt: NOW.toISOString(), now });
    expect(rejected).toEqual([]);
    expect(records.map((r) => r.type)).toEqual(['hostel', 'hotel', 'guest_house', 'camping']);
    expect(records[0]).toMatchObject({ id: 'osm:node/1', state: 'SC', address: 'Rua X, 10', license: 'ODbL 1.0', attribution: '© OpenStreetMap contributors', origin_kind: 'open', last_verified_at: null, status: 'unverified', phone: null, website: null });
    expect(records[0].source_url).toBe('https://www.openstreetmap.org/node/1');
    expect(records[1].extra.osm_tourism).toBe('motel');
    expect(records[3].facilities).toMatchObject({ tents: true, fee_tag: 'no', shower: null });
    expect(records[3].facilities).not.toHaveProperty('fee');
    expect(records[0].extra.osm_last_edit).toBe('2026-09-01T10:00:00Z');
  });
  it('rejeita sem nome, sem coordenadas e fora do escopo, contando o motivo; não trata a falta de dado como inexistência', () => {
    const els = [node(1, { tourism: 'hotel' }), { type: 'node', id: 2, tags: { tourism: 'hotel', name: 'X' } }, node(3, { tourism: 'museum', name: 'M' }), node(4, { tourism: 'hotel', name: 'Hotel Ok' })];
    const { records, rejected } = normalizeElements(els, { scope, collectedAt: NOW.toISOString(), now });
    expect(records.map((r) => r.name)).toEqual(['Hotel Ok']);
    expect(rejected).toHaveLength(3);
    expect(rejected.map((r) => r.reason).join()).toMatch(/nome ausente/);
  });
  it('coordenada inválida é rejeitada', () => {
    const { records, rejected } = normalizeElements([node(1, { tourism: 'hotel', name: 'H' }, { lat: 120 })], { scope, collectedAt: NOW.toISOString(), now });
    expect(records).toEqual([]);
    expect(rejected).toHaveLength(1);
  });
});

describe('OpenStreetMap: rede (cache, recuo, endpoint)', () => {
  const instant = { limiter: { run: (fn) => fn() }, sleep: async () => {} };
  const ok = (elements) => ({ ok: true, status: 200, json: async () => ({ elements }) });
  it('usa o endpoint configurado, manda a consulta e guarda em cache', async () => {
    const calls = [];
    const adapter = createOsmAdapter({ ...instant, endpoint: 'https://overpass.exemplo/api', contact: 'contato@exemplo.com', now, fetchImpl: async (url, opts) => { calls.push({ url, opts }); return ok([node(1, { tourism: 'hotel', name: 'H' })]); } });
    const a = await adapter.fetch({ kind: 'uf', uf: 'SC' });
    const b = await adapter.fetch({ kind: 'uf', uf: 'SC' });
    expect(calls).toHaveLength(1);
    expect(a.fromCache).toBe(false);
    expect(b.fromCache).toBe(true);
    expect(calls[0].url).toBe('https://overpass.exemplo/api');
    expect(decodeURIComponent(calls[0].opts.body)).toContain('BR-SC');
    expect(calls[0].opts.headers['user-agent']).toContain('contato@exemplo.com');
  });
  it('429 com Retry-After e 504 são repetidos; erro definitivo sobe', async () => {
    let n = 0;
    const waits = [];
    const adapter = createOsmAdapter({ limiter: { run: (fn) => fn() }, sleep: async (ms) => waits.push(ms), now, retries: 3,
      fetchImpl: async () => { n += 1; if (n === 1) return { ok: false, status: 429, headers: { get: () => '3' } }; if (n === 2) return { ok: false, status: 504 }; return ok([]); } });
    const r = await adapter.fetch({ kind: 'uf', uf: 'PR' });
    expect(r.elements).toEqual([]);
    expect(waits[0]).toBe(3000);
    expect(n).toBe(3);
    const bad = createOsmAdapter({ ...instant, now, fetchImpl: async () => ({ ok: false, status: 400 }) });
    await expect(bad.fetch({ kind: 'uf', uf: 'RS' })).rejects.toThrow('HTTP 400');
  });
  it('resposta com "runtime error" e sem elementos é tratada como falha temporária; formato inesperado também', async () => {
    let n = 0;
    const adapter = createOsmAdapter({ ...instant, now, retries: 1, fetchImpl: async () => { n += 1; return { ok: true, json: async () => ({ elements: [], remark: 'runtime error: Query timed out' }) }; } });
    await expect(adapter.fetch({ kind: 'uf', uf: 'SC' })).rejects.toThrow('HTTP 504');
    expect(n).toBe(2);
    const odd = createOsmAdapter({ ...instant, now, retries: 0, fetchImpl: async () => ({ ok: true, json: async () => ({ nada: 1 }) }) });
    await expect(odd.fetch({ kind: 'uf', uf: 'SC' })).rejects.toThrow();
  });
});

describe('Cadastur', () => {
  const csv = [
    'CNPJ;Nome Fantasia;Atividade;Município;UF;Endereço;Telefone;Site;Situação',
    '111;Hotel Mar;Hotel;Florianópolis;SC;Rua A 1;4833334444;https://hotelmar.example;Ativo',
    '222;Pousada Sol;Pousada;Bombinhas;SC;;;;Ativo',
    '333;Albergue Lua;Albergue;Curitiba;PR;;;;Ativo',
    '444;Resort Z;Resort;Natal;RN;;;;Ativo',
    '555;;Hotel;Natal;RN;;;;Ativo',
  ].join('\n').replaceAll(';', ',');
  it('mapeia colunas conhecidas e categorias; categoria sem equivalente é rejeitada com motivo', () => {
    expect(mapCategory('Meios de Hospedagem - Pousada')).toBe('pousada');
    expect(mapCategory('Albergue')).toBe('hostel');
    expect(mapCategory('Resort')).toBeNull();
    const cols = mapColumns(['CNPJ', 'Nome Fantasia', 'Atividade', 'Município', 'UF']);
    expect(cols).toMatchObject({ id: 'CNPJ', name: 'Nome Fantasia', category: 'Atividade', city: 'Município', state: 'UF' });
    const { records, rejected, errors } = normalizeCadasturCsv(csv, { referenceDate: '2026-10-01', collectedAt: NOW.toISOString() });
    expect(errors).toEqual([]);
    expect(records.map((r) => [r.name, r.type, r.state])).toEqual([['Hotel Mar', 'hotel', 'SC'], ['Pousada Sol', 'pousada', 'SC'], ['Albergue Lua', 'hostel', 'PR']]);
    expect(records[0]).toMatchObject({ id: 'cadastur:111', latitude: null, longitude: null, website: 'https://hotelmar.example', last_verified_at: '2026-10-01T00:00:00.000Z', status: 'unverified' });
    expect(records[0].extra.situacao_cadastral).toBe('Ativo');
    expect(rejected.map((r) => r.reason).join('|')).toMatch(/categoria sem equivalente: Resort/);
    expect(rejected).toHaveLength(2);
  });
  it('detecta ponto e vírgula, vírgula e tab, e respeita aspas com delimitador dentro', () => {
    expect(parseDelimited('a;b\n1;"x;y"')).toEqual([['a', 'b'], ['1', 'x;y']]);
    expect(parseDelimited('a,b\r\n1,"x,y"\r\n')).toEqual([['a', 'b'], ['1', 'x,y']]);
    expect(parseDelimited('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
    const semi = normalizeCadasturCsv('CNPJ;Nome;Tipo;Cidade;UF\n9;Hostel Z;Hostel;Natal;RN', {});
    expect(semi.records).toHaveLength(1);
  });
  it('formato desconhecido PARA e mostra as colunas encontradas (não adivinha)', () => {
    const r = normalizeCadasturCsv('a,b,c\n1,2,3');
    expect(r.records).toEqual([]);
    expect(r.errors[0]).toMatch(/formato não reconhecido.*a \| b \| c/);
    expect(normalizeCadasturCsv('').errors[0]).toMatch(/vazio/);
  });
  it('sem URL https nem arquivo, a fonte não está configurada e falha com mensagem clara', async () => {
    const a = createCadasturAdapter({});
    expect(a.isConfigured()).toBe(false);
    await expect(a.fetch()).rejects.toThrow(/CADASTUR_CSV_URL/);
    await expect(createCadasturAdapter({ csvUrl: 'http://inseguro' }).fetch()).rejects.toThrow(/https/);
  });
});

describe('sincronização, histórico e saúde', () => {
  const rec = (over = {}) => createEstablishment(base(over), { now }).value;
  it('insere, atualiza só o que mudou com histórico, e atualiza a data do que não mudou', async () => {
    const store = createMemoryStore();
    const a = rec();
    const b = rec({ source_id: 'node/2', name: 'Hostel B' });
    expect(await upsertRecords(store, [a, b])).toEqual({ inserted: 2, updated: 0, unchanged: 0 });
    const a2 = createEstablishment(base({ phone: '4899999999', last_synced_at: '2026-12-01T00:00:00Z' }), { now }).value;
    const b2 = createEstablishment(base({ source_id: 'node/2', name: 'Hostel B', last_synced_at: '2026-12-01T00:00:00Z' }), { now }).value;
    expect(await upsertRecords(store, [a2, b2])).toEqual({ inserted: 0, updated: 1, unchanged: 1 });
    expect(store.history).toHaveLength(1);
    expect(store.history[0].changes).toEqual({ phone: [null, '4899999999'] });
    expect(store.rows.get('osm:node/2').last_synced_at).toBe('2026-12-01T00:00:00.000Z');
    expect(diffRecords(a, a2)).toEqual({ phone: [null, '4899999999'] });
  });
  it('mesmo id repetido no lote vale uma vez só', async () => {
    const store = createMemoryStore();
    expect(await upsertRecords(store, [rec(), rec({ name: 'Renomeado' })])).toMatchObject({ inserted: 1 });
    expect(store.rows.get('osm:node/1').name).toBe('Renomeado');
  });
  it('execução completa: contagens, escopo que falha não derruba os outros, falha registrada sem segredo', async () => {
    const store = createMemoryStore();
    const adapter = createOsmAdapter({ limiter: { run: (fn) => fn() }, sleep: async () => {}, now, retries: 0,
      fetchImpl: async (_u, opts) => {
        const q = decodeURIComponent(opts.body);
        if (q.includes('BR-PR')) throw Object.assign(new Error('falha com chave eyJhbGciOiJIUzI1NiJ9.abcdefghijk.zzz'), { status: 400 });
        return { ok: true, json: async () => ({ elements: [node(10, { tourism: 'hotel', name: 'Hotel SC' }), node(11, { tourism: 'hotel' })] }) };
      } });
    const { run, state } = await runSync({ adapter, scopes: [{ kind: 'uf', uf: 'SC' }, { kind: 'uf', uf: 'PR' }], store, now });
    expect(run).toMatchObject({ ok: false, fetched: 2, imported: 1, rejected: 1 });
    expect(run.errors).toHaveLength(1);
    expect(JSON.stringify(run.errors)).not.toContain('eyJhbGci');
    expect(store.runs).toHaveLength(1);
    expect(state.health).toBe('failing'); // nunca houve execução 100% bem-sucedida
    expect(store.rows.get('osm:node/10').state).toBe('SC');
  });
  it('saúde: nunca rodou, saudável, degradada e falhando', () => {
    const h = (s) => computeHealth(s, { now, frequencyHours: 24 });
    const ago = (hours) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
    expect(h(null)).toBe('never_run');
    expect(h({ last_run_at: ago(1), last_success_at: ago(1), last_run_ok: true })).toBe('healthy');
    expect(h({ last_run_at: ago(1), last_success_at: ago(80), last_run_ok: true })).toBe('degraded');
    expect(h({ last_run_at: ago(1), last_success_at: ago(5), last_run_ok: false })).toBe('degraded');
    expect(h({ last_run_at: ago(1), last_success_at: ago(100), last_run_ok: false })).toBe('failing');
    expect(h({ last_run_at: ago(1), last_success_at: null, last_run_ok: false })).toBe('failing');
  });
  it('uma execução bem-sucedida depois de falhar volta a ficar saudável', async () => {
    const store = createMemoryStore();
    const adapter = createOsmAdapter({ limiter: { run: (fn) => fn() }, sleep: async () => {}, now, retries: 0, fetchImpl: async () => ({ ok: true, json: async () => ({ elements: [node(1, { tourism: 'hostel', name: 'H' })] }) }) });
    const { state } = await runSync({ adapter, scopes: [{ kind: 'uf', uf: 'SC' }], store, now });
    expect(state).toMatchObject({ health: 'healthy', last_run_ok: true });
    expect(store.state.get('osm').last_success_at).toBe(NOW.toISOString());
  });
  it('sincroniza o Cadastur (arquivo) pelo mesmo runner', async () => {
    const store = createMemoryStore();
    const csv = 'CNPJ,Nome Fantasia,Atividade,Município,UF\n1,Hotel Z,Hotel,Natal,RN';
    const adapter = createCadasturAdapter({ readText: async () => csv, referenceDate: '2026-10-01', now });
    const { run } = await runSync({ adapter, scopes: [{ kind: 'arquivo' }], store, now });
    expect(run).toMatchObject({ ok: true, imported: 1, fetched: 1 });
    expect(store.rows.get('cadastur:1').license).toMatch(/confirmar/);
  });
  it('formato Cadastur desconhecido vira falha registrada, sem importar nada', async () => {
    const store = createMemoryStore();
    const adapter = createCadasturAdapter({ readText: async () => 'x,y\n1,2', now });
    const { run } = await runSync({ adapter, scopes: [{ kind: 'arquivo' }], store, now });
    expect(run.ok).toBe(false);
    expect(run.errors[0].message).toMatch(/formato não reconhecido/);
    expect(store.rows.size).toBe(0);
  });
});

describe('Supabase (mock): autenticação e escrita', () => {
  it('exige URL e chave; chave nova vai só em apikey; chave JWT também em Authorization', async () => {
    expect(() => createSupabaseStore({ url: 'https://s.example', key: '' })).toThrow(/obrigatórios/);
    const seen = [];
    const fetchImpl = async (u, o) => { seen.push({ u, o }); return { ok: true, status: 204, json: async () => null }; };
    await createSupabaseStore({ url: 'https://s.example/', key: 'sb_secret_abc', fetchImpl }).recordRun({ source: 'osm' });
    expect(seen[0].o.headers).toMatchObject({ apikey: 'sb_secret_abc' });
    expect(seen[0].o.headers.authorization).toBeUndefined();
    await createSupabaseStore({ url: 'https://s.example', key: 'eyJhbGciOi.x.y', fetchImpl }).recordRun({ source: 'osm' });
    expect(seen[1].o.headers.authorization).toBe('Bearer eyJhbGciOi.x.y');
    expect(seen[1].u).toBe('https://s.example/rest/v1/source_sync_runs');
  });
  it('upsert usa a chave de conflito (source, source_id), em lotes; falha de rede não vaza a chave', async () => {
    const calls = [];
    const fetchImpl = async (u, o) => { calls.push({ u, body: JSON.parse(o.body), prefer: o.headers.prefer }); return { ok: true, status: 201, json: async () => null }; };
    const store = createSupabaseStore({ url: 'https://s.example', key: 'sb_secret_abc', fetchImpl });
    const many = Array.from({ length: 1001 }, (_, i) => createEstablishment(base({ source_id: `node/${i}` }), { now }).value);
    await store.upsertEstablishments(many);
    expect(calls).toHaveLength(3);
    expect(calls[0].u).toContain('on_conflict=source,source_id');
    expect(calls[0].prefer).toContain('merge-duplicates');
    const failing = createSupabaseStore({ url: 'https://s.example', key: 'eyJhbGciOiJIUzI1NiJ9.abcdefghij.xyz', fetchImpl: async () => ({ ok: false, status: 401 }) });
    await expect(failing.recordRun({})).rejects.toThrow(/401/);
    expect(sanitizeError(new Error('falha eyJhbGciOiJIUzI1NiJ9.abcdefghij.xyz e sb_secret_ZZZ'))).not.toMatch(/eyJhbGci|sb_secret_ZZZ/);
  });
  it('consulta existentes em blocos de 100 ids, com os ids entre aspas', async () => {
    const urls = [];
    const store = createSupabaseStore({ url: 'https://s.example', key: 'k', fetchImpl: async (u) => { urls.push(decodeURIComponent(u)); return { ok: true, status: 200, json: async () => [{ source_id: 'node/1', content_hash: 'h' }] }; } });
    const got = await store.getExisting('osm', Array.from({ length: 150 }, (_, i) => `node/${i}`));
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('source_id=in.("node/0"');
    expect(got.get('node/1').content_hash).toBe('h');
  });
});

describe('correspondência entre fontes (sem apagar origem)', () => {
  const mk = (source, name, lat, lon, city = 'Natal', state = 'RN') => createEstablishment(base({ source, source_id: `${source}-${name}`, name, latitude: lat, longitude: lon, city, state }), { now }).value;
  it('nomes parecidos, fontes diferentes e perto → candidato com razões; nada é mesclado', () => {
    const left = [mk('osm', 'Hotel Mar Azul', -5.79, -35.2)];
    const right = [mk('cadastur', 'Mar Azul Hotel', -5.7901, -35.2001)];
    const c = findLinkCandidates(left, right);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ status: 'candidate', a_id: left[0].id, b_id: right[0].id });
    expect(c[0].reasons.join()).toMatch(/nome parecido/);
    expect(left[0].source).toBe('osm');
    expect(right[0].source).toBe('cadastur');
  });
  it('mesma fonte, UF diferente, nome diferente ou longe e sem município igual → sem vínculo', () => {
    expect(findLinkCandidates([mk('osm', 'Hotel Sol', 0, 0)], [mk('osm', 'Hotel Sol', 0, 0)])).toEqual([]);
    expect(findLinkCandidates([mk('osm', 'Hotel Sol', -5, -35)], [mk('cadastur', 'Hotel Sol', -5, -35, 'Natal', 'PB')])).toEqual([]);
    expect(findLinkCandidates([mk('osm', 'Hotel Sol', -5, -35)], [mk('cadastur', 'Pousada Lua', -5, -35)])).toEqual([]);
    expect(findLinkCandidates([mk('osm', 'Hotel Sol', -5, -35, 'Natal')], [mk('cadastur', 'Hotel Sol', -9, -40, 'Recife', 'RN')])).toEqual([]);
  });
  it('nomes só com palavras genéricas não geram similaridade', () => {
    expect(nameSimilarity('Hotel', 'Hotel')).toBe(0);
    expect(nameSimilarity('Pousada do Sol', 'Sol Pousada')).toBe(1);
  });
});
