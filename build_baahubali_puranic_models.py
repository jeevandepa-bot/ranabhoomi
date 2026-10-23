r"""
Build Baahubali Puranic Character Models (Master 3D Organic Sculpting Pipeline)
Author: Milestone 1 Worker (worker_m1_1)
Target: Blender 4.2.0 LTS (Headless CLI)
Usage:
    & "C:\Users\Jeevan\blender-4.2.0-windows-x64\blender.exe" --background --python build_baahubali_puranic_models.py

Outputs:
    assets/padati.glb      - Vedic Kshatriya foot soldier (Khanda & Dhal, zero spears)
    assets/gajadhvaja.glb  - Royal war elephant (Forward cheek tusks, snug howdah, zero rear tusks)
    assets/ashvarohi.glb   - Marwari warhorse & Dragoon archer (Dhanush bow, Tarkash quiver)
    assets/ratha.glb       - War chariot & Sage archer (Dual 8-spoked Chakra wheels, Prabhamandala)
    assets/maharani.glb    - Warrior queen (Twin curved Khanda blades, pleated saree, silk mantle)
    assets/samrat.glb      - Chakravarti emperor (3-tiered Chhatra parasol, grounded Gada mace)
"""

import bpy
import bmesh
import math
import mathutils
from mathutils import Vector, Matrix
import os

TEXTURE_DIR = os.path.abspath('assets/textures')

# ==============================================================================
# SCENE & MATERIAL UTILITIES
# ==============================================================================
def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def create_pbr_material(name, base_color=(0.8, 0.8, 0.8, 1.0), metallic=0.0, roughness=0.5, texture_path=None, emissive_color=None, emissive_intensity=2.5):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new(type='ShaderNodeOutputMaterial')
    bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = base_color
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness

    if texture_path and os.path.exists(texture_path):
        try:
            tex_node = nodes.new(type='ShaderNodeTexImage')
            tex_node.image = bpy.data.images.load(texture_path)
            links.new(tex_node.outputs['Color'], bsdf.inputs['Base Color'])
        except Exception as e:
            print(f"Warning loading texture {texture_path}: {e}")

    if emissive_color:
        bsdf.inputs['Emission Color'].default_value = emissive_color
        bsdf.inputs['Emission Strength'].default_value = emissive_intensity

    links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
    return mat

# ==============================================================================
# PROCEDURAL ORGANIC GEOMETRY BUILDERS (ZERO BLOCKY PRIMITIVES)
# ==============================================================================
def create_organic_lofted_mesh(name, rings, num_segments=20, material=None, subsurf_levels=1, cap_bottom=False, cap_top=False):
    """
    Lofts smooth organic forms across cross-sectional ring profiles.
    rings format: [(z, rx, ry, ox, oy, pleats, p_depth), ...]
    """
    bm = bmesh.new()
    prev_ring = []

    for r_idx, r_data in enumerate(rings):
        z = r_data[0]
        rx = r_data[1]
        ry = r_data[2] if len(r_data) > 2 else rx
        ox = r_data[3] if len(r_data) > 3 else 0.0
        oy = r_data[4] if len(r_data) > 4 else 0.0
        pleats = r_data[5] if len(r_data) > 5 else 0
        p_depth = r_data[6] if len(r_data) > 6 else 0.0

        current_ring = []
        for i in range(num_segments):
            angle = (2.0 * math.pi * i) / num_segments
            r_mod = 1.0 + (p_depth * math.cos(pleats * angle) if pleats > 0 else 0.0)
            vx = ox + rx * r_mod * math.cos(angle)
            vy = oy + ry * r_mod * math.sin(angle)
            vz = z
            current_ring.append(bm.verts.new((vx, vy, vz)))

        if prev_ring:
            for i in range(num_segments):
                v1 = prev_ring[i]
                v2 = prev_ring[(i + 1) % num_segments]
                v3 = current_ring[(i + 1) % num_segments]
                v4 = current_ring[i]
                bm.faces.new((v1, v2, v3, v4))
        elif cap_bottom:
            b_center = bm.verts.new((ox, oy, z))
            for i in range(num_segments):
                bm.faces.new((b_center, current_ring[(i + 1) % num_segments], current_ring[i]))

        prev_ring = current_ring

    if cap_top and prev_ring:
        last_r = rings[-1]
        t_center = bm.verts.new((last_r[3] if len(last_r) > 3 else 0.0, last_r[4] if len(last_r) > 4 else 0.0, last_r[0]))
        for i in range(num_segments):
            bm.faces.new((t_center, prev_ring[i], prev_ring[(i + 1) % num_segments]))

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    for p in mesh.polygons:
        p.use_smooth = True

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)

    if subsurf_levels > 0:
        sub = obj.modifiers.new(name="Subsurf", type='SUBSURF')
        sub.levels = subsurf_levels
        sub.render_levels = subsurf_levels

    if material:
        obj.data.materials.append(material)

    return obj

def create_swept_tube(name, spine_points, radii, num_segments=16, material=None, subsurf_levels=1, cap_ends=True):
    """
    Sweeps a smooth circular tube along a 3D spline curve with varying radii.
    Spine points: list of mathutils.Vector((x, y, z))
    Radii: list of floats matching spine points count
    """
    bm = bmesh.new()
    n_pts = len(spine_points)
    if n_pts < 2:
        return None

    # Compute tangents
    tangents = []
    for i in range(n_pts):
        if i == 0:
            t = (spine_points[1] - spine_points[0]).normalized()
        elif i == n_pts - 1:
            t = (spine_points[-1] - spine_points[-2]).normalized()
        else:
            t = (spine_points[i + 1] - spine_points[i - 1]).normalized()
        tangents.append(t)

    # Initial frame
    t0 = tangents[0]
    up = Vector((0, 0, 1)) if abs(t0.z) < 0.9 else Vector((0, 1, 0))
    n0 = t0.cross(up).normalized()
    b0 = t0.cross(n0).normalized()

    frames = [(n0, b0)]
    for i in range(1, n_pts):
        t_prev = tangents[i - 1]
        t_curr = tangents[i]
        axis = t_prev.cross(t_curr)
        if axis.length > 1e-5:
            axis.normalize()
            ang = t_prev.angle(t_curr)
            q = mathutils.Quaternion(axis, ang)
            ni = q @ frames[-1][0]
            bi = q @ frames[-1][1]
        else:
            ni = frames[-1][0]
            bi = frames[-1][1]
        frames.append((ni.normalized(), bi.normalized()))

    prev_ring = []
    for i in range(n_pts):
        pt = spine_points[i]
        r = radii[i]
        ni, bi = frames[i]
        curr_ring = []
        for j in range(num_segments):
            theta = (2.0 * math.pi * j) / num_segments
            offset = r * (math.cos(theta) * ni + math.sin(theta) * bi)
            v = bm.verts.new(pt + offset)
            curr_ring.append(v)

        if prev_ring:
            for j in range(num_segments):
                v1 = prev_ring[j]
                v2 = prev_ring[(j + 1) % num_segments]
                v3 = curr_ring[(j + 1) % num_segments]
                v4 = curr_ring[j]
                bm.faces.new((v1, v2, v3, v4))
        elif cap_ends:
            c_v = bm.verts.new(pt)
            for j in range(num_segments):
                bm.faces.new((c_v, curr_ring[(j + 1) % num_segments], curr_ring[j]))

        prev_ring = curr_ring

    if cap_ends and prev_ring:
        c_v = bm.verts.new(spine_points[-1])
        for j in range(num_segments):
            bm.faces.new((c_v, prev_ring[j], prev_ring[(j + 1) % num_segments]))

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    for p in mesh.polygons:
        p.use_smooth = True

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)

    if subsurf_levels > 0:
        sub = obj.modifiers.new(name="Subsurf", type='SUBSURF')
        sub.levels = subsurf_levels
        sub.render_levels = subsurf_levels

    if material:
        obj.data.materials.append(material)

    return obj

