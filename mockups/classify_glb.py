"""
Headless Blender pass over a CAD-exported GLB.
  - Classifies every mesh by size/position heuristics
  - Renames meshes with semantic names (pcb, shield, usbc, header_pin_###, smd_###, ...)
  - Applies a Principled BSDF per class (real PBR colors bake into the GLB)
  - Exports back to a new GLB

Run:
  blender --background --python classify_glb.py -- <input.glb> <output.glb>
"""
import bpy
import sys
import mathutils

# ---- parse CLI args (after the standalone '--') ----
argv = sys.argv
argv = argv[argv.index('--') + 1:] if '--' in argv else []
INPUT_GLB  = argv[0] if len(argv) > 0 else ''
OUTPUT_GLB = argv[1] if len(argv) > 1 else INPUT_GLB.replace('.glb', '_named.glb')
if not INPUT_GLB:
    print('[ERROR] Usage: blender --background --python classify_glb.py -- <in.glb> <out.glb>')
    sys.exit(1)

# ---- clear default scene ----
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

# ---- import ----
print(f'[IMPORT] {INPUT_GLB}')
bpy.ops.import_scene.gltf(filepath=INPUT_GLB)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
print(f'[IMPORT] {len(meshes)} mesh objects loaded')

def world_bounds(obj):
    corners = [obj.matrix_world @ mathutils.Vector(c[:]) for c in obj.bound_box]
    mn = mathutils.Vector((min(p.x for p in corners),
                           min(p.y for p in corners),
                           min(p.z for p in corners)))
    mx = mathutils.Vector((max(p.x for p in corners),
                           max(p.y for p in corners),
                           max(p.z for p in corners)))
    size = mx - mn
    ctr  = (mn + mx) / 2.0
    return mn, mx, size, ctr

# ---- overall scene bounds (to find board base Z) ----
all_bounds = [world_bounds(o) for o in meshes]
scene_min_z = min(b[0].z for b in all_bounds)

# ---- PBR palette (linear-ish sRGB values for base color) ----
PALETTES = {
    # "Razer minimal" — muted, neutral, metallic. One-color-per-part, subtle tonal variation.
    'pcb':         {'color': (0.018, 0.020, 0.024, 1.0), 'metal': 0.08, 'rough': 0.52},  # matte black PCB w/ subtle sheen
    'shield':      {'color': (0.52,  0.54,  0.57,  1.0), 'metal': 0.92, 'rough': 0.38},  # brushed aluminum
    'usbc':        {'color': (0.35,  0.37,  0.40,  1.0), 'metal': 0.80, 'rough': 0.45},  # unknown component (user will rename)
    'usb_c_port':  {'color': (0.48,  0.50,  0.53,  1.0), 'metal': 0.95, 'rough': 0.30},  # real USB-C port (merged SMDs)
    'header_pin':  {'color': (0.58,  0.46,  0.22,  1.0), 'metal': 0.88, 'rough': 0.40},  # muted tarnished gold
    'header_base': {'color': (0.030, 0.030, 0.034, 1.0), 'metal': 0.10, 'rough': 0.80},  # matte near-black
    'pin_header_bar':{'color': (0.045, 0.045, 0.048, 1.0), 'metal': 0.20, 'rough': 0.75},# black plastic header block
    # SMD sub-types (kept neutral, no bright color)
    'button':      {'color': (0.42,  0.44,  0.47,  1.0), 'metal': 0.90, 'rough': 0.40},  # dark silver
    'rgb_led':     {'color': (0.72,  0.72,  0.74,  1.0), 'metal': 0.05, 'rough': 0.35},
    'vreg':        {'color': (0.040, 0.040, 0.045, 1.0), 'metal': 0.30, 'rough': 0.62},
    'ic_small':    {'color': (0.040, 0.040, 0.045, 1.0), 'metal': 0.30, 'rough': 0.62},
    'status_led':  {'color': (0.18,  0.18,  0.20,  1.0), 'metal': 0.15, 'rough': 0.45},  # neutral, no amber
    'crystal':     {'color': (0.45,  0.47,  0.50,  1.0), 'metal': 0.82, 'rough': 0.40},
    'cap':         {'color': (0.42,  0.33,  0.16,  1.0), 'metal': 0.20, 'rough': 0.55},  # muted dark amber
    'smd':         {'color': (0.055, 0.055, 0.058, 1.0), 'metal': 0.25, 'rough': 0.70},
}

