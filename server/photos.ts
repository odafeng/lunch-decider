import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Authorize only photos returned by a recent search, without storing photo names.
// Separate serverless instances must sign and verify with the same secret.
// Derive a domain-specific fallback from the API key when no dedicated secret exists.
const signingSecret = process.env.PHOTO_SIGNING_SECRET || (process.env.GOOGLE_PLACES_API_KEY
  ? createHmac('sha256', process.env.GOOGLE_PLACES_API_KEY).update('chia-sha-place-photos-v1').digest()
  : randomBytes(32));
const PHOTO_LIFETIME_MS = 15 * 60 * 1000;
const photoNamePattern = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

function validPhotoName(name: unknown): name is string {
  return typeof name === 'string' && name.length <= 4096 && photoNamePattern.test(name);
}

export function createPhotoUrl(name: string, now = Date.now()): string | null {
  if (!validPhotoName(name)) return null;
  const payload = Buffer.from(JSON.stringify({ name, expires: now + PHOTO_LIFETIME_MS })).toString('base64url');
  const signature = createHmac('sha256', signingSecret).update(payload).digest('base64url');
  return `/api/photos?token=${payload}.${signature}`;
}

export function verifyPhotoToken(token: unknown, now = Date.now()): string | null {
  if (typeof token !== 'string' || token.length > 6000) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return null;
  const expected = createHmac('sha256', signingSecret).update(parts[0]).digest();
  const supplied = Buffer.from(parts[1], 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const { name, expires } = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return validPhotoName(name) && Number.isSafeInteger(expires) && expires > now && expires <= now + PHOTO_LIFETIME_MS ? name : null;
  } catch { return null; }
}

export function safeHttpsUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export class PhotoError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function resolvePhotoUrl(name: string, key: string, fetcher = fetch): Promise<string> {
  if (!validPhotoName(name)) throw new PhotoError('照片參照無效。', 400);
  const endpoint = new URL(`https://places.googleapis.com/v1/${name}/media`);
  endpoint.searchParams.set('maxWidthPx', '800');
  endpoint.searchParams.set('skipHttpRedirect', 'true');
  // The key goes only to the API host. Never forward it to the image CDN.
  const response = await fetcher(endpoint, {
    headers: { 'X-Goog-Api-Key': key }, redirect: 'error', signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new PhotoError('照片暫時無法載入，請重新搜尋後再試。', response.status === 404 ? 404 : 502);
  const data = await response.json() as { photoUri?: string };
  const uri = safeHttpsUrl(data.photoUri);
  if (!uri) throw new PhotoError('照片來源無效。', 502);
  const url = new URL(uri);
  if ((url.hostname !== 'googleusercontent.com' && !url.hostname.endsWith('.googleusercontent.com')) || url.port || uri.includes(key)) {
    throw new PhotoError('照片來源無效。', 502);
  }
  return uri;
}
