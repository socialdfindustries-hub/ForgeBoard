# ForgeBoard IDE — Phase 6: Smart Help Framework

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Prerequisite: `phase5-serial`.

**Goal:** Build the static-analyzer engine that backs Smart Help. Ships with ~20 seed entries. Entries are YAML, compiled to SQLite at build time. Analyzer matches regex patterns against the active file, emits findings with line/severity/title/explanation. Frontend renders findings in a panel + wavy underlines in Monaco. Dismiss and Pin actions persist to `.forgeboard/` per project.

**Architecture:** Content in `content/smart-help/*.yaml`. Build script (`scripts/build-smart-help.ts`) compiles YAML → `src-tauri/resources/smart-help.db`. Rust analyzer loads it into memory at startup. Analyzer runs on file save (debounced) + on explicit Check. Findings stream to frontend via IPC; Monaco decorations apply underlines.

**Tech Stack:** rusqlite, regex crate, Monaco decorations, TypeScript build script.

---

## File Structure

```
content/
└── smart-help/
    ├── syntax/
    │   ├── missing-semicolon.yaml
    │   └── ...
    ├── api-misuse/
    │   ├── serial-print-before-begin.yaml
    │   └── ...
    └── board-specific/
        ├── esp32-s3-gpio2-bootstrap.yaml
        └── ...

scripts/
└── build-smart-help.ts        # YAML → SQLite

src-tauri/
├── resources/
│   └── smart-help.db          # compiled, in .gitignore
└── src/
    └── smart_help/
        ├── mod.rs
        ├── schema.rs          # Finding, Entry types
        ├── loader.rs          # SQLite → in-memory
        ├── analyzer.rs        # regex matching
        └── commands.rs

src/
├── ipc/
│   └── smart_help.ts
├── state/
│   └── appState.ts            # add findings, dismissedIds signals
├── components/
│   ├── FindingsPanel.tsx
│   ├── FindingsPanel.css
│   └── MonacoEditor.tsx       # MODIFIED — apply decorations from findings
└── lib/
    └── analyzer.ts            # debounced trigger
```

---

## Task 1: Entry schema + 3 seed entries

**Files:** Create `content/smart-help/schema.md` (reference), seed YAML files.

- [ ] **Step 1: Write schema doc**

`content/smart-help/schema.md`:

```markdown
# Smart Help entry schema

```yaml
id: category.slug.variant            # unique, kebab-case
category: syntax | types | api-misuse | logic | board-specific | performance | memory | hardware
severity: error | warning | info
confidence: high | medium | low
boards: [list]                        # empty = all boards
patterns:
  - regex: 'pattern'
title: "Short title, max 60 chars"
explanation: "One or two sentences, max 80 words."
cite:
  line: "$match.line"                 # literal; filled at match time
  token: "..."                        # optional
tags: [searchable, keywords]
```
```

- [ ] **Step 2: Create first seed entry**

`content/smart-help/syntax/missing-semicolon-before-if.yaml`:
```yaml
id: syntax.missing-semicolon.before-if
category: syntax
severity: error
confidence: high
boards: []
patterns:
  - regex: '\w\s*\)[^;{]*\n\s*if\s*\('
title: "Missing semicolon before if statement"
explanation: "Every C++ statement ends with a semicolon. Looks like you're missing one before an if statement."
tags: [semicolon, syntax, if]
```

- [ ] **Step 3: Second seed entry**

`content/smart-help/api-misuse/serial-print-before-begin.yaml`:
```yaml
id: api-misuse.serial.print-before-begin
category: api-misuse
severity: warning
confidence: medium
boards: []
patterns:
  - regex: 'Serial\.print(ln)?\('
title: "Serial.print called — check that Serial.begin ran"
explanation: "Calling Serial.print before Serial.begin sends data to a closed port. Ensure Serial.begin(115200) runs inside setup() before any print."
tags: [serial, begin, setup]
```

- [ ] **Step 4: Third seed entry**

