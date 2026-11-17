import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';

// Fully restore native XMLHttpRequest if CapacitorHttp patched it.
//
// WHY THIS IS NEEDED:
// Capacitor's native-bridge.js patches XMLHttpRequest.prototype.open to rewrite
// ALL external URLs through a proxy path: /_capacitor_http_interceptor_?u=<original>.
// This means hls.js sees responseURL as "https://localhost/_capacitor_http_interceptor_/..."
// and resolves relative URLs in m3u8 playlists against localhost instead of the real server.
// Segment requests then go to https://localhost/api/stream-proxy/segment?... which doesn't
// exist, causing fragLoadError → playback_failed → automatic failover to embed player.
//
// SOLUTION: Restore BOTH the constructor AND all prototype methods (open, send, abort, etc.)
// from CapacitorWebXMLHttpRequest where Capacitor saved the originals before patching.
// This only affects XHR (used by hls.js). The patched window.fetch is left intact so
// our API calls (which use fetch) still route through Capacitor's native HTTP bridge
// for POST requests that need CORS bypass.
if (typeof window !== 'undefined') {
  const cap = (window as any).CapacitorWebXMLHttpRequest;
  if (cap) {
    // 1. Restore original constructor so new XMLHttpRequest() creates native instances
    window.XMLHttpRequest = cap.fullObject || cap.constructor;

    // 2. Restore ALL prototype methods that Capacitor's native-bridge.js overwrote.
    //    The patched constructor re-patches prototype on every `new XMLHttpRequest()`,
    //    but since we restored the constructor above, the patched constructor is no
    //    longer called, so these restorations are permanent.
    const proto = XMLHttpRequest.prototype;
    if (cap.open) proto.open = cap.open;
    if (cap.send) proto.send = cap.send;
    if (cap.abort) proto.abort = cap.abort;
    if (cap.setRequestHeader) proto.setRequestHeader = cap.setRequestHeader;
    if (cap.getAllResponseHeaders) proto.getAllResponseHeaders = cap.getAllResponseHeaders;
    if (cap.getResponseHeader) proto.getResponseHeader = cap.getResponseHeader;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
