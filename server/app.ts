import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSearchInput } from '../shared/logic';
import { ProviderError, searchGoogle, searchOsm } from './providers';

export function createApp() {
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
      res.json(key ? await searchGoogle(input, key) : await searchOsm(input));
    } catch (error) {
      if (error instanceof ProviderError) res.status(error.status).json({ error: error.message });
      else res.status(502).json({ error: '餐廳服務連線逾時或暫時中斷，請稍後再試。' });
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
