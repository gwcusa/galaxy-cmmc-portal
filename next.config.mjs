/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // ESLint is run separately in CI; skip during next build to avoid
    // the aria-query module resolution bug in eslint-plugin-jsx-a11y@6.10.2
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
