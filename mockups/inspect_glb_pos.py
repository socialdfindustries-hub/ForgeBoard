"""Print mesh name, size, and world center position from a GLB."""
import bpy, sys, mathutils

path = sys.argv[sys.argv.index('--') + 1]

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=path)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
print(f'\n=== {path}  ({len(meshes)} meshes) ===')
for o in meshes:
    corners = [o.matrix_world @ mathutils.Vector(c[:]) for c in o.bound_box]
    mn = mathutils.Vector((min(p.x for p in corners), min(p.y for p in corners), min(p.z for p in corners)))
    mx = mathutils.Vector((max(p.x for p in corners), max(p.y for p in corners), max(p.z for p in corners)))
    sz = mx - mn
    c = (mn + mx) / 2.0
    mats = [m.name if m else '-' for m in o.data.materials] or ['-']
    print(f'  {o.name[:28]:<28}  pos=({c.x:6.2f},{c.y:6.2f},{c.z:6.2f})  size=({sz.x:5.2f},{sz.y:5.2f},{sz.z:5.2f})  mat={mats[0]}')
