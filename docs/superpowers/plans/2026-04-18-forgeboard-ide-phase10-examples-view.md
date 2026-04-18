# ForgeBoard IDE — Phase 10: Examples Browser

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Prerequisite: `phase9-libraries`.

**Goal:** Build the Examples rail view — a categorized browser of 40 curated Arduino example sketches that users can open with one click. Examples are bundled inside the IDE; opening one copies the sketch into the user's sketches folder as a new project (the original is never modified).

**Architecture:** Examples metadata + source live in `content/examples/<category>/<slug>/`. At build time, bundled as Tauri resources. Rust command `examples_list` returns metadata; `examples_open` copies to `~/Documents/ForgeBoard/sketches/<slug>/` (collision-handled with suffix).

---

## File Structure

```
content/examples/
├── start-here/
│   ├── blink/
│   │   ├── meta.yaml             # title, description, time, wiring
│   │   └── blink.ino
│   ├── hello-serial/
│   │   ├── meta.yaml
│   │   └── hello-serial.ino
│   ├── read-button/
│   │   ├── meta.yaml
│   │   ├── read-button.ino
│   │   └── wiring.png              # optional asset
│   └── ...
├── digital-io/
├── analog-io/
├── serial-usb/
├── sensors/
├── leds/
├── wifi-network/
├── bluetooth/
├── displays/
├── motors-servos/
└── storage/

src-tauri/src/examples/
├── mod.rs
├── loader.rs
└── commands.rs

src/
├── ipc/examples.ts
├── state/appState.ts        # examplesList, selectedCategory
├── components/
│   ├── ExamplesView.tsx
│   └── ExamplesView.css
```

---

## Task 1: Example metadata schema + 5 seed examples

- [ ] **Step 1: Write schema**

Each example: `meta.yaml` describes it; a `.ino` file contains the code.

```yaml
# content/examples/start-here/blink/meta.yaml
title: "Blink"
category: start-here
slug: blink
description: "Turn the built-in LED on and off once per second. The classic first program."
time_minutes: 1
wiring: "no wiring needed"
difficulty: beginner
boards: [forgeboard-beginner, forgeboard-intermediate, esp32-s3-generic, arduino-uno, arduino-nano]
tags: [led, digital-io, basics]
```

```cpp
// content/examples/start-here/blink/blink.ino
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(1000);
  digitalWrite(LED_BUILTIN, LOW);
  delay(1000);
}
```

- [ ] **Step 2: Write 4 more starter examples**

- `hello-serial/` — print "Hello, world!" every second
- `read-button/` — light LED while button is pressed
- `fade-led/` — smooth analogWrite PWM fade
- `sensor-read/` — read analog voltage, print to serial

Each with meta.yaml + .ino following the pattern.

- [ ] **Step 3: Commit**

```bash
git add content/examples/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "content: 5 starter examples (blink, serial, button, fade, sensor)"
```

---

## Task 2: Build script — examples index

**Files:** Create `scripts/build-examples-index.ts`

- [ ] **Step 1: Write build script**

```typescript
import fs from "fs";
import path from "path";
import * as yaml from "js-yaml";

const CONTENT = path.resolve("content/examples");
const OUT = path.resolve("src-tauri/resources/examples-index.json");

interface Meta {
  title: string; category: string; slug: string; description: string;
  time_minutes: number; wiring: string; difficulty: string;
  boards: string[]; tags: string[];
  files?: string[]; // filled by this script
}

const index: Meta[] = [];

for (const cat of fs.readdirSync(CONTENT)) {
  const catDir = path.join(CONTENT, cat);
  if (!fs.statSync(catDir).isDirectory()) continue;
  for (const slug of fs.readdirSync(catDir)) {
    const slugDir = path.join(catDir, slug);
    const metaPath = path.join(slugDir, "meta.yaml");
    if (!fs.existsSync(metaPath)) continue;
    const meta = yaml.load(fs.readFileSync(metaPath, "utf8")) as Meta;
    meta.files = fs.readdirSync(slugDir).filter(f => f.endsWith(".ino") || f.endsWith(".h") || f.endsWith(".cpp"));
    index.push(meta);
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(index, null, 2));
console.log(`Indexed ${index.length} examples → ${OUT}`);
```

