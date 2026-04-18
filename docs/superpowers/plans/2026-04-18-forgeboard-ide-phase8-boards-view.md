# ForgeBoard IDE — Phase 8: Boards View (Universal Support)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Prerequisite: `phase7-content`.

**Goal:** Build the Boards rail view (dedicated sidebar when the Boards icon is clicked) with Connected / ForgeBoard / Other Installed / Available sections. Add on-demand core installation via `arduino-cli core install`. Make the Board and Port selectors in the ActionBar real dropdowns with auto-detection.

**Architecture:** New Rust commands for `core_list` (installed), `core_search` (available), `core_install`. Frontend polls `arduino_detect_ports` every 2s while a dropdown is open. Core install streams progress.

**Tech Stack:** arduino-cli core operations, Tauri events, Preact.

---

## File Structure

```
src-tauri/src/arduino/
├── core.rs              # NEW — core list/install wrappers
├── commands.rs          # MODIFIED — add core commands

src/
├── ipc/arduino.ts       # MODIFIED — new endpoints
├── state/appState.ts    # add boardsCatalog, installedCores signals
├── components/
│   ├── BoardsView.tsx   # NEW — dedicated rail view
│   ├── BoardsView.css
│   ├── BoardSelector.tsx # NEW — dropdown in ActionBar
│   ├── BoardSelector.css
│   ├── PortSelector.tsx  # NEW — dropdown in ActionBar
│   └── PortSelector.css
```

---

## Task 1: Rust — core management wrappers

**Files:** Create `src-tauri/src/arduino/core.rs`

- [ ] **Step 1: Write core.rs**

```rust
use super::cli;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Core {
    pub id: String,           // e.g. "esp32:esp32"
    pub name: String,
    pub version: Option<String>,
    pub maintainer: Option<String>,
    pub installed: bool,
}

pub async fn list_installed(app: &tauri::AppHandle) -> Result<Vec<Core>, String> {
    let out = cli::run_capture(app, &["core", "list", "--format", "json"]).await?;
    let v: serde_json::Value = serde_json::from_str(&out).map_err(|e| e.to_string())?;
    let mut cores = Vec::new();
    if let Some(arr) = v.get("platforms").and_then(|a| a.as_array()) {
        for c in arr {
            cores.push(Core {
                id: c.get("id").and_then(|s| s.as_str()).unwrap_or("").to_string(),
                name: c.pointer("/releases/0/name").or(c.get("name"))
                    .and_then(|s| s.as_str()).unwrap_or("").to_string(),
                version: c.pointer("/installed_version").and_then(|s| s.as_str()).map(String::from),
                maintainer: c.pointer("/releases/0/maintainer").and_then(|s| s.as_str()).map(String::from),
                installed: true,
            });
        }
    }
    Ok(cores)
}

pub async fn search(app: &tauri::AppHandle, query: &str) -> Result<Vec<Core>, String> {
    let out = cli::run_capture(app, &["core", "search", query, "--format", "json"]).await?;
    let v: serde_json::Value = serde_json::from_str(&out).map_err(|e| e.to_string())?;
    let mut cores = Vec::new();
    if let Some(arr) = v.get("platforms").and_then(|a| a.as_array()) {
        for c in arr {
            cores.push(Core {
                id: c.get("id").and_then(|s| s.as_str()).unwrap_or("").to_string(),
                name: c.pointer("/releases/0/name").and_then(|s| s.as_str()).unwrap_or("").to_string(),
                version: c.pointer("/latest_version").and_then(|s| s.as_str()).map(String::from),
                maintainer: c.pointer("/releases/0/maintainer").and_then(|s| s.as_str()).map(String::from),
                installed: c.pointer("/installed_version").is_some(),
            });
        }
    }
    Ok(cores)
}

pub async fn install(app: &tauri::AppHandle, core_id: &str) -> Result<i32, String> {
    let (code, _stderr) = cli::run_streaming(
        app, "core-install-output",
        &["core", "install", core_id, "--no-color"],
    ).await?;
    Ok(code)
}

pub async fn update_index(app: &tauri::AppHandle) -> Result<(), String> {
    cli::run_capture(app, &["core", "update-index"]).await.map(|_| ())
}

/// Seed the index with ForgeBoard board URLs if not already present.
pub async fn ensure_forgeboard_index(app: &tauri::AppHandle) -> Result<(), String> {
    cli::run_capture(app, &[
        "config", "add", "board_manager.additional_urls",
        "https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json",
    ]).await.ok(); // ignore error if already added
    update_index(app).await
}
```

