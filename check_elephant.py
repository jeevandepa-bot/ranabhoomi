import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="assets/elephant.glb")
for o in bpy.context.scene.objects:
    if o.type == "MESH":
        print(o.name, "loc:", o.location, "scale:", o.scale, "dims:", o.dimensions)
