import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

// `base: "./"` keeps every asset path relative, so the same build works from a
// domain root or from a GitHub Pages project path. Routing is hash-based for
// the same reason: no host needs a rewrite rule.
export default defineConfig({
  base: "./",
  // Shown in Settings > About.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react()],
  test: { environment: "node" }
});
