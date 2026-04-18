"""
Blender headless: import Wavefront OBJ (from FreeCAD step_to_obj.py),
classify every object by its REAL KiCad part name prefix,
apply PBR materials, merge related parts into semantic groups,
center on origin, export GLB.

Run:
  blender --background --python obj_to_glb.py -- <input.obj> <output.glb>
"""
import bpy
import sys
import re
import mathutils

argv = sys.argv
argv = argv[argv.index('--') + 1:] if '--' in argv else []
INPUT_OBJ  = argv[0] if len(argv) > 0 else ''
OUTPUT_GLB = argv[1] if len(argv) > 1 else INPUT_OBJ.replace('.obj', '.glb')
if not INPUT_OBJ:
    print('[ERROR] Usage: blender --bg --python obj_to_glb.py -- <in.obj> <out.glb>')
    sys.exit(1)

# Wipe scene
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

# Import OBJ — Blender creates one object per 'o' directive
print(f'[IMPORT] {INPUT_OBJ}')
bpy.ops.wm.obj_import(filepath=INPUT_OBJ)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
print(f'[IMPORT] {len(meshes)} objects')

# ---- DEDUPE: remove monolithic assembly containers (NOT first-instance multi-placements) ----
# Two patterns can produce base-name + suffix-001..NNN in KiCad exports:
#   (A) MULTI-PLACEMENT — base + suffixed are each individual component instances
#       (e.g. R_0402 + R_0402001 = two separate resistors). Base is NOT a dup.
#   (B) HIERARCHY — base is a rolled-up assembly, suffixed are its internal sub-parts
#       (e.g. ESP32-S3-WROOM-1 contains ESP32-S3-WROOM-001..028). Base IS a dup.
# Distinguish by VOLUME: in (B), the base is much bigger than each sub-part.
import re as _re
import mathutils as _mu

def _vol(obj):
    corners = [obj.matrix_world @ _mu.Vector(c[:]) for c in obj.bound_box]
    mn = [min(p[i] for p in corners) for i in range(3)]
    mx = [max(p[i] for p in corners) for i in range(3)]
    return (mx[0] - mn[0]) * (mx[1] - mn[1]) * (mx[2] - mn[2])

print('[DEDUPE]')
# Group by stem: stem → list of suffixed variants
stem_variants = {}
for o in meshes:
    m = _re.match(r'^(.*?)(\d{3})$', o.name)
    if m:
        stem_variants.setdefault(m.group(1), []).append(o)

removed = 0
for o in list(meshes):
    n = o.name.lower()
    # Known monolithic that don't follow stem+NNN pattern
    if ('esp32_s3_v' in n and 'wroom' not in n) or n == 'esp32-s3-wroom-1':
        print(f'   [REMOVE] {o.name} (known monolithic)')
        bpy.data.objects.remove(o, do_unlink=True)
        removed += 1
        continue
    # Stem-based dedupe: ONLY if this is the base name AND its volume is >= 3× the avg
    # volume of its suffixed variants → it's a container, not just the first instance
    if o.name in stem_variants:
        variants = stem_variants[o.name]
        if len(variants) < 3:
            continue  # too few sub-parts to confidently call it a hierarchy
        avg_var = sum(_vol(v) for v in variants) / len(variants)
        base_vol = _vol(o)
        if base_vol >= avg_var * 3:
            print(f'   [REMOVE] {o.name} (monolithic container, {len(variants)} sub-parts)')
            bpy.data.objects.remove(o, do_unlink=True)
            removed += 1

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
print(f'   Removed {removed} duplicate(s), {len(meshes)} objects remaining')

# ---- PALETTE (PBR materials — realistic microcontroller board look) ----
PALETTES = {
    'pcb':             {'color': (0.012, 0.014, 0.016, 1.0), 'metal': 0.15, 'rough': 0.42},  # matte black FR-4
    'shield':          {'color': (0.64,  0.66,  0.69,  1.0), 'metal': 0.95, 'rough': 0.28},  # brushed nickel RF can
    'module_substrate':{'color': (0.020, 0.022, 0.026, 1.0), 'metal': 0.12, 'rough': 0.50},  # module FR-4
    'module_internals':{'color': (0.16,  0.12,  0.09,  1.0), 'metal': 0.55, 'rough': 0.45},  # hints of copper
    'usb_c':           {'color': (0.72,  0.74,  0.76,  1.0), 'metal': 0.95, 'rough': 0.24},  # brushed stainless
    'pin_header':      {'color': (0.030, 0.030, 0.032, 1.0), 'metal': 0.15, 'rough': 0.55},  # glossy black plastic
    'button':          {'color': (0.74,  0.76,  0.78,  1.0), 'metal': 0.90, 'rough': 0.30},  # brushed silver cap
    'led':             {'color': (0.95,  0.90,  0.82,  1.0), 'metal': 0.02, 'rough': 0.30},  # clear w/ slight warm
    'rgb_led':         {'color': (0.97,  0.96,  0.94,  1.0), 'metal': 0.02, 'rough': 0.25},  # WS2812 PLCC4 white
    'cap':             {'color': (0.52,  0.42,  0.30,  1.0), 'metal': 0.10, 'rough': 0.75},  # ceramic light brown
    'cap_tantalum':    {'color': (0.82,  0.60,  0.14,  1.0), 'metal': 0.20, 'rough': 0.48},  # amber yellow Kemet
    'resistor':        {'color': (0.18,  0.19,  0.16,  1.0), 'metal': 0.15, 'rough': 0.72},  # dark green-grey
    'diode':           {'color': (0.045, 0.045, 0.048, 1.0), 'metal': 0.35, 'rough': 0.40},  # glossy black
    'ic_small':        {'color': (0.050, 0.050, 0.055, 1.0), 'metal': 0.25, 'rough': 0.58},  # matte IC black
    'fuse':            {'color': (0.40,  0.40,  0.42,  1.0), 'metal': 0.50, 'rough': 0.48},  # grey ceramic
    'smd':             {'color': (0.050, 0.050, 0.055, 1.0), 'metal': 0.25, 'rough': 0.65},
}

