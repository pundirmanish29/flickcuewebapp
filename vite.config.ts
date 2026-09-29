import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

// `base: "./"` keeps every asset path relative, so the same build works from a
// domain root or from a GitHub Pages project path. Routing is hash-based for
// the same reason: no host needs a rewrite rule.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const PROXY = (env.VITE_PROXY_URL || "https://flickcue-proxy.manishpundir29.workers.dev").replace(/\/+$/, "");

/**
 * The page's security policy, as a meta tag (GitHub Pages can't send headers),
 * added to the built page only: the dev server needs inline scripts. Scripts
 * only from this site and Google's sign-in; images only from TMDB, Google
 * account photos and this site; requests only to Google and FlickCue's title
 * service. Injected script, if any got in, couldn't load more or send a token elsewhere.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "img-src 'self' data: https://image.tmdb.org https://*.googleusercontent.com",
  "font-src 'self'",
  `connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com ${PROXY}`,
  "frame-src https://www.youtube-nocookie.com https://accounts.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join("; ");

function securityPolicy(): Plugin {
  return {
    name: "flickcue-security-policy",
    apply: "build",
    transformIndexHtml: (html) => html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
  };
}

export default defineConfig({
  base: "./",
  // Shown in Settings > About.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), securityPolicy()],
  test: { environment: "node" }
});
