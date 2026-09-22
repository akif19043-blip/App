import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/WASM database drivers are loaded from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Migrations are read from disk at boot.
  outputFileTracingIncludes: { "/**": ["./db/migrations/*.sql"] },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // Camera + mic are needed by the host's studio, geolocation by the Paczkomat finder.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