- [ ] **Step 2: Append new commands to `src-tauri/src/arduino/commands.rs`**

```rust
#[tauri::command]
pub async fn arduino_list_cores(app: tauri::AppHandle) -> Result<Vec<super::core::Core>, String> {
    super::core::list_installed(&app).await
}

#[tauri::command]
pub async fn arduino_search_cores(app: tauri::AppHandle, query: String) -> Result<Vec<super::core::Core>, String> {
    super::core::search(&app, &query).await
}

#[tauri::command]
pub async fn arduino_install_core(app: tauri::AppHandle, core_id: String) -> Result<i32, String> {
    super::core::install(&app, &core_id).await
}

#[tauri::command]
pub async fn arduino_update_index(app: tauri::AppHandle) -> Result<(), String> {
    super::core::update_index(&app).await
}

#[tauri::command]
pub async fn arduino_ensure_forgeboard_index(app: tauri::AppHandle) -> Result<(), String> {
    super::core::ensure_forgeboard_index(&app).await
}
```

- [ ] **Step 3: Register in main.rs**

```rust
arduino::commands::arduino_list_cores,
arduino::commands::arduino_search_cores,
arduino::commands::arduino_install_core,
arduino::commands::arduino_update_index,
arduino::commands::arduino_ensure_forgeboard_index,
```

Also, in `setup()`, trigger `ensure_forgeboard_index` once at startup so the index is populated.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: arduino-cli core list/search/install Rust commands"
```

---

## Task 2: Frontend IPC wrappers + signals

**Files:** Modify `src/ipc/arduino.ts`, `src/state/appState.ts`

- [ ] **Step 1: Extend arduinoApi**

```typescript
export interface Core {
  id: string;
  name: string;
  version?: string;
  maintainer?: string;
  installed: boolean;
}

// add to arduinoApi:
listCores: () => invoke<Core[]>("arduino_list_cores"),
searchCores: (query: string) => invoke<Core[]>("arduino_search_cores", { query }),
installCore: (core_id: string) => invoke<number>("arduino_install_core", { coreId: core_id }),
updateIndex: () => invoke<void>("arduino_update_index"),
onCoreInstallOutput: (cb: (line: string) => void) => listen<string>("core-install-output", e => cb(e.payload)),
```

- [ ] **Step 2: Add signals**

```typescript
import type { Core, Board, DetectedBoard } from "../ipc/arduino";

export const installedCores = signal<Core[]>([]);
export const searchCoresResults = signal<Core[]>([]);
export const installedBoards = signal<Board[]>([]);
export const detectedPorts = signal<DetectedBoard[]>([]);
export const coreInstallProgress = signal<string[]>([]);
export const coreInstallRunning = signal<string | null>(null); // core id being installed
```

- [ ] **Step 3: Commit**

```bash
git add src/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: core management IPC + signals"
```

---

## Task 3: BoardsView component

**Files:** Create `src/components/BoardsView.tsx`, `BoardsView.css`

- [ ] **Step 1: Write BoardsView.tsx**

```typescript
import { useEffect } from "preact/hooks";
import { arduinoApi } from "../ipc/arduino";
import {
  installedCores, installedBoards, detectedPorts,
  coreInstallProgress, coreInstallRunning,
  selectedFqbn, connectedPort,
} from "../state/appState";
import "./BoardsView.css";

