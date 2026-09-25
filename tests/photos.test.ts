import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPhotoUrl, verifyPhotoToken, resolvePhotoUrl, safeHttpsUrl } from '../server/photos';
import { normalizeGoogle, normalizeOsm, searchGoogle } from '../server/providers';
import { createApp } from '../server/app';

const name = 'places/example-place/photos/example-photo';
const input = { lat: 25.05, lng: 121.52, radius: 1000, cuisines: [] };
const tokenFrom = (url: string) => new URL(url, 'http://localhost').searchParams.get('token')!;

test('photo links are signed, expire, and reject arbitrary URLs or path traversal', () => {
  const now = 1_000_000;
  const url = createPhotoUrl(name, now)!;
  const token = tokenFrom(url);
  assert.equal(verifyPhotoToken(token, now), name);
  assert.equal(verifyPhotoToken(token, now + 15 * 60 * 1000), null);
  const [payload, signature] = token.split('.');
  const changedSignature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
  assert.equal(verifyPhotoToken(`${payload}.${changedSignature}`, now), null);
  assert.equal(verifyPhotoToken(`${payload}.${signature}.extra`, now), null);
  assert.equal(verifyPhotoToken(['multiple', 'values'], now), null);
  for (const bad of ['https://evil.example/photo', 'places/../photos/image', 'places/a/photos/a?key=abc', 'places/a/photos/a/media', 'places/a/photos/']) assert.equal(createPhotoUrl(bad), null);
});

test('Google normalization selects a matching photo and retains safe author/source links', () => {
  const result = normalizeGoogle({
    id: 'example-place', location: { latitude: input.lat, longitude: input.lng },
    photos: [{ name: 'places/wrong-place/photos/other' }, {
      name, googleMapsUri: 'https://www.google.com/maps/photo/example',
      authorAttributions: [{ displayName: '攝影作者', uri: '//maps.google.com/maps/contrib/123', photoUri: '//lh3.googleusercontent.com/avatar' }, { displayName: '另一位作者', uri: 'javascript:alert(1)' }],
    }],
  }, input)!;
  assert.ok(result.image?.startsWith('/api/photos?token='));
  assert.equal(verifyPhotoToken(tokenFrom(result.image!)), name);
  assert.equal(result.photo?.authors.length, 2);
  assert.equal(result.photo?.authors[0].profileUrl, 'https://maps.google.com/maps/contrib/123');
  assert.equal(result.photo?.authors[0].avatarUrl, 'https://lh3.googleusercontent.com/avatar');
  assert.equal(result.photo?.authors[1].profileUrl, null);
  assert.equal(result.photo?.sourceUrl, 'https://www.google.com/maps/photo/example');
});

test('live venues without photos never fall back to cuisine stock images', () => {
  const google = normalizeGoogle({ id: 'example-place', location: { latitude: input.lat, longitude: input.lng } }, input)!;
  const osm = normalizeOsm({ type: 'node', id: 1, lat: input.lat, lon: input.lng, tags: { name: '小店' } }, input)!;
  for (const restaurant of [google, osm]) { assert.equal(restaurant.image, null); assert.equal(restaurant.photo, null); }
});

test('Nearby Search explicitly requests photo metadata without fetching any image eagerly', async () => {
  let calls = 0;
  const response = await searchGoogle(input, 'test-key', (async (_url, options) => {
    calls++;
    assert.ok((options?.headers as Record<string, string>)['X-Goog-FieldMask'].split(',').includes('places.photos'));
    return Response.json({ places: [{ id: 'example-place', location: { latitude: input.lat, longitude: input.lng }, photos: [{ name }] }] });
  }) as typeof fetch);
  assert.equal(calls, 1);
  assert.ok(response.restaurants[0].image?.startsWith('/api/photos?token='));
});

test('photo request keeps the API key in the server header and validates the returned CDN', async () => {
  const photoUrl = 'https://lh3.googleusercontent.com/places/example-image';
  const resolved = await resolvePhotoUrl(name, 'test-key', (async (url, options) => {
    const endpoint = new URL(String(url));
    assert.equal(endpoint.hostname, 'places.googleapis.com');
    assert.equal(endpoint.pathname, `/v1/${name}/media`);
    assert.equal(endpoint.searchParams.get('maxWidthPx'), '800');
    assert.equal(endpoint.searchParams.get('skipHttpRedirect'), 'true');
    assert.equal(endpoint.searchParams.has('key'), false);
    assert.equal((options?.headers as Record<string, string>)['X-Goog-Api-Key'], 'test-key');
    assert.equal(options?.redirect, 'error');
    return Response.json({ photoUri: photoUrl });
  }) as typeof fetch);
  assert.equal(resolved, photoUrl);
  for (const unsafe of ['http://lh3.googleusercontent.com/image', 'https://googleusercontent.com.evil.example/image', 'https://127.0.0.1/image', 'https://user:pass@lh3.googleusercontent.com/image', 'https://lh3.googleusercontent.com/image?key=test-key']) {
    await assert.rejects(resolvePhotoUrl(name, 'test-key', (async () => Response.json({ photoUri: unsafe })) as typeof fetch), /照片來源無效/);
  }
  await assert.rejects(resolvePhotoUrl(name, 'test-key', (async () => new Response('sensitive upstream message', { status: 403 })) as typeof fetch), /照片暫時無法載入/);
  assert.equal(safeHttpsUrl('data:image/png;base64,abc'), null);
});

test('photo HTTP endpoint denies unsigned requests, uses no-store and never exposes the key', async () => {
  const previousKey = process.env.GOOGLE_PLACES_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY = 'unit-test-only-key';
  let calls = 0;
  const server = createApp((async () => { calls++; return Response.json({ photoUri: 'https://lh3.googleusercontent.com/example' }); }) as typeof fetch).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const { port } = server.address() as { port: number };
  try {
    const base = `http://127.0.0.1:${port}`;
    const invalid = await fetch(`${base}/api/photos?token=bad`);
    assert.equal(invalid.status, 400); assert.equal(calls, 0);
    const response = await fetch(`${base}${createPhotoUrl(name)}`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('location'), 'https://lh3.googleusercontent.com/example');
    assert.equal((await response.text()).includes('unit-test-only-key'), false);
    assert.equal(calls, 1);
  } finally {
    if (previousKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY; else process.env.GOOGLE_PLACES_API_KEY = previousKey;
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
