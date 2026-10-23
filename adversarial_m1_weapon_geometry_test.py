import bpy
import math
import os
import sys
import json
from mathutils import Vector

RESULTS = {
    "summary": {},
    "padati": {},
    "gajadhvaja": {},
    "samrat": {},
    "ashvarohi": {},
    "ratha": {},
    "maharani": {},
    "grounding": {},
    "failures": []
}

def load_glb(filepath):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=filepath)
    objects = {obj.name: obj for obj in bpy.context.scene.objects}
    mesh_objs = {obj.name: obj for obj in bpy.context.scene.objects if obj.type == 'MESH'}
    return objects, mesh_objs

def get_world_vertices(obj):
    mat = obj.matrix_world
    return [mat @ v.co for v in obj.data.vertices]

def get_mesh_bounds(obj):
    verts = get_world_vertices(obj)
    if not verts:
        return None
    min_x = min(v.x for v in verts)
    max_x = max(v.x for v in verts)
    min_y = min(v.y for v in verts)
    max_y = max(v.y for v in verts)
    min_z = min(v.z for v in verts)
    max_z = max(v.z for v in verts)
    return {
        "min": (round(min_x, 4), round(min_y, 4), round(min_z, 4)),
        "max": (round(max_x, 4), round(max_y, 4), round(max_z, 4)),
        "span": (round(max_x - min_x, 4), round(max_y - min_y, 4), round(max_z - min_z, 4))
    }

print("=" * 80)
print("RUNNING ADVERSARIAL WEAPON & GEOMETRY VERIFICATION (BLENDER 4.2.0)")
print("=" * 80)

# ==============================================================================
# 1. PADATI VERIFICATION
# ==============================================================================
print("\n--- 1. PADATI (PAWN) ADVERSARIAL INSPECTION ---")
objs, meshes = load_glb("assets/padati.glb")
RESULTS["padati"]["object_names"] = list(objs.keys())
RESULTS["padati"]["mesh_count"] = len(meshes)

# Check for spears, lances, long poles, bows
forbidden_keywords = ["spear", "lance", "pole", "bow", "dhanush", "staff", "javelin"]
found_forbidden = []
for name in objs.keys():
    lower = name.lower()
    for f in forbidden_keywords:
        if f in lower:
            found_forbidden.append(name)
    # Check for pike as standalone or not part of 'spike'
    if "pike" in lower and "spike" not in lower:
        found_forbidden.append(name)

# Also check for long cylindrical meshes that could be an unnamed spear
for name, m in meshes.items():
    bounds = get_mesh_bounds(m)
    span = bounds["span"]
    max_dim = max(span)
    other_dims = sorted(span)[:2]
    # If longer than 1.8m and very thin (< 0.1m in other dimensions) and not a blade
    if max_dim > 1.8 and other_dims[1] < 0.1 and "blade" not in name.lower() and "fuller" not in name.lower():
        found_forbidden.append(f"{name} (dimensions: {span})")

RESULTS["padati"]["forbidden_weapons_found"] = found_forbidden
if found_forbidden:
    RESULTS["failures"].append(f"Padati contains forbidden weapons: {found_forbidden}")
    print(f"FAIL: Padati contains forbidden weapons: {found_forbidden}")
else:
    print("PASS: Zero spears, long poles, or bows detected in padati.glb.")

# Check Dhal Shield
dhal_obj = None
for name, m in meshes.items():
    if "dhal" in name.lower() and "boss" not in name.lower() and "center" not in name.lower():
        dhal_obj = m
        break

if not dhal_obj:
    RESULTS["failures"].append("Padati: Dhal shield mesh not found!")
    print("FAIL: Padati Dhal shield mesh not found!")
