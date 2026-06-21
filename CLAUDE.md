# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev       # dev server at http://localhost:4321
npm run build     # static build to ./dist/ (also generates sitemap-index.xml)
npm run preview   # serve the production build
npx astro check   # type-check .astro/.tsx
```

There is no test suite and no linter configured. The build (esbuild/vite) is the only compile-time check; it catches TS syntax errors but not type errors (use `astro check`), and **not GLSL errors** — a malformed shader fails silently at runtime (black canvas), so always verify visually.

## What this is

A single-page pre-launch teaser for **Stillfield** (sensory-deprivation pods sold B2B). The entire site is the one route `src/pages/index.astro`. The design brief lives in `/Users/nk/Downloads/BRIEF.md` (not in-repo) — strict near-black monochrome, minimalism is the top priority, British spelling.

**The concept (branch `dome-light`):** the visitor stands inside a vast, sealed, black rotunda — a true rotunda — one continuous tall ellipsoid (walls rise steeply from the floor and curve over into a dome at the crown), a single smooth surface so there is no seam line on the wall. The **only light in the room is the Register pill**: it is a lamp resting on the floor at the far side of the room, sitting **on the horizon line** (the floor/wall seam) like a rising sun — glow fanning up the wall behind it, a reflection smear running down the polished floor toward the viewer, true black at the crown. (Earlier placement near the camera left a dark floor band between the pill and the lit wall, which read as light rising from behind a hill.) The lamp breathes slowly and **swells when the pointer approaches the button** ("the light notices you"); on touch devices it just breathes. **The camera never moves** — no parallax, no drift; any camera motion makes the shader's halo slide out from behind the HTML pill. Strict black/white contrast — no mid-grey washes. The room is scaled up large (`RC 30` / `RY 50`, lamp ~32 units away) so the fixed human-height camera reads as small inside a vast chamber, and the far reaches dissolve into atmospheric black. An **entry gate** ("Enter the field") covers the dome on load; choosing to enter fades it away to reveal the room, and the sound path starts the brown noise on that same click (the user gesture browsers require). A quieter "Enter in silence" steps in without sound. After entry, brown noise can still be toggled from the topbar control.

Other branches express the same still-vs-noise idea differently: `main` = three.js dome + gate; `redesign-layout` = concrete-vault variant; `silent-band` = zero-JS grain field with a still black band.

## Architecture

Astro static site (`output: 'static'`, `site` in `astro.config.mjs`) with **three React islands**; all content is server-rendered HTML.

- `src/layouts/Base.astro` — all `<head>`: meta, OG/Twitter (`/og.jpg`), canonical, JSON-LD, favicons.
- `src/pages/index.astro` — composes: `<Dome>` (hero), topbar (mark + wordmark + sound toggle), `.floor-cta` (Register pill, positioned in the light pool), `.lower` corner captions.
- `src/components/Dome.tsx` (`client:load`) — the rotunda. **Raw WebGL, no three.js**: one full-screen triangle, one fragment shader, analytic interior hits (ray–floor + ray–ellipsoid, nearest wins), a point light at the pill's position with an analytic air-halo (no volume march), a vertical Blinn reflection streak on the polished floor (narrow across, long in depth — reads the floor as flat; a round pool reads as a bulge), bump-mapped troweled plaster (domain-warped height field perturbs the normal so grazing lamplight catches real micro-relief — the cure for “artificial”; coarse fbm blotches read as smoke, fully flat reads as fake), film grain, vignette. Decorative only (`aria-hidden`); fades in on first frame (`.is-ready`). `?lit` in the URL pins the lamp at full glow (used for OG renders).
- `src/components/Ambience.tsx` (`client:load`) — the entry gate **and** the sound, in one component so a single `AudioContext` owns the brown noise. Renders the `.gate` overlay on load ("Enter the field" / "Enter in silence"); entering fades the gate (`.is-closing` → unmounted) to reveal the dome, and the with-sound path starts the wash. Also reveals + wires the server-rendered `[data-sound]` topbar toggle (`hidden` until JS) to the same audio, kept in sync. Gate styles live in `src/styles/ambience.css`.
- `src/components/Modal.tsx` (`client:idle`) — Register-interest dialog, opens from any `[data-cta]`.
- `src/components/Mark.astro` — six-dot hexagonal mark (no centre dot, deliberately).
- Pre-hydration / no-JS: `.stage::before` draws a CSS approximation (the lamp's glow, low-centre) so the page is never dead black.

### Tuning the dome (`Dome.tsx`)

- Geometry: `RC` (room radius at the floor) and `RY` (crown height). `RY > RC` makes a tall dome — walls steep near the floor, curving over up top. One ellipsoid = no seam; an earlier drum-cylinder + dome-sphere build showed a springline crease, don't go back to it.
- `LP` — the lamp's world position; must project to where the pill is on screen (`.floor-cta { top: 71% }` in `global.css`). If either moves, re-align by screenshot.
- `surf()` — plaster height field (domain warp + two octaves); feeds both albedo and the bump. `bumpAmp` (wall 0.22 / floor 0.09) sets how strongly grazing light catches the relief — too high sparkles, too low goes plastic.
- `K` (floor 0.55 / wall 0.80) and the `pow(d2, 0.72)` falloff — how far the lamp's rake reaches; the crown-fade `smoothstep(HS-1.2, HS+3.0, P.y)` keeps the top black at any energy.
- Dither: `g * (0.03 + 0.06 * (1 - smoothstep(0,0.30,I)))` — extra noise in the shadows to break 8-bit banding in the dark gradient. Don't remove it.
- halo term `0.016 / (0.012 + h2 * 3.2)` — the air-glow around the pill.
- `uGlow` in JS: `boot² × (0.62 + 0.38 × proximity)` — rest level, swell range, and the 2.2 s ignition are all here.
- camera `ro` / look target / the `0.95` ray scale (~87° FOV) — framing.
- `SCALE = 0.7` render scale + DPR cap 1.5 — perf budget; grain hides the upscale.

### Two cross-cutting rules that are easy to break

1. **SEO/crawlability is a hard requirement.** All meaningful content (`.sr-only` h1, captions, meta, JSON-LD) stays in the **server HTML** — never client-injected. Verify on `dist/index.html`.
2. **Stillness contrast.** Nothing in the HTML layer animates continuously; the only perpetual motion is the lamp's slow breathing. All motion (including the shader's) freezes under `prefers-reduced-motion`.

## Verifying visual changes (no browser extension)

WebGL in headless Chrome needs swiftshader:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --use-gl=angle --use-angle=swiftshader \
  --enable-unsafe-swiftshader --hide-scrollbars --window-size=1440,900 \
  --screenshot=/tmp/shot.png --virtual-time-budget=12000 http://localhost:4321/
```

Quirks (screenshot artifacts, not site bugs):
- Under `--virtual-time-budget`, compositor-driven CSS animations don't advance — the HTML overlays (topbar/CTA/captions) are caught at `opacity: 0` while the canvas paints. Adding `--force-prefers-reduced-motion` inverts it: overlays show, canvas may be black (only one RAF frame races the budget). Verify the two layers in separate shots, or check in a real browser.
- Headless clamps window width to a **500px minimum** — "390px" screenshots are a 500px layout clipped; verify mobile at 500px.
- Swiftshader software-renders the raymarch: each shot takes ~30–60s. A near-black small PNG means the shader failed — check `data-glerr` on `.dome-canvas` via `--dump-dom` (set on compile/link failure).

## Self-hosted fonts

Fonts are served from `public/fonts/*.woff2` via `@font-face` in `global.css` (copied from the `@fontsource/*` packages) and `<link rel="preload">`ed in `index.astro`. Do **not** reintroduce the Google Fonts CDN — self-hosting is a deliberate Core-Web-Vitals choice. Display = Tenor Sans, body = Hanken Grotesk (300/400/500).
