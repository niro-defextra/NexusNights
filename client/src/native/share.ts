import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

export async function shareContent(options: {
  title: string;
  text?: string;
  url: string;
  dialogTitle?: string;
}): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({
        title: options.title,
        text: options.text || options.title,
        url: options.url,
        dialogTitle: options.dialogTitle || 'مشاركة مع الأصدقاء',
      });
      return true;
    } catch (e: any) {
      if (e?.message?.includes('canceled') || e?.name === 'AbortError') {
        return false;
      }
      console.warn('[shareContent] Native share failed, fallback to web:', e);
    }
  }

  // Fallback to Web Share API or Clipboard
  if (navigator.share) {
    try {
      await navigator.share({
        title: options.title,
        text: options.text,
        url: options.url,
      });
      return true;
    } catch {
      // User cancelled
      return false;
    }
  }

  // Fallback to clipboard
  try {
    await navigator.clipboard.writeText(`${options.title} - ${options.url}`);
    return true;
  } catch {
    return false;
  }
}
