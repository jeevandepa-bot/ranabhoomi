import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="assets/elephant.glb")
obj = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]

print("LOCAL VERTICES:")
print("X:", min(v.co.x for v in obj.data.vertices), max(v.co.x for v in obj.data.vertices))
print("Y:", min(v.co.y for v in obj.data.vertices), max(v.co.y for v in obj.data.vertices))
print("Z:", min(v.co.z for v in obj.data.vertices), max(v.co.z for v in obj.data.vertices))
