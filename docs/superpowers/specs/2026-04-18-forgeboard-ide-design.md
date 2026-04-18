# ForgeBoard IDE — Design Spec

**Date:** 2026-04-18
**Status:** Draft — pending user review
**Target version:** v1.0 (ambitious scope)
**Author:** AV (solo build) + Claude (design partner)

---

## 1. Goal

Ship a beginner-friendly, on-brand desktop IDE for programming ESP32-S3 boards (starting with ForgeBoard Beginner + Intermediate) and any other Arduino-compatible board. Match Arduino IDE's feature envelope but with Cursor-quality UI polish and a built-in deterministic mistake-detector (Smart Help) that Arduino IDE has never had.

The IDE is free, no account required, works offline after install. First-party tool for ForgeBoard customers, credible alternative to Arduino IDE for anyone.

---

## 2. Target User

**Primary:** 14–24 year-old beginner who just got a ForgeBoard (or other ESP32-S3 board) and wants to write their first program. May have zero programming experience. Needs forgiving defaults, visible verb buttons, humanized errors, and a short learning curve.

**Secondary:** Experienced Arduino user who wants a more polished IDE than `arduino-ide-1.x` without the weight of VS Code + PlatformIO.

**Not our user (yet):** professional embedded engineers using JTAG, RTOS-heavy firmware, multi-core debugging — they'll stay on PlatformIO or ESP-IDF.

---

## 3. Non-Goals (v1)

- AI chat (deferred to v2 with dedicated launch beat "Now with AI — free, passive, private")
- Git integration
- Hardware debugger (JTAG / SWD)
- macOS / Linux builds
- Multi-root projects
- Live collaboration
- Plugin / extension system
- Mobile app (ever)

---

## 4. Build Approach — locked

**Tauri 2 shell + Monaco editor + arduino-cli backend.**

| Layer | Tech | Why |
|-------|------|-----|
| Shell | Tauri 2 | Rust backend, ~15MB binaries, native Windows APIs for serial/USB |
| Editor | Monaco (from VS Code) | Battle-tested, TextMate grammar support, IntelliSense-ready |
| Frontend | TypeScript + HTML + minimal CSS framework | No heavy React deps; keep bundle small |
| Backend | Rust | Serial handling needs native; concurrency-safe by default |
| Compile/Upload | arduino-cli (bundled) | Official Arduino tooling; handles all boards via cores |
| Flash | esptool (bundled via arduino-cli) | Standard ESP32 flashing |

**Alternative considered:** VS Code fork (like Cursor/Antigravity). Rejected because it forces VS Code's UI underneath — we lose brand control. Custom Tauri gives 100% UI ownership at the cost of ~6–8 extra weeks.

---

## 5. Visual Design System — locked

### 5.1 Palette ("Gold + Sage on warm near-black")

| Token | Hex | Use |
|-------|-----|-----|
| `--bg` | `#141311` | App base — warm near-black, not pure #000 |
| `--panel` | `#1a1916` | Sidebar, top bar, panel fills |
| `--border` | `#2a2822` | Dividers, card outlines |
| `--text` | `#e8e6e1` | Headings, body |
| `--text-muted` | `#8a8680` | Labels, secondary |
| `--text-disabled` | `#5a5650` | Placeholder |
| `--accent-gold` | `#c9922f` | Primary verb (Upload →), brand marks, active state |
| `--accent-sage` | `#7fb2a1` | Status (connected), success check, info |
| `--error` | `#dc5050` | Compile errors, critical findings |
| `--warn` | `#c9922f` | Warnings (same as gold) |
| `--success` | `#7fb2a1` | Success states (same as sage) |

