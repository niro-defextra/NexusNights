import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

type BackHandler = () => boolean; // returns true if handled, false to continue down hierarchy

const backHandlers: BackHandler[] = [];
let lastBackPressTime = 0;

/**
 * Register a back button handler. Handlers are evaluated in LIFO (stack) order.
 * If a handler returns true, the back event is considered consumed.
 */
export function registerBackHandler(handler: BackHandler): () => void {
  backHandlers.push(handler);
  return () => {
    const idx = backHandlers.indexOf(handler);
    if (idx !== -1) {
      backHandlers.splice(idx, 1);
    }
  };
}

export function initBackButton(showExitToast?: (msg: string) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  const listener = CapApp.addListener('backButton', ({ canGoBack }) => {
    // 1. Check custom back handlers (modals, fullscreen player, dialogs)
    for (let i = backHandlers.length - 1; i >= 0; i--) {
      try {
        const handled = backHandlers[i]();
        if (handled) return;
      } catch (e) {
        console.error('[initBackButton] Handler error:', e);
      }
    }

    // 2. Check current route / hash
    const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0];
    const isHome = !hash || hash === '' || hash === '/';

    if (!isHome) {
      // If we are on a subpage (watch, title, providers, etc.), go back to home or history
      if (canGoBack && window.history.length > 1) {
        window.history.back();
      } else {
        window.location.hash = '#/';
      }
      return;
    }

    // 3. On home screen: double-press back to exit within 2 seconds
    const now = Date.now();
    if (now - lastBackPressTime < 2000) {
      CapApp.exitApp();
    } else {
      lastBackPressTime = now;
      if (showExitToast) {
        showExitToast('اضغط مرة أخرى للخروج من التطبيق');
      }
    }
  });

  return () => {
    listener.then(handle => handle.remove()).catch(() => {});
  };
}
