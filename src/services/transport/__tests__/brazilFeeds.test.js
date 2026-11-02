import { describe, expect, it } from 'vitest';
import { createGtfsProvider } from '../gtfsProvider.js';
import { BRAZIL_FEEDS, loadBrazilFeed } from '../brazilFeeds.js';
import handler from '../../../../netlify/functions/gtfs.mjs';
import { makeZip } from './helpers.js';

const resp = (status, body, headers = {}) => new Response(body, { status, headers });

describe('loadBrazilFeed', () => {
  it('lista Rio, SPTrans e ANTT', () => {
    expect(BRAZIL_FEEDS.map((f) => f.id)).toEqual(['rio', 'sptrans', 'antt']);
  });

  it('importa o ZIP e mantém uso comercial como não verificado', async () => {
    const provider = createGtfsProvider();
    const r = await loadBrazilFeed('rio', provider, { fetchImpl: async () => resp(200, makeZip()) });
    expect(r.ok).toBe(true);
    expect(provider.isConfigured()).toBe(true);
    expect(r.report.dataset.meta.commercialUse).toBe('unverified');
  });

  it('503 vira "não configurado" e não importa nada', async () => {
    const provider = createGtfsProvider();
    const r = await loadBrazilFeed('sptrans', provider, { fetchImpl: async () => resp(503, '{}') });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/não configurada/);
    expect(provider.isConfigured()).toBe(false);
  });

  it('ZIP inválido e rede fora do ar não lançam', async () => {
    const provider = createGtfsProvider();
    expect((await loadBrazilFeed('antt', provider, { fetchImpl: async () => resp(200, 'oi') })).ok).toBe(false);
    expect((await loadBrazilFeed('antt', provider, { fetchImpl: async () => { throw new Error('x'); } })).ok).toBe(false);
    expect((await loadBrazilFeed('nope', provider)).ok).toBe(false);
  });
});

describe('função /api/gtfs', () => {
  const req = (q) => new Request(`http://x/api/gtfs${q}`);
  it('rejeita feed desconhecido e feed sem URL configurada', async () => {
    expect((await handler(req('?feed=outro'), { env: {} })).status).toBe(400);
    expect((await handler(req('?feed=rio'), { env: {} })).status).toBe(503);
  });
  it('só aceita https e devolve o ZIP', async () => {
    expect((await handler(req('?feed=rio'), { env: { GTFS_RIO_URL: 'http://a/b.zip' } })).status).toBe(503);
    const ok = await handler(req('?feed=rio'), { env: { GTFS_RIO_URL: 'https://a/b.zip' }, fetchImpl: async () => resp(200, makeZip()) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('application/zip');
  });
  it('recusa resposta que não é ZIP e erro da fonte', async () => {
    const env = { GTFS_ANTT_URL: 'https://a/b.zip' };
    expect((await handler(req('?feed=antt'), { env, fetchImpl: async () => resp(200, '<html>') })).status).toBe(502);
    expect((await handler(req('?feed=antt'), { env, fetchImpl: async () => resp(404, '') })).status).toBe(502);
  });
});
