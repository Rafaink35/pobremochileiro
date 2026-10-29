import { describe, expect, it } from 'vitest';
import { createChatHandler } from '../../../../netlify/functions/chat.mjs';
import { extractReaisAmounts, extractUserNumbers, findUnverifiedAmounts, parseBrNumber } from '../amounts.js';
import { applyChatEvent, emptyAssistantState, readNdjson } from '../ndjson.js';

const env = { ANTHROPIC_API_KEY: 'k', SUPABASE_URL: 'https://s.example', SUPABASE_ANON_KEY: 'a', TRAVELPAYOUTS_TOKEN: 't', TRAVELPAYOUTS_MARKER: '1' };
const userFetch = (id, extra = async () => ({ ok: false, status: 404 })) => async (url, opts) =>
  String(url).includes('/auth/v1/user') ? { ok: true, json: async () => ({ id }) } : extra(url, opts);
const req = (body, token = 'tok') =>
  new Request('http://x/api/chat', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });

// Cliente simulado: cada chamada de stream() consome um roteiro { deltas, message }.
const fakeClient = (turns) => {
  const calls = [];
  return {
    calls,
    messages: {
      stream: (params) => {
        calls.push(params);
        const turn = turns.shift();
        const cbs = [];
        return { on: (ev, cb) => ev === 'text' && cbs.push(cb), finalMessage: async () => { if (turn.error) throw new Error(turn.error); for (const d of turn.deltas ?? []) cbs.forEach((cb) => cb(d)); return turn.message; } };
      },
    },
  };
};
const endTurn = (text) => ({ deltas: [text.slice(0, 5), text.slice(5)], message: { stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text }] } });
const events = async (res) => { const out = []; for await (const e of readNdjson(res.body)) out.push(e); return out; };

describe('valores em reais no texto', () => {
  it('lê números no formato brasileiro e "mil"', () => {
    expect(parseBrNumber('1.728,50')).toBe(1728.5);
    expect(parseBrNumber('3000')).toBe(3000);
    expect(extractReaisAmounts('Custa R$ 1.728,50 ou R$ 3 mil, não R$30.')).toEqual([1728.5, 3000, 30]);
    expect(extractUserNumbers('tenho 3 mil e 15 dias')).toEqual([3000, 15]);
  });
  it('acusa só o que não tem fonte', () => {
    expect(findUnverifiedAmounts('R$ 100 e R$ 999', new Set([100]))).toEqual([999]);
  });
});

describe('leitor NDJSON e estado', () => {
  it('junta linhas cortadas entre pedaços e ignora lixo', async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream({ start(c) { c.enqueue(enc.encode('{"type":"te')); c.enqueue(enc.encode('xt","delta":"a"}\nlixo\n{"type":"done"}')); c.close(); } });
    const out = []; for await (const e of readNdjson(body)) out.push(e);
    expect(out).toEqual([{ type: 'text', delta: 'a' }, { type: 'done' }]);
  });
  it('aplica eventos ao estado', () => {
    let s = emptyAssistantState();
    s = applyChatEvent(s, { type: 'tool', name: 'search_flights' });
    expect(s.status).toMatch(/voos/);
    s = applyChatEvent(s, { type: 'text', delta: 'Oi' });
    s = applyChatEvent(s, { type: 'warning', message: 'w' });
    s = applyChatEvent(s, { type: 'done' });
    expect(s).toMatchObject({ text: 'Oi', status: '', warning: 'w', done: true });
  });
});