def create_concave_dhal_mesh(name, center, radius=0.36, depth=0.04, num_rings=6, num_segments=24, material=None):
    """
    Creates an authentic Rajput Dhal concave shield facing -Y.
    """
    bm = bmesh.new()
    cx, cy, cz = center
    ring_verts = []

    for r_idx in range(num_rings):
        frac = r_idx / (num_rings - 1)
        r = radius * frac
        # Parabolic concavity: center is pushed back (+Y), rim curves forward (-Y)
        y_offset = cy + depth * (frac * frac)
        curr_ring = []
        for i in range(num_segments):
            theta = (2.0 * math.pi * i) / num_segments
            vx = cx + r * math.cos(theta)
            vy = y_offset
            vz = cz + r * math.sin(theta)
            curr_ring.append(bm.verts.new((vx, vy, vz)))
        ring_verts.append(curr_ring)

    for r_idx in range(num_rings - 1):
        r1 = ring_verts[r_idx]
        r2 = ring_verts[r_idx + 1]
        for i in range(num_segments):
            bm.faces.new((r1[i], r1[(i + 1) % num_segments], r2[(i + 1) % num_segments], r2[i]))

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    for p in mesh.polygons:
        p.use_smooth = True

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)

    sub = obj.modifiers.new(name="Subsurf", type='SUBSURF')
    sub.levels = 1
    sub.render_levels = 1

    if material:
        obj.data.materials.append(material)
    return obj

def create_fluted_head_mesh(name, center, base_r, max_r, height, num_flutes=8, flute_depth=0.035, material=None, subsurf_levels=1):
    """
    Creates a fluted ceremonial Gada mace head.
    """
    rings = []
    num_steps = 8
    cz = center[2]
    ox, oy = center[0], center[1]

    for s in range(num_steps + 1):
        frac = s / num_steps
        z = cz + height * frac
        # Ellipsoidal radius profile
        r = base_r + (max_r - base_r) * math.sin(frac * math.pi)
        rings.append((z, r, r, ox, oy, num_flutes, flute_depth))

    return create_organic_lofted_mesh(name, rings, num_segments=24, material=material, subsurf_levels=subsurf_levels, cap_bottom=True, cap_top=True)

# ==============================================================================
# GLOBAL TRANSFORM FREEZING & GROUNDING TO ZERO
# ==============================================================================
def ground_all_objects_to_zero():
    """
    Calculates global min Z across all evaluated vertices (including Subsurf modifiers)
    and translates all meshes so lowest vertex is at Z = 0.000m.
    Applies all location, rotation, and scale transforms.
    """
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    mesh_objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for obj in mesh_objs:
        if obj.data.shape_keys:
            obj.shape_key_clear()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    min_z = float('inf')
    for obj in mesh_objs:
        eval_obj = obj.evaluated_get(depsgraph)
        eval_mesh = eval_obj.to_mesh()
        for v in eval_mesh.vertices:
            world_pos = obj.matrix_world @ v.co
            min_z = min(min_z, world_pos.z)
        eval_obj.to_mesh_clear()

    if min_z != float('inf') and abs(min_z) > 1e-6:
        offset = -min_z
        for obj in mesh_objs:
            obj.location.z += offset
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    # Final verify with updated depsgraph
    depsgraph.update()
    new_min_z = float('inf')
    for obj in mesh_objs:
        eval_obj = obj.evaluated_get(depsgraph)
        eval_mesh = eval_obj.to_mesh()
        for v in eval_mesh.vertices:
            world_pos = obj.matrix_world @ v.co
            new_min_z = min(new_min_z, world_pos.z)
        eval_obj.to_mesh_clear()
    print(f"Grounding complete. Scene Z_min = {new_min_z:.6f}m across {len(mesh_objs)} meshes.")

def export_glb(filepath):
    ground_all_objects_to_zero()
    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=False,
        export_apply=True
    )
    print(f"Successfully Exported Grounded Puranic Model: {filepath}")

