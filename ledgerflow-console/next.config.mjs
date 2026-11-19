/**
 * Security headers on every response. The CSP here is deliberately limited to
 * directives that don't depend on Next.js's inline scripts:
 *  - frame-ancestors 'none' (+ X-Frame-Options for old browsers) stops other
 *    sites embedding the console to trick users into clicking (clickjacking);
 *  - base-uri / form-action / object-src close common injection footholds.
 */
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
export default nextConfig;
