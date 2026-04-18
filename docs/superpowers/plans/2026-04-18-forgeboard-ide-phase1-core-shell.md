# ForgeBoard IDE — Phase 1: Core Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap a Tauri 2 desktop app that launches on Windows and renders the full Cursor-standard layout (title bar, action bar, labeled left rail, file sidebar, editor placeholder, bottom panel with tabs, status bar) in the locked Gold + Sage palette. No real functionality yet — this phase ships UI bones only.

**Architecture:** Vite + Preact + TypeScript frontend in `src/`, Rust + Tauri 2 backend in `src-tauri/`. IPC verified via a `ping` command. Layout is a flex grid; components are focused (one file, one responsibility). No state library — Preact signals for reactive state.

**Tech Stack:** Tauri 2, Rust (stable), Preact 10, TypeScript 5, Vite 5, pnpm, Instrument Sans, JetBrains Mono.

---

## File Structure

```
forgeboard-ide/
├── index.html
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.tsx                     # Preact entry
│   ├── App.tsx                      # Root layout
│   ├── components/
│   │   ├── TitleBar.tsx
│   │   ├── ActionBar.tsx
│   │   ├── LeftRail.tsx
│   │   ├── FileSidebar.tsx
│   │   ├── EditorArea.tsx           # Placeholder in Phase 1
│   │   ├── BottomPanel.tsx
│   │   └── StatusBar.tsx
│   ├── state/
│   │   └── appState.ts              # Preact signals
│   ├── styles/
│   │   ├── tokens.css               # Design tokens (colors, fonts)
│   │   └── global.css               # Base + reset + layout grid
│   └── ipc/
│       └── ping.ts                  # Tauri invoke wrapper
├── public/
│   └── fonts/
│       ├── InstrumentSans-*.woff2
│       └── JetBrainsMono-*.woff2
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── src/
│   │   ├── main.rs
│   │   └── commands/
│   │       ├── mod.rs
│   │       └── ping.rs
│   └── icons/
│       ├── 32x32.png
│       ├── 128x128.png
│       ├── 128x128@2x.png
│       └── icon.ico
└── tests/
    ├── setup.ts
    └── components.spec.ts
```

---

## Open Questions For This Phase

- [ ] **Tauri 2 vs 1.x:** Task 1 tries Tauri 2. If a blocker appears, fall back to Tauri 1.x by reverting and using `create-tauri-app` with `--tauri-version 1`.
- [ ] **Frontend framework:** Preact chosen for small bundle (~4KB). If you already know React and want React, swap in Task 2 (steps are nearly identical; imports change from `preact` to `react`).
- [ ] **Icons:** Placeholder 512x512 orange square for Phase 1. Real icon design is Phase 13.

---

## Task 1: Scaffold Tauri 2 project with Vite + Preact + TypeScript

**Files:**
- Create: `C:\Users\DFTUF01\forgeboard-ide\` (new directory, sibling to existing `forgeboard/`)
- Verify: `package.json`, `src-tauri/Cargo.toml`, `vite.config.ts` exist

- [ ] **Step 1: Install prerequisites**

Run in terminal:
```bash
# Rust (if not already installed)
winget install Rustlang.Rustup
rustup default stable

# pnpm
winget install pnpm.pnpm

# Tauri CLI
cargo install tauri-cli --version "^2.0.0"

# Visual C++ build tools (required by Rust on Windows)
# Install from: https://visualstudio.microsoft.com/visual-cpp-build-tools/
# Select: "Desktop development with C++"
```

Expected: `rustc --version` prints Rust version; `pnpm --version` prints pnpm version; `cargo tauri --version` prints Tauri CLI version.

- [ ] **Step 2: Create project via Tauri's scaffolder**

```bash
cd C:/Users/DFTUF01
pnpm create tauri-app
```

When prompted:
- Project name: `forgeboard-ide`
- Identifier: `com.defenceforgeindustries.forgeboard-ide`
- Choose: TypeScript
- Frontend: Vite
- Template: `preact-ts`
- Package manager: pnpm

- [ ] **Step 3: Install deps and verify scaffold builds**

```bash
cd C:/Users/DFTUF01/forgeboard-ide
pnpm install
pnpm tauri dev
```

Expected: a default Tauri window opens showing the Preact starter page. Close the window.

- [ ] **Step 4: Initialize git inside the new project, first commit**

```bash
cd C:/Users/DFTUF01/forgeboard-ide
git init
git add .
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "chore: scaffold Tauri 2 + Vite + Preact project"
```

Expected: commit hash prints.

---

## Task 2: Configure Tauri window (title, size, min size, dark theme)

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Open tauri.conf.json and locate `app.windows`**

Read current contents of `src-tauri/tauri.conf.json` with the Read tool.

- [ ] **Step 2: Replace the `app.windows` block**

Change the `app.windows` array to:

```json
"windows": [
  {
    "title": "ForgeBoard IDE",
    "width": 1400,
    "height": 900,
    "minWidth": 960,
    "minHeight": 600,
    "resizable": true,
    "decorations": true,
    "transparent": false,
    "fullscreen": false,
    "center": true,
    "theme": "Dark"
  }
]
```

Also set at top level:
```json
"productName": "ForgeBoard IDE",
"version": "0.1.0-dev",
"identifier": "com.defenceforgeindustries.forgeboard-ide",
```

- [ ] **Step 3: Run and verify the window title + size**

```bash
pnpm tauri dev
```

Expected: window opens 1400×900 centered, title "ForgeBoard IDE", dark theme.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "chore: configure Tauri window size, title, dark theme"
```

