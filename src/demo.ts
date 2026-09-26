import { CUISINE_IMAGES, type Cuisine, type Restaurant } from '../shared/types';
import { distanceMeters } from '../shared/logic';

export const DEMO_CENTER = { lat: 25.0524, lng: 121.5206 };
const samples: [string, Cuisine, number, number, number, number, number, boolean, string][] = [
  ['小巷子・家常食堂', 'taiwanese', 25.0541, 121.5212, 4.7, 368, 1, true, '慢火燉煮，暖心上桌'],
  ['森川 もりかわ食堂', 'japanese', 25.0502, 121.5223, 4.8, 526, 2, true, '一份定食，剛好的幸福'],
  ['沐光 Pasta & Kitchen', 'western', 25.0535, 121.5172, 4.6, 281, 2, true, '把日子過成義式日常'],
  ['泰好・南洋小館', 'thai', 25.0488, 121.5231, 4.5, 192, 2, true, '今天來點酸酸辣辣'],
  ['青日子 Green Days', 'vegetarian', 25.0568, 121.5196, 4.9, 147, 2, true, '新鮮蔬食，自在好吃'],
  ['首爾小桌 서울', 'korean', 25.0484, 121.5163, 4.4, 309, 2, false, '熱騰騰的韓式家常味'],
  ['巷口牛肉麵', 'taiwanese', 25.0585, 121.5245, 4.3, 720, 1, true, '一碗熟悉的好味道'],
  ['一森 鮨與小料理', 'japanese', 25.0544, 121.5291, 4.8, 218, 3, false, '留一點時間，細細品嚐'],
  ['橄欖樹餐桌', 'western', 25.063, 121.528, 4.7, 165, 4, true, '與喜歡的人好好吃飯'],
  ['曼谷日常', 'thai', 25.069, 121.521, 4.2, 96, 1, true, '來一趟味蕾小旅行'],
  ['川味小院', 'chinese', 25.055, 121.525, 4.4, 426, 2, true, '一桌熱炒，香辣下飯'],
  ['港巷・茶餐廳', 'hongkong', 25.0508, 121.5182, 4.6, 238, 1, true, '港式飲茶，慢慢享用'],
  ['好日子・港式點心', 'hongkong', 25.0554, 121.5175, 4.4, 512, 2, true, '一盅兩件，剛剛好'],
];
export const DEMO_RESTAURANTS: Restaurant[] = samples.map(([name, cuisine, lat, lng, rating, reviewCount, priceLevel, openNow], i) => ({
  id: `demo-${i}`, name, cuisines: [cuisine], location: { lat, lng }, rating, reviewCount, priceLevel,
  priceText: ['免費', 'NT$ 100–200', 'NT$ 200–400', 'NT$ 400–800', 'NT$ 800 以上'][priceLevel],
  distance: distanceMeters(DEMO_CENTER, { lat, lng }), address: `示範地址・中山街區 ${i + 1} 號`,
  openNow, hours: openNow ? '示範營業時間 11:00–21:00' : '示範營業時間 17:30–22:00',
  source: 'demo', attributions: [], image: CUISINE_IMAGES[cuisine], photo: null,
}));