`content/smart-help/board-specific/esp32-s3-gpio2-bootstrap.yaml`:
```yaml
id: board-specific.esp32-s3.gpio2-bootstrap
category: board-specific
severity: warning
confidence: high
boards: [forgeboard-beginner, forgeboard-intermediate, esp32-s3-generic]
patterns:
  - regex: 'pinMode\s*\(\s*2\s*,\s*OUTPUT\s*\)'
title: "GPIO 2 is a bootstrap pin on ESP32-S3"
explanation: "Pin 2 is held HIGH at boot. Using it for OUTPUT may cause servo twitch or LED flash on power-on. Consider pins 4, 5, or 6 for clean boots."
tags: [esp32-s3, gpio, bootstrap]
```

- [ ] **Step 5: Commit**

```bash
git add content/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "content: seed 3 Smart Help entries (syntax, api-misuse, board-specific)"
```

---

## Task 2: YAML → SQLite build script

**Files:** Create `scripts/build-smart-help.ts`; modify `package.json`

- [ ] **Step 1: Install deps**

```bash
pnpm add -D js-yaml better-sqlite3 @types/js-yaml @types/better-sqlite3
```

- [ ] **Step 2: Write build script**

`scripts/build-smart-help.ts`:

```typescript
import * as yaml from "js-yaml";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const CONTENT_DIR = path.resolve("content/smart-help");
const OUT_DIR = path.resolve("src-tauri/resources");
const OUT_FILE = path.join(OUT_DIR, "smart-help.db");

fs.mkdirSync(OUT_DIR, { recursive: true });
if (fs.existsSync(OUT_FILE)) fs.unlinkSync(OUT_FILE);
const db = new Database(OUT_FILE);

db.exec(`
  CREATE TABLE entries (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    confidence TEXT NOT NULL,
    boards_json TEXT NOT NULL,
    patterns_json TEXT NOT NULL,
    title TEXT NOT NULL,
    explanation TEXT NOT NULL,
    tags_json TEXT NOT NULL
  );
  CREATE INDEX idx_category ON entries(category);
`);

const insert = db.prepare(`
  INSERT INTO entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".yaml") || e.name.endsWith(".yml")) out.push(p);
  }
  return out;
}

interface Entry {
  id: string; category: string; severity: string; confidence: string;
  boards: string[]; patterns: { regex: string }[];
  title: string; explanation: string; tags: string[];
}

