import { type Cuisine, type Restaurant, type SearchInput, type SearchResponse } from '../shared/types.js';
import { distanceMeters } from '../shared/logic.js';
import { createPhotoUrl, safeHttpsUrl } from './photos.js';

export const GOOGLE_TYPES: Record<Cuisine, string[]> = {
  chinese: ['chinese_restaurant', 'taiwanese_restaurant'], japanese: ['japanese_restaurant', 'sushi_restaurant', 'ramen_restaurant'],
  western: ['western_restaurant', 'italian_restaurant', 'french_restaurant', 'american_restaurant', 'steak_house', 'pizza_restaurant'],
  thai: ['thai_restaurant'], korean: ['korean_restaurant'], vegetarian: ['vegetarian_restaurant', 'vegan_restaurant'], other: ['restaurant'],
};
export function classifyCuisine(types: string[], osmCuisine = ''): Cuisine[] {
  const text = [...types, ...osmCuisine.split(';')];
  const result: Cuisine[] = [];
  const rules: [Cuisine, RegExp][] = [
    ['chinese', /chinese|taiwanese|dumpling|noodle|hot_pot/], ['japanese', /japanese|sushi|ramen|udon|tonkatsu|yakiniku|yakitori/],
    ['western', /western|italian|french|american|steak|pizza|burger|pasta|mediterranean/], ['thai', /thai/],
    ['korean', /korean/], ['vegetarian', /vegetarian|vegan/],
  ];
  for (const [cuisine, re] of rules) if (text.some(t => re.test(t))) result.push(cuisine);
  return result.length ? result : ['other'];
}
export interface GooglePlace {
  id: string; displayName?: { text?: string }; types?: string[]; formattedAddress?: string;
  location?: { latitude: number; longitude: number }; rating?: number; userRatingCount?: number;
  priceLevel?: string; priceRange?: { startPrice?: { currencyCode?: string; units?: string }; endPrice?: { currencyCode?: string; units?: string } };
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] }; businessStatus?: string;
  attributions?: { provider?: string; providerUri?: string }[];
  photos?: {
    name: string;
    authorAttributions?: { displayName?: string; uri?: string; photoUri?: string }[];
    googleMapsUri?: string;
  }[];
}
const priceLevels: Record<string, number> = { PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 };
export function normalizeGoogle(place: GooglePlace, input: SearchInput): Restaurant | null {
  if (!place.location || place.businessStatus === 'CLOSED_PERMANENTLY' || place.businessStatus === 'CLOSED_TEMPORARILY') return null;
  const location = { lat: place.location.latitude, lng: place.location.longitude };
  const cuisines = classifyCuisine(place.types ?? []);
  const range = place.priceRange;
  const currency = range?.startPrice?.currencyCode ?? range?.endPrice?.currencyCode;
  const prefix = currency === 'TWD' ? 'NT$' : currency;
  const start = range?.startPrice?.units;
  const end = range?.endPrice?.units;
  const photo = place.photos?.find(photo => photo.name.startsWith(`places/${place.id}/photos/`) && createPhotoUrl(photo.name));
  const image = photo ? createPhotoUrl(photo.name) : null;
  return {
    id: place.id, name: place.displayName?.text || '未命名餐廳', cuisines,
    address: place.formattedAddress || '尚無地址', location, distance: distanceMeters(input, location),
    rating: place.rating ?? null, reviewCount: place.userRatingCount ?? null,
    priceLevel: place.priceLevel ? priceLevels[place.priceLevel] ?? null : null,
    priceText: prefix && (start || end) ? `${prefix} ${start && end ? `${start}–${end}` : start ? `${start} 起` : `${end} 以下`}` : null,
    openNow: place.currentOpeningHours?.openNow ?? null,
    hours: place.currentOpeningHours?.weekdayDescriptions?.join('\n') ?? null,
    source: 'google', image,
    photo: photo && image ? {
      authors: (photo.authorAttributions ?? []).map(author => ({
        name: author.displayName || '照片提供者', profileUrl: safeHttpsUrl(author.uri), avatarUrl: safeHttpsUrl(author.photoUri),
      })),
      sourceUrl: safeHttpsUrl(photo.googleMapsUri),
    } : null,
    attributions: (place.attributions ?? []).map(a => ({ name: a.provider ?? '', url: a.providerUri ?? '' })),
  };
}
export class ProviderError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
export async function searchGoogle(input: SearchInput, key: string, fetcher = fetch): Promise<SearchResponse> {
  const includedTypes = input.cuisines.length ? [...new Set(input.cuisines.flatMap(c => GOOGLE_TYPES[c]))] : ['restaurant'];
  const response = await fetcher('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.formattedAddress,places.types,places.rating,places.userRatingCount,places.priceLevel,places.priceRange,places.currentOpeningHours,places.businessStatus,places.attributions,places.photos' },
    body: JSON.stringify({ includedTypes, maxResultCount: 20, languageCode: 'zh-TW', rankPreference: 'DISTANCE',
      locationRestriction: { circle: { center: { latitude: input.lat, longitude: input.lng }, radius: input.radius } } }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    if ([401, 403].includes(response.status)) throw new ProviderError('Google 餐廳服務尚未啟用。請檢查伺服器的金鑰、Places API 權限與計費設定。');
    if (response.status === 429) throw new ProviderError('餐廳服務暫時達到使用上限，請稍後再試。', 503);
    throw new ProviderError('Google 餐廳搜尋暫時無法使用，請稍後再試。');
  }
  const data = await response.json() as { places?: GooglePlace[] };
  const restaurants = (data.places ?? []).map(p => normalizeGoogle(p, input)).filter((r): r is Restaurant => r !== null && r.distance <= input.radius);
  return { source: 'google', restaurants, limited: (data.places?.length ?? 0) === 20 };
}
export interface OsmElement { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }
export function normalizeOsm(element: OsmElement, input: SearchInput): Restaurant | null {
  const tags = element.tags ?? {};
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (lat === undefined || lng === undefined || (!tags.name && !tags['name:zh'])) return null;
  const location = { lat, lng };
  const cuisines = classifyCuisine([], `${tags.cuisine ?? ''};${tags['diet:vegan'] === 'only' ? 'vegan' : ''};${tags['diet:vegetarian'] === 'only' ? 'vegetarian' : ''}`);
  return {
    id: `osm-${element.type}-${element.id}`, name: tags['name:zh'] || tags.name, cuisines, location,
    distance: distanceMeters(input, location), address: tags['addr:full'] || [tags['addr:city'], tags['addr:district'], tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join('') || '地址尚未提供',
    rating: null, reviewCount: null, priceLevel: null, priceText: null, openNow: null, hours: tags.opening_hours || null,
    source: 'osm', attributions: [], image: null, photo: null,
  };
}
export async function searchOsm(input: SearchInput, fetcher = fetch): Promise<SearchResponse> {
  const query = `[out:json][timeout:20];nwr["amenity"~"^(restaurant|fast_food|food_court)$"](around:${input.radius},${input.lat},${input.lng});out center tags;`;
  const response = await fetcher(process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ChiaShaLunchDecider/1.0' },
    body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new ProviderError('開放地圖目前忙碌中，請稍後重試，或縮小搜尋範圍。', 503);
  const data = await response.json() as { elements?: OsmElement[]; remark?: string };
  if (data.remark) throw new ProviderError('地圖搜尋逾時，請縮小範圍再試一次。', 503);
  const restaurants = (data.elements ?? []).map(e => normalizeOsm(e, input))
    .filter((r): r is Restaurant => r !== null && r.distance <= input.radius && (!input.cuisines.length || r.cuisines.some(c => input.cuisines.includes(c))))
    .sort((a, b) => a.distance - b.distance);
  // Some venues are mapped as both a building and a point.
  const unique = restaurants.filter((r, index) => !restaurants.slice(0, index).some(other => other.name === r.name && distanceMeters(r.location, other.location) < 35));
  return { source: 'osm', restaurants: unique.slice(0, 200), limited: unique.length > 200 };
}
