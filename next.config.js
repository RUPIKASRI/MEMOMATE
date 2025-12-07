const withPWA = require("next-pwa")({
    dest: "public",
    register: true,
    skipWaiting: true,
  });
  
  /** @type {import('next').NextConfig} */
  const nextConfig = {
    reactStrictMode: true,
    turbopack: {}, // harmless, just silences turbopack warning if Next looks for it
  };
  
  module.exports = withPWA(nextConfig);
  