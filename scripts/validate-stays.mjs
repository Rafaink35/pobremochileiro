#!/usr/bin/env node
// Validação CONTROLADA do Stay Finder com as fontes REAIS (Nominatim, Overpass, Wikivoyage). Uso responsável:
// consultas em série, com os limites do próprio serviço (Nominatim: 1/s; Overpass: 1 a cada 5 s; Wikivoyage: 1/s) e uma
// única consulta Overpass por destino. Grava o resultado completo em JSON FORA do repositório.
// Uso: NODE_USE_ENV_PROXY=1 node scripts/validate-stays.mjs --out /caminho/pasta [--overpass-url URL] [--only Lisboa,Tóquio] [--pause 15] [--wait-start 0]
// Variáveis opcionais: OVERPASS_URL, OVERPASS_CONTACT (URL do projeto no User-Agent; não use dado pessoal).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDefaultStayService } from '../src/services/stays/index.js';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const out = opt('out');
if (!out) { console.error('Informe --out /pasta/fora/do/repositorio'); process.exit(2); }
mkdirSync(out, { recursive: true });

const env = { ...process.env, OVERPASS_CONTACT: process.env.OVERPASS_CONTACT || 'https://github.com/Rafaink35/pobremochileiro', ...(opt('overpass-url') && { OVERPASS_URL: opt('overpass-url') }) };
const service = createDefaultStayService(env);
const CATEGORIES = 'camping,hostel,pousada,hotel,nao_classificada';
const TARGETS = [
  { name: 'Lisboa', query: 'Lisboa' },
  { name: 'Buenos Aires', query: 'Buenos Aires' },
  { name: 'Santiago', query: 'Santiago', pick: 'CL' }, // ambíguo: escolhe o Chile após listar os candidatos
  { name: 'Paraty', query: 'Paraty' },
  { name: 'Tóquio', query: '東京', pick: 'JP' }, // área administrativa ampla: confirma a pesquisa a 15 km do ponto de referência
];
const only = opt('only')?.split(',');
const pause = Number(opt('pause') ?? 15) * 1000; // espera entre destinos (Wikimedia limita requisições em rajada)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(Number(opt('wait-start') ?? 0) * 1000);
const report = [];
for (const t of TARGETS.filter((x) => !only || only.includes(x.name))) {
  if (report.length) await sleep(pause);
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  let res = await service.search({ query: t.query, categories: CATEGORIES });
  const first = { status: res.status, candidates: res.candidates?.map((c) => ({ id: c.id, name: c.name, label: c.label, countryCode: c.countryCode, kind: c.kind, lat: c.lat, lon: c.lon })) };
  if ((res.status === 'ambiguous' || res.status === 'broad') && t.pick) {
    const c = res.candidates.find((x) => x.countryCode === t.pick);
    if (c) res = await service.search({ lat: c.lat, lon: c.lon, name: c.name, nameEn: c.nameEn, label: c.label, countryCode: c.countryCode, regionCode: c.regionCode, radiusM: c.radiusM, categories: CATEGORIES });
  }
  const entry = { target: t.name, query: t.query, startedAt, finishedAt: new Date().toISOString(), ms: Date.now() - t0, first, result: res };
  report.push(entry);
  writeFileSync(join(out, `${t.name.normalize('NFD').replace(/\p{M}/gu, '').replace(/\W+/g, '_')}.json`), JSON.stringify(entry, null, 2));
  console.log(`${t.name}: ${res.status} · destino=${res.destination?.label ?? '-'} · fontes: ${(res.sources ?? []).map((s) => `${s.id}=${s.status}${s.error ? `(${s.error})` : ''}:${s.count}`).join(' ')}`);
}
writeFileSync(join(out, 'relatorio.json'), JSON.stringify(report, null, 2));
