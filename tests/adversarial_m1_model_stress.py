"""
Adversarial Stress Verification Harness for Milestone 1 Models
Tests mesh vertices, bounding boxes, transform freezing, floor grounding,
polygon smoothing, and weapon/anatomical compliance across all 6 GLBs.
"""

import bpy
import mathutils
import os
import sys
import json
import math

MODELS = [
    'padati',
    'gajadhvaja',
    'ashvarohi',
    'ratha',
    'maharani',
    'samrat'
]

ASSETS_DIR = os.path.abspath('assets')
REPORT_OUTPUT = os.path.abspath('tests/adversarial_m1_report.json')

def audit_model(model_name):
    filepath = os.path.join(ASSETS_DIR, f"{model_name}.glb")
    res = {
        "model": model_name,
        "filepath": filepath,
        "exists": os.path.exists(filepath),
        "file_size_bytes": os.path.getsize(filepath) if os.path.exists(filepath) else 0,
        "passes": True,
        "failures": [],
        "warnings": [],
        "metrics": {}
    }

    if not res["exists"]:
        res["passes"] = False
        res["failures"].append(f"File not found: {filepath}")
        return res

    # Check file size anomalies (< 50 KB or > 3.0 MB)
    if res["file_size_bytes"] < 50 * 1024:
        res["passes"] = False
        res["failures"].append(f"Suspiciously small file size: {res['file_size_bytes']} bytes")
    elif res["file_size_bytes"] > 3 * 1024 * 1024:
        res["warnings"].append(f"Large file size: {res['file_size_bytes']} bytes")

    # Clean scene and import GLTF
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.import_scene.gltf(filepath=filepath)
    except Exception as e:
        res["passes"] = False
        res["failures"].append(f"Failed to import GLB: {str(e)}")
        return res

    objects = list(bpy.context.scene.objects)
    mesh_objects = [o for o in objects if o.type == 'MESH']

    res["metrics"]["total_objects"] = len(objects)
    res["metrics"]["mesh_objects_count"] = len(mesh_objects)
    res["metrics"]["mesh_names"] = [o.name for o in mesh_objects]

    if len(mesh_objects) == 0:
        res["passes"] = False
        res["failures"].append("Scene contains 0 MESH objects!")
        return res

    # 1. Inspect Transform Freezing (Identity Scale and Unapplied Offsets)
    unfrozen_scales = []
    unapplied_transforms = []

    for obj in mesh_objects:
        # Check local scale
        s = obj.scale
        if abs(s.x - 1.0) > 1e-3 or abs(s.y - 1.0) > 1e-3 or abs(s.z - 1.0) > 1e-3:
            unfrozen_scales.append({
                "mesh": obj.name,
                "scale": [round(s.x, 4), round(s.y, 4), round(s.z, 4)]
            })

        # Also check world matrix scale decomposition
        loc, rot, world_scale = obj.matrix_world.decompose()
        if abs(world_scale.x - 1.0) > 1e-3 or abs(world_scale.y - 1.0) > 1e-3 or abs(world_scale.z - 1.0) > 1e-3:
            unfrozen_scales.append({
                "mesh": obj.name,
                "world_scale": [round(world_scale.x, 4), round(world_scale.y, 4), round(world_scale.z, 4)]
            })

    if unfrozen_scales:
        res["passes"] = False
        res["failures"].append(f"Found {len(unfrozen_scales)} meshes with unfrozen scale: {unfrozen_scales[:3]}")

    # 2. Inspect Vertices, Bounding Boxes, Floor Grounding, and Runaway Coordinates
    global_min = mathutils.Vector((float('inf'), float('inf'), float('inf')))
    global_max = mathutils.Vector((float('-inf'), float('-inf'), float('-inf')))
    total_vertices = 0
    total_faces = 0
    smooth_faces = 0
    flat_faces = 0
    degenerate_faces = 0
    runaway_vertices = []
    ground_touching_meshes = []

    mesh_bounds = {}

    for obj in mesh_objects:
        m = obj.data
        m_verts = m.vertices
        m_faces = m.polygons
        total_vertices += len(m_verts)
        total_faces += len(m_faces)

        obj_min = mathutils.Vector((float('inf'), float('inf'), float('inf')))
        obj_max = mathutils.Vector((float('-inf'), float('-inf'), float('-inf')))

        for poly in m_faces:
            if poly.use_smooth:
                smooth_faces += 1
            else:
                flat_faces += 1
            if poly.area < 1e-8:
                degenerate_faces += 1

        for v in m_verts:
            world_co = obj.matrix_world @ v.co

            # Check for NaN / Inf
            if math.isnan(world_co.x) or math.isnan(world_co.y) or math.isnan(world_co.z):
                res["passes"] = False
                res["failures"].append(f"NaN coordinate in {obj.name}")
            if math.isinf(world_co.x) or math.isinf(world_co.y) or math.isinf(world_co.z):
                res["passes"] = False
                res["failures"].append(f"Inf coordinate in {obj.name}")

            # Runaway threshold: coordinates > 10.0m or < -10.0m
            if abs(world_co.x) > 10.0 or abs(world_co.y) > 10.0 or abs(world_co.z) > 10.0:
                runaway_vertices.append({
                    "mesh": obj.name,
                    "co": [round(world_co.x, 3), round(world_co.y, 3), round(world_co.z, 3)]
                })

            # Min / Max tracking
            obj_min.x = min(obj_min.x, world_co.x)
            obj_min.y = min(obj_min.y, world_co.y)
            obj_min.z = min(obj_min.z, world_co.z)

            obj_max.x = max(obj_max.x, world_co.x)
            obj_max.y = max(obj_max.y, world_co.y)
            obj_max.z = max(obj_max.z, world_co.z)

            global_min.x = min(global_min.x, world_co.x)
            global_min.y = min(global_min.y, world_co.y)
            global_min.z = min(global_min.z, world_co.z)

            global_max.x = max(global_max.x, world_co.x)
            global_max.y = max(global_max.y, world_co.y)
            global_max.z = max(global_max.z, world_co.z)

        mesh_bounds[obj.name] = {
            "min": [round(obj_min.x, 4), round(obj_min.y, 4), round(obj_min.z, 4)],
            "max": [round(obj_max.x, 4), round(obj_max.y, 4), round(obj_max.z, 4)],
            "vert_count": len(m_verts),
            "face_count": len(m_faces)
        }

        # Check if mesh touches the ground plane (Z < 0.005)
        if obj_min.z <= 0.005:
            ground_touching_meshes.append(obj.name)

    res["metrics"]["total_vertices"] = total_vertices
    res["metrics"]["total_faces"] = total_faces
    res["metrics"]["smooth_faces"] = smooth_faces
    res["metrics"]["flat_faces"] = flat_faces
    res["metrics"]["smooth_ratio"] = round(smooth_faces / max(1, total_faces), 4)
    res["metrics"]["degenerate_faces"] = degenerate_faces
    res["metrics"]["bbox_min"] = [round(global_min.x, 6), round(global_min.y, 6), round(global_min.z, 6)]
    res["metrics"]["bbox_max"] = [round(global_max.x, 6), round(global_max.y, 6), round(global_max.z, 6)]
    res["metrics"]["ground_touching_meshes"] = ground_touching_meshes

    # Runaway check verdict
    if runaway_vertices:
        res["passes"] = False
        res["failures"].append(f"Found {len(runaway_vertices)} runaway vertices (|coord| > 10.0): {runaway_vertices[:3]}")

    # Grounding check verdict: Z_min in [-0.001, +0.001]
    if global_min.z < -0.001:
        res["passes"] = False
        res["failures"].append(f"Grounding failure: Z_min = {global_min.z:.6f}m penetrates below stone floor (tolerance [-0.001, 0.001])")
    elif global_min.z > 0.001:
        res["passes"] = False
        res["failures"].append(f"Grounding failure: Z_min = {global_min.z:.6f}m hovers above stone floor (tolerance [-0.001, 0.001])")

    # 3. Model-Specific Adversarial Archetype Checks
    mesh_names = [o.name for o in mesh_objects]
    mesh_names_lower = [n.lower() for n in mesh_names]

    if model_name == 'padati':
        # Must have Khanda and Dhal
        has_khanda = any('khanda' in n for n in mesh_names_lower)
        has_dhal = any('dhal' in n for n in mesh_names_lower)
        # Must strictly have ZERO spears, poles, bows
        forbidden_weapons = [n for n in mesh_names_lower if any(w in n for w in ['spear', 'lance', 'pole', 'bow', 'dhanush'])]

        if not has_khanda:
            res["passes"] = False
            res["failures"].append("Padati is missing Khanda broadsword mesh!")
        if not has_dhal:
            res["passes"] = False
            res["failures"].append("Padati is missing Rajput Dhal shield mesh!")
        if forbidden_weapons:
            res["passes"] = False
            res["failures"].append(f"Padati contains forbidden spear/bow weapons: {forbidden_weapons}")

        # Check Dhal shield position: left arm (typically X < 0 or X > 0, facing front -Y)
        dhal_meshes = [o for o in mesh_objects if 'dhal' in o.name.lower()]
        for d in dhal_meshes:
            d_min = mesh_bounds[d.name]["min"]
            d_max = mesh_bounds[d.name]["max"]
            res["metrics"]["dhal_bounds"] = {"min": d_min, "max": d_max}
            # Verify Dhal is not buried underground
            if d_max[2] < 0.2:
                res["passes"] = False
                res["failures"].append(f"Padati Dhal shield is buried underground: max Z = {d_max[2]}")

    elif model_name == 'gajadhvaja':
        # Check for forward tusks
        tusk_meshes = [o for o in mesh_objects if 'tusk' in o.name.lower()]
        if not tusk_meshes:
            res["passes"] = False
            res["failures"].append("Gajadhvaja has no tusk meshes!")
        else:
            tusk_bounds = []
            for t in tusk_meshes:
                tb = mesh_bounds[t.name]
                tusk_bounds.append({"name": t.name, "min": tb["min"], "max": tb["max"]})
                # In Blender coordinates, model faces -Y. Head is at negative Y.
                # Forward tusks should extend into negative Y (Y_min < -0.8)
                if tb["min"][1] > 0.0:
                    res["passes"] = False
                    res["failures"].append(f"Tusk {t.name} is pointing backward into positive Y (rump/tail): min Y = {tb['min'][1]}")
            res["metrics"]["tusk_bounds"] = tusk_bounds

        # Check for runaway cubes/cylinders (like Cube.002)
        runaway_primitives = [o.name for o in mesh_objects if 'cube' in o.name.lower() or 'cylinder' in o.name.lower()]
        if runaway_primitives:
            res["warnings"].append(f"Found primitive-named meshes in Gajadhvaja: {runaway_primitives}")
            for p in runaway_primitives:
                if mesh_bounds[p]["max"][2] > 10.0:
                    res["passes"] = False
                    res["failures"].append(f"Primitive {p} has runaway Z: {mesh_bounds[p]['max'][2]}")

    elif model_name == 'ashvarohi':
        # Marwari lyre ears, barding, dragoon rider
        has_lyre_ears = any('ear' in n for n in mesh_names_lower)
        has_rider = any(r in n for r in ['rider', 'dragoon', 'torso', 'head'] for n in mesh_names_lower)
        if not has_lyre_ears:
            res["warnings"].append("Ashvarohi lacks distinct lyre ear meshes")
        # Ensure no rearward lance (+Y)
        lance_meshes = [o for o in mesh_objects if 'lance' in o.name.lower()]
        if lance_meshes:
            res["warnings"].append(f"Ashvarohi has lance meshes: {[o.name for o in lance_meshes]}")

    elif model_name == 'ratha':
        # Dual 8-spoked chakra wheels
        wheel_meshes = [o for o in mesh_objects if 'wheel' in o.name.lower() or 'chakra' in o.name.lower()]
        res["metrics"]["wheel_meshes"] = [o.name for o in wheel_meshes]
        if len(wheel_meshes) < 2:
            res["warnings"].append(f"Ratha has fewer than 2 wheel meshes: {len(wheel_meshes)}")

    elif model_name == 'maharani':
        # Twin khanda blades
        khanda_meshes = [o for o in mesh_objects if 'khanda' in o.name.lower()]
        res["metrics"]["khanda_meshes"] = [o.name for o in khanda_meshes]
        # Should have at least 2 khanda meshes (dual wielding)
        if len(khanda_meshes) < 2:
            res["warnings"].append(f"Maharani expected twin Khandas, found {len(khanda_meshes)}")
        # Check no polearm
        polearm_meshes = [o for o in mesh_objects if any(w in o.name.lower() for w in ['polearm', 'spear', 'halberd'])]
        if polearm_meshes:
            res["passes"] = False
            res["failures"].append(f"Maharani contains polearm meshes: {[o.name for o in polearm_meshes]}")

    elif model_name == 'samrat':
        # 3-tiered Chhatra parasol canopy and ceremonial Gada mace
        chhatra_tiers = [o for o in mesh_objects if 'chhatra' in o.name.lower()]
        gada_meshes = [o for o in mesh_objects if 'gada' in o.name.lower()]
        res["metrics"]["chhatra_meshes"] = [o.name for o in chhatra_tiers]
        res["metrics"]["gada_meshes"] = [o.name for o in gada_meshes]
        if not chhatra_tiers:
            res["passes"] = False
            res["failures"].append("Samrat missing Chhatra parasol canopy meshes!")
        if not gada_meshes:
            res["passes"] = False
            res["failures"].append("Samrat missing ceremonial Gada mace meshes!")

        # Verify Gada head touches the floor (Z_min == 0.0)
        gada_heads = [o for o in gada_meshes if 'head' in o.name.lower()]
        for gh in gada_heads:
            gh_zmin = mesh_bounds[gh.name]["min"][2]
            res["metrics"]["gada_head_zmin"] = gh_zmin
            if abs(gh_zmin) > 0.005:
                res["warnings"].append(f"Gada head Z_min is {gh_zmin:.4f}m (expected ~0.000m)")

    return res

