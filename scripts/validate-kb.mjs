#!/usr/bin/env node
// Valida um arquivo de base de conhecimento ANTES de publicá-lo e mostra a cobertura (o que existe e o que falta).
// Uso: node scripts/validate-kb.mjs [arquivo.json] [--production]
//   sem arquivo: valida src/data/knowledge/base.json (o que vai para produção)
//   --production: falha se houver fonte fixture (dado fictício) ou erro de validação
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hasFixtureSources, knowledgeCoverage, loadKnowledgeBase } from '../src/services/trip/knowledge.js';

const args = process.argv.slice(2);
const production = args.includes('--production');
const file = resolve(args.find((a) => !a.startsWith('--')) ?? 'src/data/knowledge/base.json');

let raw;
try {
  raw = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`Não consegui ler ${file}: ${e.message}`);
  process.exit(2);
}

const { kb, errors, warnings } = loadKnowledgeBase(raw);
const cov = knowledgeCoverage(kb);
console.log(`Base: ${file}`);
console.log(`Fontes: ${cov.summary.sources} · destinos: ${cov.summary.destinations} · totalmente cobertos: ${cov.summary.fullyCovered} · com preço verificado: ${cov.summary.withVerifiedPrices}`);
for (const d of cov.destinations) console.log(`  - ${d.name}: ${d.missing.length ? `falta ${d.missing.join(', ')}` : 'cobertura completa'}${d.verifiedPrices ? '' : ' (nenhum preço verificado)'}`);
if (errors.length) console.log(`\nERROS (${errors.length}):\n${errors.map((e) => `  - ${e}`).join('\n')}`);
if (warnings.length) console.log(`\nAVISOS (${warnings.length}):\n${warnings.map((w) => `  - ${w}`).join('\n')}`);

let failed = errors.length > 0;
if (production && hasFixtureSources(kb)) {
  console.log('\nBLOQUEADO: a base contém fonte fixture (dados fictícios). Não pode ir para produção.');
  failed = true;
}
console.log(failed ? '\nResultado: REPROVADA' : '\nResultado: aprovada');
process.exit(failed ? 1 : 0);
