# ForgeBoard IDE — Implementation Roadmap

Fourteen phases, executed in order. Each phase ends with a shippable milestone, a smoke test, and a git tag. Solo-developer timeline: **~24 weeks (5-6 months)** full-time from scaffold to public v1.0.

The full design spec is at [`../specs/2026-04-18-forgeboard-ide-design.md`](../specs/2026-04-18-forgeboard-ide-design.md).

---

## Phase-by-phase index

| # | Phase | Shippable outcome | Tag | Est. |
|---|-------|-------------------|-----|------|
| 1 | [Core Shell](2026-04-18-forgeboard-ide-phase1-core-shell.md) | Tauri window with full layout skeleton + IPC handshake | `phase1-shell` | 1 wk |
| 2 | [Monaco Editor](2026-04-18-forgeboard-ide-phase2-monaco-editor.md) | Real editor with Arduino syntax, tabs, breadcrumb, autosave | `phase2-monaco` | 1 wk |
| 3 | [File System](2026-04-18-forgeboard-ide-phase3-file-system.md) | Create/open/save sketches to disk, folder-per-sketch model | `phase3-filesystem` | 1 wk |
| 4 | [Compile + Upload](2026-04-18-forgeboard-ide-phase4-compile-upload.md) | Check + Upload buttons functional via bundled arduino-cli | `phase4-compile-upload` | 1.5 wk |
| 5 | [Serial Monitor](2026-04-18-forgeboard-ide-phase5-serial-monitor.md) | Live I/O: receive + send with history, line-ending selector | `phase5-serial` | 1 wk |
| 6 | [Smart Help Framework](2026-04-18-forgeboard-ide-phase6-smart-help-framework.md) | Analyzer + wavy underlines + Findings panel + Dismiss/Pin | `phase6-smart-help-framework` | 1.5 wk |
| 7 | [Smart Help Content](2026-04-18-forgeboard-ide-phase7-smart-help-content.md) | 500 curated YAML entries + snapshot tests | `phase7-content` | 2 wk |
| 8 | [Boards View](2026-04-18-forgeboard-ide-phase8-boards-view.md) | Universal board support, on-demand core install, real BoardSelector | `phase8-boards-view` | 1.5 wk |
| 9 | [Libraries View](2026-04-18-forgeboard-ide-phase9-libraries-view.md) | 8,940+ registry search, install, drag-drop ZIP, suggestions | `phase9-libraries` | 2 wk |
| 10 | [Examples View](2026-04-18-forgeboard-ide-phase10-examples-view.md) | 40 curated examples, categorized browser, open-as-new-sketch | `phase10-examples` | 1 wk |
| 11 | [Serial Plotter](2026-04-18-forgeboard-ide-phase11-serial-plotter.md) | Live canvas chart, 4 series, numeric parser | `phase11-plotter` | 1 wk |
| 12 | [Settings + ⌘K](2026-04-18-forgeboard-ide-phase12-settings-palette.md) | All prefs + command palette with fuzzy search | `phase12-settings-palette` | 0.5 wk |
| 13 | [Polish + Walkthrough](2026-04-18-forgeboard-ide-phase13-polish-walkthrough.md) | Phosphor icons, animations, toasts, first-run tour | `phase13-polish` | 1 wk |
| 14 | [Signing + Release](2026-04-18-forgeboard-ide-phase14-signing-release.md) | EV-signed installer, auto-updater, landing page, v1.0.0 tag | `phase14-release` | 2 wk |

**TOTAL:** ~24 weeks. Phase 7 (content) can run in parallel with later framework phases.

---

## Integration graph — which phase depends on which

```
 1 (Shell)
 ↓
 2 (Monaco) ──→ 12 (Settings) ←── 13 (Polish)
 ↓                                  ↑
 3 (File System)                   from 12
 ↓
 4 (Compile) ─→ 8 (Boards) ─→ 9 (Libraries)
 ↓                                  ↓
 5 (Serial) ─→ 11 (Plotter)       10 (Examples)
 ↓
 6 (SH Framework) ─→ 7 (SH Content)

 All phases → 14 (Release)
```

Phase 7 is the longest (content writing) and can run in parallel from week 7 onward.

---

## Cross-phase integration notes (verified)

These are the load-bearing interfaces that must stay consistent as phases execute:

### State signals (`src/state/appState.ts`)

Each phase adds signals; never rename or remove existing ones without updating consumers.

| Signal | Introduced | Consumers |
|--------|------------|-----------|
| `activeRail` | P1 | `LeftRail`, `FileSidebar`, palette commands |
| `openTabs` | P1 (shape extended P3 to add `name`) | `TabBar`, `Breadcrumb`, `MonacoEditor`, autosave |
| `activeTabIndex` | P1 | `TabBar`, `MonacoEditor`, `Breadcrumb`, palette |
| `saveState` | P1 | `StatusBar`, `autosave` |
| `fileContents` | P2 | `MonacoEditor`, `autosave`, `analyzer` |
| `currentSketch` | P3 | `FileSidebar`, `Breadcrumb`, `project-state` |
| `connectedBoard` / `connectedPort` / `selectedFqbn` | P1/P4 | `ActionBar`, `BoardSelector`, `PortSelector`, compile/upload, analyzer |
| `buildPhase` / `buildOutput` | P4 | `ActionBar`, `BottomPanel` |
| `serialLog` / `serialConnected` / `serialBaud` / `serialLineEnding` | P5 | `SerialMonitor`, `SerialPlotter`, `StatusBar` |
| `findings` / `dismissedIds` / `pinnedIds` | P6 | `MonacoEditor` decorations, `FindingsPanel`, `StatusBar` |
| `installedCores` / `installedBoards` / `detectedPorts` | P8 | `BoardsView`, `BoardSelector`, `PortSelector` |
| `installedLibraries` | P9 | `LibrariesView`, analyzer suggestions |
| `settings` | P12 | everywhere (font size, autosave, Smart Help on/off, etc.) |
| `paletteOpen` | P12 | `CommandPalette`, shortcuts |
| `toasts` | P13 | `ToastStack`, called from compile/upload/save/etc. |

