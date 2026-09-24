import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// `base: "./"` keeps every asset path relative, so the same build works from a
// domain root or from a GitHub Pages project path. Routing is hash-based for
// the same reason: no host needs a rewrite rule.
export default defineConfig({
  base: "./",
  plugins: [react()],
  test: { environment: "node" }
});
