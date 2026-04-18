# ForgeBoard IDE — Phase 4: Compile + Upload via arduino-cli

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Prerequisite: `phase3-filesystem` tag exists.

**Goal:** Ship arduino-cli bundled with the IDE. Make the "Check code" and "Upload →" buttons actually work — compile a sketch against the selected board, stream output to the bottom panel, and flash it to the connected port.

**Architecture:** Bundle the arduino-cli binary inside `src-tauri/binaries/`. A Rust wrapper (`arduino_cli::run`) spawns subprocesses with structured JSON output (`--format json`). Live output streams via Tauri event emitters. Frontend shows progress in the status bar and full output in the Output tab.

**Tech Stack:** arduino-cli 1.x, tokio process, Tauri events.

---

## File Structure

```
src-tauri/
├── binaries/
│   └── arduino-cli-x86_64-pc-windows-msvc.exe   # downloaded, in .gitignore
├── src/
│   ├── arduino/
│   │   ├── mod.rs
│   │   ├── cli.rs                # subprocess wrapper
│   │   ├── compile.rs
│   │   ├── upload.rs
│   │   ├── board.rs              # list/detect boards
│   │   └── commands.rs           # Tauri IPC

src/
├── ipc/
│   └── arduino.ts
├── state/
│   └── appState.ts               # add compileState signal
├── components/
│   └── ActionBar.tsx             # wire Check/Upload buttons
│   └── BottomPanel.tsx           # render output tab content
```

---

## Open Questions

- [ ] **arduino-cli bundling:** Download the binary during build (script) vs check into repo. Use a `scripts/download-arduino-cli.ps1` that runs in postinstall to avoid bloating git.

---

## Task 1: Download and set up arduino-cli

**Files:**
- Create: `scripts/download-arduino-cli.ps1`
- Modify: `.gitignore` (add `src-tauri/binaries/`)
- Modify: `package.json` — postinstall hook

- [ ] **Step 1: Write download script**

`scripts/download-arduino-cli.ps1`:

```powershell
$ErrorActionPreference = "Stop"
$version = "1.0.4"
$url = "https://downloads.arduino.cc/arduino-cli/arduino-cli_${version}_Windows_64bit.zip"
$outDir = "src-tauri/binaries"
$outZip = "$outDir/arduino-cli.zip"
$outExe = "$outDir/arduino-cli-x86_64-pc-windows-msvc.exe"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
if (Test-Path $outExe) { Write-Host "arduino-cli already present, skipping."; exit 0 }

Write-Host "Downloading arduino-cli $version..."
Invoke-WebRequest -Uri $url -OutFile $outZip
Expand-Archive -Path $outZip -DestinationPath $outDir -Force
Rename-Item "$outDir/arduino-cli.exe" $outExe
Remove-Item $outZip
Write-Host "arduino-cli ready at $outExe"
```

- [ ] **Step 2: Append to .gitignore**

```
# arduino-cli downloaded at build time
src-tauri/binaries/*.exe
src-tauri/binaries/*.zip
```

- [ ] **Step 3: Add postinstall hook**

In `package.json` `"scripts"`:
```json
"postinstall": "powershell -ExecutionPolicy Bypass -File scripts/download-arduino-cli.ps1"
```

- [ ] **Step 4: Run manually once**

```bash
pnpm install
```

Expected: creates `src-tauri/binaries/arduino-cli-x86_64-pc-windows-msvc.exe`.

- [ ] **Step 5: Configure Tauri to bundle the binary**

In `src-tauri/tauri.conf.json`, under `bundle`:
```json
"externalBin": [
  "binaries/arduino-cli-x86_64-pc-windows-msvc"
]
```

- [ ] **Step 6: Commit**

```bash
git add scripts/ .gitignore package.json src-tauri/tauri.conf.json
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "build: bundle arduino-cli binary via postinstall + tauri externalBin"
```

---

## Task 2: Rust subprocess wrapper

**Files:** Create `src-tauri/src/arduino/{mod.rs,cli.rs}`

- [ ] **Step 1: Write mod.rs**

```rust
pub mod cli;
pub mod compile;
pub mod upload;
pub mod board;
pub mod commands;
```

Register in `main.rs`: add `mod arduino;`.

