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

Use `font-display` for landing headlines only. Don't apply it to body text or to app views, and don't
hardcode the font name anywhere else.

## Colour tokens used

The page uses these existing tokens and adds no colours. Values and the rules behind them are in
`context/archive/2026-10-13-ui-rowing-theme-dashboard/tokens.md`.

- `background`, `foreground`
- `card`, `card-foreground`
- `muted-foreground`
- `primary`, `primary-foreground`
- `border`
- `ring`
- `coach`, `coach-foreground`: only on the example's coach suggestion

## Contrast log (filled in Phase 4)

Target: text pairs ≥ 4.5:1 (WCAG AA); ring vs background ≥ 3:1. Dark theme only, since that is the
shipped theme.

| Pair                             | Theme | Target | Measured | Adjustment |
| -------------------------------- | ----- | ------ | -------- | ---------- |
| foreground / background          | dark  | 4.5:1  | TBD      | TBD        |
| muted-foreground / background    | dark  | 4.5:1  | TBD      | TBD        |
| muted-foreground / card          | dark  | 4.5:1  | TBD      | TBD        |
| primary-foreground / primary     | dark  | 4.5:1  | TBD      | TBD        |
| primary (link text) / background | dark  | 4.5:1  | TBD      | TBD        |
| coach-foreground / coach         | dark  | 4.5:1  | TBD      | TBD        |
| ring / background                | dark  | 3:1    | TBD      | TBD        |
