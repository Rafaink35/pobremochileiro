#!/usr/bin/env node
// Sincronização da camada nacional. Roda FORA do app (GitHub Actions agendado ou na sua máquina).
// Uso:  node scripts/sync.mjs osm --uf SC,PR [--region Sul] [--dry-run]
//       node scripts/sync.mjs cadastur --file caminho.csv --reference-date 2026-10-01 [--dry-run]
// Variáveis: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (só para gravar), OVERPASS_URL, OVERPASS_CONTACT, CADASTUR_CSV_URL.
// Sem --dry-run e sem chave, o script recusa gravar. A chave nunca é impressa.
import { readFileSync } from 'node:fs';
import { createOsmAdapter, DEFAULT_OVERPASS_URL } from '../src/services/datalayer/sources/osm.js';
import { createCadasturAdapter } from '../src/services/datalayer/sources/cadastur.js';
import { createMemoryStore, createSupabaseStore } from '../src/services/datalayer/sync/store.js';
import { runSync } from '../src/services/datalayer/sync/runner.js';

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const source = args._[0];
const env = process.env;
const dryRun = Boolean(args['dry-run']);

if (!['osm', 'cadastur'].includes(source)) {
  console.error('Uso: node scripts/sync.mjs <osm|cadastur> [opções]. Veja o comentário no topo do arquivo.');
  process.exit(2);
}

let adapter;
let scopes;
if (source === 'osm') {
  adapter = createOsmAdapter({ endpoint: env.OVERPASS_URL || DEFAULT_OVERPASS_URL, contact: env.OVERPASS_CONTACT || null });
  scopes = [
    ...String(args.uf ?? '').split(',').filter(Boolean).map((uf) => ({ kind: 'uf', uf: uf.trim().toUpperCase() })),
    ...(args.region && args.region !== true ? [{ kind: 'region', name: args.region }] : []),
  ];
  if (!scopes.length) {
    console.error('Informe --uf SC,PR e/ou --region Sul.');
    process.exit(2);
  }
} else {
  const file = args.file && args.file !== true ? args.file : null;
  adapter = createCadasturAdapter({
    csvUrl: env.CADASTUR_CSV_URL || null,
    readText: file ? async () => readFileSync(file, 'utf8') : null,
    referenceDate: args['reference-date'] && args['reference-date'] !== true ? args['reference-date'] : null,
  });
  if (!adapter.isConfigured()) {
    console.error('Informe --file arquivo.csv ou defina CADASTUR_CSV_URL (https).');
    process.exit(2);
  }
  scopes = [{ kind: 'arquivo' }];
}

let store;
if (dryRun) store = createMemoryStore();
else {
  try {
    store = createSupabaseStore({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY });
  } catch (err) {
    console.error(`${err.message}. Use --dry-run para testar sem gravar.`);
    process.exit(2);
  }
}

const { run, state } = await runSync({ adapter, scopes, store, log: (m) => console.log(m) });
console.log(JSON.stringify({ dryRun, source, ok: run.ok, fetched: run.fetched, imported: run.imported, updated: run.updated, unchanged: run.unchanged, rejected: run.rejected, health: state.health, errors: run.errors }, null, 2));
process.exit(run.ok ? 0 : 1);
