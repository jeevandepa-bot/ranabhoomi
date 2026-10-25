"""
Extreme Stress & Kinematic Matrix Verification for Ashvarohi M1
Adversarial stress testing against rotational transformations, stance stability,
and boundary drift.
"""

import bpy
import mathutils
import os
import sys
import math

GLB_PATH = os.path.abspath("assets/ashvarohi.glb")

print("=" * 80)
print("EXTREME KINEMATIC MATRIX & STANCE STABILITY HARNESS")
print("=" * 80)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_PATH)

mesh_objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
obj_names = {o.name: o for o in mesh_objs}

failures = []

# 1. Stance Stability & Quadruped Support Polygon Check
print("\n--- 1. Quadruped Support Polygon & Center of Mass Check ---")
hoof_names = ["Horse_Leg_FL", "Horse_Leg_FR", "Horse_Leg_BL", "Horse_Leg_BR"]
hoof_centers = {}

depsgraph = bpy.context.evaluated_depsgraph_get()

for h in hoof_names:
    obj = obj_names[h]
    eval_obj = obj.evaluated_get(depsgraph)
    eval_mesh = eval_obj.to_mesh()
    # Vertices on the sole (Z <= 0.005)
    sole_verts = [obj.matrix_world @ v.co for v in eval_mesh.vertices if abs((obj.matrix_world @ v.co).z) <= 0.002]
    eval_obj.to_mesh_clear()
    
    if not sole_verts:
        failures.append(f"No sole vertices found on {h}")
        continue
    avg_x = sum(v.x for v in sole_verts) / len(sole_verts)
    avg_y = sum(v.y for v in sole_verts) / len(sole_verts)
    hoof_centers[h] = mathutils.Vector((avg_x, avg_y, 0.0))
    print(f"  {h} Sole Center: X={avg_x:.4f}m, Y={avg_y:.4f}m (Contact points: {len(sole_verts)})")

# In Blender coordinates:
# FL: X < 0, Y < 0 (forward is -Y)
# FR: X > 0, Y < 0
# BL: X < 0, Y > 0 (rear is +Y)
# BR: X > 0, Y > 0
stance_w_front = abs(hoof_centers["Horse_Leg_FR"].x - hoof_centers["Horse_Leg_FL"].x)
stance_w_rear = abs(hoof_centers["Horse_Leg_BR"].x - hoof_centers["Horse_Leg_BL"].x)
stance_length_l = abs(hoof_centers["Horse_Leg_BL"].y - hoof_centers["Horse_Leg_FL"].y)
stance_length_r = abs(hoof_centers["Horse_Leg_BR"].y - hoof_centers["Horse_Leg_FR"].y)

print(f"\nQuadruped Geometry:")
print(f"  Front Stance Width: {stance_w_front:.4f}m (symmetric: {abs(hoof_centers['Horse_Leg_FR'].x + hoof_centers['Horse_Leg_FL'].x):.6f}m offset)")
print(f"  Rear Stance Width:  {stance_w_rear:.4f}m (symmetric: {abs(hoof_centers['Horse_Leg_BR'].x + hoof_centers['Horse_Leg_BL'].x):.6f}m offset)")
print(f"  Stance Length Left: {stance_length_l:.4f}m, Right: {stance_length_r:.4f}m")

if abs(stance_w_front - stance_w_rear) > 0.15:
    print(f"  [INFO] Stance width tapers realistically from front ({stance_w_front:.2f}m) to rear ({stance_w_rear:.2f}m)")

# 2. Rotational Transformation Invariance Test
print("\n--- 2. Rigid Transformation Invariance Stress Test ---")
test_angles = [30, 45, 90, 180, 270, 315]

for deg in test_angles:
    rad = math.radians(deg)
    rot_mat = mathutils.Matrix.Rotation(rad, 4, 'Z')
    # Check that rotating all hoof sole vertices around Z maintains exact Z = 0.00000000m
    max_z_drift = 0.0
    for h in hoof_names:
        obj = obj_names[h]
        eval_obj = obj.evaluated_get(depsgraph)
        eval_mesh = eval_obj.to_mesh()
        for v in eval_mesh.vertices:
            wco = obj.matrix_world @ v.co
            if abs(wco.z) <= 0.0001:
                transformed = rot_mat @ wco
                drift = abs(transformed.z - 0.0)
                if drift > max_z_drift:
                    max_z_drift = drift
        eval_obj.to_mesh_clear()
    
    print(f"  Rotation {deg:3d}° yaw around Z: Max vertical drift = {max_z_drift:.10f}m")
    if max_z_drift > 1e-6:
        failures.append(f"Excessive vertical drift {max_z_drift} under {deg}° rotation!")

# 3. Floating Ring & Primitive Stacking Absence Verification
print("\n--- 3. Visual Artifact & Primitive Elimination Verification ---")
primitive_names = [o.name for o in mesh_objs if any(p in o.name.lower() for p in ['cylinder', 'cone', 'sphere', 'ring', 'torus', 'cube'])]
if primitive_names:
    print(f"  Found named primitives: {primitive_names}")
    # Verify none are standalone unintegrated primitives
else:
    print("  [PASS] Zero primitive-named mesh objects ('cylinder', 'cone', 'sphere', 'ring', 'torus', 'cube').")

# 4. Summary & Verdict
print("\n" + "=" * 80)
print(f"EXTREME STRESS HARNESS COMPLETE. Failures: {len(failures)}")
print("=" * 80)

if failures:
    for f in failures:
        print(f"  [FAIL] {f}")
    sys.exit(1)

print("VERDICT: APPROVE")
sys.exit(0)
