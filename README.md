# 呷啥 CHIA SHÁ

繁體中文餐廳探索應用：取得目前位置、依 100–5,000 公尺半徑搜尋、複選中／台式、日式、西式、泰式、韓式與蔬食，設定最低星等與評論數，並從符合條件的餐廳隨機選一家。

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

## 部署至 Vercel

Vercel 使用 `vercel.json`，將 Vite 產出的 `dist` 交由 CDN 提供，`api/config.ts`、`api/restaurants.ts`、`api/photos.ts` 則以 Node.js 22 Functions 執行。函式設於東京區域，逾時上限為 30 秒。

1. 在 Vercel 匯入 GitHub 儲存庫，Framework Preset 使用 **Vite**，根目錄維持專案根目錄。
2. 在 Production（如需預覽功能也設定 Preview）加入敏感環境變數 `GOOGLE_PLACES_API_KEY` 和 `PHOTO_SIGNING_SECRET`。後者使用隨機產生的 32 位元組以上密鑰；同一環境的所有函式必須使用相同值。
3. 執行部署。也可在本機完成 `vercel login`、`vercel link` 與環境變數設定後執行 `vercel --prod`。
4. 使用正式 HTTPS 網址驗證 `/api/config` 回傳 `google`，再測試定位、餐廳搜尋及照片。使用金鑰的伺服器來源限制時，需符合實際 Vercel 部署的出口網路設定。

`.vercelignore` 排除 `.env`、本機紀錄、測試產物與相依套件；`.gitignore` 同時排除 `.vercel`。金鑰透過 Vercel 環境變數提供，不使用 `VITE_` 前綴。API 保留 `no-store`，照片簽章在不同函式實例間保持一致。未設定獨立簽章密鑰時，會從伺服器 Google 金鑰衍生專用簽章密鑰。

API 的記憶體限流為每個函式實例各自計算；跨實例的全站用量上限應由 Google Cloud 配額或 Vercel Firewall 管理。

## 餐廳資料

- **無金鑰：OpenStreetMap / Overpass**。可真實搜尋名稱、位置、料理類型與部分營業時間。不提供評分、價位或即時營業狀態，對應欄位明確留空，並停用相關篩選。公開 Overpass 服務可能較慢或限流；不應將它當成有服務保證的正式商業後端。
- **有金鑰：Google Places API (New)**。提供來源中可取得的評分、評價數、相對價位、價格區間與即時營業狀態。單次取得距離最近的最多 20 家，頁面會標示上限。價位、評分、營業狀態未提供時不推估。評分／價位篩選在這次取得的結果中執行；料理類型與半徑會重新向服務搜尋。
- **示範模式**。內附虛構餐廳、評分及價位，僅展示功能。定位拒絕或網路錯誤不會自動用示範資料替代真實搜尋。

### 啟用 Google 評分與價位

1. 在 Google Cloud 專案啟用計費及 **Places API (New)**。
2. 將 `.env.example` 複製成 `.env`。
3. 設定 `GOOGLE_PLACES_API_KEY=你的金鑰`，重新啟動伺服器。
4. 建議限制此金鑰只能使用 Places API，正式部署時限制伺服器來源 IP，並設定配額。金鑰僅供後端使用；不要使用 `VITE_` 前綴，不要提交 `.env`。

本程式使用特定 FieldMask，包含 `rating`、`userRatingCount`、`priceLevel`、`priceRange`、`currentOpeningHours`、`photos`，會涉及相應的 Google 計費層級。尚未加入評論全文。

### 真實店家照片

Google 搜尋會取得該店家第一張可用的 Places 照片，卡片、詳細資訊及隨機抽選皆使用同一張照片。照片可能是餐點、店內或外觀，不保證只包含料理。卡片保留作者標示與原始照片連結（來源有提供時）；詳細資訊會顯示完整作者資料與頭像。

- 圖片按需載入，照片讀取也會產生 Google Place Photos API 用量；僅取得目前顯示的卡片與開啟的詳細照片。
- `/api/photos` 在後端帶入金鑰，轉址至經驗證的 Google 圖片網域；瀏覽器不會取得 API 金鑰。
- 照片連結具有 15 分鐘的簽章有效期、每 IP 每分鐘 120 次限流，不在伺服器保存照片名稱或內容；API 回應不快取。Google 照片參照本身也可能過期，重新搜尋可更新連結。
- Google 未提供照片或照片載入失敗時顯示清楚的佔位提示，不以料理示意圖冒充店家照片。OpenStreetMap 模式也會顯示「尚無店家照片」。
- 示範模式仍使用明確標示的本機料理示意圖；首頁主視覺也屬裝飾照片。

官方文件：[Nearby Search](https://developers.google.com/maps/documentation/places/web-service/nearby-search)、[Place Photos](https://developers.google.com/maps/documentation/places/web-service/place-photos)、[設定 Places API](https://developers.google.com/maps/documentation/places/web-service/cloud-setup)、[欄位與計費](https://developers.google.com/maps/documentation/places/web-service/data-fields)、[歸屬標示](https://developers.google.com/maps/documentation/places/web-service/policies)、[Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)。

## 互動與資料處理

- 料理複選採 OR；不同篩選條件採 AND。距離使用 Haversine 直線距離，不冒充步行距離。
- 取得位置需要使用者主動操作及瀏覽器授權；也可選擇熱門街區或手動輸入經緯度。
- 即時搜尋具備 500ms debounce、過期請求取消、上游逾時與每 IP 每分鐘 20 次限流。
- 調整半徑及料理類型會搜尋；評分、評論數、預算、現在營業、文字及排序在已取得的資料中篩選。
- 最低星等可選 3.5、4.0、4.2、4.5、4.8 星；最低評論數可選 50、100、300、500、1,000 則，或各自不限。兩個門檻採 AND，包含剛好達標的餐廳；缺少對應資料的餐廳不通過已啟用的門檻。條件可個別移除或一起重設，清單、收藏與隨機抽選共用條件。OpenStreetMap 模式停用並清除這些條件。
- 「評分最高」同分時依評論數排序；「評論最多」同數時依星等、距離排序，缺少評論數的餐廳排在最後。
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