# ==============================================================================
# 1. PADATI (PAWN) — VEDIC KSHATRIYA SOLDIER (KHANDA & DHAL, ZERO SPEARS)
# ==============================================================================
def build_organic_padati():
    clear_scene()
    print("Building Padati (Pawn)...")
    gold_mat = create_pbr_material("KavachaGold", (0.95, 0.78, 0.22, 1), 0.88, 0.16, os.path.join(TEXTURE_DIR, 'kavacha_gold.png'))
    dhoti_mat = create_pbr_material("DhotiSilk", (0.95, 0.55, 0.12, 1), 0.10, 0.65, os.path.join(TEXTURE_DIR, 'dhoti_silk.png'))
    steel_mat = create_pbr_material("DamascusSteel", (0.20, 0.22, 0.28, 1), 0.80, 0.35, os.path.join(TEXTURE_DIR, 'damascus_steel.png'))
    skin_mat = create_pbr_material("KshatriyaSkin", (0.76, 0.52, 0.38, 1), 0.05, 0.55)

    # 1. Pleated Silk Dhoti (Facing -Y)
    dhoti_rings = [
        (0.24, 0.32, 0.24, 0.0, 0.00, 10, 0.18),  # lower calf hem
        (0.44, 0.36, 0.26, 0.0, -0.01, 10, 0.15), # mid-shin
        (0.68, 0.38, 0.28, 0.0, -0.02, 8, 0.12),  # knee / thigh
        (0.88, 0.36, 0.25, 0.0, -0.01, 6, 0.08),  # waist / waistband
    ]
    create_organic_lofted_mesh("Padati_Dhoti", dhoti_rings, num_segments=20, material=dhoti_mat, subsurf_levels=1)

    # 2. Organic Muscular Legs & Feet grounded at Z = 0.000m
    for x_side, side_label in [(-0.14, "L"), (0.14, "R")]:
        leg_rings = [
            (0.00, 0.08, 0.13, x_side, -0.03), # foot sole on ground
            (0.06, 0.06, 0.07, x_side, 0.00),  # ankle
            (0.24, 0.08, 0.08, x_side, 0.01),  # calf
            (0.48, 0.09, 0.09, x_side, 0.00),  # knee
        ]
        create_organic_lofted_mesh(f"Padati_Leg_{side_label}", leg_rings, num_segments=16, material=skin_mat, subsurf_levels=1)

        cuff_rings = [(0.06, 0.075, 0.075, x_side, 0.0), (0.12, 0.075, 0.075, x_side, 0.0)]
        create_organic_lofted_mesh(f"Padati_Kada_{side_label}", cuff_rings, num_segments=16, material=gold_mat, subsurf_levels=0)

    # 3. Surya Kavacha Cuirass (Facing -Y)
    torso_rings = [
        (0.86, 0.30, 0.21, 0.0, -0.01),
        (1.02, 0.34, 0.23, 0.0, -0.02),
        (1.18, 0.38, 0.24, 0.0, -0.02),
        (1.30, 0.34, 0.21, 0.0, -0.01),
    ]
    create_organic_lofted_mesh("Padati_Kavacha", torso_rings, num_segments=20, material=gold_mat, subsurf_levels=1)

    # Surya Sun Emblem on Kavacha Chest (embossed facing -Y)
    sun_rings = [
        (1.15, 0.13, 0.13, 0.0, -0.22, 12, 0.12),
        (1.15, 0.14, 0.14, 0.0, -0.23, 12, 0.08),
        (1.15, 0.02, 0.02, 0.0, -0.24)
    ]
    create_organic_lofted_mesh("SuryaEmblem", sun_rings, num_segments=16, material=gold_mat, subsurf_levels=0, cap_top=True)

    # 4. Muscular Arms
    # Left Arm (Holding Dhal Shield at forearm)
    arm_l_spine = [
        Vector((-0.34, 0.00, 1.28)),
        Vector((-0.36, -0.08, 1.12)),
        Vector((-0.34, -0.16, 0.98)),
        Vector((-0.32, -0.20, 0.94))
    ]
    create_swept_tube("Padati_ArmL", arm_l_spine, [0.08, 0.07, 0.065, 0.055], num_segments=12, material=skin_mat, subsurf_levels=1)

    # Right Arm (Gripping Khanda Sword)
    arm_r_spine = [
        Vector((0.34, 0.00, 1.28)),
        Vector((0.36, -0.08, 1.12)),
        Vector((0.36, -0.16, 0.98)),
        Vector((0.38, -0.18, 0.95))
    ]
    create_swept_tube("Padati_ArmR", arm_r_spine, [0.08, 0.07, 0.065, 0.055], num_segments=12, material=skin_mat, subsurf_levels=1)

    # 5. Neck, Head & Kshatriya Shirastra Helm
    neck_rings = [(1.30, 0.11, 0.11, 0.0, -0.01), (1.38, 0.10, 0.10, 0.0, -0.01)]
    create_organic_lofted_mesh("Padati_Neck", neck_rings, num_segments=12, material=skin_mat, subsurf_levels=1)

    head_rings = [
        (1.38, 0.12, 0.13, 0.0, -0.02),
        (1.48, 0.14, 0.15, 0.0, -0.02),
        (1.58, 0.14, 0.14, 0.0, -0.01)
    ]
    create_organic_lofted_mesh("Padati_Head", head_rings, num_segments=16, material=skin_mat, subsurf_levels=1)

    helm_rings = [
        (1.48, 0.16, 0.17, 0.0, -0.01),
        (1.60, 0.15, 0.15, 0.0, 0.00),
        (1.75, 0.07, 0.07, 0.0, 0.02),
        (1.88, 0.02, 0.02, 0.0, 0.04)
    ]
    create_organic_lofted_mesh("Padati_Helm", helm_rings, num_segments=16, material=gold_mat, subsurf_levels=1)

    # Plume billowing backward (+Y)
    plume_spine = [
        Vector((0.0, 0.04, 1.84)),
        Vector((0.0, 0.12, 1.94)),
        Vector((0.0, 0.20, 1.86))
    ]
    create_swept_tube("Padati_Plume", plume_spine, [0.035, 0.055, 0.02], num_segments=10, material=dhoti_mat, subsurf_levels=1)

    # 6. Rajput Dhal Shield on Left Arm (Radius 0.36m, depth 0.04m, facing -Y)
    create_concave_dhal_mesh("Padati_Dhal", center=(-0.36, -0.22, 0.95), radius=0.36, depth=0.04, material=gold_mat)

    # Central 8-Petal Lotus Boss on Shield
    lotus_rings = [
        (0.95, 0.065, 0.065, -0.36, -0.24, 8, 0.22),
        (0.95, 0.040, 0.040, -0.36, -0.26),
        (0.95, 0.010, 0.010, -0.36, -0.27)
    ]
    create_organic_lofted_mesh("Padati_Dhal_CenterBoss", lotus_rings, num_segments=16, material=gold_mat, subsurf_levels=1, cap_top=True)

    # 4 Brass Boss Hemispheres at radius 0.16m
    for i in range(4):
        ang = i * (math.pi / 2.0)
        bx = -0.36 + 0.16 * math.cos(ang)
        bz = 0.95 + 0.16 * math.sin(ang)
        boss_rings = [
            (bz, 0.035, 0.035, bx, -0.23),
            (bz, 0.025, 0.025, bx, -0.25),
            (bz, 0.005, 0.005, bx, -0.26)
        ]
        create_organic_lofted_mesh(f"Padati_Dhal_Boss_{i}", boss_rings, num_segments=12, material=gold_mat, subsurf_levels=1, cap_top=True)

    # 7. Authentic Curved Khanda Broadsword in Right Hand (Zero Spears!)
    # Grip / Hilt
    grip_spine = [Vector((0.38, -0.18, 0.88)), Vector((0.38, -0.18, 1.08))]
    create_swept_tube("Khanda_Grip", grip_spine, [0.024, 0.024], num_segments=12, material=steel_mat, subsurf_levels=0)

    # Saucer Disc Pommel
    pommel_rings = [
        (0.88, 0.065, 0.065, 0.38, -0.18),
        (0.86, 0.065, 0.065, 0.38, -0.18),
        (0.85, 0.020, 0.020, 0.38, -0.18)
    ]
    create_organic_lofted_mesh("Khanda_Pommel", pommel_rings, num_segments=16, material=gold_mat, subsurf_levels=1, cap_bottom=True)

    # Pommel Spike
    spike_spine = [Vector((0.38, -0.18, 0.85)), Vector((0.38, -0.18, 0.78))]
    create_swept_tube("Khanda_PommelSpike", spike_spine, [0.018, 0.002], num_segments=8, material=gold_mat, subsurf_levels=0)

    # Reinforced Crossguard
    guard_rings = [
        (1.08, 0.14, 0.035, 0.38, -0.18),
        (1.11, 0.16, 0.040, 0.38, -0.18),
        (1.13, 0.12, 0.032, 0.38, -0.18)
    ]
    create_organic_lofted_mesh("Khanda_Guard", guard_rings, num_segments=12, material=gold_mat, subsurf_levels=1)

    # 0.85m Broad Steel Khanda Blade with curved flare tip
    blade_spine = [
        Vector((0.38, -0.18, 1.13)),
        Vector((0.38, -0.19, 1.40)),
        Vector((0.38, -0.20, 1.70)),
        Vector((0.38, -0.22, 1.95)),
        Vector((0.38, -0.25, 2.08))  # flared tip
    ]
    blade_radii = [0.042, 0.045, 0.048, 0.055, 0.005]
    create_swept_tube("Khanda_Blade", blade_spine, blade_radii, num_segments=12, material=steel_mat, subsurf_levels=1)

    # Blade Fuller Groove (Gold Inlay)
    fuller_spine = [Vector((0.38, -0.185, 1.15)), Vector((0.38, -0.205, 1.85))]
    create_swept_tube("Khanda_Fuller", fuller_spine, [0.010, 0.010], num_segments=8, material=gold_mat, subsurf_levels=0)

    # Named tip for combat weapon registration
    tip_spine = [Vector((0.38, -0.24, 2.05)), Vector((0.38, -0.25, 2.10))]
    create_swept_tube("Khanda_Tip", tip_spine, [0.020, 0.002], num_segments=8, material=steel_mat, subsurf_levels=0)

    export_glb("assets/padati.glb")

