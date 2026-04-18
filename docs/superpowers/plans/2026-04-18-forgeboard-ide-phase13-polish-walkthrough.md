# ForgeBoard IDE — Phase 13: Polish + Walkthrough

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Prerequisite: `phase12-settings-palette`.

**Goal:** Final pre-release polish — replace unicode-character icons with real SVG icons, add subtle micro-animations, implement the opt-in first-run walkthrough, make sure every empty state has a welcoming message, and tighten visual consistency.

**Architecture:** Icons via Phosphor Icons (MIT, ~200 line weights). Animations via CSS transitions (no heavy libraries). Walkthrough is an overlay with step-by-step tooltips, stored `seen` flag in settings.

---

## File Structure

```
src/
├── components/
│   ├── icons/                   # NEW — icon components
│   │   ├── Icon.tsx
│   │   └── icon-set.ts          # registry
│   ├── Walkthrough.tsx          # NEW
│   ├── Walkthrough.css
│   └── Toast.tsx                # NEW — subtle success/error notifications
│   └── Toast.css
├── state/
│   └── ui.ts                    # NEW — toast + walkthrough state
```

---

## Task 1: Install Phosphor Icons and build icon registry

- [ ] **Step 1: Install**

```bash
pnpm add @phosphor-icons/core
```

- [ ] **Step 2: Write Icon component**

`src/components/icons/Icon.tsx`:

```typescript
import { ICONS } from "./icon-set";
import type { JSX } from "preact";

interface Props extends JSX.HTMLAttributes<SVGSVGElement> {
  name: keyof typeof ICONS;
  size?: number;
}

export function Icon({ name, size = 16, ...props }: Props) {
  const path = ICONS[name];
  return (
    <svg
      {...props}
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="currentColor"
      dangerouslySetInnerHTML={{ __html: path }}
    />
  );
}
```

- [ ] **Step 3: Write icon-set.ts**

