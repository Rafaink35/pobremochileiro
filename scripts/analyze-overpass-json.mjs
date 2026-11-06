#!/usr/bin/env node
// Análise LOCAL de respostas do Overpass (arquivos JSON no seu computador). Roda a normalização, a deduplicação, a classificação de
// preço, o ranking e a seleção de exibição REAIS do Stay Finder (as mesmas funções da pesquisa) sobre os arquivos, sem rede.
//   - NÃO acessa a rede: fetch e conexões de rede são bloqueados na partida (não há opção para liberar).
//   - NÃO transmite nem copia os arquivos; lê e imprime só contagens (e, se pedido com --examples, poucos nomes no terminal).
//   - Os JSON reais NÃO vão para o Git: veja .gitignore (use pastas como PobreMochileiro-Validacao/ ou validacao-local/).
// Uso: node scripts/analyze-overpass-json.mjs <arquivo.json | pasta> [...] [--center lat,lon] [--limit 100] [--examples 5] [--json]
import net from 'node:net';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toStayRecord } from '../src/services/stays/sources/osm.js';
import { assembleResults } from '../src/services/stays/search.js';
import { normText } from '../src/services/stays/unicode.js';
import { parseLatLon } from '../src/services/geo.js';

/** Bloqueia fetch e conexões de rede. Devolve a função que desfaz o bloqueio (usada só em testes). */
export function blockNetwork() {
  const originalFetch = globalThis.fetch;
  const originalConnect = net.Socket.prototype.connect;
  const blocked = () => { throw new Error('Rede bloqueada: esta ferramenta analisa só arquivos locais e nunca acessa a rede.'); };
  globalThis.fetch = async () => blocked();
  net.Socket.prototype.connect = function connectBlocked() { return blocked(); };
  return () => { globalThis.fetch = originalFetch; net.Socket.prototype.connect = originalConnect; };
}

const tag = (e, ...keys) => { for (const k of keys) { const v = e.tags?.[k]; if (typeof v === 'string' && v.trim()) return v.trim(); } return null; };
const coordsOf = (e) => { const lat = e.lat ?? e.center?.lat; const lon = e.lon ?? e.center?.lon; return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null; };
const count = (items, keyFn) => { const m = {}; for (const i of items) { const k = keyFn(i); if (k != null) m[k] = (m[k] ?? 0) + 1; } return m; };

