import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { KeepAwake } from '@capacitor-community/keep-awake';

let isScreenLockedWake = false;

export const screenManager = {
  /**
   * Called when entering video playback or fullscreen.
   * - Hides status bar
   * - Locks orientation to landscape (or sensor landscape)
   * - Prevents screen sleep
   */
  async enterVideoFullscreen(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await StatusBar.hide();
    } catch (e) {
      console.warn('[screenManager] StatusBar.hide failed:', e);
    }

    try {
      await ScreenOrientation.lock({ orientation: 'landscape' });
    } catch (e) {
      console.warn('[screenManager] ScreenOrientation lock failed:', e);
    }

    try {
      if (!isScreenLockedWake) {
        await KeepAwake.keepAwake();
        isScreenLockedWake = true;
      }
    } catch (e) {
      console.warn('[screenManager] KeepAwake failed:', e);
    }
  },

  /**
   * Called when exiting video playback or fullscreen.
   * - Restores status bar
   * - Unlocks orientation back to portrait / auto
   * - Releases wake lock
   */
  async exitVideoFullscreen(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await StatusBar.show();
      await StatusBar.setStyle({ style: Style.Dark });
    } catch (e) {
      console.warn('[screenManager] StatusBar.show failed:', e);
    }

    try {
      await ScreenOrientation.unlock();
      await ScreenOrientation.lock({ orientation: 'portrait' }).catch(() => {});
    } catch (e) {
      console.warn('[screenManager] ScreenOrientation unlock failed:', e);
    }

    try {
      if (isScreenLockedWake) {
        await KeepAwake.allowSleep();
        isScreenLockedWake = false;
      }
    } catch (e) {
      console.warn('[screenManager] KeepAwake allowSleep failed:', e);
    }
  },

  /**
   * Keep awake during playback without orientation lock (e.g. portrait preview).
   */
  async setKeepAwake(enable: boolean): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      if (enable && !isScreenLockedWake) {
        await KeepAwake.keepAwake();
        isScreenLockedWake = true;
      } else if (!enable && isScreenLockedWake) {
        await KeepAwake.allowSleep();
        isScreenLockedWake = false;
      }
    } catch (e) {
      console.warn('[screenManager] setKeepAwake failed:', e);
    }
  },
};
