/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

// Run tests through Astro's Vite config so `astro:env/server` and other virtual modules resolve.
export default getViteConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
