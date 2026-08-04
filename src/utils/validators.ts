/**
 * Input validators — protect against SSRF and invalid URLs.
 */

const SAFE_IMAGE_REGEX = /^https:\/\/[^\s<>"'`{}|\\^[\]]+\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i;

const BLOCKED_HOSTS = [
  'localhost', '127.0.0.1', '0.0.0.0', '::1',
];
const BLOCKED_PREFIXES = ['192.168.', '10.', '172.16.', '169.254.'];

export function isSafeImageUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTS.includes(host)) return false;
    if (BLOCKED_PREFIXES.some(p => host.startsWith(p))) return false;
    if (host.endsWith('.local') || host.endsWith('.internal')) return false;
    return SAFE_IMAGE_REGEX.test(url);
  } catch {
    return false;
  }
}

export function isSafeHttpsUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTS.includes(host)) return false;
    if (BLOCKED_PREFIXES.some(p => host.startsWith(p))) return false;
    return true;
  } catch {
    return false;
  }
}
