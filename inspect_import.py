import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="assets/elephant.glb")
obj = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
obj.location = (0, 0, 0)
obj.rotation_euler = (0, 0, 0)
if obj.rotation_mode == 'QUATERNION':
    obj.rotation_quaternion = (1, 0, 0, 0)
obj.rotation_mode = 'XYZ'
obj.scale = (0.175, 0.175, 0.175)
bpy.context.view_layer.update()
ws = [obj.matrix_world @ v.co for v in obj.data.vertices]
print(f"NEW WORLD X: {min(w.x for w in ws):.3f} to {max(w.x for w in ws):.3f}")
print(f"NEW WORLD Y: {min(w.y for w in ws):.3f} to {max(w.y for w in ws):.3f}")
print(f"NEW WORLD Z: {min(w.z for w in ws):.3f} to {max(w.z for w in ws):.3f}")
