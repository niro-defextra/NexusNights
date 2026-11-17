import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

export function initDeepLinks(onAuthToken?: (token: string) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  const listener = CapApp.addListener('appUrlOpen', (data) => {
    try {
      const url = new URL(data.url);
      const host = url.host; // e.g. auth, movie, tv, room
      const pathname = url.pathname; // e.g. /callback, /123

      // 1. Handle OAuth callback: nexusnight://auth/callback?token=...
      if (host === 'auth' || pathname.startsWith('/auth')) {
        const token = url.searchParams.get('token');
        if (token && onAuthToken) {
          onAuthToken(token);
          window.location.hash = '#/';
          return;
        }
      }

      // 2. Handle room invite: nexusnights://room/ROOM_ID or ?room=ROOM_ID
      if (host === 'room' || pathname.startsWith('/room')) {
        const roomId = url.pathname.replace(/^\/room\/?/, '') || url.searchParams.get('room');
        if (roomId) {
          window.location.hash = `#/rooms?join=${encodeURIComponent(roomId)}`;
          return;
        }
      }

      // 3. Handle movie: nexusnights://movie/TMDB_ID
      if (host === 'movie' || pathname.startsWith('/movie')) {
        const id = url.pathname.replace(/^\/movie\/?/, '') || host;
        if (/^\d+$/.test(id)) {
          window.location.hash = `#/movie/${id}`;
          return;
        }
      }

      // 4. Handle tv series: nexusnights://tv/TMDB_ID
      if (host === 'tv' || pathname.startsWith('/tv')) {
        const id = url.pathname.replace(/^\/tv\/?/, '') || host;
        if (/^\d+$/.test(id)) {
          window.location.hash = `#/tv/${id}`;
          return;
        }
      }

      // 5. Fallback to hash if present in URL
      if (url.hash) {
        window.location.hash = url.hash;
      }
    } catch (e) {
      console.error('[initDeepLinks] Error parsing URL:', data.url, e);
    }
  });

  return () => {
    listener.then(handle => handle.remove()).catch(() => {});
  };
}
