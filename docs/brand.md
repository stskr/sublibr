# Sublibr brand & marketing design system

A brief for a GitHub Pages marketing site. Values below are copied from the app’s live tokens in `src/App.css`. Use them as-is; do not invent a second palette.

**Product.** Desktop app for timed subtitles. Transcribe locally or in the cloud, edit on a timeline, style the text, export files or a burned-in video.

**Positioning.** A quiet, professional editing room — not a SaaS dashboard and not a generic AI landing page. Deep navy, one electric-blue action color, lots of empty space. Bilingual: English and Hebrew.

**Install path.** Terminal only. There is no packaged installer. The primary CTA is clone and `npm run dev`.

```bash
git clone https://github.com/stskr/sublibr.git
cd sublibr
npm install
npm run dev
```

---

## 1. Name

| Context | Form |
|---|---|
| Prose, headings, alt text | **Sublibr** |
| Logo / wordmark | Custom geometric caps **SUBLIBR** |
| Repo / URL | `sublibr` |

Do not write Sub-Libr, Sub Libr, or SUB LIBR. Do not use a different casing in marketing copy than **Sublibr**.

Hebrew one-liner (from the README; keep it on the page if space allows):

> תוכנה שולחנית לתמלול וידאו ואודיו לכתוביות עם חותמות זמן.

---

## 2. Voice

**Tone.** Direct, technical, calm. Short sentences. Feature claims are specific (model names, formats, folder paths). No hype, no “AI-powered” filler.

**Do say**

- Timed subtitles, transcription, translation, timeline, Local / Cloud
- Audio stays on this computer in Local mode
- Projects are folders you can move

**Don’t say**

- Offline / Online (the product labels are **Local** and **Cloud**)
- Magic, revolutionary, next-gen, all-in-one AI suite

**Suggested taglines** (pick one; do not stack them)

1. Timed subtitles. Local or cloud.
2. Transcribe, edit, and burn in — on your machine.
3. A desktop editor for subtitles that keep their times.

**Primary CTA.** `Install from the terminal`  
**Secondary CTA.** `View on GitHub`

---

## 3. Logo

The mark is a **subtitle card**: a rounded rectangle with two caption strokes (wide top line, shorter bottom line). Wordmark is custom geometric caps, not Signika.

### Files (shipped in the repo)

| Asset | Path | Use |
|---|---|---|
| Full lockup, white | `src/assets/Logo/logo-full-white.svg` | Dark marketing hero, app header, About |
| Symbol only, white | `src/assets/Logo/logo-white.svg` | Favicon, small header, social avatar |
| Wordmark only, white | `src/assets/Logo/logo-type-white.svg` | When the symbol is already nearby |
| Symbol only, black | `src/assets/Logo/logo-black.svg` | Light surfaces only (GitHub README, print) |

### Rules

- On navy / black, use **white** lockup or symbol. Never recolor the strokes to accent blue.
- On white / light gray, use the **black** symbol. Do not invert to navy-on-navy.
- Clear space: at least the height of the inner caption gap around the mark.
- Minimum symbol size on web: 24px tall. Full lockup: 28px tall in headers, 40–54px in the hero.
- Do not add drop shadows, gradients, or a colored tile behind the mark. The navy page *is* the background.
- Do not redraw the caption lines as three bars or a hamburger.

Favicon for GitHub Pages: export the white symbol on `#081420` (or transparent on a dark tab).

---

## 4. Color

Dark-only brand. There is no light theme. Sampled from a deep navy / royal-blue reference; every surface is a step in that family.

### Surfaces

| Token | Hex | Role |
|---|---|---|
| `--color-bg-primary` | `#081420` | Page background, deepest navy |
| `--color-bg-secondary` | `#0c1a2c` | Header, sidebar, cards, footer |
| `--color-bg-tertiary` | `#122445` | Inputs, secondary buttons, hover wells |
| `--color-bg-hover` | `#163056` | Hover fill |
| `--color-bg-active` | `#112e74` | Pressed / selected fill |
| `--color-bg-elevated` | `#163056` | Menus, dialogs (same as hover) |