# ==============================================================================
# 2. GAJADHVAJA (ELEPHANT ROOK) — ROYAL WAR ELEPHANT WITH HOWDAH
# ==============================================================================
def build_organic_gajadhvaja():
    clear_scene()
    print("Building Gajadhvaja (Elephant Rook)...")
    skin_mat = create_pbr_material("ElephantSkin", (0.35, 0.34, 0.33, 1), 0.05, 0.85, os.path.join(TEXTURE_DIR, 'elephant_skin.png'))
    jhul_mat = create_pbr_material("ElephantJhul", (0.70, 0.12, 0.20, 1), 0.20, 0.45, os.path.join(TEXTURE_DIR, 'elephant_jhul.png'))
    gold_mat = create_pbr_material("RoyalGold", (0.95, 0.78, 0.22, 1), 0.88, 0.20, os.path.join(TEXTURE_DIR, 'kavacha_gold.png'))
    ivory_mat = create_pbr_material("RoyalIvory", (0.96, 0.94, 0.88, 1), 0.10, 0.22)
    stone_mat = create_pbr_material("HowdahStone", (0.65, 0.48, 0.32, 1), 0.15, 0.75, os.path.join(TEXTURE_DIR, 'sandalwood_chariot.png'))
    eye_mat = create_pbr_material("AmberGaze", (1.0, 0.72, 0.01, 1), 0.10, 0.10, emissive_color=(1.0, 0.60, 0.0, 1), emissive_intensity=3.6)

    # 1. Import base organic elephant mesh
    elephant_path = os.path.abspath("assets/elephant.glb")
    if os.path.exists(elephant_path):
        bpy.ops.import_scene.gltf(filepath=elephant_path)
        for obj in bpy.context.scene.objects:
            if obj.type == 'MESH':
                obj.name = "Elephant_Body"
                obj.matrix_world = Matrix.Identity(4)
                obj.scale = (0.175, 0.175, 0.175)
                bpy.context.view_layer.objects.active = obj
                bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
                obj.data.materials.clear()
                obj.data.materials.append(skin_mat)
                for poly in obj.data.polygons:
                    poly.use_smooth = True

    # 2. Forward-Curving Ivory Tusks anchored directly to front cheek bones flanking trunk
    # Left cheek: X = -0.22, Y = -0.72, Z = 0.95 -> sweeping forward into -Y (Y -> -1.35) and upward in Z (Z -> 1.15)
    for tx, side_label in [(-0.22, "L"), (0.22, "R")]:
        tusk_spine = [
            Vector((tx, -0.72, 0.95)),
            Vector((tx * 0.98, -0.92, 0.90)),
            Vector((tx * 0.95, -1.15, 1.00)),
            Vector((tx * 0.92, -1.35, 1.15))
        ]
        create_swept_tube(f"Elephant_Tusk_{side_label}", tusk_spine, [0.055, 0.048, 0.035, 0.010], num_segments=16, material=ivory_mat, subsurf_levels=1)

        # Triple Gold Ferrules at cheek base
        ferrule_spine = [Vector((tx, -0.72, 0.95)), Vector((tx, -0.80, 0.93))]
        create_swept_tube(f"Elephant_Ferrule_{side_label}", ferrule_spine, [0.065, 0.062], num_segments=16, material=gold_mat, subsurf_levels=0)

    # 3. Fiery Amber Eyes on Front Temples (Facing -Y)
    for ex, side_label in [(-0.24, "L"), (0.24, "R")]:
        eye_rings = [
            (1.34, 0.035, 0.035, ex, -0.66),
            (1.34, 0.025, 0.025, ex, -0.68),
            (1.34, 0.005, 0.005, ex, -0.69)
        ]
        create_organic_lofted_mesh(f"Elephant_Eye_{side_label}", eye_rings, num_segments=12, material=eye_mat, subsurf_levels=1, cap_top=True)

    # 4. Golden Shringar Chamfron Plate on Forehead
    chamfron_rings = [
        (1.25, 0.18, 0.12, 0.0, -0.70),
        (1.42, 0.22, 0.14, 0.0, -0.66),
        (1.55, 0.16, 0.10, 0.0, -0.60)
    ]
    create_organic_lofted_mesh("Elephant_Chamfron", chamfron_rings, num_segments=16, material=gold_mat, subsurf_levels=1)

    # 5. Draped Jhul Blanket across back and flanks
    jhul_rings = [
        (1.15, 0.65, 0.60, 0.0, 0.00, 12, 0.10),
        (1.38, 0.68, 0.64, 0.0, 0.00, 12, 0.08),
        (1.50, 0.64, 0.58, 0.0, 0.00)
    ]
    create_organic_lofted_mesh("Elephant_Jhul", jhul_rings, num_segments=20, material=jhul_mat, subsurf_levels=1)

    # Gold Ankle Kadas on all 4 feet
    for idx, (lx, ly) in enumerate([(-0.45, 0.55), (0.45, 0.55), (-0.45, -0.55), (0.45, -0.55)]):
        kada_spine = [Vector((lx, ly, 0.10)), Vector((lx, ly, 0.18))]
        create_swept_tube(f"Elephant_Kada_{idx}", kada_spine, [0.18, 0.18], num_segments=16, material=gold_mat, subsurf_levels=0)

    # 6. Clean Rajput Sandstone Fortress Howdah Pavilion (Centered on back, ZERO runaway primitives)
    howdah_base_rings = [
        (1.50, 0.46, 0.55, 0.0, 0.00),
        (1.72, 0.48, 0.58, 0.0, 0.00),
        (1.88, 0.50, 0.60, 0.0, 0.00)
    ]
    create_organic_lofted_mesh("Howdah_Base", howdah_base_rings, num_segments=12, material=stone_mat, subsurf_levels=1)

    # 4 Carved Gold Bartizan Corner Pillars
    for idx, (px, py) in enumerate([(-0.35, -0.42), (0.35, -0.42), (-0.35, 0.42), (0.35, 0.42)]):
        pillar_spine = [Vector((px, py, 1.88)), Vector((px, py, 2.45))]
        create_swept_tube(f"Howdah_Pillar_{idx}", pillar_spine, [0.038, 0.038], num_segments=12, material=gold_mat, subsurf_levels=0)

    # Domed Rajput Chhatri Shikhara Canopy
    chhatri_rings = [
        (2.42, 0.52, 0.62, 0.0, 0.00),
        (2.62, 0.46, 0.52, 0.0, 0.00),
        (2.78, 0.28, 0.32, 0.0, 0.00),
        (2.92, 0.06, 0.06, 0.0, 0.00)
    ]
    create_organic_lofted_mesh("Howdah_Dome", chhatri_rings, num_segments=16, material=gold_mat, subsurf_levels=1, cap_top=True)

    # Golden Finial Spire
    finial_spine = [Vector((0.0, 0.0, 2.92)), Vector((0.0, 0.0, 3.12))]
    create_swept_tube("Howdah_Finial", finial_spine, [0.065, 0.008], num_segments=12, material=gold_mat, subsurf_levels=0)

    export_glb("assets/gajadhvaja.glb")

