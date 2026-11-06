// Cliente da pesquisa de hospedagens: chama /api/stays (servidor). Nunca lança; se o servidor não existir
// (ex.: `npm run dev` sem o server.mjs), devolve { offline: true } e a tela usa a busca direta já existente.
export async function fetchStays(params, { fetchImpl = (...a) => fetch(...a), signal } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  try {
    const res = await fetchImpl(`/api/stays?${qs}`, { signal, headers: { accept: 'application/json' } });
    if (!/json/i.test(res.headers?.get?.('content-type') ?? '')) return { status: 'unavailable', offline: true, message: 'O servidor de pesquisa não está disponível neste ambiente.' };
    const body = await res.json();
    if (res.status === 429) return { status: 'unavailable', message: 'Muitas consultas seguidas. Espere um minuto e tente de novo.' };
    if (res.status >= 500) return { status: 'unavailable', offline: true, message: 'A pesquisa de hospedagens falhou agora. Tente de novo em instantes.' };
    return body;
  } catch (err) {
    if (err?.name === 'AbortError') return { status: 'aborted' };
    return { status: 'unavailable', offline: true, message: 'Sem conexão com o servidor de pesquisa.' };
  }
}
