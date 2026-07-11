/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1280],
    imageSizes: [256, 320, 384, 480, 600, 780],
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
    NEXT_PUBLIC_OSRM_URL: process.env.NEXT_PUBLIC_OSRM_URL || process.env.OSRM_BASE_URL || '',
    NEXT_PUBLIC_NOMINATIM_URL: process.env.NEXT_PUBLIC_NOMINATIM_URL || process.env.NOMINATIM_BASE_URL || '',
    NEXT_PUBLIC_MAP_STYLE_URL: process.env.NEXT_PUBLIC_MAP_STYLE_URL || '',
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      || process.env.VITE_GOOGLE_MAPS_API_KEY
      || '',
  },
};

module.exports = nextConfig;
