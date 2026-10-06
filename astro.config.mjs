// @ts-check
import process from "node:process";
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  // The Cloudflare adapter's Vite plugins run modules in workerd and break Vitest startup; skip it under Vitest.
  adapter: process.env.VITEST ? undefined : cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      ANTHROPIC_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      COACH_MODEL: envField.string({
        context: "server",
        access: "secret",
        optional: true,
        default: "claude-opus-5-5",
      }),
      // Comma-separated emails allowed to call the coaching try-it endpoint.
      COACH_TRY_EMAILS: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
