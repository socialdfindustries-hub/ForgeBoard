# ForgeBoard IDE — Phase 12: Settings + Command Palette

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Prerequisite: `phase11-plotter`.

**Goal:** Add the Settings rail view with all user preferences (persisted to disk), and the `⌘K` global command palette that searches across files, commands, boards, libraries, examples, and settings in a single input.

**Architecture:** Settings stored in `%APPDATA%/ForgeBoard/settings.json` via new Rust commands. Command Palette is a floating modal overlay triggered by Ctrl/Cmd+K; indexes static commands + dynamic results from open files, recent sketches, installed libraries.

---

## File Structure

```
src-tauri/src/settings/
├── mod.rs
├── model.rs
├── store.rs
└── commands.rs

src/
├── ipc/settings.ts
├── state/settings.ts        # Settings signals (separate from appState for clarity)
├── components/
│   ├── SettingsView.tsx
│   ├── SettingsView.css
│   ├── CommandPalette.tsx
│   └── CommandPalette.css
├── lib/
│   └── palette-commands.ts  # static command registry
```

---

## Task 1: Settings storage (Rust)

**Files:** Create `src-tauri/src/settings/{mod.rs,model.rs,store.rs,commands.rs}`

- [ ] **Step 1: Write settings/model.rs**

```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Settings {
    pub editor_font_size: u32,        // px, default 13
    pub editor_tab_size: u32,         // default 2
    pub editor_minimap: bool,         // default false
    pub editor_autosave: bool,        // default true
    pub autosave_interval_ms: u32,    // default 2000
    pub smart_help_enabled: bool,     // default true
    pub smart_help_show_low_confidence: bool, // default false
    pub default_board: Option<String>, // fqbn
    pub default_port: Option<String>,
    pub default_baud: u32,            // default 115200
    pub default_line_ending: String,  // "LF" | "CRLF" | "CR" | "None"
    pub sketches_folder: Option<String>,
    pub show_walkthrough_on_start: bool, // default true, user dismisses
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            editor_font_size: 13,
            editor_tab_size: 2,
            editor_minimap: false,
            editor_autosave: true,
            autosave_interval_ms: 2000,
            smart_help_enabled: true,
            smart_help_show_low_confidence: false,
            default_board: None,
            default_port: None,
            default_baud: 115200,
            default_line_ending: "LF".into(),
            sketches_folder: None,
            show_walkthrough_on_start: true,
        }
    }
}
```

- [ ] **Step 2: Write settings/store.rs**

```rust
use super::model::Settings;
use std::path::PathBuf;

fn settings_file() -> Result<PathBuf, String> {
    let data = dirs::data_local_dir().ok_or("no data_local_dir")?;
    let dir = data.join("ForgeBoard");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

pub fn load() -> Settings {
    match settings_file().and_then(|p| {
        if !p.exists() { return Ok(Settings::default()); }
        std::fs::read_to_string(&p).map_err(|e| e.to_string())
    }) {
        Ok(s) if !s.is_empty() => serde_json::from_str(&s).unwrap_or_default(),
        _ => Settings::default(),
    }
}

pub fn save(settings: &Settings) -> Result<(), String> {
    let p = settings_file()?;
    std::fs::write(&p, serde_json::to_string_pretty(settings).unwrap())
        .map_err(|e| e.to_string())
}
```

- [ ] **Step 3: commands.rs**

```rust
use super::{model::Settings, store};

#[tauri::command]
pub fn settings_load() -> Settings { store::load() }

#[tauri::command]
pub fn settings_save(settings: Settings) -> Result<(), String> { store::save(&settings) }
```

Register in main.rs; add `mod settings;`.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/settings/ src-tauri/src/main.rs
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: settings persistence in AppData/ForgeBoard/settings.json"
```

---

## Task 2: Frontend settings state + load on boot

**Files:** Create `src/state/settings.ts`, `src/ipc/settings.ts`; modify bootstrap

- [ ] **Step 1: Write ipc/settings.ts**

```typescript
import { invoke } from "@tauri-apps/api/core";

export interface Settings {
  editor_font_size: number;
  editor_tab_size: number;
  editor_minimap: boolean;
  editor_autosave: boolean;
  autosave_interval_ms: number;
  smart_help_enabled: boolean;
  smart_help_show_low_confidence: boolean;
  default_board?: string;
  default_port?: string;
  default_baud: number;
  default_line_ending: string;
  sketches_folder?: string;
  show_walkthrough_on_start: boolean;
}

