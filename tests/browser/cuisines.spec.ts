import { test, expect } from '@playwright/test';

test('the picker supports regional cuisines and redraws only within the selected cuisine', async ({ page }) => {
  await page.goto('/');
  const selector = page.getByLabel('這次想吃', { exact: true });
  await expect(selector).toHaveValue('');
  for (const [value, label, count] of [
    ['taiwanese', '台式料理', 2], ['chinese', '中式料理', 1], ['hongkong', '港式料理', 2],
    ['thai', '泰式料理', 1], ['japanese', '日式料理', 2],
  ] as const) {
    await selector.selectOption(value);
    await expect(page.locator('.restaurant-card .cuisine-label')).toHaveText(Array(count).fill(label));
    await expect(page.locator('.cuisine-option').filter({ hasText: label })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '幫我選一家', exact: true }).click();
    await expect(page.locator('.detail-content > .cuisine-label')).toHaveText(label);
    if (count > 1) {
      const first = await page.locator('.detail-content h2').textContent();
      await page.getByRole('button', { name: '再幫我選一次', exact: true }).click();
      await expect(page.locator('.detail-content > .cuisine-label')).toHaveText(label);
      await expect(page.locator('.detail-content h2')).not.toHaveText(first!);
    }
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: /泰式料理 酸辣/ }).click();
  await expect(selector).toHaveValue('multiple');
  await expect(page.locator('.restaurant-card')).toHaveCount(3);
  await selector.selectOption('');
  await expect(page.locator('.cuisine-option[aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator('.restaurant-card')).toHaveCount(6);
  await page.locator('.explore-section').screenshot({ path: 'test-results/cuisines-desktop.png' });
});

test('mobile picker keeps rating and review thresholds when changing or clearing cuisine', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '篩選', exact: true }).click();
  await page.getByLabel('餐廳評分', { exact: true }).selectOption('4.5');
  await page.getByLabel('最低評論數', { exact: true }).selectOption('300');
  const selector = page.getByLabel('這次想吃', { exact: true });
  await selector.selectOption('taiwanese');
  await expect(page.locator('.restaurant-card')).toHaveCount(1);
  await page.getByRole('button', { name: '幫我選一家', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('小巷子');
  await page.keyboard.press('Escape');
  await selector.selectOption('hongkong');
  await expect(page.getByRole('button', { name: '幫我選一家', exact: true })).toBeDisabled();
  await expect(page.locator('.pick-conditions')).toContainText('目前沒有符合條件的餐廳');
  await selector.selectOption('');
  await expect(page.getByLabel('餐廳評分', { exact: true })).toHaveValue('4.5');
  await expect(page.getByLabel('最低評論數', { exact: true })).toHaveValue('300');
  await expect(page.locator('.restaurant-card')).toHaveCount(2);
  await selector.selectOption('japanese');
  await expect(page.locator('.restaurant-card')).toHaveCount(1);
  await page.getByRole('button', { name: '重設', exact: true }).click();
  await expect(selector).toHaveValue('');
  await expect(page.getByLabel('最低評論數', { exact: true })).toHaveValue('0');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.decision-banner').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/cuisines-mobile.png' });
});

test('live cuisine selection searches with the selected cuisine and waits for the new results before picking', async ({ page }) => {
  await page.route('**/api/config', route => route.fulfill({ json: { provider: 'google' } }));
  const requests: { cuisines: string[]; radius: number }[] = [];
  let releaseHongkong!: () => void;
  const hongkongReady = new Promise<void>(resolve => { releaseHongkong = resolve; });
  const baseRestaurant = {
    id: 'tw', name: '台式測試餐廳', cuisines: ['taiwanese'], address: '測試地址',
    location: { lat: 25.0524, lng: 121.5206 }, distance: 100, rating: 4.7, reviewCount: 500,
    priceLevel: 1, priceText: null, openNow: true, hours: null, source: 'google',
    attributions: [], image: null, photo: null,
  };
  await page.route('**/api/restaurants', async route => {
    const request = route.request().postDataJSON();
    requests.push(request);
    if (request.cuisines.includes('hongkong')) await hongkongReady;
    return route.fulfill({ json: { source: 'google', limited: false, restaurants: request.cuisines.includes('hongkong')
      ? [{ ...baseRestaurant, id: 'hk', name: '港式測試餐廳', cuisines: ['hongkong'] }]
      : [baseRestaurant] } });
  });
  try {
    await page.goto('/');
    await page.getByLabel('這次想吃', { exact: true }).selectOption('taiwanese');
    await page.getByRole('button', { name: '更換位置', exact: true }).click();
    await page.getByRole('button', { name: '台北・中山站', exact: true }).click();
    await expect(page.locator('.restaurant-card')).toContainText('台式測試餐廳');
    expect(requests[0]).toMatchObject({ cuisines: ['taiwanese'], radius: 1000 });
    await page.getByLabel('這次想吃', { exact: true }).selectOption('hongkong');
    await expect(page.getByRole('button', { name: '幫我選一家', exact: true })).toBeDisabled();
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[1].cuisines).toEqual(['hongkong']);
    releaseHongkong();
    await expect(page.locator('.restaurant-card')).toContainText('港式測試餐廳');
    await page.getByRole('button', { name: '幫我選一家', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('港式測試餐廳');
    await page.keyboard.press('Escape');
    await page.getByLabel('這次想吃', { exact: true }).selectOption('');
    await expect.poll(() => requests.length).toBe(3);
    expect(requests[2].cuisines).toEqual([]);
    await expect(page.locator('.restaurant-card')).toContainText('台式測試餐廳');
  } finally { releaseHongkong(); }
});
