# ForgeBoard IDE — Phase 9: Libraries View (8,940+ registry)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Prerequisite: `phase8-boards-view`.

**Goal:** Browse the Arduino Library Manager registry (8,940+ libraries) from inside ForgeBoard IDE. Install/uninstall with one click. Suggest libraries based on current sketch's `#include` directives. Support drag-and-drop ZIP install for unregistered libraries.

**Architecture:** Reuses the arduino-cli wrapper pattern from Phase 8. New Rust commands: `lib_search`, `lib_list_installed`, `lib_install`, `lib_uninstall`, `lib_install_zip`. Frontend has a dedicated LibrariesView rail component with a hero stats strip + search + installed/suggested lists.

---

## File Structure

```
src-tauri/src/arduino/
├── library.rs           # NEW — library wrappers
├── commands.rs          # MODIFIED

src/
├── ipc/arduino.ts       # add library endpoints
├── state/appState.ts    # installedLibraries, librarySearchResults signals
├── components/
│   ├── LibrariesView.tsx
│   └── LibrariesView.css
```

---

## Task 1: Rust library wrappers

**Files:** Create `src-tauri/src/arduino/library.rs`

- [ ] **Step 1: Write library.rs**

```rust
use super::cli;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Library {
    pub name: String,
    pub author: Option<String>,
    pub paragraph: Option<String>,    // description
    pub version: Option<String>,
    pub installed_version: Option<String>,
    pub latest_version: Option<String>,
    pub website: Option<String>,
    pub download_count: Option<u64>,
    pub sentence: Option<String>,     // short description
}

pub async fn search(app: &tauri::AppHandle, query: &str) -> Result<Vec<Library>, String> {
    let out = cli::run_capture(app, &["lib", "search", query, "--format", "json"]).await?;
    let v: serde_json::Value = serde_json::from_str(&out).map_err(|e| e.to_string())?;
    let mut libs = Vec::new();
    if let Some(arr) = v.get("libraries").and_then(|a| a.as_array()) {
        for lib in arr.iter().take(100) { // cap results
            libs.push(parse_library(lib));
        }
    }
    Ok(libs)
}

pub async fn list_installed(app: &tauri::AppHandle) -> Result<Vec<Library>, String> {
    let out = cli::run_capture(app, &["lib", "list", "--format", "json"]).await?;
    let v: serde_json::Value = serde_json::from_str(&out).map_err(|e| e.to_string())?;
    let mut libs = Vec::new();
    if let Some(arr) = v.get("installed_libraries").and_then(|a| a.as_array()) {
        for item in arr {
            if let Some(lib) = item.get("library") {
                libs.push(parse_library(lib));
            }
        }
    }
    Ok(libs)
}

pub async fn install(app: &tauri::AppHandle, name: &str) -> Result<i32, String> {
    let (code, _) = cli::run_streaming(
        app, "lib-install-output",
        &["lib", "install", name, "--no-color"],
    ).await?;
    Ok(code)
}

pub async fn uninstall(app: &tauri::AppHandle, name: &str) -> Result<i32, String> {
    let (code, _) = cli::run_streaming(
        app, "lib-install-output",
        &["lib", "uninstall", name, "--no-color"],
    ).await?;
    Ok(code)
}

pub async fn install_zip(app: &tauri::AppHandle, zip_path: &str) -> Result<i32, String> {
    let (code, _) = cli::run_streaming(
        app, "lib-install-output",
        &["lib", "install", "--zip-path", zip_path, "--no-color"],
    ).await?;
    Ok(code)
}

fn parse_library(v: &serde_json::Value) -> Library {
    Library {
        name: v.get("name").and_then(|s| s.as_str()).unwrap_or("").to_string(),
        author: v.get("author").and_then(|s| s.as_str()).map(String::from),
        paragraph: v.get("paragraph").and_then(|s| s.as_str()).map(String::from),
        version: v.get("version").and_then(|s| s.as_str()).map(String::from),
        installed_version: v.get("installed_version").and_then(|s| s.as_str()).map(String::from),
        latest_version: v.get("latest_version").and_then(|s| s.as_str()).map(String::from),
        website: v.get("website").and_then(|s| s.as_str()).map(String::from),
        download_count: v.get("download_count").and_then(|n| n.as_u64()),
        sentence: v.get("sentence").and_then(|s| s.as_str()).map(String::from),
    }
}
```

- [ ] **Step 2: Append to arduino/commands.rs**

