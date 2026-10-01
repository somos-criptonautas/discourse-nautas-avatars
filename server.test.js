import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';

const PORT = 18787;
const BASE = `http://127.0.0.1:${PORT}`;
let child;

before(async () => {
  child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => {
      if (d.toString().includes('listening')) resolve();
    });
    child.on('error', reject);
    setTimeout(() => reject(new Error('server did not start')), 5000);
  });
});

after(() => {
  child.kill();
});

function get(path) {
  return new Promise((resolve, reject) => {
    http
      .get(BASE + path, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      })
      .on('error', reject);
  });
}

test('valid request returns an SVG image', async () => {
  const r = await get('/beam/128/alice');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /image\/svg\+xml/);
  assert.match(r.headers['cache-control'], /immutable/);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.match(r.body.toString('utf8'), /<svg/);
});

test('same username produces identical bytes', async () => {
  const a = await get('/beam/128/alice');
  const b = await get('/beam/128/alice');
  assert.deepEqual(a.body, b.body);
});

test('bad size returns 400', async () => {
  const tooSmall = await get('/beam/8/alice');
  const tooBig = await get('/beam/9999/alice');
  const notNumber = await get('/beam/abc/alice');
  assert.equal(tooSmall.status, 400);
  assert.equal(tooBig.status, 400);
  assert.equal(notNumber.status, 400);
});

test('bad variant returns 400', async () => {
  const r = await get('/not-a-variant/128/alice');
  assert.equal(r.status, 400);
});

test('overlong username returns 400', async () => {
  const r = await get('/beam/128/' + 'a'.repeat(61));
  assert.equal(r.status, 400);
});

test('trailing slash and unknown routes return 404', async () => {
  const trailing = await get('/beam/128/alice/');
  const unknown = await get('/does/not/exist/at/all');
  const root = await get('/');
  assert.equal(trailing.status, 404);
  assert.equal(unknown.status, 404);
  assert.equal(root.status, 404);
});
