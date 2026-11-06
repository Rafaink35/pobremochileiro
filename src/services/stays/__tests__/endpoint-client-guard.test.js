import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import handler from '../../../../netlify/functions/stays.mjs';
import { API_ROUTES } from '../../../../server.mjs';
import { fetchStays } from '../../../api/stays.js';
import { flattenGroups, describePricing, toLegacyRecord } from '../legacy.js';
import { createDefaultStayService } from '../index.js';
import { moderate, SUBMISSION_STATUS, toPublic, validateEstablishmentSubmission, validateStayPriceSubmission } from '../submissions.js';
import { buildStayEntry, planSummary } from '../../planner/stays.js';
import { filterLodgings } from '../../lodging/lodgingModel.js';
import { NOW } from './fixtures/index.js';

const req = (qs, { method = 'GET', ip = '10.0.0.1' } = {}) => new Request(`http://x/api/stays?${qs}`, { method, headers: { 'x-forwarded-for': ip } });
const stub = (result = { status: 'ok', groups: { ranked: [], withPrice: [], stalePrice: [], noPrice: [] } }) => ({ calls: [], search(p) { this.calls.push(p); return Promise.resolve(result); } });

describe('endpoint /api/stays', () => {
  it('está registrado no servidor', () => expect(API_ROUTES['/api/stays']).toBe('./netlify/functions/stays.mjs'));
  it('só aceita GET e exige destino', async () => {
    expect((await handler(req('q=x', { method: 'POST', ip: '10.0.1.1' }), { service: stub() })).status).toBe(405);
    expect((await handler(req('category=hostel', { ip: '10.0.1.2' }), { service: stub() })).status).toBe(400);
    expect((await handler(req(`q=${'a'.repeat(200)}`, { ip: '10.0.1.3' }), { service: stub() })).status).toBe(400);
  });
  it('repassa os parâmetros (inclusive de candidato escolhido) e usa cache curto só quando há resultado', async () => {
    const svc = stub();
    const res = await handler(req('lat=-33.4&lon=-70.6&name=Santiago&cc=CL&r=7000&category=hostel,camping', { ip: '10.0.1.4' }), { service: svc });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(svc.calls[0]).toMatchObject({ lat: '-33.4', lon: '-70.6', name: 'Santiago', countryCode: 'CL', radiusM: '7000', categories: 'hostel,camping' });
    const amb = await handler(req('q=Santiago', { ip: '10.0.1.5' }), { service: stub({ status: 'ambiguous', candidates: [], groups: null }) });
    expect(amb.headers.get('cache-control')).toBeNull();
  });
  it('categoria inválida devolve 400; erro interno não vaza detalhes', async () => {
    expect((await handler(req('q=x', { ip: '10.0.1.6' }), { service: stub({ status: 'invalid', message: 'Categoria inválida.' }) })).status).toBe(400);
    const boom = { search: async () => { throw new Error('segredo-interno SUPABASE_SERVICE_ROLE_KEY=abc'); } };
    const res = await handler(req('q=x', { ip: '10.0.1.7' }), { service: boom });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toMatch(/segredo|SUPABASE|abc/);
  });
  it('limite por IP: 20 consultas por minuto, depois 429 com retry-after', async () => {
    let t = 1_000_000;
    const svc = stub();
    for (let i = 0; i < 20; i += 1) expect((await handler(req('q=x', { ip: '10.9.9.9' }), { service: svc, now: () => t })).status).toBe(200);
    const blocked = await handler(req('q=x', { ip: '10.9.9.9' }), { service: svc, now: () => t });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('60');
    expect((await handler(req('q=x', { ip: '10.9.9.8' }), { service: svc, now: () => t })).status).toBe(200); // outro IP
    t += 61_000;
    expect((await handler(req('q=x', { ip: '10.9.9.9' }), { service: svc, now: () => t })).status).toBe(200);
  });
});

