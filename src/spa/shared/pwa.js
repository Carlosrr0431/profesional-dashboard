export function registerSpaServiceWorker(scope) {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  const register = () => {
    navigator.serviceWorker.register('/spa-sw.js', { scope }).catch(() => {});
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

function mediaMatches(query) {
  try {
    return Boolean(window.matchMedia && window.matchMedia(query).matches);
  } catch {
    return false;
  }
}

export function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    mediaMatches('(display-mode: standalone)')
    || mediaMatches('(display-mode: fullscreen)')
    || window.navigator.standalone,
  );
}

export function isIosSafari() {
  if (typeof window === 'undefined') return false;
  const ua = String(window.navigator.userAgent || '');
  const iOS = /iPad|iPhone|iPod/.test(ua)
    || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const notOther = !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
  return iOS && webkit && notOther;
}

let deferredPrompt = null;
const promptListeners = new Set();

export function initInstallPrompt() {
  if (typeof window === 'undefined' || window.__profesionalPwaPromptInit) return;
  window.__profesionalPwaPromptInit = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    promptListeners.forEach((fn) => fn(event));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    promptListeners.forEach((fn) => fn(null));
  });
}

export function subscribeInstallPrompt(callback) {
  initInstallPrompt();
  promptListeners.add(callback);
  callback(deferredPrompt);
  return () => promptListeners.delete(callback);
}

export function consumeInstallPrompt() {
  const event = deferredPrompt;
  deferredPrompt = null;
  promptListeners.forEach((fn) => fn(null));
  return event;
}
