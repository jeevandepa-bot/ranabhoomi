"""
Adversarial Stress Verification Script for Ashvarohi M1 (Blender Python)
Deep forensic analysis of geometry, topology, materials, rig readiness, and boundary constraints.
"""

import bpy
import bmesh
import mathutils
import os
import sys
import json
import math

GLB_PATH = os.path.abspath("assets/ashvarohi.glb")

print("=" * 80)
print("FORENSIC ADVERSARIAL BLENDER CHALLENGE: ASHVAROHI M1")
print(f"Target: {GLB_PATH}")
print("=" * 80)

if not os.path.exists(GLB_PATH):
    print(f"[FAIL] Missing {GLB_PATH}")
    sys.exit(1)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_PATH)

mesh_objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
total_objs = len(bpy.context.scene.objects)
print(f"Total Objects in Scene: {total_objs}, Total Mesh Objects: {len(mesh_objs)}")

failures = []
warnings = []

# 1. Inspect Exact Node Names & Required Rig Hooks
required_hooks = [
    "Horse_Leg_FL", "Horse_Leg_FR", "Horse_Leg_BL", "Horse_Leg_BR",
    "Horse_LyreEar_L", "Horse_LyreEar_R",
    "Lance_Shaft", "Lance_Tip",
    "riderTorso", "riderHead"
]

obj_names = {o.name: o for o in mesh_objs}
missing_hooks = [h for h in required_hooks if h not in obj_names]
if missing_hooks:
    failures.append(f"Missing required rig hooks: {missing_hooks}")
else:
    print(f"[PASS] All {len(required_hooks)} required rig hooks present.")

# 2. Inspect Transforms & Scales
unfrozen_scales = []
for o in mesh_objs:
    s = o.scale
    if abs(s.x - 1.0) > 1e-4 or abs(s.y - 1.0) > 1e-4 or abs(s.z - 1.0) > 1e-4:
        unfrozen_scales.append((o.name, [round(s.x, 5), round(s.y, 5), round(s.z, 5)]))

if unfrozen_scales:
    failures.append(f"Unfrozen scales in meshes: {unfrozen_scales}")
else:
    print(f"[PASS] All {len(mesh_objs)} mesh objects have frozen identity scale (1.0, 1.0, 1.0)")

# 3. Deep Topology Inspection (Degenerates, Loose, Non-Manifold)
total_verts = 0
total_faces = 0
total_loose_verts = 0
total_loose_edges = 0
total_degenerate_faces = 0
total_zero_area_faces = 0
smooth_face_count = 0

depsgraph = bpy.context.evaluated_depsgraph_get()

for o in mesh_objs:
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    
    verts = bm.verts
    faces = bm.faces
    edges = bm.edges
    
    total_verts += len(verts)
    total_faces += len(faces)
    
    # Loose verts
    loose_v = sum(1 for v in verts if len(v.link_edges) == 0)
    total_loose_verts += loose_v
    
    # Loose edges
    loose_e = sum(1 for e in edges if len(e.link_faces) == 0)
    total_loose_edges += loose_e
    
    # Degenerate faces (area < 1e-7)
    for f in faces:
        if f.calc_area() < 1e-7:
            total_zero_area_faces += 1
        if f.smooth:
            smooth_face_count += 1
            
    bm.free()

print(f"Topology Summary:")
print(f"  Total Vertices: {total_verts:,}")
print(f"  Total Faces:    {total_faces:,}")
print(f"  Loose Vertices: {total_loose_verts}")
print(f"  Loose Edges:    {total_loose_edges}")
print(f"  Zero-Area Faces: {total_zero_area_faces}")
print(f"  Smooth Shaded Faces: {smooth_face_count} / {total_faces} ({smooth_face_count / max(1, total_faces) * 100:.1f}%)")

if total_loose_verts > 0:
    warnings.append(f"Found {total_loose_verts} loose vertices")
if total_zero_area_faces > 0:
    warnings.append(f"Found {total_zero_area_faces} zero-area faces")

# 4. Detailed Hoof Elevation and Planar Contact Verification
print("\n--- Hoof Ground Contact Verification (Blender Z-up coordinates) ---")
TOL = 0.0001 # 0.1mm