# ==============================================================================
# 3. ASHVAROHI (KNIGHT) — MARWARI WARHORSE & KSHATRIYA DRAGOON ARCHER
# ==============================================================================
def build_organic_ashvarohi():
    clear_scene()
    print("Building Ashvarohi (Knight)...")
    horse_mat = create_pbr_material("MarwariCoat", (0.88, 0.85, 0.80, 1), 0.15, 0.45)
    gold_mat = create_pbr_material("SaddleGold", (0.95, 0.78, 0.22, 1), 0.88, 0.20, os.path.join(TEXTURE_DIR, 'kavacha_gold.png'))
    silk_mat = create_pbr_material("SaffronSilk", (0.95, 0.55, 0.12, 1), 0.10, 0.50, os.path.join(TEXTURE_DIR, 'dhoti_silk.png'))
    steel_mat = create_pbr_material("LanceSteel", (0.20, 0.22, 0.28, 1), 0.80, 0.30, os.path.join(TEXTURE_DIR, 'damascus_steel.png'))
    skin_mat = create_pbr_material("RiderSkin", (0.76, 0.52, 0.38, 1), 0.05, 0.55)

    # 1. Import horse mesh from assets/horse.glb
    horse_path = os.path.abspath("assets/horse.glb")
    if os.path.exists(horse_path):
        bpy.ops.import_scene.gltf(filepath=horse_path)
        for obj in bpy.context.scene.objects:
            if obj.type == 'MESH':
                obj.name = "Horse_Body"
                obj.location = (0, 0, 0)
                obj.scale = (0.0070, 0.0070, 0.0070)
                bpy.context.view_layer.objects.active = obj
                bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
                if obj.data.shape_keys:
                    obj.shape_key_clear()
                obj.data.materials.clear()
                obj.data.materials.append(horse_mat)
                for poly in obj.data.polygons:
                    poly.use_smooth = True

    # 2. Inward-curving Marwari Lyre Ears
    for ex, side_label in [(-0.06, "L"), (0.06, "R")]:
        ear_spine = [
            Vector((ex, -0.76, 1.25)),
            Vector((ex * 0.95, -0.78, 1.35)),
            Vector((ex * 0.40, -0.80, 1.42))  # tips curving inward
        ]
        create_swept_tube(f"Horse_LyreEar_{side_label}", ear_spine, [0.032, 0.022, 0.005], num_segments=10, material=horse_mat, subsurf_levels=1)

    # 3. High-Relief Saddle Cloth (Jhul) & Stirrups
    saddle_rings = [
        (1.00, 0.28, 0.38, 0.0, 0.00),
        (1.12, 0.30, 0.36, 0.0, 0.00),
        (1.18, 0.26, 0.32, 0.0, 0.00)
    ]
    create_organic_lofted_mesh("Horse_Saddle", saddle_rings, num_segments=16, material=gold_mat, subsurf_levels=1)

    # 4. Mounted Kshatriya Dragoon Rider seated astride facing forward (-Y)
    # Rider Legs in Stirrups
    for lx, side_label in [(-0.20, "L"), (0.20, "R")]:
        leg_spine = [
            Vector((lx * 0.70, -0.05, 1.15)),
            Vector((lx * 1.10, -0.08, 0.92)),
            Vector((lx * 1.00, -0.05, 0.72))
        ]
        create_swept_tube(f"Dragoon_Leg_{side_label}", leg_spine, [0.085, 0.075, 0.065], num_segments=12, material=silk_mat, subsurf_levels=1)

    # Rider Torso in Surya Kavacha
    rider_torso_rings = [
        (1.18, 0.20, 0.15, 0.0, -0.02),
        (1.36, 0.24, 0.17, 0.0, -0.04),
        (1.54, 0.26, 0.19, 0.0, -0.05),
        (1.66, 0.22, 0.15, 0.0, -0.03)
    ]
    create_organic_lofted_mesh("Dragoon_Torso", rider_torso_rings, num_segments=16, material=gold_mat, subsurf_levels=1)

    # Head and Crested Pagri
    rhead_rings = [
        (1.68, 0.10, 0.11, 0.0, -0.04),
        (1.78, 0.12, 0.13, 0.0, -0.05),
        (1.88, 0.11, 0.11, 0.0, -0.03)
    ]
    create_organic_lofted_mesh("Dragoon_Head", rhead_rings, num_segments=16, material=skin_mat, subsurf_levels=1)

    pagri_rings = [
        (1.84, 0.14, 0.15, 0.0, -0.03),
        (1.94, 0.16, 0.17, 0.0, -0.02),
        (2.04, 0.13, 0.13, 0.0, -0.01),
        (2.10, 0.04, 0.04, 0.0, 0.00)
    ]
    create_organic_lofted_mesh("Dragoon_Pagri", pagri_rings, num_segments=16, material=silk_mat, subsurf_levels=1)

    # 5. Ornate Recurved Indian Longbow (Dhanush) held in heroic firing posture
    bow_spine = [
        Vector((-0.25, -0.32, 1.05)),
        Vector((-0.22, -0.38, 1.35)),
        Vector((-0.20, -0.42, 1.62)),
        Vector((-0.22, -0.38, 1.88)),
        Vector((-0.25, -0.32, 2.15))
    ]
    create_swept_tube("Dhanush_Bow", bow_spine, [0.018, 0.024, 0.028, 0.024, 0.018], num_segments=12, material=gold_mat, subsurf_levels=1)

    # Bowstring
    string_spine = [Vector((-0.25, -0.31, 1.06)), Vector((-0.25, -0.31, 2.14))]
    create_swept_tube("Dhanush_String", string_spine, [0.005, 0.005], num_segments=6, material=steel_mat, subsurf_levels=0)

    # 6. Golden Quiver (Tarkash) with Fletched Arrows slung across rider's back
    quiver_spine = [Vector((0.18, 0.14, 1.25)), Vector((0.18, 0.12, 1.75))]
    create_swept_tube("Tarkash_Quiver", quiver_spine, [0.065, 0.075], num_segments=12, material=gold_mat, subsurf_levels=1)

    # 4 Fletched Arrows
    for a in range(4):
        ao = (a - 1.5) * 0.032
        arr_spine = [Vector((0.18 + ao, 0.12, 1.70)), Vector((0.18 + ao, 0.12, 2.05))]
        create_swept_tube(f"Tarkash_Arrow_{a}", arr_spine, [0.010, 0.010], num_segments=6, material=steel_mat, subsurf_levels=0)

    export_glb("assets/ashvarohi.glb")

