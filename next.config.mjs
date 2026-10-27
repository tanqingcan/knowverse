/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["pg", "unpdf"],
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};
export default nextConfig;
