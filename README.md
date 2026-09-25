# 呷啥 CHIA SHÁ

繁體中文餐廳探索應用：取得目前位置、依 100–5,000 公尺半徑搜尋、複選中／台式、日式、西式、泰式、韓式與蔬食，並從符合條件的餐廳隨機選一家。

## 執行

需求：Node.js 22.12+。

```sh
npm install
npm run dev
```

開啟 http://127.0.0.1:5173 。Vite 前端將 `/api` 代理至本機 3001 埠。頁面初始進入明確標示的示範模式；按「使用我的位置」，或「更換位置」選擇地點，即搜尋真實餐廳。

```sh
npm run build
npm start
```

正式模式由同一個 Express 伺服器提供前端及 API，網址 http://127.0.0.1:3001 。外部部署請使用 HTTPS 反向代理；瀏覽器定位需要 HTTPS 或 localhost 安全環境。伺服器預設只監聽 loopback，不會自動開放到公網。

## 餐廳資料

- **無金鑰：OpenStreetMap / Overpass**。可真實搜尋名稱、位置、料理類型與部分營業時間。不提供評分、價位或即時營業狀態，對應欄位明確留空，並停用相關篩選。公開 Overpass 服務可能較慢或限流；不應將它當成有服務保證的正式商業後端。
- **有金鑰：Google Places API (New)**。提供來源中可取得的評分、評價數、相對價位、價格區間與即時營業狀態。單次取得距離最近的最多 20 家，頁面會標示上限。價位、評分、營業狀態未提供時不推估。評分／價位篩選在這次取得的結果中執行；料理類型與半徑會重新向服務搜尋。
- **示範模式**。內附虛構餐廳、評分及價位，僅展示功能。定位拒絕或網路錯誤不會自動用示範資料替代真實搜尋。

### 啟用 Google 評分與價位

1. 在 Google Cloud 專案啟用計費及 **Places API (New)**。
2. 將 `.env.example` 複製成 `.env`。
3. 設定 `GOOGLE_PLACES_API_KEY=你的金鑰`，重新啟動伺服器。
4. 建議限制此金鑰只能使用 Places API，正式部署時限制伺服器來源 IP，並設定配額。金鑰僅供後端使用；不要使用 `VITE_` 前綴，不要提交 `.env`。

本程式使用特定 FieldMask，包含 `rating`、`userRatingCount`、`priceLevel`、`priceRange`、`currentOpeningHours`，會涉及相應的 Google 計費層級。未加入評論全文及餐廳照片 API。卡片使用本機料理示意圖，並明確標示；不是店家照片。

官方文件：[Nearby Search](https://developers.google.com/maps/documentation/places/web-service/nearby-search)、[設定 Places API](https://developers.google.com/maps/documentation/places/web-service/cloud-setup)、[欄位與計費](https://developers.google.com/maps/documentation/places/web-service/data-fields)、[歸屬標示](https://developers.google.com/maps/documentation/places/web-service/policies)、[Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)。

## 互動與資料處理

- 料理複選採 OR；不同篩選條件採 AND。距離使用 Haversine 直線距離，不冒充步行距離。
- 取得位置需要使用者主動操作及瀏覽器授權；也可選擇熱門街區或手動輸入經緯度。
- 即時搜尋具備 500ms debounce、過期請求取消、上游逾時與每 IP 每分鐘 20 次限流。
- 調整半徑及料理類型會搜尋；評分、預算、現在營業、文字及排序在已取得的資料中篩選。
- 推薦排序公式：評分 × 10 + log10(評價數 + 1) − 距離公尺 / 1500；無評分時主要按距離。
- 隨機抽選涵蓋目前所有符合條件的結果（不僅已顯示的卡片）；再次抽選避開上一家。午餐／晚餐切換調整抽選文案，不代表店家供餐時段。
- 收藏只在 localStorage 保存店家識別碼，不快取 Google 評分等內容。收藏分頁顯示本次搜尋結果中符合條件的已收藏店家；跨搜尋保留記號，不跨裝置同步。
- 位置不寫入資料庫，不記錄請求內容；搜尋 API 回應使用 `Cache-Control: no-store`。
- 真實餐廳提供 Google Maps 步行導航外部連結；示範餐廳不提供虛構導航。
- 條款與隱私權說明位於頁尾，可直接開啟查看。

## 驗證

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

單元／API 測試涵蓋距離、邊界驗證、多重條件、缺失值、抽選、Google 與 OSM 轉換及錯誤；瀏覽器測試涵蓋桌面與手機流程、定位成功／拒絕、收藏持久化、真實 API 介面（模擬上游回應）、錯誤提示與圖片。Playwright 會啟動開發伺服器，或沿用已存在的 5173 服務。

## 技術與檔案

- React 19、TypeScript、Vite、Lucide 圖示
- Express 5、Google Places REST／OpenStreetMap Overpass
- `src/App.tsx`：互動介面、定位、篩選與抽選
- `src/styles.css`：桌面／手機響應式樣式
- `shared/logic.ts`：距離、篩選、驗證與抽選
- `server/providers.ts`：資料來源串接與欄位轉換
- `server/app.ts`：API、安全範圍、限流與正式靜態檔案

料理示意攝影來自 Unsplash（固定圖片已下載至 `public/images`）：

| 檔案 | 原始圖片 |
|---|---|
| hero.jpg | https://images.unsplash.com/photo-1546069901-ba9599a7e63c |
| chinese.jpg | https://images.unsplash.com/photo-1563245372-f21724e3856d |
| japanese.jpg | https://images.unsplash.com/photo-1579871494447-9811cf80d66c |
| western.jpg | https://images.unsplash.com/photo-1473093295043-cdd812d0e601 |
| thai.jpg | https://images.unsplash.com/photo-1562565652-a0d8f0c59eb4 |
| korean.jpg | https://images.unsplash.com/photo-1498654896293-37aacf113fd9 |
| vegetarian.jpg | https://images.unsplash.com/photo-1512621776951-a57141f2eefd |

介面字型為 Google Fonts 的 Noto Sans TC 與 DM Sans；載入失敗時會使用系統字型。