Marketing page: full-bleed `#081420`. Sections can sit on `#0c1a2c` with a 1px `#2a4a72` rule — not a white card.

### Accent (action)

| Token | Hex | Role |
|---|---|---|
| `--color-accent` | `#1e6bd4` | Primary buttons, play, active tab, progress |
| `--color-accent-hover` | `#185cb8` | Primary hover |
| `--color-accent-text` | `#8ec4f5` | Links, accent labels on dark |
| `--color-accent-text-hover` | `#c5e0ff` | Link hover |
| `--color-accent-dim` | `rgba(30, 107, 212, 0.22)` | Selected row / tint |
| `--color-accent-soft` | `rgba(142, 196, 245, 0.18)` | Soft highlight |
| `--color-on-accent` | `#ffffff` | Label on accent fill |

One accent only. Do not add purple, teal, or orange “AI” gradients.

### Text

| Token | Hex | Role |
|---|---|---|
| `--color-text-primary` | `#dfe2f1` | Headings, body |
| `--color-text-secondary` | `#a8b4c8` | Supporting copy |
| `--color-text-muted` | `#9eb0c8` | Captions, section labels |
| `--color-text-tertiary` | `#9eb0c8` | Same as muted |

Do not use pure `#ffffff` for long body copy. Reserve white for wordmark, icons, and labels sitting on the accent fill.

### Borders

| Token | Hex | Role |
|---|---|---|
| `--color-border` | `#4f82b8` | Interactive only: buttons, fields, dropdowns |
| `--color-border-soft` | `#2a4a72` | Frames, rules, cards, section dividers |
| `--color-border-focus` | `#8ec4f5` | `:focus-visible` ring |

Landing-page cards and screenshot frames use **soft**. Bright border is for clickable chrome.

### Status (use sparingly)

| Token | Hex | On-fill | Meaning |
|---|---|---|---|
| `--color-success` | `#75EBBB` | `#052e16` | Local, ready, complete |
| `--color-warning` | `#E0EB75` | `#3a3a1a` | Needs attention |
| `--color-error` | `#f4a0c0` | `#081420` | Error |

Local chip in the product is mint fill + dark green text. Cloud chip is accent fill + white.

### Other

| Token | Value | Role |
|---|---|---|
| `--color-video` | `#1a1a1a` | Preview / cinema letterbox |
| `--color-on-video` | `#ffffff` | Burned-in subtitle default |
| `--color-overlay` | `rgb(0 0 0 / 0.7)` | Modal scrim |
| `--color-tooltip` | `#d1d1d1` | Tooltip surface (light) |
| `--color-on-tooltip` | `#1a1a1a` | Tooltip text |

### Contrast

App tokens are held to **WCAG AA**: body text ≥ 4.5:1 on every surface, control borders ≥ 3:1, white on accent ≥ 4.5:1. Keep the marketing page there too. Do not put muted `#9eb0c8` on `#122445` at small sizes without checking.

---

## 5. Typography

### Families

| Role | Family | Where |
|---|---|---|
| UI / marketing sans | **Signika** (variable, weight 300–700) | UI, landing page, headings |
| Mono | **JetBrains Mono** | Commands, timestamps, file paths, version |
| Subtitle preview | **Arial** / Helvetica Neue | Only inside the product’s subtitle canvas — not on the marketing page |
| Icons | **Material Icons Round** | Product UI. Marketing can use the same set or inline SVG |

Signika is a humanist sans with a slightly soft, readable texture — not Inter, not geometric-for-the-sake-of-it. That is intentional. Pair it with JetBrains Mono for install commands.

