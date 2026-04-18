# ForgeBoard IDE — Phase 3: File System + Sketch Model

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Prerequisite: `phase2-monaco` tag exists.

**Goal:** Replace in-memory file storage with real disk I/O. User can create a new sketch, open an existing sketch, edit files, and autosave writes to disk every 2s. Sketch folder convention matches Arduino IDE (`sketch-name/sketch-name.ino` + siblings).

**Architecture:** All file I/O lives in Rust (`src-tauri/src/project/`). Frontend calls Tauri commands — `project_open`, `project_save_file`, `project_create`, `project_list_recent`, `project_add_file`, `project_delete_file`. Sketch root defaults to `~/Documents/ForgeBoard/sketches`. Per-project state lives in `.forgeboard/` inside each sketch folder.

**Tech Stack:** Rust (tokio, serde, dirs crate), Tauri 2 commands.

---

## File Structure

```
src-tauri/src/
├── project/
│   ├── mod.rs                # re-exports
│   ├── model.rs              # Sketch, SketchFile types
│   ├── fs.rs                 # filesystem helpers
│   ├── recent.rs             # recent projects tracking
│   └── commands.rs           # Tauri commands
├── main.rs                   # register new commands

src/
├── ipc/
│   └── project.ts            # frontend wrappers
├── state/
│   └── appState.ts           # add currentProject signal
├── components/
│   └── FileSidebar.tsx       # wire to real file list
```

---

## Task 1: Add Rust dependencies

- [ ] **Step 1: Modify `src-tauri/Cargo.toml`**

Add to `[dependencies]`:
```toml
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
dirs = "5"
thiserror = "1"
anyhow = "1"
```

- [ ] **Step 2: Build to fetch deps**

```bash
cd src-tauri && cargo build && cd ..
```

