# ForgeBoard IDE — Phase 7: Smart Help Content (500 entries)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Prerequisite: `phase6-smart-help-framework`.

**Goal:** Write the ~500 curated YAML entries that make Smart Help genuinely useful. This phase is ~80% content authoring + 20% plumbing (category directory scaffolding, snapshot tests, publish-to-GitHub prep).

**Architecture:** Content-only phase. Files live in `content/smart-help/<category>/<slug>.yaml`. Snapshot tests in `tests/snapshots/` validate that specific broken sketches produce expected findings.

---

## Target breakdown

| Category | Count | Notes |
|----------|-------|-------|
| syntax | 60 | Missing `;`, braces, parens, unterminated strings |
| types | 40 | Function arg mismatch, narrowing conversions, const violations |
| api-misuse | 80 | Serial/pinMode/Wire/Servo misordering, missing begin() calls |
| logic | 100 | Blocking in ISR, delay() in loop, `=` vs `==`, unreachable code |
| board-specific | 120 | 10 boards × 12 entries avg (bootstrap pins, reserved GPIOs, ADC limits) |
| performance | 40 | String concat in loop, dynamic alloc, float math on AVR |
| memory | 30 | Oversized globals, deep recursion, stack risks |
| hardware | 30 | PWM channel limits, I²C conflicts, pin doesn't exist |
| **TOTAL** | **500** | |

---

## Task 1: Scaffold category directories + tests infrastructure

**Files:** Create directory skeleton; create `tests/snapshots/` + test harness.

- [ ] **Step 1: Create directory tree**

```bash
cd content/smart-help
mkdir -p syntax types api-misuse logic board-specific performance memory hardware
cd ../..
mkdir -p tests/snapshots/fixtures tests/snapshots/expected
```

- [ ] **Step 2: Write snapshot test harness**

`tests/snapshots/smart-help.spec.ts`:

```typescript
import fs from "fs";
import path from "path";
import { invoke } from "@tauri-apps/api/core";
import { describe, it, expect, beforeAll } from "vitest";

// This test runs only in Tauri dev context. For unit CI, use a Rust-side test instead.

const FIXTURE_DIR = "tests/snapshots/fixtures";
const EXPECTED_DIR = "tests/snapshots/expected";

describe("Smart Help snapshot tests", () => {
  const fixtures = fs.readdirSync(FIXTURE_DIR).filter(f => f.endsWith(".ino"));
  fixtures.forEach((fix) => {
    it(`fixture ${fix} produces expected findings`, async () => {
      const code = fs.readFileSync(path.join(FIXTURE_DIR, fix), "utf8");
      const findings = await invoke("smart_help_analyze", {
        code, board: "forgeboard-beginner",
      });
      const expectedPath = path.join(EXPECTED_DIR, fix.replace(".ino", ".json"));
      const expected = fs.existsSync(expectedPath)
        ? JSON.parse(fs.readFileSync(expectedPath, "utf8"))
        : [];
      expect(findings).toMatchObject(expected);
    });
  });
});
```

- [ ] **Step 3: Rust-side snapshot tests (preferred, no Tauri runtime needed)**

Append to `src-tauri/src/smart_help/analyzer.rs`:

```rust
#[cfg(test)]
mod snapshot_tests {
    use super::*;
    use crate::smart_help::loader;
    use std::path::PathBuf;

    fn load_for_tests() -> Analyzer {
        let db = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources/smart-help.db");
        let entries = loader::load_all(&db).unwrap_or_default();
        Analyzer::new(entries)
    }

    #[test]
    fn fixture_missing_semi_triggers_finding() {
        let a = load_for_tests();
        let code = "void setup() {\n  pinMode(2, OUTPUT)\n  if (1) {}\n}";
        let f = a.analyze(code, "forgeboard-beginner");
        assert!(f.iter().any(|x| x.category == "syntax"), "expected a syntax finding, got: {:?}", f);
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add content/smart-help/ tests/snapshots/ src-tauri/src/smart_help/analyzer.rs
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "test: snapshot test harness for Smart Help fixtures"
```

---

## Task 2: Author batch 1 — Syntax (60 entries)

Each entry is ~20 lines of YAML. Estimate 2-3 min per entry = 2-3 hours for all 60.

- [ ] **Step 1: Generate the list of entries to write**

Syntax category coverage (60 entries). Write each as a separate .yaml file in `content/smart-help/syntax/`:

