import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceMeters, filterRestaurants, parseSearchInput, pickRestaurant, directionsUrl, type Filters } from '../shared/logic';
import { DEMO_RESTAURANTS } from '../src/demo';
import { normalizeGoogle, normalizeOsm, searchGoogle, searchOsm } from '../server/providers';
import { createApp } from '../server/app';

const input = { lat: 25.0524, lng: 121.5206, radius: 1000, cuisines: [] };
const filters: Filters = { radius: 1000, cuisines: [], minRating: 0, minReviewCount: 0, prices: [], openOnly: false, query: '', sort: 'distance' };

test('distance is computed geographically, including across the date line', () => {
  assert.equal(distanceMeters(input, input), 0);
  assert.ok(Math.abs(distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 111195) < 2);
  assert.ok(distanceMeters({ lat: 0, lng: 179.999 }, { lat: 0, lng: -179.999 }) < 225);
});
test('search rejects invalid coordinates, radius and injectable cuisine values', () => {
  for (const body of [null, {}, { ...input, lat: NaN }, { ...input, lat: 91 }, { ...input, lng: -181 }, { ...input, radius: 99 }, { ...input, radius: 5001 }, { ...input, lat: '25' }, { ...input, cuisines: ['bad";out;'] }]) assert.throws(() => parseSearchInput(body));
  assert.deepEqual(parseSearchInput({ ...input, cuisines: ['thai', 'thai'] }).cuisines, ['thai']);
  assert.equal(parseSearchInput({ ...input, lat: 0, lng: 0 }).lat, 0);
});
test('radius and cuisine, rating, budget and opening filters combine correctly', () => {
  const result = filterRestaurants(DEMO_RESTAURANTS, { ...filters, cuisines: ['japanese', 'western'], minRating: 4.5, prices: [2], openOnly: true });
  assert.deepEqual(new Set(result.map(r => r.id)), new Set(['demo-1', 'demo-2']));
  assert.equal(filterRestaurants(DEMO_RESTAURANTS, { ...filters, radius: 100 }).length, 0);
  assert.equal(filterRestaurants(DEMO_RESTAURANTS, { ...filters, query: '  PASTA ' })[0].id, 'demo-2');
});
test('unknown values never pass known rating, review count, price or open filters', () => {
  const unknown = { ...DEMO_RESTAURANTS[0], rating: null, reviewCount: null, priceLevel: null, openNow: null };
  assert.equal(filterRestaurants([unknown], filters).length, 1);
  for (const extra of [{ minRating: 4 }, { minReviewCount: 100 }, { prices: [1] }, { openOnly: true }]) assert.equal(filterRestaurants([unknown], { ...filters, ...extra }).length, 0);
});

test('rating and review minimums are inclusive, independent, and constrain random picks together', () => {
  const restaurants = [
    { ...DEMO_RESTAURANTS[0], id: 'boundary', rating: 4.5, reviewCount: 300 },
    { ...DEMO_RESTAURANTS[0], id: 'few-reviews', rating: 4.9, reviewCount: 299 },
    { ...DEMO_RESTAURANTS[0], id: 'low-rating', rating: 4.4, reviewCount: 1000 },
    { ...DEMO_RESTAURANTS[0], id: 'no-reviews', rating: 5, reviewCount: 0 },
  ];
  assert.equal(filterRestaurants(restaurants, filters).length, 4);
  assert.deepEqual(filterRestaurants(restaurants, { ...filters, minReviewCount: 300 }).map(r => r.id), ['boundary', 'low-rating']);
  const eligible = filterRestaurants(restaurants, { ...filters, minRating: 4.5, minReviewCount: 300 });
  assert.deepEqual(eligible.map(r => r.id), ['boundary']);
  assert.equal(pickRestaurant(eligible)?.id, 'boundary');
  assert.deepEqual(filterRestaurants(restaurants, { ...filters, minReviewCount: 1001 }), []);
});

