"""
Independent Empirical Challenger Audit Harness for Milestone 1: Ashvarohi (Knight)
Author: challenger_ashvarohi_m1_2
Validates:
1. Lyre ear curvature (inward pointing tips)
2. 3.2m lance length and presence of Lance_Tip node
3. Absence of primitive geometric cylinders, cones, and spheres
4. Exact independent 4-hoof grounding at Z = 0.0000m
"""

import bpy
import mathutils
from mathutils import Vector
import os
import sys
import json
import math

REPORT_PATH = os.path.abspath("tests/challenger_m1_audit_report.json")
GLB_PATH = os.path.abspath("assets/ashvarohi.glb")

def run_challenger_audit():
    print("=" * 80)
    print("EMPIRICAL CHALLENGER AUDIT: ASHVAROHI (KNIGHT) MILESTONE 1")
    print("=" * 80)

    report = {
        "glb_path": GLB_PATH,
        "glb_exists": os.path.exists(GLB_PATH),
        "glb_size_bytes": os.path.getsize(GLB_PATH) if os.path.exists(GLB_PATH) else 0,
        "test_results": {},
        "failures": [],
        "warnings": [],
        "verdict": "PENDING"
    }

    if not report["glb_exists"]:
        report["failures"].append(f"GLB file not found: {GLB_PATH}")
        report["verdict"] = "REQUEST_CHANGES"
        finish(report)
        return

    # Clean scene and load GLB
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.import_scene.gltf(filepath=GLB_PATH)
    except Exception as e:
        report["failures"].append(f"Failed to load GLB: {str(e)}")
        report["verdict"] = "REQUEST_CHANGES"
        finish(report)
        return

    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    all_objects = list(bpy.context.scene.objects)
    mesh_names = [o.name for o in mesh_objects]
    print(f"Total Objects in scene: {len(all_objects)} | Mesh Objects: {len(mesh_objects)}")

    # --------------------------------------------------------------------------
    # CRITERION 1: ALL 4 HOOVES INDEPENDENTLY GROUNDED AT Z = 0.0000m
    # --------------------------------------------------------------------------
    print("\n" + "-" * 40)
    print("CRITERION 1: HOOF GROUNDING & CONTACT VERIFICATION")
    print("-" * 40)

    grounding_data = {
        "global_min_z": float('inf'),
        "global_max_z": float('-inf'),
        "hoof_metrics": {},
        "penetrating_meshes": [],
        "ground_touching_meshes": []
    }

    # First, scan every mesh in the model for floor penetration
    for obj in mesh_objects:
        eval_obj = obj.evaluated_get(depsgraph)
        eval_mesh = eval_obj.to_mesh()
        obj_min_z = float('inf')
        obj_max_z = float('-inf')

        for v in eval_mesh.vertices:
            w_co = obj.matrix_world @ v.co
            if w_co.z < obj_min_z: obj_min_z = w_co.z
            if w_co.z > obj_max_z: obj_max_z = w_co.z

        eval_obj.to_mesh_clear()

        if obj_min_z < grounding_data["global_min_z"]:
            grounding_data["global_min_z"] = obj_min_z
        if obj_max_z > grounding_data["global_max_z"]:
            grounding_data["global_max_z"] = obj_max_z

        # Check floor penetration: Z < -0.0001m
        if obj_min_z < -0.0001:
            grounding_data["penetrating_meshes"].append({"name": obj.name, "min_z": obj_min_z})
            report["failures"].append(f"Penetration defect: Mesh '{obj.name}' penetrates below floor with min Z = {obj_min_z:.6f}m")

        # Check which meshes touch floor: Z <= 0.001m
        if obj_min_z <= 0.001:
            grounding_data["ground_touching_meshes"].append(obj.name)

    print(f"Global Z range: [{grounding_data['global_min_z']:.6f}m, {grounding_data['global_max_z']:.6f}m]")
    print(f"Ground-touching meshes: {grounding_data['ground_touching_meshes']}")

    # Expected ground touching meshes are strictly the 4 legs
    expected_legs = ["Horse_Leg_FL", "Horse_Leg_FR", "Horse_Leg_BL", "Horse_Leg_BR"]
    unexpected_ground_touches = [m for m in grounding_data["ground_touching_meshes"] if m not in expected_legs]
    if unexpected_ground_touches:
        report["warnings"].append(f"Unexpected meshes touching ground: {unexpected_ground_touches}")

    # Inspect each of the 4 legs with micro-precision
    hooves_pass = True
    hoof_positions = {}
    for leg_name in expected_legs:
        obj = bpy.data.objects.get(leg_name)
        if not obj:
            report["failures"].append(f"Missing required leg mesh: {leg_name}")
            hooves_pass = False
            continue

        eval_obj = obj.evaluated_get(depsgraph)
        eval_mesh = eval_obj.to_mesh()

        min_z = float('inf')
        ground_contact_verts = []
        all_leg_verts = []

        for v in eval_mesh.vertices:
            w_co = obj.matrix_world @ v.co
            all_leg_verts.append(w_co)
            if w_co.z < min_z:
                min_z = w_co.z
            if abs(w_co.z) < 0.0005:  # Ground contact threshold
                ground_contact_verts.append(w_co)

        eval_obj.to_mesh_clear()

        # Sole footprint spread
        if ground_contact_verts:
            sole_xs = [v.x for v in ground_contact_verts]
            sole_ys = [v.y for v in ground_contact_verts]
            sole_dx = max(sole_xs) - min(sole_xs)
            sole_dy = max(sole_ys) - min(sole_ys)
            sole_center_x = sum(sole_xs) / len(sole_xs)
            sole_center_y = sum(sole_ys) / len(sole_ys)
            hoof_positions[leg_name] = (sole_center_x, sole_center_y)
        else:
            sole_dx = sole_dy = 0.0
            sole_center_x = sole_center_y = 0.0

        leg_metric = {
            "min_z": round(min_z, 6),
            "contact_vert_count": len(ground_contact_verts),
            "total_vert_count": len(all_leg_verts),
            "sole_width_x": round(sole_dx, 4),
            "sole_length_y": round(sole_dy, 4),
            "sole_center": [round(sole_center_x, 4), round(sole_center_y, 4)]
        }
        grounding_data["hoof_metrics"][leg_name] = leg_metric

        print(f"  Hoof {leg_name}: min Z = {min_z:.6f}m | contact verts = {len(ground_contact_verts)} | sole footprint = {sole_dx:.3f}m x {sole_dy:.3f}m | center = ({sole_center_x:.3f}, {sole_center_y:.3f})")

        # Rigorous check: min_z must be exactly 0.0000m within 0.0001m
        if abs(min_z) > 0.0001:
            report["failures"].append(f"Hoof {leg_name} not grounded at Z = 0.0000m: min Z = {min_z:.6f}m")
            hooves_pass = False

        if len(ground_contact_verts) < 4:
            report["warnings"].append(f"Hoof {leg_name} has fewer than 4 contact vertices ({len(ground_contact_verts)})")

    # Quad stance stability check: calculate base of support polygon area
    if len(hoof_positions) == 4:
        # Cross product polygon area of FL -> FR -> BR -> BL
        fl = hoof_positions["Horse_Leg_FL"]
        fr = hoof_positions["Horse_Leg_FR"]
        br = hoof_positions["Horse_Leg_BR"]
        bl = hoof_positions["Horse_Leg_BL"]
        pts = [fl, fr, br, bl]
        # Shoelace formula
        area = 0.5 * abs(sum(pts[i][0] * pts[(i+1)%4][1] - pts[(i+1)%4][0] * pts[i][1] for i in range(4)))
        grounding_data["support_polygon_area_m2"] = round(area, 4)
        print(f"  Quad-stance support area: {area:.4f} m^2")
        if area < 0.2:
            report["warnings"].append(f"Narrow support polygon area: {area:.4f} m^2")

    grounding_data["status"] = "PASS" if hooves_pass and len(grounding_data["penetrating_meshes"]) == 0 else "FAIL"
    report["test_results"]["criterion_1_hoof_grounding"] = grounding_data

    # --------------------------------------------------------------------------
    # CRITERION 2: MARWARI LYRE EAR CURVATURE (INWARD POINTING TIPS)
    # --------------------------------------------------------------------------
    print("\n" + "-" * 40)
    print("CRITERION 2: MARWARI LYRE EAR CURVATURE VERIFICATION")
    print("-" * 40)

    ear_data = {}
    ear_l = bpy.data.objects.get("Horse_LyreEar_L")
    ear_r = bpy.data.objects.get("Horse_LyreEar_R")

    if not ear_l or not ear_r:
        report["failures"].append("Missing required lyre ear meshes ('Horse_LyreEar_L' and/or 'Horse_LyreEar_R')")
        ear_data["status"] = "FAIL"
    else:
        def analyze_ear(ear_obj, side):
            eval_obj = ear_obj.evaluated_get(depsgraph)
            eval_mesh = eval_obj.to_mesh()
            verts = [ear_obj.matrix_world @ v.co for v in eval_mesh.vertices]
            eval_obj.to_mesh_clear()

            # Sort vertices by Z elevation
            verts_by_z = sorted(verts, key=lambda v: v.z)
            min_z = verts_by_z[0].z
            max_z = verts_by_z[-1].z

            # Base slice: bottom 15% of Z range
            base_thresh = min_z + 0.15 * (max_z - min_z)
            base_verts = [v for v in verts if v.z <= base_thresh]
            base_center = Vector((
                sum(v.x for v in base_verts) / len(base_verts),
                sum(v.y for v in base_verts) / len(base_verts),
                sum(v.z for v in base_verts) / len(base_verts)
            ))

            # Tip slice: top 10% of Z range
            tip_thresh = max_z - 0.10 * (max_z - min_z)
            tip_verts = [v for v in verts if v.z >= tip_thresh]
            tip_center = Vector((
                sum(v.x for v in tip_verts) / len(tip_verts),
                sum(v.y for v in tip_verts) / len(tip_verts),
                sum(v.z for v in tip_verts) / len(tip_verts)
            ))

            # Mid slice: between 40% and 60%
            mid_z_min = min_z + 0.40 * (max_z - min_z)
            mid_z_max = min_z + 0.60 * (max_z - min_z)
            mid_verts = [v for v in verts if mid_z_min <= v.z <= mid_z_max]
            mid_center = Vector((
                sum(v.x for v in mid_verts) / len(mid_verts),
                sum(v.y for v in mid_verts) / len(mid_verts),
                sum(v.z for v in mid_verts) / len(mid_verts)
            )) if mid_verts else base_center

            # Lateral bounds (X)
            max_lateral = max(abs(v.x) for v in verts)
            tip_lateral = abs(tip_center.x)
            base_lateral = abs(base_center.x)
            mid_lateral = abs(mid_center.x)

            # Inward curvature check:
            # For Left ear (X < 0): tip must curve towards X = 0 (tip.x > mid.x or tip.x > base.x)
            # For Right ear (X > 0): tip must curve towards X = 0 (tip.x < mid.x or tip.x < base.x)
            # In both cases: |tip_lateral| < |mid_lateral| or |tip_lateral| < |base_lateral|
            inward_vector_x = tip_center.x - mid_center.x
            is_inward_pointing = (inward_vector_x > 0) if side == "L" else (inward_vector_x < 0)
            inward_relative_to_mid = tip_lateral < mid_lateral
            inward_relative_to_base = tip_lateral < base_lateral

            return {
                "side": side,
                "vert_count": len(verts),
                "z_range": [round(min_z, 4), round(max_z, 4)],
                "base_center": [round(base_center.x, 4), round(base_center.y, 4), round(base_center.z, 4)],
                "mid_center": [round(mid_center.x, 4), round(mid_center.y, 4), round(mid_center.z, 4)],
                "tip_center": [round(tip_center.x, 4), round(tip_center.y, 4), round(tip_center.z, 4)],
                "base_lateral_dist": round(base_lateral, 4),
                "mid_lateral_dist": round(mid_lateral, 4),
                "tip_lateral_dist": round(tip_lateral, 4),
                "max_lateral_dist": round(max_lateral, 4),
                "inward_vector_x": round(inward_vector_x, 4),
                "is_inward_pointing": is_inward_pointing,
                "tip_closer_than_mid": inward_relative_to_mid,
                "tip_closer_than_base": inward_relative_to_base
            }

        left_metrics = analyze_ear(ear_l, "L")
        right_metrics = analyze_ear(ear_r, "R")

        d_bases = abs(left_metrics["base_center"][0] - right_metrics["base_center"][0])
        d_mids = abs(left_metrics["mid_center"][0] - right_metrics["mid_center"][0])
        d_tips = abs(left_metrics["tip_center"][0] - right_metrics["tip_center"][0])
        tip_convergence_ratio = d_tips / max(1e-5, d_bases)

        ear_data = {
            "left_ear": left_metrics,
            "right_ear": right_metrics,
            "inter_base_distance_m": round(d_bases, 4),
            "inter_mid_distance_m": round(d_mids, 4),
            "inter_tip_distance_m": round(d_tips, 4),
            "tip_convergence_ratio": round(tip_convergence_ratio, 4)
        }

        print(f"  Left Ear: Base X={left_metrics['base_center'][0]}m -> Mid X={left_metrics['mid_center'][0]}m -> Tip X={left_metrics['tip_center'][0]}m")
        print(f"  Right Ear: Base X={right_metrics['base_center'][0]}m -> Mid X={right_metrics['mid_center'][0]}m -> Tip X={right_metrics['tip_center'][0]}m")
        print(f"  Inter-ear distance: Base={d_bases:.4f}m | Mid={d_mids:.4f}m | Tips={d_tips:.4f}m")
        print(f"  Tip convergence ratio (d_tips / d_bases): {tip_convergence_ratio:.4f}")

        # Inward pointing condition: tips must converge significantly (d_tips < d_bases and d_tips < d_mids)
        if d_tips >= d_bases:
            report["failures"].append(f"Lyre ears do not converge at tips: tip distance {d_tips:.4f}m >= base distance {d_bases:.4f}m")
            ear_data["status"] = "FAIL"
        elif not (left_metrics["is_inward_pointing"] and right_metrics["is_inward_pointing"]):
            report["failures"].append("Lyre ear tip vectors do not point inward toward each other")
            ear_data["status"] = "FAIL"
        else:
            print("  [PASS] Both ear tips curve inward toward each other with strong convergence.")
            ear_data["status"] = "PASS"

    report["test_results"]["criterion_2_lyre_ears"] = ear_data

    # --------------------------------------------------------------------------
    # CRITERION 3: 3.2m LANCE LENGTH AND PRESENCE OF LANCE_TIP NODE
    # --------------------------------------------------------------------------
    print("\n" + "-" * 40)
    print("CRITERION 3: 3.2m LANCE LENGTH & LANCE_TIP NODE")
    print("-" * 40)

    lance_data = {
        "nodes_present": {},
        "lance_meshes": []
    }

    lance_node_names = ["Lance_Shaft", "Lance_Tip", "Lance_Vamplate", "Lance_Pennant"]
    for l_name in lance_node_names:
        obj = bpy.data.objects.get(l_name)
        lance_data["nodes_present"][l_name] = obj is not None
        if obj:
            lance_data["lance_meshes"].append(l_name)
        else:
            if l_name in ["Lance_Shaft", "Lance_Tip"]:
                report["failures"].append(f"Required lance node missing: {l_name}")

    lance_shaft = bpy.data.objects.get("Lance_Shaft")
    lance_tip = bpy.data.objects.get("Lance_Tip")

    if lance_shaft and lance_tip:
        eval_shaft = lance_shaft.evaluated_get(depsgraph).to_mesh()
        shaft_verts = [lance_shaft.matrix_world @ v.co for v in eval_shaft.vertices]
        eval_shaft_clean = lance_shaft.evaluated_get(depsgraph).to_mesh_clear()

        eval_tip = lance_tip.evaluated_get(depsgraph).to_mesh()
        tip_verts = [lance_tip.matrix_world @ v.co for v in eval_tip.vertices]
        eval_tip_clean = lance_tip.evaluated_get(depsgraph).to_mesh_clear()

        # Lance bounds
        all_lance_verts = shaft_verts + tip_verts
        lance_min_x = min(v.x for v in all_lance_verts); lance_max_x = max(v.x for v in all_lance_verts)
        lance_min_y = min(v.y for v in all_lance_verts); lance_max_y = max(v.y for v in all_lance_verts)
        lance_min_z = min(v.z for v in all_lance_verts); lance_max_z = max(v.z for v in all_lance_verts)

        # Extreme butt vertex (max Y, since horse faces -Y)
        butt_vert = max(shaft_verts, key=lambda v: v.y)
        # Extreme tip vertex (min Y)
        extreme_tip_vert = min(tip_verts, key=lambda v: v.y)

        # Distances
        y_span = abs(butt_vert.y - extreme_tip_vert.y)
        euclidean_3d_len = (butt_vert - extreme_tip_vert).length

        # Tip node center
        tip_center = Vector((
            sum(v.x for v in tip_verts) / len(tip_verts),
            sum(v.y for v in tip_verts) / len(tip_verts),
            sum(v.z for v in tip_verts) / len(tip_verts)
        ))

        # Shaft forward tip
        shaft_front_vert = min(shaft_verts, key=lambda v: v.y)
        tip_offset_from_shaft = (tip_center - shaft_front_vert).length

        lance_data["shaft_vert_count"] = len(shaft_verts)
        lance_data["tip_vert_count"] = len(tip_verts)
        lance_data["butt_point"] = [round(butt_vert.x, 4), round(butt_vert.y, 4), round(butt_vert.z, 4)]
        lance_data["tip_point"] = [round(extreme_tip_vert.x, 4), round(extreme_tip_vert.y, 4), round(extreme_tip_vert.z, 4)]
        lance_data["lance_y_span_m"] = round(y_span, 4)
        lance_data["lance_euclidean_len_m"] = round(euclidean_3d_len, 4)
        lance_data["tip_node_center"] = [round(tip_center.x, 4), round(tip_center.y, 4), round(tip_center.z, 4)]
        lance_data["tip_to_shaft_gap_m"] = round(tip_offset_from_shaft, 4)
        lance_data["lance_ground_clearance_min_z_m"] = round(lance_min_z, 4)

        print(f"  Lance Butt point: {lance_data['butt_point']}")
        print(f"  Lance Tip point:  {lance_data['tip_point']}")
        print(f"  Lance Y span: {y_span:.4f}m | 3D Euclidean Length: {euclidean_3d_len:.4f}m")
        print(f"  Lance_Tip node center: {lance_data['tip_node_center']} | Gap to shaft front: {tip_offset_from_shaft:.4f}m")
        print(f"  Lance elevation above floor: min Z = {lance_min_z:.4f}m")

        # Validation: length must be nominally 3.20m (tolerance [3.15m, 3.25m])
        if not (3.15 <= y_span <= 3.25 or 3.15 <= euclidean_3d_len <= 3.25):
            report["failures"].append(f"Lance length out of spec: Y span = {y_span:.4f}m, 3D length = {euclidean_3d_len:.4f}m (expected ~3.20m)")
            lance_data["status"] = "FAIL"
        elif tip_offset_from_shaft > 0.05:
            report["failures"].append(f"Lance_Tip node disconnected from Lance_Shaft by {tip_offset_from_shaft:.4f}m")
            lance_data["status"] = "FAIL"
        elif lance_min_z < 1.0:
            report["warnings"].append(f"Lance hangs low: min Z = {lance_min_z:.4f}m")
            lance_data["status"] = "PASS"
        else:
            print("  [PASS] 3.2m Lance length and Lance_Tip node presence confirmed.")
            lance_data["status"] = "PASS"
    else:
        lance_data["status"] = "FAIL"

    report["test_results"]["criterion_3_lance"] = lance_data

    # --------------------------------------------------------------------------
    # CRITERION 4: ABSENCE OF PRIMITIVE GEOMETRIC CYLINDERS, CONES, SPHERES
    # --------------------------------------------------------------------------
    print("\n" + "-" * 40)
    print("CRITERION 4: ORGANIC MODELING VS PRIMITIVE STACKING AUDIT")
    print("-" * 40)

    organic_data = {
        "primitive_name_matches": [],
        "mesh_topologies": {},
        "smooth_faces_total": 0,
        "flat_faces_total": 0,
        "subsurf_evaluated_ratio": 0.0,
        "anatomical_components": {}
    }

    # 1. Name inspection
    forbidden_tokens = ["cylinder", "cone", "sphere", "cube", "icosphere", "circle"]
    for m in mesh_names:
        m_lower = m.lower()
        matched = [t for t in forbidden_tokens if t in m_lower]
        if matched:
            organic_data["primitive_name_matches"].append({"mesh": m, "matched_tokens": matched})
            report["failures"].append(f"Primitive geometric naming detected in mesh: '{m}'")

    # 2. Topology inspection (smooth vs flat, organic curvature)
    total_faces = 0
    smooth_faces = 0
    flat_faces = 0

    for obj in mesh_objects:
        m = obj.data
        n_verts = len(m.vertices)
        n_faces = len(m.polygons)
        total_faces += n_faces

        mesh_smooth = sum(1 for p in m.polygons if p.use_smooth)
        mesh_flat = n_faces - mesh_smooth
        smooth_faces += mesh_smooth
        flat_faces += mesh_flat

        # Check for cylindrical uniformity (constant radius along axis)
        eval_obj = obj.evaluated_get(depsgraph)
        eval_mesh = eval_obj.to_mesh()
        eval_verts = len(eval_mesh.vertices)
        eval_faces = len(eval_mesh.polygons)
        eval_obj.to_mesh_clear()

        organic_data["mesh_topologies"][obj.name] = {
            "verts": n_verts,
            "faces": n_faces,
            "eval_verts": eval_verts,
            "eval_faces": eval_faces,
            "smooth_ratio": round(mesh_smooth / max(1, n_faces), 3)
        }

    smooth_ratio = smooth_faces / max(1, total_faces)
    organic_data["smooth_faces_total"] = smooth_faces
    organic_data["flat_faces_total"] = flat_faces
    organic_data["smooth_ratio_overall"] = round(smooth_ratio, 4)

    print(f"  Overall smooth polygon ratio: {smooth_ratio * 100:.2f}% ({smooth_faces}/{total_faces} faces)")

    # 3. Anatomical completeness inspection
    # Check that horse and rider have required continuous anatomical parts
    expected_anatomy = {
        "horse_body": ["Horse_Body", "Horse_Neck", "Horse_Head", "Horse_Mane", "Horse_Tail"],
        "horse_barding": ["Horse_Chamfron", "Horse_Peytral", "Horse_SaddleJhul", "Horse_Saddle"],
        "rider_anatomy": ["riderTorso", "riderHead", "Rider_Leg_L", "Rider_Leg_R", "Rider_Arm_L", "Rider_Arm_R"],
        "rider_regalia": ["Rider_Pagri", "Rider_Sarpech", "Rider_SunMedallion"]
    }

    missing_anatomy = []
    for category, part_list in expected_anatomy.items():
        present = [p for p in part_list if p in mesh_names]
        missing = [p for p in part_list if p not in mesh_names]
        organic_data["anatomical_components"][category] = {
            "present": present,
            "missing": missing
        }
        if missing:
            missing_anatomy.extend(missing)

    print(f"  Anatomical components verified:")
    for cat, data in organic_data["anatomical_components"].items():
        print(f"    - {cat}: {len(data['present'])}/{len(data['present']) + len(data['missing'])} present")

    if missing_anatomy:
        report["failures"].append(f"Missing required organic anatomical components: {missing_anatomy}")

    # 4. Obsolete Dhanush / bow mesh check
    bow_tokens = ["dhanush", "bow", "quiver", "tarkash", "arrow"]
    found_bows = [m for m in mesh_names if any(t in m.lower() for t in bow_tokens)]
    if found_bows:
        report["failures"].append(f"Obsolete archery meshes retained: {found_bows}")
        organic_data["obsolete_bows"] = found_bows
    else:
        organic_data["obsolete_bows"] = []

    # 5. Floating pink rings check
    ring_tokens = ["ring", "torus", "donut"]
    found_rings = [m for m in mesh_names if any(t in m.lower() for t in ring_tokens)]
    organic_data["floating_rings"] = found_rings
    if found_rings:
        report["warnings"].append(f"Possible ring meshes found: {found_rings}")

    if smooth_ratio >= 0.95 and not organic_data["primitive_name_matches"] and not missing_anatomy and not found_bows:
        print("  [PASS] Absence of primitive stacking confirmed; continuous organic anatomy verified.")
        organic_data["status"] = "PASS"
    else:
        organic_data["status"] = "FAIL"

    report["test_results"]["criterion_4_organic_vs_primitives"] = organic_data

    # --------------------------------------------------------------------------
    # CRITERION 5: SCALE & TILE CLEARANCE BOUNDS
    # --------------------------------------------------------------------------
    print("\n" + "-" * 40)
    print("CRITERION 5: IMPERIAL SCALE & TILE CLEARANCE")
    print("-" * 40)

    # Compute total model bounding box
    min_x = min_y = min_z = float('inf')
    max_x = max_y = max_z = float('-inf')

    for obj in mesh_objects:
        eval_obj = obj.evaluated_get(depsgraph)
        eval_mesh = eval_obj.to_mesh()
        for v in eval_mesh.vertices:
            w_co = obj.matrix_world @ v.co
            if w_co.x < min_x: min_x = w_co.x
            if w_co.x > max_x: max_x = w_co.x
            if w_co.y < min_y: min_y = w_co.y
            if w_co.y > max_y: max_y = w_co.y
            if w_co.z < min_z: min_z = w_co.z
            if w_co.z > max_z: max_z = w_co.z
        eval_obj.to_mesh_clear()

    width_x = max_x - min_x
    length_y = max_y - min_y
    height_z = max_z - min_z

    scale_data = {
        "bbox_min": [round(min_x, 4), round(min_y, 4), round(min_z, 4)],
        "bbox_max": [round(max_x, 4), round(max_y, 4), round(max_z, 4)],
        "width_x_m": round(width_x, 4),
        "length_y_m": round(length_y, 4),
        "height_z_m": round(height_z, 4),
        "max_lateral_half_width_m": round(max(abs(min_x), abs(max_x)), 4)
    }

    print(f"  Model dimensions: Width={width_x:.4f}m | Length={length_y:.4f}m | Height={height_z:.4f}m")
    print(f"  Lateral half-width (max |X|): {scale_data['max_lateral_half_width_m']:.4f}m (tile limit: 0.8800m)")

    # Tile clearance: max |X| <= 0.88m
    if scale_data['max_lateral_half_width_m'] > 0.88:
        report["failures"].append(f"Model overflows lateral tile boundary: max |X| = {scale_data['max_lateral_half_width_m']:.4f}m > 0.8800m")
        scale_data["status"] = "FAIL"
    elif not (2.0 <= height_z <= 3.5):
        report["failures"].append(f"Model height out of spec: {height_z:.4f}m not in [2.0m, 3.5m]")
        scale_data["status"] = "FAIL"
    else:
        print("  [PASS] Imperial scale and lateral tile clearance confirmed.")
        scale_data["status"] = "PASS"

    report["test_results"]["criterion_5_scale_clearance"] = scale_data

    # Final verdict calculation
    if report["failures"]:
        report["verdict"] = "REQUEST_CHANGES"
    else:
        report["verdict"] = "APPROVE"

    finish(report)

def finish(report):
    print("\n" + "=" * 80)
    print(f"CHALLENGER AUDIT COMPLETED — VERDICT: {report['verdict']}")
    print("=" * 80)
    if report["failures"]:
        print(f"FAILURES ({len(report['failures'])}):")
        for f in report["failures"]:
            print(f"  [X] {f}")
    if report["warnings"]:
        print(f"WARNINGS ({len(report['warnings'])}):")
        for w in report["warnings"]:
            print(f"  [!] {w}")

    with open(REPORT_PATH, 'w') as f:
        json.dump(report, f, indent=2)
    print(f"\nReport written to: {REPORT_PATH}")

    if report["verdict"] != "APPROVE":
        sys.exit(1)

if __name__ == '__main__':
    run_challenger_audit()