- [ ] **Step 2: Write cli.rs**

```rust
use std::process::Stdio;
use tauri::{Manager, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Run arduino-cli with given args. Streams stdout line-by-line to the given event.
/// Returns (exit_code, combined_stderr).
pub async fn run_streaming(
    app: &tauri::AppHandle,
    event_name: &str,
    args: &[&str],
) -> Result<(i32, String), String> {
    let binary = app
        .path()
        .resolve("binaries/arduino-cli-x86_64-pc-windows-msvc.exe", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let mut cmd = Command::new(binary);
    cmd.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    { cmd.creation_flags(0x08000000); } // CREATE_NO_WINDOW

    let mut child = cmd.spawn().map_err(|e| format!("spawn: {e}"))?;
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let app_clone = app.clone();
    let event_clone = event_name.to_string();
    let out_handle = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_clone.emit(&event_clone, &line);
        }
    });

    let mut errbuf = String::new();
    let err_handle = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        let mut buf = String::new();
        while let Ok(Some(line)) = lines.next_line().await { buf.push_str(&line); buf.push('\n'); }
        buf
    });

    let status = child.wait().await.map_err(|e| e.to_string())?;
    out_handle.await.ok();
    errbuf = err_handle.await.unwrap_or_default();
    Ok((status.code().unwrap_or(-1), errbuf))
}

/// Simpler blocking call that returns combined output, for commands where we just want JSON back.
pub async fn run_capture(
    app: &tauri::AppHandle,
    args: &[&str],
) -> Result<String, String> {
    let binary = app
        .path()
        .resolve("binaries/arduino-cli-x86_64-pc-windows-msvc.exe", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let mut cmd = Command::new(binary);
    cmd.args(args);
    #[cfg(windows)]
    { cmd.creation_flags(0x08000000); }
    let output = cmd.output().await.map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}
```

- [ ] **Step 3: Add tokio process feature**

In `src-tauri/Cargo.toml` under `[dependencies]`:
```toml
tokio = { version = "1", features = ["full", "process", "io-util"] }
```

On Windows, also need `CommandExt`:
```toml
[target.'cfg(windows)'.dependencies]
# pulled in via std; use std::os::windows::process::CommandExt
```

