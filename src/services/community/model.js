// Modelo das comunidades (grupos por tema ou destino). Regras puras, testáveis sem o Supabase.

export const COMMUNITY_KINDS = ['tema', 'destino'];

/** Linha do banco -> comunidade da interface. `counts`: Map id -> membros; `joinedIds`: Set de ids. */
export function normalizeCommunity(row, counts = new Map(), joinedIds = new Set()) {
  return {
    id: row.id,
    slug: String(row.slug ?? ''),
    name: String(row.name ?? '').trim(),
    description: row.description ? String(row.description).trim() : null,
    kind: COMMUNITY_KINDS.includes(row.kind) ? row.kind : 'tema',
    members: counts.has(row.id) ? Number(counts.get(row.id)) : 0,
    joined: joinedIds.has(row.id),
  };
}

export function normalizeCommunities(rows, counts, joinedIds) {
  return (Array.isArray(rows) ? rows : [])
    .map((r) => normalizeCommunity(r, counts, joinedIds))
    .filter((c) => c.id && c.name)
    .sort((a, b) => b.members - a.members || a.name.localeCompare(b.name, 'pt-BR'));
}

/** Resultado de `rpc('community_member_counts')` -> Map. */
export function countsToMap(rows) {
  return new Map((Array.isArray(rows) ? rows : []).map((r) => [r.community_id, Number(r.members) || 0]));
}

/**
 * Quem pode publicar: precisa estar logado e, numa comunidade, ser membro dela.
 * Retorna { allowed, reason } para a interface explicar o bloqueio.
 */
export function canPost(session, community) {
  if (!session) return { allowed: false, reason: 'login' };
  if (community && !community.joined) return { allowed: false, reason: 'join' };
  return { allowed: true, reason: null };
}

export const POST_BLOCK_MESSAGE = {
  login: 'Entre na sua conta para publicar.',
  join: 'Entre na comunidade para publicar nela.',
};

export function memberLabel(n) {
  return n === 1 ? '1 membro' : `${n} membros`;
}
