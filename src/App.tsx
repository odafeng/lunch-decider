import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDownUp, ArrowRight, ArrowUpRight, Check, ChevronDown, Clock3, Compass, Dice5, Heart, Leaf, LoaderCircle, LocateFixed, MapPin, Moon, Navigation, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Star, Sun, Utensils, X } from 'lucide-react';
import { CUISINES, type Coordinates, type Cuisine, type Restaurant, type SearchResponse } from '../shared/types';
import { directionsUrl, filterRestaurants, formatDistance, pickRestaurant, type Filters } from '../shared/logic';
import { DEMO_CENTER, DEMO_RESTAURANTS } from './demo';

type InfoPanel = 'help' | 'privacy' | 'terms' | null;
const priceLabels = ['免費', '$', '$$', '$$$', '$$$$'];
const cuisineLabel = (r: Restaurant) => r.cuisines.map(c => CUISINES.find(item => item.id === c)?.label ?? '其他料理').join('・');

function BowlLogo({ small = false }: { small?: boolean }) {
  return <span className={`bowl-logo ${small ? 'small' : ''}`} aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M7 19h26c0 11-5 17-13 17S7 30 7 19" fill="currentColor"/><path d="M13 13q-3-3 0-7m7 7q-3-3 0-7m7 7q-3-3 0-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/></svg></span>;
}

function Modal({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = oldOverflow; };
  }, []);
  return <dialog ref={ref} className={`modal ${className}`} aria-label={title} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <button className="icon-button modal-close" aria-label="關閉視窗" onClick={onClose}><X size={21}/></button>
    {children}
  </dialog>;
}

function RestaurantCard({ restaurant: r, saved, onSave, onDetails }: { restaurant: Restaurant; saved: boolean; onSave: () => void; onDetails: () => void }) {
  return <article className="restaurant-card">
    <div className="card-image">
      <button className="image-button" onClick={onDetails} aria-label={`查看 ${r.name} 詳細資訊`}><img src={r.image} alt={`${cuisineLabel(r)}料理示意`} loading="lazy"/></button>
      {r.openNow !== null && <span className={`open-badge ${r.openNow ? '' : 'closed'}`}><i/>{r.openNow ? '營業中' : '目前休息中'}</span>}
      <button className={`save-button ${saved ? 'saved' : ''}`} onClick={onSave} aria-label={`${saved ? '取消收藏' : '收藏'} ${r.name}`} aria-pressed={saved}><Heart size={19} fill={saved ? 'currentColor' : 'none'}/></button>
      <span className="image-caption">料理示意</span>
    </div>
    <div className="card-content">
      <span className="cuisine-label">{cuisineLabel(r)}</span>
      <h3><button onClick={onDetails}>{r.name}</button></h3>
      <div className="rating-line"><span className="rating"><Star size={14} fill="currentColor"/>{r.rating?.toFixed(1) ?? '尚無評分'}</span>{r.reviewCount !== null && <span className="review-count">({r.reviewCount.toLocaleString()} 則評價)</span>}<span className="price-level">{r.priceLevel !== null ? priceLabels[r.priceLevel] : '價位未提供'}</span></div>
      <div className="card-bottom"><span><MapPin size={14}/>{formatDistance(r.distance)}</span><span>{r.priceText ?? (r.priceLevel !== null ? ['免費', '平價', '中等價位', '較高價位', '精緻餐飲'][r.priceLevel] : '點選查看資訊')}<ArrowUpRight size={14}/></span></div>
    </div>
  </article>;
}

function loadFavorites(): string[] {
  try { const saved = JSON.parse(localStorage.getItem('chiasha-favorites') || '[]'); return Array.isArray(saved) ? saved.filter((id: unknown) => typeof id === 'string').slice(0, 500) : []; }
  catch { return []; }
}

