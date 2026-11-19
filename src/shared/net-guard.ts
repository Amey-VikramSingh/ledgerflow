import { BlockList, isIP } from 'node:net';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';

/**
 * SSRF protection for outbound requests to tenant-supplied URLs (webhooks).
 *
 * Two layers:
 *  1. validateWebhookUrl() rejects obviously-internal URLs when an endpoint is
 *     registered (fast, friendly error).
 *  2. publicOnlyLookup() is used as the socket's DNS lookup at delivery time,
 *     so the address actually connected to is checked. This also defeats DNS
 *     rebinding (a hostname that resolves publicly at registration and to an
 *     internal address later) and redirects (which are not followed anyway).
 */

const blocked = new BlockList();
// IPv4 ranges that are not public unicast.
for (const [net, prefix] of [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
// IPv6 ranges that are not public unicast.
for (const [net, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['64:ff9b::', 96], // NAT64 (embeds IPv4)
  ['100::', 64], // discard
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

/** True if `ip` is a public unicast address (safe to send requests to). */
export function isPublicIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return false;
  if (family === 6) {
    // IPv4-mapped (::ffff:a.b.c.d) — judge the embedded IPv4 address.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped) return isPublicIp(mapped[1]!);
    return !blocked.check(ip, 'ipv6');
  }
  return !blocked.check(ip, 'ipv4');
}

const INTERNAL_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.lan'];

/**
 * Registration-time check. Returns a human-readable reason the URL is not
 * allowed, or null if it is acceptable. With allowPrivate (local dev) only the
 * scheme and embedded-credential rules apply.
 */
export function validateWebhookUrl(raw: string, opts: { allowPrivate: boolean }): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'must be a valid URL';
  }
  if (url.username || url.password) return 'must not contain credentials';
  if (opts.allowPrivate) {
    return url.protocol === 'https:' || url.protocol === 'http:' ? null : 'must use http or https';
  }
  if (url.protocol !== 'https:') return 'must use https';

  // URL keeps IPv6 literals in brackets.
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(host)) {
    return isPublicIp(host) ? null : 'must not point to a private or internal address';
  }
  if (host === 'localhost' || !host.includes('.') || INTERNAL_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    return 'must be a public hostname';
  }
  return null;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * Drop-in replacement for dns.lookup that fails unless EVERY address the
 * hostname resolves to is public. Used for the webhook delivery socket.
 */
export function publicOnlyLookup(
  hostname: string,
  options: { all?: boolean; family?: number | string } | number | undefined,
  callback: LookupCallback,
): void {
  const opts = typeof options === 'object' && options !== null ? options : {};
  dnsLookup(hostname, { all: true, family: (opts.family as number | undefined) ?? 0 }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = addresses as LookupAddress[];
    const bad = list.find((a) => !isPublicIp(a.address));
    if (list.length === 0 || bad) {
      const e: NodeJS.ErrnoException = new Error(
        `refusing to connect to ${hostname}: resolves to a non-public address`,
      );
      e.code = 'ENOTPUBLIC';
      return callback(e, []);
    }
    if (opts.all) return callback(null, list);
    return callback(null, list[0]!.address, list[0]!.family);
  });
}
