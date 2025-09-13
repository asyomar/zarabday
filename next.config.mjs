/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Ensures the native module is traced/copied for serverless functions
    serverComponentsExternalPackages: ["sharp"],
  },
};
export default nextConfig;