# ==============================================================================
# 4. RATHA MAHARATHI (BISHOP) — VEDIC SANDALWOOD CHARIOT & SAGE ARCHER
# ==============================================================================
def build_organic_ratha():
    clear_scene()
    print("Building Ratha (Bishop)...")
    wood_mat = create_pbr_material("Sandalwood", (0.55, 0.35, 0.18, 1), 0.15, 0.70, os.path.join(TEXTURE_DIR, 'sandalwood_chariot.png'))
    gold_mat = create_pbr_material("ChakraGold", (0.95, 0.78, 0.22, 1), 0.88, 0.20, os.path.join(TEXTURE_DIR, 'kavacha_gold.png'))
    steel_mat = create_pbr_material("ScytheSteel", (0.20, 0.22, 0.28, 1), 0.80, 0.30, os.path.join(TEXTURE_DIR, 'damascus_steel.png'))
    halo_mat = create_pbr_material("CelestialHalo", (1.0, 0.90, 0.30, 1), 0.90, 0.10, emissive_color=(1.0, 0.85, 0.20, 1), emissive_intensity=2.2)
    robe_mat = create_pbr_material("ArcherRobe", (0.92, 0.88, 0.80, 1), 0.10, 0.50, os.path.join(TEXTURE_DIR, 'dhoti_silk.png'))
    skin_mat = create_pbr_material("ArcherSkin", (0.76, 0.52, 0.38, 1), 0.05, 0.55)

    # 1. Carved Sandalwood Chariot Hull
    chassis_rings = [
        (0.25, 0.65, 0.95, 0.0, 0.00),
        (0.55, 0.72, 1.05, 0.0, -0.05),
        (0.85, 0.75, 1.10, 0.0, -0.10)
    ]
    create_organic_lofted_mesh("Chariot_Hull", chassis_rings, num_segments=16, material=wood_mat, subsurf_levels=1)

    # Protective Varutha Shield Prow sweeping forward (-Y)
    varutha_rings = [
        (0.55, 0.68, 0.45, 0.0, -0.65),
        (0.95, 0.72, 0.48, 0.0, -0.72),
        (1.25, 0.65, 0.42, 0.0, -0.78)
    ]
    create_organic_lofted_mesh("Chariot_Varutha", varutha_rings, num_segments=16, material=wood_mat, subsurf_levels=1)

    # Rear Flagstaff & Surya Sun Banner
    mast_spine = [Vector((0.45, 0.65, 0.85)), Vector((0.45, 0.65, 2.35))]
    create_swept_tube("Chariot_Flagstaff", mast_spine, [0.022, 0.018], num_segments=8, material=gold_mat, subsurf_levels=0)

    banner_rings = [
        (2.05, 0.01, 0.40, 0.45, 0.45),
        (2.30, 0.01, 0.35, 0.45, 0.45)
    ]
    create_organic_lofted_mesh("Surya_Banner", banner_rings, num_segments=8, material=robe_mat, subsurf_levels=1)

    # 2. Dual 8-Spoked Surya Chakra Wheels (Radius 0.48m, centered at X = +-0.75m, Z = 0.48m)
    for wx, side_label in [(-0.75, "L"), (0.75, "R")]:
        # Outer Rim
        rim_spine = []
        for i in range(25):
            ang = (2.0 * math.pi * i) / 24
            rim_spine.append(Vector((wx, 0.48 * math.sin(ang), 0.48 + 0.48 * math.cos(ang))))
        create_swept_tube(f"Chakra_Wheel_{side_label}", rim_spine, [0.042] * 25, num_segments=12, material=gold_mat, subsurf_levels=1, cap_ends=False)

        # 8 Tapered Spokes
        for s in range(8):
            sang = s * (math.pi / 4.0)
            spoke_spine = [
                Vector((wx, 0.0, 0.48)),
                Vector((wx, 0.45 * math.sin(sang), 0.48 + 0.45 * math.cos(sang)))
            ]
            create_swept_tube(f"Chakra_Spoke_{side_label}_{s}", spoke_spine, [0.025, 0.018], num_segments=8, material=gold_mat, subsurf_levels=0)

        # Central Hub Scythe pointing outward along X
        out_x = wx + (0.28 if wx > 0 else -0.28)
        scythe_spine = [Vector((wx, 0.0, 0.48)), Vector((out_x, 0.0, 0.48))]
        create_swept_tube(f"Chakra_Hub_{side_label}", scythe_spine, [0.065, 0.005], num_segments=12, material=steel_mat, subsurf_levels=1)

    # 3. Standing Celestial Sage Archer facing -Y
    robe_rings = [
        (0.45, 0.28, 0.22, 0.0, 0.00, 8, 0.12),
        (0.85, 0.32, 0.24, 0.0, -0.01, 8, 0.10),
        (1.15, 0.30, 0.22, 0.0, -0.02, 6, 0.06),
        (1.45, 0.32, 0.24, 0.0, -0.02)
    ]
    create_organic_lofted_mesh("Sage_Dhoti", robe_rings, num_segments=16, material=robe_mat, subsurf_levels=1)

    ahead_rings = [
        (1.48, 0.11, 0.12, 0.0, -0.03),
        (1.58, 0.13, 0.14, 0.0, -0.04),
        (1.70, 0.12, 0.13, 0.0, -0.02)
    ]
    create_organic_lofted_mesh("Sage_Head", ahead_rings, num_segments=16, material=skin_mat, subsurf_levels=1)

    # Radiant Prabhamandala Halo Disc mounted behind head (+Y)
    halo_spine = []
    for i in range(25):
        ang = (2.0 * math.pi * i) / 24
        halo_spine.append(Vector((0.34 * math.cos(ang), 0.10, 1.68 + 0.34 * math.sin(ang))))
    create_swept_tube("Prabhamandala", halo_spine, [0.032] * 25, num_segments=12, material=halo_mat, subsurf_levels=1, cap_ends=False)

    # Gandiva Recurve Greatbow
    bow_spine = [
        Vector((0.28, -0.32, 1.10)),
        Vector((0.32, -0.40, 1.45)),
        Vector((0.28, -0.32, 1.80))
    ]
    create_swept_tube("Gandiva_Bow", bow_spine, [0.022, 0.032, 0.022], num_segments=12, material=gold_mat, subsurf_levels=1)

    export_glb("assets/ratha.glb")