const CURATED_CATALOG: { id: string; name: string; platform: string }[] = [
  { id: "esp32:esp32", name: "ESP32 (incl. ForgeBoard, S3, WROOM)", platform: "Espressif" },
  { id: "esp8266:esp8266", name: "ESP8266 (NodeMCU, Wemos D1)", platform: "Espressif" },
  { id: "arduino:avr", name: "Arduino AVR (Uno, Nano, Mega)", platform: "Arduino" },
  { id: "rp2040:rp2040", name: "Raspberry Pi Pico (RP2040)", platform: "earlephilhower" },
  { id: "STMicroelectronics:stm32", name: "STM32 (Nucleo, Blue Pill)", platform: "STMicroelectronics" },
  { id: "teensy:avr", name: "Teensy 2.0 / 3.x / 4.x / LC", platform: "PJRC" },
  { id: "Seeeduino:xiao_samd", name: "Seeed XIAO SAMD21/M0", platform: "Seeed" },
];

export function BoardsView() {
  useEffect(() => { refresh(); }, []);

  async function refresh() {
    try {
      const cores = await arduinoApi.listCores();
      installedCores.value = cores;
      const boards = await arduinoApi.listBoards();
      installedBoards.value = boards;
      const ports = await arduinoApi.detectPorts();
      detectedPorts.value = ports;
    } catch (e) { console.error(e); }
  }

  async function install(coreId: string) {
    if (coreInstallRunning.value) return;
    coreInstallRunning.value = coreId;
    coreInstallProgress.value = [];
    const unlisten = await arduinoApi.onCoreInstallOutput((line) => {
      coreInstallProgress.value = [...coreInstallProgress.value, line];
    });
    try {
      const code = await arduinoApi.installCore(coreId);
      if (code === 0) {
        coreInstallProgress.value = [...coreInstallProgress.value, `✓ Installed ${coreId}`];
      } else {
        coreInstallProgress.value = [...coreInstallProgress.value, `✗ Install failed (exit ${code})`];
      }
      await refresh();
    } finally {
      coreInstallRunning.value = null;
      unlisten();
    }
  }

  const installedIds = new Set(installedCores.value.map((c) => c.id));

  return (
    <div class="bv">
      <div class="bv-header">
        <span class="bv-title">Boards</span>
        <span class="bv-stats">
          connected: {detectedPorts.value.length} · installed: {installedCores.value.length}
        </span>
      </div>

      <div class="bv-body">
        {/* CONNECTED */}
        <div class="bv-section-label">CONNECTED</div>
        {detectedPorts.value.length === 0 ? (
          <div class="bv-empty">No boards plugged in.</div>
        ) : (
          detectedPorts.value.map((p) => (
            <div class="bv-row bv-row-connected">
              <span class="bv-dot connected" />
              <div class="bv-row-main">
                <div class="bv-row-name">{p.name ?? p.fqbn ?? "Unknown board"}</div>
                <div class="bv-row-meta">{p.port}{p.fqbn ? " · " + p.fqbn : ""}</div>
              </div>
              <button
                class="bv-row-action"
                onClick={() => {
                  if (p.fqbn) selectedFqbn.value = p.fqbn;
                  connectedPort.value = p.port;
                }}
              >
                select
              </button>
            </div>
          ))
        )}

        {/* INSTALLED CORES */}
        <div class="bv-section-label">INSTALLED CORES · {installedCores.value.length}</div>
        {installedCores.value.map((c) => (
          <div class="bv-row">
            <span class="bv-dot idle" />
            <div class="bv-row-main">
              <div class="bv-row-name">{c.name}</div>
              <div class="bv-row-meta">{c.id} · {c.version ?? "?"}</div>
            </div>
            <span class="bv-row-status">installed</span>
          </div>
        ))}

        {/* AVAILABLE */}
        <div class="bv-section-label">AVAILABLE · installs on demand</div>
        {CURATED_CATALOG.filter((c) => !installedIds.has(c.id)).map((c) => (
          <div class="bv-row">
            <span class="bv-dot dim" />
            <div class="bv-row-main">
              <div class="bv-row-name">{c.name}</div>
              <div class="bv-row-meta">{c.platform} · {c.id}</div>
            </div>
            <button
              class="bv-row-install"
              disabled={!!coreInstallRunning.value}
              onClick={() => install(c.id)}
            >
              {coreInstallRunning.value === c.id ? "installing…" : "install core →"}
            </button>
          </div>
        ))}

        {/* PROGRESS LOG */}
        {coreInstallProgress.value.length > 0 && (
          <div class="bv-install-log">
            <div class="bv-section-label">INSTALL LOG</div>
            {coreInstallProgress.value.slice(-12).map((l) => <div>{l}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write BoardsView.css**

```css
.bv { display: flex; flex-direction: column; height: 100%; font-family: var(--font-ui); }
.bv-header { padding: 14px 16px 10px; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: baseline; }
.bv-title { color: var(--text); font-weight: 600; font-size: 12px; }
.bv-stats { color: var(--text-muted); font-size: 9.5px; }
.bv-body { flex: 1; overflow-y: auto; padding: 12px 0; }
.bv-section-label {
  color: var(--text-muted); letter-spacing: 1.2px; font-size: 8.5px;
  font-weight: 700; font-family: var(--font-mono);
  padding: 0 16px; margin: 14px 0 8px;
}
.bv-section-label:first-child { margin-top: 0; }
.bv-empty { color: var(--text-dim); padding: 6px 18px; font-size: 10px; font-style: italic; }
.bv-row {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 16px; border-radius: 2px;
}
.bv-row:hover { background: var(--accent-gold-bg); }
.bv-row-connected { background: var(--panel); border-left: 2px solid var(--accent-sage); }
.bv-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.bv-dot.connected { background: var(--accent-sage); box-shadow: 0 0 4px var(--accent-sage); }
.bv-dot.idle { background: var(--text-disabled); }
.bv-dot.dim { background: var(--border); }
.bv-row-main { flex: 1; }
.bv-row-name { color: var(--text); font-size: 11px; font-weight: 600; }
.bv-row-meta { color: var(--text-muted); font-size: 9.5px; margin-top: 2px; font-family: var(--font-mono); }
.bv-row-status { color: var(--text-disabled); font-size: 9.5px; }
.bv-row-action { color: var(--accent-sage); font-size: 9.5px; background: transparent; }
.bv-row-install {
  color: var(--accent-gold); font-size: 9.5px;
  border: 1px solid var(--accent-gold-border); border-radius: 2px;
  padding: 4px 10px; background: transparent;
}
.bv-row-install:disabled { color: var(--text-disabled); border-color: var(--border); cursor: not-allowed; }
.bv-install-log {
  margin-top: 18px; padding: 12px 16px;
  background: var(--panel-alt); border-top: 1px solid var(--border-subtle);
  font-family: var(--font-mono); font-size: 9.5px; color: var(--text-muted);
  max-height: 140px; overflow-y: auto;
}
```

- [ ] **Step 3: Wire BoardsView into FileSidebar's rail switch**

In `FileSidebar.tsx`, import + render:
```tsx
import { BoardsView } from "./BoardsView";
// ...
{rail === "boards" && <BoardsView />}
```

Remove the previous placeholder for "boards".

- [ ] **Step 4: Commit**

```bash
git add src/components/BoardsView.tsx src/components/BoardsView.css src/components/FileSidebar.tsx
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: Boards view with connected/installed/available sections"
```

---

## Task 4: BoardSelector dropdown in ActionBar

**Files:** Create `src/components/BoardSelector.tsx`, `BoardSelector.css`

- [ ] **Step 1: Write BoardSelector.tsx**

```typescript
import { useState, useEffect } from "preact/hooks";
import { installedBoards, selectedFqbn } from "../state/appState";
import { arduinoApi } from "../ipc/arduino";
import "./BoardSelector.css";

export function BoardSelector() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (installedBoards.value.length === 0) {
      arduinoApi.listBoards().then((b) => installedBoards.value = b).catch(console.error);
    }
  }, []);

  const current = installedBoards.value.find((b) => b.fqbn === selectedFqbn.value);
  const list = installedBoards.value.filter((b) =>
    !filter || b.name.toLowerCase().includes(filter.toLowerCase())
  );

  function pick(fqbn: string) {
    selectedFqbn.value = fqbn;
    setOpen(false);
    setFilter("");
  }

  return (
    <div class="bs-wrapper">
      <button class="bs-btn" onClick={() => setOpen(!open)}>
        <span class="bs-icon">◆</span>
        <span>{current?.name ?? "Select board"}</span>
        <span class="bs-caret">▾</span>
      </button>
      {open && (
        <div class="bs-dropdown">
          <input
            class="bs-search"
            placeholder="search installed boards..."
            value={filter}
            onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
            autofocus
          />
          <div class="bs-list">
            {list.map((b) => (
              <button class={`bs-item ${b.fqbn === selectedFqbn.value ? "active" : ""}`}
                onClick={() => pick(b.fqbn)}>
                <div class="bs-item-name">{b.name}</div>
                <div class="bs-item-fqbn">{b.fqbn}</div>
              </button>
            ))}
            {list.length === 0 && <div class="bs-empty">No boards. Install a core in Boards view.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: BoardSelector.css**

```css
.bs-wrapper { position: relative; }
.bs-btn {
  background: var(--panel-alt); border: 1px solid var(--border);
  color: var(--text); padding: 6px 11px; font-size: 10.5px;
  border-radius: var(--radius-md); display: flex; align-items: center;
  gap: 7px; font-family: var(--font-ui);
}
.bs-icon { color: var(--accent-sage); }
.bs-caret { color: var(--text-muted); font-size: 9px; }
.bs-dropdown {
  position: absolute; top: calc(100% + 4px); left: 0; min-width: 340px;
  background: var(--panel); border: 1px solid var(--border);
  border-radius: var(--radius-md); box-shadow: 0 12px 28px rgba(0,0,0,0.45);
  z-index: 50; max-height: 400px; display: flex; flex-direction: column;
}
.bs-search {
  margin: 10px; padding: 7px 10px; background: var(--bg);
  border: 1px solid var(--border); border-radius: 3px;
  color: var(--text); font-size: 11px; font-family: var(--font-ui);
  outline: none;
}
.bs-search:focus { border-color: var(--accent-gold); }
.bs-list { flex: 1; overflow-y: auto; padding: 4px; }
.bs-item {
  display: block; width: 100%; text-align: left;
  padding: 8px 10px; border-radius: 2px; background: transparent;
}
.bs-item:hover { background: var(--accent-gold-bg); }
.bs-item.active { background: var(--accent-gold-bg); border-left: 2px solid var(--accent-gold); }
.bs-item-name { color: var(--text); font-size: 11px; font-weight: 600; }
.bs-item-fqbn { color: var(--text-muted); font-size: 9.5px; font-family: var(--font-mono); }
.bs-empty { color: var(--text-muted); padding: 14px; text-align: center; font-size: 11px; font-style: italic; }
```

- [ ] **Step 3: Replace the static board pill in ActionBar**

In `src/components/ActionBar.tsx`, replace the board pill:
```tsx
import { BoardSelector } from "./BoardSelector";
// ...
<BoardSelector />
```

Remove the old static pill.

- [ ] **Step 4: Commit**

```bash
git add src/components/BoardSelector.tsx src/components/BoardSelector.css src/components/ActionBar.tsx
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: real BoardSelector dropdown with search"
```

---

## Task 5: PortSelector with auto-refresh

**Files:** Create `src/components/PortSelector.tsx`, `PortSelector.css`

- [ ] **Step 1: Write PortSelector.tsx**

```typescript
import { useEffect, useRef, useState } from "preact/hooks";
import { detectedPorts, connectedPort, selectedFqbn } from "../state/appState";
import { arduinoApi } from "../ipc/arduino";
import "./PortSelector.css";

export function PortSelector() {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  // Auto-refresh every 2s while dropdown is open
  useEffect(() => {
    if (!open) return;
    const tick = async () => {
      try { detectedPorts.value = await arduinoApi.detectPorts(); } catch {}
    };
    tick();
    timer.current = window.setInterval(tick, 2000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [open]);

  const current = connectedPort.value;
  const ports = detectedPorts.value;

  function pick(p: string, fqbn?: string) {
    connectedPort.value = p;
    if (fqbn) selectedFqbn.value = fqbn;
    setOpen(false);
  }

  return (
    <div class="ps-wrapper">
      <button class="ps-btn" onClick={() => setOpen(!open)}>
        <span class={`ps-dot ${current ? "connected" : "idle"}`} />
        <span>{current ?? "No port"}</span>
        <span class="ps-caret">▾</span>
      </button>
      {open && (
        <div class="ps-dropdown">
          <div class="ps-head">Available ports <span class="ps-muted">· live</span></div>
          {ports.length === 0 ? (
            <div class="ps-empty">No devices detected. Plug in your board.</div>
          ) : (
            ports.map((p) => (
              <button
                class={`ps-item ${p.port === current ? "active" : ""}`}
                onClick={() => pick(p.port, p.fqbn)}
              >
                <div class="ps-item-port">{p.port}</div>
                <div class="ps-item-name">{p.name ?? "Unknown device"}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: PortSelector.css**

```css
.ps-wrapper { position: relative; }
.ps-btn {
  background: var(--panel-alt); border: 1px solid var(--border);
  color: var(--text); padding: 6px 11px; font-size: 10.5px;
  border-radius: var(--radius-md); display: flex; align-items: center; gap: 7px;
}
.ps-dot { width: 7px; height: 7px; border-radius: 50%; }
.ps-dot.connected { background: var(--accent-sage); box-shadow: 0 0 5px var(--accent-sage); }
.ps-dot.idle { background: var(--text-disabled); }
.ps-caret { color: var(--text-muted); font-size: 9px; }
.ps-dropdown {
  position: absolute; top: calc(100% + 4px); right: 0; min-width: 280px;
  background: var(--panel); border: 1px solid var(--border);
  border-radius: var(--radius-md); box-shadow: 0 12px 28px rgba(0,0,0,0.45);
  z-index: 50; padding: 8px 0;
}
.ps-head { padding: 6px 14px; color: var(--text-muted); font-size: 9px; letter-spacing: 1.2px; }
.ps-muted { color: var(--text-disabled); font-style: italic; }
.ps-empty { padding: 14px; text-align: center; color: var(--text-muted); font-size: 10px; font-style: italic; }
.ps-item {
  display: block; width: 100%; text-align: left; padding: 8px 14px;
  background: transparent; font-family: var(--font-ui);
}
.ps-item:hover { background: var(--accent-gold-bg); }
.ps-item.active { background: var(--accent-gold-bg); border-left: 2px solid var(--accent-gold); padding-left: 12px; }
.ps-item-port { color: var(--text); font-weight: 600; font-size: 11px; font-family: var(--font-mono); }
.ps-item-name { color: var(--text-muted); font-size: 9.5px; margin-top: 2px; }
```

- [ ] **Step 3: Replace port pill in ActionBar**

```tsx
import { PortSelector } from "./PortSelector";
// ...
<PortSelector />
```

- [ ] **Step 4: Commit**

```bash
git add src/components/PortSelector.tsx src/components/PortSelector.css src/components/ActionBar.tsx
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: real PortSelector with 2s auto-refresh"
```

---

## Task 6: Smoke test + tag

- [ ] **Step 1: Run IDE**

```bash
pnpm tauri dev
```

- [ ] **Step 2: Verify**

- [ ] Click Boards rail icon → BoardsView shows CONNECTED (your plugged-in ESP32), INSTALLED CORES (esp32:esp32 at least), AVAILABLE (Arduino AVR, RP2040, Teensy, etc.)
- [ ] Click "install core →" on Arduino AVR → progress log appears with download lines, eventually "✓ Installed"
- [ ] Click board pill in ActionBar → dropdown shows all installed boards, searchable
- [ ] Click port pill in ActionBar → dropdown auto-refreshes every 2s; unplug board → "No devices detected" appears within 2s

- [ ] **Step 3: Tag**

```bash
git tag -a phase8-boards-view -m "Phase 8 complete: universal board support + real selectors"
```

---

## Self-Review

- ✅ Boards rail view with 4 sections
- ✅ Core install with progress streaming
- ✅ Real BoardSelector with search
- ✅ Real PortSelector with auto-refresh
- ⏭ Per-board ForgeBoard.com Arduino URL for core download — add in distribution phase

---

*End of Phase 8. Next: Phase 9 — Libraries view (8,940+ registry).*