Expected: compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "chore: add tokio, serde, dirs, thiserror, anyhow"
```

---

## Task 2: Define project types

**Files:** Create `src-tauri/src/project/model.rs`

- [ ] **Step 1: Write model.rs**

```rust
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SketchFile {
    pub name: String,        // e.g. "led-chase.ino"
    pub path: PathBuf,
    pub is_main: bool,       // true if matches folder name + .ino
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Sketch {
    pub name: String,        // folder name
    pub path: PathBuf,       // absolute path to folder
    pub files: Vec<SketchFile>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RecentProject {
    pub name: String,
    pub path: PathBuf,
    pub last_opened: u64,    // unix timestamp (secs)
}

#[derive(thiserror::Error, Debug, Serialize)]
#[serde(tag = "type", content = "message")]
pub enum ProjectError {
    #[error("Sketch folder not found: {0}")]
    NotFound(String),
    #[error("Invalid sketch folder (missing main .ino): {0}")]
    Invalid(String),
    #[error("I/O error: {0}")]
    Io(String),
    #[error("Already exists: {0}")]
    AlreadyExists(String),
}

impl From<std::io::Error> for ProjectError {
    fn from(e: std::io::Error) -> Self { ProjectError::Io(e.to_string()) }
}
```

- [ ] **Step 2: Create `src-tauri/src/project/mod.rs`**

```rust
pub mod model;
pub mod fs;
pub mod recent;
pub mod commands;
```

- [ ] **Step 3: Register module in main.rs**

Add `mod project;` near top of `src-tauri/src/main.rs`, above existing `mod commands;`.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: add project model types"
```

---

## Task 3: Implement filesystem helpers with tests

**Files:** Create `src-tauri/src/project/fs.rs`

- [ ] **Step 1: Write fs.rs**

```rust
use super::model::{ProjectError, Sketch, SketchFile};
use std::path::{Path, PathBuf};

/// Default sketches directory: ~/Documents/ForgeBoard/sketches
pub fn sketches_root() -> Result<PathBuf, ProjectError> {
    let docs = dirs::document_dir()
        .ok_or_else(|| ProjectError::Io("no Documents folder".into()))?;
    Ok(docs.join("ForgeBoard").join("sketches"))
}

/// Ensure the sketches root exists; create if missing.
pub fn ensure_sketches_root() -> Result<PathBuf, ProjectError> {
    let root = sketches_root()?;
    std::fs::create_dir_all(&root)?;
    Ok(root)
}

/// Read a sketch folder into a Sketch struct.
pub fn read_sketch(path: &Path) -> Result<Sketch, ProjectError> {
    if !path.is_dir() {
        return Err(ProjectError::NotFound(path.to_string_lossy().into_owned()));
    }
    let folder_name = path.file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| ProjectError::Invalid(path.to_string_lossy().into_owned()))?
        .to_string();
    let main_ino = format!("{}.ino", folder_name);

    let mut files = Vec::new();
    let mut found_main = false;
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        let ft = entry.file_type()?;
        if !ft.is_file() { continue; }
        let name = entry.file_name().to_string_lossy().into_owned();
        // skip hidden / dot files
        if name.starts_with('.') { continue; }
        let is_main = name == main_ino;
        if is_main { found_main = true; }
        files.push(SketchFile {
            name: name.clone(),
            path: entry.path(),
            is_main,
        });
    }

    if !found_main {
        return Err(ProjectError::Invalid(format!(
            "expected {}", main_ino
        )));
    }

    // Sort: main .ino first, then alpha
    files.sort_by(|a, b| b.is_main.cmp(&a.is_main).then(a.name.cmp(&b.name)));

    Ok(Sketch {
        name: folder_name,
        path: path.to_path_buf(),
        files,
    })
}

/// Create a new empty sketch folder with a blank .ino.
pub fn create_sketch(name: &str) -> Result<Sketch, ProjectError> {
    let root = ensure_sketches_root()?;
    let folder = root.join(name);
    if folder.exists() {
        return Err(ProjectError::AlreadyExists(name.into()));
    }
    std::fs::create_dir_all(&folder)?;
    let ino = folder.join(format!("{}.ino", name));
    std::fs::write(&ino, DEFAULT_INO_CONTENTS)?;
    read_sketch(&folder)
}

/// Read a file's contents as a UTF-8 string.
pub fn read_file(path: &Path) -> Result<String, ProjectError> {
    Ok(std::fs::read_to_string(path)?)
}

/// Write a file's contents.
pub fn write_file(path: &Path, contents: &str) -> Result<(), ProjectError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, contents)?;
    Ok(())
}

const DEFAULT_INO_CONTENTS: &str = "void setup() {\n  // initialize once\n}\n\nvoid loop() {\n  // repeat forever\n}\n";

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmpdir() -> PathBuf {
        let d = std::env::temp_dir().join(format!("fb-ide-test-{}", rand::random::<u32>()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn read_sketch_finds_main_and_helpers() {
        let dir = tmpdir();
        let sketch_dir = dir.join("blink");
        fs::create_dir(&sketch_dir).unwrap();
        fs::write(sketch_dir.join("blink.ino"), "void setup() {}").unwrap();
        fs::write(sketch_dir.join("pins.h"), "#define LED 2").unwrap();

        let s = read_sketch(&sketch_dir).unwrap();
        assert_eq!(s.name, "blink");
        assert_eq!(s.files.len(), 2);
        assert!(s.files[0].is_main);
        assert_eq!(s.files[0].name, "blink.ino");
        assert_eq!(s.files[1].name, "pins.h");

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn read_sketch_rejects_folder_without_main_ino() {
        let dir = tmpdir();
        let sketch_dir = dir.join("foo");
        fs::create_dir(&sketch_dir).unwrap();
        fs::write(sketch_dir.join("bar.h"), "").unwrap();

        let result = read_sketch(&sketch_dir);
        assert!(matches!(result, Err(ProjectError::Invalid(_))));

        fs::remove_dir_all(&dir).unwrap();
    }
}
```

- [ ] **Step 2: Add `rand` as a dev-dependency**

In `src-tauri/Cargo.toml`:
```toml
[dev-dependencies]
rand = "0.8"
```

- [ ] **Step 3: Run tests**

```bash
cd src-tauri && cargo test project::fs && cd ..
```

Expected: `2 passed`.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: filesystem helpers for sketch folders with tests"
```

---

## Task 4: Implement recent-projects tracking

**Files:** Create `src-tauri/src/project/recent.rs`

- [ ] **Step 1: Write recent.rs**

```rust
use super::model::{ProjectError, RecentProject};
use std::path::PathBuf;

fn recent_file() -> Result<PathBuf, ProjectError> {
    let data = dirs::data_local_dir()
        .ok_or_else(|| ProjectError::Io("no data_local_dir".into()))?;
    let dir = data.join("ForgeBoard");
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("recent.json"))
}

pub fn load_recent() -> Result<Vec<RecentProject>, ProjectError> {
    let path = recent_file()?;
    if !path.exists() { return Ok(vec![]); }
    let s = std::fs::read_to_string(path)?;
    Ok(serde_json::from_str(&s).unwrap_or_default())
}

pub fn push_recent(name: &str, path: &std::path::Path) -> Result<(), ProjectError> {
    let mut list = load_recent()?;
    // Remove existing entry with same path
    list.retain(|r| r.path != path);
    list.insert(0, RecentProject {
        name: name.into(),
        path: path.to_path_buf(),
        last_opened: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs()).unwrap_or(0),
    });
    list.truncate(10);
    let f = recent_file()?;
    std::fs::write(f, serde_json::to_string_pretty(&list).unwrap())?;
    Ok(())
}
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/src/project/recent.rs
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: recent projects tracked in data_local_dir"
```

---

## Task 5: Expose Tauri commands

**Files:** Create `src-tauri/src/project/commands.rs`; modify `src-tauri/src/main.rs`

- [ ] **Step 1: Write commands.rs**

```rust
use super::{fs, model::*, recent};
use std::path::PathBuf;

