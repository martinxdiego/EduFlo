const path = require('node:path');

const selfHostingConfig = process.env.VERCEL
  ? {}
  : {
      output: 'standalone',
    };

const nextConfig = {
  ...selfHostingConfig,
  // npm hoists workspace dependencies to the repository root. Vercel must be
  // allowed to trace those files when packaging each serverless function.
  outputFileTracingRoot: process.env.VERCEL
    ? path.join(__dirname, '..')
    : __dirname,
  outputFileTracingIncludes: {
    '/*': ['../node_modules/@swc/helpers/**/*'],
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['mongodb', 'pdf-parse', 'mammoth'],
  webpack(config, { dev }) {
    if (dev) {
      // Reduce CPU/memory from file watching
      config.watchOptions = {
        poll: 2000, // check every 2 seconds
        aggregateTimeout: 300, // wait before rebuilding
        ignored: ['**/node_modules'],
      };
    }
    return config;
  },
  onDemandEntries: {
    maxInactiveAge: 10000,
    pagesBufferLength: 2,
  },
  async headers() {
    // React Refresh relies on eval in webpack development builds. Keep the
    // production policy strict, but do not let the dev CSP disable hydration
    // and every client-side interaction during local QA.
    const scriptSrc = process.env.NODE_ENV === 'development'
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'"
    const securityHeaders = [
      { key: "Content-Security-Policy", value: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:;` },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    ]

    if (process.env.NODE_ENV === 'production') {
      securityHeaders.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" })
    }

    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