# ==============================================================================
# 5. MAHARANI (QUEEN) — SUPREME WARRIOR QUEEN (TWIN KHANDA BLADES, SILK MANTLE)
# ==============================================================================
def build_organic_maharani():
    clear_scene()
    print("Building Maharani (Queen)...")
    gold_mat = create_pbr_material("QueenGold", (0.95, 0.78, 0.22, 1), 0.88, 0.18, os.path.join(TEXTURE_DIR, 'kavacha_gold.png'))
    saree_mat = create_pbr_material("CrimsonSaree", (0.80, 0.12, 0.22, 1), 0.20, 0.45, os.path.join(TEXTURE_DIR, 'dhoti_silk.png'))
    steel_mat = create_pbr_material("KhandaSteel", (0.20, 0.22, 0.28, 1), 0.80, 0.30, os.path.join(TEXTURE_DIR, 'damascus_steel.png'))
    skin_mat = create_pbr_material("QueenSkin", (0.82, 0.60, 0.46, 1), 0.05, 0.55)
    halo_mat = create_pbr_material("CelestialHalo", (1.0, 0.85, 0.20, 1), 0.90, 0.10, emissive_color=(1.0, 0.70, 0.10, 1), emissive_intensity=2.2)

    # 1. Pleated Warrior Saree (Kachha Style facing -Y)
    saree_rings = [
        (0.20, 0.28, 0.20, 0.0, 0.00, 12, 0.20),
        (0.45, 0.32, 0.22, 0.0, -0.01, 10, 0.16),
        (0.72, 0.34, 0.24, 0.0, -0.02, 8, 0.10),
        (0.92, 0.30, 0.20, 0.0, -0.01, 6, 0.06),
    ]
    create_organic_lofted_mesh("Maharani_Saree", saree_rings, num_segments=20, material=saree_mat, subsurf_levels=1)

    # Feet with ankle ghungroos grounded at Z = 0.000m
    for x_side, side_label in [(-0.12, "L"), (0.12, "R")]:
        leg_rings = [
            (0.00, 0.06, 0.11, x_side, -0.02),
            (0.08, 0.055, 0.065, x_side, 0.00),
            (0.28, 0.075, 0.075, x_side, 0.01)
        ]
        create_organic_lofted_mesh(f"Maharani_Foot_{side_label}", leg_rings, num_segments=12, material=skin_mat, subsurf_levels=1)

    # 2. Contoured Royal Gold Cuirass
    torso_rings = [
        (0.90, 0.26, 0.18, 0.0, -0.01),
        (1.05, 0.28, 0.19, 0.0, -0.02),
        (1.20, 0.32, 0.20, 0.0, -0.02),
        (1.35, 0.30, 0.18, 0.0, -0.01)
    ]
    create_organic_lofted_mesh("Maharani_Cuirass", torso_rings, num_segments=20, material=gold_mat, subsurf_levels=1)

    # Flared Lotus Pauldrons
    for px, side_label in [(-0.34, "L"), (0.34, "R")]:
        pauldron_rings = [
            (1.15, 0.08, 0.08, px, 0.00),
            (1.30, 0.14, 0.12, px * 1.15, -0.01),
            (1.42, 0.12, 0.10, px * 1.18, -0.01)
        ]
        create_organic_lofted_mesh(f"Maharani_Pauldron_{side_label}", pauldron_rings, num_segments=12, material=gold_mat, subsurf_levels=1)

    # Draped Flowing Silk Mantle behind shoulders (+Y)
    mantle_rings = [
        (0.38, 0.36, 0.18, 0.0, 0.16, 6, 0.12),
        (0.75, 0.38, 0.20, 0.0, 0.14, 6, 0.10),
        (1.10, 0.36, 0.18, 0.0, 0.12, 4, 0.06),
        (1.32, 0.32, 0.14, 0.0, 0.08)
    ]
    create_organic_lofted_mesh("Maharani_Mantle", mantle_rings, num_segments=16, material=saree_mat, subsurf_levels=1)

    # Head and Ornate Mukuta Crown
    qhead_rings = [
        (1.36, 0.10, 0.11, 0.0, -0.02),
        (1.48, 0.12, 0.13, 0.0, -0.03),
        (1.58, 0.12, 0.12, 0.0, -0.01)
    ]
    create_organic_lofted_mesh("Maharani_Head", qhead_rings, num_segments=16, material=skin_mat, subsurf_levels=1)

    crown_rings = [
        (1.56, 0.14, 0.14, 0.0, -0.01),
        (1.72, 0.18, 0.18, 0.0, 0.00),
        (1.92, 0.08, 0.08, 0.0, 0.01),
        (2.05, 0.02, 0.02, 0.0, 0.02)
    ]
    create_organic_lofted_mesh("Maharani_Crown", crown_rings, num_segments=16, material=gold_mat, subsurf_levels=1)

    # Sunburst Radiant Halo behind head
    halo_spine = []
    for i in range(25):
        ang = (2.0 * math.pi * i) / 24
        halo_spine.append(Vector((0.30 * math.cos(ang), 0.08, 1.75 + 0.30 * math.sin(ang))))
    create_swept_tube("Maharani_Halo", halo_spine, [0.025] * 25, num_segments=12, material=halo_mat, subsurf_levels=1, cap_ends=False)

    # 3. Dual-Wielding Twin Curved Khanda Blades (Right: Striking Guard, Left: Parry Guard)
    for kx, side_label, ang_z in [(0.38, "R", 0.35), (-0.38, "L", -0.35)]:
        # Hilt / Grip
        grip_spine = [Vector((kx, -0.16, 1.05)), Vector((kx, -0.18, 1.22))]
        create_swept_tube(f"Khanda_Grip_{side_label}", grip_spine, [0.022, 0.022], num_segments=10, material=gold_mat, subsurf_levels=0)

        # Saucer Pommel with Spike
        pommel_spine = [Vector((kx, -0.16, 1.05)), Vector((kx, -0.15, 0.98))]
        create_swept_tube(f"Khanda_Pommel_{side_label}", pommel_spine, [0.055, 0.005], num_segments=10, material=gold_mat, subsurf_levels=1)

        # Crossguard
        guard_rings = [
            (1.22, 0.12, 0.030, kx, -0.18),
            (1.25, 0.14, 0.035, kx, -0.18),
            (1.27, 0.10, 0.028, kx, -0.18)
        ]
        create_organic_lofted_mesh(f"Khanda_Guard_{side_label}", guard_rings, num_segments=12, material=gold_mat, subsurf_levels=1)

        # 0.85m Broad Curved Khanda Blade
        blade_spine = [
            Vector((kx, -0.18, 1.27)),
            Vector((kx + ang_z * 0.15, -0.22, 1.55)),
            Vector((kx + ang_z * 0.25, -0.26, 1.85)),
            Vector((kx + ang_z * 0.32, -0.30, 2.05))  # flare tip
        ]
        create_swept_tube(f"Khanda_Blade_{side_label}", blade_spine, [0.038, 0.042, 0.048, 0.005], num_segments=12, material=steel_mat, subsurf_levels=1)

    export_glb("assets/maharani.glb")