def make_material(part_type):
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

# ---- NAME-BASED CLASSIFIER (real KiCad prefixes) ----
def classify_by_name(name):
    n = name.lower()
    # KiCad-style prefix matching (from real footprint names in the STEP file)
    if 'ws2812' in n:                                 return 'rgb_led'       # WS2812B RGB LED
    if 'esp32' in n and 'pcb' not in n:               return 'shield'        # ESP32 module
    if 'esp_32' in n and 'pcb' in n:                  return 'pcb'           # the main board
    if 'pcb' in n:                                    return 'pcb'
    if 'usb_c' in n or 'usb-c' in n or 'usbc' in n:   return 'usb_c'
    if 'pinheader' in n or 'pin_header' in n:         return 'pin_header'
    if 'sw_push' in n or 'tactile' in n:              return 'button'
    if 'fuse' in n:                                   return 'fuse'
    if 'sot-223' in n or 'sot_223' in n:              return 'ic_small'      # voltage reg (SOT-223)
    if 'sot-23' in n or 'sot_23' in n:                return 'ic_small'      # small IC (SOT-23)
    if n.startswith('led_') or '_led' in n:           return 'led'
    if n.startswith('cp_') or 'tantalum' in n or 'kemet' in n: return 'cap_tantalum'
    if n.startswith('c_') or '_cap' in n:             return 'cap'
    if n.startswith('r_') or 'resist' in n:           return 'resistor'
    if n.startswith('d_') or 'diode' in n:            return 'diode'
    return 'smd'

# Strip Blender's .001 .002 disambiguation suffix for clean grouping
STRIP_SUFFIX = re.compile(r'\.\d{3}$')

# ---- 1: classify + apply material ----
print('[CLASSIFY]')
groups = {k: [] for k in PALETTES.keys()}
for obj in meshes:
    base = STRIP_SUFFIX.sub('', obj.name)
    part = classify_by_name(base)
    groups[part].append(obj)

# Apply materials per classification
for gname, objs in groups.items():
    mat = make_material(gname)
    for obj in objs:
        obj.data.materials.clear()
        obj.data.materials.append(mat)

for k, v in groups.items():
    if v:
        print(f'   {k:<18}  {len(v):>4} objects')

# ---- 2: merge groups into single named meshes ----
print('\n[MERGE]')
TARGETS = {
    'pcb':          'pcb',
    'shield':       'processor',     # ALL ESP32 sub-parts → ONE "processor" mesh
    'usb_c':        'usb_c_port',
    'pin_header':   'pin_headers',
    'button':       'buttons',
    'led':          'leds',
    'rgb_led':      'rgb_led',
    'cap':          'caps',
    'cap_tantalum': 'tantalum_caps',
    'resistor':     'resistors',
    'diode':        'diodes',
    'ic_small':     'voltage_reg',
    'fuse':         'fuse',
    'smd':          'smd',
}
for part, target in TARGETS.items():
    objs = groups.get(part, [])
    if not objs:
        continue
    if len(objs) == 1:
        objs[0].name = target
        print(f'   {target:<16}  1 mesh → renamed')
        continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    bpy.context.view_layer.objects.active.name = target
    print(f'   {target:<16}  {len(objs)} meshes joined')

# ---- 3: center on origin ----
print('\n[CENTER]')
all_objs = [o for o in bpy.data.objects if o.type == 'MESH']
mn = [float('inf')]  * 3
mx = [float('-inf')] * 3
for o in all_objs:
    for c in o.bound_box:
        p = o.matrix_world @ mathutils.Vector(c[:])
        for i in range(3):
            mn[i] = min(mn[i], p[i]); mx[i] = max(mx[i], p[i])
cx, cy, cz = [(mn[i] + mx[i]) / 2 for i in range(3)]
for o in all_objs:
    o.location.x -= cx; o.location.y -= cy; o.location.z -= cz
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
print(f'   Translated by (-{cx:.3f}, -{cy:.3f}, -{cz:.3f})')

# ---- 4: export GLB ----
print(f'\n[EXPORT] {OUTPUT_GLB}')
bpy.ops.export_scene.gltf(
    filepath=OUTPUT_GLB,
    export_format='GLB',
    export_materials='EXPORT',
    export_apply=True,
    use_selection=False,
)
print('[DONE]')
