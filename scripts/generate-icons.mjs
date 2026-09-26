import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const svg = await readFile(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const destination = new URL('../public/icons/', import.meta.url);
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const [filename, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512], ['apple-touch-icon.png', 180]]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0"><img width="${size}" height="${size}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" /></body></html>`);
    await page.locator('img').evaluate(img => img.decode());
    await page.screenshot({ path: fileURLToPath(new URL(filename, destination)) });
    await page.close();
  }
} finally { await browser.close(); }
