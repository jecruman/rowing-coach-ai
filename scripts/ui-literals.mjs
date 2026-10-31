// UI literal scan: proves views migrated onto the design tokens stay off hardcoded colours, palette classes and arbitrary values.
// Zero dependencies on purpose. Runs as part of `npm run lint`; standalone: node scripts/ui-literals.mjs
// A view migrated off literals is added to ALLOWLIST in the same change.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new globalThis.URL("..", import.meta.url));

const ALLOWLIST = [
  "src/pages/dashboard.astro",
  "src/components/dashboard/DashboardView.astro",
  "src/components/AppNav.astro",
  "src/components/auth/ServerError.tsx",
  "src/pages/dev/kitchen-sink.astro",
  "src/pages/index.astro",
  "src/components/landing/LandingView.astro",
  "src/components/landing/ScullMotif.astro",
];

// The /10x-ui hardcoded-value scan: hex, rgb/hsl/oklch functions, arbitrary px/rem values, Tailwind palette classes.
const LITERAL =
  /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|-\[[0-9.]+(px|rem)\]|\b(bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/;

let hits = 0;
let missing = 0;
for (const file of ALLOWLIST) {
  let source;
  try {
    source = readFileSync(ROOT + file, "utf8");
  } catch {
    missing++;
    console.log(`${file}: missing — update the allowlist in scripts/ui-literals.mjs`);
    continue;
  }
  source.split(/\r?\n/).forEach((line, index) => {
    if (LITERAL.test(line)) {
      hits++;
      console.log(`${file}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (hits || missing) {
  console.log(
    `\nui-literals: ${hits} hardcoded value(s), ${missing} missing file(s) — use role tokens from src/styles/global.css`,
  );
  process.exit(1);
}
console.log(`ui-literals: ${ALLOWLIST.length} files clean`);
process.exit(0);