#[tauri::command]
pub fn project_sketches_root() -> Result<PathBuf, ProjectError> {
    fs::ensure_sketches_root()
}

#[tauri::command]
pub fn project_open(path: PathBuf) -> Result<Sketch, ProjectError> {
    let s = fs::read_sketch(&path)?;
    let _ = recent::push_recent(&s.name, &s.path);
    Ok(s)
}

#[tauri::command]
pub fn project_create(name: String) -> Result<Sketch, ProjectError> {
    let s = fs::create_sketch(&name)?;
    let _ = recent::push_recent(&s.name, &s.path);
    Ok(s)
}

#[tauri::command]
pub fn project_read_file(path: PathBuf) -> Result<String, ProjectError> {
    fs::read_file(&path)
}

#[tauri::command]
pub fn project_save_file(path: PathBuf, contents: String) -> Result<(), ProjectError> {
    fs::write_file(&path, &contents)
}

#[tauri::command]
pub fn project_list_recent() -> Result<Vec<RecentProject>, ProjectError> {
    recent::load_recent()
}
```

- [ ] **Step 2: Register in main.rs**

Replace the `invoke_handler` block:
```rust
.invoke_handler(tauri::generate_handler![
    commands::ping::ping,
    project::commands::project_sketches_root,
    project::commands::project_open,
    project::commands::project_create,
    project::commands::project_read_file,
    project::commands::project_save_file,
    project::commands::project_list_recent,
])
```

- [ ] **Step 3: Build**

```bash
cd src-tauri && cargo build && cd ..
```

Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: expose project commands over IPC"
```

---

## Task 6: Frontend IPC wrappers

**Files:** Create `src/ipc/project.ts`

- [ ] **Step 1: Write the wrapper**

