import 'dotenv/config';
import { createApp } from './app';
const port = Number(process.env.PORT || 3001);
createApp().listen(port, '127.0.0.1', () => console.log(`Chia Sha server: http://127.0.0.1:${port}`));