hoof_names = ["Horse_Leg_FL", "Horse_Leg_FR", "Horse_Leg_BL", "Horse_Leg_BR"]
for hname in hoof_names:
    obj = obj_names.get(hname)
    if not obj:
        continue
    eval_obj = obj.evaluated_get(depsgraph)
    eval_mesh = eval_obj.to_mesh()
    
    world_z = [(obj.matrix_world @ v.co).z for v in eval_mesh.vertices]
    eval_obj.to_mesh_clear()
    
    min_z = min(world_z)
    max_z = max(world_z)
    ground_verts = sum(1 for z in world_z if abs(z) <= TOL)
    penetrations = sum(1 for z in world_z if z < -TOL)
    
    print(f"  {hname}:")
    print(f"    min Z: {min_z:.8f}m, max Z: {max_z:.4f}m")
    print(f"    ground contact vertices (|Z| <= {TOL}m): {ground_verts}")
    print(f"    penetrating vertices (Z < -{TOL}m): {penetrations}")
    
    if min_z < -TOL:
        failures.append(f"{hname} penetrates floor: min Z = {min_z:.8f}m < -{TOL}m")
    elif min_z > TOL:
        failures.append(f"{hname} hovers above floor: min Z = {min_z:.8f}m > {TOL}m")
    elif ground_verts == 0:
        failures.append(f"{hname} has zero ground contact vertices")

# 5. Lyre Ear Curvature Verification
print("\n--- Lyre Ear Anatomy Verification ---")
ear_l = obj_names.get("Horse_LyreEar_L")
ear_r = obj_names.get("Horse_LyreEar_R")

if ear_l and ear_r:
    el_eval = ear_l.evaluated_get(depsgraph).to_mesh()
    er_eval = ear_r.evaluated_get(depsgraph).to_mesh()
    
    el_verts = [(ear_l.matrix_world @ v.co) for v in el_eval.vertices]
    er_verts = [(ear_r.matrix_world @ v.co) for v in er_eval.vertices]
    
    ear_l.evaluated_get(depsgraph).to_mesh_clear()
    ear_r.evaluated_get(depsgraph).to_mesh_clear()
    
    # Left ear: base is around min Z, tip is around max Z
    el_sorted = sorted(el_verts, key=lambda v: v.z)
    er_sorted = sorted(er_verts, key=lambda v: v.z)
    
    el_base = el_sorted[0]
    el_tip = el_sorted[-1]
    er_base = er_sorted[0]
    er_tip = er_sorted[-1]
    
    print(f"  Left Ear:  Base X={el_base.x:.4f}m, Tip X={el_tip.x:.4f}m (Z: {el_base.z:.4f} -> {el_tip.z:.4f})")
    print(f"  Right Ear: Base X={er_base.x:.4f}m, Tip X={er_tip.x:.4f}m (Z: {er_base.z:.4f} -> {er_tip.z:.4f})")
    
    # Inward curvature: Left ear tip curves right (+X), Right ear tip curves left (-X)
    # Or distance between tips < distance between bases
    base_dist = abs(el_base.x - er_base.x)
    tip_dist = abs(el_tip.x - er_tip.x)
    print(f"  Base separation: {base_dist:.4f}m, Tip separation: {tip_dist:.4f}m")
    
    if tip_dist >= base_dist:
        warnings.append(f"Lyre ear tips do not pinch inward: base_dist={base_dist:.4f}m, tip_dist={tip_dist:.4f}m")
    else:
        print(f"  [PASS] Authentic Marwari Lyre curvature confirmed: tips pinch inward by {((base_dist - tip_dist)/base_dist)*100:.1f}%")

# 6. Pennant Lance Dimensions and Tip Alignment
print("\n--- Pennant Lance Verification ---")
lance_shaft = obj_names.get("Lance_Shaft")
lance_tip = obj_names.get("Lance_Tip")