```rust
#[tauri::command]
pub async fn arduino_lib_search(app: tauri::AppHandle, query: String) -> Result<Vec<super::library::Library>, String> {
    super::library::search(&app, &query).await
}
#[tauri::command]
pub async fn arduino_lib_list_installed(app: tauri::AppHandle) -> Result<Vec<super::library::Library>, String> {
    super::library::list_installed(&app).await
}
#[tauri::command]
pub async fn arduino_lib_install(app: tauri::AppHandle, name: String) -> Result<i32, String> {
    super::library::install(&app, &name).await
}
#[tauri::command]
pub async fn arduino_lib_uninstall(app: tauri::AppHandle, name: String) -> Result<i32, String> {
    super::library::uninstall(&app, &name).await
}
#[tauri::command]
pub async fn arduino_lib_install_zip(app: tauri::AppHandle, zip_path: String) -> Result<i32, String> {
    super::library::install_zip(&app, &zip_path).await
}
```

Register in main.rs invoke_handler!.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: arduino-cli library search/install/uninstall/zip wrappers"
```

---

## Task 2: Frontend wrappers + signals

**Files:** Modify `src/ipc/arduino.ts`, `src/state/appState.ts`

- [ ] **Step 1: Add to arduinoApi**

```typescript
export interface Library {
  name: string;
  author?: string;
  paragraph?: string;
  version?: string;
  installed_version?: string;
  latest_version?: string;
  website?: string;
  download_count?: number;
  sentence?: string;
}

// arduinoApi additions:
libSearch: (query: string) => invoke<Library[]>("arduino_lib_search", { query }),
libListInstalled: () => invoke<Library[]>("arduino_lib_list_installed"),
libInstall: (name: string) => invoke<number>("arduino_lib_install", { name }),
libUninstall: (name: string) => invoke<number>("arduino_lib_uninstall", { name }),
libInstallZip: (zipPath: string) => invoke<number>("arduino_lib_install_zip", { zipPath }),
onLibInstallOutput: (cb: (line: string) => void) => listen<string>("lib-install-output", e => cb(e.payload)),
```

- [ ] **Step 2: Signals**

```typescript
export const installedLibraries = signal<Library[]>([]);
export const librarySearchQuery = signal<string>("");
export const librarySearchResults = signal<Library[]>([]);
export const libraryInstalling = signal<string | null>(null);
export const totalRegistryCount = signal<number>(8940); // displayed hero number
```

- [ ] **Step 3: Commit**

```bash
git add src/ipc/arduino.ts src/state/appState.ts
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: library IPC + signals"
```

---

## Task 3: LibrariesView component

**Files:** Create `src/components/LibrariesView.tsx`, `LibrariesView.css`

- [ ] **Step 1: Write LibrariesView.tsx**

```typescript
import { useEffect, useState } from "preact/hooks";
import { arduinoApi } from "../ipc/arduino";
import {
  installedLibraries, librarySearchResults, librarySearchQuery,
  libraryInstalling, totalRegistryCount, fileContents,
  activeTabIndex, openTabs,
} from "../state/appState";
import "./LibrariesView.css";

