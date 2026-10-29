import { describe, expect, it } from 'vitest';
import { extractJson, verifyRoteiro } from '../verify.js';
import { createToolbox } from '../tools.js';
import { createRoteiroHandler } from '../../../../netlify/functions/roteiro.mjs';

const src = (entries) => new Map(Object.entries(entries));

describe('verificação do roteiro', () => {
  it('aceita valor que bate com a fonte e descarta valor inventado', () => {
    const r = verifyRoteiro(
      { itens: [
        { categoria: 'Transporte', descricao: 'Voo', fonte_id: 'voo-1', valor_brl: 1728 },
        { categoria: 'Comida', descricao: 'Comida', fonte_id: null, valor_brl: 300 },
        { categoria: 'Hospedagem', descricao: 'Camping', fonte_id: 'camping-2', valor_brl: 20 },
      ] },
      src({ 'voo-1': { priceBRL: 1728, url: 'https://a.example', name: 'Aviasales' }, 'camping-2': { priceBRL: 0, url: 'https://osm.example', name: 'OSM' } }),
      3000,
    );
    expect(r.items[0]).toMatchObject({ amount: 1728, verified: true, url: 'https://a.example' });
    expect(r.items[1].amount).toBeNull();
    expect(r.items[1].note).toMatch(/descartado/);
    expect(r.items[2].amount).toBeNull(); // 20 não bate com 0
    expect(r.knownTotal).toBe(1728);
    expect(r.fits).toBe('indefinido'); // faltam valores
  });
  it('gratuito confirmado pela fonte vale zero; categoria inválida vira Extras; total já acima do orçamento é "nao"', () => {
    const r = verifyRoteiro(
      { itens: [{ categoria: 'X', descricao: 'Camping', fonte_id: 'camping-1', valor_brl: null }, { categoria: 'Transporte', descricao: 'Voo', fonte_id: 'voo-1', valor_brl: 4500 }] },
      src({ 'camping-1': { priceBRL: 0 }, 'voo-1': { priceBRL: 4500 } }),
      4000,
    );
    expect(r.items[0]).toMatchObject({ amount: 0, verified: true, category: 'Extras' });
    expect(r.fits).toBe('nao');
  });
  it('só diz que cabe quando tudo está confirmado', () => {
    const r = verifyRoteiro({ itens: [{ categoria: 'Transporte', descricao: 'Voo', fonte_id: 'voo-1', valor_brl: 1000 }], faltando: [] }, src({ 'voo-1': { priceBRL: 1000 } }), 2000);
    expect(r.fits).toBe('sim');
  });
  it('JSON ausente ou inválido', () => {
    expect(extractJson('sem json')).toBeNull();
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(verifyRoteiro(null, new Map()).items).toEqual([]);
  });
  it('link não https é descartado', () => {
    const r = verifyRoteiro({ itens: [{ categoria: 'Extras', descricao: 'x', fonte_id: 'a', valor_brl: null }] }, src({ a: { priceBRL: null, url: 'javascript:x' } }));
    expect(r.items[0].url).toBeNull();
  });
});

describe('ferramentas', () => {
  it('voos: registra fontes com total para todos os passageiros', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ data: [{ price: 1000, airline: 'AV', departure_at: '2026-11-27T10:00:00Z', transfers: 1, link: '/search/GRU2711BOG1' }] }) });
    const tb = createToolbox({ env: { TRAVELPAYOUTS_TOKEN: 't', TRAVELPAYOUTS_MARKER: '1' }, fetchImpl });
    const out = await tb.run('search_flights', { origin: 'GRU', destination: 'BOG', adults: 2 });
    expect(out.results[0].total_brl).toBe(2000);
    expect(tb.sources.get(out.results[0].id).priceBRL).toBe(2000);
    expect(tb.sources.get(out.results[0].id).url).toMatch(/^https:\/\/www\.aviasales\.com\/search\/GRU2711BOG2/);
  });
  it('sem token, entrada inválida e ferramenta desconhecida viram erro, sem inventar', async () => {
    const tb = createToolbox({ env: {}, fetchImpl: async () => ({ ok: false, status: 500 }) });
    expect((await tb.run('search_flights', { origin: 'GRU', destination: 'BOG' })).error).toMatch(/não configurada/);
    expect((await tb.run('search_flights', { origin: 'X', destination: 'BOG' })).error).toMatch(/IATA/);
    expect((await tb.run('nope', {})).error).toMatch(/desconhecida/);
  });
  it('trabalho em troca sem Supabase não devolve nada', async () => {
    const tb = createToolbox({ env: {}, fetchImpl: async () => ({ ok: true }) });
    expect((await tb.run('list_work_exchange', { place: 'Rio' })).results).toEqual([]);
  });
});

