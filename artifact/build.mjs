// Gera artifact/pobre-mochileiro.html: o build do Vite inlinado em um único arquivo.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const dir = new URL('../dist/assets/', import.meta.url);
const read = (ext) => readFileSync(new URL(readdirSync(dir).find((f) => f.endsWith(ext)), dir), 'utf8');
const css = read('.css');
const js = read('.js').replace(/<\/script/gi, '<\\/script');

writeFileSync(
  new URL('./pobre-mochileiro.html', import.meta.url),
  `<title>Pobre Mochileiro</title>
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`,
);
