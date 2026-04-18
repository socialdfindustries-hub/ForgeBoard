# ForgeBoard IDE — Phase 2: Monaco Editor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` checkbox syntax. Prerequisite: Phase 1 is shipped (tag `phase1-shell` exists).

**Goal:** Replace the editor placeholder with a real Monaco editor that renders Arduino/C++ code with the locked Gold+Sage syntax highlighting, supports a tab bar with modified/saved indicators, shows a breadcrumb row, and auto-saves every 2 seconds.

**Architecture:** `@monaco-editor/react`-style Preact wrapper around Monaco. Custom theme registered via `monaco.editor.defineTheme`. Arduino TextMate grammar loaded from bundled file. State in signals: `openTabs`, `activeTabIndex`, `saveState`. Autosave timer in `lib/autosave.ts`.

**Tech Stack:** monaco-editor 0.x, Preact 10, Preact signals, TypeScript.

---

## File Structure

```
src/
├── components/
│   ├── MonacoEditor.tsx            # NEW — Monaco host
│   ├── TabBar.tsx                  # NEW — replaces ActionBar placeholder
│   ├── TabBar.css
│   ├── Breadcrumb.tsx              # NEW
│   ├── Breadcrumb.css
│   └── EditorArea.tsx              # MODIFIED — hosts Monaco + tabs + breadcrumb
├── lib/
│   ├── monaco-setup.ts             # NEW — theme + language registration
│   ├── arduino-grammar.ts          # NEW — TextMate grammar for Arduino/C++
│   └── autosave.ts                 # NEW
├── state/
│   └── appState.ts                 # MODIFIED — add `fileContents` signal
tests/
├── components/
│   ├── TabBar.spec.tsx             # NEW
│   └── Breadcrumb.spec.tsx         # NEW
```

---

## Open Questions

- [ ] **Monaco bundle size:** full Monaco is ~5MB. If bundle grows uncomfortably, use `monaco-editor-webpack-plugin` or dynamic import. Evaluate in Task 3.
- [ ] **Language:** register as "arduino" or use existing "cpp"? We go with "arduino" in Task 2 so we can add Arduino-specific keywords (`pinMode`, `digitalWrite`, etc.) without affecting pure C++ files.

---

## Task 1: Install monaco-editor

- [ ] **Step 1: Install**

```bash
pnpm add monaco-editor
pnpm add -D @types/node
```

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "chore: add monaco-editor dependency"
```

---

## Task 2: Register Arduino language + TextMate grammar

**Files:**
- Create: `src/lib/arduino-grammar.ts`
- Create: `src/lib/monaco-setup.ts`

- [ ] **Step 1: Write the Arduino keyword list**

`src/lib/arduino-grammar.ts`:

```typescript
/** Arduino-specific globals and functions layered onto C++ */
export const ARDUINO_KEYWORDS = [
  // Core structure
  "setup", "loop",
  // Digital I/O
  "pinMode", "digitalWrite", "digitalRead",
  // Analog
  "analogRead", "analogWrite", "analogReference",
  // Time
  "delay", "delayMicroseconds", "millis", "micros",
  // Math
  "min", "max", "abs", "constrain", "map", "pow", "sqrt",
  // Serial
  "Serial",
  // Constants
  "HIGH", "LOW", "INPUT", "OUTPUT", "INPUT_PULLUP",
  "LED_BUILTIN", "true", "false",
];

export const CPP_KEYWORDS = [
  "auto", "bool", "break", "case", "catch", "char", "class", "const",
  "constexpr", "continue", "default", "delete", "do", "double", "else",
  "enum", "explicit", "extern", "false", "float", "for", "friend", "goto",
  "if", "inline", "int", "long", "mutable", "namespace", "new", "noexcept",
  "nullptr", "operator", "private", "protected", "public", "register",
  "return", "short", "signed", "sizeof", "static", "static_assert", "struct",
  "switch", "template", "this", "throw", "true", "try", "typedef", "typeid",
  "typename", "union", "unsigned", "using", "virtual", "void", "volatile",
  "while",
];

