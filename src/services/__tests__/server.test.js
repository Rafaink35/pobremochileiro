import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAppServer } from '../../../server.mjs';

let server;
let base;
beforeAll(async () => {
  const dist = await mkdtemp(path.join(os.tmpdir(), 'pm-dist-'));
  await mkdir(path.join(dist, 'assets'));
  await writeFile(path.join(dist, 'index.html'), '<!doctype html><title>app</title>');
  await writeFile(path.join(dist, 'assets', 'app.js'), 'console.log(1)');
  await writeFile(path.join(path.dirname(dist), 'segredo.txt'), 'fora do dist');
  const handlers = {
    echo: async (req) => new Response(JSON.stringify({ method: req.method, body: await req.text(), q: new URL(req.url).search }), { headers: { 'content-type': 'application/json' } }),
    stream: async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('a\n')); c.enqueue(new TextEncoder().encode('b\n')); c.close(); } }), { headers: { 'content-type': 'application/x-ndjson' } }),
    boom: async () => { throw new Error('x'); },
  };
  server = createAppServer({ distDir: dist, routes: { '/api/echo': 'echo', '/api/stream': 'stream', '/api/boom': 'boom' }, loadHandler: async (k) => handlers[k] });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));

describe('servidor para hospedagem fora da Netlify', () => {
  it('serve o app, os assets com cache longo e o index sem cache', async () => {
    const index = await fetch(`${base}/`);
    expect(index.status).toBe(200);
    expect(index.headers.get('cache-control')).toBe('no-cache');
    expect(index.headers.get('x-content-type-options')).toBe('nosniff');
    const asset = await fetch(`${base}/assets/app.js`);
    expect(asset.headers.get('cache-control')).toMatch(/immutable/);
    expect(asset.headers.get('content-type')).toMatch(/javascript/);
  });
  it('rotas do app sem extensão caem no index; arquivo inexistente dá 404', async () => {
    expect(await (await fetch(`${base}/planejador`)).text()).toMatch(/<title>app/);
    expect((await fetch(`${base}/nada.js`)).status).toBe(404);
  });
  it('não sai da pasta dist (path traversal)', async () => {
    const res = await fetch(`${base}/..%2Fsegredo.txt`);
    expect(res.status).not.toBe(200);
    expect((await fetch(`${base}/%2e%2e/segredo.txt`)).status).not.toBe(200);
  });
  it('encaminha /api/* para a função com método, corpo e query', async () => {
    const res = await fetch(`${base}/api/echo?x=1`, { method: 'POST', body: '{"a":1}' });
    expect(await res.json()).toEqual({ method: 'POST', body: '{"a":1}', q: '?x=1' });
  });
  it('repassa respostas em streaming', async () => {
    const res = await fetch(`${base}/api/stream`);
    expect(res.headers.get('content-type')).toMatch(/ndjson/);
    expect(await res.text()).toBe('a\nb\n');
  });
  it('rota de API desconhecida, erro interno, corpo grande e método inválido', async () => {
    expect((await fetch(`${base}/api/nao-existe`)).status).toBe(404);
    expect((await fetch(`${base}/api/boom`)).status).toBe(500);
    expect((await fetch(`${base}/api/echo`, { method: 'POST', body: 'x'.repeat(1_100_000) })).status).toBe(413);
    expect((await fetch(`${base}/`, { method: 'DELETE' })).status).toBe(405);
  });
  it('healthcheck', async () => {
    expect(await (await fetch(`${base}/healthz`)).text()).toBe('ok');
  });
});