describe('cliente e adaptação para a tela existente', () => {
  const json = (body, { status = 200, type = 'application/json' } = {}) => ({ status, headers: { get: () => type }, json: async () => body });
  it('monta a consulta, devolve o JSON e nunca lança', async () => {
    let url;
    const out = await fetchStays({ q: '東京', category: 'hostel', r: undefined }, { fetchImpl: async (u) => { url = String(u); return json({ status: 'ok' }); } });
    expect(url).toBe('/api/stays?q=%E6%9D%B1%E4%BA%AC&category=hostel');
    expect(out.status).toBe('ok');
    expect((await fetchStays({ q: 'x' }, { fetchImpl: async () => { throw new TypeError('rede'); } })).offline).toBe(true);
    expect((await fetchStays({ q: 'x' }, { fetchImpl: async () => json('<html>', { type: 'text/html' }) })).offline).toBe(true); // sem servidor (ex.: vite dev)
    expect((await fetchStays({ q: 'x' }, { fetchImpl: async () => json({}, { status: 500 }) })).offline).toBe(true);
    const limited = await fetchStays({ q: 'x' }, { fetchImpl: async () => json({}, { status: 429 }) });
    expect(limited.status).toBe('unavailable');
    expect(limited.offline).toBeUndefined();
  });
  it('registro adaptado funciona com filtros, detalhe e planejador existentes', () => {
    const item = {
      id: 'osm:node/1', provider: 'osm', name: 'Hostel X', category: 'hostel', osmKind: 'hostel', lat: 1, lon: 2, city: 'Lisboa', region: 'Lisboa', amenities: {}, fee: 'unknown', priceText: '18 EUR', prices: [],
      sources: [{ provider: 'osm', name: 'OpenStreetMap', license: 'ODbL 1.0', attribution: '© OSM', sourceUrl: 'https://osm.test/1', originalId: 'node/1', collectedAt: NOW.toISOString() }],
      pricing: { class: 'published', label: 'Publicado, não confirmado', amount: 18, currency: 'EUR', unit: { basis: 'person', period: 'night' }, free: false, observedAt: '2026-10-20T10:00:00.000Z', source: { name: 'OpenStreetMap' } },
    };
    const rec = toLegacyRecord(item, 'ranked');
    expect(rec).toMatchObject({ kind: 'hostel', fee: 'paid', price: { amount: 18, currency: 'EUR' }, section: 'ranked' });
    expect(describePricing(item.pricing)).toMatch(/18,00.*por pessoa por noite.*Publicado, não confirmado.*2026-10-20.*OpenStreetMap/);
    expect(filterLodgings([rec], { kind: 'hostel' }).records).toHaveLength(1);
    const entry = buildStayEntry(rec, 'hostel', NOW);
    expect(entry.cost.status).toBe('paid_reference');
    expect(entry.cost.text).toMatch(/Publicado, não confirmado/);
    expect(entry.source.name).toBe('OpenStreetMap (ODbL 1.0)');
    // o planejador continua tratando custo e transporte pendentes como pendências, não como zero
    const s = planSummary({ days: '2', items: [], stays: [entry] }, NOW);
    expect(s.knownTotal).toBe(0);
    expect(s.complete).toBe(false);
  });
  it('sem preço: não vira preço nem "gratuito"', () => {
    const rec = toLegacyRecord({ id: 'a', category: 'pousada', osmKind: 'guest_house', amenities: {}, fee: 'unknown', prices: [], sources: [], pricing: { class: 'unavailable' } }, 'noPrice');
    expect(rec).toMatchObject({ kind: 'guest_house', fee: 'unknown', price: null, chargeText: null });
    expect(flattenGroups({ ranked: [], withPrice: [], stalePrice: [], noPrice: [{ id: 'a', category: 'pousada', amenities: {}, sources: [], pricing: { class: 'unavailable' } }] })[0].section).toBe('noPrice');
  });
});

