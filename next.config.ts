import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Sidor man nyss besökt visas direkt ur klientens cache (fram/tillbaka och menybyten känns omedelbara).
    // Chatten hämtar nya meddelanden själv, och tabellerna uppdateras bara någon gång i timmen.
    staleTimes: { dynamic: 30, static: 180 },
    serverActions: {
      // avatarer/nyhetsbilder skickas som komprimerade data-URL:er
      bodySizeLimit: "1mb",
    },
  },
  async headers() {
    return [
      {
        // statiska filer som inte går via middleware
        source: "/:path(sw.js|manifest.webmanifest|icon.svg)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      { source: "/sw.js", headers: [{ key: "Service-Worker-Allowed", value: "/" }, { key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default nextConfig;
