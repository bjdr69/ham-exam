// Service Worker for HAM Exam — 离线缓存题库与页面
// v4：缓存优先 + 短超时网络更新。
// 之前 network-first 在 GitHub Pages 国内访问不稳定时，会让请求挂起，
// 导致 TWA / 重开应用"卡在开始界面"。现改为缓存优先：任何请求先命中缓存
// 立即返回，再在后台静默拉取最新版；网络失败/超时绝不影响已有功能。
const CACHE = 'ham-exam-v4';
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './data/questions.json',
  './data/categories.json'
];

const NETWORK_TIMEOUT = 4000; // 后台网络更新超时（毫秒）

// 安装：预缓存核心资源；失败不阻塞安装（避免离线安装卡死）
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.allSettled(CORE.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存，接管所有客户端
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 请求：缓存优先。缓存命中立即返回；未命中或需要更新时，
// 拉取网络（带超时），成功则写入缓存。
// 网络挂起/失败绝不阻塞：直接回退缓存或返回错误（由页面兜底）。
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then((hit) => {
      // 后台更新：用新缓存替掉旧缓存（不阻塞响应）
      const update = () =>
        fetch(e.request)
          .then((resp) => {
            if (resp && resp.ok) {
              const clone = resp.clone();
              caches.open(CACHE).then((cache) => cache.put(e.request, clone));
            }
            return resp;
          })
          .catch(() => null);

      if (hit) {
        update(); // 已有缓存 → 立即返回，后台刷新
        return hit;
      }
      // 无缓存 → 拉网络（超时兜底），失败则拒绝（页面自行兜底）
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('network timeout')), NETWORK_TIMEOUT);
        fetch(e.request)
          .then((resp) => {
            clearTimeout(timer);
            if (resp && resp.ok) {
              const clone = resp.clone();
              caches.open(CACHE).then((cache) => cache.put(e.request, clone));
            }
            resolve(resp);
          })
          .catch((err) => { clearTimeout(timer); reject(err); });
      });
    })
  );
});