export const settingsApi = {
  load: () => invoke<Settings>("settings_load"),
  save: (settings: Settings) => invoke<void>("settings_save", { settings }),
};
```

- [ ] **Step 2: Write state/settings.ts**

```typescript
import { signal, effect } from "@preact/signals";
import type { Settings } from "../ipc/settings";
import { settingsApi } from "../ipc/settings";

const DEFAULT: Settings = {
  editor_font_size: 13,
  editor_tab_size: 2,
  editor_minimap: false,
  editor_autosave: true,
  autosave_interval_ms: 2000,
  smart_help_enabled: true,
  smart_help_show_low_confidence: false,
  default_baud: 115200,
  default_line_ending: "LF",
  show_walkthrough_on_start: true,
};

export const settings = signal<Settings>(DEFAULT);

export async function loadSettings() {
  try { settings.value = await settingsApi.load(); } catch (e) { console.error(e); }
}

/** Persist on every change (debounced) */
let saveTimer: number | null = null;
export function startSettingsAutosave() {
  effect(() => {
    const s = settings.value;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      settingsApi.save(s).catch(console.error);
    }, 400);
  });
}
```

- [ ] **Step 3: Wire into main.tsx**

```typescript
import { loadSettings, startSettingsAutosave } from "./state/settings";

await loadSettings();
startSettingsAutosave();
```

- [ ] **Step 4: Commit**

```bash
git add src/ipc/settings.ts src/state/settings.ts src/main.tsx
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: settings signals + disk autosave"
```

---

## Task 3: SettingsView component

**Files:** Create `src/components/SettingsView.tsx`, `SettingsView.css`

- [ ] **Step 1: Write SettingsView**

```typescript
import { settings } from "../state/settings";
import "./SettingsView.css";

