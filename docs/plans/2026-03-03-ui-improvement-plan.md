# UI Improvement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refresh the design token system and polish four key components (auth card, source button strip, waveform panel, spectrum analyzer) across all pages for a Modern SaaS / clean aesthetic.

**Architecture:** Option A — Design Token Refresh. The existing HTML structure and Bootstrap 4 foundation stay intact. All visual changes live in `public/css/style.css`, with small targeted edits to `public/index.html` and `public/app.js` where needed. No new dependencies.

**Tech Stack:** Vanilla HTML/CSS/JS, Bootstrap 4.5, Font Awesome 6, Peaks.js (waveform), Web Audio API (spectrum). No build step.

**Verification:** Open `http://localhost:3000` (server is already running) in a browser after each task and visually confirm the change. The server does NOT auto-reload — refresh the browser tab manually.

---

## Task 1: Update Design Tokens

**Files:**
- Modify: `public/css/style.css` (lines 1–18, the `:root` block)

**Step 1: Edit the `:root` block**

Replace the existing `:root` block with:

```css
:root {
  --bg:          #fafafa;
  --surface:     #f4f4f5;
  --border:      #e4e4e7;
  --text:        #18181b;
  --text-muted:  #71717a;
  --accent:      #4f46e5;
  --accent-dark: #4338ca;
  --danger:      #dc2626;
  --success:     #16a34a;
  --radius:      10px;
  --shadow-sm:   0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md:   0 4px 12px rgba(0,0,0,0.08);
  --shadow-lg:   0 8px 24px rgba(0,0,0,0.10);
  --font:        'Inter', system-ui, -apple-system, sans-serif;
  --font-mono:   'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
}
```

**Step 2: Verify**

Open `http://localhost:3000`. The buttons and links should now appear with a slightly purple-tinted blue (indigo) instead of the previous blue. The page background should be very slightly off-white. Auth card borders will appear slightly darker.

**Step 3: Commit**

```bash
git add public/css/style.css
git commit -m "style: update design tokens to indigo accent and zinc neutrals"
```

---

## Task 2: Polish the Auth Card

**Files:**
- Modify: `public/css/style.css` (`.auth-card` section, around line 128)
- Modify: `public/index.html` (auth section, lines 22–59)

**Step 1: Update `.auth-card` and radio option styles in CSS**

Find the `.auth-card` block (around line 128) and replace through to the end of the access-option section (around line 212):

```css
/* ============================================================
   Auth card (login screen)
   ============================================================ */
.auth-card {
  width: 100%;
  max-width: 420px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 40px 36px 36px;
  box-shadow: var(--shadow-lg);
  margin-top: 48px;
}

.auth-card-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 6px;
}

.auth-card-logo i {
  font-size: 1.75rem;
  color: var(--accent);
}

.auth-card-logo span {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
}

.auth-card-subtitle {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.8125rem;
  margin-bottom: 28px;
}

.auth-card h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
  text-align: center;
  margin: 0 0 20px;
}

.auth-card h3 i {
  color: var(--accent);
  margin-right: 8px;
}

/* Radio buttons — access type */
.access-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  margin-bottom: 10px;
  transition: border-color 0.15s, background 0.15s;
}

.access-option:hover {
  border-color: var(--accent);
  background: #eef2ff;
}

.access-option input[type="radio"] {
  margin-top: 2px;
  accent-color: var(--accent);
}

.access-option input[type="radio"]:checked + div .option-label {
  color: var(--accent);
}

.access-option:has(input:checked) {
  border-color: var(--accent);
  background: #eef2ff;
}

.access-option .option-label {
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--text);
}

.access-option .option-desc {
  font-size: 0.8125rem;
  color: var(--text-muted);
  margin-top: 2px;
}
```

**Step 2: Add logo/wordmark markup to `public/index.html`**

Find the auth section opening in `index.html` (around line 22):
```html
    <div id="authSection" class="auth-card">
        <h3><i class="fas fa-key"></i> Sign In</h3>
```