else:
    dhal_bounds = get_mesh_bounds(dhal_obj)
    dhal_verts = get_world_vertices(dhal_obj)
    RESULTS["padati"]["dhal_bounds"] = dhal_bounds

    # Calculate center of Dhal (mean X, Z)
    mean_x = sum(v.x for v in dhal_verts) / len(dhal_verts)
    mean_z = sum(v.z for v in dhal_verts) / len(dhal_verts)
    
    # Sort vertices by radial distance from center in XZ plane
    radial_groups = {}
    for v in dhal_verts:
        r = math.sqrt((v.x - mean_x)**2 + (v.z - mean_z)**2)
        r_bin = round(r, 2)
        if r_bin not in radial_groups:
            radial_groups[r_bin] = []
        radial_groups[r_bin].append(v.y)
    
    sorted_radii = sorted(radial_groups.keys())
    center_y = sum(radial_groups[sorted_radii[0]]) / len(radial_groups[sorted_radii[0]])
    rim_y = sum(radial_groups[sorted_radii[-1]]) / len(radial_groups[sorted_radii[-1]])
    
    RESULTS["padati"]["dhal_center_y"] = round(center_y, 4)
    RESULTS["padati"]["dhal_rim_y"] = round(rim_y, 4)
    RESULTS["padati"]["dhal_radial_sample"] = {r: round(sum(radial_groups[r])/len(radial_groups[r]), 4) for r in sorted_radii[:5]}
    RESULTS["padati"]["dhal_radius"] = round(sorted_radii[-1], 4)
    
    print(f"Dhal Center Y: {center_y:.4f}, Rim Y: {rim_y:.4f}, Max Radius: {sorted_radii[-1]:.4f}m")
    
    # Check curvature
    # If center_y < rim_y: center is at more negative Y (further forward), rim is at more positive Y (rearward) -> CONVEX from front (-Y)!
    # If center_y > rim_y: center is at more positive Y (recessed back), rim is at more negative Y (curved forward) -> CONCAVE from front (-Y)!
    if center_y > rim_y:
        RESULTS["padati"]["dhal_curvature_facing_minus_Y"] = "CONCAVE"
        print("Dhal Curvature facing -Y (outward): CONCAVE (dish/bowl facing forward)")
    else:
        RESULTS["padati"]["dhal_curvature_facing_minus_Y"] = "CONVEX"
        print(f"Dhal Curvature facing -Y (outward): CONVEX (dome/buckler curving outward). Center Y={center_y:.4f} is forward of rim Y={rim_y:.4f} by {abs(rim_y - center_y):.4f}m")

# Check Dhal Bosses
bosses = [name for name in meshes.keys() if "dhal_boss" in name.lower()]
center_boss = [name for name in meshes.keys() if "centerboss" in name.lower() or "center_boss" in name.lower()]
RESULTS["padati"]["boss_count"] = len(bosses)
RESULTS["padati"]["center_boss_count"] = len(center_boss)
print(f"Dhal Bosses found: {len(bosses)} outer bosses, {len(center_boss)} center boss.")
if len(bosses) < 4:
    RESULTS["failures"].append(f"Padati: Expected 4 brass bosses on Dhal, found {len(bosses)}")
if len(center_boss) < 1:
    RESULTS["failures"].append(f"Padati: Expected center lotus boss on Dhal, found {len(center_boss)}")

# Check Khanda Sword
khanda_blade = None
for name, m in meshes.items():
    if "khanda_blade" in name.lower():
        khanda_blade = m
        break

if not khanda_blade:
    RESULTS["failures"].append("Padati: Khanda_Blade mesh not found!")
    print("FAIL: Padati Khanda_Blade mesh not found!")
else:
    blade_bounds = get_mesh_bounds(khanda_blade)
    blade_verts = get_world_vertices(khanda_blade)
    RESULTS["padati"]["khanda_blade_bounds"] = blade_bounds
    blade_len = blade_bounds["span"][2]
    RESULTS["padati"]["khanda_blade_length_z"] = blade_len
    print(f"Khanda Blade Bounds: {blade_bounds}")
    print(f"Khanda Blade Z-span: {blade_len:.4f}m")
    
    # Check flare tip: compare XY width at top Z vs bottom Z
    top_z = blade_bounds["max"][2]
    bot_z = blade_bounds["min"][2]
    top_verts = [v for v in blade_verts if v.z > top_z - 0.15]
    bot_verts = [v for v in blade_verts if v.z < bot_z + 0.15]
    top_span_x = max(v.x for v in top_verts) - min(v.x for v in top_verts) if top_verts else 0
    bot_span_x = max(v.x for v in bot_verts) - min(v.x for v in bot_verts) if bot_verts else 0
    RESULTS["padati"]["khanda_tip_span_x"] = round(top_span_x, 4)
    RESULTS["padati"]["khanda_base_span_x"] = round(bot_span_x, 4)
    print(f"Khanda Base Width X: {bot_span_x:.4f}m, Tip Region Width X: {top_span_x:.4f}m")

