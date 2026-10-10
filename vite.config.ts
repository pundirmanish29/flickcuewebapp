import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";
import { handlePublicProfile } from "./server/letterboxd-public.js";

// `base: "./"` keeps every asset path relative, so the same build works from a
// domain root or from a GitHub Pages project path. Routing is hash-based for
// the same reason: no host needs a rewrite rule.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const PROXY = (env.VITE_PROXY_URL || "https://api.flickcue.in").replace(/\/+$/, "");

/**
 * The page's security policy, as a meta tag (GitHub Pages can't send headers),
 * added to the built page only: the dev server needs inline scripts. Scripts
 * only from this site and Google's sign-in; images only from TMDB, Google
 * account photos, Letterboxd's image hosts, this site and the device itself (a ticket shown from its blob); requests only to Google and FlickCue's title
 * service. Injected script, if any got in, couldn't load more or send a token elsewhere.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "img-src 'self' data: blob: https://image.tmdb.org https://*.googleusercontent.com https://a.ltrbxd.com https://s.ltrbxd.com",
  "font-src 'self'",
  `connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com https://query.wikidata.org ${PROXY}`,
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

// Same public-data handler as the production Worker. No browser extension is
// needed in local development either. Only fixed Letterboxd profile paths.
function publicLetterboxd(): Plugin {
  return {
    name: "flickcue-public-letterboxd",
    configureServer(server) {
      const cache = new Map<string, { at: number; body: string }>();
      server.middlewares.use(async (req, res, next) => {
        const request = req as unknown as { url?: string; method?: string; headers: { origin?: string } };
        if (!request.url?.startsWith("/letterboxd-public/")) return next();
        const origin = request.headers.origin;
        if (origin && !["http://localhost:5173", "http://127.0.0.1:5173"].includes(origin)) { res.statusCode = 403; return res.end(); }
        if (request.method !== "GET") { res.statusCode = 405; return res.end(); }
        const name = request.url.slice("/letterboxd-public/".length);
        const saved = cache.get(name);
        res.setHeader("Content-Type", "application/json");
        if (saved && Date.now() - saved.at < 300_000) return res.end(saved.body);
        try {
          const response = await handlePublicProfile(name);
          const body = await response.text();
          res.statusCode = response.status;
          if (response.ok) { if (cache.size > 100) cache.clear(); cache.set(name, { at: Date.now(), body }); }
          res.end(body);
        } catch { res.statusCode = 502; res.end(JSON.stringify({ error: "Couldn't read the public profile. Try again later." })); }
      });
    }
  };
}

export default defineConfig({
  base: "./",
  // Shown in Settings > About.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), securityPolicy(), publicLetterboxd()],
  // Only this app's tests: a local nested checkout must not join the suite.
  test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"] }
});
