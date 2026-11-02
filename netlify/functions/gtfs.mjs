// Proxy de feeds GTFS brasileiros (Rio, SPTrans, ANTT). As URLs vêm de variáveis de ambiente do servidor:
// nada é baixado de endereços escolhidos pelo cliente, e sem variável o feed responde 503 (não há dado de exemplo).
// Limite: o Netlify limita respostas de função a ~6 MB; feeds grandes (Rio, SPTrans) devem ser servidos pelo
// server.mjs (Render) ou por uma URL própria em VITE_GTFS_*_URL. Ver docs/data-sources.md.
export const FEEDS = {
  rio: 'GTFS_RIO_URL',
  sptrans: 'GTFS_SPTRANS_URL',
  antt: 'GTFS_ANTT_URL',
};
const MAX_BYTES = 80 * 1024 * 1024;

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default async function handler(request, { env = process.env, fetchImpl = fetch } = {}) {
  if (request.method !== 'GET') return json(405, { error: 'use GET' });
  const feed = new URL(request.url).searchParams.get('feed') || '';
  if (!Object.hasOwn(FEEDS, feed)) return json(400, { error: 'feed inválido: use rio, sptrans ou antt' });
  const url = env[FEEDS[feed]];
  if (!url) return json(503, { error: `feed "${feed}" não configurado no servidor (${FEEDS[feed]})` });

  let upstream;
  try {
    const target = new URL(url);
    if (target.protocol !== 'https:') return json(503, { error: 'a URL do feed precisa ser https' });
    upstream = await fetchImpl(target, { redirect: 'follow', signal: AbortSignal.timeout(50_000) });
  } catch {
    return json(502, { error: 'não foi possível baixar o feed' });
  }
  if (!upstream.ok) return json(502, { error: `a fonte respondeu ${upstream.status}` });
  const declared = Number(upstream.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) return json(413, { error: 'feed grande demais' });
  const bytes = new Uint8Array(await upstream.arrayBuffer());
  if (bytes.length > MAX_BYTES) return json(413, { error: 'feed grande demais' });
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return json(502, { error: 'a fonte não devolveu um arquivo ZIP' });
  return new Response(bytes, {
    status: 200,
    headers: { 'content-type': 'application/zip', 'cache-control': 'public, max-age=21600' },
  });
}