def main():
    print("=" * 80)
    print("ADVERSARIAL STRESS TEST HARNESS — MILESTONE 1 3D MODELS")
    print("=" * 80)

    all_results = {}
    overall_pass = True

    for model_name in MODELS:
        print(f"\n--- Testing {model_name}.glb ---")
        res = audit_model(model_name)
        all_results[model_name] = res

        print(f"Status: {'PASS' if res['passes'] else 'FAIL'}")
        print(f"Size: {res['file_size_bytes']:,} bytes | Meshes: {res['metrics'].get('mesh_objects_count', 0)} | Verts: {res['metrics'].get('total_vertices', 0):,} | Faces: {res['metrics'].get('total_faces', 0):,}")
        print(f"BBox Min: {res['metrics'].get('bbox_min')} | Max: {res['metrics'].get('bbox_max')}")
        print(f"Z_min (Grounding): {res['metrics'].get('bbox_min', [0,0,0])[2]:.6f}m")
        print(f"Smooth Ratio: {res['metrics'].get('smooth_ratio', 0) * 100:.1f}%")
        print(f"Ground-touching meshes: {res['metrics'].get('ground_touching_meshes')}")

        if res["warnings"]:
            for w in res["warnings"]:
                print(f"  [WARN] {w}")

        if res["failures"]:
            overall_pass = False
            for f in res["failures"]:
                print(f"  [FAIL] {f}")

    print("\n" + "=" * 80)
    print(f"OVERALL ADVERSARIAL VERDICT: {'APPROVE' if overall_pass else 'REQUEST_CHANGES'}")
    print("=" * 80)

    # Save detailed JSON report
    with open(REPORT_OUTPUT, 'w') as f:
        json.dump({
            "overall_pass": overall_pass,
            "models": all_results
        }, f, indent=2)

    print(f"Detailed stress report saved to: {REPORT_OUTPUT}")
    if not overall_pass:
        sys.exit(1)

if __name__ == '__main__':
    main()
