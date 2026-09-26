import express from 'express';
import { readFileSync } from 'node:fs';
import { createApp } from '../../server/app.js';

const app = express();
let workerVersion = 1;
// Exercise a real worker update without modifying the built release files.
app.post('/__test/worker-update', (_req, res) => { workerVersion++; res.sendStatus(204); });
app.get('/sw.js', (_req, res) => res.type('js').set('Cache-Control', 'no-cache').send(`${readFileSync('dist/sw.js', 'utf8')}\n/* test worker ${workerVersion} */`));
app.use(createApp());
app.listen(4173, '127.0.0.1', () => console.log('PWA production test server: http://127.0.0.1:4173'));