---

## Task 3: Create design tokens CSS

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`
- Modify: `src/main.tsx` to import both

- [ ] **Step 1: Create `src/styles/tokens.css`**

```css
:root {
  /* Base palette — Gold + Sage on warm near-black */
  --bg: #141311;
  --panel: #1a1916;
  --panel-alt: #131210;
  --border: #2a2822;
  --border-subtle: #1f1e1a;

  --text: #e8e6e1;
  --text-muted: #8a8680;
  --text-disabled: #5a5650;
  --text-dim: #3a3834;

  --accent-gold: #c9922f;
  --accent-gold-bg: rgba(201, 146, 47, 0.06);
  --accent-gold-border: rgba(201, 146, 47, 0.3);

  --accent-sage: #7fb2a1;
  --accent-sage-bg: rgba(127, 178, 161, 0.08);

  --error: #dc5050;
  --warn: #c9922f;
  --success: #7fb2a1;

  /* Syntax tokens */
  --code-keyword: #c9922f;
  --code-function: #e8c585;
  --code-string: #a8c479;
  --code-number: #d19a66;
  --code-comment: #5a5650;
  --code-type: #7fb2a1;

  /* Fonts */
  --font-ui: "Instrument Sans", -apple-system, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", "Consolas", "SFMono-Regular", monospace;

  /* Radii */
  --radius-sm: 2px;
  --radius-md: 3px;
  --radius-lg: 5px;

  /* Layout */
  --rail-w: 132px;
  --sidebar-w: 240px;
  --titlebar-h: 28px;
  --actionbar-h: 44px;
  --statusbar-h: 22px;
  --bottompanel-h: 180px;
}
```

- [ ] **Step 2: Create `src/styles/global.css`**

```css
*, *::before, *::after { box-sizing: border-box; }
html, body, #app { height: 100vh; width: 100vw; margin: 0; padding: 0; overflow: hidden; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 13px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  user-select: none;
}
button, input, textarea, select { font-family: inherit; color: inherit; }
button { cursor: pointer; border: none; background: transparent; }
code { font-family: var(--font-mono); font-size: 0.95em; }

/* root layout grid */
.app-shell {
  display: grid;
  grid-template-rows: var(--titlebar-h) var(--actionbar-h) 1fr auto var(--statusbar-h);
  height: 100vh;
}
.app-body {
  display: grid;
  grid-template-columns: var(--rail-w) var(--sidebar-w) 1fr;
  min-height: 0;
}
```

- [ ] **Step 3: Import in `src/main.tsx`**

Open `src/main.tsx`, ensure these lines appear near top (after existing imports):

```typescript
import "./styles/tokens.css";
import "./styles/global.css";
```

Remove the existing `import "./app.css"` and delete `src/app.css` if it exists from the scaffold.

- [ ] **Step 4: Verify app still runs, background is warm near-black**

```bash
pnpm tauri dev
```

Expected: window renders with `#141311` background. Existing Preact starter content should be visible but with our colors.

- [ ] **Step 5: Commit**

```bash
git add src/styles/ src/main.tsx
git rm src/app.css 2>nul || true
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "style: add Gold+Sage design tokens and global layout grid"
```

---

## Task 4: Bundle Instrument Sans + JetBrains Mono fonts locally

**Files:**
- Create: `public/fonts/InstrumentSans-{400,600,700}.woff2`
- Create: `public/fonts/JetBrainsMono-{400,500,700}.woff2`
- Create: `src/styles/fonts.css`
- Modify: `src/main.tsx` to import fonts.css

- [ ] **Step 1: Download fonts into `public/fonts/`**

Download these specific files:
- Instrument Sans from https://fonts.google.com/specimen/Instrument+Sans → get `.woff2` for weights 400, 600, 700 (both roman and italic optional — just roman for now)
- JetBrains Mono from https://fonts.google.com/specimen/JetBrains+Mono → get `.woff2` for weights 400, 500, 700

Save each as:
```
public/fonts/InstrumentSans-400.woff2
public/fonts/InstrumentSans-600.woff2
public/fonts/InstrumentSans-700.woff2
public/fonts/JetBrainsMono-400.woff2
public/fonts/JetBrainsMono-500.woff2
public/fonts/JetBrainsMono-700.woff2
```

- [ ] **Step 2: Create `src/styles/fonts.css`**