Replace with:
```html
    <div id="authSection" class="auth-card">
        <div class="auth-card-logo">
            <i class="fas fa-headphones-alt"></i>
            <span>Subjective Listening</span>
        </div>
        <p class="auth-card-subtitle">Sign in to access your audio project</p>
        <h3><i class="fas fa-key"></i> Sign In</h3>
```

**Step 3: Verify**

Refresh `http://localhost:3000`. The login card should now show a logo row at the top, have more breathing room, and the selected radio option should highlight with an indigo border and light indigo fill.

**Step 4: Commit**

```bash
git add public/css/style.css public/index.html
git commit -m "style: polish auth card — logo header, stronger shadow, active radio state"
```

---

## Task 3: Segmented Control for Track Source Buttons

**Files:**
- Modify: `public/css/style.css` (`.button-container` section, around line 362)
- Modify: `public/app.js` (the `showSpeakerButtons` and `loadTrack` functions)

**Step 1: Replace `.button-container .btn-info` styles in CSS**

Find the "Track source buttons" section (around line 362) and replace through the end of `.button-container .btn-info:active` (around line 396):

```css
/* ============================================================
   Track source buttons — segmented control
   ============================================================ */
.button-container {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 3px;
  overflow-x: auto;
  max-width: 100%;
}

.button-container .btn-info {
  width: auto;
  min-width: 90px;
  height: 32px;
  padding: 0 14px;
  font-size: 0.8125rem;
  font-weight: 500;
  border-radius: calc(var(--radius) - 2px);
  background: transparent;
  border: none;
  color: var(--text-muted);
  box-shadow: none;
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
  white-space: nowrap;
}

.button-container .btn-info:hover {
  background: var(--bg);
  color: var(--text);
}

.button-container .btn-info.active {
  background: var(--accent);
  color: #fff;
  box-shadow: 0 1px 3px rgba(79,70,229,0.3);
}
```

**Step 2: Add active-state management to `showSpeakerButtons` in `public/app.js`**

Find `showSpeakerButtons` (around line 698). Replace the `button.addEventListener("click", ...)` line inside the forEach:

```js
      button.addEventListener("click", () => {
        // Remove active from all source buttons
        for (let i = 1; i <= 10; i++) {
          const b = document.getElementById(`switchToSpeaker${i}`);
          if (b) b.classList.remove("active");
        }
        button.classList.add("active");
        loadTrack(track, true);
      });
```

Also, after `button.classList.remove("hidden");` in `showSpeakerButtons`, add logic to activate the first button by default when buttons are first shown. Find the line:
```js
      button.classList.remove("hidden"); // Shows the button
```
And after it, add:
```js
      if (index === 0) button.classList.add("active");
```

**Step 3: Verify**

Refresh the player page, authenticate, and select a project. The source buttons should now appear as a connected pill-strip. The first button should be highlighted in indigo. Clicking another source should move the highlight to that button.

**Step 4: Commit**

```bash
git add public/css/style.css public/app.js
git commit -m "style: convert source buttons to segmented control with active state"
```

---

## Task 4: Dark Waveform Panel

**Files:**
- Modify: `public/css/style.css` (`.waveform-container`, `#zoomview-container`, `#overview-container` sections)
- Modify: `public/index.html` (waveform section, around lines 88–100)

**Step 1: Update waveform CSS**

Find the "Waveform" section in `style.css` (around line 426) and replace through `#overview-container`:

```css
/* ============================================================
   Waveform
   ============================================================ */
.waveform-card {
  width: 100%;
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  border-radius: var(--radius);
  padding: 16px;
  overflow: hidden;
}

.waveform-track-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding: 0 4px;
}

.waveform-track-label span {
  font-size: 0.8125rem;
  font-weight: 500;
  color: #a5b4fc;
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80%;
}

#waveform-time {
  font-size: 0.75rem;
  font-family: var(--font-mono);
  color: #6b7280;
}

#zoomview-container {
  width: 100%;
  height: 160px;
  margin-bottom: 8px;
}

#overview-container {
  width: 100%;
  height: 60px;
}
```