/** Analisa os elementos de UMA resposta do Overpass. Devolve contagens (nada de nomes). */
export function analyzeElements(elements, { center = null, limit = 100, now = new Date(), categories = ['camping', 'hostel', 'pousada', 'hotel'] } = {}) {
  const t0 = performance.now();
  const els = Array.isArray(elements) ? elements : [];
  const withCoords = els.map(coordsOf).filter(Boolean);
  const ctr = center ?? (withCoords.length ? { lat: withCoords.reduce((s, c) => s + c.lat, 0) / withCoords.length, lon: withCoords.reduce((s, c) => s + c.lon, 0) / withCoords.length } : { lat: 0, lon: 0 });

  // --- dados brutos (como o roteiro PowerShell contou) ---
  const named = els.filter((e) => tag(e, 'name'));
  const nameGroups = new Map();
  for (const e of named) { const k = normText(e.tags.name); nameGroups.set(k, [...(nameGroups.get(k) ?? []), e]); }
  const repeated = [...nameGroups.entries()].filter(([, g]) => g.length > 1);
  const priceKeys = {};
  for (const e of els) for (const k of Object.keys(e.tags ?? {})) if (/charge|price|fee|cost|rate/i.test(k)) priceKeys[k] = (priceKeys[k] ?? 0) + 1;
  const raw = {
    total: els.length, elementTypes: count(els, (e) => e.type), tourism: count(els, (e) => e.tags?.tourism), withCoordinates: withCoords.length,
    named: named.length, unnamed: els.length - named.length,
    website: els.filter((e) => tag(e, 'website', 'contact:website', 'url')).length, phone: els.filter((e) => tag(e, 'phone', 'contact:phone')).length,
    city: els.filter((e) => tag(e, 'addr:city', 'addr:municipality')).length, stars: els.filter((e) => tag(e, 'stars')).length,
    openingHours: els.filter((e) => tag(e, 'opening_hours')).length, withTimestamp: els.filter((e) => e.timestamp).length,
    repeatedNameGroups: repeated.length, repeatedNameElements: repeated.reduce((n, [, g]) => n + g.length, 0),
    chargeTag: els.filter((e) => tag(e, 'charge')).length, checkDateCharge: els.filter((e) => tag(e, 'check_date:charge')).length,
    feeTag: count(els, (e) => tag(e, 'fee')?.toLowerCase()), priceKeys,
  };

  // --- pipeline real do Stay Finder ---
  const collectedAt = now.toISOString();
  const records = [];
  let rejected = 0;
  for (const e of els) { const r = toStayRecord(e, { collectedAt }); if (r) records.push(r); else rejected += 1; }
  const out = assembleResults({ records, categories, center: ctr, limit, now });
  const priced = records.filter((r) => r.prices.length);
  const groupSizes = count(out.grouped.filter((g) => g.groupSize > 1), (g) => g.groupSize);
  // nomes repetidos: quantos foram mantidos separados (não são duplicidade confirmada) e quantos foram agrupados por sinal forte
  const idOf = new Map();
  out.grouped.forEach((g, gi) => g.memberIds.forEach((id) => idOf.set(id, gi)));
  let repeatedKeptSeparate = 0;
  let repeatedFullyMerged = 0;
  for (const [, g] of repeated) {
    const groupsHit = new Set(g.map((e) => idOf.get(`osm:${e.type}/${e.id}`)).filter((x) => x !== undefined));
    if (groupsHit.size > 1) repeatedKeptSeparate += 1; else if (groupsHit.size === 1) repeatedFullyMerged += 1;
  }
  const pipeline = {
    validRecords: records.length, rejected, categories: count(records, (r) => r.category),
    withPriceText: records.filter((r) => r.priceText).length, withParsedPrice: priced.length,
    feeTagKept: count(records, (r) => r.feeTag),
    groups: out.grouped.length, duplicatesGrouped: out.grouped.reduce((n, g) => n + g.groupSize - 1, 0), groupSizes,
    possibleDuplicates: out.grouped.filter((g) => g.possibleDuplicates.length).length,
    repeatedNames: { keptSeparate: repeatedKeptSeparate, fullyMerged: repeatedFullyMerged },
    priceClasses: count([...out.ranking.ranked, ...out.ranking.withPrice, ...out.ranking.stalePrice, ...out.ranking.noPrice], (i) => i.pricing.class),
    unnamedProcessed: out.unnamedItems.length,
  };
  const body = JSON.stringify({ groups: out.view.groups, unnamed: out.view.unnamed });
  const display = {
    limit, ...out.view.counts, responseKB: Math.round(body.length / 1024),
    ranked: out.view.groups.ranked.length,
  };
  return { raw, pipeline, display, center: ctr, ms: Math.round(performance.now() - t0), shownNames: out.view.groups };
}

function expand(paths) {
  return paths.flatMap((p) => {
    const full = resolve(p);
    return statSync(full).isDirectory() ? readdirSync(full).filter((f) => /\.json$/i.test(f)).sort().map((f) => join(full, f)) : [full];
  });
}

/**
 * Lê o texto de um arquivo JSON sem alterá-lo. Um BOM UTF-8 no início (3 bytes EF BB BF, comum em arquivos gravados pelo Windows
 * PowerShell 5.1 com `Set-Content -Encoding UTF8`) é ignorado só na LEITURA e informado em `bom`; o conteúdo não é modificado.
 * UTF-16 não é suportado e é dito de forma explícita (nada é adaptado em silêncio).
 */
export function readJsonText(file) {
  const buf = readFileSync(file);
  if ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff)) throw new Error('o arquivo está em UTF-16, que esta ferramenta não lê (salve como UTF-8)');
  const bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  return { text: buf.toString('utf8', bom ? 3 : 0), bom };
}

/** Lê e analisa arquivos. Erros de leitura viram uma entrada com `error` (não interrompem os demais). */
export function analyzeFiles(paths, opts = {}) {
  return expand(paths).map((file) => {
    try {
      const { text, bom } = readJsonText(file);
      const json = JSON.parse(text);
      if (!Array.isArray(json?.elements)) return { file: basename(file), bom, error: 'sem a lista "elements" (não parece resposta do Overpass)' };
      return { file: basename(file), bom, ...analyzeElements(json.elements, opts) };
    } catch (e) {
      return { file: basename(file), error: `não consegui ler: ${e.message}` };
    }
  });
}

