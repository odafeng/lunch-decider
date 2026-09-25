import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSearchInput } from '../shared/logic';
import { ProviderError, searchGoogle, searchOsm } from './providers';
import { PhotoError, resolvePhotoUrl, verifyPhotoToken } from './photos';

export function createApp(fetcher = fetch) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8kb' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/config', (_req, res) => res.json({ provider: process.env.GOOGLE_PLACES_API_KEY ? 'google' : 'osm' }));
  app.post('/api/restaurants', rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: '搜尋太頻繁了，請稍等一分鐘再試。' } }), async (req, res) => {
    let input;
    try { input = parseSearchInput(req.body); } catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
    try {
      const key = process.env.GOOGLE_PLACES_API_KEY;
      res.json(key ? await searchGoogle(input, key, fetcher) : await searchOsm(input, fetcher));
    } catch (error) {
      if (error instanceof ProviderError) res.status(error.status).json({ error: error.message });
      else res.status(502).json({ error: '餐廳服務連線逾時或暫時中斷，請稍後再試。' });
    }
  });
  app.get('/api/photos', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: '照片載入太頻繁了，請稍後再試。' } }), async (req, res) => {
    const name = verifyPhotoToken(req.query.token);
    if (!name) { res.status(400).json({ error: '照片連結無效或已過期，請重新搜尋。' }); return; }
    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (!key) { res.status(503).json({ error: '店家照片服務尚未啟用。' }); return; }
    try {
      const uri = await resolvePhotoUrl(name, key, fetcher);
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.redirect(302, uri);
    } catch (error) {
      res.status(error instanceof PhotoError ? error.status : 502).json({ error: '照片暫時無法載入，請重新搜尋後再試。' });
    }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: '找不到這個服務。' }));
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
  app.use(express.static(dist));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  app.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.status === 413 ? 413 : 400).json({ error: '無法讀取請求，請確認資料格式。' });
  });
  return app;
}