export const ARDUINO_MONACO_LANGUAGE = {
  tokenizer: {
    root: [
      // Comments
      [/\/\/.*$/, "comment"],
      [/\/\*/, "comment", "@comment"],
      // Preprocessor
      [/^\s*#\s*\w+/, "keyword.directive"],
      // Strings
      [/"([^"\\]|\\.)*$/, "string.invalid"],
      [/"/, "string", "@string"],
      [/'[^\\']'/, "string"],
      [/'(\\.)'/, "string.escape"],
      // Numbers
      [/0[xX][0-9a-fA-F]+/, "number.hex"],
      [/0[bB][01]+/, "number.binary"],
      [/\d*\.\d+([eE][\-+]?\d+)?[fF]?/, "number.float"],
      [/\d+[uUlL]*/, "number"],
      // Arduino-specific
      [/\b(setup|loop)\b/, "keyword.arduino"],
      [/\b(HIGH|LOW|INPUT|OUTPUT|INPUT_PULLUP|LED_BUILTIN)\b/, "constant.arduino"],
      [/\b(pinMode|digitalWrite|digitalRead|analogRead|analogWrite|delay|delayMicroseconds|millis|micros|map|constrain)\b/, "support.function.arduino"],
      [/\b(Serial|Wire|SPI)\b/, "support.class.arduino"],
      // C++ keywords
      [new RegExp(`\\b(${CPP_KEYWORDS.join("|")})\\b`), "keyword"],
      // Types
      [/\b(uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t|size_t|byte|word|boolean|String)\b/, "type"],
      // Identifiers
      [/[a-zA-Z_]\w*/, "identifier"],
      // Operators
      [/[{}()\[\]]/, "@brackets"],
      [/[<>=!+\-*/%&|^~?:]/, "operator"],
    ],
    comment: [
      [/[^/*]+/, "comment"],
      [/\*\//, "comment", "@pop"],
      [/[/*]/, "comment"],
    ],
    string: [
      [/[^\\"]+/, "string"],
      [/\\./, "string.escape"],
      [/"/, "string", "@pop"],
    ],
  },
};
```

- [ ] **Step 2: Create the Monaco setup module**

`src/lib/monaco-setup.ts`:

```typescript
import * as monaco from "monaco-editor";
import { ARDUINO_MONACO_LANGUAGE } from "./arduino-grammar";

let initialized = false;

export function initMonaco() {
  if (initialized) return;
  initialized = true;

  // Register Arduino language
  monaco.languages.register({ id: "arduino", extensions: [".ino", ".pde"], aliases: ["Arduino"] });
  monaco.languages.setMonarchTokensProvider("arduino", ARDUINO_MONACO_LANGUAGE as any);

  // Register theme
  monaco.editor.defineTheme("forgeboard", {
    base: "vs-dark",
    inherit: false,
    rules: [
      { token: "comment", foreground: "5a5650", fontStyle: "italic" },
      { token: "keyword", foreground: "c9922f" },
      { token: "keyword.arduino", foreground: "c9922f", fontStyle: "bold" },
      { token: "keyword.directive", foreground: "c9922f" },
      { token: "constant.arduino", foreground: "7fb2a1" },
      { token: "support.function.arduino", foreground: "e8c585" },
      { token: "support.class.arduino", foreground: "7fb2a1" },
      { token: "type", foreground: "7fb2a1" },
      { token: "number", foreground: "d19a66" },
      { token: "number.hex", foreground: "d19a66" },
      { token: "number.binary", foreground: "d19a66" },
      { token: "number.float", foreground: "d19a66" },
      { token: "string", foreground: "a8c479" },
      { token: "string.escape", foreground: "a8c479", fontStyle: "bold" },
      { token: "identifier", foreground: "e8e6e1" },
      { token: "operator", foreground: "8a8680" },
    ],
    colors: {
      "editor.background": "#141311",
      "editor.foreground": "#e8e6e1",
      "editor.lineHighlightBackground": "#1a191680",
      "editor.lineHighlightBorder": "#00000000",
      "editorLineNumber.foreground": "#3a3834",
      "editorLineNumber.activeForeground": "#c9922f",
      "editor.selectionBackground": "#c9922f40",
      "editor.inactiveSelectionBackground": "#c9922f20",
      "editorCursor.foreground": "#c9922f",
      "editorIndentGuide.background": "#1f1e1a",
      "editorIndentGuide.activeBackground": "#2a2822",
      "editorWhitespace.foreground": "#2a2822",
      "scrollbarSlider.background": "#2a282280",
      "scrollbarSlider.hoverBackground": "#3a3834",
      "scrollbarSlider.activeBackground": "#c9922f",
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: register Arduino language + forgeboard Monaco theme"
```

---

## Task 3: Create MonacoEditor component

**Files:**
- Create: `src/components/MonacoEditor.tsx`
- Modify: `src/state/appState.ts` — add `fileContents` Map signal

- [ ] **Step 1: Extend appState for file contents**

Append to `src/state/appState.ts`:

```typescript
/** Per-file contents, keyed by path. Source of truth for editor. */
export const fileContents = signal<Map<string, string>>(
  new Map<string, string>([
    ["led-chase.ino", `// ForgeBoard — LED chase demo
#include <FastLED.h>

#define NUM_LEDS 16
#define DATA_PIN 5

CRGB leds[NUM_LEDS];

void setup() {
  FastLED.addLeds<WS2812B, DATA_PIN>(leds, NUM_LEDS);
  Serial.begin(115200);
}

void loop() {
  for (int i = 0; i < NUM_LEDS; i++) {
    leds[i] = CRGB::OrangeRed;
    FastLED.show();
    delay(50);
    leds[i] = CRGB::Black;
  }
}
`],
    ["pins.h", `#pragma once\n\n#define PIN_LED 2\n#define PIN_BUTTON 3\n`],
    ["config.h", `#pragma once\n\n#define NUM_LEDS 16\n#define BRIGHTNESS 200\n`],
  ])
);
```

- [ ] **Step 2: Create `src/components/MonacoEditor.tsx`**

```typescript
import { useEffect, useRef } from "preact/hooks";
import * as monaco from "monaco-editor";
import { initMonaco } from "../lib/monaco-setup";
import {
  openTabs,
  activeTabIndex,
  fileContents,
  saveState,
} from "../state/appState";

export function MonacoEditor() {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  // Mount Monaco
  useEffect(() => {
    if (!hostRef.current) return;
    initMonaco();
    const editor = monaco.editor.create(hostRef.current, {
      value: "",
      language: "arduino",
      theme: "forgeboard",
      fontFamily: "JetBrains Mono",
      fontSize: 13,
      lineHeight: 22,
      fontLigatures: false,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderLineHighlight: "line",
      smoothScrolling: true,
      cursorBlinking: "smooth",
      padding: { top: 12, bottom: 12 },
      automaticLayout: true,
      tabSize: 2,
      insertSpaces: true,
    });
    editorRef.current = editor;

    // On content change, mark file as modified and stage save
    const disposable = editor.onDidChangeModelContent(() => {
      const tab = openTabs.value[activeTabIndex.value];
      if (!tab) return;
      const newContents = new Map(fileContents.value);
      newContents.set(tab.path, editor.getValue());
      fileContents.value = newContents;

      const newTabs = [...openTabs.value];
      newTabs[activeTabIndex.value] = { ...tab, modified: true };
      openTabs.value = newTabs;
      saveState.value = "unsaved";
    });

    return () => {
      disposable.dispose();
      editor.dispose();
    };
  }, []);

  // Swap model when active tab changes
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const tab = openTabs.value[activeTabIndex.value];
    if (!tab) return;
    const content = fileContents.value.get(tab.path) ?? "";
    const ext = tab.path.split(".").pop() ?? "";
    const language = ext === "ino" || ext === "pde" ? "arduino" : "cpp";
    editor.setValue(content);
    const model = editor.getModel();
    if (model) monaco.editor.setModelLanguage(model, language);
  }, [activeTabIndex.value, openTabs.value]);

  return <div ref={hostRef} style={{ height: "100%", width: "100%" }} />;
}
```

- [ ] **Step 3: Modify `src/components/EditorArea.tsx` to host Monaco**

Replace entire content:

```typescript
import "./EditorArea.css";
import { MonacoEditor } from "./MonacoEditor";

export function EditorArea() {
  return (
    <main class="editor-area">
      <MonacoEditor />
    </main>
  );
}
```

And update `src/components/EditorArea.css`:

```css
.editor-area {
  background: var(--bg);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
```

- [ ] **Step 4: Run the app, verify Monaco renders with Arduino code**

```bash
pnpm tauri dev
```

Expected: Monaco editor fills the editor region, showing the LED chase demo code with Gold-colored keywords, sage `CRGB` type, green strings, proper syntax highlighting.

- [ ] **Step 5: Commit**

```bash
git add src/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: integrate Monaco editor with Arduino highlighting"
```

---

## Task 4: Build TabBar component (replaces ActionBar placeholder)

**Files:**
- Create: `src/components/TabBar.tsx`
- Create: `src/components/TabBar.css`
- Modify: `src/components/ActionBar.tsx` — use TabBar

- [ ] **Step 1: Write TabBar**

`src/components/TabBar.tsx`:

```typescript
import "./TabBar.css";
import { openTabs, activeTabIndex } from "../state/appState";

export function TabBar() {
  const tabs = openTabs.value;
  const active = activeTabIndex.value;

  function setActive(i: number) {
    activeTabIndex.value = i;
  }

  function closeTab(i: number, e: MouseEvent) {
    e.stopPropagation();
    const newTabs = tabs.filter((_, idx) => idx !== i);
    openTabs.value = newTabs;
    if (active >= newTabs.length) activeTabIndex.value = newTabs.length - 1;
    else if (i <= active && active > 0) activeTabIndex.value = active - 1;
  }

  return (
    <div class="tabbar">
      {tabs.map((tab, i) => (
        <button
          class={`tab ${i === active ? "active" : ""}`}
          onClick={() => setActive(i)}
        >
          <span class={`tab-dot ${tab.modified ? "modified" : "saved"}`}>
            {tab.modified ? "●" : "○"}
          </span>
          <span class="tab-name">{tab.path}</span>
          <span class="tab-x" onClick={(e) => closeTab(i, e as any)}>×</span>
        </button>
      ))}
      <button class="tab-plus" title="New file">+</button>
    </div>
  );
}
```

- [ ] **Step 2: Write styles**

`src/components/TabBar.css`:

```css
.tabbar {
  display: flex;
  align-items: stretch;
  font-size: 10.5px;
  font-family: var(--font-mono);
}
.tab {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 12px 6px;
  color: var(--text-muted);
  border-right: 1px solid var(--border-subtle);
  border-top: 2px solid transparent;
  cursor: pointer;
  background: transparent;
}
.tab.active {
  background: var(--bg);
  color: var(--text);
  border-top-color: var(--accent-gold);
}
.tab:hover:not(.active) { color: var(--text); }
.tab-dot { font-size: 8px; }
.tab-dot.modified { color: var(--accent-gold); }
.tab-dot.saved { color: var(--border); }
.tab-name { font-size: 10px; }
.tab-x {
  color: var(--text-dim);
  margin-left: 4px;
  font-size: 12px;
  padding: 0 2px;
  border-radius: 2px;
}
.tab-x:hover { background: var(--border); color: var(--text); }
.tab-plus {
  padding: 7px 12px;
  color: var(--text-dim);
  font-size: 12px;
}
.tab-plus:hover { color: var(--accent-gold); }
```

- [ ] **Step 3: Wire TabBar into ActionBar**

Replace `src/components/ActionBar.tsx`'s `<div class="actionbar-tabs">` block:

```typescript
import { TabBar } from "./TabBar";
// ...
export function ActionBar() {
  return (
    <div class="actionbar">
      <TabBar />
      <div class="actionbar-spacer" />
      {/* rest of buttons unchanged */}
```

And remove `.actionbar-placeholder-tab` from `ActionBar.css`.

- [ ] **Step 4: Run and verify**

```bash
pnpm tauri dev
```

Click each tab → Monaco content swaps. Click × on a tab → tab closes. Click + → no-op for now (new-file flow comes in Phase 3).

- [ ] **Step 5: Commit**

```bash
git add src/components/TabBar.tsx src/components/TabBar.css src/components/ActionBar.tsx src/components/ActionBar.css
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: add TabBar with close buttons and modified dots"
```

---

## Task 5: Build Breadcrumb component

**Files:**
- Create: `src/components/Breadcrumb.tsx`
- Create: `src/components/Breadcrumb.css`
- Modify: `src/components/EditorArea.tsx` — add Breadcrumb above Monaco

- [ ] **Step 1: Write Breadcrumb**

`src/components/Breadcrumb.tsx`:

```typescript
import "./Breadcrumb.css";
import { openTabs, activeTabIndex } from "../state/appState";

export function Breadcrumb() {
  const tab = openTabs.value[activeTabIndex.value];
  if (!tab) return null;
  // For Phase 2, use a fixed mock project path. Phase 3 replaces with real path.
  const projectName = "led-chase";
  return (
    <div class="breadcrumb">
      <span>sketches</span>
      <span class="sep">/</span>
      <span>{projectName}</span>
      <span class="sep">/</span>
      <span class="current">{tab.path}</span>
    </div>
  );
}
```

- [ ] **Step 2: Write styles**

`src/components/Breadcrumb.css`:

```css
.breadcrumb {
  background: var(--bg);
  padding: 4px 18px;
  font-size: 9px;
  color: var(--text-disabled);
  border-bottom: 1px solid var(--border-subtle);
  font-family: var(--font-mono);
}
.breadcrumb .sep { color: var(--text-dim); margin: 0 6px; }
.breadcrumb .current { color: var(--accent-gold); }
```

- [ ] **Step 3: Modify EditorArea**

`src/components/EditorArea.tsx`:

```typescript
import "./EditorArea.css";
import { MonacoEditor } from "./MonacoEditor";
import { Breadcrumb } from "./Breadcrumb";

export function EditorArea() {
  return (
    <main class="editor-area">
      <Breadcrumb />
      <div class="editor-monaco-host">
        <MonacoEditor />
      </div>
    </main>
  );
}
```

And update `.editor-area`:

```css
.editor-area {
  background: var(--bg);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.editor-monaco-host { flex: 1; min-height: 0; }
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Breadcrumb.tsx src/components/Breadcrumb.css src/components/EditorArea.tsx src/components/EditorArea.css
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: add Breadcrumb row above Monaco editor"
```

---

## Task 6: Auto-save every 2 seconds

**Files:**
- Create: `src/lib/autosave.ts`
- Modify: `src/main.tsx` — start autosave loop
- Modify: `src/state/appState.ts` — ensure `saveState` transitions

- [ ] **Step 1: Write the autosave module**

`src/lib/autosave.ts`:

```typescript
import { effect } from "@preact/signals";
import { saveState, fileContents, openTabs } from "../state/appState";

const AUTOSAVE_MS = 2000;
let pendingSave: number | null = null;

export function startAutoSaveLoop() {
  effect(() => {
    // Access signals to subscribe
    fileContents.value;
    openTabs.value;
    if (saveState.value !== "unsaved") return;
    if (pendingSave) clearTimeout(pendingSave);
    pendingSave = window.setTimeout(saveNow, AUTOSAVE_MS);
  });
}

async function saveNow() {
  saveState.value = "saving";
  // Phase 2: save is a no-op (in-memory only). Phase 3 wires to disk.
  await new Promise((r) => setTimeout(r, 100));
  const newTabs = openTabs.value.map((t) => ({ ...t, modified: false }));
  openTabs.value = newTabs;
  saveState.value = "saved";
  pendingSave = null;
}
```

- [ ] **Step 2: Call startAutoSaveLoop() in main.tsx**

Modify `src/main.tsx`:

```typescript
import { render } from "preact";
import App from "./App";
import { startAutoSaveLoop } from "./lib/autosave";

import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/global.css";

startAutoSaveLoop();

render(<App />, document.getElementById("app")!);
```

- [ ] **Step 3: Run and verify**

```bash
pnpm tauri dev
```

Type something in the editor. Status bar should show "● Unsaved" immediately (amber), change to "… Saving" briefly, then "✓ Saved" (sage) ~2 seconds after you stop typing. Tab's modified dot should clear.

- [ ] **Step 4: Commit**

```bash
git add src/lib/autosave.ts src/main.tsx
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: in-memory autosave every 2s with status indicator"
```

---

## Task 7: Keyboard shortcuts (Ctrl+S, Ctrl+W, Ctrl+Tab)

**Files:**
- Create: `src/lib/shortcuts.ts`
- Modify: `src/main.tsx` — install shortcuts

- [ ] **Step 1: Write shortcuts module**

`src/lib/shortcuts.ts`:

```typescript
import { openTabs, activeTabIndex, saveState } from "../state/appState";

export function installShortcuts() {
  window.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;

    // Ctrl+S — force save (trigger autosave immediately)
    if (mod && e.key === "s") {
      e.preventDefault();
      saveState.value = "unsaved"; // autosave effect will pick up and fire
      return;
    }

    // Ctrl+W — close active tab
    if (mod && e.key === "w") {
      e.preventDefault();
      const i = activeTabIndex.value;
      const newTabs = openTabs.value.filter((_, idx) => idx !== i);
      openTabs.value = newTabs;
      if (activeTabIndex.value >= newTabs.length) {
        activeTabIndex.value = Math.max(0, newTabs.length - 1);
      }
      return;
    }

    // Ctrl+Tab — next tab
    if (mod && e.key === "Tab") {
      e.preventDefault();
      const n = openTabs.value.length;
      if (n === 0) return;
      activeTabIndex.value = (activeTabIndex.value + 1) % n;
      return;
    }
  });
}
```

- [ ] **Step 2: Install in main.tsx**

```typescript
import { installShortcuts } from "./lib/shortcuts";
// ...
installShortcuts();
startAutoSaveLoop();
render(<App />, document.getElementById("app")!);
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/shortcuts.ts src/main.tsx
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: add Ctrl+S / Ctrl+W / Ctrl+Tab shortcuts"
```

---

## Task 8: Test TabBar component

**Files:**
- Create: `tests/components/TabBar.spec.tsx`

- [ ] **Step 1: Write tests**

```typescript
import { render, screen, fireEvent } from "@testing-library/preact";
import { TabBar } from "../../src/components/TabBar";
import { openTabs, activeTabIndex } from "../../src/state/appState";

beforeEach(() => {
  openTabs.value = [
    { path: "a.ino", modified: true },
    { path: "b.h", modified: false },
  ];
  activeTabIndex.value = 0;
});

describe("TabBar", () => {
  it("renders all open tabs", () => {
    render(<TabBar />);
    expect(screen.getByText("a.ino")).toBeInTheDocument();
    expect(screen.getByText("b.h")).toBeInTheDocument();
  });

  it("marks modified tabs with a filled dot", () => {
    render(<TabBar />);
    const tabs = screen.getAllByRole("button");
    const aTab = tabs.find((t) => t.textContent?.includes("a.ino"))!;
    expect(aTab.querySelector(".modified")).toBeInTheDocument();
  });

  it("changes active tab on click", () => {
    render(<TabBar />);
    fireEvent.click(screen.getByText("b.h"));
    expect(activeTabIndex.value).toBe(1);
  });

  it("closes tab on × click", () => {
    render(<TabBar />);
    const xs = document.querySelectorAll(".tab-x");
    fireEvent.click(xs[0]);
    expect(openTabs.value).toHaveLength(1);
    expect(openTabs.value[0].path).toBe("b.h");
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add tests/components/TabBar.spec.tsx
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "test: add TabBar component tests"
```

---

## Task 9: Phase 2 integration smoke test

- [ ] **Step 1: Run the app**

```bash
pnpm tauri dev
```

- [ ] **Step 2: Manually verify**

- [ ] Tab bar shows 3 tabs (led-chase.ino · pins.h · config.h); led-chase is active with gold top border and gold ●
- [ ] Click pins.h → Monaco content swaps to `#pragma once...` content
- [ ] Click led-chase.ino → back to LED chase code, syntax highlighting: orange `#include`, sage `CRGB` type, gold `void`/`setup`/`loop`, orange numbers, green strings
- [ ] Breadcrumb says `sketches / led-chase / led-chase.ino`
- [ ] Type a character in the editor → status bar shows "● Unsaved" (amber)
- [ ] Wait 2 seconds → status transitions to "… Saving" then "✓ Saved" (sage)
- [ ] Press Ctrl+S → immediate save
- [ ] Press Ctrl+Tab → next tab activates
- [ ] Press Ctrl+W → active tab closes

- [ ] **Step 3: Run all tests**

```bash
pnpm test
cd src-tauri && cargo test && cd ..
```

All green.

- [ ] **Step 4: Tag Phase 2**

```bash
git tag -a phase2-monaco -m "Phase 2 complete: Monaco editor + tabs + breadcrumb + autosave"
```

---

## Self-Review

**Spec coverage (Phase 2 portions):**
- ✅ Monaco editor with Arduino highlighting
- ✅ Gold+Sage syntax theme
- ✅ Tab bar with modified/saved dots, close ×
- ✅ Breadcrumb path
- ✅ Autosave every 2 seconds
- ✅ Ctrl+S / Ctrl+W / Ctrl+Tab shortcuts
- ⏭ ⌘P file search — deferred to Phase 3 (needs real file system)
- ⏭ ⌘K command palette — deferred to Phase 12

**Placeholder scan:** None.

**Type consistency:** `openTabs`, `activeTabIndex`, `saveState`, `fileContents` signals all reference consistent shapes across components.

---

*End of Phase 2. Next: Phase 3 — File System + Sketch Model (real file I/O, create/open/save to disk).*
