// Login pelo link do e-mail (magic link). O Supabase devolve os tokens no hash da URL (#access_token=...).
// O app usa o hash para as rotas, então o hash é lido aqui, os tokens viram sessão e o hash é limpo.

/** Lê o hash da URL. Retorna { type:'session', accessToken, refreshToken } | { type:'error', message } | null. */
export function parseAuthHash(hash) {
  const raw = String(hash ?? '').replace(/^#/, '');
  if (!raw.includes('=')) return null;
  const p = new URLSearchParams(raw);
  if (p.get('error') || p.get('error_code')) {
    const code = p.get('error_code');
    const message =
      code === 'otp_expired'
        ? 'O link expirou ou já foi usado. Peça um novo.'
        : (p.get('error_description') || 'Não foi possível entrar com esse link.').replaceAll('+', ' ');
    return { type: 'error', message };
  }
  const accessToken = p.get('access_token');
  const refreshToken = p.get('refresh_token');
  if (accessToken && refreshToken) return { type: 'session', accessToken, refreshToken };
  return null;
}

/** Aplica o resultado: cria a sessão e limpa o hash. `notify` mostra mensagens ao usuário. */
export async function consumeAuthHash(supabase, hash, { notify = () => {}, replaceHash = (h) => { window.location.hash = h; } } = {}) {
  const parsed = parseAuthHash(hash);
  if (!parsed) return false;
  replaceHash('comunidade'); // some com os tokens da URL
  if (parsed.type === 'error') {
    notify(parsed.message);
    return true;
  }
  const { error } = await supabase.auth.setSession({ access_token: parsed.accessToken, refresh_token: parsed.refreshToken });
  notify(error ? 'Não foi possível entrar com esse link. Peça um novo.' : 'Você entrou.');
  return true;
}
