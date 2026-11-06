import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { findMarkers, MARKERS } from '../../../../scripts/check-bundle.mjs';

const root = process.cwd();
const walk = (dir, skipTests = true) => readdirSync(dir).flatMap((f) => {
  const full = join(dir, f);
  if (statSync(full).isDirectory()) return skipTests && f === '__tests__' ? [] : walk(full, skipTests);
  return /\.(jsx?|mjs|css|html|json)$/.test(f) ? [full] : [];
});
const prodFiles = [...walk(join(root, 'src')), join(root, 'server.mjs'), ...walk(join(root, 'netlify'))];

describe('P6: fixtures, snapshots e relatório de validação não entram no pacote de produção', () => {
  it('nenhum arquivo de produção importa fixtures ou snapshots (única exceção: o carregamento só de desenvolvimento)', () => {
    const offenders = prodFiles
      .filter((f) => /fixtures\/|five-scenarios|real-nominatim-snapshots|stays\/__tests__/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(root, f));
    expect(offenders).toEqual(['src/data/knowledge/index.js']);
    const index = readFileSync(join(root, 'src/data/knowledge/index.js'), 'utf8');
    expect(index).toMatch(/import\.meta\.env\.DEV && import\.meta\.env\.VITE_USE_FIXTURES === '1'/); // código morto na build de produção
  });

  it('nenhum marcador de teste ou de validação aparece em arquivo de produção (fonte do pacote)', () => {
    const hits = [];
    for (const f of prodFiles) {
      const text = readFileSync(f, 'utf8');
      for (const [marker] of MARKERS) if (text.includes(marker)) hits.push(`${relative(root, f)}: ${marker}`);
    }
    expect(hits).toEqual([]);
  });

  it('os números reais do teste no Windows não estão fixos em código (só na documentação)', () => {
    const NUMBERS = /\b(2[.]?282|1[.]?311)\b/;
    const hits = prodFiles.filter((f) => NUMBERS.test(readFileSync(f, 'utf8'))).map((f) => relative(root, f));
    expect(hits).toEqual([]);
    const doc = readFileSync(join(root, 'docs/stay-finder-validacao-real.md'), 'utf8');
    expect(doc).toMatch(/2\.282 elementos/); // o registro existe, mas apenas na documentação
  });

  it('o verificador reprova um pacote com marcador e aprova um limpo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bundle-'));
    try {
      mkdirSync(join(dir, 'assets'));
      writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("app limpo")');
      expect(findMarkers(dir)).toEqual([]);
      writeFileSync(join(dir, 'assets', 'vazou.js'), 'const x = "Hostel Exemplo Alfama";');
      writeFileSync(join(dir, 'index.html'), '<p>Araquari, Santa Catarina</p>');
      const hits = findMarkers(dir);
      expect(hits.map((h) => h.marker).sort()).toEqual(['Araquari, Santa Catarina', 'Hostel Exemplo Alfama']);
      expect(hits.find((h) => h.marker === 'Hostel Exemplo Alfama').file).toBe(join('assets', 'vazou.js'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('cada marcador existe de fato em algum arquivo de teste ou de documentação (a lista não é decorativa)', () => {
    const sources = [...walk(join(root, 'src'), false).filter((f) => f.includes('__tests__')), join(root, 'docs/stay-finder-validacao-real.md')];
    const all = sources.map((f) => readFileSync(f, 'utf8')).join('\n');
    const missing = MARKERS.map(([m]) => m).filter((m) => !all.includes(m));
    expect(missing).toEqual([]);
  });

  it('se houver build (dist), ela está limpa', () => {
    const dist = join(root, 'dist');
    if (!existsSync(dist)) return;
    expect(findMarkers(dist)).toEqual([]);
  });
});