- [ ] **Step 2: Add to package.json + postinstall**

```json
"build:examples": "tsx scripts/build-examples-index.ts",
"postinstall": "powershell -ExecutionPolicy Bypass -File scripts/download-arduino-cli.ps1 && pnpm build:smart-help && pnpm build:examples"
```

- [ ] **Step 3: Bundle examples as Tauri resource**

In `src-tauri/tauri.conf.json`:
```json
"resources": [
  "resources/smart-help.db",
  "resources/examples-index.json"
]
```

Also bundle the content directory:
```json
"resources": [
  ...,
  "../content/examples/**/*"
]
```

- [ ] **Step 4: Commit**

```bash
git add scripts/build-examples-index.ts package.json src-tauri/tauri.conf.json
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "build: compile examples index to JSON; bundle as resource"
```

---

## Task 3: Rust examples loader + commands

**Files:** Create `src-tauri/src/examples/{mod.rs,loader.rs,commands.rs}`

- [ ] **Step 1: Write mod.rs + loader.rs**

```rust
// mod.rs
pub mod loader;
pub mod commands;
```

```rust
// loader.rs
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Example {
    pub title: String,
    pub category: String,
    pub slug: String,
    pub description: String,
    pub time_minutes: u32,
    pub wiring: String,
    pub difficulty: String,
    pub boards: Vec<String>,
    pub tags: Vec<String>,
    pub files: Vec<String>,
}

pub fn load_index(app: &tauri::AppHandle) -> Result<Vec<Example>, String> {
    use tauri::Manager;
    let path = app.path().resolve(
        "resources/examples-index.json",
        tauri::path::BaseDirectory::Resource,
    ).map_err(|e| e.to_string())?;
    let s = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

pub fn copy_to_user_sketches(app: &tauri::AppHandle, ex: &Example) -> Result<PathBuf, String> {
    use tauri::Manager;
    let docs = dirs::document_dir().ok_or("no Documents")?;
    let sketches_root = docs.join("ForgeBoard").join("sketches");
    std::fs::create_dir_all(&sketches_root).map_err(|e| e.to_string())?;

    let mut target = sketches_root.join(&ex.slug);
    let mut n = 2;
    while target.exists() {
        target = sketches_root.join(format!("{}-{}", ex.slug, n));
        n += 1;
    }
    std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;

    let src_dir = app.path().resolve(
        format!("content/examples/{}/{}", ex.category, ex.slug),
        tauri::path::BaseDirectory::Resource,
    ).map_err(|e| e.to_string())?;

    for f in &ex.files {
        let from = src_dir.join(f);
        let to_name = if f == &format!("{}.ino", ex.slug) {
            // Rename main .ino to match new folder name if it changed
            format!("{}.ino", target.file_name().unwrap().to_string_lossy())
        } else {
            f.clone()
        };
        let to = target.join(to_name);
        std::fs::copy(&from, &to).map_err(|e| format!("copy {}: {e}", f))?;
    }
    Ok(target)
}
```

- [ ] **Step 2: Commands**

```rust
// commands.rs
use super::loader::{self, Example};
use std::path::PathBuf;

#[tauri::command]
pub fn examples_list(app: tauri::AppHandle) -> Result<Vec<Example>, String> {
    loader::load_index(&app)
}

#[tauri::command]
pub fn examples_open(app: tauri::AppHandle, slug: String, category: String) -> Result<PathBuf, String> {
    let all = loader::load_index(&app)?;
    let ex = all.into_iter().find(|e| e.slug == slug && e.category == category)
        .ok_or_else(|| "example not found".to_string())?;
    loader::copy_to_user_sketches(&app, &ex)
}
```

Register in main.rs, add `mod examples;`.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: examples loader + list/open commands"
```

---

## Task 4: ExamplesView component

**Files:** Create `src/components/ExamplesView.tsx`, `ExamplesView.css`

- [ ] **Step 1: Write ExamplesView.tsx**

```typescript
import { useEffect, useState } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";
import { currentSketch } from "../state/appState";
import { loadPerProjectState } from "../lib/project-state";
import "./ExamplesView.css";

