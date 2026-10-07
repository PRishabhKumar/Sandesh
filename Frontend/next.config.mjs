/** @type {import('next').NextConfig} */
const API_TARGET = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  // The browser only ever talks to this Next.js origin (relative URLs).
  // These rewrites forward REST and WebSocket traffic to the FastAPI server,
  // which keeps the app same-origin in the preview and in local development.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_TARGET}/api/:path*` },
      { source: "/uploads/:path*", destination: `${API_TARGET}/uploads/:path*` },
      { source: "/ws", destination: `${API_TARGET}/ws` },
    ];
  },
};

export default nextConfig;
