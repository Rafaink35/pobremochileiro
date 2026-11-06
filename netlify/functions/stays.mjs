// Pesquisa de hospedagens (Stay Finder). GET /api/stays?q=Lisboa&category=hostel[,camping...]
//   ou, depois de escolher entre candidatos: ?lat=..&lon=..&name=..&label=..&cc=PT&rc=PT-11&r=5000&category=...
// Roda no servidor para centralizar o limite de taxa e o cache das fontes públicas (Overpass, Nominatim, Wikivoyage).
// Não usa banco nem chaves. Sem dado inventado: sem resultado, a resposta diz isso.
import { createDefaultStayService } from '../../src/services/stays/index.js';

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

let shared; // serviço e caches em memória (vivem enquanto o processo viver)
const hits = new Map(); // limite por IP: 20 consultas por minuto
const WINDOW_MS = 60_000;
const LIMIT = 20;

function rateLimited(request, now) {
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'anon';
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) { hits.set(ip, recent); return true; }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.delete(hits.keys().next().value);
  return false;
}

export default async function handler(request, { env = process.env, service, now = () => Date.now() } = {}) {
  if (request.method !== 'GET') return json(405, { error: 'use GET' });
  if (rateLimited(request, now())) return json(429, { error: 'muitas consultas: espere um minuto' }, { 'retry-after': '60' });
  const p = new URL(request.url).searchParams;
  const q = p.get('q');
  if ((q ?? '').length > 120) return json(400, { error: 'consulta longa demais' });
  if (!q && !(p.get('lat') && p.get('lon'))) return json(400, { error: 'informe q (destino) ou lat e lon' });
  const svc = service ?? (shared ??= createDefaultStayService(env));
  try {
    const result = await svc.search({
      query: q, lat: p.get('lat'), lon: p.get('lon'), name: p.get('name'), nameEn: p.get('nameEn'), label: p.get('label'), countryCode: p.get('cc'), regionCode: p.get('rc'),
      radiusM: p.get('r'), categories: p.get('category'),
    });
    const status = result.status === 'invalid' ? 400 : 200;
    return json(status, result, status === 200 && result.groups ? { 'cache-control': 'public, max-age=300' } : {});
  } catch {
    return json(500, { error: 'erro interno na pesquisa de hospedagens' }); // sem detalhes internos
  }
}
