// Servidor Node simples para hospedar o app fora da Netlify (ex.: Render): serve a pasta `dist` e roteia /api/* para as
// MESMAS funções usadas na Netlify (netlify/functions/*.mjs, que usam Request/Response padrão). Assim o código é portátil:
// dá para voltar à Netlify sem mudar nada, e este arquivo não é usado lá.
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';

const MAX_BODY_BYTES = 1_000_000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const SECURITY_HEADERS = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' };

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Rotas de API -> módulo da função (carregado sob demanda, para não exigir chaves de quem não usa a rota). */
export const API_ROUTES = {
  '/api/flights': './netlify/functions/flights.mjs',
  '/api/calendar': './netlify/functions/calendar.mjs',
  '/api/flex': './netlify/functions/flex.mjs',
  '/api/roteiro': './netlify/functions/roteiro.mjs',
  '/api/chat': './netlify/functions/chat.mjs',
};

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('corpo grande demais'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function fileFor(distDir, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const candidate = path.normalize(path.join(distDir, decoded));
  if (candidate !== distDir && !candidate.startsWith(distDir + path.sep)) return null; // bloqueia ../
  try {
    const s = await stat(candidate);
    if (s.isFile()) return { file: candidate, size: s.size };
  } catch {
    // não existe
  }
  return null;
}

export function createAppServer({ distDir = path.join(HERE, 'dist'), routes = API_ROUTES, loadHandler = (rel) => import(pathToFileURL(path.join(HERE, rel)).href).then((m) => m.default) } = {}) {
  const root = path.resolve(distDir);
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
      res.end(body);
    };
    try {
      if (url.pathname === '/healthz') return send(200, 'ok', { 'content-type': 'text/plain' });

      if (url.pathname.startsWith('/api/')) {
        const rel = routes[url.pathname];
        if (!rel) return send(404, JSON.stringify({ error: 'rota não encontrada' }), { 'content-type': 'application/json' });
        const handler = await loadHandler(rel);
        const hasBody = !['GET', 'HEAD'].includes(req.method);
        const body = hasBody ? await readBody(req) : undefined;
        const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, { method: req.method, headers: req.headers, body });
        const response = await handler(request);
        res.writeHead(response.status, { ...SECURITY_HEADERS, ...Object.fromEntries(response.headers) });
        if (!response.body) return res.end();
        const stream = Readable.fromWeb(response.body);
        req.on('close', () => stream.destroy()); // cliente saiu: para de gerar
        stream.on('error', () => res.end());
        return stream.pipe(res);
      }

      if (!['GET', 'HEAD'].includes(req.method)) return send(405, 'método não permitido', { allow: 'GET, HEAD' });
      const asked = url.pathname === '/' ? '/index.html' : url.pathname;
      let found = await fileFor(root, asked);
      let spaFallback = false;
      if (!found && !path.extname(asked)) {
        found = await fileFor(root, '/index.html'); // rotas do app (hash) e URLs sem extensão
        spaFallback = true;
      }
      if (!found) return send(404, 'não encontrado', { 'content-type': 'text/plain; charset=utf-8' });
      const ext = path.extname(found.file).toLowerCase();
      const immutable = found.file.includes(`${path.sep}assets${path.sep}`);
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'content-type': TYPES[ext] ?? 'application/octet-stream',
        'content-length': found.size,
        'cache-control': immutable && !spaFallback ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      if (req.method === 'HEAD') return res.end();
      return createReadStream(found.file).pipe(res);
    } catch (err) {
      const status = err.status ?? 500;
      // 413: o corpo não foi lido até o fim; fecha a conexão para não travar a próxima requisição no mesmo socket.
      return send(status, JSON.stringify({ error: status === 413 ? 'corpo grande demais' : 'erro interno' }), { 'content-type': 'application/json', ...(status === 413 && { connection: 'close' }) });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  createAppServer().listen(port, '0.0.0.0', () => console.log(`Pobre Mochileiro em http://0.0.0.0:${port}`));
}
