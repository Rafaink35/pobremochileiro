// Perfil mochileiro: regras puras (validação e formatação), sem depender do Supabase.

export const USERNAME_RULE = /^[a-z0-9_]{3,20}$/;
export const RESERVED_USERNAMES = ['admin', 'administrador', 'moderador', 'moderacao', 'suporte', 'equipe', 'oficial', 'pobremochileiro', 'pobre_mochileiro'];
export const TRAVEL_STYLES = ['Camping', 'Hostel', 'Work exchange', 'Voo barato', 'Ônibus', 'Trilhas', 'Praia', 'Cidade', 'Cultura'];
export const MAX_STYLES = 5;
export const AVATAR_COLORS = { green: '#0b3d2e', yellow: '#f4c542', coral: '#e8785d', cream: '#e7dcc3', sage: '#9bb59b' };

/** Nome de usuário: minúsculas, números e _, de 3 a 20 caracteres; não pode ser só números ou reservado. */
export function validateUsername(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!USERNAME_RULE.test(value)) return { value, error: 'Use de 3 a 20 caracteres: letras minúsculas, números e _ (sem espaços ou acentos).' };
  if (/^[0-9_]+$/.test(value)) return { value, error: 'O nome precisa ter pelo menos uma letra.' };
  if (RESERVED_USERNAMES.includes(value)) return { value, error: 'Esse nome é reservado. Escolha outro.' };
  return { value, error: null };
}

/** Sugestão de nome de usuário que NÃO usa o e-mail. */
export function suggestUsername(random = Math.random) {
  return `mochileiro_${String(Math.floor(random() * 9000) + 1000)}`;
}

export function initials(profile) {
  const base = (profile?.displayName || profile?.username || '').trim();
  const words = base.split(/[\s_]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase() || '?';
}

export function normalizeProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name ?? '',
    bio: row.bio ?? '',
    homeCity: row.home_city ?? '',
    travelStyles: Array.isArray(row.travel_styles) ? row.travel_styles : [],
    avatarColor: AVATAR_COLORS[row.avatar_color] ? row.avatar_color : 'green',
    isPublic: row.is_public !== false,
  };
}

/** Problemas do formulário (lista vazia = ok). */
export function validateProfileForm(f, { creating = true } = {}) {
  const problems = [];
  if (creating) {
    const u = validateUsername(f.username);
    if (u.error) problems.push(u.error);
  }
  if ((f.displayName ?? '').length > 40) problems.push('O nome de exibição pode ter até 40 caracteres.');
  if ((f.bio ?? '').length > 160) problems.push('A bio pode ter até 160 caracteres.');
  if ((f.homeCity ?? '').length > 60) problems.push('A cidade pode ter até 60 caracteres.');
  if ((f.travelStyles ?? []).length > MAX_STYLES) problems.push(`Escolha no máximo ${MAX_STYLES} estilos de viagem.`);
  if ((f.travelStyles ?? []).some((s) => !TRAVEL_STYLES.includes(s))) problems.push('Estilo de viagem inválido.');
  if (!AVATAR_COLORS[f.avatarColor ?? 'green']) problems.push('Cor inválida.');
  return problems;
}

const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function profilePayload(f, { creating = true } = {}) {
  return {
    ...(creating && { username: validateUsername(f.username).value }),
    display_name: clean(f.displayName),
    bio: clean(f.bio),
    home_city: clean(f.homeCity),
    travel_styles: f.travelStyles ?? [],
    avatar_color: f.avatarColor ?? 'green',
    is_public: f.isPublic !== false,
  };
}

/** Erro do banco -> mensagem em português. */
export function profileErrorMessage(err) {
  if (!err) return null;
  if (err.code === '23505') return 'Esse nome de usuário já está em uso.';
  if (err.code === '23514') return 'Algum campo não atende às regras do perfil.';
  return 'Não foi possível salvar o perfil agora.';
}
