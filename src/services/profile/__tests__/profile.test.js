import { describe, expect, it } from 'vitest';
import { initials, normalizeProfile, profileErrorMessage, profilePayload, suggestUsername, validateProfileForm, validateUsername } from '../model.js';

describe('nome de usuário', () => {
  it('aceita minúsculas, números e _; normaliza maiúsculas e espaços', () => {
    expect(validateUsername('  Ana_Viaja ')).toEqual({ value: 'ana_viaja', error: null });
    expect(validateUsername('mochileiro_4821').error).toBeNull();
  });
  it('recusa tamanho, caracteres, só números e reservados', () => {
    for (const bad of ['ab', 'a'.repeat(21), 'ana viaja', 'ação', 'ana-viaja', 'ana@x.com', '']) expect(validateUsername(bad).error).toMatch(/3 a 20/);
    expect(validateUsername('12345').error).toMatch(/letra/);
    expect(validateUsername('___').error).toMatch(/letra/);
    expect(validateUsername('Admin').error).toMatch(/reservado/);
    expect(validateUsername('pobremochileiro').error).toMatch(/reservado/);
  });
  it('a sugestão é válida e não vem do e-mail', () => {
    for (const r of [0, 0.5, 0.9999]) expect(validateUsername(suggestUsername(() => r)).error).toBeNull();
  });
});

describe('perfil', () => {
  it('iniciais', () => {
    expect(initials({ username: 'ana_viaja' })).toBe('AV');
    expect(initials({ username: 'bia' })).toBe('BI');
    expect(initials({ username: 'x', displayName: 'Ana Souza' })).toBe('AS');
    expect(initials(null)).toBe('?');
  });
  it('normaliza a linha do banco com padrões seguros', () => {
    expect(normalizeProfile({ id: 'u', username: 'ana', avatar_color: 'roxo', is_public: null })).toMatchObject({ avatarColor: 'green', isPublic: true, travelStyles: [], bio: '' });
    expect(normalizeProfile(null)).toBeNull();
  });
  it('valida o formulário', () => {
    const ok = { username: 'ana_viaja', displayName: 'Ana', bio: '', homeCity: 'Rio', travelStyles: ['Camping'], avatarColor: 'coral' };
    expect(validateProfileForm(ok)).toEqual([]);
    expect(validateProfileForm({ ...ok, bio: 'x'.repeat(161) })[0]).toMatch(/bio/);
    expect(validateProfileForm({ ...ok, travelStyles: ['Camping', 'Hostel', 'Praia', 'Cidade', 'Cultura', 'Trilhas'] })[0]).toMatch(/no máximo 5/);
    expect(validateProfileForm({ ...ok, travelStyles: ['Voar'] })[0]).toMatch(/inválido/);
    expect(validateProfileForm({ ...ok, avatarColor: 'roxo' })[0]).toMatch(/Cor/);
    expect(validateProfileForm({ ...ok, username: 'a' }, { creating: false })).toEqual([]); // ao editar, o nome não é revalidado
  });
  it('payload: vazio vira null, nome só ao criar', () => {
    const f = { username: 'Ana_V', displayName: ' ', bio: 'oi', homeCity: '', travelStyles: [], avatarColor: 'sage', isPublic: false };
    expect(profilePayload(f)).toEqual({ username: 'ana_v', display_name: null, bio: 'oi', home_city: null, travel_styles: [], avatar_color: 'sage', is_public: false });
    expect('username' in profilePayload(f, { creating: false })).toBe(false);
  });
  it('mensagens de erro do banco', () => {
    expect(profileErrorMessage({ code: '23505' })).toMatch(/já está em uso/);
    expect(profileErrorMessage({ code: 'x' })).toMatch(/Não foi possível/);
    expect(profileErrorMessage(null)).toBeNull();
  });
});
