import { describe, expect, it } from 'vitest';
import { consumeAuthHash, parseAuthHash } from '../authLink.js';

describe('login pelo link do e-mail', () => {
  it('lê os tokens do hash', () => {
    expect(parseAuthHash('#access_token=a1&refresh_token=r1&expires_in=3600&type=magiclink')).toEqual({ type: 'session', accessToken: 'a1', refreshToken: 'r1' });
  });
  it('rotas normais e hash vazio não são login', () => {
    expect(parseAuthHash('#comunidade')).toBeNull();
    expect(parseAuthHash('#detalhe-2')).toBeNull();
    expect(parseAuthHash('')).toBeNull();
    expect(parseAuthHash('#access_token=a1')).toBeNull(); // sem refresh_token
  });
  it('link expirado vira mensagem clara', () => {
    expect(parseAuthHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid')).toEqual({ type: 'error', message: 'O link expirou ou já foi usado. Peça um novo.' });
  });
  it('cria a sessão, limpa o hash e avisa', async () => {
    const calls = [];
    const supabase = { auth: { setSession: async (t) => { calls.push(t); return { error: null }; } } };
    const msgs = [];
    let hash = '';
    const handled = await consumeAuthHash(supabase, '#access_token=a1&refresh_token=r1', { notify: (m) => msgs.push(m), replaceHash: (h) => { hash = h; } });
    expect(handled).toBe(true);
    expect(calls).toEqual([{ access_token: 'a1', refresh_token: 'r1' }]);
    expect(hash).toBe('comunidade');
    expect(msgs).toEqual(['Você entrou.']);
  });
  it('falha ao criar a sessão avisa sem quebrar', async () => {
    const supabase = { auth: { setSession: async () => ({ error: new Error('x') }) } };
    const msgs = [];
    await consumeAuthHash(supabase, '#access_token=a&refresh_token=b', { notify: (m) => msgs.push(m), replaceHash: () => {} });
    expect(msgs[0]).toMatch(/Peça um novo/);
  });
  it('hash que não é login não faz nada', async () => {
    expect(await consumeAuthHash({ auth: {} }, '#planejador', { replaceHash: () => { throw new Error('não deveria mexer'); } })).toBe(false);
  });
});