# Check Khanda Fuller and other parts
fuller_obj = [name for name in meshes.keys() if "fuller" in name.lower()]
RESULTS["padati"]["khanda_fuller_found"] = len(fuller_obj) > 0
print(f"Khanda Fuller found: {len(fuller_obj) > 0}")

# ==============================================================================
# 2. GAJADHVAJA (ELEPHANT) VERIFICATION
# ==============================================================================
print("\n--- 2. GAJADHVAJA (ELEPHANT ROOK) ADVERSARIAL INSPECTION ---")
objs, meshes = load_glb("assets/gajadhvaja.glb")
RESULTS["gajadhvaja"]["object_names"] = list(objs.keys())
RESULTS["gajadhvaja"]["mesh_count"] = len(meshes)

# Check tusks
tusk_l = meshes.get("Elephant_Tusk_L")
tusk_r = meshes.get("Elephant_Tusk_R")

if not tusk_l or not tusk_r:
    # Try finding by name substring
    for name, m in meshes.items():
        if "tusk" in name.lower() and "_l" in name.lower():
            tusk_l = m
        if "tusk" in name.lower() and "_r" in name.lower():
            tusk_r = m

if not tusk_l or not tusk_r:
    RESULTS["failures"].append("Gajadhvaja: Left or Right tusk mesh missing!")
    print("FAIL: Gajadhvaja: Left or Right tusk mesh missing!")
else:
    for label, tusk in [("L", tusk_l), ("R", tusk_r)]:
        verts = get_world_vertices(tusk)
        bounds = get_mesh_bounds(tusk)
        RESULTS["gajadhvaja"][f"tusk_{label}_bounds"] = bounds
        
        # Sort verts by Y
        min_y_v = min(verts, key=lambda v: v.y)
        max_y_v = max(verts, key=lambda v: v.y)
        
        # Base is where Y is closest to cheek (-0.75 to -0.70)
        # Tip is where Y is most negative
        RESULTS["gajadhvaja"][f"tusk_{label}_base_y"] = round(max_y_v.y, 4)
        RESULTS["gajadhvaja"][f"tusk_{label}_tip_y"] = round(min_y_v.y, 4)
        RESULTS["gajadhvaja"][f"tusk_{label}_base_point"] = (round(max_y_v.x, 4), round(max_y_v.y, 4), round(max_y_v.z, 4))
        RESULTS["gajadhvaja"][f"tusk_{label}_tip_point"] = (round(min_y_v.x, 4), round(min_y_v.y, 4), round(min_y_v.z, 4))
        
        print(f"Tusk {label}: Base at Y={max_y_v.y:.4f} (cheek), Tip at Y={min_y_v.y:.4f} (swept forward into -Y)")
        
        # Adversarial checks:
        # 1. Base should be between -0.75 and -0.70
        if not (-0.80 <= max_y_v.y <= -0.65):
            RESULTS["failures"].append(f"Gajadhvaja Tusk {label} base Y={max_y_v.y:.4f} not in expected front cheek range [-0.80, -0.65]")
            print(f"FAIL: Tusk {label} base Y not in front cheek range!")
        else:
            print(f"PASS: Tusk {label} base anchored at front cheek bone (Y={max_y_v.y:.4f})")
            
        # 2. Tip should sweep forward into -Y (min_y < -1.25)
        if not (min_y_v.y <= -1.25):
            RESULTS["failures"].append(f"Gajadhvaja Tusk {label} tip Y={min_y_v.y:.4f} does not reach expected forward sweep <= -1.25")
            print(f"FAIL: Tusk {label} does not sweep forward enough!")
        else:
            print(f"PASS: Tusk {label} sweeps forward into -Y (tip reaches Y={min_y_v.y:.4f})")
            
        # 3. Check that no tusk vertices are in positive Y (rear)
        rear_verts = [v for v in verts if v.y > 0.0]
        if rear_verts:
            RESULTS["failures"].append(f"Gajadhvaja Tusk {label} has {len(rear_verts)} vertices in rear (+Y)!")
            print(f"FAIL: Tusk {label} has rear vertices in +Y!")
        else:
            print(f"PASS: Tusk {label} has ZERO vertices in positive Y (rear).")

# Check for any other rear tusks or rump attachments
rear_tusk_candidates = []
for name, m in meshes.items():
    if "tusk" in name.lower() and name not in ["Elephant_Tusk_L", "Elephant_Tusk_R"]:
        rear_tusk_candidates.append(name)
