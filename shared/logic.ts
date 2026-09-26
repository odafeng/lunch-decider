import type { Coordinates, Cuisine, Restaurant, SearchInput } from './types';

export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h))));
}
const allowedCuisines = new Set(['chinese', 'japanese', 'western', 'thai', 'korean', 'vegetarian', 'other']);
export function parseSearchInput(body: unknown): SearchInput {
  if (!body || typeof body !== 'object') throw new Error('請提供搜尋條件。');
  const { lat, lng, radius, cuisines = [] } = body as Record<string, unknown>;
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90 || typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error('請輸入有效的經緯度。');
  if (typeof radius !== 'number' || !Number.isFinite(radius) || radius < 100 || radius > 5000) throw new Error('搜尋半徑需介於 100 至 5,000 公尺。');
  if (!Array.isArray(cuisines) || cuisines.length > 7 || cuisines.some(c => !allowedCuisines.has(c))) throw new Error('料理類型無效。');
  return { lat, lng, radius, cuisines: [...new Set(cuisines)] as Cuisine[] };
}
export interface Filters {
  radius: number; cuisines: Cuisine[]; minRating: number; minReviewCount: number; prices: number[]; openOnly: boolean; query: string;
  sort: 'recommended' | 'distance' | 'rating' | 'reviewCount' | 'price';
}
export function filterRestaurants(restaurants: Restaurant[], filters: Filters): Restaurant[] {
  const result = restaurants.filter(r => r.distance <= filters.radius &&
    (!filters.cuisines.length || r.cuisines.some(c => filters.cuisines.includes(c))) &&
    (!filters.minRating || (r.rating !== null && r.rating >= filters.minRating)) &&
    (!filters.minReviewCount || (r.reviewCount !== null && r.reviewCount >= filters.minReviewCount)) &&
    (!filters.prices.length || (r.priceLevel !== null && filters.prices.includes(r.priceLevel))) &&
    (!filters.openOnly || r.openNow === true) &&
    (!filters.query.trim() || `${r.name} ${r.address}`.toLocaleLowerCase().includes(filters.query.trim().toLocaleLowerCase())));
  return result.sort((a, b) => {
    if (filters.sort === 'distance') return a.distance - b.distance;
    if (filters.sort === 'rating') return (b.rating ?? -1) - (a.rating ?? -1) || (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
    if (filters.sort === 'reviewCount') return (b.reviewCount ?? -1) - (a.reviewCount ?? -1) || (b.rating ?? -1) - (a.rating ?? -1) || a.distance - b.distance;
    if (filters.sort === 'price') return (a.priceLevel ?? Infinity) - (b.priceLevel ?? Infinity) || a.distance - b.distance;
    const score = (r: Restaurant) => (r.rating ?? 0) * 10 + Math.log10((r.reviewCount ?? 0) + 1) - r.distance / 1500;
    return score(b) - score(a);
  });
}
export function pickRestaurant(restaurants: Restaurant[], previousId?: string, random = Math.random): Restaurant | null {
  const pool = restaurants.length > 1 ? restaurants.filter(r => r.id !== previousId) : restaurants;
  return pool.length ? pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] : null;
}
export function formatDistance(meters: number): string {
  return meters < 1000 ? `${meters} 公尺` : `${(meters / 1000).toFixed(1)} 公里`;
}
export function directionsUrl(r: Restaurant, origin?: Coordinates): string {
  const params = new URLSearchParams({ api: '1', destination: `${r.location.lat},${r.location.lng}`, travelmode: 'walking' });
  if (origin) params.set('origin', `${origin.lat},${origin.lng}`);
  if (r.source === 'google') params.set('destination_place_id', r.id);
  return `https://www.google.com/maps/dir/?${params}`;
}
