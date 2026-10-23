import bpy

assets = ['soldier.glb', 'horse.glb', 'elephant.glb', 'queen.glb']
for a in assets:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    filepath = f"assets/{a}"
    try:
        bpy.ops.import_scene.gltf(filepath=filepath)
        objects = [o.name for o in bpy.context.scene.objects if o.type == 'MESH']
        armatures = [o.name for o in bpy.context.scene.objects if o.type == 'ARMATURE']
        print(f"=== {a} ===")
        print(f"  Meshes ({len(objects)}): {objects[:6]}")
        print(f"  Armatures: {armatures}")
    except Exception as e:
        print(f"Failed {a}: {e}")