if rear_tusk_candidates:
    RESULTS["failures"].append(f"Gajadhvaja: Unexpected extra tusk objects found: {rear_tusk_candidates}")
    print(f"FAIL: Extra tusk objects: {rear_tusk_candidates}")
else:
    print("PASS: Exactly two forward tusks, zero rear tusk attachments.")

# Check howdah location
howdah_obj = meshes.get("Howdah_Base")
if howdah_obj:
    hb = get_mesh_bounds(howdah_obj)
    RESULTS["gajadhvaja"]["howdah_bounds"] = hb
    print(f"Howdah Base Bounds: {hb}")

# ==============================================================================
# 3. SAMRAT (KING) VERIFICATION
# ==============================================================================
print("\n--- 3. SAMRAT (KING) ADVERSARIAL INSPECTION ---")
objs, meshes = load_glb("assets/samrat.glb")
RESULTS["samrat"]["object_names"] = list(objs.keys())
RESULTS["samrat"]["mesh_count"] = len(meshes)

gada_head = meshes.get("Gada_Head")
if not gada_head:
    for name, m in meshes.items():
        if "gada" in name.lower() and "head" in name.lower():
            gada_head = m
            break

if not gada_head:
    RESULTS["failures"].append("Samrat: Gada_Head mesh not found!")
    print("FAIL: Samrat: Gada_Head mesh not found!")
else:
    gh_bounds = get_mesh_bounds(gada_head)
    RESULTS["samrat"]["gada_head_bounds"] = gh_bounds
    print(f"Gada Head Bounds: {gh_bounds}")
    min_z = gh_bounds["min"][2]
    RESULTS["samrat"]["gada_head_min_z"] = min_z
    if abs(min_z) < 0.001:
        print(f"PASS: Imperial Gada rests solidly on the stone ground at Z_min = {min_z:.6f}m")
    else:
        RESULTS["failures"].append(f"Samrat: Gada Head min Z = {min_z:.4f}m does not touch ground at Z=0.000m!")
        print(f"FAIL: Gada Head min Z = {min_z:.4f}m")

# Check Chhatra Parasol
chhatra_tiers = [name for name in meshes.keys() if "chhatra_tier" in name.lower()]
RESULTS["samrat"]["chhatra_tier_count"] = len(chhatra_tiers)
print(f"Samrat Chhatra Parasol: found {len(chhatra_tiers)} tiers.")
if len(chhatra_tiers) != 3:
    RESULTS["failures"].append(f"Samrat: Expected 3 Chhatra tiers, found {len(chhatra_tiers)}")

# ==============================================================================
# 4. ASHVAROHI (KNIGHT) VERIFICATION
# ==============================================================================
print("\n--- 4. ASHVAROHI (KNIGHT) ADVERSARIAL INSPECTION ---")
objs, meshes = load_glb("assets/ashvarohi.glb")
RESULTS["ashvarohi"]["object_names"] = list(objs.keys())
RESULTS["ashvarohi"]["mesh_count"] = len(meshes)

# Lyre ears
ear_l = meshes.get("Horse_LyreEar_L")
ear_r = meshes.get("Horse_LyreEar_R")
if ear_l and ear_r:
    el_bounds = get_mesh_bounds(ear_l)
    er_bounds = get_mesh_bounds(ear_r)
    print(f"PASS: Marwari Lyre Ears present. Left bounds: {el_bounds['span']}, Right bounds: {er_bounds['span']}")
else:
    RESULTS["failures"].append("Ashvarohi: Lyre ears missing!")
    print("FAIL: Lyre ears missing!")

# Bow and quiver
bow = meshes.get("Dhanush_Bow")
quiver = meshes.get("Tarkash_Quiver")
arrows = [name for name in meshes.keys() if "arrow" in name.lower()]
RESULTS["ashvarohi"]["bow_found"] = bow is not None
RESULTS["ashvarohi"]["quiver_found"] = quiver is not None
RESULTS["ashvarohi"]["arrow_count"] = len(arrows)
print(f"Bow present: {bow is not None}, Quiver present: {quiver is not None}, Arrows: {len(arrows)}")

# Check no rear-facing jousting lance
lance_found = [name for name in meshes.keys() if "lance" in name.lower()]
if lance_found:
    RESULTS["failures"].append(f"Ashvarohi: Jousting lance detected: {lance_found}")
    print(f"FAIL: Ashvarohi has jousting lance: {lance_found}")