**Web (GitHub Pages)**

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Signika:wght@400;500;600;700&display=swap" rel="stylesheet">
```

**App files**

- Signika variable: `src/assets/Fonts/Signika/Signika-VariableFont_GRAD,wght.ttf` (SIL OFL)
- JetBrains Mono: npm `@fontsource/jetbrains-mono`
- Material Icons Round: `src/assets/Fonts/MaterialIconsRound/`

### Scale (from the app)

| Token | Size | Use on the marketing page |
|---|---|---|
| `--text-2xs` | 11px | Eyebrow, kbd, meta |
| `--text-xs` | 12px | Fine print, licenses |
| `--text-sm` | 13px | Captions |
| `--text-md` | 14px | Buttons, compact body |
| `--text-base` | 16px | Body |
| `--text-lg` | 18px | Subheads |
| `--text-xl` | 24px | Section titles |

Hero headline may go larger than the app scale. Suggested marketing extras (still Signika):

| Step | Size | Weight | Tracking |
|---|---|---|---|
| Hero | `clamp(2.25rem, 5vw, 3.5rem)` | 700 | `-0.02em` |
| Section | `clamp(1.5rem, 3vw, 2rem)` | 600 | `0` |
| Eyebrow | 11px | 700 | `0.08em`, uppercase |

Line height: **1.5** for body, ~1.15 for the hero. Antialiased.

### Weights in the product

- 400 — body
- 500 — buttons, dropdowns
- 600 — tab labels, project names
- 700 — section labels (`LATEST PROJECTS`), brand-adjacent labels (`0.08em` uppercase)

---

## 6. Spacing, radius, motion

**Grid.** 4px / 8px. Prefer `rem`.

| Token | rem | px |
|---|---|---|
| `--space-2xs` | 0.125 | 2 |
| `--space-xs` | 0.25 | 4 |
| `--space-sm` | 0.5 | 8 |
| `--space-md` | 1 | 16 |
| `--space-lg` | 1.5 | 24 |
| `--space-xl` | 2 | 32 |
| `--space-2xl` | 3 | 48 |

**Radius**

| Token | rem | Use |
|---|---|---|
| `--radius-sm` | 0.375 | Small chips, icon buttons |
| `--radius-md` | 0.625 | Buttons, inputs, screenshot frames |
| `--radius-lg` | 1 | Modals, large cards |
| `--radius-full` | 9999px | Pills (Local / Cloud) |

**Shadow** (dark, no colored glow)

- sm: `0 0.125rem 0.5rem rgb(0 0 0 / 0.3)`
- md: `0 0.25rem 1rem rgb(0 0 0 / 0.4)`
- lg: `0 0.5rem 2rem rgb(0 0 0 / 0.5)`

**Motion.** `ease-in-out`, **150ms** fast / **200ms** interactive. Primary buttons lift `1px` on hover. Focus ring: `2px solid #8ec4f5`, offset 2px. Always show `:focus-visible`.

---

## 7. Components to reuse on the page

### Primary button

Filled `#1e6bd4`, white label, Signika 14px / 500, min-height 48px, radius 10px (`--radius-md`), padding 8px 16px. Hover `#185cb8` + 1px lift. This is the Install CTA.

### Secondary button / ghost

Fill `#122445`, text `#dfe2f1`, 1px border `#4f82b8`. Use for “View on GitHub”.

### Pills

- **Local** — `#75EBBB` fill, `#052e16` text, 10px, 700, uppercase tracking
- **Cloud** — `#1e6bd4` fill, white text

### Code / install block

Navy `#0c1a2c` panel, 1px `#2a4a72` border, radius 16px, JetBrains Mono 14px, text `#dfe2f1`. Do not use GitHub’s default light gist style.

### Screenshot frame

Radius 16px, 1px `#2a4a72`, shadow `--shadow-lg`. No extra colored outline. Product screenshots are **1440×900** in `readme-screenshots/`.

