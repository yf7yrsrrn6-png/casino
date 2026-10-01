import type { NextConfig } from "next";
import path from "path";

const isDev = process.env.NODE_ENV !== "production";
const httpsSite = (process.env.APP_URL || "").startsWith("https://");

// Content-Security-Policy. AppKit/WalletConnect працюють через https/wss до своїх серверів і RPC,
// тому connect-src дозволяє https:/wss:. Скрипти — лише з власного домену.
// CSP_EXTRA_CONNECT — додаткові джерела (напр. локальний вузол http://127.0.0.1:8545 для e2e).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com https://fonts.reown.com",
  `connect-src 'self' https: wss:${isDev ? " ws: http://localhost:* http://127.0.0.1:*" : ""} ${process.env.CSP_EXTRA_CONNECT ?? ""}`.trim(),
  "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org https://secure.walletconnect.com https://secure.walletconnect.org https://secure-mobile.walletconnect.com https://secure-mobile.walletconnect.org",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(httpsSite ? ["upgrade-insecure-requests"] : []),
].join("; ");

// Необов'язкові залежності конекторів гаманців (Coinbase CDP / x402, React Native, логери) — не потрібні Loops Trd.
// Збірка йде через webpack (`next build --webpack`): Turbopack не дозволяє «вимкнути» модулі з іменованими експортами.
const optionalDeps = [
  "@react-native-async-storage/async-storage",
  "@x402/core/client",
  "@x402/evm",
  "@x402/evm/exact/client",
  "@x402/evm/upto/client",
  "@x402/svm/exact/client",
  "pino-pretty",
  "lokijs",
  "encoding",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
  outputFileTracingRoot: path.join(__dirname),
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, ...Object.fromEntries(optionalDeps.map((d) => [d, false])) };
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
      {
        source: "/api/(.*)",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