export function SettingsView() {
  const s = settings.value;
  const update = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => {
    settings.value = { ...s, [k]: v };
  };

  return (
    <div class="sv">
      <div class="sv-header">
        <div class="sv-title">Settings</div>
        <div class="sv-subtitle">All preferences save automatically.</div>
      </div>
      <div class="sv-body">

        <Section title="Editor">
          <Row label="Font size" hint="editor font size in pixels">
            <input type="number" min="10" max="24" value={s.editor_font_size}
              onInput={(e) => update("editor_font_size", +(e.target as HTMLInputElement).value)} />
          </Row>
          <Row label="Tab size" hint="spaces per tab">
            <input type="number" min="2" max="8" value={s.editor_tab_size}
              onInput={(e) => update("editor_tab_size", +(e.target as HTMLInputElement).value)} />
          </Row>
          <Row label="Minimap" hint="code overview on the right side">
            <Toggle on={s.editor_minimap} onChange={(v) => update("editor_minimap", v)} />
          </Row>
          <Row label="Auto-save" hint="save files automatically every few seconds">
            <Toggle on={s.editor_autosave} onChange={(v) => update("editor_autosave", v)} />
          </Row>
        </Section>

        <Section title="Smart Help">
          <Row label="Enable" hint="show wavy underlines + findings panel">
            <Toggle on={s.smart_help_enabled} onChange={(v) => update("smart_help_enabled", v)} />
          </Row>
          <Row label="Show low-confidence flags" hint="dashed-grey 'possible issue' hints">
            <Toggle on={s.smart_help_show_low_confidence} onChange={(v) => update("smart_help_show_low_confidence", v)} />
          </Row>
        </Section>

        <Section title="Serial">
          <Row label="Default baud" hint="baud rate when Serial Monitor opens">
            <select value={s.default_baud}
              onChange={(e) => update("default_baud", +(e.target as HTMLSelectElement).value)}>
              {[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map(b =>
                <option value={b}>{b}</option>
              )}
            </select>
          </Row>
          <Row label="Default line ending" hint="appended when you send text">
            <select value={s.default_line_ending}
              onChange={(e) => update("default_line_ending", (e.target as HTMLSelectElement).value)}>
              <option value="LF">LF (\n)</option>
              <option value="CRLF">CRLF (\r\n)</option>
              <option value="CR">CR (\r)</option>
              <option value="None">None</option>
            </select>
          </Row>
        </Section>

        <Section title="First-time help">
          <Row label="Show walkthrough on start" hint="opt-in onboarding overlay">
            <Toggle on={s.show_walkthrough_on_start} onChange={(v) => update("show_walkthrough_on_start", v)} />
          </Row>
        </Section>

        <Section title="Storage">
          <Row label="Sketches folder" hint="defaults to ~/Documents/ForgeBoard/sketches">
            <input style="width: 300px" value={s.sketches_folder ?? ""}
              placeholder="default"
              onInput={(e) => update("sketches_folder", (e.target as HTMLInputElement).value || undefined)} />
          </Row>
        </Section>

        <Section title="About">
          <div class="sv-about">
            ForgeBoard IDE v0.1.0-dev · Tauri 2 · Monaco · arduino-cli<br />
            <a href="https://defenceforgeindustries.com/forgeboard-ide" target="_blank">defenceforgeindustries.com/forgeboard-ide</a>
          </div>
        </Section>

      </div>
    </div>
  );
}

function Section({ title, children }: any) {
  return (
    <div class="sv-section">
      <div class="sv-section-title">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, hint, children }: any) {
  return (
    <div class="sv-row">
      <div class="sv-row-text">
        <div class="sv-row-label">{label}</div>
        <div class="sv-row-hint">{hint}</div>
      </div>
      <div class="sv-row-control">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button class={`toggle ${on ? "on" : "off"}`} onClick={() => onChange(!on)}>
      <span class="toggle-knob" />
    </button>
  );
}
```

- [ ] **Step 2: Write CSS**

```css
.sv { display: flex; flex-direction: column; height: 100%; font-family: var(--font-ui); }
.sv-header { padding: 20px 24px 14px; border-bottom: 1px solid var(--border-subtle); }
.sv-title { color: var(--text); font-size: 20px; font-weight: 700; }
.sv-subtitle { color: var(--text-muted); font-size: 11px; margin-top: 3px; }
.sv-body { flex: 1; overflow-y: auto; padding: 18px 24px; }
.sv-section { margin-bottom: 26px; }
.sv-section-title { color: var(--accent-gold); font-family: var(--font-mono); font-size: 9.5px; letter-spacing: 1.5px; font-weight: 700; margin-bottom: 12px; }
.sv-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; background: var(--panel); border: 1px solid var(--border-subtle);
  border-radius: 3px; margin-bottom: 8px;
}
.sv-row-text { flex: 1; }
.sv-row-label { color: var(--text); font-size: 12px; font-weight: 600; }
.sv-row-hint { color: var(--text-muted); font-size: 10px; margin-top: 2px; }
.sv-row-control input[type=number], .sv-row-control input[type=text], .sv-row-control select {
  background: var(--bg); border: 1px solid var(--border); border-radius: 3px;
  color: var(--text); padding: 6px 10px; font-size: 11px; font-family: var(--font-mono); outline: none;
}
.sv-row-control input:focus, .sv-row-control select:focus { border-color: var(--accent-gold); }
.toggle {
  width: 38px; height: 22px; background: var(--border);
  border-radius: 11px; position: relative; transition: background 0.15s;
}
.toggle.on { background: rgba(127,178,161,0.4); }
.toggle-knob {
  position: absolute; top: 2px; left: 2px; width: 18px; height: 18px;
  background: var(--text-muted); border-radius: 50%; transition: left 0.15s, background 0.15s;
}
.toggle.on .toggle-knob { left: 18px; background: var(--accent-sage); }
.sv-about { color: var(--text-muted); font-size: 11px; line-height: 1.65; padding: 6px 16px; }
.sv-about a { color: var(--accent-gold); text-decoration: none; }
```

- [ ] **Step 3: Wire in FileSidebar**

```tsx
{rail === "settings" && <SettingsView />}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/SettingsView.tsx src/components/SettingsView.css src/components/FileSidebar.tsx
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: SettingsView with all user preferences"
```

---

## Task 4: Wire settings into Monaco + autosave + Smart Help

**Files:** Modify `MonacoEditor.tsx`, `autosave.ts`, `analyzer.ts`

- [ ] **Step 1: MonacoEditor reacts to settings**

In MonacoEditor, add:
```typescript
import { settings } from "../state/settings";

// Inside useEffect, after editor creation, subscribe to settings changes:
const unsub = settings.subscribe((s) => {
  editor.updateOptions({
    fontSize: s.editor_font_size,
    tabSize: s.editor_tab_size,
    minimap: { enabled: s.editor_minimap },
  });
});
// add unsub() to cleanup
```

- [ ] **Step 2: autosave.ts respects autosave setting + interval**

```typescript
import { settings } from "../state/settings";

// In startAutoSaveLoop, inside the effect:
if (!settings.value.editor_autosave) return;
pending = window.setTimeout(saveAllModified, settings.value.autosave_interval_ms);
```

- [ ] **Step 3: analyzer.ts respects smart_help_enabled**

```typescript
import { settings } from "../state/settings";

// In startAnalyzerLoop, skip if disabled:
if (!settings.value.smart_help_enabled) { findings.value = []; return; }
```

- [ ] **Step 4: MonacoEditor filters low-confidence decorations**

```typescript
// In the decoration effect:
const decos = findings.value
  .filter(f => !dismissedIds.value.has(f.id))
  .filter(f => settings.value.smart_help_show_low_confidence || f.confidence !== "low")
  .map((f) => ({ ... }));
