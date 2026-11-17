import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const DEFAULT_SERVER_URL = 'https://nexusunights.tech';
const SERVER_URL_KEY = 'nexusnight_server_url';

export const isNative = (): boolean => {
  try {
    if (Capacitor.isNativePlatform()) return true;
    if (typeof window !== 'undefined') {
      if ((window as any).Capacitor?.isNative) return true;
      if (window.location.protocol === 'capacitor:') return true;
      if (window.location.hostname === 'localhost' && !window.location.port) return true;
    }
  } catch {
    // ignore
  }
  return false;
};
export const getPlatform = (): string => Capacitor.getPlatform();

/**
 * Gets the base URL for API and Socket.IO requests.
 * In a standard browser, this returns '' so relative requests hit the same origin/proxy.
 * In native Android (Capacitor WebView), it returns the live backend server URL.
 */
export function getApiBaseUrl(): string {
  if (!isNative()) {
    return '';
  }
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }
  const stored = localStorage.getItem(SERVER_URL_KEY);
  if (stored) {
    return stored.replace(/\/+$/, '');
  }
  return DEFAULT_SERVER_URL;
}

/**
 * Storage adapter that uses Capacitor Preferences on native platforms
 * and falls back to window.localStorage in browsers.
 */
export const nativeStorage = {
  async get(key: string): Promise<string | null> {
    if (isNative()) {
      try {
        const { value } = await Preferences.get({ key });
        return value;
      } catch {
        return localStorage.getItem(key);
      }
    }
    return localStorage.getItem(key);
  },

  async set(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
    if (isNative()) {
      try {
        await Preferences.set({ key, value });
      } catch (e) {
        console.warn('[nativeStorage] Preferences.set failed:', e);
      }
    }
  },

  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
    if (isNative()) {
      try {
        await Preferences.remove({ key });
      } catch (e) {
        console.warn('[nativeStorage] Preferences.remove failed:', e);
      }
    }
  },

  async clear(): Promise<void> {
    localStorage.clear();
    if (isNative()) {
      try {
        await Preferences.clear();
      } catch (e) {
        console.warn('[nativeStorage] Preferences.clear failed:', e);
      }
    }
  },
};
