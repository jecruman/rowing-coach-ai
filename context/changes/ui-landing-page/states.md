# State matrix: landing page (`/`, signed out)

The page is static and server-rendered, with no data loading, forms or client JavaScript, so it has one real state. Measured on 2026-10-31 against the production build (`npm run preview`). Signed-in visitors never see this page: the middleware redirects them to `/dashboard`.

| State         | Status | Evidence or reason                                                                                                                                                                                                                |
| ------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| default       | Shown  | `screenshots/landing-desktop-1280-top.png`, `landing-desktop-1280-lower.png`, `landing-mobile-390-top.png`, `landing-mobile-390-lower.png`                                                                                        |
| hover         | Shown  | The two Sign in links use `buttonVariants`, so hover comes from tokens: `primary/90` on the hero link, `accent` on the header link. Not captured in a screenshot.                                                                 |
| focus-visible | Shown  | Both Sign in links carry the `--ring` classes from `button.tsx`, and Tab moves between them in order. The automated browser has no window focus and does not draw the ring, so the visible ring is a manual check (Progress 4.4). |
| disabled      | N/A    | The page has no disabled controls.                                                                                                                                                                                                |
| error         | N/A    | The page loads no data and has no form. Sign-in errors stay on `/auth/signin`.                                                                                                                                                    |
| empty         | N/A    | The content is static, so there is no data to be empty.                                                                                                                                                                           |
| loading       | N/A    | Server-rendered with no client fetch. Archivo uses `font-display: swap`; measured layout shift on load was 0 in this run, with the font served locally.                                                                           |

## Other measurements

- Horizontal scroll: none. Page width was 1265 px in a 1280 px window and 375 px in a 390 px window (both narrower by the scrollbar).
- Font download: one file, `archivo-latin-wght-normal` at 34 KB. The Latin Extended and Vietnamese files were not fetched.
- Controls: two, both Sign in, both linking to `/auth/signin`.
- Landmarks: one `<main>`. The scull drawing is hidden from assistive technology.
- Layout shift could be larger on a slow network, where the fallback font shows for longer. That case was not tested.