let count = 0;
for (const f of walk(CONTENT_DIR)) {
  const raw = fs.readFileSync(f, "utf8");
  const e = yaml.load(raw) as Entry;
  // Basic validation
  if (!e.id || !e.title || !e.patterns?.length) {
    console.error(`SKIP ${f}: missing required fields`); continue;
  }
  insert.run(
    e.id, e.category, e.severity, e.confidence,
    JSON.stringify(e.boards ?? []),
    JSON.stringify(e.patterns),
    e.title, e.explanation,
    JSON.stringify(e.tags ?? []),
  );
  count++;
}
console.log(`Compiled ${count} entries → ${OUT_FILE}`);
db.close();
```

- [ ] **Step 3: Add to package.json scripts**

```json
"build:smart-help": "tsx scripts/build-smart-help.ts"
```

Install tsx runner:
```bash
pnpm add -D tsx
```

- [ ] **Step 4: Run build**

```bash
pnpm build:smart-help
```

Expected: `Compiled 3 entries → src-tauri/resources/smart-help.db`.

- [ ] **Step 5: Gitignore the built DB, bundle as Tauri resource**

Append to `.gitignore`:
```
src-tauri/resources/smart-help.db
```

In `src-tauri/tauri.conf.json`, under `bundle`:
```json
"resources": ["resources/smart-help.db"]
```

- [ ] **Step 6: Wire postinstall**

Modify `package.json` postinstall:
```json
"postinstall": "powershell -ExecutionPolicy Bypass -File scripts/download-arduino-cli.ps1 && pnpm build:smart-help"
```

- [ ] **Step 7: Commit**

```bash
git add scripts/ package.json .gitignore src-tauri/tauri.conf.json
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "build: YAML → SQLite build script for Smart Help"
```

---

## Task 3: Rust: loader + schema

**Files:** Create `src-tauri/src/smart_help/{mod.rs,schema.rs,loader.rs}`

- [ ] **Step 1: Add rusqlite**

`src-tauri/Cargo.toml`:
```toml
rusqlite = { version = "0.31", features = ["bundled"] }
regex = "1"
```

- [ ] **Step 2: Write mod.rs + schema.rs**

`src-tauri/src/smart_help/mod.rs`:
```rust
pub mod schema;
pub mod loader;
pub mod analyzer;
pub mod commands;
```

Register in `main.rs`: `mod smart_help;`.

`src-tauri/src/smart_help/schema.rs`:
```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Entry {
    pub id: String,
    pub category: String,
    pub severity: String,       // "error" | "warning" | "info"
    pub confidence: String,     // "high" | "medium" | "low"
    pub boards: Vec<String>,
    pub patterns: Vec<Pattern>,
    pub title: String,
    pub explanation: String,
    pub tags: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Pattern {
    pub regex: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Finding {
    pub id: String,                // entry id
    pub finding_uid: String,        // unique per-match: entry_id + line + token
    pub line: u32,                  // 1-based
    pub col_start: u32,             // 0-based
    pub col_end: u32,               // 0-based, exclusive
    pub category: String,
    pub severity: String,
    pub confidence: String,
    pub title: String,
    pub explanation: String,
    pub matched_text: String,
}
```

- [ ] **Step 3: Write loader.rs**

`src-tauri/src/smart_help/loader.rs`:
```rust
use super::schema::{Entry, Pattern};
use rusqlite::Connection;
use std::path::Path;

pub fn load_all(db_path: &Path) -> Result<Vec<Entry>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, category, severity, confidence, boards_json, patterns_json, title, explanation, tags_json FROM entries")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        let boards: Vec<String> = serde_json::from_str(&row.get::<_, String>(4)?).unwrap_or_default();
        let patterns: Vec<Pattern> = serde_json::from_str(&row.get::<_, String>(5)?).unwrap_or_default();
        let tags: Vec<String> = serde_json::from_str(&row.get::<_, String>(8)?).unwrap_or_default();
        Ok(Entry {
            id: row.get(0)?,
            category: row.get(1)?,
            severity: row.get(2)?,
            confidence: row.get(3)?,
            boards, patterns,
            title: row.get(6)?,
            explanation: row.get(7)?,
            tags,
        })
    }).map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for r in rows { out.push(r.map_err(|e| e.to_string())?); }
    Ok(out)
}
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: Smart Help schema + SQLite loader"
```

---

## Task 4: Analyzer engine

**Files:** Create `src-tauri/src/smart_help/analyzer.rs`

- [ ] **Step 1: Write analyzer.rs**

```rust
use super::schema::{Entry, Finding};
use regex::Regex;

pub struct Analyzer {
    entries: Vec<(Entry, Vec<Regex>)>, // compiled regexes per entry
}

impl Analyzer {
    pub fn new(entries: Vec<Entry>) -> Self {
        let compiled: Vec<(Entry, Vec<Regex>)> = entries.into_iter()
            .map(|e| {
                let regs = e.patterns.iter()
                    .filter_map(|p| Regex::new(&p.regex).ok())
                    .collect();
                (e, regs)
            })
            .collect();
        Self { entries: compiled }
    }

    /// Analyze code against all entries applicable to the given board.
    pub fn analyze(&self, code: &str, board: &str) -> Vec<Finding> {
        let mut findings = Vec::new();
        let line_offsets = line_offsets(code);

        for (entry, regexes) in &self.entries {
            // Filter by board
            if !entry.boards.is_empty() && !entry.boards.iter().any(|b| b == board) {
                continue;
            }
            for re in regexes {
                for m in re.find_iter(code) {
                    let (line, col_start) = position(&line_offsets, m.start());
                    let (_, col_end) = position(&line_offsets, m.end());
                    let uid = format!("{}:{}:{}", entry.id, line, col_start);
                    findings.push(Finding {
                        id: entry.id.clone(),
                        finding_uid: uid,
                        line,
                        col_start: col_start as u32,
                        col_end: col_end as u32,
                        category: entry.category.clone(),
                        severity: entry.severity.clone(),
                        confidence: entry.confidence.clone(),
                        title: entry.title.clone(),
                        explanation: entry.explanation.clone(),
                        matched_text: m.as_str().to_string(),
                    });
                }
            }
        }
        findings
    }
}