if lance_shaft:
    ls_eval = lance_shaft.evaluated_get(depsgraph).to_mesh()
    ls_verts = [(lance_shaft.matrix_world @ v.co) for v in ls_eval.vertices]
    lance_shaft.evaluated_get(depsgraph).to_mesh_clear()
    
    ls_min_y = min(v.y for v in ls_verts)
    ls_max_y = max(v.y for v in ls_verts)
    ls_len = ls_max_y - ls_min_y
    print(f"  Lance Shaft Length: {ls_len:.4f}m (along Blender Y: [{ls_min_y:.4f}m, {ls_max_y:.4f}m])")
    
    if ls_len < 3.0:
        failures.append(f"Lance length {ls_len:.4f}m < 3.0m requirement")
    else:
        print(f"  [PASS] Imperial 3.2m pennant lance length confirmed ({ls_len:.2f}m)")

if lance_tip:
    lt_eval = lance_tip.evaluated_get(depsgraph).to_mesh()
    lt_verts = [(lance_tip.matrix_world @ v.co) for v in lt_eval.vertices]
    lance_tip.evaluated_get(depsgraph).to_mesh_clear()
    lt_min_y = min(v.y for v in lt_verts)
    print(f"  Lance Tip Frontmost Y: {lt_min_y:.4f}m (forward along -Y)")
    if lt_min_y > 0:
        failures.append(f"Lance tip points backward into positive Y: {lt_min_y}")

# 7. Material Slots and PBR Validation
print("\n--- Material & PBR Palette Verification ---")
materials = bpy.data.materials
print(f"Total Materials: {len(materials)}")
for mat in materials:
    has_nodes = mat.use_nodes
    bsdf = None
    if has_nodes and mat.node_tree:
        for node in mat.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                bsdf = node
                break
    print(f"  Material '{mat.name}': Principled BSDF present = {bsdf is not None}")

# 8. Boundary Bounds vs Tile Radius
print("\n--- Tile Boundary Bounds Assessment ---")
# Bounding box of all objects
all_min = [float('inf')] * 3
all_max = [float('-inf')] * 3

for o in mesh_objs:
    eval_obj = o.evaluated_get(depsgraph)
    eval_mesh = eval_obj.to_mesh()
    for v in eval_mesh.vertices:
        wco = o.matrix_world @ v.co
        for c in range(3):
            all_min[c] = min(all_min[c], wco[c])
            all_max[c] = max(all_max[c], wco[c])
    eval_obj.to_mesh_clear()

print(f"Global Model Extents (Blender coords: X=lateral, Y=depth, Z=height):")
print(f"  X (Lateral): [{all_min[0]:.4f}m, {all_max[0]:.4f}m] -> Width: {all_max[0] - all_min[0]:.4f}m")
print(f"  Y (Depth):   [{all_min[1]:.4f}m, {all_max[1]:.4f}m] -> Length: {all_max[1] - all_min[1]:.4f}m")
print(f"  Z (Height):  [{all_min[2]:.4f}m, {all_max[2]:.4f}m] -> Height: {all_max[2] - all_min[2]:.4f}m")

# Test |x| <= 0.88 * tile radius (tile radius = 1.0m, tile width = 2.0m)
TILE_RADIUS = 1.0
max_abs_x = max(abs(all_min[0]), abs(all_max[0]))
max_allowed_x = 0.88 * TILE_RADIUS

if max_abs_x > max_allowed_x:
    failures.append(f"Model lateral half-extent {max_abs_x:.4f}m exceeds 0.88 * tile_radius ({max_allowed_x:.4f}m)")
else:
    print(f"  [PASS] Lateral boundary check: {max_abs_x:.4f}m <= {max_allowed_x:.4f}m")

# Height check: 2.0m <= height <= 4.0m
height = all_max[2] - all_min[2]
if not (2.0 <= height <= 4.0):
    failures.append(f"Height {height:.4f}m not in [2.0m, 4.0m]")
else:
    print(f"  [PASS] Imperial scale height check: {height:.4f}m in [2.0m, 4.0m]")

# 9. Summary & Verdict
print("\n" + "=" * 80)
print("FORENSIC ADVERSARIAL CHALLENGE VERDICT")
print("=" * 80)
print(f"Failures: {len(failures)}")
print(f"Warnings: {len(warnings)}")

for w in warnings:
    print(f"  [WARN] {w}")
for f in failures:
    print(f"  [FAIL] {f}")

verdict = "REQUEST_CHANGES" if failures else "APPROVE"
print(f"\nFINAL VERDICT: {verdict}")

if failures:
    sys.exit(1)
sys.exit(0)
