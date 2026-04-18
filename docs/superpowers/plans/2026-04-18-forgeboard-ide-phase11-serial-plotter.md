# ForgeBoard IDE — Phase 11: Serial Plotter

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Prerequisite: `phase10-examples`.

**Goal:** Parse numeric output from the serial stream and draw a live scrolling line chart in the Plotter tab. Supports up to 4 series via `label:value,label:value` format. Auto-scales Y-axis. Smooth 60fps canvas rendering.

**Architecture:** No new Rust work — reuses the existing serial line stream. A `parseNumericLine(text)` function extracts `{label, value}[]` pairs. A `PlotterCanvas` component maintains a ring buffer (2000 samples) and draws with `requestAnimationFrame`.

**Tech Stack:** Canvas 2D API, Preact.

---

## File Structure

```
src/
├── lib/
│   ├── serialParser.ts        # parse numeric lines
│   └── ringBuffer.ts          # typed ring buffer
├── components/
│   ├── SerialPlotter.tsx
│   └── SerialPlotter.css
```

---

## Task 1: Parser + ring buffer

**Files:** Create `src/lib/serialParser.ts`, `src/lib/ringBuffer.ts`

- [ ] **Step 1: Write serialParser.ts**

```typescript
export interface NumericSample { label: string; value: number; }

/**
 * Parse a line like:
 *   "42"                → [{ label: "series-0", value: 42 }]
 *   "temp:21.5"         → [{ label: "temp", value: 21.5 }]
 *   "x:1.0 y:2.0 z:-0.3" → [{ label: "x", ... }, { label: "y", ... }, { label: "z", ... }]
 *   "x:1, y:2, z:-0.3"   → same as above, comma or space separated
 *   "1,2,3"             → [{ label: "series-0", value: 1 }, { label: "series-1", value: 2 }, ...]
 */
export function parseNumericLine(text: string): NumericSample[] {
  const out: NumericSample[] = [];
  const cleaned = text.trim();
  if (!cleaned) return out;

  // Try labeled first: word:number pairs
  const labeled = Array.from(cleaned.matchAll(/([a-zA-Z_][\w]*)\s*[:=]\s*(-?\d+\.?\d*(?:[eE][+-]?\d+)?)/g));
  if (labeled.length > 0) {
    for (const m of labeled) {
      const v = parseFloat(m[2]);
      if (!isNaN(v)) out.push({ label: m[1], value: v });
    }
    return out;
  }

  // Comma or whitespace separated numbers
  const parts = cleaned.split(/[,\s]+/).filter(Boolean);
  parts.forEach((p, i) => {
    const v = parseFloat(p);
    if (!isNaN(v)) out.push({ label: `series-${i}`, value: v });
  });

  return out;
}
```

- [ ] **Step 2: Write ringBuffer.ts**

```typescript
export class RingBuffer<T> {
  private data: T[];
  private head = 0;
  private filled = 0;

  constructor(public readonly capacity: number) {
    this.data = new Array(capacity);
  }

  push(v: T) {
    this.data[this.head] = v;
    this.head = (this.head + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled++;
  }

  clear() { this.head = 0; this.filled = 0; }

  /** Returns samples in chronological order */
  toArray(): T[] {
    if (this.filled < this.capacity) {
      return this.data.slice(0, this.filled);
    }
    return [...this.data.slice(this.head), ...this.data.slice(0, this.head)];
  }

  get size() { return this.filled; }
}
```

- [ ] **Step 3: Unit tests**

`tests/lib/serialParser.spec.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseNumericLine } from "../../src/lib/serialParser";

describe("parseNumericLine", () => {
  it("single number", () => {
    expect(parseNumericLine("42")).toEqual([{ label: "series-0", value: 42 }]);
  });
  it("labeled values", () => {
    expect(parseNumericLine("temp:21.5")).toEqual([{ label: "temp", value: 21.5 }]);
  });
  it("multiple labeled", () => {
    expect(parseNumericLine("x:1 y:2 z:-0.3")).toEqual([
      { label: "x", value: 1 }, { label: "y", value: 2 }, { label: "z", value: -0.3 },
    ]);
  });
  it("CSV numbers", () => {
    expect(parseNumericLine("1,2,3")).toEqual([
      { label: "series-0", value: 1 }, { label: "series-1", value: 2 }, { label: "series-2", value: 3 },
    ]);
  });
  it("non-numeric ignored", () => {
    expect(parseNumericLine("hello world")).toEqual([]);
  });
  it("scientific notation", () => {
    expect(parseNumericLine("freq:1.5e3")).toEqual([{ label: "freq", value: 1500 }]);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm test serialParser
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ tests/lib/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: numeric line parser + ring buffer with tests"
```

---

## Task 2: SerialPlotter component

**Files:** Create `src/components/SerialPlotter.tsx`, `SerialPlotter.css`

- [ ] **Step 1: Write SerialPlotter.tsx**

