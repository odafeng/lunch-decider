import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, Smartphone, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Modal } from './Modal';

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function PwaControls() {
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [installing, setInstalling] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [registrationError, setRegistrationError] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const [updating, setUpdating] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const reloadRequested = useRef(false);
  function reloadAfterUpdate() {
    if (reloadRequested.current) { reloadRequested.current = false; window.location.reload(); }
  }
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onNeedReload: reloadAfterUpdate,
    onRegisteredSW(_url, registration) { registrationRef.current = registration; setRegistrationError(false); },
    onRegisterError() { setRegistrationError(true); },
  });

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // A worker installed during this visit can update before Workbox considers it an "update".
    // Reload only after this tab's user has explicitly accepted the new version.
    navigator.serviceWorker.addEventListener('controllerchange', reloadAfterUpdate);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', reloadAfterUpdate);
  }, []);

  useEffect(() => {
    const capturePrompt = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    const markInstalled = () => { setInstalled(true); setInstallPrompt(null); setShowGuide(false); };
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const onDisplayChange = () => setInstalled(isStandalone());
    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', markInstalled);
    displayMode.addEventListener('change', onDisplayChange);
    return () => {
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', markInstalled);
      displayMode.removeEventListener('change', onDisplayChange);
    };
  }, []);

  useEffect(() => {
    const checkUpdate = () => {
      if (navigator.onLine && document.visibilityState === 'visible') void registrationRef.current?.update().catch(() => {});
    };
    window.addEventListener('online', checkUpdate);
    document.addEventListener('visibilitychange', checkUpdate);
    const timer = window.setInterval(checkUpdate, 60 * 60 * 1000);
    return () => { window.removeEventListener('online', checkUpdate); document.removeEventListener('visibilitychange', checkUpdate); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!offlineReady) return;
    const timer = window.setTimeout(() => setOfflineReady(false), 6000);
    return () => window.clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  async function install() {
    if (!installPrompt) { setShowGuide(true); return; }
    setInstalling(true);
    try { await installPrompt.prompt(); await installPrompt.userChoice; }
    catch { setShowGuide(true); }
    finally { setInstallPrompt(null); setInstalling(false); }
  }

  async function update() {
    setUpdating(true); setUpdateError(false);
    reloadRequested.current = true;
    try {
      if (registrationRef.current?.waiting) await updateServiceWorker(true);
      else reloadAfterUpdate(); // Another tab may already have activated the waiting version.
    }
    catch { reloadRequested.current = false; setUpdateError(true); }
    finally { setUpdating(false); }
  }

  return <>
    {!installed && <button className="install-button" onClick={install} disabled={installing}><Download size={16}/><span>{installing ? '開啟安裝…' : '安裝 App'}</span></button>}
    {showGuide && <Modal title="安裝呷啥 App" onClose={() => setShowGuide(false)} className="info-modal install-modal">
      <span className="info-icon"><Smartphone/></span><h2>把呷啥放進主畫面</h2><p>下次想吃什麼，點一下就能開啟。</p>
      <ol><li><strong>iPhone／iPad</strong><p>用 Safari 開啟本頁，點「分享」→「加入主畫面」→「加入」。</p></li><li><strong>Android／電腦</strong><p>在 Chrome 或 Edge 的選單中選擇「安裝應用程式」或「加入主畫面」。若沒有此選項，請先用一般瀏覽器分頁開啟本頁。</p></li></ol>
      <div className="info-callout"><strong>離線也能打開</strong><p>首次連線載入完成後，可離線使用示範抽選。真實餐廳、評分與店家照片需要網路。</p>{registrationError && <p>目前無法準備離線功能，請連線後重新整理再試。</p>}</div>
      <button className="secondary-button" onClick={() => setShowGuide(false)}>知道了</button>
    </Modal>}
    {(needRefresh || offlineReady) && <aside className="pwa-notice" role="status" aria-live="polite">
      <p>{needRefresh ? '呷啥有新版本，更新後就能使用。' : '已可離線開啟；真實餐廳搜尋仍需網路。'}</p>
      {updateError && <p>更新暫時失敗，請確認網路後再試。</p>}
      <div>{needRefresh && <button className="primary-button" onClick={update} disabled={updating}><RefreshCw size={14}/>{updating ? '更新中…' : '立即更新'}</button>}<button className="text-button" onClick={() => { setNeedRefresh(false); setOfflineReady(false); setUpdateError(false); }}><X size={14}/>{needRefresh ? '稍後再說' : '知道了'}</button></div>
    </aside>}
  </>;
}
