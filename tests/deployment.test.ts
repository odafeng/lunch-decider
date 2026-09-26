import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createApp } from '../server/app';
import configHandler from '../api/config';
import restaurantsHandler from '../api/restaurants';
import photosHandler from '../api/photos';

function runPhotoProcess(code: string, secret?: string, stdin = '') {
  const env: NodeJS.ProcessEnv = { ...process.env, GOOGLE_PLACES_API_KEY: 'test-only-api-key', VERCEL: '1' };
  if (secret) env.PHOTO_SIGNING_SECRET = secret; else delete env.PHOTO_SIGNING_SECRET;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
    env, input: stdin, encoding: 'utf8', timeout: 10000, windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('photos signed by one cold serverless instance are accepted by another', () => {
  const sign = "import { createPhotoUrl } from './server/photos.ts'; console.log(new URL(createPhotoUrl('places/demo/photos/photo'), 'http://localhost').searchParams.get('token'));";
  const verify = "import fs from 'node:fs'; import { verifyPhotoToken } from './server/photos.ts'; console.log(verifyPhotoToken(fs.readFileSync(0, 'utf8').trim()));";
  const secret = 'a'.repeat(64);
  const token = runPhotoProcess(sign, secret);
  assert.equal(runPhotoProcess(verify, secret, token), 'places/demo/photos/photo');
  assert.equal(runPhotoProcess(verify, 'b'.repeat(64), token), 'null');
  // Existing deployments configured with only the Google key also remain stable.
  const fallbackToken = runPhotoProcess(sign);
  assert.equal(runPhotoProcess(verify, undefined, fallbackToken), 'places/demo/photos/photo');
});

test('Vercel entry points serve their original API paths without a listening server or static assets', async () => {
  for (const [app, route, method, expected] of [
    [configHandler, '/api/config', 'GET', 200],
    [restaurantsHandler, '/api/restaurants', 'POST', 400],
    [photosHandler, '/api/photos?token=invalid', 'GET', 400],
  ] as const) {
    assert.equal(app.get('trust proxy'), 1);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.on('listening', resolve));
    const { port } = server.address() as { port: number };
    try {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, { method });
      assert.equal(response.status, expected);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const root = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(root.status, 404);
    } finally {
      server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }
});

test('Vercel proxy rate limits separate clients instead of sharing the proxy IP', async () => {
  const app = createApp(fetch, { serveStatic: false, trustProxy: 1 });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const { port } = server.address() as { port: number };
  try {
    const request = (ip: string) => fetch(`http://127.0.0.1:${port}/api/restaurants`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: '{}',
    });
    for (let index = 0; index < 20; index++) assert.equal((await request('192.0.2.10')).status, 400);
    assert.equal((await request('192.0.2.10')).status, 429);
    assert.equal((await request('192.0.2.11')).status, 400);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
