import net from 'node:net';

/**
 * Checks whether an IPv4 address belongs to a private, loopback, or link-local range.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IPv4 -> unsafe
  }

  const [a, b] = parts;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;

  // 10.0.0.0/8 (Private network)
  if (a === 10) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 100.64.0.0/10 (Shared address / CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 169.254.0.0/16 (Link-local / Cloud metadata: 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private network: 172.16.0.0 – 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 (Private network)
  if (a === 192 && b === 168) return true;

  // 198.18.0.0/15 (Benchmark testing)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
  if (a >= 224) return true;

  return false;
}

/**
 * Checks whether an IPv6 address is loopback, unique local, or link-local.
 */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // Loopback (::1)
  if (normalized === '::1' || normalized === '0000:0000:0000:0000:0000:0000:0000:0001') {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (normalized.startsWith('::ffff:')) {
    const v4Part = normalized.slice(7);
    if (net.isIPv4(v4Part)) {
      return isPrivateIPv4(v4Part);
    }
  }

  // Unique local addresses (fc00::/7 -> fc00:: through fdff::)
  if (/^f[cd][0-9a-f]{2}:/i.test(normalized)) {
    return true;
  }

  // Link-local addresses (fe80::/10 -> fe80:: through febf::)
  if (/^fe[89ab][0-9a-f]:/i.test(normalized)) {
    return true;
  }

  return false;
}

/**
 * Validates that a URL is a valid, public HTTP(S) URL to protect against SSRF and protocol smuggling.
 */
export function isSafePublicUrl(urlStr: unknown): boolean {
  if (typeof urlStr !== 'string' || !urlStr.trim()) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return false;
  }

  // Only allow standard http and https protocols
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  let hostname = parsed.hostname.toLowerCase();

  // Strip enclosing brackets for IPv6
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }

  // Disallow localhost or internal / cloud-metadata domain names
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal' ||
    hostname === 'metadata'
  ) {
    return false;
  }

  // Check IPv4
  if (net.isIPv4(hostname)) {
    return !isPrivateIPv4(hostname);
  }

  // Check IPv6
  if (net.isIPv6(hostname)) {
    return !isPrivateIPv6(hostname);
  }

  // Must contain at least one dot in hostname for public domain (e.g. "example.com", not "intranet")
  if (!hostname.includes('.')) {
    return false;
  }

  return true;
}