| File | Caption |
|---|---|
| `readme-screenshots/1-home.png` | Home — drop a file, latest projects |
| `readme-screenshots/2-settings-local.png` | Settings — Local transcription and translation |
| `readme-screenshots/3-generate.png` | Generate |
| `readme-screenshots/5-transcribe-done.png` | Editor — English cues |
| `readme-screenshots/8-translate-done.png` | Translated version |
| `readme-screenshots/9-preview.png` | Preview with burned-in German cues |

Hero image: **9-preview.png** or **1-home.png**. Do not mock a light-mode screenshot.

---

## 8. Suggested GitHub Pages layout

Dark full-bleed page. Max content width ~1120px. Mobile-first; stack the install block above the fold on small screens.

1. **Header** — white symbol or full lockup, links: Features, Install, GitHub. No fake “Download .dmg”.
2. **Hero** — lockup, tagline, one sentence, primary Install + secondary GitHub. Hebrew line optional under the English sentence.
3. **Product shot** — framed screenshot.
4. **Local / Cloud** — two columns. Local: Whisper on this machine, ivrit.ai optional. Cloud: Gemini / OpenAI after a tested key.
5. **Features** — short cards: timed transcription, translation versions, portable project folders, timeline + style, SRT / VTT / ASS / burn-in.
6. **Install** — the three commands in a mono block. Note Node 18+. Cursor users: `ELECTRON_RUN_AS_NODE= npm run dev`.
7. **Footer** — MIT, Stas Krylov, FFmpeg LGPL note, GitHub link. Text muted.

Do not add a pricing table, waitlist, or app-store badges.

---

## 9. Copy-paste tokens for the marketing stylesheet

```css
:root {
  --color-bg-primary: #081420;
  --color-bg-secondary: #0c1a2c;
  --color-bg-tertiary: #122445;
  --color-accent: #1e6bd4;
  --color-accent-hover: #185cb8;
  --color-accent-text: #8ec4f5;
  --color-on-accent: #ffffff;
  --color-success: #75EBBB;
  --color-on-success: #052e16;
  --color-text-primary: #dfe2f1;
  --color-text-secondary: #a8b4c8;
  --color-text-muted: #9eb0c8;
  --color-border: #4f82b8;
  --color-border-soft: #2a4a72;
  --color-border-focus: #8ec4f5;
  --font-sans: "Signika", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", "Fira Code", monospace;
  --radius-md: 0.625rem;
  --radius-lg: 1rem;
  --leading: 1.5;
}

body {
  font-family: var(--font-sans);
  font-size: 1rem;
  line-height: var(--leading);
  color: var(--color-text-primary);
  background: var(--color-bg-primary);
  -webkit-font-smoothing: antialiased;
}

a { color: var(--color-accent-text); }
a:hover { color: #c5e0ff; }

:focus-visible {
  outline: 2px solid var(--color-border-focus);
  outline-offset: 2px;
}
```

---

## 10. Do / don’t (marketing)

**Do**

- Stay on navy. Let screenshots carry the product, not illustrations of robots.
- Treat Local as mint and Cloud as blue — same as the app footer.
- Keep Hebrew visible; the product is built for RTL scripts.
- Point people at the repo. Install is the feature.

**Don’t**

- Inter, Roboto, or purple-on-white “AI startup” layouts.
- Light theme, glassmorphism, neon glow on the logo.
- Store badges or a Production / DMG download as the main path.
- Recolor the wordmark in accent blue.
- Promise models or cloud providers the README does not list.

---

## 11. Credits to keep on the page

- © 2026 Stas Krylov — MIT
- Signika — SIL Open Font License ([Google Fonts](https://fonts.google.com/specimen/Signika))
- JetBrains Mono — SIL OFL
- FFmpeg is LGPL 2.1+; source at [ffmpeg.org/download](https://ffmpeg.org/download.html)
- Local: whisper.cpp, llama.cpp. Cloud: Google Gemini, OpenAI, under those providers’ terms.

Author links used in the app: [X @StasKrylov](https://x.com/StasKrylov), [GitHub stskr](https://github.com/stskr).
