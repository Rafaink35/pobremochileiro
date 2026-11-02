import { describe, expect, it } from 'vitest';
import { createChatHandler, pickProvider } from '../../../../netlify/functions/chat.mjs';
import { toGeminiSchema, toGeminiTools } from '../gemini.js';
import { CHAT_TOOL_DEFINITIONS, TOOL_DEFINITIONS } from '../../roteiro/tools.js';

describe('escolha do provedor', () => {
  it('Gemini primeiro quando só ele tem chave; AI_PROVIDER força a escolha', () => {
    expect(pickProvider({})).toBeNull();
    expect(pickProvider({ GEMINI_API_KEY: 'g' })).toBe('gemini');
    expect(pickProvider({ ANTHROPIC_API_KEY: 'a' })).toBe('anthropic');
    expect(pickProvider({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' })).toBe('gemini');
    expect(pickProvider({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', AI_PROVIDER: 'anthropic' })).toBe('anthropic');
    expect(pickProvider({ GEMINI_API_KEY: 'g', AI_PROVIDER: 'anthropic' })).toBeNull();
  });
});

describe('esquema das ferramentas para o Gemini', () => {
  it('converte tipos, aceita nulo e remove campos não suportados', () => {
    const s = toGeminiSchema({ type: 'object', additionalProperties: false, properties: { a: { type: ['string', 'null'] }, b: { type: 'array', items: { type: 'integer', minimum: 1 } } } });
    expect(s).toEqual({ type: 'OBJECT', properties: { a: { type: 'STRING', nullable: true }, b: { type: 'ARRAY', items: { type: 'INTEGER', minimum: 1 } } } });
  });
  it('todas as ferramentas viram declarações válidas (get_plan sem parâmetros)', () => {
    const decl = toGeminiTools([...TOOL_DEFINITIONS, ...CHAT_TOOL_DEFINITIONS])[0].functionDeclarations;
    expect(decl.length).toBe(TOOL_DEFINITIONS.length + CHAT_TOOL_DEFINITIONS.length);
    expect(decl.find((d) => d.name === 'get_plan').parameters).toBeUndefined();
    expect(JSON.stringify(decl)).not.toMatch(/"type":"(object|string|array|integer|number|boolean|null)"/);
    expect(JSON.stringify(decl)).not.toContain('additionalProperties');
  });
});

describe('chat com Gemini', () => {
  const env = { GEMINI_API_KEY: 'g-key', SUPABASE_URL: 'https://s.example', SUPABASE_ANON_KEY: 'a', CHAT_DAILY_LIMIT: '50' };
  const req = (body) => new Request('http://x/api/chat', { method: 'POST', headers: { authorization: 'Bearer tok', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const events = async (res) => (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
  const script = (replies, seen) => async (url, opts) => {
    if (String(url).includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: `u-${Math.random()}` }) };
    if (String(url).includes('generativelanguage.googleapis.com')) {
      seen.push({ url: String(url), headers: opts.headers, body: JSON.parse(opts.body) });
      const r = replies.shift();
      return r.status ? { ok: false, status: r.status } : { ok: true, json: async () => r };
    }
    return { ok: false, status: 500 };
  };

  it('responde texto, manda a chave só no cabeçalho e não expõe segredo', async () => {
    const seen = [];
    const fetchImpl = script([{ candidates: [{ content: { parts: [{ text: 'Olá!' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3 } }], seen);
    const res = await createChatHandler({ env, fetchImpl })(req({ messages: [{ role: 'user', content: 'oi' }] }));
    const ev = await events(res);
    expect(ev.find((e) => e.type === 'text').delta).toBe('Olá!');
    expect(ev.at(-1)).toMatchObject({ type: 'done', usage: { input: 10, output: 3 }, model: 'gemini-flash-latest' });
    expect(seen[0].headers['x-goog-api-key']).toBe('g-key');
    expect(seen[0].url).not.toContain('g-key');
    expect(JSON.stringify(ev)).not.toContain('g-key');
  });

  it('chama ferramenta, devolve o resultado e termina com texto', async () => {
    const seen = [];
    const call = { functionCall: { name: 'search_lodging', args: { place: 'Rio', category: 'hostel' } } };
    const fetchImpl = script(
      [
        { candidates: [{ content: { role: 'model', parts: [call] }, finishReason: 'STOP' }] },
        { candidates: [{ content: { parts: [{ text: 'Achei um hostel, sem preço informado.' }] }, finishReason: 'STOP' }] },
      ],
      seen,
    );
    const wrapped = async (url, opts) => {
      if (String(url).includes('overpass')) return { ok: true, json: async () => ({ elements: [{ type: 'node', id: 1, lat: -22.9, lon: -43.2, tags: { tourism: 'hostel', name: 'Hostel Rio' } }] }) };
      return fetchImpl(url, opts);
    };
    const ev = await events(await createChatHandler({ env, fetchImpl: wrapped })(req({ messages: [{ role: 'user', content: 'hostel no Rio' }] })));
    expect(ev.map((e) => e.type)).toEqual(expect.arrayContaining(['tool', 'text', 'done']));
    expect(ev.find((e) => e.type === 'tool').name).toBe('search_lodging');
    const second = seen[1].body.contents.at(-1);
    expect(second.parts[0].functionResponse.name).toBe('search_lodging');
    expect(second.parts[0].functionResponse.response.result.results[0]).toMatchObject({ name: 'Hostel Rio', price_brl: null });
  });

  it('valor citado sem fonte gera aviso', async () => {
    const seen = [];
    const fetchImpl = script([{ candidates: [{ content: { parts: [{ text: 'Custa R$ 777,00.' }] }, finishReason: 'STOP' }] }], seen);
    const ev = await events(await createChatHandler({ env, fetchImpl })(req({ messages: [{ role: 'user', content: 'quanto custa?' }] })));
    expect(ev.some((e) => e.type === 'warning')).toBe(true);
  });

  it('limite do Gemini (429) vira mensagem clara', async () => {
    const ev = await events(await createChatHandler({ env, fetchImpl: script([{ status: 429 }], []) })(req({ messages: [{ role: 'user', content: 'oi' }] })));
    expect(ev.find((e) => e.type === 'error').message).toMatch(/limite do Gemini/);
  });
});