describe('endpoint /api/roteiro', () => {
  const baseEnv = { ANTHROPIC_API_KEY: 'k', SUPABASE_URL: 'https://s.example', SUPABASE_ANON_KEY: 'a', TRAVELPAYOUTS_TOKEN: 't', TRAVELPAYOUTS_MARKER: '1' };
  const authFetch = (extra) => async (url, opts) => {
    if (String(url).includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u1' }) };
    return extra(url, opts);
  };
  const req = (body, token = 'tok') => new Request('http://x/api/roteiro', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const scripted = (responses) => {
    const calls = [];
    return { calls, messages: { create: async (p) => { calls.push(p); return responses.shift(); } } };
  };

  it('503 sem chave da IA e 401 sem login', async () => {
    expect((await createRoteiroHandler({ env: {} })(req({ destination: 'BOG' }))).status).toBe(503);
    const h = createRoteiroHandler({ env: baseEnv, fetchImpl: async () => ({ ok: false }) });
    expect((await h(req({ destination: 'BOG' }))).status).toBe(401);
  });
  it('fluxo completo: a IA chama a ferramenta e o valor inventado é descartado', async () => {
    const client = scripted([
      { stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'tool_use', id: 'tu1', name: 'search_flights', input: { origin: 'GRU', destination: 'BOG' } }] },
      { stop_reason: 'end_turn', usage: { input_tokens: 20, output_tokens: 30 }, content: [{ type: 'text', text: JSON.stringify({ resumo: 'ok', itens: [
        { categoria: 'Transporte', descricao: 'Voo', fonte_id: 'voo-1', valor_brl: 1000 },
        { categoria: 'Hospedagem', descricao: 'Hostel', fonte_id: null, valor_brl: 80 },
      ], faltando: ['comida'], avisos: [] }) }] },
    ]);
    const h = createRoteiroHandler({
      env: baseEnv,
      fetchImpl: authFetch(async () => ({ ok: true, json: async () => ({ data: [{ price: 1000, airline: 'AV', transfers: 1, link: '/search/GRU2711BOG1' }] }) })),
      makeClient: () => client,
    });
    const res = await h(req({ destination: 'Bogotá', origin: 'GRU', budget: 5000 }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.roteiro.items[0]).toMatchObject({ amount: 1000, verified: true });
    expect(body.roteiro.items[1].amount).toBeNull();
    expect(body.roteiro.fits).toBe('indefinido');
    expect(body.usage).toEqual({ input: 30, output: 35 });
    expect(client.calls[0].model).toBe('claude-opus-5-5');
    expect(client.calls[0].tool_choice).toBeUndefined();
    expect(client.calls[1].messages.at(-1).content[0].type).toBe('tool_result');
  });
  it('limite diário, entrada inválida, recusa e falha da IA', async () => {
    const mk = (client, env = {}, date = '2030-01-01') => createRoteiroHandler({ env: { ...baseEnv, ...env }, fetchImpl: authFetch(async () => ({ ok: true, json: async () => ({}) })), makeClient: () => client, now: () => new Date(date) });
    expect((await mk(scripted([]))(req({ destination: '' }))).status).toBe(400);
    expect((await mk(scripted([{ stop_reason: 'refusal', content: [] }]))(req({ destination: 'BOG' }))).status).toBe(422);
    expect((await mk({ messages: { create: async () => { throw new Error('boom'); } } })(req({ destination: 'BOG' }))).status).toBe(502);
    const h = mk(scripted([{ stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }] }, { stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }] }]), { ROTEIRO_DAILY_LIMIT: '1' }, '2031-01-01');
    expect((await h(req({ destination: 'BOG' }))).status).toBe(200);
    expect((await h(req({ destination: 'BOG' }))).status).toBe(429);
  });
});
