#!/usr/bin/env node
// Verifica o PACOTE DE PRODUÇÃO (pasta dist, depois de `npm run build`): falha se contiver fixtures, snapshots de validação,
// dados de teste ou os números do relatório de validação real. Uso: node scripts/check-bundle.mjs [pasta]   (padrão: dist)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Marcadores que NUNCA devem aparecer no pacote. Cada um vem de um arquivo que só existe em testes ou em validação.
export const MARKERS = Object.freeze([
  // fixtures inventadas dos cenários e do Stay Finder (src/**/__tests__/fixtures)
  ['fixture-5-cenarios', 'fixture dos 5 cenários'],
  ['FIXTURE de desenvolvimento', 'fixture dos 5 cenários'],
  ['Hostel Exemplo Alfama', 'fixture do Stay Finder'],
  ['Albergue Ejemplo Palermo', 'fixture do Stay Finder'],
  ['Pousada Fictícia do Centro', 'fixture do Stay Finder'],
  ['Hostal Ejemplo Bellavista', 'fixture do Stay Finder'],
  ['渋谷ゲストハウス', 'fixture do Stay Finder'],
  ['Serra Teste', 'fixtures de teste do motor de viagens'],
  // snapshots de respostas reais usadas só em testes (Nominatim, 06/11/2026)
  ['Araquari, Santa Catarina', 'snapshot real do Nominatim'],
  ['Paris, Lamar County', 'snapshot real do Nominatim'],
  ['Santiago de los Caballeros', 'snapshot real do Nominatim'],
  ['Buenos Aires, Comuna 1', 'snapshot real do Nominatim'],
  // números do relatório de validação real (Overpass no Windows do dono): só podem existir na documentação
  ['2.282 elementos', 'frase do relatório de validação real'],
  ['Overpass no Windows', 'frase do relatório de validação real'],
]);

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const full = join(dir, f);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Procura os marcadores nos arquivos de texto da pasta. Devolve [{ file, marker, why }]. */
export function findMarkers(dir, markers = MARKERS) {
  const hits = [];
  for (const file of walk(dir)) {
    if (!/\.(js|mjs|css|html|json|map|svg|txt|webmanifest)$/i.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const [marker, why] of markers) if (text.includes(marker)) hits.push({ file: relative(dir, file), marker, why });
  }
  return hits;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? 'dist');
  let hits;
  try {
    hits = findMarkers(dir);
  } catch (e) {
    console.error(`Não consegui ler ${dir}: ${e.message}. Rode "npm run build" antes.`);
    process.exit(2);
  }
  if (hits.length) {
    console.error(`PACOTE REPROVADO: ${hits.length} marcador(es) de teste ou validação em ${dir}:`);
    for (const h of hits) console.error(`  - ${h.file}: "${h.marker}" (${h.why})`);
    process.exit(1);
  }
  console.log(`Pacote aprovado: nenhum marcador de fixture, snapshot ou relatório de validação em ${dir} (${MARKERS.length} marcadores verificados).`);
}