```typescript
// Extracted paths from Phosphor Regular. For brevity, use a small seed set;
// expand as the project needs more.
export const ICONS = {
  home: '<path d="M218.83 103.77 138.8 32.35a16 16 0 0 0-21.6 0l-80 71.42A16 16 0 0 0 32 115.55V208a16 16 0 0 0 16 16h144a16 16 0 0 0 16-16v-92.45a16 16 0 0 0-5.17-11.78ZM160 208h-64v-48h64Zm32 0h-16v-48a16 16 0 0 0-16-16h-64a16 16 0 0 0-16 16v48H48V115.55l.11-.09L128.05 44l80 71.43v92.57Z"/>',
  files: '<path d="M213.66 82.34l-56-56A8 8 0 0 0 152 24H56a16 16 0 0 0-16 16v176a16 16 0 0 0 16 16h144a16 16 0 0 0 16-16V88a8 8 0 0 0-2.34-5.66ZM152 48l40 40h-40Zm48 168H56V40h80v48a16 16 0 0 0 16 16h48Z"/>',
  examples: '<path d="M40 128a8 8 0 0 1 8-8h160a8 8 0 0 1 0 16H48a8 8 0 0 1-8-8Zm8-56h160a8 8 0 0 0 0-16H48a8 8 0 0 0 0 16Zm160 112H48a8 8 0 0 0 0 16h160a8 8 0 0 0 0-16Z"/>',
  search: '<path d="M229.66 218.34l-50.07-50.06a88.11 88.11 0 1 0-11.31 11.31l50.06 50.07a8 8 0 0 0 11.32-11.32ZM40 112a72 72 0 1 1 72 72 72.08 72.08 0 0 1-72-72Z"/>',
  libraries: '<path d="M184 72v88a32 32 0 0 1-64 0V72a32 32 0 0 1 64 0Zm-16 88V72a16 16 0 0 0-32 0v88a16 16 0 0 0 32 0ZM56 216h16V40H56Zm48 0h16V40h-16ZM216 28l-35.29 144.88a.05.05 0 0 0 0 .05l-2.75 11.3A16 16 0 0 0 191 204.72l36.32-3.19a16 16 0 0 0 14-13.45L261.11 48.32A16 16 0 0 0 248.84 31l-21.46-4.94A16 16 0 0 0 216 28Zm17.32 24.36-35.29 144.89h-.06l-19.35-4.47 35.29-144.89Z"/>',
  boards: '<path d="M208 32H48a16 16 0 0 0-16 16v160a16 16 0 0 0 16 16h160a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16Zm0 176H48V48h160ZM72 80h16v16H72Zm0 48h16v16H72Zm0 48h16v16H72Zm48-96h80v16h-80Zm0 48h80v16h-80Zm0 48h80v16h-80Z"/>',
  settings: '<path d="M128 80a48 48 0 1 0 48 48 48.05 48.05 0 0 0-48-48Zm0 80a32 32 0 1 1 32-32 32 32 0 0 1-32 32Zm88-29.84q.06-2.16 0-4.32l14.92-18.64a8 8 0 0 0 1.48-7.06 107.21 107.21 0 0 0-10.88-26.25 8 8 0 0 0-6-3.93l-23.72-2.64q-1.48-1.56-3-3L186 40.54a8 8 0 0 0-3.94-6 107.71 107.71 0 0 0-26.25-10.87 8 8 0 0 0-7.06 1.49L130.16 40Q128 40 125.84 40L107.2 25.11a8 8 0 0 0-7.06-1.48A107.6 107.6 0 0 0 73.89 34.51a8 8 0 0 0-3.93 6l-2.64 23.72q-1.56 1.49-3 3L40.54 70a8 8 0 0 0-6 3.94 107.71 107.71 0 0 0-10.87 26.25 8 8 0 0 0 1.49 7.06L40 125.84Q40 128 40 130.16L25.11 148.8a8 8 0 0 0-1.48 7.06 107.21 107.21 0 0 0 10.88 26.25 8 8 0 0 0 6 3.93l23.72 2.64q1.49 1.56 3 3L70 215.46a8 8 0 0 0 3.94 6 107.71 107.71 0 0 0 26.25 10.87 8 8 0 0 0 7.06-1.49L125.84 216q2.16.06 4.32 0l18.64 14.92a8 8 0 0 0 7.06 1.48 107.21 107.21 0 0 0 26.25-10.88 8 8 0 0 0 3.93-6l2.64-23.72q1.56-1.48 3-3L215.46 186a8 8 0 0 0 6-3.94 107.71 107.71 0 0 0 10.87-26.25 8 8 0 0 0-1.49-7.06Zm-16.1-6.5a73.93 73.93 0 0 1 0 8.68 8 8 0 0 0 1.74 5.48l14.19 17.73a91.57 91.57 0 0 1-6.23 15l-22.6 2.56a8 8 0 0 0-5.1 2.64 74.11 74.11 0 0 1-6.14 6.14 8 8 0 0 0-2.64 5.1l-2.51 22.58a91.32 91.32 0 0 1-15 6.23l-17.74-14.19a8 8 0 0 0-5-1.75h-.48a73.93 73.93 0 0 1-8.68 0 8 8 0 0 0-5.48 1.74L98.65 217a91.57 91.57 0 0 1-15-6.23l-2.58-22.6a8 8 0 0 0-2.64-5.1 74.11 74.11 0 0 1-6.14-6.14 8 8 0 0 0-5.1-2.64l-22.58-2.56a91.32 91.32 0 0 1-6.23-15l14.19-17.74a8 8 0 0 0 1.74-5.48 73.93 73.93 0 0 1 0-8.68 8 8 0 0 0-1.74-5.48L39 97.35a91.57 91.57 0 0 1 6.23-15l22.6-2.58a8 8 0 0 0 5.1-2.64 74.11 74.11 0 0 1 6.14-6.14A8 8 0 0 0 81.67 66l2.51-22.58a91.32 91.32 0 0 1 15-6.23l17.74 14.19a8 8 0 0 0 5.48 1.74 73.93 73.93 0 0 1 8.68 0 8 8 0 0 0 5.48-1.74L154.35 39a91.57 91.57 0 0 1 15 6.23l2.58 22.6a8 8 0 0 0 2.64 5.1 74.11 74.11 0 0 1 6.14 6.14 8 8 0 0 0 5.1 2.64l22.58 2.51a91.32 91.32 0 0 1 6.23 15l-14.19 17.74a8 8 0 0 0-1.74 5.48Z"/>',
  check: '<path d="M229.66 77.66l-128 128a8 8 0 0 1-11.32 0l-56-56a8 8 0 0 1 11.32-11.32L96 188.69 218.34 66.34a8 8 0 0 1 11.32 11.32Z"/>',
  upload: '<path d="M240 136v64a16 16 0 0 1-16 16H32a16 16 0 0 1-16-16v-64a8 8 0 0 1 16 0v64h192v-64a8 8 0 0 1 16 0Zm-128-57.37V160a8 8 0 0 0 16 0V78.63l28.69 28.68a8 8 0 0 0 11.31-11.31l-42.34-42.35a8 8 0 0 0-11.32 0L72 95.94a8 8 0 0 0 11.31 11.31Z"/>',
  close: '<path d="M205.66 194.34a8 8 0 0 1-11.32 11.32L128 139.31l-66.34 66.35a8 8 0 0 1-11.32-11.32L116.69 128 50.34 61.66a8 8 0 0 1 11.32-11.32L128 116.69l66.34-66.35a8 8 0 0 1 11.32 11.32L139.31 128Z"/>',
  question: '<path d="M140 180a12 12 0 1 1-12-12 12 12 0 0 1 12 12ZM128 72c-22.06 0-40 16.15-40 36v4a8 8 0 0 0 16 0v-4c0-11 10.77-20 24-20s24 9 24 20-10.77 20-24 20a8 8 0 0 0-8 8v8a8 8 0 0 0 16 0v-.72c18.24-3.35 32-17.9 32-35.28 0-19.85-17.94-36-40-36Z"/>',
};
```

