"""
FreeCAD headless: import a STEP file, tessellate each Part::Feature,
write a single Wavefront OBJ with each part as its own 'o <name>' object
(preserving the CAD part names).

Run:
  freecadcmd step_to_obj.py -- <input.step> <output.obj>
"""
import sys
import os

# FreeCAD puts its modules on sys.path by default when running freecadcmd.
import FreeCAD
import Import   # STEP importer
import MeshPart

# Paths come from env vars (FreeCAD tries to open any file arguments itself,
# which doesn't work with STEP; env vars bypass that).
INPUT_STEP = os.environ.get('STEP_IN', '')
OUTPUT_OBJ = os.environ.get('OBJ_OUT', INPUT_STEP.rsplit('.', 1)[0] + '.obj' if INPUT_STEP else '')
if not INPUT_STEP or not os.path.isfile(INPUT_STEP):
    print(f'[ERROR] STEP file not found: {INPUT_STEP!r}')
    sys.exit(1)

print(f'[IMPORT] {INPUT_STEP}')
doc = FreeCAD.newDocument('step_import')
Import.insert(INPUT_STEP, doc.Name)

parts = []
for obj in doc.Objects:
    if not hasattr(obj, 'Shape'):
        continue
    shape = getattr(obj, 'Shape', None)
    if shape is None or shape.isNull():
        continue
    # Skip non-solid geometry (wires, empty compounds)
    if shape.Volume < 1e-9:
        continue
    name = (obj.Label or obj.Name).strip() or obj.Name
    parts.append((name, shape))

print(f'[FOUND] {len(parts)} solid parts')

def safe_name(n):
    # OBJ object names can't have spaces/odd chars
    return ''.join(c if (c.isalnum() or c in '_-') else '_' for c in n)

print(f'[TESSELLATE] writing {OUTPUT_OBJ}')
vertex_offset = 0
seen = {}
with open(OUTPUT_OBJ, 'w') as f:
    f.write('# Generated from STEP via FreeCAD\n')
    for idx, (name, shape) in enumerate(parts):
        try:
            mesh = MeshPart.meshFromShape(
                Shape=shape,
                LinearDeflection=0.05,
                AngularDeflection=0.349,  # ~20°
            )
        except Exception as e:
            print(f'   [SKIP] {name}: {e}')
            continue

        sname = safe_name(name)
        # Guarantee uniqueness across duplicate labels
        seen[sname] = seen.get(sname, 0) + 1
        unique = f'{sname}_{seen[sname]:03d}' if seen[sname] > 1 else sname
        f.write(f'\no {unique}\n')

        # Vertices
        verts = mesh.Topology[0]
        faces = mesh.Topology[1]
        for v in verts:
            f.write(f'v {v.x:.4f} {v.y:.4f} {v.z:.4f}\n')
        # Faces (triangles, 1-indexed)
        for a, b, c in faces:
            f.write(f'f {vertex_offset + a + 1} {vertex_offset + b + 1} {vertex_offset + c + 1}\n')
        vertex_offset += len(verts)
        print(f'   [OK] {unique:<40}  verts={len(verts):<6}  faces={len(faces)}')

print(f'[DONE] {OUTPUT_OBJ}')
