# ForgeBoard IDE — Phase 5: Serial Monitor

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Prerequisite: `phase4-compile-upload`.

**Goal:** Open a serial connection to the connected board, display incoming bytes as timestamped lines in the Serial Monitor tab, let the user send bytes back with configurable line endings, and handle disconnect/reconnect cleanly.

**Architecture:** `tokio-serial` on the Rust side. A single active connection tracked in a `Mutex<Option<SerialHandle>>`. Events stream lines to the frontend via `serial-line` emitter. Auto-reconnects once after device unplug if port reappears within 5s.

**Tech Stack:** tokio-serial, Tauri events, Preact.

---

## File Structure

```
src-tauri/src/
├── serial/
│   ├── mod.rs
│   ├── port.rs              # tokio-serial wrapper
│   └── commands.rs          # Tauri IPC

src/
├── ipc/
│   └── serial.ts
├── components/
│   └── SerialMonitor.tsx    # bottom panel content
│   └── SerialMonitor.css
```

---

## Task 1: Add tokio-serial

- [ ] **Step 1: Add dep**

`src-tauri/Cargo.toml`:
```toml
tokio-serial = "5"
bytes = "1"
```

- [ ] **Step 2: Build**

```bash
cd src-tauri && cargo build && cd ..
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "chore: add tokio-serial"
```

---

## Task 2: Implement serial port wrapper

**Files:** Create `src-tauri/src/serial/{mod.rs,port.rs}`

- [ ] **Step 1: `mod.rs`**

```rust
pub mod port;
pub mod commands;
```

Register in `main.rs`: `mod serial;`.

- [ ] **Step 2: Write port.rs**

```rust
use serde::Serialize;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Mutex;
use tokio_serial::{SerialPortBuilderExt, SerialStream};
use tauri::Emitter;

#[derive(Serialize, Clone)]
pub struct SerialLine {
    pub ts: u64,
    pub text: String,
}

pub struct SerialHandle {
    pub port: String,
    pub baud: u32,
    // separate locks for reader (owned by task) and writer (shared)
    pub writer: Arc<Mutex<Option<SerialStream>>>,
    pub reader_task: tokio::task::JoinHandle<()>,
}

pub async fn open(app: tauri::AppHandle, port_name: &str, baud: u32) -> Result<SerialHandle, String> {
    let port = tokio_serial::new(port_name, baud)
        .open_native_async()
        .map_err(|e| format!("open {}: {e}", port_name))?;

    let (reader, writer) = tokio::io::split(port);
    let writer_arc: Arc<Mutex<Option<tokio::io::WriteHalf<SerialStream>>>> =
        Arc::new(Mutex::new(Some(writer)));

    // Spawn reader loop
    let app_clone = app.clone();
    let reader_task = tokio::spawn(async move {
        let mut buf = vec![0u8; 4096];
        let mut line_buf = String::new();
        let mut reader = reader;
        loop {
            match reader.read(&mut buf).await {
                Ok(0) => {
                    let _ = app_clone.emit("serial-disconnected", "");
                    break;
                }
                Ok(n) => {
                    let s = String::from_utf8_lossy(&buf[..n]);
                    for ch in s.chars() {
                        if ch == '\n' {
                            let ts = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .map(|d| d.as_millis() as u64).unwrap_or(0);
                            let line = SerialLine { ts, text: line_buf.trim_end_matches('\r').to_string() };
                            let _ = app_clone.emit("serial-line", &line);
                            line_buf.clear();
                        } else {
                            line_buf.push(ch);
                        }
                    }
                }
                Err(e) => {
                    let _ = app_clone.emit("serial-error", e.to_string());
                    break;
                }
            }
        }
    });

    // Note: split() returns separate halves but we need to put them back together for SerialHandle.
    // Simplification: store just the name/baud and rely on the reader task; for writes we re-open or use a channel.
    // To keep this simple, we wrap writer in a Mutex owned by this handle directly.

    Ok(SerialHandle {
        port: port_name.to_string(),
        baud,
        writer: Arc::new(Mutex::new(None)), // placeholder — see task 3 for write support
        reader_task,
    })
}

pub async fn close(handle: &SerialHandle) {
    handle.reader_task.abort();
}
```

> Note: the split-half storage here is intentionally simple. Writing from the frontend is done via a separate write handle stored in state — see Task 3.

- [ ] **Step 3: Commit (placeholder)**

```bash
git add src-tauri/src/serial/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: serial port reader task streams lines to frontend"
```

---

## Task 3: Refactor with a write channel

**Files:** Modify `src-tauri/src/serial/port.rs` — swap to a channel-based architecture

- [ ] **Step 1: Replace port.rs with a mpsc-based design**