```

- [ ] **Step 5: Commit**

```bash
git add src/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: settings take effect in Monaco, autosave, Smart Help"
```

---

## Task 5: Command Palette (⌘K)

**Files:** Create `src/components/CommandPalette.tsx`, `CommandPalette.css`, `src/lib/palette-commands.ts`

- [ ] **Step 1: Define command registry**

`src/lib/palette-commands.ts`:

```typescript
import { activeRail, bottomPanelOpen, bottomPanelTab } from "../state/appState";
import { settings } from "../state/settings";

export interface PaletteCommand {
  id: string;
  title: string;
  description?: string;
  keywords: string[];
  shortcut?: string;
  run: () => void | Promise<void>;
}

export const STATIC_COMMANDS: PaletteCommand[] = [
  { id: "cmd.home", title: "Go to Home", keywords: ["home","start"], run: () => { activeRail.value = "home"; } },
  { id: "cmd.files", title: "Go to Files", keywords: ["files","sketch"], run: () => { activeRail.value = "files"; } },
  { id: "cmd.examples", title: "Go to Examples", keywords: ["examples","sample","blink"], run: () => { activeRail.value = "examples"; } },
  { id: "cmd.boards", title: "Go to Boards", keywords: ["boards","board"], run: () => { activeRail.value = "boards"; } },
  { id: "cmd.libraries", title: "Go to Libraries", keywords: ["libraries","library","lib"], run: () => { activeRail.value = "libraries"; } },
  { id: "cmd.settings", title: "Go to Settings", keywords: ["settings","preferences","config"], shortcut: "⌘,", run: () => { activeRail.value = "settings"; } },
  { id: "cmd.serial", title: "Open Serial Monitor", keywords: ["serial","console"], shortcut: "^`", run: () => { bottomPanelOpen.value = true; bottomPanelTab.value = "serial"; } },
  { id: "cmd.plotter", title: "Open Plotter", keywords: ["plot","plotter","graph","chart"], run: () => { bottomPanelOpen.value = true; bottomPanelTab.value = "plotter"; } },
  { id: "cmd.problems", title: "Show Problems", keywords: ["problems","findings","errors","warnings"], run: () => { bottomPanelOpen.value = true; bottomPanelTab.value = "problems"; } },
  { id: "cmd.toggle-autosave", title: "Toggle auto-save", keywords: ["autosave","save"],
    run: () => { settings.value = { ...settings.value, editor_autosave: !settings.value.editor_autosave }; } },
  { id: "cmd.toggle-smart-help", title: "Toggle Smart Help", keywords: ["smart help","linter","check"],
    run: () => { settings.value = { ...settings.value, smart_help_enabled: !settings.value.smart_help_enabled }; } },
];