# ==============================================================================
# 6. SAMRAT CHAKRAVARTI (KING) — IMPERIAL MONARCH (CHHATRA PARASOL, GADA MACE)
# ==============================================================================
def build_organic_samrat():
    clear_scene()
    print("Building Samrat (King)...")
    gold_mat = create_pbr_material("EmperorGold", (0.95, 0.78, 0.22, 1), 0.92, 0.18, os.path.join(TEXTURE_DIR, 'kavacha_gold.png'))
    mantle_mat = create_pbr_material("RoyalMantle", (0.75, 0.12, 0.18, 1), 0.25, 0.40, os.path.join(TEXTURE_DIR, 'elephant_jhul.png'))
    dhoti_mat = create_pbr_material("GoldDhoti", (0.95, 0.65, 0.15, 1), 0.20, 0.40, os.path.join(TEXTURE_DIR, 'dhoti_silk.png'))
    skin_mat = create_pbr_material("SamratSkin", (0.76, 0.52, 0.38, 1), 0.05, 0.55)
    ruby_mat = create_pbr_material("CrownRuby", (1.0, 0.10, 0.20, 1), 0.90, 0.10, emissive_color=(1.0, 0.05, 0.15, 1), emissive_intensity=3.0)

    # 1. Broad Imperial Dhoti facing -Y
    dhoti_rings = [
        (0.22, 0.36, 0.26, 0.0, 0.00, 10, 0.16),
        (0.48, 0.40, 0.28, 0.0, -0.01, 10, 0.14),
        (0.75, 0.42, 0.30, 0.0, -0.02, 8, 0.10),
        (0.96, 0.40, 0.28, 0.0, -0.01, 6, 0.06),
    ]
    create_organic_lofted_mesh("Samrat_Dhoti", dhoti_rings, num_segments=20, material=dhoti_mat, subsurf_levels=1)

    # Sovereign Boots grounded at Z = 0.000m
    for x_side, side_label in [(-0.16, "L"), (0.16, "R")]:
        boot_rings = [
            (0.00, 0.09, 0.14, x_side, -0.03),
            (0.08, 0.075, 0.085, x_side, 0.00),
            (0.28, 0.095, 0.095, x_side, 0.01)
        ]
        create_organic_lofted_mesh(f"Samrat_Boot_{side_label}", boot_rings, num_segments=12, material=gold_mat, subsurf_levels=1)

    # 2. Broad Sovereign Plate Cuirass & Lion Pauldrons
    torso_rings = [
        (0.95, 0.36, 0.24, 0.0, -0.01),
        (1.15, 0.42, 0.27, 0.0, -0.02),
        (1.35, 0.48, 0.30, 0.0, -0.03),
        (1.50, 0.44, 0.26, 0.0, -0.02)
    ]
    create_organic_lofted_mesh("Samrat_Cuirass", torso_rings, num_segments=20, material=gold_mat, subsurf_levels=1)

    # Roaring Lion Pauldrons flanking shoulders
    for px, side_label in [(-0.44, "L"), (0.44, "R")]:
        lion_rings = [
            (1.25, 0.14, 0.14, px, -0.02),
            (1.42, 0.22, 0.20, px * 1.08, -0.04, 8, 0.15),
            (1.54, 0.16, 0.14, px * 1.10, -0.02)
        ]
        create_organic_lofted_mesh(f"Samrat_Lion_Pauldron_{side_label}", lion_rings, num_segments=16, material=gold_mat, subsurf_levels=1)

    # Royal Imperial Mantle draped behind back (+Y)
    mantle_rings = [
        (0.45, 0.48, 0.22, 0.0, 0.18, 6, 0.15),
        (0.85, 0.50, 0.24, 0.0, 0.16, 6, 0.12),
        (1.25, 0.48, 0.22, 0.0, 0.14, 4, 0.08),
        (1.48, 0.44, 0.18, 0.0, 0.10)
    ]
    create_organic_lofted_mesh("Samrat_Mantle", mantle_rings, num_segments=16, material=mantle_mat, subsurf_levels=1)

    # Head and Imperial Kirita-Mukuta Crown
    shead_rings = [
        (1.50, 0.12, 0.14, 0.0, -0.03),
        (1.62, 0.15, 0.16, 0.0, -0.04),
        (1.74, 0.15, 0.15, 0.0, -0.02)
    ]
    create_organic_lofted_mesh("Samrat_Head", shead_rings, num_segments=16, material=skin_mat, subsurf_levels=1)

    crown_rings = [
        (1.72, 0.17, 0.18, 0.0, -0.02),
        (1.90, 0.19, 0.19, 0.0, -0.01),
        (2.10, 0.12, 0.12, 0.0, 0.00),
        (2.28, 0.04, 0.04, 0.0, 0.01)
    ]
    create_organic_lofted_mesh("Samrat_Crown", crown_rings, num_segments=16, material=gold_mat, subsurf_levels=1)

    # Central Cabochon Ruby Jewel on Crown Crest
    ruby_rings = [
        (2.05, 0.065, 0.065, 0.0, -0.19),
        (2.05, 0.045, 0.045, 0.0, -0.22),
        (2.05, 0.010, 0.010, 0.0, -0.23)
    ]
    create_organic_lofted_mesh("CrownRuby", ruby_rings, num_segments=12, material=ruby_mat, subsurf_levels=1, cap_top=True)

    # 3. 3-Tiered Royal Golden Chhatra Parasol Canopy mounted on staff behind back (Y = +0.22m, Z in [2.35m, 3.15m])
    staff_spine = [Vector((0.0, 0.22, 1.20)), Vector((0.0, 0.22, 3.15))]
    create_swept_tube("Chhatra_Staff", staff_spine, [0.028, 0.025], num_segments=12, material=gold_mat, subsurf_levels=0)

    # 3 Tiers of Royal Canopies
    tiers = [
        {"name": "Chhatra_Tier_1", "r": 0.52, "z_base": 2.58, "z_top": 2.70},  # bottom large
        {"name": "Chhatra_Tier_2", "r": 0.40, "z_base": 2.78, "z_top": 2.88},  # middle
        {"name": "Chhatra_Tier_3", "r": 0.28, "z_base": 2.96, "z_top": 3.04}   # top small
    ]
    for tier in tiers:
        canopy_rings = [
            (tier["z_base"], tier["r"], tier["r"], 0.0, 0.22, 16, 0.04),  # scalloped rim
            (tier["z_base"] + 0.06, tier["r"] * 0.75, tier["r"] * 0.75, 0.0, 0.22),
            (tier["z_top"], 0.04, 0.04, 0.0, 0.22)
        ]
        create_organic_lofted_mesh(tier["name"], canopy_rings, num_segments=16, material=gold_mat, subsurf_levels=1, cap_top=True)

    # Parasol Crown Finial
    finial_spine = [Vector((0.0, 0.22, 3.04)), Vector((0.0, 0.22, 3.18))]
    create_swept_tube("Chhatra_Finial", finial_spine, [0.055, 0.005], num_segments=10, material=ruby_mat, subsurf_levels=1)

    # 4. Massive Ceremonial Golden Gada Mace (Held vertically in front, fluted head resting on stone ground Z_min = 0.000m)
    # Upper Shaft & Grip held in front of chest
    gada_shaft_spine = [Vector((0.0, -0.38, 0.42)), Vector((0.0, -0.38, 1.38))]
    create_swept_tube("Gada_Shaft", gada_shaft_spine, [0.038, 0.038], num_segments=12, material=gold_mat, subsurf_levels=0)

    # Pommel and Upper Spike
    pommel_rings = [
        (1.38, 0.065, 0.065, 0.0, -0.38),
        (1.42, 0.080, 0.080, 0.0, -0.38),
        (1.46, 0.040, 0.040, 0.0, -0.38),
        (1.52, 0.010, 0.010, 0.0, -0.38)
    ]
    create_organic_lofted_mesh("Gada_Pommel", pommel_rings, num_segments=12, material=gold_mat, subsurf_levels=1, cap_top=True)

    # Fluted Ceremonial Mace Head resting solidly on stone ground (Z in [0.00, 0.45], 8 ribbed vertical flutes)
    create_fluted_head_mesh("Gada_Head", center=(0.0, -0.38, 0.00), base_r=0.08, max_r=0.22, height=0.45, num_flutes=8, flute_depth=0.040, material=gold_mat, subsurf_levels=1)

    export_glb("assets/samrat.glb")

# ==============================================================================
# MASTER ENTRY POINT: BUILD ALL 6 BAAHUBALI PURANIC MODELS
# ==============================================================================
if __name__ == '__main__':
    print("=" * 80)
    print("STARTING MASTER BAAHUBALI PURANIC 3D SCULPTING PIPELINE (BLENDER 4.2.0)")
    print("=" * 80)

    build_organic_padati()
    build_organic_gajadhvaja()
    build_organic_ashvarohi()
    build_organic_ratha()
    build_organic_maharani()
    build_organic_samrat()

    print("=" * 80)
    print("ALL 6 BAAHUBALI PURANIC MODELS SCULPTED & EXPORTED SUCCESSFULLY!")
    print("=" * 80)
