# Forge Board product pages — B3 wireframe redesign

Date: 2026-04-17

## Goal
Replace the photoreal CAD look on product pages with an animated amber wireframe
(technical-illustration) aesthetic — Teenage Engineering / Arduino-datasheet tier.

## Scope
- `mockups/product-beginner.html` — overwritten
- `mockups/product-intermediate.html` — overwritten
- `mockups/hero-b-arduino.html` (landing) — **untouched**
- Current production files backed up as `.bak` before overwrite.

## Decision log
1. Chose **Option B** (technical illustration) over photoreal (A), cel-shade hybrid
   (C), and 2D-only (D) during brainstorm. Rationale: on-brand (TE/Flipper),
   differentiated, lower effort than faking a real PCB from the CAD GLB.
2. Chose **B3** over B1/B2: keep the 3D GLB for scroll animation (camera tumbles
   between states), let the "designed SVG" treatment layer in state 5 only.
3. Approved live via `product-beginner-wireframe.html` prototype on 2026-04-17.

## Architecture — rendering pipeline
- `MeshBasicMaterial({ color: 0x000000, polygonOffset: true })` replaces every
  PBR material — invisible on the black background, purely for occlusion.
- `EdgesGeometry(mergedGeometry, 30)` + `LineBasicMaterial({ color: 0xffa600 })`
  added as a child of every mesh. 1px WebGL hairlines.
- Pin headers use a dimmer/lower-opacity line material (0.55 vs 0.95) so the
  16×2 pin array reads as density, not a solid block.
- `BufferGeometryUtils.mergeVertices` collapses STEP-tessellator split verts so
  the 30° angle threshold actually culls redundant edges.

## Removed from the scene
- `PMREMGenerator` + `RoomEnvironment` (no env map needed for edges-only render)
- `UnrealBloomPass`, `EffectComposer`, related shaders
- `HemisphereLight`, 3× `DirectionalLight`, shadow maps
- `MeshStandardMaterial` + STYLE palette
- `renderer.physicallyCorrectLights`, ACES tone mapping
- Direct `renderer.render(scene, camera)` — no composer

## Kept
- Scroll-driven GSAP camera timeline (hero → top-down → CTA → exploded)
- Part-group classification by `fb_*` material name
- State-5 part-lift animation (processor up, USB-C up-out, pins down, etc.)
- 5-callout system with mono labels + amber leader lines

## Visual tokens
- Grid overlay: amber @ 9% opacity, 60px pitch (replaces production white @ 2.5%)
- Corner marks: amber @ 55% (from 40%)
- Callout sub-text: switched from `#8a8e95` grey → amber `#FFA600` for consistency
- Nav logo subtitle: "Beginner" / "Intermediate" (unchanged)

## Out of scope (not doing now)
- Landing page PNG replacement (PNGs stay)
- Nuxt 3 migration
- Separate designed-SVG overlay for state 5 (prototype approval was for the
  3D-only exploded view — can be added later without changing architecture)
- Photoreal texture work (rejected)
- Hand-crafted SVG state frames (rejected)

## Risks & follow-ups
- `forgeboard_intermediate.glb` hasn't been eyeballed recently. If material names
  differ from the beginner GLB the classification map may need updates.
- 1px WebGL hairlines disappear at very small SMD sizes in the pulled-back CTA
  state. Acceptable — they're background texture at that camera distance.
- Intermediate page callouts currently mirror the beginner set. If the user
  wants sensor-specific callouts (DHT11/LDR/IR/BMS), that's a separate edit.