// Dynamic: files, examples, libraries — built at palette-open time
export async function buildDynamicCommands(): Promise<PaletteCommand[]> {
  const out: PaletteCommand[] = [];
  const { openTabs, activeTabIndex } = await import("../state/appState");
  openTabs.value.forEach((t, i) => {
    out.push({
      id: `file.${t.path}`,
      title: `Open tab: ${t.name}`,
      keywords: [t.name, "file", "tab"],
      run: () => { activeTabIndex.value = i; },
    });
  });
  return out;
}
```

- [ ] **Step 2: Write CommandPalette.tsx**

```typescript
import { useEffect, useRef, useState } from "preact/hooks";
import { STATIC_COMMANDS, buildDynamicCommands, type PaletteCommand } from "../lib/palette-commands";
import "./CommandPalette.css";

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [cmds, setCmds] = useState<PaletteCommand[]>([]);
  const [cursor, setCursor] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    buildDynamicCommands().then(dyn => setCmds([...STATIC_COMMANDS, ...dyn]));
    ref.current?.focus();
  }, []);

  const filtered = filter(cmds, q);

  function filter(list: PaletteCommand[], query: string): PaletteCommand[] {
    if (!query) return list;
    const lc = query.toLowerCase();
    return list
      .map(c => ({ c, score: score(c, lc) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.c);
  }

  function score(c: PaletteCommand, q: string): number {
    let s = 0;
    if (c.title.toLowerCase().includes(q)) s += 50;
    for (const k of c.keywords) if (k.toLowerCase().includes(q)) s += 10;
    return s;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setCursor(Math.min(cursor + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor(Math.max(cursor - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const cmd = filtered[cursor]; if (cmd) { cmd.run(); onClose(); } }
  }

  return (
    <div class="cp-backdrop" onClick={onClose}>
      <div class="cp" onClick={(e) => e.stopPropagation()}>
        <input
          ref={ref}
          class="cp-input"
          placeholder="search commands, files, settings..."
          value={q}
          onInput={(e) => { setQ((e.target as HTMLInputElement).value); setCursor(0); }}
          onKeyDown={onKey}
        />
        <div class="cp-list">
          {filtered.slice(0, 20).map((c, i) => (
            <div class={`cp-item ${i === cursor ? "active" : ""}`}
              onClick={() => { c.run(); onClose(); }}
              onMouseEnter={() => setCursor(i)}>
              <div class="cp-item-title">{c.title}</div>
              {c.description && <div class="cp-item-desc">{c.description}</div>}
              {c.shortcut && <div class="cp-item-shortcut">{c.shortcut}</div>}
            </div>
          ))}
          {filtered.length === 0 && <div class="cp-empty">No matches.</div>}
        </div>
        <div class="cp-footer">↑↓ navigate · ↵ execute · esc close</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: CSS**

```css
.cp-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  display: flex; align-items: flex-start; justify-content: center; padding-top: 100px;
  z-index: 200;
}
.cp {
  width: 560px; background: var(--panel); border: 1px solid var(--border);
  border-radius: 6px; box-shadow: 0 24px 50px rgba(0,0,0,0.6);
  display: flex; flex-direction: column; max-height: 500px;
  font-family: var(--font-ui);
}
.cp-input {
  padding: 14px 18px; background: transparent; border: none; outline: none;
  color: var(--text); font-size: 14px; border-bottom: 1px solid var(--border);
}
.cp-input::placeholder { color: var(--text-muted); }
.cp-list { flex: 1; overflow-y: auto; padding: 6px 0; }
.cp-item {
  padding: 9px 18px; cursor: pointer;
  display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center;
}
.cp-item.active { background: var(--accent-gold-bg); border-left: 2px solid var(--accent-gold); padding-left: 16px; }
.cp-item-title { color: var(--text); font-size: 11.5px; font-weight: 500; }
.cp-item-desc { color: var(--text-muted); font-size: 9.5px; grid-column: 1; }
.cp-item-shortcut {
  font-family: var(--font-mono); font-size: 9.5px; color: var(--text-muted);
  background: var(--bg); padding: 2px 6px; border-radius: 2px;
}
.cp-empty { padding: 18px; color: var(--text-muted); text-align: center; font-size: 11px; }
.cp-footer {
  padding: 8px 18px; border-top: 1px solid var(--border);
  font-size: 9px; color: var(--text-muted); background: var(--panel-alt);
}
```

- [ ] **Step 4: Wire ⌘K in shortcuts.ts**

```typescript
// Add state for open palette
import { signal } from "@preact/signals";
export const paletteOpen = signal(false);

// In installShortcuts:
if (mod && e.key === "k") {
  e.preventDefault();
  paletteOpen.value = !paletteOpen.value;
  return;
}
```

- [ ] **Step 5: Render CommandPalette in App.tsx**

```tsx
import { CommandPalette } from "./components/CommandPalette";
import { paletteOpen } from "./lib/shortcuts";

// Inside App(), at the end:
{paletteOpen.value && <CommandPalette onClose={() => paletteOpen.value = false} />}
```

- [ ] **Step 6: Commit**

```bash
git add src/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: CommandPalette (⌘K) with fuzzy search across commands + files"
```

---

## Task 6: Smoke test + tag

- [ ] **Step 1: Run, press ⌘K**

- [ ] Palette appears centered over the app
- [ ] Type "blink" → shows Blink example command
- [ ] Type "serial" → "Open Serial Monitor", "Go to Boards" etc. (serial keyword matches multiple)
- [ ] Arrow down/up moves selection
- [ ] Enter executes; palette closes
- [ ] Esc closes
- [ ] Open Settings → toggle "Auto-save" off → save indicator never reaches "saving" (setting took effect)

- [ ] **Step 2: Tag**

```bash
git tag -a phase12-settings-palette -m "Phase 12 complete: Settings + Command Palette"
```

---

## Self-Review

- ✅ Settings persist to `%APPDATA%/ForgeBoard/settings.json`
- ✅ Real-time application (editor, autosave, Smart Help react)
- ✅ Command palette with fuzzy search
- ✅ Keyboard-only workflow usable
- ⏭ LSP/clangd integration for C++ hover tooltips — deferred to v1.1 (non-trivial install path)

---

*End of Phase 12. Next: Phase 13 — Polish + Walkthrough.*