export function LibrariesView() {
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    if (installedLibraries.value.length === 0) {
      arduinoApi.libListInstalled().then((l) => installedLibraries.value = l).catch(console.error);
    }
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebounced(librarySearchQuery.value), 350);
    return () => clearTimeout(t);
  }, [librarySearchQuery.value]);

  useEffect(() => {
    if (!debounced) { librarySearchResults.value = []; return; }
    arduinoApi.libSearch(debounced).then((r) => librarySearchResults.value = r).catch(console.error);
  }, [debounced]);

  async function install(name: string) {
    if (libraryInstalling.value) return;
    libraryInstalling.value = name;
    try {
      const code = await arduinoApi.libInstall(name);
      if (code === 0) installedLibraries.value = await arduinoApi.libListInstalled();
    } finally {
      libraryInstalling.value = null;
    }
  }

  async function uninstall(name: string) {
    if (!confirm(`Uninstall ${name}?`)) return;
    await arduinoApi.libUninstall(name);
    installedLibraries.value = await arduinoApi.libListInstalled();
  }

  // Suggested: parse #include lines from current sketch, match against top libraries
  const suggested = deriveSuggestions();

  return (
    <div class="lv">
      <div class="lv-hero">
        <div class="lv-hero-label">ARDUINO LIBRARY REGISTRY</div>
        <div class="lv-hero-number">
          {totalRegistryCount.value.toLocaleString()}+ libraries
          <span class="lv-hero-sub">· one-click install</span>
        </div>
        <div class="lv-hero-desc">
          Every library indexed by arduinolibraries.info. Plus drop any GitHub ZIP to install non-registered libraries.
        </div>

        <div class="lv-search">
          <span>⌕</span>
          <input
            placeholder="search FastLED, WiFi, sensors, displays…"
            value={librarySearchQuery.value}
            onInput={(e) => librarySearchQuery.value = (e.target as HTMLInputElement).value}
          />
        </div>
      </div>

      <div class="lv-body">
        {librarySearchResults.value.length > 0 && (
          <>
            <div class="lv-section-label">SEARCH RESULTS · {librarySearchResults.value.length}</div>
            {librarySearchResults.value.map((lib) => (
              <LibraryRow lib={lib} onInstall={() => install(lib.name)} onUninstall={() => uninstall(lib.name)} />
            ))}
          </>
        )}

        <div class="lv-section-label">INSTALLED · {installedLibraries.value.length}</div>
        {installedLibraries.value.length === 0 ? (
          <div class="lv-empty">No libraries installed yet.</div>
        ) : (
          installedLibraries.value.map((lib) => (
            <LibraryRow lib={lib} onUninstall={() => uninstall(lib.name)} isInstalled />
          ))
        )}

        {suggested.length > 0 && (
          <>
            <div class="lv-section-label">SUGGESTED FOR YOUR SKETCH</div>
            {suggested.map((name) => (
              <div class="lv-suggested-row">
                <span class="lv-dot dim" />
                <span class="lv-sug-name">{name}</span>
                <button class="lv-sug-install" onClick={() => install(name)}>install →</button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function LibraryRow({
  lib, onInstall, onUninstall, isInstalled,
}: {
  lib: import("../ipc/arduino").Library;
  onInstall?: () => void;
  onUninstall?: () => void;
  isInstalled?: boolean;
}) {
  const installed = isInstalled || !!lib.installed_version;
  const updateAvailable =
    lib.installed_version && lib.latest_version && lib.installed_version !== lib.latest_version;
  return (
    <div class="lv-row">
      <span class={`lv-dot ${installed ? "sage" : "dim"}`} />
      <div class="lv-row-main">
        <div class="lv-row-name">{lib.name}</div>
        <div class="lv-row-meta">
          {lib.sentence ?? lib.paragraph ?? "No description"}
          {lib.author && <span class="lv-author"> · by {lib.author}</span>}
        </div>
      </div>
      {installed ? (
        <div class="lv-row-actions">
          <span class="lv-ver">{lib.installed_version ?? "—"}</span>
          {updateAvailable && <button class="lv-update">update → {lib.latest_version}</button>}
          <button class="lv-remove" onClick={onUninstall}>remove</button>
        </div>
      ) : (
        <button class="lv-install" onClick={onInstall}>install</button>
      )}
    </div>
  );
}

function deriveSuggestions(): string[] {
  const tab = openTabs.value[activeTabIndex.value];
  if (!tab) return [];
  const code = fileContents.value.get(tab.path) ?? "";
  const includes = Array.from(code.matchAll(/#include\s+[<"](\w+)\.h[>"]/g)).map((m) => m[1]);
  const installedNames = new Set(installedLibraries.value.map((l) => l.name.toLowerCase()));
  // Very simple suggestion table
  const suggestionMap: Record<string, string> = {
    "FastLED": "Adafruit NeoPixel",
    "WiFi": "ArduinoJson",
    "Wire": "Adafruit BusIO",
    "DHT": "Adafruit Unified Sensor",
  };
  const out: string[] = [];
  for (const inc of includes) {
    const pair = suggestionMap[inc];
    if (pair && !installedNames.has(pair.toLowerCase())) out.push(pair);
  }
  return [...new Set(out)];
}
```

- [ ] **Step 2: Write LibrariesView.css**

```css
.lv { display: flex; flex-direction: column; height: 100%; font-family: var(--font-ui); }

.lv-hero {
  padding: 20px 22px 16px;
  border-bottom: 1px solid var(--border-subtle);
  background: linear-gradient(180deg, var(--panel) 0%, var(--panel-alt) 100%);
}
.lv-hero-label {
  color: var(--accent-gold); font-family: var(--font-mono);
  font-size: 9px; letter-spacing: 2px; font-weight: 700;
}
.lv-hero-number {
  color: var(--text); font-size: 22px; font-weight: 700;
  margin-top: 4px; letter-spacing: -0.3px;
}
.lv-hero-sub { color: var(--accent-sage); font-weight: 500; font-size: 14px; margin-left: 6px; }
.lv-hero-desc { color: var(--text-muted); font-size: 10.5px; margin-top: 5px; line-height: 1.55; }

.lv-search {
  margin-top: 14px; background: var(--bg); border: 1px solid var(--border);
  border-radius: 3px; padding: 8px 12px; display: flex; align-items: center; gap: 8px;
}
.lv-search span { color: var(--accent-gold); }
.lv-search input {
  flex: 1; background: transparent; border: none; outline: none;
  color: var(--text); font-family: var(--font-ui); font-size: 11px;
}

.lv-body { flex: 1; overflow-y: auto; padding: 14px 22px; }
.lv-section-label {
  color: var(--text-muted); letter-spacing: 1.3px; font-size: 9px;
  font-weight: 700; font-family: var(--font-mono);
  margin: 18px 0 10px;
}
.lv-section-label:first-child { margin-top: 0; }
.lv-empty { color: var(--text-dim); font-size: 10.5px; font-style: italic; padding: 4px 0; }

.lv-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px; background: var(--panel); border-radius: 3px;
  margin-bottom: 5px;
}
.lv-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.lv-dot.sage { background: var(--accent-sage); }
.lv-dot.dim { background: var(--border); }
.lv-row-main { flex: 1; min-width: 0; }
.lv-row-name { color: var(--text); font-size: 11px; font-weight: 600; }
.lv-row-meta { color: var(--text-muted); font-size: 9.5px; margin-top: 2px; line-height: 1.55; }
.lv-author { color: var(--text-disabled); }
.lv-row-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
.lv-ver { color: var(--text); font-size: 9.5px; font-family: var(--font-mono); }
.lv-update {
  color: var(--accent-sage); font-size: 9.5px;
  border: 1px solid rgba(127,178,161,0.3); padding: 4px 10px;
  border-radius: 2px; background: transparent;
}
.lv-remove {
  color: var(--text-muted); font-size: 9.5px;
  padding: 4px 8px; background: transparent;
}
.lv-remove:hover { color: var(--error); }
.lv-install {
  color: var(--accent-gold); font-size: 9.5px;
  border: 1px solid var(--accent-gold); padding: 4px 12px;
  border-radius: 2px; background: transparent; font-weight: 600;
}

.lv-suggested-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px; border: 1px solid var(--border);
  border-radius: 2px; margin-bottom: 5px;
}
.lv-sug-name { flex: 1; color: var(--text); font-size: 10.5px; }
.lv-sug-install {
  color: var(--accent-gold); font-size: 9.5px;
  border: 1px solid var(--accent-gold-border); padding: 3px 10px;
  border-radius: 2px; background: transparent;
}
```

- [ ] **Step 3: Wire into FileSidebar**

```tsx
import { LibrariesView } from "./LibrariesView";
// ...
{rail === "libraries" && <LibrariesView />}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/LibrariesView.tsx src/components/LibrariesView.css src/components/FileSidebar.tsx
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: LibrariesView with search, install, suggestions"
```

---

## Task 4: Drag-drop ZIP install

**Files:** Modify `src/App.tsx` to listen for drop events

- [ ] **Step 1: Tauri config — allow file drop**

In `src-tauri/tauri.conf.json`:
```json
"app": {
  "windows": [{
    ...existing config,
    "fileDropEnabled": true
  }]
}
```

- [ ] **Step 2: Add drop handler**

In `src/main.tsx` or App.tsx:

```typescript
import { listen } from "@tauri-apps/api/event";

listen<string[]>("tauri://file-drop", async (e) => {
  for (const path of e.payload) {
    if (path.toLowerCase().endsWith(".zip")) {
      if (!confirm(`Install library from ZIP: ${path}?`)) continue;
      const { arduinoApi } = await import("./ipc/arduino");
      await arduinoApi.libInstallZip(path);
      const { installedLibraries } = await import("./state/appState");
      installedLibraries.value = await arduinoApi.libListInstalled();
    }
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add src/main.tsx src-tauri/tauri.conf.json
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: drag-and-drop ZIP library install"
```

---

## Task 5: Smoke test + tag

- [ ] **Step 1: Run, click Libraries rail icon**

- [ ] Hero shows "8,940+ libraries · one-click install"
- [ ] Installed list (empty or minimal at first)
- [ ] Type "FastLED" → search results appear with install buttons
- [ ] Click install → progress streams to status bar or output tab
- [ ] Installed list refreshes; FastLED now has "remove" button
- [ ] Drop a ZIP onto the window → confirmation dialog, then install flow

- [ ] **Step 2: Tag**

```bash
git tag -a phase9-libraries -m "Phase 9 complete: library registry + install + drag-drop ZIP"
```

---

## Self-Review

- ✅ Registry search (debounced 350ms)
- ✅ One-click install
- ✅ Suggested-for-your-sketch based on `#include`
- ✅ Drag-drop ZIP
- ⏭ Library version picker — deferred (install always uses latest)
- ⏭ Offline-mode library cache — deferred

---

*End of Phase 9. Next: Phase 10 — Examples browser (40 curated examples).*