describe('cadastro próprio com moderação: regras', () => {
  const est = { name: 'Ecovila X', category: 'ecovila', lat: 1, lon: 2, country: 'pt', consent: true, contact: 'dono@example.test' };
  it('exige consentimento, contato, categoria e localização; contato nunca é público', () => {
    expect(validateEstablishmentSubmission(est).value).toMatchObject({ status: 'pending', country: 'PT' });
    for (const bad of [{ consent: false }, { contact: '' }, { category: 'castelo' }, { country: 'Portugal' }, { lat: null, city: '' }, { lat: 99, lon: 0 }]) {
      expect(validateEstablishmentSubmission({ ...est, ...bad }).value).toBeNull();
    }
    const pub = toPublic({ ...validateEstablishmentSubmission(est).value, moderatedBy: 'ana', moderationNote: 'interno' });
    expect(pub).not.toHaveProperty('contact');
    expect(pub).not.toHaveProperty('moderatedBy');
  });
  const price = { establishmentId: 'e1', amount: 40, currency: 'EUR', unit: { basis: 'person', period: 'night' }, observedAt: '2026-11-01T00:00:00Z', requested: 'confirmed', evidenceUrl: 'https://prova.example.test/p' };
  it('preço confirmado exige evidência; sem ela vira publicado; valida valor, moeda, unidade e data', () => {
    expect(validateStayPriceSubmission(price, NOW).value.requested).toBe('confirmed');
    expect(validateStayPriceSubmission({ ...price, evidenceUrl: null }, NOW).value.requested).toBe('published');
    for (const bad of [{ amount: 0 }, { currency: 'XXX' }, { unit: { basis: 'person', period: 'month' } }, { observedAt: null }, { observedAt: '2027-01-01T00:00:00Z' }, { establishmentId: '' }]) {
      expect(validateStayPriceSubmission({ ...price, ...bad }, NOW).value).toBeNull();
    }
  });
  it('moderação: rejeitar exige motivo; aprovar confirmado define validade de 30 dias; decisão não se repete', () => {
    const sub = validateStayPriceSubmission(price, NOW).value;
    expect(moderate(sub, { decision: 'reject', moderator: 'ana' }, NOW).value).toBeNull();
    expect(moderate(sub, { decision: 'reject', moderator: 'ana', note: 'sem prova' }, NOW).value.status).toBe(SUBMISSION_STATUS.REJECTED);
    const ok = moderate(sub, { decision: 'approve', moderator: 'ana' }, NOW).value;
    expect(ok).toMatchObject({ status: 'approved', approved: true, priceStatus: 'confirmed', validUntil: '2026-12-01T00:00:00.000Z' });
    expect(moderate(ok, { decision: 'approve', moderator: 'ana' }, NOW).value).toBeNull();
    expect(moderate(sub, { decision: 'approve' }, NOW).value).toBeNull();
  });
});

describe('produção: sem dados fictícios e sem alterar o banco', () => {
  const root = join(process.cwd(), 'src');
  const prodFiles = [];
  const walk = (dir) => { for (const f of readdirSync(dir)) { const full = join(dir, f); if (statSync(full).isDirectory()) { if (f !== '__tests__') walk(full); } else if (/\.(jsx?|mjs)$/.test(f)) prodFiles.push(full); } };
  walk(root);

  it('nenhum código de produção importa as fixtures do Stay Finder', () => {
    const offenders = prodFiles.filter((f) => /stays\/__tests__|fixtures\/index/.test(readFileSync(f, 'utf8'))).map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });
  it('o serviço padrão usa só fontes reais e nenhuma é marcada como fixture', () => {
    const svc = createDefaultStayService({}, { fetchImpl: async () => { throw new Error('rede proibida no teste'); } });
    expect(svc).toBeTruthy();
    const src = readFileSync(join(root, 'services/stays/index.js'), 'utf8');
    expect(src).not.toMatch(/fixture/i);
  });
  it('o Stay Finder não usa Supabase, chaves de serviço nem escreve em banco', () => {
    const files = prodFiles.filter((f) => f.includes(join('services', 'stays')) || f.endsWith('api/stays.js'));
    files.push(join(process.cwd(), 'netlify/functions/stays.mjs'));
    for (const f of files) {
      const text = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
      expect(text, f).not.toMatch(/supabase|SERVICE_ROLE|createSupabaseStore|process\.env\.[A-Z_]*(KEY|TOKEN|SECRET)/i);
    }
  });
});