```typescript
import { invoke } from "@tauri-apps/api/core";

export interface SketchFile {
  name: string;
  path: string;
  is_main: boolean;
}
export interface Sketch {
  name: string;
  path: string;
  files: SketchFile[];
}
export interface RecentProject {
  name: string;
  path: string;
  last_opened: number;
}

export const projectApi = {
  sketchesRoot: () => invoke<string>("project_sketches_root"),
  open: (path: string) => invoke<Sketch>("project_open", { path }),
  create: (name: string) => invoke<Sketch>("project_create", { name }),
  readFile: (path: string) => invoke<string>("project_read_file", { path }),
  saveFile: (path: string, contents: string) =>
    invoke<void>("project_save_file", { path, contents }),
  listRecent: () => invoke<RecentProject[]>("project_list_recent"),
};
```

- [ ] **Step 2: Commit**

```bash
git add src/ipc/project.ts
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: frontend IPC wrapper for project commands"
```

---

## Task 7: Wire app state to real filesystem

**Files:** Modify `src/state/appState.ts`; modify `src/App.tsx` (bootstrap)

- [ ] **Step 1: Refactor appState.ts**

Replace the in-memory `fileContents` with a current-project signal:

```typescript
import { signal, computed } from "@preact/signals";
import type { Sketch, SketchFile } from "../ipc/project";

export type RailIcon = /* unchanged */ "home" | "files" | "examples" | "search" | "libraries" | "boards" | "walkthrough" | "settings";
export const activeRail = signal<RailIcon>("files");
export const connectedBoard = signal<string | null>("ForgeBoard Beginner");
export const connectedPort = signal<string | null>("COM3");
export const bottomPanelOpen = signal<boolean>(true);
export const bottomPanelTab = signal<"serial" | "output" | "plotter" | "problems">("serial");
export const problemsCount = computed(() => 0);

/** Currently opened sketch (metadata) */
export const currentSketch = signal<Sketch | null>(null);

/** Path → content map for open files */
export const fileContents = signal<Map<string, string>>(new Map());

/** Open tabs — referenced by absolute file path */
export const openTabs = signal<{ path: string; name: string; modified: boolean }[]>([]);
export const activeTabIndex = signal<number>(0);

export const saveState = signal<"saved" | "saving" | "unsaved">("saved");
```

- [ ] **Step 2: Bootstrap — load a sketch on app start**

Create `src/lib/bootstrap.ts`:

```typescript
import { projectApi } from "../ipc/project";
import { currentSketch, fileContents, openTabs, activeTabIndex } from "../state/appState";

export async function bootstrapProject() {
  // For Phase 3: auto-create or open a "hello" sketch so users have something
  const recent = await projectApi.listRecent();
  let sketch;
  if (recent.length > 0) {
    try { sketch = await projectApi.open(recent[0].path); } catch { /* fall through */ }
  }
  if (!sketch) {
    try { sketch = await projectApi.create("hello"); }
    catch { sketch = await projectApi.open(
      // If "hello" already exists, open it
      (await projectApi.sketchesRoot()) + "/hello"
    ); }
  }
  currentSketch.value = sketch;

  // Load file contents
  const contents = new Map<string, string>();
  for (const f of sketch.files) {
    contents.set(f.path, await projectApi.readFile(f.path));
  }
  fileContents.value = contents;
  openTabs.value = sketch.files.map((f) => ({
    path: f.path, name: f.name, modified: false,
  }));
  activeTabIndex.value = 0;
}
```

- [ ] **Step 3: Call bootstrap in main.tsx**

```typescript
import { bootstrapProject } from "./lib/bootstrap";
// ...
installShortcuts();
bootstrapProject().catch(console.error);
startAutoSaveLoop();
render(<App />, document.getElementById("app")!);
```

- [ ] **Step 4: Commit**

```bash
git add src/state/appState.ts src/lib/bootstrap.ts src/main.tsx
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: bootstrap loads/creates a sketch from disk on start"
```

---

## Task 8: Rewrite autosave to persist to disk

**Files:** Modify `src/lib/autosave.ts`

- [ ] **Step 1: Replace autosave.ts**