1. `missing-semicolon-before-if.yaml` (already exists from Phase 6)
2. `missing-semicolon-before-for.yaml`
3. `missing-semicolon-before-while.yaml`
4. `missing-semicolon-before-return.yaml`
5. `missing-semicolon-before-closing-brace.yaml`
6. `missing-closing-brace-function.yaml`
7. `missing-closing-brace-if.yaml`
8. `missing-closing-brace-loop.yaml`
9. `missing-opening-brace.yaml`
10. `unterminated-string-single-quote.yaml`
11. `unterminated-string-double-quote.yaml`
12. `unterminated-block-comment.yaml`
13. `stray-single-quote.yaml`
14. `stray-backtick.yaml`
15. `extra-semicolon-after-if.yaml`
16. `extra-semicolon-after-for.yaml`
17. `extra-semicolon-after-while.yaml`
18. `extra-comma-in-arg-list.yaml`
19. `missing-comma-in-arg-list.yaml`
20. `mismatched-paren-count.yaml`
21. `mismatched-bracket-count.yaml`
22. `mismatched-brace-count.yaml`
23. `preprocessor-directive-wrong-case.yaml` (`#Include` vs `#include`)
24. `preprocessor-directive-trailing-semi.yaml` (`#include <x>;`)
25. `include-missing-angles.yaml` (`#include x` without `<>` or `""`)
26. `include-wrong-quotes.yaml` (`#include "<x>"`)
27. `define-wrong-case.yaml`
28. `ifdef-missing-endif.yaml`
29. `ifdef-mismatched-else.yaml`
30. `typedef-missing-semicolon.yaml`
31. `struct-missing-semicolon.yaml`
32. `enum-missing-semicolon.yaml`
33. `class-missing-semicolon.yaml` (C++)
34. `namespace-missing-closing-brace.yaml`
35. `arrow-operator-missing-type.yaml`
36. `double-dot-operator.yaml`
37. `triple-equals-wrong.yaml` (JS habit)
38. `null-keyword-wrong.yaml` (should be NULL / nullptr)
39. `true-capitalized-wrong.yaml` (True/TRUE — case matters)
40. `statement-outside-function.yaml`
41. `return-outside-function.yaml`
42. `multiple-statements-no-semicolons.yaml`
43. `hex-literal-missing-prefix.yaml`
44. `binary-literal-wrong.yaml` (`10b` vs `0b10`)
45. `suffix-wrong-case.yaml` (`10UL` vs `10ul` — stylistic)
46. `ternary-missing-colon.yaml`
47. `ternary-nested-unclear.yaml`
48. `array-init-missing-braces.yaml`
49. `string-concat-missing-plus.yaml`
50. `function-decl-missing-return-type.yaml`
51. `function-def-missing-body.yaml`
52. `function-call-missing-parens.yaml`
53. `method-call-wrong-dot.yaml` (`a->b` vs `a.b` on object)
54. `multiple-assignment-unclear.yaml` (`a = b = c;`)
55. `lambda-missing-arrow.yaml` (C++11)
56. `template-angle-mismatch.yaml`
57. `string-escape-wrong.yaml` (`\h` not valid)
58. `octal-literal-accidental.yaml` (`010` being octal)
59. `missing-include-main-header.yaml` (no Arduino.h)
60. `multiple-main-ino-files.yaml`

- [ ] **Step 2: Author template**

Every entry follows this pattern. Example for #2:

```yaml
# content/smart-help/syntax/missing-semicolon-before-for.yaml
id: syntax.missing-semicolon.before-for
category: syntax
severity: error
confidence: high
boards: []
patterns:
  - regex: '\w\s*\)[^;{]*\n\s*for\s*\('
title: "Missing semicolon before for loop"
explanation: "Every C++ statement ends with a semicolon. Looks like you're missing one before a for loop."
tags: [semicolon, syntax, for]
```

For each of the 60 above, author a similar YAML file. Batch commit after every 10.

- [ ] **Step 3: Rebuild SQLite**

```bash
pnpm build:smart-help
```

Expected: `Compiled 60 entries → src-tauri/resources/smart-help.db`.

- [ ] **Step 4: Commit**

```bash
git add content/smart-help/syntax/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "content: 60 syntax entries for Smart Help"
```

---

## Task 3: Author batch 2 — Types (40 entries)

Covers function arg mismatch, narrowing conversions, pointer vs value confusion, const violations, String↔int mixing.

Same pattern as Task 2. Entries in `content/smart-help/types/`:

1-10: arg-type mismatches (passing char* where int expected, etc.)
11-20: narrowing conversions (float→int truncation)
21-30: pointer/value confusion (`*p = 5` vs `p = 5`)
31-40: const-correctness issues

