// Validação do login (Supabase) e limite diário por usuário, compartilhados pelas funções de IA.
export async function verifyUser(request, env, fetchImpl) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  const res = await fetchImpl(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ?? null;
}

/** Limite por usuário/dia guardado em memória da instância: freio simples, não substitui o limite de gasto no Console. */
export function createDailyLimiter() {
  const usage = new Map();
  return {
    /** Registra um uso; retorna false quando o limite do dia já foi atingido. */
    take(userId, day, limit) {
      const used = usage.get(userId);
      const count = used?.day === day ? used.count : 0;
      if (count >= limit) return false;
      usage.set(userId, { day, count: count + 1 });
      return true;
    },
  };
}