test('review sorting uses rating then distance for ties and keeps unknown counts last', () => {
  const restaurants = [
    { ...DEMO_RESTAURANTS[0], id: 'unknown', reviewCount: null, rating: 5 },
    { ...DEMO_RESTAURANTS[0], id: 'zero', reviewCount: 0, rating: 5 },
    { ...DEMO_RESTAURANTS[0], id: 'lower-rating', reviewCount: 500, rating: 4.5 },
    { ...DEMO_RESTAURANTS[0], id: 'farther', reviewCount: 500, rating: 4.8, distance: 300 },
    { ...DEMO_RESTAURANTS[0], id: 'nearer', reviewCount: 500, rating: 4.8, distance: 100 },
    { ...DEMO_RESTAURANTS[0], id: 'most-reviewed', reviewCount: 1000, rating: 4 },
  ];
  const originalOrder = restaurants.map(r => r.id);
  assert.deepEqual(filterRestaurants(restaurants, { ...filters, sort: 'reviewCount' }).map(r => r.id), ['most-reviewed', 'nearer', 'farther', 'lower-rating', 'zero', 'unknown']);
  assert.deepEqual(restaurants.map(r => r.id), originalOrder);
});
test('random pick handles empty sets, singles, and avoids the previous selection', () => {
  assert.equal(pickRestaurant([]), null);
  assert.equal(pickRestaurant([DEMO_RESTAURANTS[0]], 'demo-0')?.id, 'demo-0');
  assert.equal(pickRestaurant(DEMO_RESTAURANTS.slice(0, 2), 'demo-0', () => 0)?.id, 'demo-1');
  const eligible = filterRestaurants(DEMO_RESTAURANTS, { ...filters, cuisines: ['thai'] });
  assert.equal(pickRestaurant(eligible)?.cuisines[0], 'thai');
});
test('Google normalization preserves missing data and excludes permanently closed venues', () => {
  const raw = { id: 'test', displayName: { text: '測試食堂' }, types: ['thai_restaurant'], location: { latitude: input.lat, longitude: input.lng } };
  const result = normalizeGoogle(raw, input)!;
  assert.equal(result.rating, null); assert.equal(result.priceLevel, null); assert.equal(result.openNow, null);
  assert.deepEqual(result.cuisines, ['thai']);
  assert.equal(normalizeGoogle({ ...raw, businessStatus: 'CLOSED_PERMANENTLY' }, input), null);
  assert.equal(normalizeGoogle({ ...raw, priceLevel: 'PRICE_LEVEL_UNSPECIFIED' }, input)?.priceLevel, null);
  assert.equal(normalizeGoogle({ ...raw, priceRange: { startPrice: { currencyCode: 'TWD', units: '200' }, endPrice: { currencyCode: 'TWD', units: '400' } } }, input)?.priceText, 'NT$ 200–400');
});
test('Google query sends server-side radius and OR cuisine filters and drops out-of-radius results', async () => {
  let requestBody: Record<string, any> = {};
  const result = await searchGoogle({ ...input, cuisines: ['thai', 'japanese'] }, 'test-key', (async (_url, options) => {
    requestBody = JSON.parse(options?.body as string);
    assert.equal((options?.headers as Record<string, string>)['X-Goog-Api-Key'], 'test-key');
    return Response.json({ places: [{ id: 'close', displayName: { text: 'Thai' }, types: ['thai_restaurant'], location: { latitude: input.lat, longitude: input.lng } }, { id: 'far', location: { latitude: 26, longitude: 122 } }] });
  }) as typeof fetch);
  assert.equal(requestBody.locationRestriction.circle.radius, 1000);
  assert.ok(requestBody.includedTypes.includes('thai_restaurant'));
  assert.ok(requestBody.includedTypes.includes('japanese_restaurant'));
  assert.equal(result.restaurants.length, 1);
});
test('Google provider errors are actionable and never leak upstream error details or keys', async () => {
  await assert.rejects(searchGoogle(input, 'secret', (async () => new Response('secret upstream information', { status: 403 })) as typeof fetch), /請檢查伺服器的金鑰/);
});
test('OSM uses way centers, never fabricates rating or price, and deduplicates a mapped venue', async () => {
  const element = { type: 'way', id: 1, center: { lat: input.lat, lon: input.lng }, tags: { name: '泰式小館', cuisine: 'thai', opening_hours: 'Mo-Su 11:00-21:00' } };
  const venue = normalizeOsm(element, input)!;
  assert.equal(venue.distance, 0); assert.equal(venue.rating, null); assert.equal(venue.priceText, null); assert.equal(venue.openNow, null);
  const result = await searchOsm(input, (async () => Response.json({ elements: [element, { ...element, type: 'node', id: 2 }] })) as typeof fetch);
  assert.equal(result.restaurants.length, 1);
});
test('directions use the real place ID and optional origin', () => {
  const url = new URL(directionsUrl({ ...DEMO_RESTAURANTS[0], source: 'google', id: 'a&b' }, input));
  assert.equal(url.searchParams.get('destination_place_id'), 'a&b');
  assert.equal(url.searchParams.get('origin'), '25.0524,121.5206');
});
test('HTTP API validates before network calls and never caches location-based results', async () => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const address = server.address() as { port: number };
  try {
    const base = `http://127.0.0.1:${address.port}`;
    const config = await fetch(`${base}/api/config`);
    assert.equal(config.headers.get('cache-control'), 'no-store');
    assert.ok(['osm', 'google'].includes((await config.json()).provider));
    const response = await fetch(`${base}/api/restaurants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, radius: 90000 }) });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /100/);
    const unknown = await fetch(`${base}/api/missing`); assert.equal(unknown.status, 404);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
