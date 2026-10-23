import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="assets/horse.glb")
for obj in bpy.context.scene.objects:
    print("OBJ:", obj.name, obj.type, "loc:", obj.location, "scale:", obj.scale, "parent:", obj.parent)
    if obj.type == 'MESH':
        coords = [obj.matrix_world @ v.co for v in obj.data.vertices]
        min_x = min(c.x for c in coords); max_x = max(c.x for c in coords)
        min_y = min(c.y for c in coords); max_y = max(c.y for c in coords)
        min_z = min(c.z for c in coords); max_z = max(c.z for c in coords)
        print(f"  BOUNDS X: {min_x:.2f} {max_x:.2f}, Y: {min_y:.2f} {max_y:.2f}, Z: {min_z:.2f} {max_z:.2f}")
