# Design tokens: landing page

This change adds one token, `--font-display`, and reuses the existing colour tokens unchanged.

## Display font

| Field   | Value                                                                      |
| ------- | -------------------------------------------------------------------------- |
| Font    | Archivo Variable (weight axis 100–900)                                     |
| Package | `@fontsource-variable/archivo` 5.3.0, self-hosted                          |
| Licence | OFL-1.1                                                                    |
| Size    | 35 KB (34,928 bytes) for the Latin file, `archivo-latin-wght-normal.woff2` |
| Import  | `@fontsource-variable/archivo/wght.css`, from `src/pages/index.astro` only |

The value lives in `:root` in `src/styles/global.css` as `--font-display-family`, with a system
fallback. `@theme inline` publishes it as `--font-display`, which creates the `font-display` utility.
It is not theme-dependent, so `.dark` doesn't override it.

### Why this font, and why landing-only

- The page has no photos, so type carries the first impression.
- Signed-in rowers are redirected past this page, so the app keeps the system font and the download
  only reaches signed-out visitors.
- Browsers fetch a web font only when rendered text uses it, and only pages that import the
  stylesheet declare the face.

### Usage rule

Use `font-display` for landing page display text only: headlines, the product name and the step numerals. Don't apply it to body text or to app views, and don't hardcode the font name anywhere else.

## Colour tokens used

The page uses these existing tokens and adds no colours. Values and the rules behind them are in
`context/archive/2026-10-13-ui-rowing-theme-dashboard/tokens.md`.

- `background`, `foreground`
- `card`, `card-foreground`
- `accent-foreground`, `input`: the header Sign in link, through `button.tsx`
- `muted-foreground`
- `primary`, `primary-foreground`
- `border`
- `ring`
- `coach`, `coach-foreground`: only on the example's coach suggestion

## Contrast log (measured 2026-10-31)

Target: text pairs ≥ 4.5:1 (WCAG AA); ring vs background ≥ 3:1. Dark theme only, since that is the shipped theme. Measured from the `.dark` values in `src/styles/global.css` (oklch → sRGB → WCAG relative luminance). No values needed changing. The focus ring is measured as `button.tsx` paints it (`ring-ring/50`); solid `--ring` would be 10.05:1. The 3.30:1 clears the target with little margin, and the dashboard change's archived log records the solid value.

| Pair                                         | Theme | Target | Measured | Adjustment |
| -------------------------------------------- | ----- | ------ | -------- | ---------- |
| foreground / background                      | dark  | 4.5:1  | 17.04:1  | none       |
| foreground / card                            | dark  | 4.5:1  | 15.41:1  | none       |
| muted-foreground / background                | dark  | 4.5:1  | 7.75:1   | none       |
| muted-foreground / card                      | dark  | 4.5:1  | 7.01:1   | none       |
| primary-foreground / primary                 | dark  | 4.5:1  | 7.97:1   | none       |
| primary (step numerals) / background         | dark  | 4.5:1  | 8.10:1   | none       |
| coach-foreground / coach                     | dark  | 4.5:1  | 8.72:1   | none       |
| foreground / outline button (header Sign in) | dark  | 4.5:1  | 15.39:1  | none       |
| ring at 50% / background (as painted)        | dark  | 3:1    | 3.30:1   | none       |
