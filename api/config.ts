import { createApp } from '../server/app.js';

export default createApp(fetch, { serveStatic: false, trustProxy: 1 });
