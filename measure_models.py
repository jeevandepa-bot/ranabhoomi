import bpy

files = ['padati', 'gajadhvaja', 'ashvarohi', 'ratha', 'maharani', 'samrat']
for f in files:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=f"assets/{f}.glb")
    min_x = min_y = min_z = float('inf')
    max_x = max_y = max_z = float('-inf')
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            for corner in [obj.matrix_world @ v.co for v in obj.data.vertices]:
                min_x = min(min_x, corner.x)
                max_x = max(max_x, corner.x)
                min_y = min(min_y, corner.y)
                max_y = max(max_y, corner.y)
                min_z = min(min_z, corner.z)
                max_z = max(max_z, corner.z)
    print("MODEL", f, "X:", round(min_x, 2), round(max_x, 2), "Y:", round(min_y, 2), round(max_y, 2), "Z:", round(min_z, 2), round(max_z, 2))
