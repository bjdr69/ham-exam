// Service Worker for HAM Exam — 离线缓存题库与页面
const CACHE = 'ham-exam-v3';
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './data/questions.json',
  './data/categories.json'
];

// 安装：预缓存核心资源
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 请求：网络优先 + 缓存兜底（题库文件走缓存优先，保证离线可用）
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 仅处理同源请求
  if (url.origin !== location.origin) return;

  // 题库 JSON：缓存优先（核心数据，必须离线可用）
  if (url.pathname.endsWith('/questions.json') || url.pathname.endsWith('/categories.json')) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request))
    );
    return;
  }

  // 其他资源：网络优先，失败回退缓存
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const clone = resp.clone();
        caches.open(CACHE).then((cache) => cache.put(e.request, clone));
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
