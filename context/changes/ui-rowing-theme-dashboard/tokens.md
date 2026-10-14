# Design tokens: Erg & Water

Source of values: this change's plan (`plan.md`, Phase 2), Erg & Water motif, decided 2026-10-14.
The values live in `src/styles/global.css` (`:root` and `.dark`); `@theme inline` only maps
`--color-*` to `var(--*)` and never holds raw colours.

- **Shipped theme:** dark, via `class="dark"` on `<html>` in `src/layouts/Layout.astro`.
- **Light theme:** `:root` values are defined but not shipped (no toggle).

## Motif

- **River-teal primary**: actions, links, focus ring.
- **Buoy-orange coach**: reserved for the coach's suggestion (`--coach` / `--coach-foreground`). Nothing else uses it.
- **Navy-water surfaces**: background, card, popover, secondary, muted are navy at different lightness steps.

## Accent vs coach rule

`--accent` is the hover background of shadcn `outline` / `ghost` buttons, so it stays a subtle
navy/teal tint. It must never be orange. The buoy-orange suggestion colour has its own role pair,
`--coach` / `--coach-foreground`, published through `@theme inline` as `--color-coach` /
`--color-coach-foreground` (`bg-coach`, `text-coach-foreground`).

## Values (oklch)

| Role                   | `.dark` (shipped)       | `:root` (defined, not shipped) |
| ---------------------- | ----------------------- | ------------------------------ |
| background             | `oklch(0.17 0.03 245)`  | `oklch(0.985 0.005 220)`       |
| foreground             | `oklch(0.96 0.01 230)`  | `oklch(0.21 0.04 245)`         |
| card / popover         | `oklch(0.22 0.035 245)` | `oklch(1 0 0)`                 |
| primary (river-teal)   | `oklch(0.72 0.12 195)`  | `oklch(0.50 0.10 200)`         |
| primary-foreground     | `oklch(0.18 0.03 245)`  | `oklch(0.99 0 0)`              |
| secondary              | `oklch(0.28 0.035 245)` | `oklch(0.95 0.01 220)`         |
| muted                  | `oklch(0.26 0.03 245)`  | `oklch(0.955 0.01 220)`        |
| muted-foreground       | `oklch(0.72 0.03 235)`  | `oklch(0.48 0.03 240)`         |
| accent (hover tint)    | `oklch(0.30 0.04 220)`  | `oklch(0.94 0.02 200)`         |
| destructive            | `oklch(0.70 0.19 25)`   | `oklch(0.577 0.245 27.325)`    |
| destructive-foreground | `oklch(0.98 0 0)`       | `oklch(0.98 0 0)`              |
| border                 | `oklch(1 0 0 / 12%)`    | `oklch(0.90 0.01 230)`         |
| input                  | `oklch(1 0 0 / 16%)`    | `oklch(0.90 0.01 230)`         |
| ring (teal)            | `oklch(0.78 0.13 195)`  | `oklch(0.55 0.10 200)`         |
| coach (buoy-orange)    | `oklch(0.78 0.16 60)`   | `oklch(0.70 0.17 55)`          |
| coach-foreground       | `oklch(0.20 0.04 50)`   | `oklch(0.22 0.05 45)`          |

Pairs not in the table: `--card-foreground`, `--popover-foreground`, `--secondary-foreground` and
`--accent-foreground` equal the theme's `foreground` value. Chart (`--chart-*`), sidebar
(`--sidebar-*`) and `--radius` tokens are unchanged from the shadcn defaults.

## Contrast log (filled in Phase 5)

Target: text pairs ≥ 4.5:1 (WCAG AA); ring vs background ≥ 3:1. Any lightness adjustment made to
reach a target is recorded here and mirrored in `global.css`.

Measured 2026-10-14 from the shipped `.dark` values in `src/styles/global.css` (oklch → sRGB → WCAG
relative luminance; translucent fills composited over `--card`). No adjustments were needed.

| Pair                                                     | Theme | Target | Measured | Adjustment |
| -------------------------------------------------------- | ----- | ------ | -------- | ---------- |
| foreground / background                                  | dark  | 4.5:1  | 17.04:1  | none       |
| foreground / card                                        | dark  | 4.5:1  | 15.41:1  | none       |
| muted-foreground / card                                  | dark  | 4.5:1  | 7.01:1   | none       |
| muted-foreground / background                            | dark  | 4.5:1  | 7.75:1   | none       |
| primary-foreground / primary                             | dark  | 4.5:1  | 7.97:1   | none       |
| primary (link text) / card                               | dark  | 4.5:1  | 7.33:1   | none       |
| destructive text / destructive 10% on card (ServerError) | dark  | 4.5:1  | 5.31:1   | none       |
| white / destructive 60% on card (destructive Button)     | dark  | 4.5:1  | 6.10:1   | none       |
| coach-foreground / coach                                 | dark  | 4.5:1  | 8.72:1   | none       |
| accent-foreground / accent (selected nav item)           | dark  | 4.5:1  | 12.03:1  | none       |
| ring / background                                        | dark  | 3:1    | 10.05:1  | none       |
| ring / card                                              | dark  | 3:1    | 9.09:1   | none       |

Light (`:root`) values are not shipped and were not measured; measure them in the change that ships a theme toggle.