- [ ] **Step 4: Replace unicode icons with <Icon>**

In `LeftRail.tsx`, change:
```typescript
import { Icon } from "./icons/Icon";
// ...
const MAIN_ITEMS = [
  { id: "home", icon: "home", label: "Home" },
  { id: "files", icon: "files", label: "Files" },
  { id: "examples", icon: "examples", label: "Examples" },
  { id: "search", icon: "search", label: "Search" },
  { id: "libraries", icon: "libraries", label: "Libraries" },
  { id: "boards", icon: "boards", label: "Boards" },
];
// ...
<span class="rail-icon"><Icon name={item.icon as any} size={18} /></span>
```

Similarly update TabBar close, ActionBar Check/Upload, SettingsView etc.

- [ ] **Step 5: Commit**

```bash
git add src/components/icons/ src/components/LeftRail.tsx src/components/TabBar.tsx src/components/ActionBar.tsx
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "chore: replace unicode glyphs with Phosphor SVG icons"
```

---

## Task 2: Micro-animations

- [ ] **Step 1: Update global.css with transitions**

Add to `src/styles/global.css`:

```css
/* Subtle transitions on everything interactive */
button, .tab, .rail-item, .sb-file, .bs-item, .ps-item, .cp-item,
.bv-row, .lv-row, .fp-item {
  transition: background-color 0.12s ease, color 0.12s ease,
              border-color 0.12s ease;
}

/* Fade-in on mount for views */
.sv, .bv, .lv, .ev, .sm, .sp, .fp {
  animation: fade-in 0.18s ease-out;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Palette entrance */
.cp {
  animation: palette-in 0.15s cubic-bezier(0.2, 0.8, 0.2, 1);
}
@keyframes palette-in {
  from { opacity: 0; transform: translateY(-8px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* Success pulse when save completes */
.save-state.saved {
  animation: sage-pulse 0.6s ease-out;
}
@keyframes sage-pulse {
  0% { color: var(--accent-gold); }
  50% { color: var(--accent-sage); transform: scale(1.04); }
  100% { color: var(--accent-sage); transform: scale(1); }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/global.css
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "style: micro-animations for panels, palette, save state"
```

---

## Task 3: Toast notifications

**Files:** Create `src/state/ui.ts`, `src/components/Toast.tsx`, `Toast.css`

- [ ] **Step 1: Write ui.ts**

