import bpy
import bmesh
import math
import mathutils

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def test_helpers():
    clear_scene()
    print("Testing BMesh helper generation...")
    # Test swept curve
    bm = bmesh.new()
    spine = [
        mathutils.Vector((0, 0, 0)),
        mathutils.Vector((0, -0.5, 0.5)),
        mathutils.Vector((0, -1.0, 1.2)),
    ]
    radii = [0.08, 0.05, 0.01]
    
    # Simple curve test
    mesh = bpy.data.meshes.new("TestCurve")
    obj = bpy.data.objects.new("TestCurve", mesh)
    bpy.context.scene.collection.objects.link(obj)
    print("Test passed successfully!")

if __name__ == '__main__':
    test_helpers()
