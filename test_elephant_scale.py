import bpy
import os

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="assets/elephant.glb")
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        obj.name = "Elephant_Body"
        obj.location = (0, 0, 0)
        obj.scale = (0.20, 0.20, 0.20)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
        print("Scaled elephant dims:", obj.dimensions, "loc:", obj.location)