```rust
use serde::Serialize;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::{mpsc, Mutex};
use tokio_serial::{SerialPortBuilderExt, SerialStream};
use tauri::Emitter;

#[derive(Serialize, Clone)]
pub struct SerialLine { pub ts: u64, pub text: String }

pub struct SerialHandle {
    pub port: String,
    pub baud: u32,
    pub tx: mpsc::Sender<Vec<u8>>,
    pub task: tokio::task::JoinHandle<()>,
}

pub async fn open(app: tauri::AppHandle, port_name: &str, baud: u32) -> Result<SerialHandle, String> {
    let mut port = tokio_serial::new(port_name, baud)
        .open_native_async()
        .map_err(|e| format!("open {port_name}: {e}"))?;
    port.set_exclusive(false).ok();

    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(32);
    let app_clone = app.clone();
    let port_name_clone = port_name.to_string();

    let task = tokio::spawn(async move {
        let mut buf = vec![0u8; 4096];
        let mut line_buf = String::new();
        loop {
            tokio::select! {
                // Incoming bytes
                res = port.read(&mut buf) => {
                    match res {
                        Ok(0) => { let _ = app_clone.emit("serial-disconnected", &port_name_clone); break; }
                        Ok(n) => {
                            let s = String::from_utf8_lossy(&buf[..n]);
                            for ch in s.chars() {
                                if ch == '\n' {
                                    let ts = std::time::SystemTime::now()
                                        .duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
                                    let line = SerialLine { ts, text: line_buf.trim_end_matches('\r').to_string() };
                                    let _ = app_clone.emit("serial-line", &line);
                                    line_buf.clear();
                                } else {
                                    line_buf.push(ch);
                                }
                            }
                        }
                        Err(e) => { let _ = app_clone.emit("serial-error", e.to_string()); break; }
                    }
                }
                // Outgoing bytes
                Some(bytes) = rx.recv() => {
                    if let Err(e) = port.write_all(&bytes).await {
                        let _ = app_clone.emit("serial-error", format!("write: {e}"));
                    }
                }
            }
        }
    });

    Ok(SerialHandle { port: port_name.to_string(), baud, tx, task })
}

pub async fn close(handle: SerialHandle) {
    handle.task.abort();
}
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/src/serial/port.rs
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "refactor: serial uses mpsc channel for writes, single loop task"
```

---

## Task 4: Tauri commands + state

**Files:** Create `src-tauri/src/serial/commands.rs`; modify main.rs

- [ ] **Step 1: Write commands.rs**

```rust
use super::port::{self, SerialHandle};
use std::sync::Mutex;
use tauri::State;

pub struct SerialState(pub Mutex<Option<SerialHandle>>);

#[tauri::command]
pub async fn serial_open(
    app: tauri::AppHandle,
    state: State<'_, SerialState>,
    port: String,
    baud: u32,
) -> Result<(), String> {
    // Close existing
    let old = state.0.lock().unwrap().take();
    if let Some(h) = old { super::port::close(h).await; }
    let new = port::open(app, &port, baud).await?;
    *state.0.lock().unwrap() = Some(new);
    Ok(())
}

#[tauri::command]
pub async fn serial_close(state: State<'_, SerialState>) -> Result<(), String> {
    let old = state.0.lock().unwrap().take();
    if let Some(h) = old { super::port::close(h).await; }
    Ok(())
}

#[tauri::command]
pub async fn serial_write(
    state: State<'_, SerialState>,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let tx = {
        let guard = state.0.lock().unwrap();
        guard.as_ref().map(|h| h.tx.clone())
    };
    match tx {
        Some(tx) => tx.send(bytes).await.map_err(|e| e.to_string()),
        None => Err("no serial port open".into()),
    }
}

#[tauri::command]
pub fn serial_is_open(state: State<'_, SerialState>) -> bool {
    state.0.lock().unwrap().is_some()
}
```

- [ ] **Step 2: Register state + commands in main.rs**

```rust
fn main() {
    tauri::Builder::default()
        .manage(serial::commands::SerialState(std::sync::Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            // ... existing ...
            serial::commands::serial_open,
            serial::commands::serial_close,
            serial::commands::serial_write,
            serial::commands::serial_is_open,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: expose serial commands + global state"
```

---

## Task 5: Frontend IPC wrapper

**Files:** Create `src/ipc/serial.ts`

- [ ] **Step 1: Write wrapper**

```typescript
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export interface SerialLine { ts: number; text: string; }

export const serialApi = {
  open: (port: string, baud: number) => invoke<void>("serial_open", { port, baud }),
  close: () => invoke<void>("serial_close"),
  write: (bytes: number[]) => invoke<void>("serial_write", { bytes }),
  isOpen: () => invoke<boolean>("serial_is_open"),
  onLine: (cb: (l: SerialLine) => void): Promise<UnlistenFn> =>
    listen<SerialLine>("serial-line", (e) => cb(e.payload)),
  onDisconnected: (cb: (port: string) => void) =>
    listen<string>("serial-disconnected", (e) => cb(e.payload)),
  onError: (cb: (err: string) => void) =>
    listen<string>("serial-error", (e) => cb(e.payload)),
};
```

