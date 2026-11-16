import { ref } from 'vue';
export const offlineReady = ref(false), needRefresh = ref(false), pwaError = ref('');
let registration: ServiceWorkerRegistration | undefined;
let requested = false;
export async function updateApp(_reload: boolean) {
  if (!registration?.waiting) return;
  requested = true;
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
}
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (requested) location.reload(); });
  void navigator.serviceWorker.register('/sw.js').then(reg => {
    registration = reg;
    offlineReady.value = !!reg.active;
    needRefresh.value = !!reg.waiting;
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') {
          if (navigator.serviceWorker.controller) needRefresh.value = true;
          else offlineReady.value = true;
        }
      });
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && navigator.onLine) void reg.update().catch(() => {}); });
  }).catch(() => { pwaError.value = '离线缓存未就绪，请联网重试。'; });
}