**Example entry:**
```yaml
id: types.arg-mismatch.int-expected-string
category: types
severity: warning
confidence: medium
boards: []
patterns:
  - regex: 'delay\s*\(\s*"'
title: "delay() expects a number, not a string"
explanation: "The delay() function takes an unsigned long (milliseconds). Passing a string like \"500\" is usually a mistake — use 500 without quotes."
tags: [delay, types, number-vs-string]
```

- [ ] **Authors 40 entries following the pattern.**
- [ ] **Rebuild + commit.**

---

## Task 4: Author batch 3 — API misuse (80 entries)

The most value-add category. Entries in `content/smart-help/api-misuse/`.

**Coverage:**
- Serial: `print` before `begin`, wrong baud, print-heavy in ISR (10 entries)
- Wire (I²C): `requestFrom` before `begin`, missing `beginTransmission`/`endTransmission` pair (10)
- SPI: missing `begin`, wrong mode (8)
- Servo: `write` before `attach`, writing >180 (8)
- pinMode: called in `loop` instead of `setup`, forgotten entirely (8)
- WiFi: `connect` before `begin`, no status check (8)
- analogRead: on non-ADC pin, `analogReference` after read (6)
- EEPROM: missing `begin` on ESP, exceeding size (6)
- FastLED: `addLeds` in loop, `show` not called (8)
- Adafruit GFX: `begin` missing, wrong resolution (8)

**Example:**
```yaml
id: api-misuse.serial.print-before-begin
# (already exists from Phase 6)

id: api-misuse.wire.request-before-begin
category: api-misuse
severity: warning
confidence: high
boards: []
patterns:
  - regex: 'Wire\.requestFrom\('
title: "Wire.requestFrom called — did you call Wire.begin()?"
explanation: "Before any I²C read/write, Wire.begin() must run in setup(). Calling requestFrom without it returns garbage."
tags: [i2c, wire, begin]
```

Write 80 entries.

---

## Task 5: Author batch 4 — Logic bugs (100 entries)

The highest-leverage category — these are bugs that compile fine but run wrong.

**Coverage:**
- `=` instead of `==` in `if/while` (5 variants per control structure)
- `delay()` inside ISR (attachInterrupt handlers)
- Blocking calls in `loop()` preventing WiFi/BT service
- Unreachable code after `return`
- Always-true conditions (`if (1)`, `if (someVar)` where var is constant)
- Infinite `while (1)` without break
- Integer overflow in time diffs (`millis() - oldTime` with wraparound)
- Off-by-one in array bounds
- Array index overflow (`leds[NUM_LEDS]` not `NUM_LEDS-1`)
- Uninitialized variable use
- Shadow variables (local shadows global)
- Dead assignments
- Missing break in switch cases (fall-through)
- Default missing in switch
- `continue` in `do-while` confusion

Write 100 entries.

---

## Task 6: Author batch 5 — Board-specific (120 entries across 10 boards)

This category is the most technically detailed — requires referencing each board's datasheet for pin maps, flash layouts, boot-strap warnings, interrupt capabilities.

Boards covered (per-board subdirectories):
- `forgeboard-beginner/` (ESP32-S3 based)
- `forgeboard-intermediate/`
- `esp32-generic/`
- `esp32-s3-generic/`
- `esp8266/`
- `arduino-uno/`
- `arduino-nano/`
- `arduino-mega2560/`
- `rp2040/` (Raspberry Pi Pico)
- `teensy-4x/`

~12 entries per board. Examples per board:
- GPIO bootstrap warnings (2-3 entries)
- Reserved GPIOs (flash, USB, crystal) — 2-3 entries
- ADC channel limits + input voltage range (1-2)
- PWM channel limits (1)
- Interrupt-capable pins (1-2)
- I²C/SPI default pins (1)
- Memory size / heap limits (1)
- Flash layout / partition warnings (1)

**Example ESP32-S3 reserved-flash-pins entry:**
```yaml
id: board-specific.esp32-s3.gpio-6-to-11-flash
category: board-specific
severity: error
confidence: high
boards: [esp32-s3-generic, forgeboard-beginner, forgeboard-intermediate]
patterns:
  - regex: 'pinMode\s*\(\s*([6-9]|10|11)\s*,'
title: "GPIO 6-11 are connected to internal SPI flash on ESP32-S3"
explanation: "These pins must not be used as general I/O — they're wired to the SPI flash chip. Using them causes crashes or bricked programs. Use any other GPIO."
tags: [esp32-s3, gpio, flash, reserved]
```

Write 120 entries.

---

## Task 7: Author batch 6 — Performance, Memory, Hardware (100 entries)

Three smaller categories to wrap up. ~33 entries each.