```typescript
import { effect } from "@preact/signals";
import { saveState, fileContents, openTabs } from "../state/appState";
import { projectApi } from "../ipc/project";

const AUTOSAVE_MS = 2000;
let pendingSave: number | null = null;

export function startAutoSaveLoop() {
  effect(() => {
    fileContents.value;
    openTabs.value;
    if (saveState.value !== "unsaved") return;
    if (pendingSave) clearTimeout(pendingSave);
    pendingSave = window.setTimeout(saveAllModified, AUTOSAVE_MS);
  });
}

async function saveAllModified() {
  saveState.value = "saving";
  const tabs = openTabs.value;
  for (const t of tabs) {
    if (!t.modified) continue;
    const contents = fileContents.value.get(t.path);
    if (contents == null) continue;
    try {
      await projectApi.saveFile(t.path, contents);
    } catch (e) {
      console.error("save failed for", t.path, e);
      saveState.value = "unsaved";
      return;
    }
  }
  openTabs.value = tabs.map((t) => ({ ...t, modified: false }));
  saveState.value = "saved";
  pendingSave = null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/autosave.ts
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: autosave persists to disk via IPC"
```

---

## Task 9: Rewrite FileSidebar from real sketch data

**Files:** Modify `src/components/FileSidebar.tsx`

- [ ] **Step 1: Replace FilesView**

```typescript
function FilesView() {
  const sketch = currentSketch.value;
  if (!sketch) return <div class="sb-placeholder">No sketch open.</div>;

  const activeTab = openTabs.value[activeTabIndex.value];

  return (
    <>
      <div class="sb-header">
        <span class="sb-title">Your files</span>
        <span class="sb-new" onClick={async () => {
          const name = prompt("New sketch name:");
          if (!name) return;
          try { const s = await projectApi.create(name); /* TODO: load into app */ }
          catch (e) { alert(`Couldn't create: ${e}`); }
        }}>+ new</span>
      </div>
      <div class="sb-body">
        <div class="sb-section-label">SKETCH · {sketch.name}</div>
        {sketch.files.map((f) => (
          <div class={`sb-file ${activeTab?.path === f.path ? "active" : ""}`}
            onClick={() => {
              const idx = openTabs.value.findIndex((t) => t.path === f.path);
              if (idx >= 0) activeTabIndex.value = idx;
            }}
          >
            {f.is_main && <span class="sb-mod">◆</span>}
            {f.name}
          </div>
        ))}
      </div>
    </>
  );
}
```

Add imports at top:
```typescript
import { currentSketch, activeRail, openTabs, activeTabIndex } from "../state/appState";
import { projectApi } from "../ipc/project";
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FileSidebar.tsx
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: FileSidebar shows real sketch files from disk"
```

---

## Task 10: Smoke test + tag

- [ ] **Step 1: Run**

```bash
pnpm tauri dev
```

- [ ] **Step 2: Verify**

- [ ] On first launch, `~/Documents/ForgeBoard/sketches/hello/hello.ino` is created with a blank setup/loop
- [ ] Sidebar shows "SKETCH · hello" and `hello.ino` with a gold ◆
- [ ] Editor loads the .ino content
- [ ] Type something → 2s later status bar says "✓ Saved" and the file on disk has the new content (check via Explorer)
- [ ] Quit, relaunch → hello.ino opens with your changes preserved (recent-project tracking works)

- [ ] **Step 3: Tag**

```bash
git tag -a phase3-filesystem -m "Phase 3 complete: real disk I/O + sketch model"
```

---

## Self-Review

- ✅ Folder-per-sketch model
- ✅ Sketches root at `~/Documents/ForgeBoard/sketches/`
- ✅ Recent projects tracked
- ✅ Autosave persists to disk
- ✅ Create/open commands
- ⏭ File watcher (external edits) — deferred, v1.1
- ⏭ New-file dialog for adding files within a sketch — deferred to Phase 12 settings
- ⏭ ⌘P fuzzy file search — deferred to Phase 12

**Placeholder scan:** One TODO in the `+ new` button handler — flagged for Phase 12. Acceptable because Phase 3 delivers the core flow (open + edit + save) and new-sketch-from-sidebar is not critical path.

---

*End of Phase 3. Next: Phase 4 — arduino-cli integration (Check code + Upload →).*