```css
@font-face {
  font-family: "Instrument Sans";
  font-weight: 400;
  font-style: normal;
  font-display: block;
  src: url("/fonts/InstrumentSans-400.woff2") format("woff2");
}
@font-face {
  font-family: "Instrument Sans";
  font-weight: 600;
  font-style: normal;
  font-display: block;
  src: url("/fonts/InstrumentSans-600.woff2") format("woff2");
}
@font-face {
  font-family: "Instrument Sans";
  font-weight: 700;
  font-style: normal;
  font-display: block;
  src: url("/fonts/InstrumentSans-700.woff2") format("woff2");
}
@font-face {
  font-family: "JetBrains Mono";
  font-weight: 400;
  font-style: normal;
  font-display: block;
  src: url("/fonts/JetBrainsMono-400.woff2") format("woff2");
}
@font-face {
  font-family: "JetBrains Mono";
  font-weight: 500;
  font-style: normal;
  font-display: block;
  src: url("/fonts/JetBrainsMono-500.woff2") format("woff2");
}
@font-face {
  font-family: "JetBrains Mono";
  font-weight: 700;
  font-style: normal;
  font-display: block;
  src: url("/fonts/JetBrainsMono-700.woff2") format("woff2");
}
```

- [ ] **Step 3: Import fonts.css in `src/main.tsx`**

Add before the tokens import:

```typescript
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/global.css";
```

- [ ] **Step 4: Verify fonts load**

Run `pnpm tauri dev`. Open DevTools (F12) → Network → filter Font. You should see all 6 `.woff2` files loaded with HTTP 200.

- [ ] **Step 5: Commit**

```bash
git add public/fonts/ src/styles/fonts.css src/main.tsx
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "chore: bundle Instrument Sans + JetBrains Mono fonts locally"
```

---

## Task 5: Create app state module (signals)

**Files:**
- Create: `src/state/appState.ts`

- [ ] **Step 1: Install Preact signals**

```bash
pnpm add @preact/signals
```

- [ ] **Step 2: Create `src/state/appState.ts`**

```typescript
import { signal, computed } from "@preact/signals";

export type RailIcon =
  | "home"
  | "files"
  | "examples"
  | "search"
  | "libraries"
  | "boards"
  | "walkthrough"
  | "settings";

/** Which rail icon is currently active — determines sidebar content */
export const activeRail = signal<RailIcon>("files");

/** Connected board name. null if none. */
export const connectedBoard = signal<string | null>("ForgeBoard Beginner");

/** Connected port. null if none. */
export const connectedPort = signal<string | null>("COM3");

/** Whether the bottom panel is expanded */
export const bottomPanelOpen = signal<boolean>(true);

/** Active tab in bottom panel */
export const bottomPanelTab = signal<"serial" | "output" | "plotter" | "problems">(
  "serial"
);

/** Selected bottom-panel tab badge: count for "problems" tab */
export const problemsCount = computed(() => 0); // Phase 6 wires this to findings

/** Currently open file tabs in the editor */
export const openTabs = signal<{ path: string; modified: boolean }[]>([
  { path: "led-chase.ino", modified: true },
  { path: "pins.h", modified: false },
  { path: "config.h", modified: false },
]);

/** Active tab index */
export const activeTabIndex = signal<number>(0);

/** Save indicator state */
export const saveState = signal<"saved" | "saving" | "unsaved">("saved");
```

- [ ] **Step 3: Commit**

```bash
git add src/state/appState.ts package.json pnpm-lock.yaml
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: add Preact signals for app state"
```

---

## Task 6: Build TitleBar component

**Files:**
- Create: `src/components/TitleBar.tsx`
- Create: `src/components/TitleBar.css`

- [ ] **Step 1: Write the component**

`src/components/TitleBar.tsx`:

```typescript
import "./TitleBar.css";
import { activeTabIndex, openTabs } from "../state/appState";

export function TitleBar() {
  const activeFile = openTabs.value[activeTabIndex.value]?.path ?? "—";

  return (
    <div class="titlebar" data-tauri-drag-region>
      <div class="titlebar-left">
        <span class="titlebar-brand">◆ ForgeBoard IDE</span>
        <span class="titlebar-sep">—</span>
        <span class="titlebar-file">{activeFile}</span>
      </div>
      <div class="titlebar-right">
        <span>— □ ×</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the styles**

`src/components/TitleBar.css`:

```css
.titlebar {
  height: var(--titlebar-h);
  background: var(--panel-alt);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  font-size: 10px;
  color: var(--text-muted);
  -webkit-app-region: drag;
}
.titlebar-brand {
  color: var(--accent-gold);
  font-weight: 700;
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.3px;
}
.titlebar-sep { color: var(--text-dim); margin: 0 8px; }
.titlebar-file { color: var(--text-dim); }
.titlebar-right { color: var(--text-dim); font-family: var(--font-mono); font-size: 11px; -webkit-app-region: no-drag; }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/TitleBar.tsx src/components/TitleBar.css
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: add TitleBar component with drag region"
```

---

## Task 7: Build LeftRail component with labeled icons

**Files:**
- Create: `src/components/LeftRail.tsx`
- Create: `src/components/LeftRail.css`

- [ ] **Step 1: Write the component**

`src/components/LeftRail.tsx`:

```typescript
import "./LeftRail.css";
import { activeRail, type RailIcon } from "../state/appState";

interface RailItem {
  id: RailIcon;
  icon: string;
  label: string;
}

const MAIN_ITEMS: RailItem[] = [
  { id: "home", icon: "⌂", label: "Home" },
  { id: "files", icon: "⎘", label: "Files" },
  { id: "examples", icon: "☰", label: "Examples" },
  { id: "search", icon: "⌕", label: "Search" },
  { id: "libraries", icon: "⬡", label: "Libraries" },
  { id: "boards", icon: "◆", label: "Boards" },
];