interface Example {
  title: string; category: string; slug: string; description: string;
  time_minutes: number; wiring: string; difficulty: string;
  boards: string[]; tags: string[]; files: string[];
}

const CATEGORY_LABELS: Record<string, string> = {
  "start-here": "Start Here",
  "digital-io": "Digital I/O",
  "analog-io": "Analog I/O",
  "serial-usb": "Serial & USB",
  "sensors": "Sensors",
  "leds": "LEDs",
  "wifi-network": "WiFi & Network",
  "bluetooth": "Bluetooth / BLE",
  "displays": "Displays",
  "motors-servos": "Motors & Servos",
  "storage": "Storage & Files",
};

export function ExamplesView() {
  const [all, setAll] = useState<Example[]>([]);
  const [active, setActive] = useState("start-here");
  const [search, setSearch] = useState("");

  useEffect(() => {
    invoke<Example[]>("examples_list").then(setAll).catch(console.error);
  }, []);

  const byCategory: Record<string, Example[]> = {};
  for (const ex of all) {
    (byCategory[ex.category] ||= []).push(ex);
  }

  const shown = search
    ? all.filter((e) => e.title.toLowerCase().includes(search.toLowerCase()) ||
                        e.description.toLowerCase().includes(search.toLowerCase()))
    : byCategory[active] ?? [];

  async function open(e: Example) {
    try {
      const newPath = await invoke<string>("examples_open", { slug: e.slug, category: e.category });
      // Trigger bootstrap to reload the sketch at newPath
      const { projectApi } = await import("../ipc/project");
      const sketch = await projectApi.open(newPath);
      const { currentSketch, fileContents, openTabs, activeTabIndex } = await import("../state/appState");
      currentSketch.value = sketch;
      const contents = new Map<string, string>();
      for (const f of sketch.files) contents.set(f.path, await projectApi.readFile(f.path));
      fileContents.value = contents;
      openTabs.value = sketch.files.map((f) => ({ path: f.path, name: f.name, modified: false }));
      activeTabIndex.value = 0;
      await loadPerProjectState();
    } catch (err) { alert(`Couldn't open example: ${err}`); }
  }

  return (
    <div class="ev">
      <div class="ev-sidebar">
        <div class="ev-head">Categories</div>
        {Object.entries(CATEGORY_LABELS).map(([id, label]) => {
          const count = (byCategory[id] ?? []).length;
          return (
            <button class={`ev-cat ${active === id ? "active" : ""}`}
              onClick={() => { setActive(id); setSearch(""); }}>
              {label}
              <span class="ev-cat-count">{count}</span>
            </button>
          );
        })}
      </div>
      <div class="ev-main">
        <div class="ev-header">
          <div class="ev-title">{search ? `Results for "${search}"` : CATEGORY_LABELS[active]}</div>
          <input class="ev-search" placeholder="search examples…"
            value={search} onInput={(e) => setSearch((e.target as HTMLInputElement).value)} />
        </div>
        <div class="ev-grid">
          {shown.map((e) => (
            <div class="ev-card" onClick={() => open(e)}>
              <div class="ev-card-icon" />
              <div class="ev-card-title">{e.title}</div>
              <div class="ev-card-desc">{e.description}</div>
              <div class="ev-card-meta">
                <span>{e.time_minutes} min</span>
                <span>·</span>
                <span>{e.wiring}</span>
                <span class="ev-card-cta">Open →</span>
              </div>
            </div>
          ))}
          {shown.length === 0 && <div class="ev-empty">No examples in this category yet.</div>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write ExamplesView.css**

```css
.ev { display: flex; height: 100%; font-family: var(--font-ui); }
.ev-sidebar {
  width: 200px; background: var(--panel-alt);
  border-right: 1px solid var(--border-subtle);
  padding: 14px 0; overflow-y: auto; flex-shrink: 0;
}
.ev-head { padding: 0 18px 12px; color: var(--text); font-weight: 600; font-size: 12px; }
.ev-cat {
  display: flex; justify-content: space-between; align-items: center;
  width: 100%; padding: 8px 20px; color: var(--text);
  font-size: 11px; border-left: 2px solid transparent;
  background: transparent; text-align: left;
}
.ev-cat:hover { background: var(--accent-gold-bg); }
.ev-cat.active { color: var(--accent-gold); border-left-color: var(--accent-gold); background: var(--accent-gold-bg); }
.ev-cat-count { color: var(--text-dim); font-size: 9px; }

.ev-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.ev-header {
  padding: 18px 24px 12px; display: flex; align-items: flex-end;
  justify-content: space-between; border-bottom: 1px solid var(--border-subtle);
}
.ev-title { color: var(--text); font-size: 18px; font-weight: 700; }
.ev-search {
  background: var(--panel-alt); border: 1px solid var(--border);
  border-radius: 3px; padding: 7px 12px; color: var(--text-muted);
  font-size: 10px; outline: none; font-family: var(--font-ui);
}
.ev-search:focus { border-color: var(--accent-gold); color: var(--text); }

.ev-grid {
  flex: 1; overflow-y: auto; padding: 20px 24px;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}
.ev-card {
  background: var(--panel); border: 1px solid var(--border);
  border-radius: 4px; padding: 14px; cursor: pointer;
  transition: border-color 0.1s;
}
.ev-card:hover { border-color: var(--accent-gold); }
.ev-card-icon { width: 34px; height: 34px; border: 1.5px solid var(--accent-gold); border-radius: 3px; margin-bottom: 10px; }
.ev-card-title { color: var(--text); font-weight: 700; font-size: 12px; }
.ev-card-desc { color: var(--text-muted); font-size: 10px; line-height: 1.55; margin-top: 5px; }
.ev-card-meta { color: var(--text-dim); font-size: 9px; margin-top: 10px; display: flex; gap: 6px; align-items: center; }
.ev-card-cta { color: var(--accent-gold); margin-left: auto; }
.ev-empty { color: var(--text-muted); font-size: 11px; padding: 20px; grid-column: 1 / -1; text-align: center; }
```

- [ ] **Step 3: Wire in FileSidebar**

```tsx
{rail === "examples" && <ExamplesView />}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ExamplesView.tsx src/components/ExamplesView.css src/components/FileSidebar.tsx
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: ExamplesView with category sidebar + card grid"
```

---

## Task 5: Author remaining 35 examples

Write 35 more to reach 40 total. Distribute:
- `start-here/` already has 5 → target 8 (add: button-and-led, pwm-fade-curve, millis-blink)
- `digital-io/` → 4 (toggle-button, shift-register, multiple-leds, debounce-library)
- `analog-io/` → 3 (potentiometer-dim-led, voltage-monitor, smoothing)
- `serial-usb/` → 2 (echo, command-parser)
- `sensors/` → 5 (dht-temperature, bmp-pressure, ultrasonic, pir-motion, ldr-light)
- `leds/` → 4 (rainbow, single-neopixel, fastled-patterns, rgb-color-picker)
- `wifi-network/` → 4 (scan-networks, connect-open, http-get, http-post)
- `bluetooth/` → 2 (ble-advertise, ble-read-characteristic)
- `displays/` → 3 (ssd1306-hello, tft-text, seven-segment)
- `motors-servos/` → 2 (servo-sweep, dc-motor-pwm)
- `storage/` → 2 (preferences-save, sd-card-write)

For each: write meta.yaml + .ino. Follow the pattern in Task 1. Commit in batches of 5-10.

---

## Task 6: Smoke test + tag

- [ ] **Step 1: Run, click Examples rail**

- [ ] Sidebar shows 11 categories with counts
- [ ] "Start Here" active by default
- [ ] Cards visible: Blink, Hello Serial, Read Button, Fade LED, Sensor Read, + 3 more
- [ ] Click Blink card → copies to `~/Documents/ForgeBoard/sketches/blink/` (or `blink-2/` if collision), opens it as active project
- [ ] Editor shows the Blink code
- [ ] Search box filters across all categories

- [ ] **Step 2: Tag**

```bash
git tag -a phase10-examples -m "Phase 10 complete: 40 curated examples + browser"
```

---

## Self-Review

- ✅ Categorized browser with 40 examples
- ✅ Open copies sketch (original never modified)
- ✅ Search across all categories
- ⏭ Board-filtered examples (hide WiFi examples on Uno) — deferred

---

*End of Phase 10. Next: Phase 11 — Serial Plotter.*