Add `use std::os::windows::process::CommandExt;` at top of `cli.rs` inside `#[cfg(windows)]` block.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: arduino-cli subprocess wrapper with streaming output"
```

---

## Task 3: Board listing + port detection

**Files:** Create `src-tauri/src/arduino/board.rs`

- [ ] **Step 1: Write board.rs**

```rust
use super::cli;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Board {
    pub fqbn: String,    // fully-qualified board name e.g. "esp32:esp32:esp32s3"
    pub name: String,
    pub platform: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DetectedBoard {
    pub port: String,
    pub fqbn: Option<String>,
    pub name: Option<String>,
}

pub async fn list_installed_boards(app: &tauri::AppHandle) -> Result<Vec<Board>, String> {
    let out = cli::run_capture(app, &["board", "listall", "--format", "json"]).await?;
    #[derive(Deserialize)]
    struct Outer { boards: Vec<Inner> }
    #[derive(Deserialize)]
    struct Inner { fqbn: String, name: String, platform: Platform }
    #[derive(Deserialize)]
    struct Platform { id: String }
    let parsed: Outer = serde_json::from_str(&out).map_err(|e| e.to_string())?;
    Ok(parsed.boards.into_iter().map(|b| Board {
        fqbn: b.fqbn, name: b.name, platform: b.platform.id
    }).collect())
}

pub async fn detect_boards(app: &tauri::AppHandle) -> Result<Vec<DetectedBoard>, String> {
    let out = cli::run_capture(app, &["board", "list", "--format", "json"]).await?;
    // Parsing is best-effort; arduino-cli JSON shape varies.
    let v: serde_json::Value = serde_json::from_str(&out).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    if let Some(ports) = v.get("detected_ports").and_then(|p| p.as_array()) {
        for p in ports {
            let port = p.pointer("/port/address").and_then(|s| s.as_str()).unwrap_or("").to_string();
            let fqbn = p.pointer("/matching_boards/0/fqbn").and_then(|s| s.as_str()).map(String::from);
            let name = p.pointer("/matching_boards/0/name").and_then(|s| s.as_str()).map(String::from);
            if !port.is_empty() {
                result.push(DetectedBoard { port, fqbn, name });
            }
        }
    }
    Ok(result)
}
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/src/arduino/board.rs
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: board listing + port detection via arduino-cli"
```

---

## Task 4: Compile command

**Files:** Create `src-tauri/src/arduino/compile.rs`

- [ ] **Step 1: Write compile.rs**

```rust
use super::cli;
use std::path::Path;

pub async fn compile_sketch(
    app: &tauri::AppHandle,
    sketch_path: &Path,
    fqbn: &str,
) -> Result<CompileResult, String> {
    let sketch_str = sketch_path.to_string_lossy().into_owned();
    let (code, stderr) = cli::run_streaming(
        app,
        "compile-output",
        &[
            "compile",
            "--fqbn", fqbn,
            "--no-color",
            sketch_str.as_str(),
        ],
    ).await?;
    Ok(CompileResult {
        success: code == 0,
        exit_code: code,
        stderr,
    })
}

#[derive(serde::Serialize)]
pub struct CompileResult {
    pub success: bool,
    pub exit_code: i32,
    pub stderr: String,
}
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/src/arduino/compile.rs
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: arduino compile command with streaming output"
```

---

## Task 5: Upload command

**Files:** Create `src-tauri/src/arduino/upload.rs`

- [ ] **Step 1: Write upload.rs**

```rust
use super::cli;
use std::path::Path;

pub async fn upload_sketch(
    app: &tauri::AppHandle,
    sketch_path: &Path,
    fqbn: &str,
    port: &str,
) -> Result<UploadResult, String> {
    let sketch_str = sketch_path.to_string_lossy().into_owned();
    let (code, stderr) = cli::run_streaming(
        app,
        "upload-output",
        &[
            "upload",
            "--fqbn", fqbn,
            "--port", port,
            "--no-color",
            sketch_str.as_str(),
        ],
    ).await?;
    Ok(UploadResult {
        success: code == 0,
        exit_code: code,
        stderr,
    })
}

#[derive(serde::Serialize)]
pub struct UploadResult {
    pub success: bool,
    pub exit_code: i32,
    pub stderr: String,
}
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/src/arduino/upload.rs
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: arduino upload command with streaming output"
```

---

## Task 6: Tauri command exposure

**Files:** Create `src-tauri/src/arduino/commands.rs`; modify main.rs

- [ ] **Step 1: Write commands.rs**

```rust
use super::{board::*, compile::*, upload::*};
use std::path::PathBuf;

#[tauri::command]
pub async fn arduino_list_boards(app: tauri::AppHandle) -> Result<Vec<Board>, String> {
    super::board::list_installed_boards(&app).await
}

#[tauri::command]
pub async fn arduino_detect_ports(app: tauri::AppHandle) -> Result<Vec<DetectedBoard>, String> {
    super::board::detect_boards(&app).await
}

#[tauri::command]
pub async fn arduino_compile(
    app: tauri::AppHandle,
    sketch: PathBuf,
    fqbn: String,
) -> Result<CompileResult, String> {
    super::compile::compile_sketch(&app, &sketch, &fqbn).await
}

#[tauri::command]
pub async fn arduino_upload(
    app: tauri::AppHandle,
    sketch: PathBuf,
    fqbn: String,
    port: String,
) -> Result<UploadResult, String> {
    super::upload::upload_sketch(&app, &sketch, &fqbn, &port).await
}
```

- [ ] **Step 2: Register in main.rs**

Add to `invoke_handler!`:
```rust
arduino::commands::arduino_list_boards,
arduino::commands::arduino_detect_ports,
arduino::commands::arduino_compile,
arduino::commands::arduino_upload,
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: expose arduino compile/upload/detect commands"
```

---

## Task 7: Frontend wiring — Check + Upload buttons

**Files:** Modify `src/components/ActionBar.tsx`, `src/state/appState.ts`; create `src/ipc/arduino.ts`

- [ ] **Step 1: IPC wrapper**

`src/ipc/arduino.ts`:

```typescript
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface Board { fqbn: string; name: string; platform: string; }
export interface DetectedBoard { port: string; fqbn?: string; name?: string; }
export interface CompileResult { success: boolean; exit_code: number; stderr: string; }
export interface UploadResult { success: boolean; exit_code: number; stderr: string; }

export const arduinoApi = {
  listBoards: () => invoke<Board[]>("arduino_list_boards"),
  detectPorts: () => invoke<DetectedBoard[]>("arduino_detect_ports"),
  compile: (sketch: string, fqbn: string) => invoke<CompileResult>("arduino_compile", { sketch, fqbn }),
  upload: (sketch: string, fqbn: string, port: string) => invoke<UploadResult>("arduino_upload", { sketch, fqbn, port }),
  onCompileOutput: (cb: (line: string) => void) => listen<string>("compile-output", e => cb(e.payload)),
  onUploadOutput: (cb: (line: string) => void) => listen<string>("upload-output", e => cb(e.payload)),
};
```

- [ ] **Step 2: Add compile state signals**

In `src/state/appState.ts`:

```typescript
export type BuildPhase = "idle" | "checking" | "compiling" | "uploading" | "success" | "error";
export const buildPhase = signal<BuildPhase>("idle");
export const buildOutput = signal<string[]>([]);
export const selectedFqbn = signal<string>("esp32:esp32:esp32s3");
```

- [ ] **Step 3: Wire ActionBar buttons**

In `src/components/ActionBar.tsx`, add imports:
```typescript
import { arduinoApi } from "../ipc/arduino";
import {
  currentSketch, connectedPort, buildPhase, buildOutput,
  selectedFqbn, bottomPanelOpen, bottomPanelTab,
} from "../state/appState";
import { useEffect } from "preact/hooks";

// set up listeners once
let listenersInstalled = false;
async function ensureListeners() {
  if (listenersInstalled) return;
  listenersInstalled = true;
  await arduinoApi.onCompileOutput((line) => {
    buildOutput.value = [...buildOutput.value, line];
  });
  await arduinoApi.onUploadOutput((line) => {
    buildOutput.value = [...buildOutput.value, line];
  });
}

async function doCheck() {
  await ensureListeners();
  const s = currentSketch.value;
  if (!s) return alert("No sketch open.");
  buildPhase.value = "compiling";
  buildOutput.value = [];
  bottomPanelOpen.value = true;
  bottomPanelTab.value = "output";
  try {
    const r = await arduinoApi.compile(s.path, selectedFqbn.value);
    buildPhase.value = r.success ? "success" : "error";
    if (!r.success) buildOutput.value = [...buildOutput.value, "--- STDERR ---", r.stderr];
  } catch (e: any) {
    buildPhase.value = "error";
    buildOutput.value = [...buildOutput.value, `Error: ${e}`];
  }
}

async function doUpload() {
  await ensureListeners();
  const s = currentSketch.value;
  if (!s) return alert("No sketch open.");
  const port = connectedPort.value;
  if (!port) return alert("No port connected.");
  buildPhase.value = "compiling";
  buildOutput.value = [];
  bottomPanelOpen.value = true;
  bottomPanelTab.value = "output";
  try {
    buildPhase.value = "uploading";
    const r = await arduinoApi.upload(s.path, selectedFqbn.value, port);
    buildPhase.value = r.success ? "success" : "error";
    if (!r.success) buildOutput.value = [...buildOutput.value, "--- STDERR ---", r.stderr];
  } catch (e: any) {
    buildPhase.value = "error";
    buildOutput.value = [...buildOutput.value, `Error: ${e}`];
  }
}
```

Then replace the Check button and Upload button with:
```tsx
<button class="btn btn-ghost" onClick={doCheck} disabled={buildPhase.value === "compiling" || buildPhase.value === "uploading"}>
  <span class="btn-icon check">✓</span>
  <span>{buildPhase.value === "compiling" ? "Checking…" : "Check code"}</span>
</button>
<button class="btn btn-primary" onClick={doUpload} disabled={buildPhase.value === "compiling" || buildPhase.value === "uploading"}>
  <span>{buildPhase.value === "uploading" ? "Uploading…" : "Upload"}</span>
  <span>→</span>
</button>
```

- [ ] **Step 4: Commit**

```bash
git add src/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: wire Check/Upload buttons to arduino-cli"
```

---

## Task 8: Render compile output in bottom panel

**Files:** Modify `src/components/BottomPanel.tsx`

- [ ] **Step 1: Replace `Output` placeholder with live stream**

In `BottomPanel.tsx`, add:
```typescript
import { buildOutput, buildPhase } from "../state/appState";
```

Replace the output tab body:
```tsx
{bottomPanelTab.value === "output" && (
  <pre class="bp-output">
    {buildOutput.value.length === 0
      ? <span class="bp-output-empty">No output. Click "Check code" or "Upload →" to run arduino-cli.</span>
      : buildOutput.value.map((line) => <div>{line}</div>)
    }
    {buildPhase.value === "compiling" && <div class="bp-output-status">... compiling</div>}
    {buildPhase.value === "uploading" && <div class="bp-output-status">... uploading</div>}
    {buildPhase.value === "success" && <div class="bp-output-ok">✓ Success</div>}
    {buildPhase.value === "error" && <div class="bp-output-err">✗ Failed</div>}
  </pre>
)}
```

Append to `BottomPanel.css`:
```css
.bp-output {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text);
  line-height: 1.6;
  white-space: pre-wrap;
  max-height: 100%;
  overflow-y: auto;
}
.bp-output-empty { color: var(--text-muted); }
.bp-output-status { color: var(--accent-gold); margin-top: 6px; }
.bp-output-ok { color: var(--accent-sage); margin-top: 6px; font-weight: 600; }
.bp-output-err { color: var(--error); margin-top: 6px; font-weight: 600; }
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BottomPanel.tsx src/components/BottomPanel.css
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: render live arduino-cli output in Output tab"
```

---

## Task 9: Install ESP32 core for ForgeBoard

- [ ] **Step 1: Run arduino-cli manually to install ESP32 core**

```bash
./src-tauri/binaries/arduino-cli-x86_64-pc-windows-msvc.exe config init --overwrite
./src-tauri/binaries/arduino-cli-x86_64-pc-windows-msvc.exe config add board_manager.additional_urls https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
./src-tauri/binaries/arduino-cli-x86_64-pc-windows-msvc.exe core update-index
./src-tauri/binaries/arduino-cli-x86_64-pc-windows-msvc.exe core install esp32:esp32
```

Expected: ESP32 core installs to `~/.arduino15` or wherever arduino-cli stores it. This is a manual one-time step for dev; Phase 8 automates this.

- [ ] **Step 2: Set FQBN in app state to real ESP32-S3**

`selectedFqbn.value = "esp32:esp32:esp32s3"` is already the default.

- [ ] **Step 3: Commit**

No code changes. Move on.

---

## Task 10: Smoke test + tag

- [ ] **Step 1: Plug in an ESP32-S3 / ForgeBoard**

Physically connect. Verify it shows up as COM* in Windows Device Manager.

- [ ] **Step 2: Run the IDE**

```bash
pnpm tauri dev
```

- [ ] **Step 3: Click "Check code"**

Expected: bottom panel switches to "Output", shows compile progress lines, finishes with "✓ Success" if sketch is valid.

- [ ] **Step 4: Click "Upload →"**

Expected: output shows upload progress ("Writing at 0x00001000..."), completes with success. LED behavior on board changes per your sketch.

- [ ] **Step 5: Tag**

```bash
git tag -a phase4-compile-upload -m "Phase 4 complete: arduino-cli bundled, Check + Upload functional"
```

---

## Self-Review

- ✅ arduino-cli bundled and invoked
- ✅ Board listing + port detection
- ✅ Compile + Upload streaming output
- ✅ Output tab shows live progress
- ⏭ Smart Help error translation — Phase 6
- ⏭ Auto port detection dropdown refresh — Phase 8
- ⏭ Board selector dropdown actually populated — Phase 8

**Placeholder scan:** Board selector still shows static "ForgeBoard Beginner" — real dropdown arrives in Phase 8. Acceptable; user can edit `selectedFqbn` default in code for now.

---

*End of Phase 4. Next: Phase 5 — Serial Monitor (streaming I/O to the bottom panel).*
