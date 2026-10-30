import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  images: {
    loader: 'custom',
    loaderFile: './src/lib/cloudinary-loader.ts',
    deviceSizes: [390, 640, 828, 1080, 1440, 1920, 2560, 3840],
    imageSizes: [96, 192, 320],
    remotePatterns: process.env.CLOUDINARY_CLOUD_NAME ? [{ protocol: 'https', hostname: 'res.cloudinary.com', pathname: `/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/**` }] : [],
  },
  async redirects() {
    // Keep the public site and CMS on the configured production origin.
    // Exact host matching leaves local and preview domains unchanged.
    return [{
      source: '/:path*',
      has: [{ type: 'host', value: 'www\\.moe-navigation\\.com' }],
      destination: 'https://moe-navigation.com/:path*',
      permanent: true,
    }];
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
};
export default config;
