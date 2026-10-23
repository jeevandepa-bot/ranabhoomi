import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="assets/horse.glb")
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        print("Horse base dims:", obj.dimensions, "loc:", obj.location)
