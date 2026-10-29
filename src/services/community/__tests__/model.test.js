import { describe, expect, it } from 'vitest';
import { canPost, countsToMap, memberLabel, normalizeCommunities, normalizeCommunity } from '../model.js';

const row = (o = {}) => ({ id: 'c1', slug: 'camping', name: ' Camping e natureza ', description: 'Dicas', kind: 'tema', ...o });

describe('comunidades', () => {
  it('normaliza com contagem e participação', () => {
    const c = normalizeCommunity(row(), new Map([['c1', 12]]), new Set(['c1']));
    expect(c).toMatchObject({ name: 'Camping e natureza', members: 12, joined: true, kind: 'tema' });
  });
  it('sem contagem fica 0 e sem participação fica false; tipo inválido vira tema', () => {
    const c = normalizeCommunity(row({ kind: 'x', description: '' }));
    expect(c).toMatchObject({ members: 0, joined: false, kind: 'tema', description: null });
  });
  it('ordena por membros e depois por nome, e descarta linhas sem id ou nome', () => {
    const list = normalizeCommunities(
      [row({ id: 'a', name: 'Beta' }), row({ id: 'b', name: 'Alfa' }), row({ id: 'c', name: 'Gama' }), row({ id: '', name: 'Sem id' }), row({ id: 'd', name: '  ' })],
      new Map([['c', 5]]),
      new Set(),
    );
    expect(list.map((c) => c.name)).toEqual(['Gama', 'Alfa', 'Beta']);
  });
  it('entrada inválida não quebra', () => {
    expect(normalizeCommunities(null)).toEqual([]);
    expect(countsToMap(undefined).size).toBe(0);
    expect(countsToMap([{ community_id: 'a', members: '3' }]).get('a')).toBe(3);
  });
  it('publicar exige login e, numa comunidade, ser membro', () => {
    const session = { user: { id: 'u' } };
    expect(canPost(null, null)).toEqual({ allowed: false, reason: 'login' });
    expect(canPost(session, { joined: false })).toEqual({ allowed: false, reason: 'join' });
    expect(canPost(session, { joined: true }).allowed).toBe(true);
    expect(canPost(session, null).allowed).toBe(true); // sem comunidade selecionada
  });
  it('rótulo de membros', () => {
    expect(memberLabel(1)).toBe('1 membro');
    expect(memberLabel(0)).toBe('0 membros');
  });
});
