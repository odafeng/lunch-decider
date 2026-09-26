import { test, expect, type Page } from '@playwright/test';

async function openReady(page: Page) {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe('activated');
}

test('production manifest, icons and worker meet Chromium installability checks', async ({ page, context, request }) => {
  await openReady(page);
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/manifest.webmanifest');
  const response = await request.get(href!);
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ id: '/', short_name: '呷啥', lang: 'zh-Hant', start_url: '/', scope: '/', display: 'standalone' });
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: '192x192', purpose: 'any' }),
    expect.objectContaining({ sizes: '512x512', purpose: 'any' }),
    expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
  ]));
  for (const icon of [...manifest.icons, { src: '/icons/apple-touch-icon.png', sizes: '180x180' }]) {
    const png = await request.get(icon.src);
    expect(png.ok()).toBe(true);
    const bytes = await png.body();
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`).toBe(icon.sizes);
  }
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.enable');
  await expect.poll(async () => (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors).toEqual([]);
});

test('a fresh offline page opens from cache with demo picking and saved favorites', async ({ page, context }) => {
  await openReady(page);
  await page.getByRole('button', { name: '收藏 青日子 Green Days', exact: true }).click();
  await page.close();
  await context.setOffline(true);
  const offlinePage = await context.newPage();
  await offlinePage.goto('/');
  await expect(offlinePage.locator('.offline-banner')).toContainText('目前離線');
  await expect(offlinePage.getByRole('button', { name: '取消收藏 青日子 Green Days', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(offlinePage.getByRole('button', { name: '使用我的位置', exact: true })).toBeDisabled();
  await offlinePage.getByLabel('這次想吃', { exact: true }).selectOption('japanese');
  await offlinePage.getByLabel('餐廳評分', { exact: true }).selectOption('4.8');
  await offlinePage.getByLabel('最低評論數', { exact: true }).selectOption('500');
  await offlinePage.getByRole('button', { name: '幫我選一家', exact: true }).click();
  await expect(offlinePage.getByRole('dialog')).toContainText('森川');
  await expect.poll(() => offlinePage.locator('.detail-image img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await offlinePage.keyboard.press('Escape');
  await context.setOffline(false);
  await expect(offlinePage.locator('.offline-banner')).toHaveCount(0);
  await expect(offlinePage.getByRole('button', { name: '使用我的位置', exact: true })).toBeEnabled();
});

test('live data and photos are not cached, offline search is explicit, and reconnect refreshes results', async ({ page, context }) => {
  let searches = 0;
  await page.route('**/api/config', route => route.fulfill({ json: { provider: 'google' }, headers: { 'Cache-Control': 'no-store' } }));
  await page.route('**/api/restaurants', route => {
    searches++;
    return route.fulfill({ json: { source: 'google', limited: false, restaurants: [{
      id: 'pwa-live', name: `即時餐廳 ${searches}`, cuisines: ['taiwanese'], address: '測試地址',
      location: { lat: 25.0524, lng: 121.5206 }, distance: 100, rating: 4.7, reviewCount: 500,
      priceLevel: 1, priceText: null, openNow: true, hours: null, source: 'google', attributions: [],
      image: '/api/photos?token=pwa-test', photo: null,
    }] }, headers: { 'Cache-Control': 'no-store' } });
  });
  await page.route('**/api/photos?*', route => route.fulfill({ contentType: 'image/svg+xml', headers: { 'Cache-Control': 'no-store' }, body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="green"/></svg>' }));
  await openReady(page);
  await page.getByRole('button', { name: '更換位置', exact: true }).click();
  await page.getByRole('button', { name: '台北・中山站', exact: true }).click();
  await expect(page.locator('.restaurant-card')).toContainText('即時餐廳 1');
  await expect.poll(() => page.locator('.restaurant-card img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const cachedUrls = await page.evaluate(async () => {
    const keys = await caches.keys();
    return (await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(request => request.url)))).flat();
  });
  expect(cachedUrls.some(url => url.includes('/api/') || url.includes('google'))).toBe(false);
  expect(cachedUrls.some(url => url.includes('/index.html'))).toBe(true);
  await context.setOffline(true);
  await expect(page.locator('.empty-state')).toContainText('目前離線，無法搜尋真實餐廳');
  await expect(page.locator('.restaurant-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '幫我選一家', exact: true })).toBeDisabled();
  // Navigation to an API path must not receive the cached HTML app shell.
  const apiPage = await context.newPage();
  await expect(apiPage.goto('/api/config')).rejects.toThrow();
  await apiPage.close();
  await context.setOffline(false);
  await expect(page.locator('.restaurant-card')).toContainText('即時餐廳 2');
  expect(searches).toBe(2);
});

test('install button supports the browser prompt, dismissal, manual instructions and installed state', async ({ page }) => {
  await openReady(page);
  await page.evaluate(() => {
    (window as typeof window & { promptCalls: number }).promptCalls = 0;
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.defineProperties(event, {
      prompt: { value: async () => { (window as typeof window & { promptCalls: number }).promptCalls++; } },
      userChoice: { value: Promise.resolve({ outcome: 'dismissed' }) },
    });
    window.dispatchEvent(event);
  });
  await page.getByRole('button', { name: '安裝 App', exact: true }).click();
  expect(await page.evaluate(() => (window as typeof window & { promptCalls: number }).promptCalls)).toBe(1);
  await page.getByRole('button', { name: '安裝 App', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '安裝呷啥 App', exact: true })).toContainText('Safari');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/pwa/install-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.getByRole('button', { name: '安裝 App', exact: true })).toHaveCount(0);
});

test('standalone launch hides installation controls and respects mobile width', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  await page.setViewportSize({ width: 390, height: 844 });
  await openReady(page);
  await expect(page.getByRole('button', { name: '安裝 App', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a waiting worker offers an update without losing the current selection until accepted', async ({ page, request }) => {
  await openReady(page);
  await page.getByRole('button', { name: '收藏 青日子 Green Days', exact: true }).click();
  await page.getByLabel('搜尋目前結果中的餐廳').fill('Pasta');
  await request.post('/__test/worker-update');
  await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update(); });
  await expect(page.getByRole('button', { name: '立即更新', exact: true })).toBeVisible();
  await expect(page.getByLabel('搜尋目前結果中的餐廳')).toHaveValue('Pasta');
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: '立即更新', exact: true }).click()]);
  await expect(page.getByLabel('搜尋目前結果中的餐廳')).toHaveValue('');
  await expect(page.getByRole('button', { name: '取消收藏 青日子 Green Days', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '立即更新', exact: true })).toHaveCount(0);
});