```typescript
import { signal } from "@preact/signals";

export interface ToastEntry {
  id: number;
  kind: "info" | "success" | "error";
  message: string;
}

export const toasts = signal<ToastEntry[]>([]);
let nextId = 1;

export function toast(kind: ToastEntry["kind"], message: string, timeoutMs = 3500) {
  const id = nextId++;
  toasts.value = [...toasts.value, { id, kind, message }];
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, timeoutMs);
}
```

- [ ] **Step 2: Write Toast component**

```typescript
import { toasts } from "../state/ui";
import "./Toast.css";

export function ToastStack() {
  return (
    <div class="toast-stack">
      {toasts.value.map((t) => (
        <div class={`toast toast-${t.kind}`}>{t.message}</div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write CSS**

```css
.toast-stack {
  position: fixed; bottom: 32px; right: 16px;
  display: flex; flex-direction: column-reverse; gap: 8px;
  z-index: 300; pointer-events: none;
}
.toast {
  padding: 10px 16px; border-radius: 4px;
  background: var(--panel); border: 1px solid var(--border);
  color: var(--text); font-size: 11.5px; font-family: var(--font-ui);
  box-shadow: 0 8px 22px rgba(0,0,0,0.5);
  animation: toast-in 0.2s ease-out;
  max-width: 360px;
}
.toast-success { border-left: 3px solid var(--accent-sage); }
.toast-error { border-left: 3px solid var(--error); }
.toast-info { border-left: 3px solid var(--accent-gold); }
@keyframes toast-in {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}
```

- [ ] **Step 4: Mount in App.tsx**

```tsx
import { ToastStack } from "./components/Toast";
// at end of App:
<ToastStack />
```

- [ ] **Step 5: Call `toast(...)` on compile success/failure, upload, save errors**

In ActionBar.tsx, `doUpload`:
```typescript
import { toast } from "../state/ui";
// in success case:
toast("success", `Uploaded to ${connectedBoard.value} · ${connectedPort.value}`);
// in error:
toast("error", "Upload failed — check connection + board selection");
```

Similarly in autosave on error.

- [ ] **Step 6: Commit**

```bash
git add src/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: Toast notifications for key events"
```

---

## Task 4: First-run Walkthrough

**Files:** Create `src/components/Walkthrough.tsx`, `Walkthrough.css`

- [ ] **Step 1: Write Walkthrough.tsx**

```typescript
import { useState } from "preact/hooks";
import { settings } from "../state/settings";
import "./Walkthrough.css";

interface Step { title: string; body: string; targetSelector?: string; }

const STEPS: Step[] = [
  {
    title: "Welcome to ForgeBoard IDE",
    body: "A quick 4-step tour. You can skip this anytime; it only appears on first run.",
  },
  {
    title: "1 · Pick your board",
    body: "Click the board pill up top. ForgeBoard Beginner + Intermediate are pre-installed. Click 'Install more…' for any Arduino-compatible board.",
    targetSelector: ".bs-btn",
  },
  {
    title: "2 · Connect your port",
    body: "Plug in a board via USB-C. The port dropdown auto-detects it within 2 seconds.",
    targetSelector: ".ps-btn",
  },
  {
    title: "3 · Open an example",
    body: "Click Examples in the left rail. Every sketch is one click away.",
    targetSelector: ".rail-item",
  },
  {
    title: "4 · Hit Upload",
    body: "The gold button compiles and flashes your code. Serial Monitor opens automatically.",
    targetSelector: ".btn-primary",
  },
];