```typescript
import { useEffect, useRef, useState } from "preact/hooks";
import { RingBuffer } from "../lib/ringBuffer";
import { parseNumericLine } from "../lib/serialParser";
import { serialApi } from "../ipc/serial";
import "./SerialPlotter.css";

const MAX_SAMPLES = 2000;
const SERIES_COLORS = ["#c9922f", "#7fb2a1", "#d19a66", "#a8c479"]; // gold, sage, orange, green

interface Series {
  label: string;
  buffer: RingBuffer<number>;
  color: string;
}

export function SerialPlotter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seriesRef = useRef<Map<string, Series>>(new Map());
  const [seriesList, setSeriesList] = useState<string[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const unlisten = serialApi.onLine((line) => {
      const samples = parseNumericLine(line.text);
      for (const s of samples) {
        let series = seriesRef.current.get(s.label);
        if (!series && seriesRef.current.size < 4) {
          series = {
            label: s.label,
            buffer: new RingBuffer<number>(MAX_SAMPLES),
            color: SERIES_COLORS[seriesRef.current.size],
          };
          seriesRef.current.set(s.label, series);
          setSeriesList(Array.from(seriesRef.current.keys()));
        }
        series?.buffer.push(s.value);
      }
    });

    function draw() {
      const canvas = canvasRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
      const ctx = canvas.getContext("2d")!;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Find min/max across all series
      let min = Infinity, max = -Infinity;
      for (const s of seriesRef.current.values()) {
        for (const v of s.buffer.toArray()) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      if (min === Infinity) { // no data
        ctx.fillStyle = "#8a8680";
        ctx.font = "11px 'Instrument Sans', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Plotter — send numbers from Serial.println() to see the graph.", w / 2, h / 2);
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const pad = (max - min) * 0.1 || 1;
      const yMin = min - pad;
      const yMax = max + pad;
      const yRange = yMax - yMin || 1;

      // Draw grid
      ctx.strokeStyle = "#1f1e1a";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = (i / 4) * h;
        ctx.beginPath();
        ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      // Y-axis labels
      ctx.fillStyle = "#5a5650";
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.textAlign = "left";
      for (let i = 0; i <= 4; i++) {
        const val = yMax - (i / 4) * yRange;
        ctx.fillText(val.toFixed(2), 4, (i / 4) * h + 10);
      }

      // Draw each series
      for (const s of seriesRef.current.values()) {
        const arr = s.buffer.toArray();
        if (arr.length < 2) continue;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < arr.length; i++) {
          const x = (i / (MAX_SAMPLES - 1)) * w;
          const y = h - ((arr[i] - yMin) / yRange) * h;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      unlisten.then(fn => fn());
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function clearAll() {
    seriesRef.current.clear();
    setSeriesList([]);
  }

  return (
    <div class="sp">
      <div class="sp-toolbar">
        {seriesList.map((lbl, i) => (
          <span class="sp-legend">
            <span class="sp-legend-dot" style={{ background: SERIES_COLORS[i] }} />
            {lbl}
          </span>
        ))}
        <div class="sp-spacer" />
        <button class="sp-clear" onClick={clearAll}>clear</button>
      </div>
      <canvas ref={canvasRef} class="sp-canvas" />
    </div>
  );
}
```

- [ ] **Step 2: Write SerialPlotter.css**

```css
.sp { display: flex; flex-direction: column; height: 100%; }
.sp-toolbar {
  display: flex; gap: 14px; align-items: center;
  padding: 6px 0 8px; font-size: 10px; font-family: var(--font-ui);
}
.sp-legend { color: var(--text); display: inline-flex; align-items: center; gap: 6px; }
.sp-legend-dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.sp-spacer { flex: 1; }
.sp-clear { color: var(--accent-gold); font-size: 10px; background: transparent; }
.sp-canvas {
  flex: 1; width: 100%; height: 100%;
  background: var(--panel-alt); border-radius: 3px;
  border: 1px solid var(--border-subtle);
  display: block;
}
```

- [ ] **Step 3: Wire into BottomPanel**

```tsx
import { SerialPlotter } from "./SerialPlotter";
// ...
{bottomPanelTab.value === "plotter" && <SerialPlotter />}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/SerialPlotter.tsx src/components/SerialPlotter.css src/components/BottomPanel.tsx
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "feat: SerialPlotter with 60fps canvas rendering, 4 series"
```

---

## Task 3: Smoke test + tag

- [ ] **Step 1: Create a test sketch**

Upload this to the board:
```cpp
void setup() { Serial.begin(115200); }
unsigned long t = 0;
void loop() {
  float x = sin(millis() / 500.0);
  float y = cos(millis() / 500.0);
  Serial.print("x:"); Serial.print(x);
  Serial.print(" y:"); Serial.println(y);
  delay(20);
}
```

- [ ] **Step 2: Run IDE, open Serial Monitor, connect, then switch to Plotter tab**

Expected: live sine + cosine waves scrolling. Gold line (x) and sage line (y). Legend shows "x" and "y" with matching dots.

- [ ] **Step 3: Tag**

```bash
git tag -a phase11-plotter -m "Phase 11 complete: Serial Plotter with 4-series support"
```

---

## Self-Review

- ✅ Numeric parser handles labeled, CSV, plain number cases
- ✅ Ring buffer, 2000-sample capacity
- ✅ Canvas renders at 60fps (requestAnimationFrame)
- ✅ 4 series with distinct colors
- ⏭ Export data as CSV — deferred
- ⏭ Pause button — deferred

---

*End of Phase 11. Next: Phase 12 — Settings + ⌘K command palette + optional LSP.*