fn line_offsets(code: &str) -> Vec<usize> {
    let mut offs = vec![0usize];
    for (i, b) in code.bytes().enumerate() {
        if b == b'\n' { offs.push(i + 1); }
    }
    offs
}

fn position(line_offsets: &[usize], byte_offset: usize) -> (u32, usize) {
    let line_idx = line_offsets.binary_search(&byte_offset).unwrap_or_else(|i| i.saturating_sub(1));
    let col = byte_offset - line_offsets[line_idx];
    ((line_idx + 1) as u32, col)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::smart_help::schema::*;

    fn entry(id: &str, regex: &str, boards: &[&str]) -> Entry {
        Entry {
            id: id.into(), category: "syntax".into(),
            severity: "warning".into(), confidence: "high".into(),
            boards: boards.iter().map(|s| s.to_string()).collect(),
            patterns: vec![Pattern { regex: regex.into() }],
            title: "Test".into(), explanation: "T".into(),
            tags: vec![],
        }
    }

    #[test]
    fn analyzer_finds_matches() {
        let a = Analyzer::new(vec![entry("x", r"pinMode\(2", &[])]);
        let f = a.analyze("void setup() {\n  pinMode(2, OUTPUT);\n}", "forgeboard-beginner");
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].line, 2);
    }

    #[test]
    fn analyzer_respects_board_filter() {
        let a = Analyzer::new(vec![entry("x", r"pinMode", &["forgeboard-beginner"])]);
        let code = "pinMode(2, OUTPUT)";
        assert_eq!(a.analyze(code, "forgeboard-beginner").len(), 1);
        assert_eq!(a.analyze(code, "arduino-uno").len(), 0);
    }
}
```

- [ ] **Step 2: Run tests**

```bash
cd src-tauri && cargo test smart_help && cd ..
```

Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/smart_help/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: Smart Help analyzer with regex matching + board filter"
```

---

## Task 5: Tauri commands + state management

**Files:** Create `src-tauri/src/smart_help/commands.rs`; modify main.rs

- [ ] **Step 1: Write commands.rs**

```rust
use super::{analyzer::Analyzer, loader, schema::Finding};
use std::sync::{Arc, RwLock};
use tauri::{State, Manager};

pub struct SmartHelpState {
    pub analyzer: Arc<RwLock<Option<Analyzer>>>,
}

pub fn init_from_resource(app: &tauri::AppHandle) -> Result<Analyzer, String> {
    let db_path = app.path().resolve("resources/smart-help.db", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let entries = loader::load_all(&db_path)?;
    Ok(Analyzer::new(entries))
}

#[tauri::command]
pub fn smart_help_analyze(
    state: State<'_, SmartHelpState>,
    code: String,
    board: String,
) -> Result<Vec<Finding>, String> {
    let guard = state.analyzer.read().map_err(|e| e.to_string())?;
    let a = guard.as_ref().ok_or_else(|| "analyzer not initialized".to_string())?;
    Ok(a.analyze(&code, &board))
}
```

- [ ] **Step 2: Register + initialize on setup**

In `src-tauri/src/main.rs`, replace the builder:

```rust
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let analyzer = smart_help::commands::init_from_resource(&app.handle())
                .ok();
            app.manage(smart_help::commands::SmartHelpState {
                analyzer: std::sync::Arc::new(std::sync::RwLock::new(analyzer)),
            });
            Ok(())
        })
        .manage(serial::commands::SerialState(std::sync::Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            commands::ping::ping,
            project::commands::project_sketches_root,
            project::commands::project_open,
            project::commands::project_create,
            project::commands::project_read_file,
            project::commands::project_save_file,
            project::commands::project_list_recent,
            arduino::commands::arduino_list_boards,
            arduino::commands::arduino_detect_ports,
            arduino::commands::arduino_compile,
            arduino::commands::arduino_upload,
            serial::commands::serial_open,
            serial::commands::serial_close,
            serial::commands::serial_write,
            serial::commands::serial_is_open,
            smart_help::commands::smart_help_analyze,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: register Smart Help analyzer in Tauri state"
```

---

## Task 6: Frontend IPC + signals

**Files:** Create `src/ipc/smart_help.ts`; modify appState

- [ ] **Step 1: Wrapper**

```typescript
import { invoke } from "@tauri-apps/api/core";

export interface Finding {
  id: string;
  finding_uid: string;
  line: number;
  col_start: number;
  col_end: number;
  category: string;
  severity: "error" | "warning" | "info";
  confidence: "high" | "medium" | "low";
  title: string;
  explanation: string;
  matched_text: string;
}

export const smartHelpApi = {
  analyze: (code: string, board: string) =>
    invoke<Finding[]>("smart_help_analyze", { code, board }),
};
```

- [ ] **Step 2: Add signals**

In `src/state/appState.ts`:
```typescript
import type { Finding } from "../ipc/smart_help";
export const findings = signal<Finding[]>([]);
export const dismissedIds = signal<Set<string>>(new Set());  // by entry id or finding_uid
export const pinnedIds = signal<Set<string>>(new Set());

// update problemsCount to reflect real findings
export const problemsCount = computed(() => findings.value.filter(f => !dismissedIds.value.has(f.id)).length);
```

- [ ] **Step 3: Commit**

```bash
git add src/ipc/smart_help.ts src/state/appState.ts
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: frontend Smart Help types + signals"
```

---

## Task 7: Debounced analyzer trigger

**Files:** Create `src/lib/analyzer.ts`

- [ ] **Step 1: Write analyzer.ts**

```typescript
import { effect } from "@preact/signals";
import { smartHelpApi } from "../ipc/smart_help";
import {
  fileContents, openTabs, activeTabIndex, findings, selectedFqbn,
} from "../state/appState";

const DEBOUNCE_MS = 500;
let pending: number | null = null;

export function startAnalyzerLoop() {
  effect(() => {
    // subscribe to relevant signals
    fileContents.value;
    openTabs.value;
    activeTabIndex.value;

    if (pending) clearTimeout(pending);
    pending = window.setTimeout(runAnalysis, DEBOUNCE_MS);
  });
}

async function runAnalysis() {
  const tab = openTabs.value[activeTabIndex.value];
  if (!tab) { findings.value = []; return; }
  const code = fileContents.value.get(tab.path);
  if (code == null) { findings.value = []; return; }
  // Map FQBN to Smart Help board id
  const boardId = mapFqbnToBoardId(selectedFqbn.value);
  try {
    const result = await smartHelpApi.analyze(code, boardId);
    findings.value = result;
  } catch (e) {
    console.error("smart help analyze failed", e);
  }
  pending = null;
}

function mapFqbnToBoardId(fqbn: string): string {
  // fqbn like "esp32:esp32:esp32s3"
  if (fqbn.includes("esp32s3")) return "esp32-s3-generic";
  if (fqbn.includes("esp32")) return "esp32-generic";
  if (fqbn.includes("avr:uno")) return "arduino-uno";
  return "unknown";
}
```

- [ ] **Step 2: Start in main.tsx**

```typescript
import { startAnalyzerLoop } from "./lib/analyzer";
// ...
startAnalyzerLoop();
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/analyzer.ts src/main.tsx
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: debounced analyzer trigger on file changes"
```

---

## Task 8: Monaco decorations for findings

**Files:** Modify `src/components/MonacoEditor.tsx`

- [ ] **Step 1: Add decoration effect**

Inside MonacoEditor, after the content-change effect, add:

```typescript
import { findings, dismissedIds } from "../state/appState";

// --- inside component ---
useEffect(() => {
  const editor = editorRef.current;
  if (!editor) return;
  const model = editor.getModel();
  if (!model) return;

  const decos = findings.value
    .filter(f => !dismissedIds.value.has(f.id))
    .map((f) => ({
      range: new monaco.Range(f.line, f.col_start + 1, f.line, f.col_end + 1),
      options: {
        className:
          f.severity === "error" ? "sh-flag-error"
          : f.severity === "warning" ? "sh-flag-warning"
          : "sh-flag-info",
        hoverMessage: { value: `**${f.title}**\n\n${f.explanation}` },
        inlineClassName:
          f.severity === "error" ? "sh-underline-error"
          : f.severity === "warning" ? "sh-underline-warning"
          : "sh-underline-info",
      },
    }));
  const ids = editor.createDecorationsCollection(decos);
  return () => ids.clear();
}, [findings.value, dismissedIds.value]);
```

- [ ] **Step 2: Add Monaco underline styles**

Append to `src/styles/global.css`:

```css
.sh-underline-error { text-decoration: wavy underline var(--error); text-underline-offset: 3px; }
.sh-underline-warning { text-decoration: wavy underline var(--warn); text-underline-offset: 3px; }
.sh-underline-info { text-decoration: dotted underline var(--text-muted); text-underline-offset: 3px; }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/MonacoEditor.tsx src/styles/global.css
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: Monaco decorations render Smart Help underlines"
```

---

## Task 9: Findings panel component

**Files:** Create `src/components/FindingsPanel.tsx`, `FindingsPanel.css`

- [ ] **Step 1: Write component**

