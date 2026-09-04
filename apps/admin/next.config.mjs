/**
 * Transpiling workspace packages keeps the design system and SDK as source in
 * the monorepo — one build, no publish step, and a change to a shared component
 * is visible in every app immediately.
 *
 * `output: 'standalone'` produces a minimal server bundle for the container
 * image, which matters when this app is deployed to every region.
 */
/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@helix/ui', '@helix/sdk'],
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
      ],
    }];
  },
};
