import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const baseRestaurant = {
  id: 'photo-place', name: '有照片的餐廳', cuisines: ['japanese'], address: '測試地址',
  location: { lat: 25.0524, lng: 121.5206 }, distance: 100, rating: 4.6, reviewCount: 50,
  priceLevel: 2, priceText: null, openNow: true, hours: null, source: 'google', attributions: [],
  image: '/api/photos?token=photo-fixture',
  photo: {
    authors: [{ name: '照片作者', profileUrl: 'https://www.google.com/maps/contrib/123', avatarUrl: '/favicon.svg' }],
    sourceUrl: 'https://www.google.com/maps/photo/original',
  },
};

async function openLiveResults(page: Page, restaurants: unknown[]) {
  await page.route('**/api/config', route => route.fulfill({ json: { provider: 'google' } }));
  await page.route('**/api/restaurants', route => route.fulfill({ json: { source: 'google', restaurants, limited: false } }));
  await page.goto('/');
  await page.getByRole('button', { name: '更換位置' }).click();
  await page.getByRole('button', { name: '台北・中山站', exact: true }).click();
  await expect(page.locator('.source-note.google')).toBeVisible();
}

test('real photo renders in card and details with author/source attribution, including mobile', async ({ page }) => {
  const photo = await readFile('public/images/japanese.jpg');
  await page.route('**/api/photos?*', route => route.fulfill({ contentType: 'image/jpeg', body: photo }));
  await openLiveResults(page, [baseRestaurant]);
  const card = page.locator('.restaurant-card');
  await expect(card.getByRole('img', { name: '有照片的餐廳的店家照片' })).toBeVisible();
  await expect.poll(() => card.locator('.restaurant-photo img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(card.getByRole('link', { name: '照片作者' })).toHaveAttribute('href', baseRestaurant.photo.authors[0].profileUrl);
  await expect(card.getByRole('link', { name: /查看.*原始照片/ })).toHaveAttribute('href', baseRestaurant.photo.sourceUrl);
  await expect(card.getByText('料理示意')).toHaveCount(0);
  await card.getByRole('button', { name: /查看.*詳細資訊/ }).click();
  await expect(page.locator('.photo-attributions .photo-author')).toContainText('照片作者');
  await expect(page.getByRole('link', { name: '查看原始照片', exact: true })).toHaveAttribute('href', baseRestaurant.photo.sourceUrl);
  await expect(page.locator('.detail-image .restaurant-photo img')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '關閉視窗' }).click();
  await page.getByRole('button', { name: '幫我選一家' }).click();
  await expect(page.locator('.picked-modal .detail-image img')).toHaveAttribute('src', baseRestaurant.image);
});

test('missing and failed photos show distinct honest placeholders without stock imagery', async ({ page }) => {
  await page.route('**/api/photos?*', route => route.fulfill({ status: 502, json: { error: 'Photo unavailable' } }));
  await openLiveResults(page, [baseRestaurant, { ...baseRestaurant, id: 'no-photo', name: '尚無照片的餐廳', image: null, photo: null }]);
  const failed = page.locator('.restaurant-card').filter({ hasText: '有照片的餐廳' });
  const missing = page.locator('.restaurant-card').filter({ hasText: '尚無照片的餐廳' });
  await expect(failed.getByText('照片暫時無法載入')).toBeVisible();
  await expect(missing.getByText('尚無店家照片')).toBeVisible();
  await expect(page.locator('.restaurant-card img')).toHaveCount(0);
  await expect(page.locator('.restaurant-card .photo-credit')).toHaveCount(0);
  await failed.getByRole('button', { name: /查看.*詳細資訊/ }).click();
  await expect(page.getByRole('dialog').getByText('照片暫時無法載入')).toBeVisible();
});

test('a fresh search can recover after a photo failure', async ({ page }) => {
  let succeeds = false;
  const photo = await readFile('public/images/japanese.jpg');
  await page.route('**/api/photos?*', route => succeeds ? route.fulfill({ contentType: 'image/jpeg', body: photo }) : route.fulfill({ status: 404 }));
  await openLiveResults(page, [baseRestaurant]);
  await expect(page.getByText('照片暫時無法載入')).toBeVisible();
  succeeds = true;
  await page.getByRole('button', { name: '搜尋附近餐廳' }).click();
  await expect.poll(() => page.locator('.restaurant-card .restaurant-photo img').count()).toBe(1);
  await expect.poll(() => page.locator('.restaurant-card .restaurant-photo img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText('照片暫時無法載入')).toHaveCount(0);
});