```typescript
import { findings, dismissedIds, pinnedIds, activeTabIndex, openTabs } from "../state/appState";
import { savePerProjectDismissals } from "../lib/project-state";
import "./FindingsPanel.css";

export function FindingsPanel() {
  const all = findings.value;
  const visible = all.filter(f => !dismissedIds.value.has(f.id));
  // pinned first
  const sorted = [...visible].sort((a, b) => {
    const ap = pinnedIds.value.has(a.finding_uid) ? 0 : 1;
    const bp = pinnedIds.value.has(b.finding_uid) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    const sev = { error: 0, warning: 1, info: 2 } as const;
    return sev[a.severity] - sev[b.severity] || a.line - b.line;
  });

  function jumpTo(line: number) {
    // Monaco jump via its own command — scoped to a global for simplicity
    (window as any).monacoJumpTo?.(line);
  }

  function dismiss(id: string) {
    const n = new Set(dismissedIds.value);
    n.add(id);
    dismissedIds.value = n;
    savePerProjectDismissals();
  }

  function togglePin(uid: string) {
    const n = new Set(pinnedIds.value);
    if (n.has(uid)) n.delete(uid); else n.add(uid);
    pinnedIds.value = n;
    savePerProjectDismissals();
  }

  if (sorted.length === 0) {
    return <div class="fp-empty">No issues detected.</div>;
  }

  return (
    <div class="fp">
      <div class="fp-header">Findings <span class="fp-count">· {sorted.length}</span></div>
      <div class="fp-list">
        {sorted.map((f) => (
          <div class={`fp-item sev-${f.severity}`}>
            <div class="fp-top">
              <span class={`fp-badge sev-${f.severity}`}>
                {f.category.toUpperCase()} · {f.confidence.toUpperCase()}
              </span>
              <span class="fp-line">line {f.line}</span>
              {pinnedIds.value.has(f.finding_uid) && <span class="fp-pinned">📌</span>}
            </div>
            <div class="fp-title">{f.title}</div>
            <div class="fp-desc">{f.explanation}</div>
            <div class="fp-actions">
              <button onClick={() => jumpTo(f.line)}>Jump to line</button>
              <button onClick={() => togglePin(f.finding_uid)}>
                {pinnedIds.value.has(f.finding_uid) ? "Unpin" : "Pin"}
              </button>
              <button onClick={() => dismiss(f.id)}>Dismiss</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write FindingsPanel.css**

```css
.fp { display: flex; flex-direction: column; height: 100%; font-family: var(--font-ui); overflow: hidden; }
.fp-empty { color: var(--text-muted); padding: 20px; text-align: center; font-size: 11px; }
.fp-header { padding: 10px 14px; border-bottom: 1px solid var(--border-subtle); color: var(--text); font-weight: 600; font-size: 12px; }
.fp-count { color: var(--text-muted); font-weight: 400; }
.fp-list { flex: 1; overflow-y: auto; padding: 8px; }
.fp-item { padding: 10px 12px; background: var(--panel); border-left: 2px solid; border-radius: 0 3px 3px 0; margin-bottom: 6px; }
.fp-item.sev-error { border-left-color: var(--error); }
.fp-item.sev-warning { border-left-color: var(--warn); }
.fp-item.sev-info { border-left-color: var(--accent-sage); }
.fp-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
.fp-badge { font-family: var(--font-mono); font-size: 8.5px; font-weight: 700; letter-spacing: 0.5px; padding: 2px 6px; border-radius: 2px; }
.fp-badge.sev-error { color: var(--error); background: rgba(220,80,80,0.15); }
.fp-badge.sev-warning { color: var(--warn); background: var(--accent-gold-bg); }
.fp-badge.sev-info { color: var(--accent-sage); background: var(--accent-sage-bg); }
.fp-line { color: var(--text-muted); font-size: 9.5px; font-family: var(--font-mono); }
.fp-pinned { font-size: 10px; }
.fp-title { color: var(--text); font-size: 11.5px; font-weight: 600; margin-bottom: 2px; }
.fp-desc { color: var(--text-muted); font-size: 10.5px; line-height: 1.55; }
.fp-actions { margin-top: 8px; display: flex; gap: 6px; }
.fp-actions button { border: 1px solid var(--border); color: var(--text); padding: 3px 8px; font-size: 9.5px; border-radius: 2px; background: transparent; }
.fp-actions button:hover { background: var(--accent-gold-bg); color: var(--accent-gold); border-color: var(--accent-gold); }
```

- [ ] **Step 3: Render FindingsPanel in bottom panel's Problems tab**

Modify BottomPanel:
```tsx
{bottomPanelTab.value === "problems" && <FindingsPanel />}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/FindingsPanel.tsx src/components/FindingsPanel.css src/components/BottomPanel.tsx
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: FindingsPanel with Dismiss / Pin / Jump buttons"
```

---

## Task 10: Monaco jump-to-line global

**Files:** Modify `src/components/MonacoEditor.tsx`

- [ ] **Step 1: Expose jump method globally**

Inside MonacoEditor's mount effect, after creating the editor:

```typescript
(window as any).monacoJumpTo = (line: number) => {
  editor.revealLineInCenter(line);
  editor.setPosition({ lineNumber: line, column: 1 });
  editor.focus();
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MonacoEditor.tsx
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: expose monacoJumpTo for Findings panel"
```

---

## Task 11: Per-project state persistence (.forgeboard/)

**Files:** Create `src/lib/project-state.ts`; add Rust commands

- [ ] **Step 1: Rust — read/write per-project state**

Append to `src-tauri/src/project/commands.rs`:

```rust
use std::collections::HashSet;
use std::path::PathBuf;

#[derive(serde::Serialize, serde::Deserialize, Default)]
pub struct ProjectState {
    pub dismissed_finding_ids: HashSet<String>,
    pub pinned_finding_uids: HashSet<String>,
}

fn state_file(project_path: &std::path::Path) -> PathBuf {
    project_path.join(".forgeboard").join("state.json")
}

#[tauri::command]
pub fn project_load_state(path: PathBuf) -> Result<ProjectState, String> {
    let f = state_file(&path);
    if !f.exists() { return Ok(ProjectState::default()); }
    let s = std::fs::read_to_string(f).map_err(|e| e.to_string())?;
    Ok(serde_json::from_str(&s).unwrap_or_default())
}

#[tauri::command]
pub fn project_save_state(path: PathBuf, state: ProjectState) -> Result<(), String> {
    let f = state_file(&path);
    if let Some(p) = f.parent() { std::fs::create_dir_all(p).map_err(|e| e.to_string())?; }
    std::fs::write(&f, serde_json::to_string_pretty(&state).unwrap())
        .map_err(|e| e.to_string())
}
```

Register in `main.rs` invoke_handler:
```rust
project::commands::project_load_state,
project::commands::project_save_state,
```

- [ ] **Step 2: Frontend bridge**

`src/lib/project-state.ts`:

```typescript
import { invoke } from "@tauri-apps/api/core";
import { currentSketch, dismissedIds, pinnedIds } from "../state/appState";

export interface ProjectState {
  dismissed_finding_ids: string[];
  pinned_finding_uids: string[];
}

export async function loadPerProjectState() {
  const s = currentSketch.value;
  if (!s) return;
  try {
    const state = await invoke<ProjectState>("project_load_state", { path: s.path });
    dismissedIds.value = new Set(state.dismissed_finding_ids);
    pinnedIds.value = new Set(state.pinned_finding_uids);
  } catch (e) { console.error(e); }
}

export async function savePerProjectDismissals() {
  const s = currentSketch.value;
  if (!s) return;
  const state: ProjectState = {
    dismissed_finding_ids: Array.from(dismissedIds.value),
    pinned_finding_uids: Array.from(pinnedIds.value),
  };
  try {
    await invoke<void>("project_save_state", { path: s.path, state });
  } catch (e) { console.error(e); }
}
```

- [ ] **Step 3: Load on bootstrap**

In `src/lib/bootstrap.ts`, after loading the sketch:
```typescript
import { loadPerProjectState } from "./project-state";
// ...
await loadPerProjectState();
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/project/commands.rs src-tauri/src/main.rs src/lib/project-state.ts src/lib/bootstrap.ts
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: persist dismissed+pinned findings per project"
```

---

## Task 12: Smoke test + tag

- [ ] **Step 1: Write a sketch that triggers all 3 seeds**

Create `~/Documents/ForgeBoard/sketches/trigger-test/trigger-test.ino`:

```cpp
void setup() {
  pinMode(2, OUTPUT)     // missing semi, also bootstrap pin
  Serial.println("x");
  if (1) { }
}

void loop() {}
```

- [ ] **Step 2: Open in IDE**

```bash
pnpm tauri dev
```

- [ ] **Step 3: Verify findings appear**

- [ ] Red wavy underline on `pinMode(2, OUTPUT)` (missing semi before if)
- [ ] Amber wavy on `pinMode(2,` (GPIO 2 bootstrap)
- [ ] Amber wavy on `Serial.println` (possibly-before-begin)
- [ ] Problems tab shows "· 3"
- [ ] Click Problems tab → 3 findings listed, pinned-first order
- [ ] Click "Jump to line" → editor scrolls to the line
- [ ] Click "Dismiss" on one → finding disappears; `.forgeboard/state.json` written to sketch folder
- [ ] Relaunch IDE → dismissed finding stays dismissed

- [ ] **Step 4: Tag**

```bash
git tag -a phase6-smart-help-framework -m "Phase 6 complete: analyzer + UI + persistence"
```

---

## Self-Review

- ✅ YAML → SQLite build
- ✅ Rust analyzer with board filter
- ✅ Monaco underlines via decorations
- ✅ FindingsPanel with Dismiss / Pin / Jump
- ✅ Per-project persistence
- ⏭ Content (500 entries) — Phase 7
- ⏭ Hover popover on squiggle (uses hoverMessage for now; richer UI in Phase 12)

**Placeholder scan:** `jumpTo` uses a window global — hacky but scoped. Flagged to refactor if needed. `mapFqbnToBoardId` has 4 cases; expand per board added (Phase 8).

---

*End of Phase 6. Next: Phase 7 — Smart Help content (500 curated YAML entries).*