export function Walkthrough() {
  const [step, setStep] = useState(0);
  const s = STEPS[step];

  function done() {
    settings.value = { ...settings.value, show_walkthrough_on_start: false };
  }

  if (!settings.value.show_walkthrough_on_start) return null;

  return (
    <div class="wt-overlay">
      <div class="wt-card">
        <div class="wt-stage">{step + 1} of {STEPS.length}</div>
        <div class="wt-title">{s.title}</div>
        <div class="wt-body">{s.body}</div>
        <div class="wt-dots">
          {STEPS.map((_, i) => <span class={`wt-dot ${i === step ? "active" : ""}`} />)}
        </div>
        <div class="wt-actions">
          <button class="wt-skip" onClick={done}>Skip tour</button>
          <div style={{ flex: 1 }} />
          {step > 0 && <button class="wt-back" onClick={() => setStep(step - 1)}>Back</button>}
          {step < STEPS.length - 1
            ? <button class="wt-next" onClick={() => setStep(step + 1)}>Next →</button>
            : <button class="wt-next" onClick={done}>Done</button>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: CSS**

```css
.wt-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center;
  z-index: 400;
}
.wt-card {
  width: 440px; background: var(--panel); border: 1px solid var(--border);
  border-radius: 6px; padding: 24px 28px;
  font-family: var(--font-ui); box-shadow: 0 20px 50px rgba(0,0,0,0.6);
  animation: palette-in 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.wt-stage {
  color: var(--accent-gold); font-family: var(--font-mono);
  font-size: 10px; letter-spacing: 1.5px; font-weight: 700;
}
.wt-title { color: var(--text); font-size: 20px; font-weight: 700; margin-top: 6px; letter-spacing: -0.3px; }
.wt-body { color: var(--text-muted); font-size: 12.5px; line-height: 1.6; margin-top: 10px; }
.wt-dots { display: flex; gap: 6px; margin: 18px 0 8px; }
.wt-dot { width: 20px; height: 2px; background: var(--border); border-radius: 1px; }
.wt-dot.active { background: var(--accent-gold); }
.wt-actions { display: flex; gap: 8px; margin-top: 14px; align-items: center; }
.wt-skip { color: var(--text-muted); font-size: 11px; background: transparent; }
.wt-skip:hover { color: var(--text); }
.wt-back { color: var(--text); border: 1px solid var(--border); padding: 6px 14px; border-radius: 3px; font-size: 11px; }
.wt-next { background: var(--accent-gold); color: var(--bg); padding: 6px 14px; border-radius: 3px; font-size: 11px; font-weight: 700; }
.wt-next:hover { background: #d8a145; }
```

- [ ] **Step 3: Render in App.tsx**

```tsx
import { Walkthrough } from "./components/Walkthrough";
<Walkthrough />
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Walkthrough.tsx src/components/Walkthrough.css src/App.tsx
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: first-run Walkthrough overlay, dismissible"
```

---

## Task 5: Empty-state polish

- [ ] **Step 1: Sweep every view's empty state**

Each view should show a friendly message when empty, not just a blank panel:

- **No sketch open** (Files view): "Open an example or create a new sketch to get started."
- **No boards installed** (Boards view): already covered with "INSTALL CORE →" buttons
- **No libraries installed** (Libraries view): already covered
- **No findings** (Findings panel): already says "No issues detected."
- **No serial connection** (Serial Monitor): already says "connect to a port first..."

Verify the copy is warm + actionable. Small rewrites as needed in each component file.

- [ ] **Step 2: Commit**

```bash
git add src/components/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "style: friendly empty states across all views"
```

---

## Task 6: Smoke test + tag

- [ ] **Step 1: Delete settings.json to simulate first run**

```bash
rm "$env:LOCALAPPDATA/ForgeBoard/settings.json"
```

- [ ] **Step 2: Run IDE**

```bash
pnpm tauri dev
```

- [ ] **Step 3: Verify**

- [ ] Walkthrough overlay appears with step 1/5
- [ ] Clicking Next advances; dots fill
- [ ] Clicking Skip or Done dismisses forever; `settings.json` shows `show_walkthrough_on_start: false`
- [ ] Relaunch → no walkthrough
- [ ] Icons everywhere are SVG (no unicode glyphs)
- [ ] Animations feel smooth (panel transitions, palette entrance)
- [ ] Upload triggers a green toast on success, red on failure

- [ ] **Step 4: Tag**

```bash
git tag -a phase13-polish -m "Phase 13 complete: icons, animations, walkthrough, toasts"
```

---

## Self-Review

- ✅ Icons via Phosphor SVGs
- ✅ Micro-animations (fade-in, palette entrance, save pulse)
- ✅ Toast notifications for key events
- ✅ First-run walkthrough with 5 steps
- ✅ Empty-state copy cleaned up
- ⏭ Full accessibility pass (ARIA, keyboard focus rings) — v1.1

---

*End of Phase 13. Next: Phase 14 — Signing + Release (the final phase).*