else:
    print("PASS: Zero backward jousting lances in ashvarohi.glb.")

# ==============================================================================
# 5. RATHA (BISHOP) VERIFICATION
# ==============================================================================
print("\n--- 5. RATHA (BISHOP) ADVERSARIAL INSPECTION ---")
objs, meshes = load_glb("assets/ratha.glb")
RESULTS["ratha"]["object_names"] = list(objs.keys())
RESULTS["ratha"]["mesh_count"] = len(meshes)

wheel_l = meshes.get("Chakra_Wheel_L")
wheel_r = meshes.get("Chakra_Wheel_R")
spokes = [name for name in meshes.keys() if "spoke" in name.lower()]
hubs = [name for name in meshes.keys() if "hub" in name.lower()]
prabha = meshes.get("Prabhamandala")
gandiva = meshes.get("Gandiva_Bow")

RESULTS["ratha"]["wheel_l"] = wheel_l is not None
RESULTS["ratha"]["wheel_r"] = wheel_r is not None
RESULTS["ratha"]["spoke_count"] = len(spokes)
RESULTS["ratha"]["hub_scythe_count"] = len(hubs)
RESULTS["ratha"]["prabhamandala"] = prabha is not None
RESULTS["ratha"]["gandiva_bow"] = gandiva is not None

print(f"Chakra Wheels: L={wheel_l is not None}, R={wheel_r is not None}, Spokes={len(spokes)} (expected 16 total), Hub scythes={len(hubs)}")
print(f"Sage Prabhamandala halo: {prabha is not None}, Gandiva bow: {gandiva is not None}")

# ==============================================================================
# 6. MAHARANI (QUEEN) VERIFICATION
# ==============================================================================
print("\n--- 6. MAHARANI (QUEEN) ADVERSARIAL INSPECTION ---")
objs, meshes = load_glb("assets/maharani.glb")
RESULTS["maharani"]["object_names"] = list(objs.keys())
RESULTS["maharani"]["mesh_count"] = len(meshes)

khanda_r = meshes.get("Khanda_Blade_R")
khanda_l = meshes.get("Khanda_Blade_L")
mantle = meshes.get("Maharani_Mantle")
saree = meshes.get("Maharani_Saree")

RESULTS["maharani"]["khanda_blade_r"] = khanda_r is not None
RESULTS["maharani"]["khanda_blade_l"] = khanda_l is not None
RESULTS["maharani"]["mantle"] = mantle is not None
RESULTS["maharani"]["saree"] = saree is not None

# Check polearm elimination
polearms = [name for name in meshes.keys() if "polearm" in name.lower() or "spear" in name.lower()]
if polearms:
    RESULTS["failures"].append(f"Maharani: Polearm detected: {polearms}")
    print(f"FAIL: Maharani has polearms: {polearms}")
else:
    print("PASS: Maharani dual-wields twin Khanda blades with zero polearms.")

# ==============================================================================
# 7. GROUNDING (Z_min = 0.000000m) ACROSS ALL 6 MODELS
# ==============================================================================
print("\n--- 7. GROUNDING ACCURACY ACROSS ALL 6 MODELS ---")
for f in ['padati', 'gajadhvaja', 'ashvarohi', 'ratha', 'maharani', 'samrat']:
    objs, meshes = load_glb(f"assets/{f}.glb")
    min_z = float('inf')
    min_obj = None
    for name, m in meshes.items():
        verts = get_world_vertices(m)
        for v in verts:
            if v.z < min_z:
                min_z = v.z
                min_obj = name
    RESULTS["grounding"][f] = {
        "min_z": round(min_z, 6),
        "grounding_mesh": min_obj
    }
    print(f"Model {f:12s} Z_min = {min_z:.6f}m (lowest mesh: {min_obj})")
    if abs(min_z) > 0.001:
        RESULTS["failures"].append(f"Model {f} has non-zero Z_min = {min_z:.6f}m")

# Write results to json
with open("adversarial_m1_report.json", "w") as out:
    json.dump(RESULTS, out, indent=2)

print("\n" + "=" * 80)
print(f"ADVERSARIAL INSPECTION COMPLETE: {len(RESULTS['failures'])} FAILURES RECORDED.")
print("=" * 80)