describe('/api/chat', () => {
  it('503 sem chave, 401 sem login, 400 sem mensagem', async () => {
    expect((await createChatHandler({ env: {} })(req({ messages: [] }))).status).toBe(503);
    expect((await createChatHandler({ env, fetchImpl: async () => ({ ok: false }) })(req({ messages: [{ role: 'user', content: 'oi' }] }))).status).toBe(401);
    expect((await createChatHandler({ env, fetchImpl: userFetch('c1') })(req({ messages: [{ role: 'assistant', content: 'oi' }] }))).status).toBe(400);
  });

  it('transmite o texto aos poucos e termina com done', async () => {
    const client = fakeClient([endTurn('Olá, mochileiro!')]);
    const res = await createChatHandler({ env, fetchImpl: userFetch('c2'), makeClient: () => client })(req({ messages: [{ role: 'user', content: 'oi' }] }));
    expect(res.headers.get('content-type')).toMatch(/x-ndjson/);
    const ev = await events(res);
    expect(ev.filter((e) => e.type === 'text').map((e) => e.delta).join('')).toBe('Olá, mochileiro!');
    expect(ev.filter((e) => e.type === 'text').length).toBe(2);
    expect(ev.at(-1)).toMatchObject({ type: 'done', usage: { input: 10, output: 5 }, model: 'claude-opus-5-5' });
    expect(client.calls[0].tool_choice).toBeUndefined();
  });

  it('chama ferramentas, propõe itens verificados e não deixa valor inventado sem aviso', async () => {
    const flights = async () => ({ ok: true, json: async () => ({ data: [{ price: 1000, airline: 'AV', transfers: 1, link: '/search/GRU2711BOG1' }] }) });
    const client = fakeClient([
      { message: { stop_reason: 'tool_use', usage: {}, content: [{ type: 'tool_use', id: 't1', name: 'search_flights', input: { origin: 'GRU', destination: 'BOG' } }] } },
      { message: { stop_reason: 'tool_use', usage: {}, content: [{ type: 'tool_use', id: 't2', name: 'propose_plan_items', input: { itens: [
        { categoria: 'Transporte', descricao: 'Voo', fonte_id: 'voo-1', valor_brl: 1000 },
        { categoria: 'Hospedagem', descricao: 'Hostel', fonte_id: null, valor_brl: 80 },
      ] } }] } },
      endTurn('O voo sai por R$ 1.000,00 e o hostel por R$ 80,00.'),
    ]);
    const res = await createChatHandler({ env, fetchImpl: userFetch('c3', flights), makeClient: () => client })(req({ messages: [{ role: 'user', content: 'voo para Bogotá' }] }));
    const ev = await events(res);
    expect(ev.filter((e) => e.type === 'tool').map((e) => e.name)).toEqual(['search_flights', 'propose_plan_items']);
    const proposal = ev.find((e) => e.type === 'proposal');
    expect(proposal.items[0]).toMatchObject({ amount: 1000, verified: true });
    expect(proposal.items[1].amount).toBeNull();
    expect(ev.find((e) => e.type === 'warning').amounts).toEqual([80]); // R$ 80 não tem fonte
    expect(client.calls[2].messages.at(-1).content[0].type).toBe('tool_result');
  });

  it('valores informados pelo usuário e totais do servidor não geram aviso', async () => {
    const client = fakeClient([endTurn('Com R$ 3.000,00 de orçamento, dá para tentar.')]);
    const res = await createChatHandler({ env, fetchImpl: userFetch('c4'), makeClient: () => client })(req({ messages: [{ role: 'user', content: 'tenho 3000 reais' }] }));
    expect((await events(res)).some((e) => e.type === 'warning')).toBe(false);
  });

  it('lê o plano do usuário pela ferramenta get_plan', async () => {
    const client = fakeClient([
      { message: { stop_reason: 'tool_use', usage: {}, content: [{ type: 'tool_use', id: 't1', name: 'get_plan', input: {} }] } },
      endTurn('Seu total parcial é R$ 100,00.'),
    ]);
    const res = await createChatHandler({ env, fetchImpl: userFetch('c5'), makeClient: () => client })(
      req({ messages: [{ role: 'user', content: 'quanto já gastei?' }], plan: { budget: '2000', items: [{ category: 'Comida', label: 'Mercado', amount: '100' }] } }),
    );
    const ev = await events(res);
    expect(ev.some((e) => e.type === 'warning')).toBe(false);
    const result = JSON.parse(client.calls[1].messages.at(-1).content[0].content);
    expect(result).toMatchObject({ known_total_brl: 100, complete: false });
    expect(result.missing_categories).toEqual(['Transporte', 'Hospedagem']);
  });

  it('refusal, falha da IA e limite diário', async () => {
    const mk = (client, e = {}, id = 'c6') => createChatHandler({ env: { ...env, ...e }, fetchImpl: userFetch(id), makeClient: () => client });
    const body = { messages: [{ role: 'user', content: 'oi' }] };
    expect((await events(await mk(fakeClient([{ message: { stop_reason: 'refusal', usage: {}, content: [] } }]))(req(body)))).find((e) => e.type === 'error').message).toMatch(/recusou/);
    expect((await events(await mk(fakeClient([{ error: 'boom' }]), {}, 'c7')(req(body)))).find((e) => e.type === 'error').message).toMatch(/indisponível/);
    const h = mk(fakeClient([endTurn('um'), endTurn('dois')]), { CHAT_DAILY_LIMIT: '1' }, 'c8');
    expect((await h(req(body))).status).toBe(200);
    expect((await h(req(body))).status).toBe(429);
  });

  it('descarta histórico inválido: começa na pergunta do usuário', async () => {
    const client = fakeClient([endTurn('ok')]);
    await events(await createChatHandler({ env, fetchImpl: userFetch('c9'), makeClient: () => client })(
      req({ messages: [{ role: 'assistant', content: 'antigo' }, { role: 'user', content: 'oi' }, { role: 'system', content: 'x' }] }),
    ));
    expect(client.calls[0].messages).toEqual([{ role: 'user', content: 'oi' }]);
  });
});