### IPC command registry (`src-tauri/src/main.rs`)

Each phase registers new commands. Full list after Phase 14:

```rust
.invoke_handler(tauri::generate_handler![
    commands::ping::ping,                                           // P1
    project::commands::project_sketches_root,                       // P3
    project::commands::project_open,                                // P3
    project::commands::project_create,                              // P3
    project::commands::project_read_file,                           // P3
    project::commands::project_save_file,                           // P3
    project::commands::project_list_recent,                         // P3
    project::commands::project_load_state,                          // P6
    project::commands::project_save_state,                          // P6
    arduino::commands::arduino_list_boards,                         // P4
    arduino::commands::arduino_detect_ports,                        // P4
    arduino::commands::arduino_compile,                             // P4
    arduino::commands::arduino_upload,                              // P4
    arduino::commands::arduino_list_cores,                          // P8
    arduino::commands::arduino_search_cores,                        // P8
    arduino::commands::arduino_install_core,                        // P8
    arduino::commands::arduino_update_index,                        // P8
    arduino::commands::arduino_ensure_forgeboard_index,             // P8
    arduino::commands::arduino_lib_search,                          // P9
    arduino::commands::arduino_lib_list_installed,                  // P9
    arduino::commands::arduino_lib_install,                         // P9
    arduino::commands::arduino_lib_uninstall,                       // P9
    arduino::commands::arduino_lib_install_zip,                     // P9
    serial::commands::serial_open,                                  // P5
    serial::commands::serial_close,                                 // P5
    serial::commands::serial_write,                                 // P5
    serial::commands::serial_is_open,                               // P5
    smart_help::commands::smart_help_analyze,                       // P6
    examples::commands::examples_list,                              // P10
    examples::commands::examples_open,                              // P10
    settings::commands::settings_load,                              // P12
    settings::commands::settings_save,                              // P12
])
```

### Rust module registration (`mod` declarations)

```rust
mod commands;      // P1 — holds `ping.rs`
mod project;       // P3
mod arduino;       // P4 (core, library, compile, upload, board sub-modules)
mod serial;        // P5
mod smart_help;    // P6
mod examples;      // P10
mod settings;      // P12
```

### Tauri events

| Event | Emitted by | Consumed by |
|-------|------------|-------------|
| `compile-output` | P4 `arduino/cli.rs` | P4 ActionBar listeners |
| `upload-output` | P4 | P4 ActionBar |
| `core-install-output` | P8 | P8 BoardsView |
| `lib-install-output` | P9 | P9 LibrariesView |
| `serial-line` | P5 | P5 SerialMonitor, P11 SerialPlotter |
| `serial-disconnected` | P5 | P5 SerialMonitor |
| `serial-error` | P5 | P5 SerialMonitor |
| `tauri://file-drop` | Tauri built-in | P9 (library ZIP install) |

### Bundled resources (`src-tauri/tauri.conf.json → bundle.resources`)

Final set:
```json
"resources": [
  "resources/smart-help.db",              // P6 — compiled YAML index
  "resources/examples-index.json",         // P10 — examples metadata
  "../content/examples/**/*",              // P10 — example source files
  "binaries/arduino-cli-x86_64-pc-windows-msvc.exe"  // P4
]
```

Plus `externalBin` for arduino-cli (P4).

### Postinstall / build scripts

Final `package.json → scripts.postinstall`:
```
powershell -ExecutionPolicy Bypass -File scripts/download-arduino-cli.ps1
  && pnpm build:smart-help
  && pnpm build:examples
```

### CSS tokens consistency

All components reference the tokens from `src/styles/tokens.css` (P1). No component should define raw hex colors. If adding a new semantic color in a later phase, add it to `tokens.css` and use `var(--name)`.

### Git tag chain

Each phase creates a tag. The chain:
```
phase1-shell
  → phase2-monaco
    → phase3-filesystem
      → phase4-compile-upload
        → phase5-serial
          → phase6-smart-help-framework
            → phase7-content
              → phase8-boards-view
                → phase9-libraries
                  → phase10-examples
                    → phase11-plotter
                      → phase12-settings-palette
                        → phase13-polish
                          → phase14-release
                            → v1.0.0
```

---

## How to execute

For each phase in order:

1. **Read the phase plan** top to bottom before starting any task
2. **Spawn a fresh subagent for each task** (recommended via `superpowers:subagent-driven-development`) OR execute inline with `superpowers:executing-plans`
3. **Every task ends with a commit.** Every phase ends with a tag + smoke test
4. **If a task fails the smoke test, fix it in the current commit before tagging the phase** — do not tag a broken phase
5. **Move to the next phase only after the current phase is tagged**

If a phase reveals a design issue with a later phase, add a "carry-over" note at the bottom of the later phase's plan before executing it.

---

## Deferred to v1.1+

Tracked in the spec, out of scope for v1.0:

- AI chat (separate launch beat: "Now with AI — free, passive, private")
- macOS + Linux builds
- Git integration
- JTAG/SWD debugger
- C++ LSP / clangd hover tooltips
- Multi-root projects
- File watcher for external edits
- Board-filtered examples
- Library version picker
- Serial Monitor export/pause
- Full accessibility pass (ARIA, focus rings)

---

*End of roadmap. Start with [Phase 1](2026-04-18-forgeboard-ide-phase1-core-shell.md).*