Accents used sparingly. Most UI is monochrome greyscale. Gold is the brand color (echoes ForgeBoard's existing amber). Sage is the second anchor so the eye has somewhere to rest — prevents the yellow-fatigue of a gold-only palette.

### 5.2 Typography

- **UI:** Instrument Sans (400/500/600/700/800) — matches ForgeBoard website
- **Code:** JetBrains Mono (300/400/500/700)
- Bundled locally; no Google Fonts CDN dependency at runtime.

### 5.3 Syntax highlighting (Monaco theme)

| Token | Color |
|-------|-------|
| keyword | `#c9922f` (gold) |
| function | `#e8c585` |
| string | `#a8c479` |
| number | `#d19a66` |
| comment | `#5a5650` italic |
| type | `#7fb2a1` (sage) |
| line number | `#3a3834` |
| active line | `rgba(201,146,47,0.05)` with gold left border |

### 5.4 Layout (locked)

```
┌─────────────────────────────────────────────────────────┐ 28px
│ ◆ ForgeBoard IDE  — led-chase.ino                  — □ × │    title bar
├─────────────────────────────────────────────────────────┤
│ [tab] [tab] [tab] +      ✓ Check  [Upload →]  Board Port│ 44px action bar
├───────┬────────────────────────────────┬────────────────┤
│ [⌂]   │                                │                │
│ [⎘]•  │                                │                │
│ [☰]   │      Monaco editor             │ Findings /     │
│ [⌕]   │      (with Smart Help          │ Ask panel      │
│ [⬡]   │       squiggles)               │                │
│ [◆]   │                                │                │
│ [?]   │                                │                │
│ [⚙]   │                                │                │
│ 132px │                                │ 260px coll.    │
├───────┴────────────────────────────────┴────────────────┤ 180px
│ [Serial Monitor] [Output] [Plotter] [Problems]         │    bottom panel
│   log output with timestamps...                         │    collapsible
├─────────────────────────────────────────────────────────┤ 22px
│ ● COM3  FB Beginner  Ln 17  UTF-8  C++  ✓ Saved        │    status bar
└─────────────────────────────────────────────────────────┘
```

### 5.5 UX Principles (applies to all screens)

1. Label every rail icon (not icon-only)
2. Progressive disclosure — advanced behind collapse
3. Guided defaults — auto-detect board, auto-pick port, auto-save every 2s
4. Humanize every error (Smart Help handles this)
5. Examples as first-class citizen (rail icon, home screen)
6. Minimum 32px click targets
7. Status always visible in status bar
8. ⌘K global palette — search anything
9. Forgiving: every action undoable, crash-recovery opens last sketch
10. Serial monitor teaches — timestamps, color-coded, built-in plotter
11. First-run walkthrough (opt-in, skippable)
12. AI chat deferred to v2 — Smart Help covers v1

---

## 6. Feature Scope — v1.0 (ambitious)

### 6.1 Home / Dashboard

- Hero: "Welcome back / What are we building today?"
- Three big tiles: **New Sketch** · **Examples** · **Open…**
- Recent Sketches list (last 10) with timestamps and "open" action
- Footer strip: currently-connected board status

### 6.2 Editor

- Monaco editor with Arduino/C++ TextMate grammar
- **Folder-per-sketch** model: `sketch-name/sketch-name.ino` + helper files (`pins.h`, `config.h`, etc.) in one folder. Matches Arduino IDE's convention.
- Tab bar: modified-dot (●) / saved-empty (○) indicator, close × on each, "+" for new file
- Breadcrumb row under tabs: `sketches / led-chase / led-chase.ino`
- Auto-save every 2 seconds (indicator in status bar)
- Line numbers, optional minimap (off by default for beginners)
- `⌘P` to search files, `⌘K` for command palette

### 6.3 Compile + Upload

- **Check code** button (ghost, sage check): runs Smart Help analyzer + arduino-cli compile (silent)
- **Upload →** button (gold, primary): Check → compile → flash to selected board
- Compile errors surface through Smart Help translation, not raw compiler output
- Progress indicator in status bar during compile/flash
- Success toast: "Uploaded to ForgeBoard Beginner · COM3" (sage dot)

### 6.4 Boards — universal support (v1!)

- **Pre-installed cores:** ForgeBoard Beginner, ForgeBoard Intermediate, ESP32-S3 generic
- **On-demand cores:** Arduino AVR (Uno/Nano/Mega), ESP8266, RP2040 (Raspberry Pi Pico), STM32 (Nucleo, Blue Pill), Teensy 4.x, Seeed XIAO series
- Board selector in action bar: dropdown with installed boards + "Install more…" link
- **Boards view** (dedicated rail icon): `CONNECTED` → `FORGEBOARD` → `OTHER INSTALLED` → `AVAILABLE` (install on click)
- Each board in AVAILABLE shows: name, manufacturer, core version, download size
- Port auto-detection runs every 2s when dropdown is open

### 6.5 Libraries — full Arduino registry browsing

- **Pre-bundled libraries** (ship with binary): FastLED, WiFi, Wire, SPI, Servo, Adafruit NeoPixel, ArduinoJson, PubSubClient (MQTT), HTTPClient, DHT sensor library, OneWire, DallasTemperature
- **Libraries view** (dedicated rail icon):
  - Hero callout: **"8,940+ Arduino libraries · one-click install"**
  - Search bar hits the Arduino Library Manager registry
  - Installed list (green dot) with version + "update → X.Y.Z" if newer
  - Suggested-for-your-sketch list (based on `#include` analysis)
  - GitHub ZIP drop-in for unregistered libraries
- Library install is silent, shows progress in status bar

### 6.6 Examples — categorized browser

- **Examples view** (dedicated rail icon)
- Left sidebar: categories (Start Here, Digital I/O, Analog I/O, Serial & USB, Sensors, LEDs, WiFi & Network, Bluetooth / BLE, Displays, Motors & Servos, Storage & Files)
- Main area: grid of example cards
- Each card: title, one-line description, time estimate ("5 min · 1 sensor"), wiring requirements, "Open →" button
- Opening an example copies the sketch to `~/sketches/` and opens it as a new project (original is never modified)
- Search across all examples (top right)
- Filter by board when relevant

### 6.7 Serial Monitor + Plotter

- **Always-visible bottom panel**, toggle with ``^` `` (Ctrl+backtick)
- Tabs: **Serial Monitor** (default), **Output**, **Plotter**, **Problems · N**
- Timestamps on received lines (color: muted)
- Status dot coloring: info (muted), success (sage), warning (amber), error (red)
- Send input field with command history (up-arrow = last command)
- Clear button (gold link)
- Baud rate + line ending dropdowns (top right)
- **Plotter:** parses `Serial.println(<number>)` and `Serial.println("label:<number>")` patterns, draws live scrolling line chart. Up to 4 series. Y-axis auto-scales.

### 6.8 Smart Help — mistake detector (see §7 for deep dive)

- Local deterministic static analyzer
- Runs on save (debounced 500ms) + on "Check code" click + pre-Upload
- Inline wavy underlines (red/amber) + findings panel on the right
- Each finding has: category badge, line number, title, one-sentence explanation
- **Buttons per finding:** `Dismiss` (sticky hide, won't show again for same pattern) + `Pin` (keep at top of list even when code changes) + `Jump to line`
- **No auto-fix** — user stays in control

### 6.9 Files view (default rail)

- Project file tree (current sketch folder expanded, files listed)
- "+ add file" under the sketch
- Recent projects (last 10) as collapsed folders
- "Auto-save on · every 2 seconds" banner at bottom (reassures beginners)

### 6.10 Settings

- **Appearance:** font size (10-20px slider), minimap on/off
- **Editor:** tab size (default 2), auto-save toggle, auto-close brackets
- **Smart Help:** on/off, show low-confidence flags (off by default)
- **Serial:** default baud, default line ending
- **Boards:** default board, default port
- **First-time help:** enable/disable walkthrough, show tooltips
- **Storage:** sketches folder location (default `~/Documents/ForgeBoard/sketches`), libraries location
- **About:** version, check for updates, license

### 6.11 Walkthrough (opt-in, deferred to late v1)

- First-run overlay: "① Pick your board → ② Plug it in → ③ Open an example → ④ Hit Upload"
- Tooltip highlighting each verb button
- Dismissible forever after first completion

### 6.12 Deferred to v2+

- AI chat (passive inspector with usage bar — separate launch)
- Git integration
- JTAG/SWD debugger
- macOS + Linux builds
- Multi-root projects
- Collaborative editing

---

## 7. Smart Help — deep dive

### 7.1 Scope

**Smart Help v1 role: mistake detector only.**

Explicitly NOT in Smart Help:
- "How do I X?" templates → **Examples view** handles this
- Function reference cards → **LSP hover tooltips** (provided by Monaco + clangd)
- Board pin maps → **Pinout view** (within Boards rail view, v1.1)
- Library docs → **Libraries view** (shows README on click)

### 7.2 Finding categories

| # | Category | Examples |
|---|----------|----------|
| 1 | **Syntax** (pre-compile) | Missing `;`, unterminated string, bracket mismatch |
| 2 | **Types** | Wrong function args, int/float/String confusion, `const` violations |
| 3 | **API misuse** | `Serial.print` before `Serial.begin`, `pinMode` never called, `Wire.requestFrom` without `Wire.begin` |
| 4 | **Logic bugs** | `delay()` in ISR, blocking in `loop()`, `=` vs `==`, unreachable code, always-true conditionals |
| 5 | **Board-specific** | GPIO 2 bootstrap on ESP32-S3, GPIO 6-11 flash on ESP32, pin doesn't exist on selected package |
| 6 | **Performance** | `String` concatenation in `loop()`, heap allocation after setup, float math on AVR |
| 7 | **Memory** | Oversized globals for board SRAM, deep recursion, suspected stack overflow |
| 8 | **Hardware constraints** | Too many PWM channels requested, I²C address conflicts, ADC pin not on selected board |

### 7.3 Entry data model

Each finding is authored as a YAML file in `content/smart-help/`, compiled to SQLite + FTS5 index at build time.

```yaml
id: esp32-s3.gpio-2.bootstrap
category: board-specific
severity: warning        # error | warning | info
confidence: high         # high | medium | low
boards:
  - forgeboard-beginner
  - forgeboard-intermediate
  - esp32-s3-generic
patterns:
  - regex: 'pinMode\s*\(\s*2\s*,\s*OUTPUT'
title: "GPIO 2 is a bootstrap pin on ESP32-S3"
explanation: |
  Pin 2 is held HIGH at boot. Using it for OUTPUT may cause servo
  twitch or LED flash on power-on. Consider pins 4, 5, or 6.
cite:
  line: "$match.line"
  token: "2"
tags: [esp32-s3, gpio, bootstrap, pin-warning]
```

**v1 content target: 500 entries** (was 100 in the stripped v1.0 scope; bumped because we're starting at the bigger "1.1" scope).

Entry distribution target:
- 60 syntax errors
- 40 type errors
- 80 API misuse patterns
- 100 logic bugs
- 120 board-specific (spread across 10 boards)
- 40 performance smells
- 30 memory warnings
- 30 hardware constraint checks

### 7.4 Matcher

- Rust backend, single-pass through the source
- Regex patterns compiled at build time
- Context-aware: knows target board (filters `boards:` field), knows installed libraries, knows which functions exist in current project
- Performance target: **<50ms for a 500-line sketch** on a 2020-era laptop
- Runs on: save (debounced 500ms) · explicit "Check code" click · pre-Upload (auto)

### 7.5 UI surfaces

- **Inline:** wavy underline on flagged line. Red for errors, amber for warnings. Grey dashed for low-confidence info.
- **Findings panel** (right side, always available, collapsible): list of all current findings, sorted by pin-state → severity → line number
- **Hover popover:** click or hover a squiggle → finding title + explanation + actions
- **Status bar widget:** "3 findings · 1 error · 2 warnings" — click to focus findings panel
- **Problems tab** (bottom panel): shows findings as a flat list, sortable by line/category

### 7.6 Finding actions (per-finding buttons)

| Button | Behavior |
|--------|----------|
| **Jump to line** | Editor scrolls to the flagged line, cursor lands there |
| **Dismiss** | Sticky hide — this exact pattern never flags again in this file. Persists across sessions via `.forgeboard/ignored-flags.json` |
| **Pin** | Keeps finding at top of panel even when code changes around it. Survives re-analysis. |

**Explicitly NOT present:** "Fix it for me" button. User stays in control. Smart Help points; user acts.

### 7.7 Content authoring

- Curated YAML in `content/smart-help/` directory (shipped with source repo)
- Build script compiles to SQLite + FTS5 at `cargo build` time
- Plan to open-source content repo: `github.com/forgeboard/smart-help`
- Community PRs accepted, moderated by project maintainer
- Entry guideline: title ≤ 60 chars, explanation ≤ 80 words, regex tested against real sketches

---

## 8. Architecture

```
┌───────────────────────────────────────────────┐
│  Frontend (TypeScript + HTML)                 │
│  • Monaco editor                               │
│  • UI chrome (rail, sidebar, tabs, panels)    │
│  • Findings renderer                           │
│  • State: zustand or minimal custom store     │
└───────────────┬───────────────────────────────┘
                │ Tauri IPC (JSON commands)
┌───────────────▼───────────────────────────────┐
│  Backend (Rust)                                │
│  • Smart Help analyzer + SQLite DB loader     │
│  • arduino-cli subprocess wrapper             │
│  • Serial port (tokio-serial)                 │
│  • File system (fs, notify for watch)         │
│  • Project model (sketch folder tracker)      │
│  • Library/Board manager API                  │
└───────────────┬───────────────────────────────┘
                │
   ┌────────────┼────────────┬───────────────────┐
   ▼            ▼            ▼                   ▼
arduino-cli   esptool      ESP32 serial        File system
(bundled)     (bundled)    (COM3 etc.)         (sketches, libs)
```

### 8.1 IPC commands (Tauri `invoke`)

| Command | Input | Output |
|---------|-------|--------|
| `smart_help.analyze` | `{code, board}` | `[Finding]` |
| `compile.run` | `{sketch_path, board}` | `Result<CompileOutput, Error>` |
| `upload.run` | `{sketch_path, board, port}` | `Result<(), Error>` |
| `serial.open` | `{port, baud}` | stream handle |
| `serial.write` | `{handle, bytes}` | `Result<(), Error>` |
| `boards.list_installed` | — | `[BoardInfo]` |
| `boards.list_available` | — | `[BoardCore]` |
| `boards.install_core` | `{core_id}` | progress stream |
| `libraries.search` | `{query}` | `[Library]` |
| `libraries.install` | `{lib_id, version}` | progress stream |
| `project.create` | `{name, template}` | `{path}` |
| `project.open` | `{path}` | `{files, active_file}` |

### 8.2 State management

- Backend is the source of truth for: installed boards, installed libraries, current project files, connected port
- Frontend state is ephemeral UI state only: which panel is open, rail active icon, pinned findings, current tab

---

## 9. File / Project Organization

User's sketches:
```
~/Documents/ForgeBoard/sketches/
├── led-chase/
│   ├── led-chase.ino     ← main; must match folder name
│   ├── pins.h
│   └── config.h
├── wifi-scanner/
│   └── wifi-scanner.ino
└── .forgeboard/           ← IDE state (hidden)
    ├── recent.json
    └── settings.json
```

Per-project state:
```
<sketch-folder>/.forgeboard/
├── ignored-flags.json    ← dismissed Smart Help findings
├── pinned-flags.json     ← pinned Smart Help findings
└── last-session.json     ← open tabs, cursor positions
```

IDE install:
```
<install>/
├── forgeboard-ide.exe
├── resources/
│   ├── arduino-cli/       ← bundled
│   ├── cores/             ← pre-installed ForgeBoard + ESP32-S3 cores
│   ├── libraries/         ← pre-bundled 12 libraries
│   ├── smart-help.db      ← compiled SQLite
│   └── examples/          ← pre-bundled example sketches
└── updater.exe            ← Tauri auto-updater
```

---

## 10. Distribution

- **Format:** signed Windows .exe installer (MSI or NSIS — evaluate both in week 1)
- **Download:** landing page at `defenceforgeindustries.com/forgeboard-ide`
- **Signing:** EV code-signing cert (~$300/year) — Windows SmartScreen doesn't warn users with EV
- **Updater:** Tauri 2 built-in updater, checks weekly, opt-in prompt on launch
- **Versioning:** semver, ChangeLog.md on landing page
- **License:** proprietary to ForgeBoard for the app binary. Smart Help content repo is MIT-licensed for community PRs.
- **Analytics:** none in v1 (no tracking, no crash reports, fully offline-capable minus cert validation)

---

## 11. Timeline (solo, full-time)

| Milestone | Duration | Cumulative |
|-----------|----------|------------|
| Tauri 2 scaffold + Monaco integration | 1.5 weeks | 1.5w |
| arduino-cli wrapper + ForgeBoard boards working | 2 weeks | 3.5w |
| Serial Monitor + Plotter | 1.5 weeks | 5w |
| Smart Help framework (analyzer + 50 entries) | 2 weeks | 7w |
| Files view, Home, tabs, breadcrumb | 1.5 weeks | 8.5w |
| Boards view + core installer for 10 boards | 2 weeks | 10.5w |
| Libraries view + registry search + installer | 2 weeks | 12.5w |
| Examples view + 40 curated examples | 1.5 weeks | 14w |
| UI polish: palette, fonts, icons, animations | 1 week | 15w |
| Settings + keyboard shortcuts + ⌘K palette | 1 week | 16w |
| Smart Help content: 500 entries written | 3 weeks | 19w |
| Walkthrough + first-run experience | 0.5 weeks | 19.5w |
| Bug bash · internal alpha | 1.5 weeks | 21w |
| **v1.0 alpha shippable** | — | **~21w** |
| EV cert procurement + signing infra | 2 weeks (parallel) | — |
| Landing page + updater integration | 1 week | 22w |
| Closed beta (10-20 ForgeBoard customers) | 2 weeks | 24w |
| **v1.0 public release** | — | **~24w (≈ 5.5 months)** |

Realistic: 5-6 months solo full-time from start to public v1.0 with the bigger scope.

Aggressive cuts if needed (drop to 3 months): skip Libraries view registry search (pre-bundled only), skip Boards view on-demand install (ForgeBoard boards only), skip Plotter, cut Smart Help to 150 entries.

---

## 12. Success Criteria

- A beginner with zero programming experience: open IDE → board auto-detected → open an example → hit Upload → **LED blinks on their ForgeBoard within 5 minutes of first launch**.
- Smart Help catches ≥ **80% of common first-time mistakes** before compile (manual test set of 100 intentionally-broken sketches).
- Cold-start to editor interactive: **< 2 seconds** on 2020-era laptop.
- Signed binary size: **< 40MB** installer, < 100MB installed.
- Offline-capable: fully functional with no internet after install (no accounts, no cloud calls, no telemetry).
- Upload success rate: ≥ 99% on ForgeBoard Beginner out of the box.

---

## 13. Risks + Mitigations

1. **Tauri 2 maturity** — Tauri 2 is newer than 1.x. *Mitigation:* test in week 1; fall back to Tauri 1.x if blockers appear.
2. **arduino-cli bundled size** — arduino-cli alone is ~50MB. *Mitigation:* strip platforms we don't use at build time; build only the subset needed.
3. **Solo bandwidth** — 24 weeks is a long solo sprint. *Mitigation:* aggressive scope cut list above; ship internal alpha at week 12 as a confidence check.
4. **Smart Help content effort** — 500 entries is 3 weeks of careful writing. *Mitigation:* start writing entries in parallel with framework from week 3; don't bottleneck on this at the end.
5. **EV cert timeline** — cert procurement takes 1-2 weeks of legal paperwork. *Mitigation:* start process in week 18.
6. **Windows SmartScreen warnings** — unsigned builds trigger scary warnings. *Mitigation:* EV cert prevents this entirely.
7. **arduino-cli version drift** — they ship breaking changes occasionally. *Mitigation:* pin to a specific version; upgrade deliberately with testing.

---

## 14. Open Questions (for plan phase)

- [ ] Tauri 2 vs Tauri 1.x — test both in week 1 and commit
- [ ] Monaco vs CodeMirror 6 — Monaco more features, heavier; CodeMirror lighter, more manual work
- [ ] Icon set — custom SVGs vs Phosphor Icons vs Lucide
- [ ] Installer — MSI vs NSIS vs WinGet (or all three)
- [ ] LSP for C++ hover tooltips in v1 or defer to v1.1 — clangd integration isn't trivial
- [ ] Test framework for Smart Help — snapshot tests of analyzer output against a fixture set of sketches

---

## Appendix A — UX Principles (expanded)

The 12 beginner-first UX principles this IDE is designed against:

1. **Label everything.** Rail icons get text. Tooltips show keyboard shortcuts.
2. **Progressive disclosure.** Essentials visible. "Advanced" behind a collapse.
3. **Guided defaults.** Board auto-detected, port auto-picked, sketch auto-saved every 2s.
4. **Humanize every error.** Smart Help translates gcc output into plain-English + fix guidance.
5. **Examples as first-class citizen.** Rail icon, not buried in a menu.
6. **Big targets.** Min 32px click targets. No tiny corner buttons.
7. **Status always visible.** Board, port, connection, save state — always in status bar.
8. **Search everything.** ⌘K palette finds files, commands, boards, libraries, examples, settings.
9. **Forgiving by design.** Every action undoable. Crash recovery opens last sketch.
10. **Serial monitor teaches.** Auto-timestamps, color-coded output, built-in plotter.
11. **First-run walkthrough** (opt-in, skippable). Dismissed forever after first completion.
12. **AI deferred to v2.** Smart Help covers v1 via deterministic rules — no hallucination risk.

---

## Appendix B — Brand Reference

ForgeBoard IDE's visual system extends the existing ForgeBoard brand:
- Amber/gold identity → carried through as `--accent-gold` (desaturated from `#FFA600` to `#c9922f` to prevent fatigue on long-duration coding sessions)
- Black base → softened from pure `#000` to warm `#141311` (Cursor-soft, easier on eyes)
- Instrument Sans + JetBrains Mono → same fonts as the ForgeBoard website
- Wireframe aesthetic on product pages → not carried into IDE (would conflict with editor readability), but the brand feels coherent across both surfaces

---

## Appendix C — What's Locked vs. Open

**LOCKED through brainstorming:**
- Build stack (Tauri + Monaco + arduino-cli)
- Palette (Gold + Sage on warm near-black)
- Typography (Instrument Sans + JetBrains Mono)
- Layout (Cursor-standard with labeled left rail)
- Home screen direction (Dashboard / Launchpad)
- Universal board support (ForgeBoard pre-installed, others on-demand)
- Library ecosystem (8,940+ Arduino registry + GitHub ZIP)
- Smart Help = mistake detector only (not templates/reference/docs)
- Smart Help buttons: Dismiss + Pin + Jump to line (no auto-fix)
- AI deferred to v2
- Distribution: Windows .exe, EV-signed, downloadable
- Solo developer timeline
- All 12 UX principles

**OPEN (resolved during plan phase):**
- Tauri 1 vs 2 (pick in week 1)
- Monaco vs CodeMirror 6
- Icon set
- Installer technology (MSI / NSIS / WinGet)
- C++ LSP integration timing (v1 or v1.1)
- Exact Smart Help test framework

---

*End of design spec. Next step: user review, then transition to implementation plan.*