**Performance (40 total, 33 remaining):**
- String concat in `loop()` (fragments heap)
- Dynamic allocation (`new`, `malloc`) after setup
- Float math on AVR (no FPU, slow)
- `printf`-style in loop (format overhead)
- Repeatedly calling expensive sensor reads
- Not using direct port manipulation where speed matters

**Memory (30):**
- Oversized global arrays
- Stack: deep recursion
- Missing `PROGMEM` for large constants on AVR
- `String` usage generally (vs char arrays on small devices)
- Memory leaks (not `free`ing malloc'd)

**Hardware (30):**
- Too many PWM channels requested (ESP32: 16, Uno: 6)
- I²C address conflicts (0x3C used by both SSD1306 and some sensors)
- ADC pin doesn't exist on this package
- SPI bus shared with SD card + display without CS coordination
- Voltage mismatch (3.3V sensor on 5V pin)

Write 100 entries across these three.

---

## Task 8: Test coverage — 20 snapshot fixtures

**Files:** `tests/snapshots/fixtures/*.ino`, `tests/snapshots/expected/*.json`

- [ ] **Step 1: Create 20 intentionally-broken sketches**

Each fixture demonstrates 1-3 Smart Help triggers. Examples:

`tests/snapshots/fixtures/missing-semi-01.ino`:
```cpp
void setup() {
  pinMode(5, OUTPUT)
  if (1) {}
}
```

`tests/snapshots/fixtures/bootstrap-pin.ino`:
```cpp
void setup() { pinMode(2, OUTPUT); }
```

`tests/snapshots/fixtures/serial-before-begin.ino`:
```cpp
void setup() {
  Serial.println("oops");
  Serial.begin(115200);
}
```

... 17 more covering major categories.

- [ ] **Step 2: Create expected JSON for each**

`tests/snapshots/expected/missing-semi-01.json`:
```json
[
  {
    "id": "syntax.missing-semicolon.before-if",
    "line": 2,
    "severity": "error"
  }
]
```

- [ ] **Step 3: Run the snapshot tests**

```bash
cd src-tauri && cargo test smart_help::analyzer && cd ..
```

Each fixture's Rust test (or JS test if we prefer) should pass.

- [ ] **Step 4: Commit**

```bash
git add tests/snapshots/
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "test: 20 snapshot fixtures for Smart Help regression coverage"
```

---

## Task 9: Publish content repo (open-source)

**Files:** Prep for GitHub publication.

- [ ] **Step 1: Create `content/smart-help/README.md`**

```markdown
# ForgeBoard Smart Help

Curated static-analysis entries for the ForgeBoard IDE. Each entry is a YAML file that pattern-matches against Arduino/C++ source to catch common mistakes.

## Contributing

1. Fork + clone
2. Add a new `.yaml` in the appropriate category
3. Run `pnpm build:smart-help` to compile
4. Run `cargo test smart_help` to verify
5. Submit a PR

See `schema.md` for the entry format.
```

- [ ] **Step 2: License**

`content/smart-help/LICENSE`: MIT license (content is meant to be reused widely).

- [ ] **Step 3: Commit**

```bash
git add content/smart-help/README.md content/smart-help/LICENSE
git -c user.email="av@defenceforgeindustries.com" -c user.name="AV" commit -m "docs: Smart Help content license + contribution guide"
```

---

## Task 10: Smoke test + tag

- [ ] **Step 1: Rebuild SQLite with all 500 entries**

```bash
pnpm build:smart-help
```

Expected: `Compiled 500 entries → src-tauri/resources/smart-help.db`.

- [ ] **Step 2: Run IDE**

```bash
pnpm tauri dev
```

- [ ] **Step 3: Open a known-broken sketch and verify**

Use `tests/snapshots/fixtures/bootstrap-pin.ino`. Expected: sees amber warning on `pinMode(2`.

- [ ] **Step 4: All Rust tests pass**

```bash
cd src-tauri && cargo test && cd ..
```

- [ ] **Step 5: Tag**

```bash
git tag -a phase7-content -m "Phase 7 complete: 500 Smart Help entries + snapshot coverage"
```

---

## Self-Review

- ✅ 500 entries across 8 categories
- ✅ Snapshot tests cover regression cases
- ✅ Content repo ready for GitHub / community PRs
- ⏭ Additional boards — add per-board subdirs as new cores are installed

**Note on bandwidth:** Task 2-7 represent ~3 weeks of content-writing for a solo dev. Each entry averages ~20 lines of YAML + testing. Don't bottleneck on this at the end of the project — start Task 2 in parallel with Phase 6 implementation so content is ready when framework ships.

---

*End of Phase 7. Next: Phase 8 — Boards view (universal board support).*
