import { NextResponse, type NextRequest } from "next/server";

/**
 * Säkerhetsheaders för alla sidor.
 * CSP med nonce: endast egna skript (+ Next.js inline-skript med nonce) får köras.
 */
export function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  // https-uppgradering bara när sidan faktiskt nåddes över https (i drift sätter proxyn x-forwarded-proto).
  // Annars ber vi en mobil på http://192.168… att hämta CSS/JS över https, som inte finns – och sidan blir oformaterad.
  const https = req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    // Bilder: egna, data-URL (avatarer), API-Footballs logotyper/foton och nyhetsbilder över https
    `img-src 'self' data: blob: https:`,
    `font-src 'self'`,
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    ...(!dev && https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (!dev && https) res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return res;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|heroes/|icon.svg|sw.js|manifest.webmanifest).*)" }],
};