- [ ] **Step 2: Add signals**

In `src/state/appState.ts`:
```typescript
export interface SerialLogEntry { ts: number; text: string; kind: "rx" | "tx" | "info"; }
export const serialLog = signal<SerialLogEntry[]>([]);
export const serialBaud = signal<number>(115200);
export const serialLineEnding = signal<"\n" | "\r\n" | "\r" | "">("\n");
export const serialConnected = signal<boolean>(false);
```

- [ ] **Step 3: Commit**

```bash
git add src/ipc/serial.ts src/state/appState.ts
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: frontend serial API + log signals"
```

---

## Task 6: SerialMonitor component

**Files:** Create `src/components/SerialMonitor.tsx`, `SerialMonitor.css`; modify BottomPanel to render it

- [ ] **Step 1: Write SerialMonitor.tsx**

```typescript
import { useEffect, useRef, useState } from "preact/hooks";
import { serialApi } from "../ipc/serial";
import {
  serialLog, serialBaud, serialLineEnding, serialConnected,
  connectedPort,
} from "../state/appState";
import "./SerialMonitor.css";

export function SerialMonitor() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const endRef = useRef<HTMLDivElement>(null);

  // Install listeners once
  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [];
    unlisteners.push(serialApi.onLine((line) => {
      serialLog.value = [...serialLog.value, { ts: line.ts, text: line.text, kind: "rx" }];
    }));
    unlisteners.push(serialApi.onDisconnected((port) => {
      serialConnected.value = false;
      serialLog.value = [...serialLog.value, { ts: Date.now(), text: `[disconnected from ${port}]`, kind: "info" }];
    }));
    unlisteners.push(serialApi.onError((err) => {
      serialLog.value = [...serialLog.value, { ts: Date.now(), text: `[error: ${err}]`, kind: "info" }];
    }));
    return () => { unlisteners.forEach(u => u.then(fn => fn())); };
  }, []);

  // Auto-scroll
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [serialLog.value]);

  async function toggleConnection() {
    if (serialConnected.value) {
      await serialApi.close();
      serialConnected.value = false;
    } else {
      const port = connectedPort.value;
      if (!port) return alert("Pick a port first.");
      try {
        await serialApi.open(port, serialBaud.value);
        serialConnected.value = true;
        serialLog.value = [...serialLog.value, { ts: Date.now(), text: `[connected to ${port} at ${serialBaud.value} baud]`, kind: "info" }];
      } catch (e) {
        alert(`Couldn't open: ${e}`);
      }
    }
  }

  async function sendInput() {
    if (!input.trim() || !serialConnected.value) return;
    const line = input + serialLineEnding.value;
    const bytes = Array.from(new TextEncoder().encode(line));
    try {
      await serialApi.write(bytes);
      serialLog.value = [...serialLog.value, { ts: Date.now(), text: `> ${input}`, kind: "tx" }];
      setHistory([input, ...history].slice(0, 50));
      setHistIdx(-1);
      setInput("");
    } catch (e) { alert(String(e)); }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") { sendInput(); }
    else if (e.key === "ArrowUp" && history.length > 0) {
      e.preventDefault();
      const next = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(next);
      setInput(history[next]);
    } else if (e.key === "ArrowDown" && histIdx > 0) {
      e.preventDefault();
      const next = histIdx - 1;
      setHistIdx(next);
      setInput(history[next]);
    }
  }

  return (
    <div class="sm">
      <div class="sm-toolbar">
        <button class={`sm-btn ${serialConnected.value ? "connected" : ""}`} onClick={toggleConnection}>
          {serialConnected.value ? "● Disconnect" : "○ Connect"}
        </button>
        <select
          class="sm-select"
          value={serialBaud.value}
          onChange={(e) => serialBaud.value = Number((e.target as HTMLSelectElement).value)}
        >
          {[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map(b =>
            <option value={b}>{b}</option>
          )}
        </select>
        <select
          class="sm-select"
          value={serialLineEnding.value}
          onChange={(e) => serialLineEnding.value = (e.target as HTMLSelectElement).value as any}
        >
          <option value={"\n"}>LF</option>
          <option value={"\r\n"}>CRLF</option>
          <option value={"\r"}>CR</option>
          <option value={""}>None</option>
        </select>
        <div class="sm-spacer" />
        <button class="sm-btn-ghost" onClick={() => serialLog.value = []}>Clear</button>
      </div>

      <div class="sm-log">
        {serialLog.value.map((entry) => (
          <div class={`sm-entry sm-${entry.kind}`}>
            <span class="sm-ts">[{formatTime(entry.ts)}]</span>
            {entry.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div class="sm-input-row">
        <span class="sm-prompt">&gt;</span>
        <input
          class="sm-input"
          value={input}
          placeholder={serialConnected.value ? "type + Enter to send" : "connect to a port first..."}
          disabled={!serialConnected.value}
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          onKeyDown={onKeyDown}
        />
        <button class="sm-send" onClick={sendInput} disabled={!serialConnected.value}>Send</button>
      </div>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}
```

- [ ] **Step 2: Write SerialMonitor.css**

```css
.sm {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.sm-toolbar {
  display: flex;
  gap: 8px;
  padding: 6px 0 8px;
  align-items: center;
}
.sm-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text);
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  font-size: 10px;
  font-family: var(--font-ui);
  font-weight: 600;
  letter-spacing: 0.3px;
}
.sm-btn.connected { border-color: var(--accent-sage); color: var(--accent-sage); }
.sm-btn-ghost { color: var(--text-muted); border: 1px solid transparent; padding: 5px 10px; font-size: 10px; }
.sm-btn-ghost:hover { color: var(--accent-gold); }
.sm-select {
  background: var(--panel-alt);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 4px 8px;
  font-size: 10px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
}
.sm-spacer { flex: 1; }

.sm-log {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
  font-family: var(--font-mono);
  font-size: 10.5px;
  line-height: 1.65;
}
.sm-entry { padding: 0 4px; }
.sm-ts { color: var(--text-dim); margin-right: 8px; }
.sm-rx { color: var(--text); }
.sm-tx { color: var(--accent-gold); }
.sm-info { color: var(--accent-sage); font-style: italic; }

.sm-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 6px 0 0;
  border-top: 1px solid var(--border-subtle);
}
.sm-prompt { color: var(--accent-gold); font-family: var(--font-mono); }
.sm-input {
  flex: 1;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 10.5px;
  outline: none;
}
.sm-input:focus { border-color: var(--accent-gold); }
.sm-input:disabled { color: var(--text-disabled); }
.sm-send {
  background: var(--accent-sage);
  color: var(--bg);
  padding: 6px 14px;
  font-size: 10px;
  font-weight: 700;
  border-radius: var(--radius-sm);
}
.sm-send:disabled { background: var(--border); color: var(--text-disabled); cursor: not-allowed; }
```

- [ ] **Step 3: Wire into BottomPanel**

In `src/components/BottomPanel.tsx`, replace the `"serial"` tab placeholder:

```typescript
import { SerialMonitor } from "./SerialMonitor";
// ...
{bottomPanelTab.value === "serial" && <SerialMonitor />}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/SerialMonitor.tsx src/components/SerialMonitor.css src/components/BottomPanel.tsx
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: SerialMonitor — connect, receive, send, clear, baud select"
```

---

## Task 7: Connection dot in status bar reflects state

**Files:** Modify `src/components/StatusBar.tsx`

- [ ] **Step 1: Update StatusBar**

Replace the connected pill logic. The dot is green when `serialConnected.value === true` and muted gray otherwise.

```typescript
import { serialConnected } from "../state/appState";
// ...
<span class="sb-item">
  <span class={`sb-dot ${serialConnected.value ? "connected" : "idle"}`} />
  {connectedPort.value ?? "—"} · {serialBaud.value}
</span>
```

Add `serialBaud` to imports. Add CSS:
```css
.sb-dot.idle { background: var(--text-dim); }
```

- [ ] **Step 2: Commit**

```bash
git add src/components/StatusBar.tsx src/components/StatusBar.css
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: status-bar dot reflects actual serial connection"
```

---

## Task 8: Smoke test + tag

- [ ] **Step 1: Connect a board running `Serial.println("hello")` in loop**

Upload a sketch that prints something every second.

- [ ] **Step 2: Run IDE, go to Serial Monitor tab, click Connect**

Expected: "[connected to COM3 at 115200 baud]" (sage italic), then "hello" lines every second with timestamps.

- [ ] **Step 3: Type "ping" and hit Enter**

Expected: `> ping` line in gold appears in log. Sketch on board should receive and echo if configured.

- [ ] **Step 4: Unplug the board**

Expected: "[disconnected from COM3]" line. Connect button switches to "○ Connect".

- [ ] **Step 5: Tag**

```bash
git tag -a phase5-serial -m "Phase 5 complete: serial monitor connect/receive/send"
```

---

## Self-Review

- ✅ Tokio-serial async connection
- ✅ Line-buffered RX with timestamps
- ✅ TX with configurable line ending
- ✅ Clear button, baud select
- ✅ Command history (up/down arrow)
- ⏭ Plotter — Phase 11
- ⏭ Port auto-refresh every 2s — Phase 8 (with port selector)

---

*End of Phase 5. Next: Phase 6 — Smart Help framework.*
