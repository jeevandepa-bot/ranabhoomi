import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="assets/gajadhvaja.glb")
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        coords = [obj.matrix_world @ v.co for v in obj.data.vertices]
        min_x = min(c.x for c in coords)
        max_x = max(c.x for c in coords)
        if abs(max_x) > 1.0 or abs(min_x) > 1.0:
            print(f"OBJ: {obj.name}, X: {min_x:.3f} to {max_x:.3f}")