const fmt = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', ') || '—';

function printText(results, examples) {
  for (const r of results) {
    if (r.error) { console.log(`\n${r.file}: ${r.error}`); continue; }
    const { raw: a, pipeline: p, display: d } = r;
    if (r.bom) console.log(`\n${r.file}: BOM UTF-8 detectado (comum em arquivos do Windows PowerShell): ignorado só na leitura; o arquivo original não foi alterado.`);
    console.log(`\n${r.file} — centro usado ${r.center.lat.toFixed(4)}, ${r.center.lon.toFixed(4)} — processado em ${r.ms} ms`);
    console.log(`  BRUTO: total=${a.total} | com nome=${a.named} sem nome=${a.unnamed} | site=${a.website} telefone=${a.phone} cidade=${a.city} estrelas=${a.stars} horário=${a.openingHours} | nomes repetidos: ${a.repeatedNameGroups} grupos (${a.repeatedNameElements} elementos)`);
    console.log(`         tipos de elemento: ${fmt(a.elementTypes)} | tourism: ${fmt(a.tourism)}`);
    console.log(`         preço: charge=${a.chargeTag}, check_date:charge=${a.checkDateCharge} | fee: ${fmt(a.feeTag)} | chaves de preço: ${fmt(a.priceKeys)}`);
    console.log(`  NORMALIZAÇÃO: válidos=${p.validRecords} rejeitados=${p.rejected} | categorias: ${fmt(p.categories)} | com texto de preço=${p.withPriceText}, com preço interpretável=${p.withParsedPrice} | feeTag mantida (só observação): ${fmt(p.feeTagKept)}`);
    console.log(`  DEDUPLICAÇÃO: ${p.groups} locais após agrupar | agrupados por sinal forte=${p.duplicatesGrouped} (tamanhos: ${fmt(p.groupSizes)}) | possíveis duplicatas (só marcadas)=${p.possibleDuplicates} | nomes repetidos mantidos separados=${p.repeatedNames.keptSeparate}, totalmente agrupados=${p.repeatedNames.fullyMerged}`);
    console.log(`  PREÇO: classes: ${fmt(p.priceClasses)}`);
    console.log(`  EXIBIÇÃO (limite ${d.limit}): total com nome=${d.total}, exibidos=${d.shown}, restantes=${d.omitted}${d.hasMore ? ' (há "Mostrar mais")' : ''} | sem nome ocultados=${d.unnamedHidden} | ranking=${d.ranked} | resposta ≈ ${d.responseKB} KB`);
    if (examples > 0) {
      const shown = [...r.shownNames.ranked, ...r.shownNames.withPrice, ...r.shownNames.stalePrice, ...r.shownNames.noPrice].slice(0, examples);
      console.log(`  EXEMPLOS (primeiros ${shown.length} exibidos): ${shown.map((i) => `${i.name} [${i.category}, ${i.distanceM ?? '?'} m]`).join(' | ')}`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const restore = blockNetwork(); // nunca libera: a ferramenta só lê arquivos locais
  void restore;
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
  const flags = new Set(['--json']);
  const valueOpts = new Set(['--center', '--limit', '--examples']);
  const paths = args.filter((a, i) => !a.startsWith('--') && !valueOpts.has(args[i - 1]) && !flags.has(a));
  if (!paths.length) { console.error('Uso: node scripts/analyze-overpass-json.mjs <arquivo.json | pasta> [...] [--center lat,lon] [--limit 100] [--examples 5] [--json]'); process.exit(2); }
  const center = opt('center') ? parseLatLon(opt('center')) : null;
  if (opt('center') && !center) { console.error('--center precisa ser "lat,lon" válido.'); process.exit(2); }
  const results = analyzeFiles(paths, { center, limit: Number(opt('limit') ?? 100) || 100 });
  if (args.includes('--json')) console.log(JSON.stringify(results.map(({ shownNames, ...r }) => r), null, 2));
  else printText(results, Number(opt('examples') ?? 0));
  const total = results.filter((r) => !r.error).reduce((n, r) => n + r.raw.total, 0);
  if (!args.includes('--json')) console.log(`\nTotal analisado: ${total} elementos em ${results.filter((r) => !r.error).length} arquivo(s). Nenhum dado saiu deste computador.`);
}
