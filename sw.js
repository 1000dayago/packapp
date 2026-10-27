// 서비스 워커 - 앱 파일을 폰에 보관해 오프라인에서도 열리게 함
// ※ 앱을 수정해 다시 올릴 때는 아래 VERSION 숫자를 올려야 폰이 새 버전으로 인식합니다.
const VERSION = '1';
const CACHE = 'packapp-' + VERSION;
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'lib/jszip.min.js', 'lib/xlsx.full.min.js', 'lib/tesseract/tesseract.min.js', 'lib/tesseract/worker.min.js'];
const HEAVY = ['lib/tesseract/tesseract-core-simd-lstm.wasm.js', 'lib/tesseract/tesseract-core-lstm.wasm.js', 'lib/tesseract/eng.traineddata.gz'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('packapp-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'skip') self.skipWaiting();
  if (d.type === 'warm') {
    e.waitUntil((async () => {
      const c = await caches.open(CACHE);
      for (const u of HEAVY) {
        try { if (!(await c.match(u))) await c.add(u); } catch (err) {}
      }
    })());
  }
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;           // 구글 시트 웹앱 등 외부 요청은 그대로 통과
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/');
  if (isPage) {                                           // 화면 파일은 인터넷이 되면 최신, 안 되면 보관본
    e.respondWith((async () => {
      try {
        const r = await fetch(req, { cache: 'no-cache' });
        const c = await caches.open(CACHE); c.put('index.html', r.clone());
        return r;
      } catch (err) {
        return (await caches.match('index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }
  e.respondWith((async () => {                            // 나머지는 보관본 우선
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r.ok) { const c = await caches.open(CACHE); c.put(req, r.clone()); }
      return r;
    } catch (err) { return Response.error(); }
  })());
});
