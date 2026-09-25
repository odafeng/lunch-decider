export type Cuisine = 'chinese' | 'japanese' | 'western' | 'thai' | 'korean' | 'vegetarian' | 'other';
export type Source = 'demo' | 'google' | 'osm';
export interface Coordinates { lat: number; lng: number }
export interface Restaurant {
  id: string;
  name: string;
  cuisines: Cuisine[];
  address: string;
  location: Coordinates;
  distance: number;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: number | null;
  priceText: string | null;
  openNow: boolean | null;
  hours: string | null;
  source: Source;
  attributions: { name: string; url: string }[];
  image: string;
}
export interface SearchInput extends Coordinates { radius: number; cuisines: Cuisine[] }
export interface SearchResponse { source: Exclude<Source, 'demo'>; restaurants: Restaurant[]; limited: boolean }
export const CUISINES: { id: Cuisine; label: string; emoji: string; subtitle: string }[] = [
  { id: 'chinese', label: '中式・台式', emoji: '🥟', subtitle: '熟悉的好滋味' },
  { id: 'japanese', label: '日式料理', emoji: '🍣', subtitle: '日常的小確幸' },
  { id: 'western', label: '西式料理', emoji: '🍝', subtitle: '換個口味吧' },
  { id: 'thai', label: '泰式料理', emoji: '🍛', subtitle: '酸辣剛剛好' },
  { id: 'korean', label: '韓式料理', emoji: '🥘', subtitle: '一起開動吧' },
  { id: 'vegetarian', label: '蔬食料理', emoji: '🥗', subtitle: '清爽無負擔' },
];
export const CUISINE_IMAGES: Record<Cuisine, string> = {
  chinese: '/images/chinese.jpg', japanese: '/images/japanese.jpg', western: '/images/western.jpg',
  thai: '/images/thai.jpg', korean: '/images/korean.jpg', vegetarian: '/images/vegetarian.jpg', other: '/images/chinese.jpg',
};