Also remove (or comment out) the old `.waveform-container` rule if it remains in the file.

**Step 2: Update the waveform section in `public/index.html`**

Find the waveform section (around lines 88–101):
```html
        <!-- Waveform -->
        <div class="controls">
            <p class="section-title"><i class="fas fa-waveform-path"></i> Audio Waveform</p>
            <div style="display: flex; justify-content: center; margin-bottom: 16px;">
                <div id="project-container" style="width: 100%; max-width: 600px;"></div>
            </div>
            <div class="waveform-container">
                <div id="peaks-container">
                    <div id="zoomview-container"></div>
                    <div id="overview-container"></div>
                </div>
            </div>
            <audio id="audio" controls crossorigin="anonymous" style="width: 100%; margin-top: 12px;"></audio>
        </div>
```

Replace with:
```html
        <!-- Waveform -->
        <div class="controls">
            <p class="section-title"><i class="fas fa-waveform-path"></i> Audio Waveform</p>
            <div style="display: flex; justify-content: center; margin-bottom: 16px;">
                <div id="project-container" style="width: 100%; max-width: 600px;"></div>
            </div>
            <div class="waveform-card">
                <div class="waveform-track-label">
                    <span id="waveform-track-name">No track loaded</span>
                    <span id="waveform-time">0:00</span>
                </div>
                <div id="peaks-container">
                    <div id="zoomview-container"></div>
                    <div id="overview-container"></div>
                </div>
            </div>
            <audio id="audio" crossorigin="anonymous" style="display: none;"></audio>
        </div>
```

Note: The `controls` attribute is removed and the element is hidden via `display: none` — the Play button handles playback.

**Step 3: Update the track-name label from `app.js`**

In `app.js`, find where `currentTrack` is updated (around line 671):
```js
  document.getElementById("currentTrack").textContent =
    "Current Track: " + track.split("/").pop().split("?")[0];
```

Add a line after it to also update the waveform label:
```js
  const waveformLabel = document.getElementById("waveform-track-name");
  if (waveformLabel) {
    waveformLabel.textContent = track.split("/").pop().split("?")[0];
  }
```

**Step 4: Verify**

Refresh the player. The waveform area should now appear inside a dark card (`#1e1e2e` background). The native audio controls bar should be gone. The track name should appear in light purple monospace text above the waveform when a track is loaded.

**Step 5: Commit**

```bash
git add public/css/style.css public/index.html public/app.js
git commit -m "style: dark waveform card with track label strip, hide native audio controls"
```

---

## Task 5: Dark Spectrum Analyzer Card

**Files:**
- Modify: `public/css/style.css` (`#audioSpectrum` section, around line 447)
- Modify: `public/app.js` (the `draw` function, canvas fill colors, around lines 443–462)

**Step 1: Update spectrum CSS**

Find the "Spectrum canvas" section (around line 447):
```css
#audioSpectrum {
  width: 100%;
  height: 200px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
```

Replace with:
```css
/* ============================================================
   Spectrum analyzer
   ============================================================ */
.spectrum-card {
  width: 100%;
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  border-radius: var(--radius);
  padding: 16px;
  position: relative;
}

.spectrum-axis {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  padding: 0 2px;
}

.spectrum-axis span {
  font-size: 0.6875rem;
  font-family: var(--font-mono);
  color: #6b7280;
}

#audioSpectrum {
  width: 100%;
  height: 240px;
  background: transparent;
  border-radius: calc(var(--radius) - 4px);
  display: block;
}
```

**Step 2: Wrap the canvas in `public/index.html`**

Find the "Frequency Spectrum" section (around line 122):
```html
        <!-- Frequency Spectrum -->
        <div class="controls">
            <p class="section-title"><i class="fas fa-chart-bar"></i> Frequency Spectrum</p>
            <canvas id="audioSpectrum"></canvas>
        </div>
```

