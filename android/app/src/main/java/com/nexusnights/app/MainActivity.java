package com.nexusnights.app;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Optimize WebView settings for embedded media streaming and iframes
        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebView webView = this.bridge.getWebView();
            WebSettings settings = webView.getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            settings.setJavaScriptCanOpenWindowsAutomatically(true);

            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            cookieManager.setAcceptThirdPartyCookies(webView, true);

            // Install custom WebViewClient to bypass CORS and Cross-Origin-Resource-Policy (CORP)
            // for media streams, posters, and artworks from the live backend server.
            this.bridge.setWebViewClient(new NexusWebViewClient(this.bridge));
        }
    }

    private static class NexusWebViewClient extends BridgeWebViewClient {
        public NexusWebViewClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (uri != null) {
                String host = uri.getHost();
                String path = uri.getPath();
                String pathLower = path != null ? path.toLowerCase() : "";

                boolean isNexusHost = host != null && (host.contains("nexusunights.tech") || host.contains("nexusnights.tech"));
                boolean isMediaOrImage = pathLower.endsWith(".m3u8") || pathLower.endsWith(".ts") ||
                        pathLower.endsWith(".m4s") || pathLower.endsWith(".mp4") ||
                        pathLower.endsWith(".jpg") || pathLower.endsWith(".jpeg") ||
                        pathLower.endsWith(".png") || pathLower.endsWith(".webp") ||
                        pathLower.endsWith(".gif") || pathLower.endsWith(".svg") ||
                        pathLower.contains("/api/images/") || pathLower.contains("/stream-proxy/");

                if (isNexusHost || isMediaOrImage) {
                    String method = request.getMethod();

                    // Handle CORS preflight directly so no OPTIONS error ever occurs
                    if ("OPTIONS".equalsIgnoreCase(method)) {
                        Map<String, String> headers = new HashMap<>();
                        headers.put("Access-Control-Allow-Origin", "*");
                        headers.put("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD");
                        headers.put("Access-Control-Allow-Headers", "*");
                        headers.put("Access-Control-Max-Age", "86400");
                        return new WebResourceResponse("text/plain", "utf-8", 200, "OK", headers, new ByteArrayInputStream(new byte[0]));
                    }

                    // For GET and HEAD requests (all images, HLS manifests, video segments, subtitles)
                    // proxy natively to strip restrictive Helmet CORP headers and inject CORS
                    if ("GET".equalsIgnoreCase(method) || "HEAD".equalsIgnoreCase(method)) {
                        try {
                            URL url = new URL(uri.toString());
                            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                            conn.setRequestMethod(method);
                            conn.setConnectTimeout(15000);
                            conn.setReadTimeout(30000);
                            conn.setInstanceFollowRedirects(true);

                            // Copy request headers, but force uncompressed identity encoding
                            Map<String, String> reqHeaders = request.getRequestHeaders();
                            if (reqHeaders != null) {
                                for (Map.Entry<String, String> h : reqHeaders.entrySet()) {
                                    String k = h.getKey();
                                    if (!k.equalsIgnoreCase("Host") &&
                                        !k.equalsIgnoreCase("Origin") &&
                                        !k.equalsIgnoreCase("Accept-Encoding")) {
                                        conn.setRequestProperty(k, h.getValue());
                                    }
                                }
                            }
                            // Never accept gzip/brotli because WebResourceResponse does not decompress streams
                            conn.setRequestProperty("Accept-Encoding", "identity");
                            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14; NexusNight) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");

                            String cookies = CookieManager.getInstance().getCookie(uri.toString());
                            if (cookies != null && !cookies.isEmpty()) {
                                conn.setRequestProperty("Cookie", cookies);
                            }

                            conn.connect();

                            int status = conn.getResponseCode();

                            // Follow redirects manually if needed (e.g. cross-protocol HTTP -> HTTPS)
                            int redirectCount = 0;
                            while ((status == 301 || status == 302 || status == 303 || status == 307 || status == 308) && redirectCount < 5) {
                                String location = conn.getHeaderField("Location");
                                if (location == null) break;
                                conn.disconnect();
                                url = new URL(url, location);
                                conn = (HttpURLConnection) url.openConnection();
                                conn.setRequestMethod(method);
                                conn.setConnectTimeout(15000);
                                conn.setReadTimeout(30000);
                                conn.setInstanceFollowRedirects(true);
                                if (reqHeaders != null) {
                                    for (Map.Entry<String, String> h : reqHeaders.entrySet()) {
                                        String k = h.getKey();
                                        if (!k.equalsIgnoreCase("Host") &&
                                            !k.equalsIgnoreCase("Origin") &&
                                            !k.equalsIgnoreCase("Accept-Encoding")) {
                                            conn.setRequestProperty(k, h.getValue());
                                        }
                                    }
                                }
                                conn.setRequestProperty("Accept-Encoding", "identity");
                                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14; NexusNight) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");
                                conn.connect();
                                status = conn.getResponseCode();
                                redirectCount++;
                            }

                            InputStream is = (status >= 400) ? conn.getErrorStream() : conn.getInputStream();
                            if (is == null) {
                                is = new ByteArrayInputStream(new byte[0]);
                            }

                            String contentType = conn.getContentType();
                            String mimeType = "application/octet-stream";
                            String encoding = null; // Binary by default! Must be null for images and video segments!
                            if (contentType != null) {
                                String[] parts = contentType.split(";");
                                mimeType = parts[0].trim();
                                if (parts.length > 1 && parts[1].toLowerCase().contains("charset=")) {
                                    encoding = parts[1].split("=")[1].trim();
                                }
                            }

                            // Explicitly set MIME types based on file extension if unknown or generic
                            if (pathLower.endsWith(".m3u8")) {
                                mimeType = "application/vnd.apple.mpegurl";
                                encoding = "utf-8";
                            } else if (pathLower.endsWith(".ts")) {
                                mimeType = "video/mp2t";
                                encoding = null;
                            } else if (pathLower.endsWith(".jpg") || pathLower.endsWith(".jpeg")) {
                                mimeType = "image/jpeg";
                                encoding = null;
                            } else if (pathLower.endsWith(".png")) {
                                mimeType = "image/png";
                                encoding = null;
                            } else if (pathLower.endsWith(".webp")) {
                                mimeType = "image/webp";
                                encoding = null;
                            }

                            // For text-based formats only, ensure utf-8 if encoding not specified
                            if (encoding == null) {
                                String mtLower = mimeType.toLowerCase();
                                if (mtLower.startsWith("text/") ||
                                    mtLower.contains("json") ||
                                    mtLower.contains("javascript") ||
                                    mtLower.contains("mpegurl") ||
                                    mtLower.contains("xml")) {
                                    encoding = "utf-8";
                                }
                            }

                            Map<String, String> respHeaders = new HashMap<>();
                            for (Map.Entry<String, List<String>> header : conn.getHeaderFields().entrySet()) {
                                if (header.getKey() != null && !header.getValue().isEmpty()) {
                                    String key = header.getKey();
                                    // Strip blocking headers sent by server's Helmet default config
                                    if (!key.equalsIgnoreCase("Cross-Origin-Resource-Policy") &&
                                        !key.equalsIgnoreCase("Cross-Origin-Embedder-Policy") &&
                                        !key.equalsIgnoreCase("X-Frame-Options") &&
                                        !key.equalsIgnoreCase("Content-Encoding")) {
                                        respHeaders.put(key, header.getValue().get(0));
                                    }
                                }
                            }

                            // Inject permissive CORS and CORP headers so WebView NEVER blocks images or video fragments
                            respHeaders.put("Access-Control-Allow-Origin", "*");
                            respHeaders.put("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
                            respHeaders.put("Access-Control-Allow-Headers", "*");
                            respHeaders.put("Cross-Origin-Resource-Policy", "cross-origin");

                            List<String> cookiesList = conn.getHeaderFields().get("Set-Cookie");
                            if (cookiesList != null) {
                                for (String cookie : cookiesList) {
                                    CookieManager.getInstance().setCookie(uri.toString(), cookie);
                                }
                            }

                            String statusMsg = conn.getResponseMessage();
                            if (statusMsg == null || statusMsg.isEmpty()) {
                                statusMsg = (status == 200) ? "OK" : ((status == 206) ? "Partial Content" : "HTTP " + status);
                            }

                            return new WebResourceResponse(
                                mimeType,
                                encoding,
                                status,
                                statusMsg,
                                respHeaders,
                                is
                            );
                        } catch (Exception e) {
                            // Fall through to default handler if network error occurs
                        }
                    }
                }
            }
            return super.shouldInterceptRequest(view, request);
        }
    }
}