const HELP_ITEMS: RailItem[] = [
  { id: "walkthrough", icon: "?", label: "Walkthrough" },
  { id: "settings", icon: "⚙", label: "Settings" },
];

export function LeftRail() {
  return (
    <nav class="rail" aria-label="primary navigation">
      <div class="rail-section">
        {MAIN_ITEMS.map((item) => (
          <button
            class={`rail-item ${activeRail.value === item.id ? "active" : ""}`}
            onClick={() => (activeRail.value = item.id)}
            title={`${item.label}`}
          >
            <span class="rail-icon">{item.icon}</span>
            <span class="rail-label">{item.label}</span>
          </button>
        ))}
      </div>
      <div class="rail-section rail-section-footer">
        <div class="rail-divider">HELP</div>
        {HELP_ITEMS.map((item) => (
          <button
            class={`rail-item ${activeRail.value === item.id ? "active" : ""}`}
            onClick={() => (activeRail.value = item.id)}
          >
            <span class="rail-icon">{item.icon}</span>
            <span class="rail-label">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Write the styles**

`src/components/LeftRail.css`:

```css
.rail {
  background: var(--panel-alt);
  border-right: 1px solid var(--border-subtle);
  padding: 14px 0;
  display: flex;
  flex-direction: column;
  font-size: 10.5px;
}
.rail-section { display: flex; flex-direction: column; }
.rail-section-footer { margin-top: auto; }
.rail-item {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 9px 16px;
  color: var(--text-muted);
  border-left: 2px solid transparent;
  font-family: var(--font-ui);
  font-weight: 500;
  font-size: 10.5px;
  letter-spacing: 0.4px;
  transition: background-color 0.1s ease;
}
.rail-item:hover { background: var(--accent-gold-bg); color: var(--text); }
.rail-item.active { border-left-color: var(--accent-gold); color: var(--accent-gold); background: var(--accent-gold-bg); }
.rail-icon { width: 18px; font-family: var(--font-mono); font-size: 13px; text-align: center; }
.rail-label { flex: 1; text-align: left; }
.rail-divider {
  padding: 10px 16px 4px;
  color: var(--text-dim);
  font-size: 8.5px;
  letter-spacing: 1.5px;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/LeftRail.tsx src/components/LeftRail.css
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: add LeftRail with labeled navigation icons"
```

---

## Task 8: Build ActionBar component (verbs + selectors)

**Files:**
- Create: `src/components/ActionBar.tsx`
- Create: `src/components/ActionBar.css`

- [ ] **Step 1: Write the component**

`src/components/ActionBar.tsx`:

```typescript
import "./ActionBar.css";
import { connectedBoard, connectedPort } from "../state/appState";

export function ActionBar() {
  return (
    <div class="actionbar">
      <div class="actionbar-tabs">
        {/* Tab bar lives here in Task 10; placeholder for now */}
        <span class="actionbar-placeholder-tab">led-chase.ino</span>
      </div>

      <div class="actionbar-spacer" />

      <button class="btn btn-ghost" title="Check code for errors">
        <span class="btn-icon check">✓</span>
        <span>Check code</span>
      </button>

      <button class="btn btn-primary" title="Compile and upload to board">
        <span>Upload</span>
        <span>→</span>
      </button>

      <div class="actionbar-divider" />

      <div class="pill">
        <span class="pill-dot sage">◆</span>
        <span>{connectedBoard.value ?? "No board"}</span>
        <span class="pill-caret">▾</span>
      </div>

      <div class="pill">
        <span class="pill-dot-connected" />
        <span>{connectedPort.value ?? "No port"}</span>
        <span class="pill-caret">▾</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the styles**

`src/components/ActionBar.css`:

```css
.actionbar {
  height: var(--actionbar-h);
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
}
.actionbar-tabs { display: flex; gap: 2px; }
.actionbar-placeholder-tab {
  color: var(--accent-gold);
  padding: 6px 12px;
  font-size: 10.5px;
  border-top: 2px solid var(--accent-gold);
  background: var(--bg);
  font-family: var(--font-mono);
}
.actionbar-spacer { flex: 1; }
.actionbar-divider { width: 1px; height: 22px; background: var(--border); margin: 0 4px; }

.btn {
  padding: 7px 13px;
  font-size: 10.5px;
  font-family: var(--font-ui);
  letter-spacing: 0.3px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background-color 0.1s ease;
}
.btn-ghost { border: 1px solid var(--border); color: var(--text); }
.btn-ghost:hover { background: var(--panel-alt); }
.btn-primary { background: var(--accent-gold); color: var(--bg); font-weight: 700; }
.btn-primary:hover { background: #d8a145; }
.btn-icon.check { color: var(--accent-sage); font-size: 12px; }

.pill {
  background: var(--panel-alt);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 6px 11px;
  font-size: 10.5px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: var(--font-ui);
}
.pill-dot.sage { color: var(--accent-sage); }
.pill-dot-connected {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--accent-sage);
  box-shadow: 0 0 5px var(--accent-sage);
}
.pill-caret { color: var(--text-muted); font-size: 9px; }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ActionBar.tsx src/components/ActionBar.css
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: add ActionBar with Check/Upload verbs and board/port pills"
```

---

## Task 9: Build FileSidebar component (rail-switched content)

**Files:**
- Create: `src/components/FileSidebar.tsx`
- Create: `src/components/FileSidebar.css`

- [ ] **Step 1: Write the component**

`src/components/FileSidebar.tsx`:

```typescript
import "./FileSidebar.css";
import { activeRail } from "../state/appState";

function FilesView() {
  return (
    <>
      <div class="sb-header">
        <span class="sb-title">Your files</span>
        <span class="sb-new">+ new</span>
      </div>
      <div class="sb-body">
        <div class="sb-section-label">THIS SKETCH</div>
        <div class="sb-folder">
          <span class="sb-caret">▾</span> led-chase
        </div>
        <div class="sb-file active">
          <span class="sb-mod">●</span> led-chase.ino
        </div>
        <div class="sb-file">pins.h</div>
        <div class="sb-file">config.h</div>
        <div class="sb-add">+ add file</div>

        <div class="sb-section-label">RECENT</div>
        <div class="sb-folder muted">wifi-scanner</div>
        <div class="sb-folder muted">dht-reader</div>
        <div class="sb-folder muted">blink</div>
      </div>
    </>
  );
}

function PlaceholderView({ label }: { label: string }) {
  return (
    <div class="sb-body">
      <div class="sb-placeholder">{label} view coming in a later phase.</div>
    </div>
  );
}

export function FileSidebar() {
  const rail = activeRail.value;
  return (
    <aside class="sidebar">
      {rail === "files" && <FilesView />}
      {rail === "home" && <PlaceholderView label="Home" />}
      {rail === "examples" && <PlaceholderView label="Examples" />}
      {rail === "search" && <PlaceholderView label="Search" />}
      {rail === "libraries" && <PlaceholderView label="Libraries" />}
      {rail === "boards" && <PlaceholderView label="Boards" />}
      {rail === "walkthrough" && <PlaceholderView label="Walkthrough" />}
      {rail === "settings" && <PlaceholderView label="Settings" />}
    </aside>
  );
}
```

- [ ] **Step 2: Write the styles**

`src/components/FileSidebar.css`:

```css
.sidebar {
  background: var(--panel-alt);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.sb-header {
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sb-title { color: var(--text); font-family: var(--font-ui); font-weight: 600; font-size: 12px; }
.sb-new { color: var(--accent-gold); font-size: 11px; cursor: pointer; }

.sb-body { padding: 12px 10px; flex: 1; overflow-y: auto; }

.sb-section-label {
  color: var(--text-muted);
  letter-spacing: 1.2px;
  font-size: 8.5px;
  font-weight: 700;
  margin: 14px 8px 7px;
  font-family: var(--font-mono);
}
.sb-section-label:first-child { margin-top: 0; }

.sb-folder {
  color: var(--text);
  padding: 3px 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 10.5px;
  font-family: var(--font-ui);
}
.sb-folder.muted { color: var(--text-muted); }
.sb-caret { color: var(--accent-gold); font-size: 8px; width: 8px; }

.sb-file {
  color: var(--text-muted);
  padding: 3px 8px 3px 24px;
  font-size: 10px;
  font-family: var(--font-ui);
  cursor: pointer;
}
.sb-file.active {
  background: var(--accent-gold-bg);
  border-left: 2px solid var(--accent-gold);
  padding-left: 22px;
  color: var(--text);
}
.sb-mod { color: var(--accent-gold); font-size: 7px; margin-right: 5px; }
.sb-add { color: var(--text-dim); padding: 4px 24px; font-size: 10px; cursor: pointer; }
.sb-add:hover { color: var(--accent-gold); }

.sb-placeholder {
  color: var(--text-muted);
  padding: 40px 16px;
  text-align: center;
  font-size: 11px;
  line-height: 1.6;
  font-family: var(--font-ui);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/FileSidebar.tsx src/components/FileSidebar.css
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: add FileSidebar with rail-switched content"
```

---

## Task 10: Build EditorArea placeholder (Monaco comes in Phase 2)

**Files:**
- Create: `src/components/EditorArea.tsx`
- Create: `src/components/EditorArea.css`

- [ ] **Step 1: Write the component**

`src/components/EditorArea.tsx`:

```typescript
import "./EditorArea.css";

export function EditorArea() {
  return (
    <main class="editor-area">
      <div class="editor-placeholder">
        <div class="editor-placeholder-label">EDITOR</div>
        <div class="editor-placeholder-text">Monaco editor integration arrives in Phase 2.</div>
        <div class="editor-placeholder-sub">This region will host syntax-highlighted Arduino code with tabs, breadcrumb, and Smart Help squiggles.</div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Write the styles**

`src/components/EditorArea.css`:

```css
.editor-area {
  background: var(--bg);
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}
.editor-placeholder { text-align: center; max-width: 520px; }
.editor-placeholder-label {
  color: var(--accent-gold);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 2.5px;
  font-weight: 700;
}
.editor-placeholder-text {
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 20px;
  font-weight: 700;
  margin-top: 8px;
  line-height: 1.3;
}
.editor-placeholder-sub {
  color: var(--text-muted);
  font-size: 12px;
  margin-top: 12px;
  line-height: 1.6;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/EditorArea.tsx src/components/EditorArea.css
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: add EditorArea placeholder (Monaco coming Phase 2)"
```

---

## Task 11: Build BottomPanel with tabs (Serial/Output/Plotter/Problems)

**Files:**
- Create: `src/components/BottomPanel.tsx`
- Create: `src/components/BottomPanel.css`

- [ ] **Step 1: Write the component**

`src/components/BottomPanel.tsx`:

```typescript
import "./BottomPanel.css";
import { bottomPanelTab, bottomPanelOpen, problemsCount } from "../state/appState";

const TABS = [
  { id: "serial", label: "Serial Monitor" },
  { id: "output", label: "Output" },
  { id: "plotter", label: "Plotter" },
  { id: "problems", label: "Problems" },
] as const;

export function BottomPanel() {
  if (!bottomPanelOpen.value) {
    return (
      <div class="bp-collapsed">
        <button class="bp-expand" onClick={() => (bottomPanelOpen.value = true)}>
          ▲ Show panel (Ctrl+`)
        </button>
      </div>
    );
  }
  return (
    <section class="bp">
      <div class="bp-tabs">
        {TABS.map((tab) => (
          <button
            class={`bp-tab ${bottomPanelTab.value === tab.id ? "active" : ""}`}
            onClick={() => (bottomPanelTab.value = tab.id)}
          >
            {tab.label}
            {tab.id === "problems" && (
              <span class="bp-tab-badge">· {problemsCount.value}</span>
            )}
          </button>
        ))}
        <div class="bp-spacer" />
        <button class="bp-action" title="Collapse panel" onClick={() => (bottomPanelOpen.value = false)}>
          ▼
        </button>
      </div>
      <div class="bp-body">
        <div class="bp-placeholder">
          {bottomPanelTab.value === "serial" && "Serial Monitor — arrives in Phase 5."}
          {bottomPanelTab.value === "output" && "Compile output — arrives in Phase 4."}
          {bottomPanelTab.value === "plotter" && "Serial Plotter — arrives in Phase 11."}
          {bottomPanelTab.value === "problems" && "Problems list — arrives with Smart Help in Phase 6."}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Write the styles**

`src/components/BottomPanel.css`:

```css
.bp {
  background: var(--panel-alt);
  border-top: 1px solid var(--border-subtle);
  height: var(--bottompanel-h);
  display: flex;
  flex-direction: column;
}
.bp-collapsed {
  background: var(--panel-alt);
  border-top: 1px solid var(--border-subtle);
  padding: 4px 14px;
  display: flex;
  align-items: center;
  font-family: var(--font-ui);
  font-size: 10px;
}
.bp-expand { color: var(--text-muted); font-size: 10px; }
.bp-expand:hover { color: var(--accent-gold); }

.bp-tabs {
  display: flex;
  padding: 0 14px;
  gap: 20px;
  align-items: center;
  font-family: var(--font-ui);
  font-size: 10.5px;
}
.bp-tab {
  color: var(--text-muted);
  padding: 9px 0;
  border-bottom: 2px solid transparent;
  font-weight: 500;
}
.bp-tab.active { color: var(--text); border-bottom-color: var(--accent-gold); font-weight: 600; }
.bp-tab:hover { color: var(--text); }
.bp-tab-badge { color: var(--text-dim); font-size: 9.5px; }

.bp-spacer { flex: 1; }
.bp-action { color: var(--text-muted); font-size: 10px; padding: 5px 8px; }
.bp-action:hover { color: var(--accent-gold); }

.bp-body { flex: 1; overflow: hidden; padding: 12px 14px; }
.bp-placeholder {
  color: var(--text-muted);
  font-size: 11px;
  font-family: var(--font-ui);
  padding: 20px 0;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/BottomPanel.tsx src/components/BottomPanel.css
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: add BottomPanel with Serial/Output/Plotter/Problems tabs"
```

---

## Task 12: Build StatusBar component

**Files:**
- Create: `src/components/StatusBar.tsx`
- Create: `src/components/StatusBar.css`

- [ ] **Step 1: Write the component**

`src/components/StatusBar.tsx`:

```typescript
import "./StatusBar.css";
import { connectedBoard, connectedPort, saveState } from "../state/appState";

export function StatusBar() {
  return (
    <footer class="statusbar">
      <span class="sb-item">
        <span class="sb-dot connected" />
        {connectedPort.value ?? "—"} · 115200
      </span>
      <span class="sb-item muted">{connectedBoard.value ?? "No board"}</span>
      <span class="sb-item">Ln 14 · Col 22</span>
      <span class="sb-item">Spaces: 2</span>
      <span class="sb-spacer" />
      <span class="sb-item">UTF-8</span>
      <span class="sb-item">LF</span>
      <span class="sb-item">C++</span>
      <span class={`sb-item save-state ${saveState.value}`}>
        {saveState.value === "saved" && "✓ Saved"}
        {saveState.value === "saving" && "… Saving"}
        {saveState.value === "unsaved" && "● Unsaved"}
      </span>
    </footer>
  );
}
```

- [ ] **Step 2: Write the styles**

`src/components/StatusBar.css`:

```css
.statusbar {
  height: var(--statusbar-h);
  background: var(--panel-alt);
  border-top: 1px solid var(--border-subtle);
  display: flex;
  gap: 18px;
  padding: 0 14px;
  font-size: 9px;
  color: var(--text-muted);
  font-family: var(--font-ui);
  align-items: center;
}
.sb-item { display: inline-flex; align-items: center; gap: 5px; }
.sb-item.muted { color: var(--text-disabled); }
.sb-dot { width: 6px; height: 6px; border-radius: 50%; }
.sb-dot.connected { background: var(--accent-sage); box-shadow: 0 0 4px var(--accent-sage); }
.sb-spacer { flex: 1; }
.save-state.saved { color: var(--accent-sage); }
.save-state.saving { color: var(--accent-gold); }
.save-state.unsaved { color: var(--warn); }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/StatusBar.tsx src/components/StatusBar.css
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: add StatusBar with board/port/line-col/save-state"
```

---

## Task 13: Wire everything together in App.tsx

**Files:**
- Modify: `src/App.tsx` (completely replace existing content)

- [ ] **Step 1: Replace App.tsx**

Overwrite `src/App.tsx`:

```typescript
import { TitleBar } from "./components/TitleBar";
import { ActionBar } from "./components/ActionBar";
import { LeftRail } from "./components/LeftRail";
import { FileSidebar } from "./components/FileSidebar";
import { EditorArea } from "./components/EditorArea";
import { BottomPanel } from "./components/BottomPanel";
import { StatusBar } from "./components/StatusBar";

export default function App() {
  return (
    <div class="app-shell">
      <TitleBar />
      <ActionBar />
      <div class="app-body">
        <LeftRail />
        <FileSidebar />
        <EditorArea />
      </div>
      <BottomPanel />
      <StatusBar />
    </div>
  );
}
```

- [ ] **Step 2: Run and eyeball the layout**

```bash
pnpm tauri dev
```

Expected: 1400×900 window with, top to bottom: thin title bar (brand + file name), action bar (verb buttons + pills), three-column body (rail labeled / files sidebar / editor placeholder), bottom panel with tabs, thin status bar.

- [ ] **Step 3: Click each rail icon, verify sidebar content swaps**

Click "Home" → sidebar shows "Home view coming in a later phase."
Click "Boards" → shows "Boards view coming..."
Click "Files" → shows the actual file tree.

- [ ] **Step 4: Click each bottom-panel tab, verify content swaps**

Click "Output" → text says "Compile output — arrives in Phase 4."
Click "Plotter" → text says "Serial Plotter..."

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: assemble full app shell layout in App.tsx"
```

---

## Task 14: Set up IPC ping command (frontend ↔ Rust)

**Files:**
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/ping.rs`
- Modify: `src-tauri/src/main.rs` (register command)
- Create: `src/ipc/ping.ts`

- [ ] **Step 1: Write the Rust command**

Create `src-tauri/src/commands/mod.rs`:
```rust
pub mod ping;
```

Create `src-tauri/src/commands/ping.rs`:
```rust
use serde::Serialize;

#[derive(Serialize)]
pub struct PingResponse {
    pub pong: String,
    pub version: String,
}

#[tauri::command]
pub fn ping() -> PingResponse {
    PingResponse {
        pong: "ForgeBoard IDE backend is alive".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}
```

- [ ] **Step 2: Register the command in main.rs**

Open `src-tauri/src/main.rs`. Replace its contents with:

```rust
// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::ping::ping,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Write a unit test for the command**

Append to `src-tauri/src/commands/ping.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ping_returns_pong_and_version() {
        let resp = ping();
        assert_eq!(resp.pong, "ForgeBoard IDE backend is alive");
        assert!(!resp.version.is_empty(), "version should be populated");
    }
}
```

- [ ] **Step 4: Run the Rust test**

```bash
cd src-tauri
cargo test
```

Expected: `test tests::ping_returns_pong_and_version ... ok` and `1 passed`.

- [ ] **Step 5: Write the frontend wrapper**

Create `src/ipc/ping.ts`:

```typescript
import { invoke } from "@tauri-apps/api/core";

export interface PingResponse {
  pong: string;
  version: string;
}

export async function ping(): Promise<PingResponse> {
  return invoke<PingResponse>("ping");
}
```

- [ ] **Step 6: Wire a dev-only ping button into StatusBar**

Modify `src/components/StatusBar.tsx` to add a ping-test action. Replace the `<span class="sb-spacer" />` line with:

```typescript
<button
  class="sb-item sb-ping"
  onClick={async () => {
    const { ping } = await import("../ipc/ping");
    const r = await ping();
    alert(`${r.pong} (v${r.version})`);
  }}
>
  ping
</button>
<span class="sb-spacer" />
```

And add to `StatusBar.css`:
```css
.sb-ping { color: var(--accent-gold); cursor: pointer; }
```

- [ ] **Step 7: Run the app, click "ping" in the status bar**

```bash
pnpm tauri dev
```

Expected: click "ping" → native alert box appears: `ForgeBoard IDE backend is alive (v0.1.0-dev)`. Close the alert.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/ src/ipc/ src/components/StatusBar.tsx src/components/StatusBar.css
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: add IPC ping command, verify frontend<->Rust handshake"
```

---

## Task 15: Install Vitest + Testing Library, write first component test

**Files:**
- Modify: `package.json` (add test scripts + deps)
- Create: `tests/setup.ts`
- Create: `tests/components/TitleBar.spec.tsx`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install test dependencies**

```bash
pnpm add -D vitest jsdom @testing-library/preact @testing-library/jest-dom
```

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
  },
});
```

- [ ] **Step 3: Create `tests/setup.ts`**

```typescript
import "@testing-library/jest-dom";
```

- [ ] **Step 4: Add test scripts to `package.json`**

Inside `"scripts"` in `package.json`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Write the failing test**

Create `tests/components/TitleBar.spec.tsx`:

```typescript
import { render, screen } from "@testing-library/preact";
import { TitleBar } from "../../src/components/TitleBar";

describe("TitleBar", () => {
  it("renders the ForgeBoard IDE brand", () => {
    render(<TitleBar />);
    expect(screen.getByText(/ForgeBoard IDE/i)).toBeInTheDocument();
  });

  it("shows the active file name", () => {
    render(<TitleBar />);
    expect(screen.getByText(/led-chase.ino/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the test**

```bash
pnpm test
```

Expected: `2 passed` (both tests green because components were built in Task 6). If failing, inspect the output and fix the test or component.

- [ ] **Step 7: Commit**

```bash
git add tests/ vitest.config.ts package.json pnpm-lock.yaml
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "test: add Vitest + component tests for TitleBar"
```

---

## Task 16: End-to-end smoke test — launch the app, verify all panels render

**Files:**
- Verify only: running app

- [ ] **Step 1: Run the full app**

```bash
pnpm tauri dev
```

- [ ] **Step 2: Manually verify each region is visible**

Check each item:
- [ ] Title bar at top with `◆ ForgeBoard IDE — led-chase.ino` in gold/grey
- [ ] Action bar below with: one placeholder tab, spacer, "✓ Check code" ghost button, gold "Upload →" primary button, board pill "◆ ForgeBoard Beginner ▾", port pill (with sage connected dot) "COM3 ▾"
- [ ] Left rail (132px) labeled: Home / Files (active, gold left border) / Examples / Search / Libraries / Boards / HELP divider / Walkthrough / Settings
- [ ] File sidebar (240px) showing "Your files" header + "THIS SKETCH" section with `led-chase.ino` highlighted + "RECENT" section with 3 muted folder names
- [ ] Editor placeholder centered showing "Monaco editor integration arrives in Phase 2."
- [ ] Bottom panel (180px) with tabs `Serial Monitor` (active), `Output`, `Plotter`, `Problems · 0`
- [ ] Status bar (22px) showing connected COM3, board name, Ln/Col, save state

- [ ] **Step 3: Click each rail icon and verify sidebar swaps**

Each of the 8 rail items should swap the sidebar body content (only "Files" has real content; others show placeholder text).

- [ ] **Step 4: Click each bottom-panel tab and verify body swaps**

Each of the 4 bottom-panel tabs should change the placeholder text in the panel body.

- [ ] **Step 5: Click "ping" in status bar and verify alert**

An OS alert should display `ForgeBoard IDE backend is alive (v0.1.0-dev)`.

- [ ] **Step 6: Close the window**

Close via × button. Process should terminate cleanly (no error spam in terminal).

- [ ] **Step 7: Run all tests one more time**

```bash
pnpm test
cd src-tauri && cargo test && cd ..
```

Expected: all green.

- [ ] **Step 8: Final commit**

Nothing to commit (no code changes). Phase 1 is done.

- [ ] **Step 9: Tag Phase 1 completion**

```bash
git tag -a phase1-shell -m "Phase 1 complete: core shell + layout skeleton + IPC handshake"
```

---

## Self-Review

**Spec coverage:**
- ✅ Tauri 2 + Monaco + arduino-cli → Tauri 2 scaffolded (Task 1), Monaco deferred to Phase 2
- ✅ Gold+Sage palette → tokens.css (Task 3)
- ✅ Instrument Sans + JetBrains Mono → bundled (Task 4)
- ✅ Cursor-standard layout → all 7 regions (Tasks 6-12) + assembled (Task 13)
- ✅ Labeled rail (8 items) → LeftRail (Task 7)
- ✅ IPC established → ping command (Task 14)
- ✅ Tests wired up → Vitest + Rust tests (Tasks 14, 15)
- ⏭ Monaco editor → Phase 2
- ⏭ arduino-cli compile → Phase 4
- ⏭ Smart Help analyzer → Phase 6
- ⏭ Serial monitor → Phase 5

**Placeholder scan:** No `TBD`, `TODO`, or "implement later" in any task. Every code block is complete and runnable.

**Type consistency:** `RailIcon` type matches across `appState.ts` and `LeftRail.tsx`. `PingResponse` interface matches between Rust (`PingResponse` struct) and TS (`PingResponse` interface).

**Scope check:** Phase 1 is cleanly scoped to "shell + IPC handshake + first test". All real logic (editor, compile, serial, analyzer) is deferred to later phases. This is a ~1-week chunk for a solo dev.

---

*End of Phase 1 plan. Next phase (Phase 2: Monaco Editor) will be written after Phase 1 ships and we know what we learned.*
