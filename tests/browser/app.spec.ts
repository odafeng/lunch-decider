import { test, expect } from '@playwright/test';

test('desktop: demo, OR cuisine filters, radius and empty-state reset', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('示範模式', { exact: true })).toBeVisible();
  await expect(page.locator('.restaurant-card')).toHaveCount(6);
  await page.getByRole('button', { name: /泰式料理 酸辣/ }).click();
  await expect(page.locator('.restaurant-card')).toHaveCount(1);
  await page.getByRole('button', { name: /日式料理 日常/ }).click();
  await expect(page.locator('.restaurant-card')).toHaveCount(3);
  await page.getByLabel('搜尋半徑公尺數').fill('100');
  await page.getByLabel('搜尋半徑公尺數').press('Tab');
  await expect(page.getByText('這個範圍還沒找到合適的餐廳')).toBeVisible();
  await expect(page.getByRole('button', { name: '幫我選一家' })).toBeDisabled();
  await page.getByRole('button', { name: '重設篩選條件' }).click();
  await expect(page.locator('.restaurant-card')).toHaveCount(6);
});

test('rating, budget, open-now, sorting and query control the actual results', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('餐廳評分', { exact: true }).selectOption('4.5');
  await page.getByRole('button', { name: '價位 $$', exact: true }).click();
  await page.getByRole('switch').click();
  await expect(page.locator('.restaurant-card')).toHaveCount(4);
  await page.getByLabel('餐廳排序').selectOption('rating');
  await expect(page.locator('.restaurant-card').first()).toContainText('青日子');
  await page.getByLabel('搜尋目前結果中的餐廳').fill('Pasta');
  await expect(page.locator('.restaurant-card')).toHaveCount(1);
  await expect(page.locator('.restaurant-card')).toContainText('沐光');
});

test('favorites persist across reloads and random choice honors filters', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '收藏 青日子 Green Days', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '取消收藏 青日子 Green Days', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /我的收藏/ }).click();
  await expect(page.locator('.restaurant-card')).toHaveCount(1);
  await page.getByRole('button', { name: '幫我選一家' }).click();
  await expect(page.getByRole('dialog')).toContainText('青日子 Green Days');
  await expect(page.getByRole('button', { name: '符合條件的餐廳只有這一家' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('random redraw avoids immediate repeats and dinner copy works', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '晚餐提案' }).click();
  await page.getByRole('button', { name: '幫我選一家' }).click();
  await expect(page.getByRole('dialog')).toContainText('今天晚餐就吃這家');
  const first = await page.locator('.detail-content h2').textContent();
  await page.getByRole('button', { name: '再幫我選一次' }).click();
  expect(await page.locator('.detail-content h2').textContent()).not.toEqual(first);
});

test('denied geolocation has a useful manual fallback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (_success: unknown, failure: (error: { code: number }) => void) => failure({ code: 1 }) } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '使用我的位置', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('尚未取得定位權限');
  await page.getByRole('button', { name: '手動選擇位置', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '選擇搜尋位置' })).toBeVisible();
});

test('live geolocation passes coordinates and radius to API; missing fields stay unknown', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 25.03, longitude: 121.56 });
  await page.route('**/api/config', route => route.fulfill({ json: { provider: 'google' } }));
  const requests: any[] = [];
  await page.route('**/api/restaurants', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { source: 'google', limited: false, restaurants: [{ id: 'real-place', name: '測試回應餐廳', cuisines: ['thai'], address: '測試地址', location: { lat: 25.03, lng: 121.56 }, distance: 10, rating: null, reviewCount: null, priceLevel: null, priceText: null, openNow: null, hours: null, source: 'google', attributions: [], image: '/images/thai.jpg' }] } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '使用我的位置', exact: true }).click();
  await expect(page.locator('.restaurant-card')).toHaveCount(1);
  await expect(page.locator('.restaurant-card')).toContainText('尚無評分');
  expect(requests[0]).toMatchObject({ lat: 25.03, lng: 121.56, radius: 1000 });
  await page.getByRole('button', { name: /泰式料理 酸辣/ }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].cuisines).toEqual(['thai']);
  await page.getByRole('button', { name: '查看 測試回應餐廳 詳細資訊' }).click();
  await expect(page.getByRole('link', { name: /出發，帶我去/ })).toHaveAttribute('href', /destination_place_id=real-place/);
});

test('OSM mode disables unsupported filters and service failure is not silently replaced by demo', async ({ page }) => {
  await page.route('**/api/config', route => route.fulfill({ json: { provider: 'osm' } }));
  await page.route('**/api/restaurants', route => route.fulfill({ status: 503, json: { error: '開放地圖目前忙碌中' } }));
  await page.goto('/');
  await page.getByRole('button', { name: '更換位置' }).click();
  await page.getByRole('button', { name: '台北・中山站', exact: true }).click();
  await expect(page.getByText('開放地圖目前忙碌中', { exact: true })).toBeVisible();
  await expect(page.getByRole('switch')).toBeDisabled();
  await expect(page.locator('.restaurant-card')).toHaveCount(0);
  await page.getByRole('button', { name: '先看看示範' }).click();
  await expect(page.locator('.restaurant-card')).toHaveCount(6);
});

test('manual coordinates validate and stale responses cannot replace newer searches', async ({ page }) => {
  await page.route('**/api/restaurants', async route => {
    const data = route.request().postDataJSON();
    if (data.radius === 1000) await new Promise(resolve => setTimeout(resolve, 1500));
    await route.fulfill({ json: { source: 'osm', limited: false, restaurants: [] } }).catch(() => {});
  });
  await page.goto('/');
  await page.getByRole('button', { name: '更換位置' }).click();
  await page.getByLabel('緯度').fill('91');
  await page.getByRole('button', { name: '搜尋這個位置', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('緯度').fill('25');
  await page.getByRole('button', { name: '搜尋這個位置', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('搜尋半徑公尺數').fill('500');
  await page.getByLabel('搜尋半徑公尺數').press('Tab');
  await expect(page.getByText('這個範圍還沒找到合適的餐廳')).toBeVisible();
  await expect(page.locator('.range-value')).toHaveText('500 公尺');
});

test('mobile: no horizontal overflow, filters are accessible, and details close with keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '篩選', exact: true }).click();
  await expect(page.getByLabel('搜尋半徑公尺數')).toBeVisible();
  await page.getByLabel('搜尋半徑公尺數').fill('2000');
  await page.getByLabel('搜尋半徑公尺數').press('Tab');
  await page.getByRole('button', { name: /查看 .* 詳細資訊/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('all demo image assets render and no JavaScript errors occur', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: /再多看幾家/ }).click();
  await page.locator('footer').scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('img').evaluateAll(images => images.every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
  expect(errors).toEqual([]);
});