export default function App() {
  const [meal, setMeal] = useState<'lunch' | 'dinner'>('lunch');
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [origin, setOrigin] = useState<Coordinates | null>(null);
  const [locationLabel, setLocationLabel] = useState('台北・中山站周邊');
  const [provider, setProvider] = useState<'google' | 'osm'>('osm');
  const [radius, setRadius] = useState(1000);
  const [radiusDraft, setRadiusDraft] = useState('1000');
  const [cuisines, setCuisines] = useState<Cuisine[]>([]);
  const [minRating, setMinRating] = useState(0);
  const [prices, setPrices] = useState<number[]>([]);
  const [openOnly, setOpenOnly] = useState(false);
  const [sort, setSort] = useState<Filters['sort']>('recommended');
  const [query, setQuery] = useState('');
  const [restaurants, setRestaurants] = useState<Restaurant[]>(DEMO_RESTAURANTS);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [locationError, setLocationError] = useState('');
  const [limited, setLimited] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  const [view, setView] = useState<'explore' | 'saved'>('explore');
  const [visibleCount, setVisibleCount] = useState(6);
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [picked, setPicked] = useState<Restaurant | null>(null);
  const [showLocation, setShowLocation] = useState(false);
  const [info, setInfo] = useState<InfoPanel>(null);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [toast, setToast] = useState('');
  const resultsRef = useRef<HTMLElement>(null);
  const cuisinesKey = cuisines.slice().sort().join(',');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/config', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => {
      if (data.provider === 'google' || data.provider === 'osm') setProvider(data.provider);
    }).catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (mode === 'demo') { setRestaurants(DEMO_RESTAURANTS); setLoading(false); setError(''); setLimited(false); return; }
    if (!origin) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setRestaurants([]); setLimited(false);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/restaurants', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...origin, radius, cuisines: cuisinesKey ? cuisinesKey.split(',') : [] }), signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '搜尋暫時無法使用。');
        if (!controller.signal.aborted) {
          const result = data as SearchResponse;
          setRestaurants(result.restaurants); setProvider(result.source); setLimited(result.limited);
        }
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '搜尋失敗，請再試一次。'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 500);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [mode, origin, radius, cuisinesKey, refresh]);

  useEffect(() => { setVisibleCount(6); setPicked(null); }, [radius, cuisinesKey, minRating, prices, openOnly, query, view, sort, mode, origin]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3000); return () => clearTimeout(timer); }, [toast]);

  const filtered = useMemo(() => filterRestaurants(restaurants, { radius, cuisines, minRating, prices, openOnly, query, sort })
    .filter(r => view !== 'saved' || favorites.includes(r.id)), [restaurants, radius, cuisinesKey, minRating, prices, openOnly, query, sort, view, favorites]);
  const savedInResults = restaurants.filter(r => favorites.includes(r.id)).length;
  const activeFilters = cuisines.length + prices.length + Number(!!minRating) + Number(openOnly);
  const source = mode === 'demo' ? 'demo' : provider;
  const unavailableFilters = mode === 'live' && provider === 'osm';
  const mealName = meal === 'lunch' ? '午餐' : '晚餐';

  function updateRadius(value: number) { const next = Math.max(100, Math.min(5000, Math.round(value))); setRadius(next); setRadiusDraft(String(next)); }
  function toggleCuisine(cuisine: Cuisine) { setCuisines(current => current.includes(cuisine) ? current.filter(c => c !== cuisine) : [...current, cuisine]); }
  function resetFilters() { setCuisines([]); setMinRating(0); setPrices([]); setOpenOnly(false); setQuery(''); updateRadius(1000); }
  function toggleFavorite(r: Restaurant) {
    const removing = favorites.includes(r.id);
    const next = removing ? favorites.filter(id => id !== r.id) : [...favorites, r.id].slice(-500);
    setFavorites(next);
    try { localStorage.setItem('chiasha-favorites', JSON.stringify(next)); setToast(removing ? '已取消收藏' : '已加入我的收藏'); }
    catch { setToast('已更新收藏；此瀏覽器無法儲存，下次開啟將不保留。'); }
  }
  function useLocation(coordinates: Coordinates, label: string) {
    setOrigin(coordinates); setLocationLabel(label); setMode('live'); setLocationError(''); setShowLocation(false);
    setSelected(null); setPicked(null); setView('explore');
    if (provider === 'osm') { setMinRating(0); setPrices([]); setOpenOnly(false); }
  }
  function locate() {
    if (!navigator.geolocation) { setLocationError('這個瀏覽器不支援定位，請改用「更換位置」手動選擇。'); return; }
    setLocating(true); setLocationError('');
    navigator.geolocation.getCurrentPosition(position => {
      setLocating(false);
      useLocation({ lat: position.coords.latitude, lng: position.coords.longitude }, '我的目前位置');
    }, failure => {
      setLocating(false);
      setLocationError(failure.code === 1 ? '尚未取得定位權限。請在瀏覽器允許位置存取，或手動選擇搜尋位置。' : failure.code === 3 ? '定位花了比較久，請再試一次，或手動選擇搜尋位置。' : '目前無法取得你的位置，請稍後重試或手動選擇搜尋位置。');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }
  function switchDemo() {
    setMode('demo'); setOrigin(null); setLocationLabel('台北・中山站周邊'); setLocationError(''); setView('explore'); resetFilters();
  }
  function scrollToResults(nextView: 'explore' | 'saved') { setView(nextView); resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  return <>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="#" aria-label="呷啥首頁"><BowlLogo/><span className="brand-name">呷啥<span>CHIA SHÁ</span></span></a>
      <nav aria-label="主選單"><button className={view === 'explore' ? 'nav-active' : ''} onClick={() => scrollToResults('explore')}>探索餐廳</button><button className={view === 'saved' ? 'nav-active' : ''} onClick={() => scrollToResults('saved')}>我的收藏{favorites.length > 0 && <span className="nav-count">{favorites.length}</span>}</button><button onClick={() => setInfo('help')}>使用說明</button></nav>
      <button className="header-location" onClick={locate} disabled={locating}>{locating ? <LoaderCircle size={16} className="spin"/> : <LocateFixed size={16}/>}<span>{locating ? '正在定位…' : '使用我的位置'}</span></button>
    </div></header>

    <main>
      <section className="hero"><div className="hero-inner">
        <div className="hero-copy"><div className="eyebrow"><span/> GOOD FOOD, GOOD MOOD</div>
          <h1>今天，<br/>想吃點<span className="hero-highlight">什麼？<svg viewBox="0 0 260 18" preserveAspectRatio="none" aria-hidden="true"><path d="M3 12 Q110 0 254 10"/></svg></span></h1>
          <p>別再為了吃什麼煩惱。<br/>從附近的好味道，找到今天的小確幸。</p>
          <div className="meal-picker" aria-label="選擇用餐時段"><button className={meal === 'lunch' ? 'active' : ''} aria-pressed={meal === 'lunch'} onClick={() => setMeal('lunch')}><Sun size={17}/>午餐靈感</button><button className={meal === 'dinner' ? 'active' : ''} aria-pressed={meal === 'dinner'} onClick={() => setMeal('dinner')}><Moon size={16}/>晚餐提案</button></div>
          <span className="hero-footnote"><Utensils size={13}/>好好吃飯，是每天最重要的小事。</span>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/>
          <span className="art-spark spark-one">✳</span><span className="art-spark spark-two">✧</span><span className="tiny-dot dot-one"/><span className="tiny-dot dot-two"/>
          <div className="hero-plate"><img src="/images/hero.jpg" alt=""/><span className="plate-rim"/></div>
          <div className="floating-note note-top"><span className="note-icon"><MapPin size={20}/></span><span>好味道<span>就在你附近</span></span><span className="note-check"><Check size={12}/></span></div>
          <div className="floating-note note-bottom"><span className="note-food">🥢</span><span>把選擇困難<span>交給我們就好。</span></span><Sparkles size={19}/></div>
          <div className="circle-stamp">LET’S EAT<span>一起<br/>好好吃飯</span>AND BE HAPPY</div>
        </div>
      </div></section>

      <div className="page-shell">
        <section className="location-bar" aria-label="搜尋位置"><div className="location-main"><span className="location-icon"><MapPin size={21}/></span><div><span className="location-caption">{mode === 'demo' ? '先探索一下這裡' : '從這裡開始找美食'}</span><div className="location-value">{locationLabel}<span className={`mode-badge ${mode === 'live' ? 'live' : ''}`}>{mode === 'demo' ? '示範模式' : '即時搜尋'}</span></div></div></div>
          <div className="location-actions"><button className="text-button" onClick={() => setShowLocation(true)}>更換位置<ChevronDown size={14}/></button><span className="bar-divider"/><button className="primary-button" disabled={loading || locating} onClick={mode === 'demo' ? locate : () => setRefresh(v => v + 1)}>{loading || locating ? <LoaderCircle className="spin" size={17}/> : <Search size={17}/>}<span>{loading ? '搜尋中…' : locating ? '定位中…' : '搜尋附近餐廳'}</span></button></div>
        </section>
        {locationError && <div className="error-banner" role="alert"><MapPin size={18}/><span>{locationError}</span><button onClick={() => setShowLocation(true)}>手動選擇位置</button></div>}

        <section className="cuisine-section" aria-labelledby="cuisine-heading"><div className="section-heading"><h2 id="cuisine-heading">今天想吃哪一種？<span>跟著心情，挑個喜歡的味道</span></h2><button className={`all-cuisines ${cuisines.length === 0 ? 'selected' : ''}`} onClick={() => setCuisines([])}>全部料理<ArrowRight size={15}/></button></div>
          <div className="cuisine-grid">{CUISINES.map(c => <button key={c.id} className={`cuisine-option ${cuisines.includes(c.id) ? 'selected' : ''}`} onClick={() => toggleCuisine(c.id)} aria-pressed={cuisines.includes(c.id)}><span className="cuisine-emoji" aria-hidden="true">{c.emoji}</span><span className="cuisine-option-text"><strong>{c.label}</strong><small>{c.subtitle}</small></span>{cuisines.includes(c.id) && <span className="cuisine-check"><Check size={11}/></span>}</button>)}</div>
        </section>

        <section className="explore-section" ref={resultsRef} aria-labelledby="results-heading">
          <aside className={`filter-panel ${mobileFilters ? 'expanded' : ''}`}><div className="filter-heading"><h2><SlidersHorizontal size={17}/>找你的理想一餐</h2><button onClick={resetFilters}>重設</button></div>
            <div className="filter-body">
              <div className="filter-group"><label className="filter-label" htmlFor="radius"><MapPin size={15}/>搜尋範圍<span className="range-value">{formatDistance(radius)}</span></label><input id="radius" className="radius-slider" type="range" min="100" max="5000" step="100" value={radius} style={{ '--range': `${(radius - 100) / 4900 * 100}%` } as React.CSSProperties} onChange={e => updateRadius(Number(e.target.value))}/><div className="range-labels"><span>100 公尺</span><span>5 公里</span></div><div className="radius-input"><input aria-label="搜尋半徑公尺數" type="number" min="100" max="5000" value={radiusDraft} onChange={e => setRadiusDraft(e.target.value)} onBlur={() => updateRadius(Number(radiusDraft) || 100)} onKeyDown={e => { if (e.key === 'Enter') { updateRadius(Number(radiusDraft) || 100); e.currentTarget.blur(); } }}/><span>公尺以內</span></div><p className="filter-hint">以搜尋位置為中心的直線距離</p></div>
              <div className={`filter-group ${unavailableFilters ? 'unavailable' : ''}`}><span className="filter-label"><span className="dollar-icon">$</span>用餐預算</span><div className="price-options">{[1, 2, 3, 4].map(price => <button key={price} disabled={unavailableFilters} className={prices.includes(price) ? 'active' : ''} aria-pressed={prices.includes(price)} aria-label={`價位 ${priceLabels[price]}`} onClick={() => setPrices(current => current.includes(price) ? current.filter(p => p !== price) : [...current, price])}>{priceLabels[price]}</button>)}</div><div className="range-labels"><span>輕鬆吃</span><span>吃好一點</span></div></div>
              <div className={`filter-group ${unavailableFilters ? 'unavailable' : ''}`}><label className="filter-label" htmlFor="rating"><Star size={15}/>餐廳評分</label><div className="select-wrap"><select id="rating" value={minRating} disabled={unavailableFilters} onChange={e => setMinRating(Number(e.target.value))}><option value="0">不限評分</option><option value="3.5">3.5 星以上</option><option value="4">4.0 星以上</option><option value="4.5">4.5 星以上</option></select><ChevronDown size={14}/></div></div>
              <div className={`open-filter ${unavailableFilters ? 'unavailable' : ''}`}><label htmlFor="open-now"><Clock3 size={15}/>只看現在營業</label><button id="open-now" className={`toggle ${openOnly ? 'on' : ''}`} role="switch" aria-checked={openOnly} aria-label="只看現在營業" disabled={unavailableFilters} onClick={() => setOpenOnly(v => !v)}><span/></button></div>
              {unavailableFilters && <p className="availability-note">開放地圖未提供評分、價位及即時營業狀態，因此暫不開放這些篩選。</p>}
              <div className="filter-tip"><span>💡</span><p>偶爾跳脫習慣，<br/>下一家愛店也許就在轉角。</p></div>
            </div>
          </aside>

          <div className="results-area"><div className="results-heading"><div><div className="results-eyebrow">YOUR NEXT GOOD MEAL</div><h2 id="results-heading">{view === 'saved' ? '我的口袋名單' : '附近的好味道'}<span>{filtered.length} 家</span></h2></div><div className="sort-wrap"><ArrowDownUp size={14}/><select aria-label="餐廳排序" value={sort} onChange={e => setSort(e.target.value as Filters['sort'])}><option value="recommended">推薦排序</option><option value="distance">距離最近</option><option value="rating">評分最高</option><option value="price">價位由低到高</option></select><ChevronDown size={13}/></div></div>

            <div className="decision-banner"><div className="dice-tile"><Dice5 size={29}/></div><div><h3>選擇困難？讓命運上菜。</h3><p>從符合條件的餐廳中，抽一間今天的{mealName}！</p></div><button onClick={() => setPicked(pickRestaurant(filtered))} disabled={loading || filtered.length === 0}><Sparkles size={16}/>幫我選一家<ArrowRight size={15}/></button></div>

            <div className="results-toolbar"><div className="result-tabs" aria-label="結果類別"><button onClick={() => setView('explore')} className={view === 'explore' ? 'active' : ''}>所有餐廳</button><button onClick={() => setView('saved')} className={view === 'saved' ? 'active' : ''}><Heart size={13}/>已收藏{savedInResults > 0 && <span>{savedInResults}</span>}</button></div><label className="keyword-search"><Search size={15}/><input type="search" placeholder="搜尋餐廳名稱" aria-label="搜尋目前結果中的餐廳" value={query} onChange={e => setQuery(e.target.value)}/></label><button className="mobile-filter-toggle" onClick={() => setMobileFilters(v => !v)} aria-expanded={mobileFilters}><Settings2 size={17}/>{activeFilters || '篩選'}</button></div>

            <div className={`source-note ${source}`}>
              {source === 'demo' ? <><span className="source-dot"/><span>示範餐廳與評價，非真實店家。<button onClick={locate} disabled={locating}>開啟定位，探索真實美食<ArrowUpRight size={12}/></button></span></> : source === 'google' ? <><span className="google-attribution" translate="no">Google Maps</span><span>提供餐廳資料・距離為直線估算</span></> : <><Leaf size={14}/><span>餐廳資料 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> 貢獻者・未提供評分與價位</span></>}
            </div>
            {view === 'saved' && <p className="saved-note">顯示這次搜尋範圍內的收藏。收藏記號會保留在這台裝置。</p>}
            {cuisines.length > 0 && <div className="active-cuisines">{cuisines.map(c => <button key={c} onClick={() => toggleCuisine(c)}>{CUISINES.find(item => item.id === c)?.label}<X size={12}/></button>)}</div>}
            <div aria-live="polite" aria-busy={loading}>
              {loading ? <><div className="loading-caption"><LoaderCircle className="spin" size={16}/>正在尋找附近的好味道…</div><div className="restaurant-grid">{Array.from({ length: 6 }, (_, i) => <div className="skeleton-card" key={i}><div/><span/><span/><span/></div>)}</div></> : error ? <div className="empty-state"><Compass size={36}/><h3>這次搜尋沒有順利送達</h3><p>{error}</p><div><button className="primary-button" onClick={() => setRefresh(v => v + 1)}>再試一次</button><button className="secondary-button" onClick={switchDemo}>先看看示範</button></div></div> : filtered.length ? <div className="restaurant-grid">{filtered.slice(0, visibleCount).map(r => <RestaurantCard key={r.id} restaurant={r} saved={favorites.includes(r.id)} onSave={() => toggleFavorite(r)} onDetails={() => setSelected(r)}/>)}</div> : <div className="empty-state"><span className="empty-emoji">{view === 'saved' ? '🤍' : '🍽️'}</span><h3>{view === 'saved' ? '這裡還沒有你的口袋名單' : '這個範圍還沒找到合適的餐廳'}</h3><p>{view === 'saved' ? '點一下餐廳上的愛心，留給下一次的好好吃飯。' : '試試放寬篩選條件、擴大搜尋範圍，或換個位置。'}</p><button className="secondary-button" onClick={() => { resetFilters(); setView('explore'); }}>{view === 'saved' ? '探索附近餐廳' : '重設篩選條件'}</button></div>}
            </div>
            {!loading && filtered.length > visibleCount && <button className="load-more" onClick={() => setVisibleCount(count => count + 6)}>再多看幾家<span>還有 {filtered.length - visibleCount} 家好味道</span><ChevronDown size={15}/></button>}
            {limited && <p className="result-footnote">{source === 'google' ? '本次最多取得 Google 距離最近的 20 家餐廳' : '本次最多顯示 200 家餐廳'}；可調整料理類型與範圍重新搜尋。</p>}
            <p className="result-footnote">{sort === 'recommended' ? '推薦排序綜合評分、評價數與距離。' : ''}餐點圖片為料理示意，實際菜色與營業資訊請向店家確認。</p>
          </div>
        </section>
        <section className="bottom-note"><span>✳</span><p>生活可以很忙，<strong>吃飯值得好好選。</strong></p><span>✳</span></section>
      </div>
    </main>

    <footer><div className="footer-inner"><a className="footer-brand" href="#"><BowlLogo small/>呷啥<span>讓每一餐，都有好主意。</span></a><div><button onClick={() => setInfo('privacy')}>隱私權政策</button><button onClick={() => setInfo('terms')}>使用條款</button><span>Made for your next meal.</span></div></div></footer>
    {toast && <div className="toast" role="status"><Check size={16}/>{toast}</div>}

    {showLocation && <LocationModal onClose={() => setShowLocation(false)} onSelect={useLocation} onLocate={locate} locating={locating} current={origin ?? DEMO_CENTER} locationError={locationError}/>}
    {(selected || picked) && <Modal title={picked ? `今天${mealName}就吃這家` : '餐廳詳細資訊'} onClose={() => { setSelected(null); setPicked(null); }} className={`restaurant-modal ${picked ? 'picked-modal' : ''}`}>
      {(() => { const r = (picked || selected)!; return <>
        {picked && <div className="pick-title"><Sparkles size={20}/><p>今天{mealName}就吃這家！</p><span>不糾結，出發吃點好的。</span></div>}
        <div className="detail-image"><img src={r.image} alt={`${cuisineLabel(r)}料理示意`}/><span>料理示意圖片</span></div>
        <div className="detail-content"><span className="cuisine-label">{cuisineLabel(r)}</span><h2>{r.name}</h2>
          <div className="detail-facts"><span><Star size={16} fill="currentColor"/>{r.rating?.toFixed(1) ?? '尚無評分'}{r.reviewCount !== null && <small>（{r.reviewCount} 則）</small>}</span><span>{r.priceText || (r.priceLevel !== null ? priceLabels[r.priceLevel] : '價位未提供')}</span></div>
          <p><MapPin size={17}/>{r.address}</p><p><Navigation size={17}/>直線距離 {formatDistance(r.distance)}</p><p><Clock3 size={17}/>{r.openNow === true ? '目前營業中' : r.openNow === false ? '目前休息中' : '尚無即時營業資訊'}</p>
          {r.hours && <details><summary>查看營業時間</summary><p className="hours-text">{r.hours}</p></details>}
          {r.source === 'demo' && <div className="detail-demo">這是虛構的示範餐廳，評分與價位僅用來體驗功能。使用你的位置，即可搜尋真實餐廳。</div>}
          {r.source === 'google' && <div className="detail-attribution"><span className="google-attribution" translate="no">Google Maps</span>{r.attributions.map((a, i) => <a key={i} href={/^https?:\/\//.test(a.url) ? a.url : undefined} target="_blank" rel="noreferrer">{a.name}</a>)}</div>}
          {r.source === 'osm' && <p className="detail-attribution">資料 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap 貢獻者</a></p>}
          <div className="detail-actions">{r.source === 'demo' ? <button className="primary-button" onClick={() => { setPicked(null); setSelected(null); locate(); }} disabled={locating}><LocateFixed size={16}/>找我附近的真實餐廳</button> : <a className="primary-button" href={directionsUrl(r, origin ?? undefined)} target="_blank" rel="noreferrer"><Navigation size={16}/>出發，帶我去<ArrowUpRight size={16}/></a>}<button className={`secondary-button ${favorites.includes(r.id) ? 'is-saved' : ''}`} onClick={() => toggleFavorite(r)} aria-label={favorites.includes(r.id) ? '取消收藏這家餐廳' : '收藏這家餐廳'}><Heart size={18} fill={favorites.includes(r.id) ? 'currentColor' : 'none'}/></button></div>
          {picked && <button className="pick-again" disabled={filtered.length < 2} onClick={() => setPicked(pickRestaurant(filtered, r.id))}><Dice5 size={17}/>{filtered.length < 2 ? '符合條件的餐廳只有這一家' : '再幫我選一次'}</button>}
        </div></>; })()}
    </Modal>}
    {info && <Modal title={info === 'help' ? '使用說明' : info === 'privacy' ? '隱私權政策' : '使用條款'} onClose={() => setInfo(null)} className="info-modal"><span className="info-icon">{info === 'help' ? <Utensils/> : <ShieldCheck/>}</span><h2>{info === 'help' ? '下一餐，交給呷啥。' : info === 'privacy' ? '你的隱私，我們在意。' : '使用條款'}</h2>
      {info === 'help' ? <><ol><li><strong>從你的位置出發</strong><p>按「使用我的位置」並允許瀏覽器定位，也可以手動選擇地點或輸入經緯度。</p></li><li><strong>挑選今天的口味</strong><p>料理類型可複選，半徑可設定 100–5,000 公尺。調整後會自動更新搜尋結果。</p></li><li><strong>讓命運幫你上菜</strong><p>「幫我選一家」會從目前所有符合條件的結果等機率選出一家，再抽一次會避開上一家。</p></li></ol><div className="info-callout"><strong>關於餐廳資訊</strong><p>示範模式使用虛構店家。真實搜尋目前使用{provider === 'google' ? ' Google Maps，提供來源中可取得的評分、價位與營業資訊' : ' OpenStreetMap，未提供評分、價位及即時營業資訊'}。價位是相對分級，並非固定金額。午餐／晚餐切換用於抽選文案，不代表店家供餐時段；營業篩選以當下狀態為準。</p></div><button className="secondary-button" onClick={() => { switchDemo(); setInfo(null); }}>體驗示範模式</button></> : info === 'privacy' ? <><p>只有在你點選定位按鈕並授權後，我們才會讀取瀏覽器提供的位置，用來搜尋周邊餐廳。你也可以手動設定位置。</p><p>搜尋座標及條件會傳送至本站伺服器，以及當次使用的 Google Places 或 OpenStreetMap Overpass 服務。應用程式不將位置寫入資料庫。收藏僅將店家識別碼存放在你裝置的瀏覽器中。</p><p>開啟 Google Maps 導航時，出發地及目的地會傳送給 Google。你可以在瀏覽器設定撤銷定位權限或清除網站資料。</p><p>第三方服務適用 <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google 隱私權政策</a>及 <a href="https://osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noreferrer">OpenStreetMap 隱私權政策</a>。</p></> : <><p>呷啥提供餐廳探索與隨機選擇工具。店家資料、價格、評分與營業時間可能缺漏或變更，請在出發前向店家確認。直線距離不代表實際步行路線。</p><p>示範模式的店名、評分及價位皆為虛構，圖片僅為料理示意。收藏保留在同一瀏覽器中，不跨裝置同步。</p><p>使用 Google 餐廳資料及導航時，亦適用 <a href="https://maps.google.com/help/terms_maps/" target="_blank" rel="noreferrer">Google Maps／Google Earth 附加服務條款</a>。開放地圖資料依 <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Open Database License</a> 提供。</p></>}
    </Modal>}
  </>;
}

function LocationModal({ onClose, onSelect, onLocate, locating, current, locationError }: { onClose: () => void; onSelect: (coords: Coordinates, label: string) => void; onLocate: () => void; locating: boolean; current: Coordinates; locationError: string }) {
  const [lat, setLat] = useState(String(current.lat));
  const [lng, setLng] = useState(String(current.lng));
  return <Modal title="選擇搜尋位置" onClose={onClose} className="location-modal"><span className="info-icon"><MapPin/></span><h2>從哪裡開始找美食？</h2><p>使用目前位置，或選一個準備前往的地方。</p><button className="locate-modal-button" onClick={onLocate} disabled={locating}>{locating ? <LoaderCircle className="spin" size={19}/> : <LocateFixed size={19}/>}<span>{locating ? '正在取得位置…' : '使用我的目前位置'}</span><ArrowRight size={18}/></button>
    {locationError && <p role="alert" className="inline-error">{locationError}</p>}
    <h3>熱門散步街區</h3><div className="preset-locations">{[{ name: '台北・中山站', lat: 25.0524, lng: 121.5206 }, { name: '台中・草悟道', lat: 24.1513, lng: 120.6631 }, { name: '高雄・中央公園', lat: 22.6247, lng: 120.3006 }].map(place => <button key={place.name} onClick={() => onSelect({ lat: place.lat, lng: place.lng }, place.name)}><MapPin size={14}/>{place.name}</button>)}</div>
    <form onSubmit={e => { e.preventDefault(); if (lat.trim() && lng.trim()) onSelect({ lat: Number(lat), lng: Number(lng) }, '自訂搜尋位置'); }}><h3>或輸入精確位置</h3><div className="coordinate-inputs"><label>緯度<input type="number" step="any" min="-90" max="90" required value={lat} onChange={e => setLat(e.target.value)}/></label><label>經度<input type="number" step="any" min="-180" max="180" required value={lng} onChange={e => setLng(e.target.value)}/></label></div><button className="primary-button" type="submit"><Search size={16}/>搜尋這個位置</button></form><p className="location-privacy"><ShieldCheck size={13}/>位置只用於搜尋附近餐廳，不儲存定位紀錄。</p>
  </Modal>;
}