Replace with:
```html
        <!-- Frequency Spectrum -->
        <div class="controls">
            <p class="section-title"><i class="fas fa-chart-bar"></i> Frequency Spectrum</p>
            <div class="spectrum-card">
                <canvas id="audioSpectrum"></canvas>
                <div class="spectrum-axis">
                    <span>20 Hz</span>
                    <span>100 Hz</span>
                    <span>1 kHz</span>
                    <span>10 kHz</span>
                    <span>20 kHz</span>
                </div>
            </div>
        </div>
```

**Step 3: Update canvas fill color in `public/app.js`**

The `draw` function uses white as the clear color. Find all three occurrences of:
```js
      canvasCtx.fillStyle = "rgb(255, 255, 255)";
```
There are three of them (around lines 444, 455, 461). Replace each with:
```js
      canvasCtx.fillStyle = "#1e1e2e";
```

Also update the gradient colors for bars (around line 484) to match the indigo theme. Find:
```js
        const startColor = { r: 23, g: 162, b: 184 }; // #17a2b8 (teal)
        const endColor = { r: 230, g: 210, b: 205 }; // #e6d2cd (light pink)
```

Replace with:
```js
        const startColor = { r: 79, g: 70, b: 229 };  // #4f46e5 indigo (low amplitude)
        const endColor   = { r: 167, g: 139, b: 250 }; // #a78bfa violet (high amplitude)
```

Also update the hover line color (around line 514) from red to a lighter accent:
```js
      canvasCtx.strokeStyle = "rgba(220, 53, 69, 0.8)"; // Red line
```
Replace with:
```js
      canvasCtx.strokeStyle = "rgba(167, 139, 250, 0.9)"; // Violet line
```

And the hover label text color (around line 524):
```js
      canvasCtx.fillStyle = "rgba(0, 0, 0, 0.9)";
      canvasCtx.strokeStyle = "rgba(255, 255, 255, 0.9)";
```
Replace with:
```js
      canvasCtx.fillStyle = "rgba(245, 245, 245, 0.95)";
      canvasCtx.strokeStyle = "rgba(30, 30, 46, 0.9)";
```

**Step 4: Verify**

Refresh the player and authenticate. The spectrum analyzer should now have a dark card matching the waveform panel. When audio plays, bars should render in indigo-to-violet gradient. The frequency axis labels (20 Hz … 20 kHz) should appear below the canvas.

**Step 5: Commit**

```bash
git add public/css/style.css public/index.html public/app.js
git commit -m "style: dark spectrum card with frequency axis labels and indigo bar colors"
```

---

## Task 6: Final Polish Pass

**Files:**
- Modify: `public/css/style.css` (header, status card, misc spacing)

**Step 1: Refine header**

Find `.header-section` (around line 42) and update:
```css
.header-section {
  width: 100%;
  padding: 18px 32px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  text-align: center;
  margin-bottom: 32px;
  box-shadow: var(--shadow-sm);
}
```

**Step 2: Add a subtle accent indicator to the status card**

Find `.status-card` (around line 84) and add a left border accent:
```css
.status-card {
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius);
  padding: 20px 24px;
  margin-bottom: 20px;
  box-shadow: var(--shadow-sm);
  position: relative;
}
```

**Step 3: Verify full page**

1. Open `http://localhost:3000` — auth card should look polished
2. Log in as listener — player page should feel cohesive: indigo source strip, dark waveform card, dark spectrum card with axis labels
3. Open `http://localhost:3000/create_project.html` — section cards should inherit the token improvements (slightly warmer surface, tighter borders)
4. Resize browser to mobile width — source buttons should scroll horizontally, layout should remain usable

**Step 4: Commit**

```bash
git add public/css/style.css
git commit -m "style: header shadow, status card accent border — final polish pass"
```