def make_material(part_type):
    """Create or fetch a Principled BSDF material for the given part type."""
    mat_name = f'fb_{part_type}'
    if mat_name in bpy.data.materials:
        return bpy.data.materials[mat_name]
    mat = bpy.data.materials.new(name=mat_name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf is None:
        return mat
    p = PALETTES[part_type]
    bsdf.inputs['Base Color'].default_value = p['color']
    if 'Metallic'  in bsdf.inputs: bsdf.inputs['Metallic'].default_value  = p['metal']
    if 'Roughness' in bsdf.inputs: bsdf.inputs['Roughness'].default_value = p['rough']
    return mat

# ---- classify every mesh ----
counter = {k: 0 for k in PALETTES.keys()}

def classify(obj, bounds):
    mn, mx, size, ctr = bounds
    # Sort dims so classification is axis-independent
    dims = sorted([size.x, size.y, size.z])  # [smallest, middle, largest]
    d_min, d_mid, d_max = dims
    aspect_flat = d_max / max(d_min, 1e-6)
    aspect_long = d_max / max(d_mid, 1e-6)
    aspect_square = d_mid / max(d_max, 1e-6)  # 1.0 = square footprint

    # Pin header bar — long narrow tall block (the black plastic blocks on PCB edges)
    if d_max > 35 and 5 < d_mid < 15 and d_min < 4:
        return 'pin_header_bar'
    # PCB — biggest footprint, very flat, WIDE
    if d_max > 40 and d_min < 3 and d_mid > 15:
        return 'pcb'
    # Shield / ESP32 RF can — medium-large box
    if d_max > 10 and d_mid > 5 and d_min > 1:
        return 'shield'
    # USB-C — medium block
    if d_max > 4 and d_max < 10 and d_min > 0.8 and d_min < 3:
        return 'usbc'
    # Pin header — small, square-ish
    if d_max < 2 and d_min > 0.3 and aspect_long < 3:
        return 'header_pin'
    # Header plastic base — long thin bar
    if d_min < 1.5 and d_max > 10 and aspect_flat > 5:
        return 'header_base'

    # ---- SMD SUB-TYPES (size-based educated guesses) ----
    # Tactile button — roughly cubic, 2.5-4mm per side, tallish (has plunger)
    if 2.5 <= d_max <= 4.5 and 2.0 <= d_mid <= 4.5 and d_min >= 1.2 and aspect_square > 0.6:
        return 'button'
    # RGB LED (WS2812B-style) — flat 5mm square
    if 4.5 <= d_max <= 6.0 and 4.0 <= d_mid <= 6.0 and d_min <= 2.0 and aspect_square > 0.7:
        return 'rgb_led'
    # Voltage regulator SOT-223 — flat rectangle ~6.5x7mm
    if 6.0 <= d_max <= 8.0 and 2.5 <= d_mid <= 4.5 and d_min <= 2.0:
        return 'vreg'
    # Voltage reg / small IC SOT-23 — 2.8x1.6mm footprint
    if 2.8 <= d_max <= 3.5 and 1.3 <= d_mid <= 2.0 and d_min <= 1.2:
        return 'ic_small'
    # Status LED (0603 package) — tiny, ~1.6x0.8mm flat
    if 1.4 <= d_max <= 2.0 and d_mid <= 1.2 and d_min <= 0.5:
        return 'status_led'
    # Crystal / resonator — 3.2x2.5mm metal can
    if 3.0 <= d_max <= 5.2 and 2.2 <= d_mid <= 3.6 and d_min <= 2.0 and aspect_square < 0.85:
        return 'crystal'
    # Capacitor, tantalum, or large SMD cap — ~3x1.2mm
    if 3.0 <= d_max <= 4.5 and 1.0 <= d_mid <= 2.0 and d_min <= 2.0:
        return 'cap'

    # Fallback — generic SMD
    return 'smd'

print('[CLASSIFY]')
for obj, bounds in zip(meshes, all_bounds):
    part = classify(obj, bounds)
    counter[part] += 1
    new_name = f'{part}_{counter[part]:03d}' if counter[part] > 1 or part in ('smd', 'header_pin', 'header_base') else part
    obj.name = new_name
    # Apply material
    mat = make_material(part)
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    sz = bounds[2]
    print(f'   {new_name:<22}  part={part:<12}  size=({sz.x:6.2f}, {sz.y:6.2f}, {sz.z:6.2f}) mm')

# ---- summary ----
print('\n[SUMMARY]')
for k, v in counter.items():
    print(f'   {k:<14}  {v}')

# ---- JOIN meshes of the same type into one (so USB-C, processor, PCB are single meshes) ----
# This solves the "one part split across many meshes" CAD-export problem.
print('\n[JOIN]')

# ---- PROXIMITY PASS: header_pins inside the shield's bbox become 'processor_pad' ----
# (So only ESP32 module castellated pads join the processor — PCB pads stay separate.)
print('\n[PROXIMITY]')
shield_objs = [o for o in bpy.data.objects if o.name.startswith('shield') and o.type == 'MESH']
if shield_objs:
    sh_min = [float('inf')] * 3
    sh_max = [float('-inf')] * 3
    for so in shield_objs:
        corners = [so.matrix_world @ mathutils.Vector(c[:]) for c in so.bound_box]
        for p in corners:
            for i in range(3):
                sh_min[i] = min(sh_min[i], p[i])
                sh_max[i] = max(sh_max[i], p[i])
    MARGIN = 0.5  # mm of expansion around shield to catch pads hugging its edge
    for i in range(3):
        sh_min[i] -= MARGIN
        sh_max[i] += MARGIN
    reclass = 0
    for obj in list(bpy.data.objects):
        if not obj.name.startswith('header_pin_') or obj.type != 'MESH':
            continue
        corners = [obj.matrix_world @ mathutils.Vector(c[:]) for c in obj.bound_box]
        cx = sum(p.x for p in corners) / len(corners)
        cy = sum(p.y for p in corners) / len(corners)
        cz = sum(p.z for p in corners) / len(corners)
        if (sh_min[0] <= cx <= sh_max[0] and
            sh_min[1] <= cy <= sh_max[1] and
            sh_min[2] <= cz <= sh_max[2]):
            obj.name = obj.name.replace('header_pin_', 'processor_pad_')
            reclass += 1
    print(f'   {reclass} header_pins inside shield bbox reclassified as processor_pad')

PARTS_TO_JOIN = {
    'pcb':             'pcb',
    'shield':          'processor',
    'processor_pad':   'processor_pads',   # ESP32 module's own castellated pads
    'header_pin':      'header_pins',      # remaining PCB gold pads (away from processor)
    'header_base':     'header_bases',
    'pin_header_bar':  'pin_headers',
    'button':          'buttons',
    'cap':             'caps',
    'status_led':      'status_leds',
}

# Group current objects by part prefix (name like "shield_003" → "shield")
import re
groups = {}
for obj in bpy.data.objects:
    if obj.type != 'MESH': continue
    m = re.match(r'([a-z_]+?)(?:_\d+)?$', obj.name)
    prefix = m.group(1) if m else obj.name
    groups.setdefault(prefix, []).append(obj)

for prefix, new_name in PARTS_TO_JOIN.items():
    objs = groups.get(prefix, [])
    if len(objs) < 2:
        # Only one mesh - just rename to the final name
        if objs:
            objs[0].name = new_name
            print(f'   {prefix}: 1 mesh → renamed to {new_name}')
        continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    bpy.context.view_layer.objects.active.name = new_name
    print(f'   {prefix}: {len(objs)} meshes joined → {new_name}')

# ---- USER-REQUESTED FINAL MERGES (consolidate per user inspection) ----
# Anything the user identified as actually being part of a bigger component.
FINAL_MERGES = {
    # ESP32-S3 module = RF shield + own pads + substrate base (all part of the module).
    'processor': ['processor', 'processor_pads', 'header_bases'],
    # What the classifier called "status_leds" + all loose smd_001..028 are actually
    # the USB-C port assembly (many small internal pieces).
    'usb_c_port': ['status_leds'] + [f'smd_{i:03d}' for i in range(1, 29)],
    # The original 4 "usbc"-classified meshes stay separate (user will rename them).
    # The big edge pin headers (pin_headers) stay separate.
}

print('\n[FINAL-MERGE]')
for target_name, source_names in FINAL_MERGES.items():
    objs = [bpy.data.objects.get(n) for n in source_names]
    objs = [o for o in objs if o is not None and o.type == 'MESH']
    if len(objs) < 2:
        if objs:
            objs[0].name = target_name
            print(f'   {target_name}: 1 mesh → renamed (no merge needed)')
        continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    result = bpy.context.view_layer.objects.active
    result.name = target_name
    # Apply fresh material matching the final name (if we have a palette for it)
    if target_name in PALETTES:
        mat = make_material(target_name)
        result.data.materials.clear()
        result.data.materials.append(mat)
    print(f'   {target_name}: merged {len(objs)} meshes → {target_name}')

# ---- CENTER ON ORIGIN ----
# Compute combined bounding box across all remaining mesh objects, then translate
# everything so the center sits at (0, 0, 0).
print('\n[CENTER]')
all_objs = [o for o in bpy.data.objects if o.type == 'MESH']
if all_objs:
    mins = [float('inf')] * 3
    maxs = [float('-inf')] * 3
    for obj in all_objs:
        corners = [obj.matrix_world @ mathutils.Vector(c[:]) for c in obj.bound_box]
        for p in corners:
            mins[0] = min(mins[0], p.x); maxs[0] = max(maxs[0], p.x)
            mins[1] = min(mins[1], p.y); maxs[1] = max(maxs[1], p.y)
            mins[2] = min(mins[2], p.z); maxs[2] = max(maxs[2], p.z)
    cx = (mins[0] + maxs[0]) / 2
    cy = (mins[1] + maxs[1]) / 2
    cz = (mins[2] + maxs[2]) / 2
    print(f'   Combined center before recenter: ({cx:.3f}, {cy:.3f}, {cz:.3f})')
    # Move each object by -center
    for obj in all_objs:
        obj.location.x -= cx
        obj.location.y -= cy
        obj.location.z -= cz
    # Apply transforms so translation bakes into geometry
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    print(f'   Translated by (-{cx:.3f}, -{cy:.3f}, -{cz:.3f}) — centered on origin.')

# ---- export ----
bpy.ops.object.select_all(action='SELECT')
print(f'\n[EXPORT] {OUTPUT_GLB}')
bpy.ops.export_scene.gltf(
    filepath=OUTPUT_GLB,
    export_format='GLB',
    export_materials='EXPORT',
    export_apply=True,
    use_selection=False,
)
print('[DONE]')
