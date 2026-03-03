# UI Improvement Design — 2026-03-03

## Scope

All pages: main player (`index.html`), project management (`create_project.html`), and shared CSS (`style.css`).

## Approach

**Option A — Design Token Refresh.** Keep the existing HTML structure and Bootstrap 4 foundation. Replace design token values, eliminate generic Bootstrap visual signatures, and polish each component individually. No JS changes required.

## Design Decisions

### 1. Design Tokens

| Token | Current | New |
|-------|---------|-----|
| `--accent` | `#2563eb` | `#4f46e5` (indigo) |
| `--accent-dark` | `#1d4ed8` | `#4338ca` |
| `--bg` | `#ffffff` | `#fafafa` |
| `--surface` | `#f9fafb` | `#f4f4f5` |
| `--border` | `#e5e7eb` | `#e4e4e7` |
| `--text` | `#111827` | `#18181b` |
| `--radius` | `8px` | `10px` |
| Add `--shadow-lg` | — | `0 8px 24px rgba(0,0,0,0.10)` |
| Add `--font-mono` | — | `'JetBrains Mono', 'Fira Code', monospace` |

### 2. Auth / Login Card

- Add a logo/wordmark area at top: icon + app name in refined typographic treatment
- Increase card padding, add stronger `box-shadow` (use `--shadow-lg`) for more elevation
- Radio options (Admin/Listener) become proper selection cards — filled border + background when selected, not bare radio buttons
- "Access" button: full-width indigo, subtle glow on hover via `box-shadow`

### 3. Track Source Buttons (Main Player)

- Replace pill buttons with a **segmented control strip** — visually connected buttons, single active state slides between them
- Inactive: white background, `--border` outline
- Active: indigo fill (`--accent`), white text, subtle shadow
- Strip is horizontally scrollable on mobile

### 4. Waveform Panel

- Wrap Peaks.js containers in a card with dark background (`#1e1e2e`) — waveforms render much better on dark and create a strong visual anchor
- Hide the native `<audio>` controls element (redundant with the Play button)
- Add a thin label strip above the zoomview: track name + timestamp readout

### 5. Spectrum Analyzer

- Increase canvas height: 200px → 240px
- Add frequency axis labels (20Hz, 100Hz, 1kHz, 10kHz, 20kHz) as a CSS overlay
- Match the dark-background card treatment used by the waveform panel for visual consistency

## Files to Change

| File | Change type |
|------|-------------|
| `public/css/style.css` | Token updates, new component styles, waveform dark card, segmented control |
| `public/index.html` | Minor: hide `<audio>` controls, add label strip markup |
| `public/app.js` | Minor: update any inline style references to token changes |
| `public/create_project.html` | Minor: no structural changes expected |

## Out of Scope

- No changes to backend (`server.js`)
- No changes to audio processing or Peaks.js initialization logic
- No new dependencies — all changes are CSS/HTML only
- Dark mode toggle (not requested)
