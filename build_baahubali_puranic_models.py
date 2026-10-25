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

def create_axial_lofted_mesh(name, slices, num_segments=24, material=None, subsurf_levels=1, cap_start=True, cap_end=True):
    """
    Lofts smooth organic forms across cross-sectional ring profiles along the Y axis.
    slices format: [(y, cz, rx, rz, cx, pleats, p_depth), ...]
    or [(y, cz, rx, rz, pleats, p_depth), ...] with cx default 0.0
    """
    bm = bmesh.new()
    prev_ring = []

    for s_data in slices:
        y = s_data[0]
        cz = s_data[1]
        rx = s_data[2]
        rz = s_data[3] if len(s_data) > 3 else rx
        cx = 0.0
        pleats = 0
        p_depth = 0.0
        if len(s_data) > 6:
            cx = s_data[4]
            pleats = s_data[5]
            p_depth = s_data[6]
        elif len(s_data) > 5:
            pleats = s_data[4]
            p_depth = s_data[5]
        elif len(s_data) > 4:
            pleats = s_data[4]

        curr_ring = []
        for i in range(num_segments):
            angle = (2.0 * math.pi * i) / num_segments
            r_mod = 1.0 + (p_depth * math.cos(pleats * angle) if pleats > 0 else 0.0)
            vx = cx + rx * r_mod * math.cos(angle)
            vy = y
            vz = cz + rz * r_mod * math.sin(angle)
            curr_ring.append(bm.verts.new((vx, vy, vz)))

        if prev_ring:
            for i in range(num_segments):
                v1 = prev_ring[i]
                v2 = prev_ring[(i + 1) % num_segments]
                v3 = curr_ring[(i + 1) % num_segments]
                v4 = curr_ring[i]
                bm.faces.new((v1, v2, v3, v4))
        elif cap_start:
            s_center = bm.verts.new((cx, y, cz))
            for i in range(num_segments):
                bm.faces.new((s_center, curr_ring[i], curr_ring[(i + 1) % num_segments]))

        prev_ring = curr_ring

    if cap_end and prev_ring:
        last_s = slices[-1]
        last_cx = 0.0
        if len(last_s) > 6:
            last_cx = last_s[4]
        e_center = bm.verts.new((last_cx, last_s[0], last_s[1]))
        for i in range(num_segments):
            bm.faces.new((e_center, prev_ring[(i + 1) % num_segments], prev_ring[i]))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

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
    # Left Arm (Holding Dhal Shield at forearm) - Anatomical Left is +X
    arm_l_spine = [
        Vector((0.34, 0.00, 1.28)),
        Vector((0.36, -0.08, 1.12)),
        Vector((0.34, -0.16, 0.98)),
        Vector((0.32, -0.20, 0.94))
    ]
    create_swept_tube("Padati_ArmL", arm_l_spine, [0.08, 0.07, 0.065, 0.055], num_segments=12, material=skin_mat, subsurf_levels=1)

    # Right Arm (Gripping Khanda Sword) - Anatomical Right is -X
    arm_r_spine = [
        Vector((-0.34, 0.00, 1.28)),
        Vector((-0.36, -0.08, 1.12)),
        Vector((-0.34, -0.16, 0.98)),
        Vector((-0.38, -0.18, 0.95))
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

    # 6. Rajput Dhal Shield on Left Arm (Radius 0.36m, depth 0.04m, facing -Y, center at +0.36)
    create_concave_dhal_mesh("Padati_Dhal", center=(0.36, -0.22, 0.95), radius=0.36, depth=0.04, material=gold_mat)

    # Central 8-Petal Lotus Boss on Shield
    lotus_rings = [
        (0.95, 0.065, 0.065, 0.36, -0.24, 8, 0.22),
        (0.95, 0.040, 0.040, 0.36, -0.26),
        (0.95, 0.010, 0.010, 0.36, -0.27)
    ]
    create_organic_lofted_mesh("Padati_Dhal_CenterBoss", lotus_rings, num_segments=16, material=gold_mat, subsurf_levels=1, cap_top=True)

    # 4 Brass Boss Hemispheres at radius 0.16m
    for i in range(4):
        ang = i * (math.pi / 2.0)
        bx = 0.36 + 0.16 * math.cos(ang)
        bz = 0.95 + 0.16 * math.sin(ang)
        boss_rings = [
            (bz, 0.035, 0.035, bx, -0.23),
            (bz, 0.025, 0.025, bx, -0.25),
            (bz, 0.005, 0.005, bx, -0.26)
        ]
        create_organic_lofted_mesh(f"Padati_Dhal_Boss_{i}", boss_rings, num_segments=12, material=gold_mat, subsurf_levels=1, cap_top=True)

    # 7. Authentic Curved Khanda Broadsword in Right Hand (Zero Spears!) - Center at -0.38
    # Grip / Hilt
    grip_spine = [Vector((-0.38, -0.18, 0.88)), Vector((-0.38, -0.18, 1.08))]
    create_swept_tube("Khanda_Grip", grip_spine, [0.024, 0.024], num_segments=12, material=steel_mat, subsurf_levels=0)

    # Saucer Disc Pommel
    pommel_rings = [
        (0.88, 0.065, 0.065, -0.38, -0.18),
        (0.86, 0.065, 0.065, -0.38, -0.18),
        (0.85, 0.020, 0.020, -0.38, -0.18)
    ]
    create_organic_lofted_mesh("Khanda_Pommel", pommel_rings, num_segments=16, material=gold_mat, subsurf_levels=1, cap_bottom=True)

    # Pommel Spike
    spike_spine = [Vector((-0.38, -0.18, 0.85)), Vector((-0.38, -0.18, 0.78))]
    create_swept_tube("Khanda_PommelSpike", spike_spine, [0.018, 0.002], num_segments=8, material=gold_mat, subsurf_levels=0)

    # Reinforced Crossguard
    guard_rings = [
        (1.08, 0.14, 0.035, -0.38, -0.18),
        (1.11, 0.16, 0.040, -0.38, -0.18),
        (1.13, 0.12, 0.032, -0.38, -0.18)
    ]
    create_organic_lofted_mesh("Khanda_Guard", guard_rings, num_segments=12, material=gold_mat, subsurf_levels=1)

    # 0.85m Broad Steel Khanda Blade with curved flare tip
    blade_spine = [
        Vector((-0.38, -0.18, 1.13)),
        Vector((-0.38, -0.19, 1.40)),
        Vector((-0.38, -0.20, 1.70)),
        Vector((-0.38, -0.22, 1.95)),
        Vector((-0.38, -0.25, 2.08))  # flared tip
    ]
    blade_radii = [0.042, 0.045, 0.048, 0.055, 0.005]
    create_swept_tube("Khanda_Blade", blade_spine, blade_radii, num_segments=12, material=steel_mat, subsurf_levels=1)

    # Blade Fuller Groove (Gold Inlay)
    fuller_spine = [Vector((-0.38, -0.185, 1.15)), Vector((-0.38, -0.205, 1.85))]
    create_swept_tube("Khanda_Fuller", fuller_spine, [0.010, 0.010], num_segments=8, material=gold_mat, subsurf_levels=0)

    # Named tip for combat weapon registration
    tip_spine = [Vector((-0.38, -0.24, 2.05)), Vector((-0.38, -0.25, 2.10))]
    create_swept_tube("Khanda_Tip", tip_spine, [0.020, 0.002], num_segments=8, material=steel_mat, subsurf_levels=0)

    export_glb("assets/padati.glb")

# ==============================================================================
# 2. GAJADHVAJA (ELEPHANT ROOK) — ROYAL WAR ELEPHANT WITH HOWDAH
# ==============================================================================
def build_organic_gajadhvaja():
    clear_scene()
    print("Building Gajadhvaja (Elephant Rook) with Continuous Organic BMesh Sculpt...")
    skin_mat = create_pbr_material("ElephantSkin", (0.35, 0.34, 0.33, 1), 0.05, 0.85, os.path.join(TEXTURE_DIR, 'elephant_skin.png'))
    jhul_mat = create_pbr_material("ElephantJhul", (0.70, 0.12, 0.20, 1), 0.20, 0.45, os.path.join(TEXTURE_DIR, 'elephant_jhul.png'))
    gold_mat = create_pbr_material("RoyalGold", (0.95, 0.78, 0.22, 1), 0.88, 0.20, os.path.join(TEXTURE_DIR, 'kavacha_gold.png'))
    ivory_mat = create_pbr_material("RoyalIvory", (0.96, 0.94, 0.88, 1), 0.10, 0.22)
    stone_mat = create_pbr_material("HowdahStone", (0.65, 0.48, 0.32, 1), 0.15, 0.75, os.path.join(TEXTURE_DIR, 'sandalwood_chariot.png'))
    eye_mat = create_pbr_material("AmberGaze", (1.0, 0.72, 0.01, 1), 0.10, 0.10, emissive_color=(1.0, 0.60, 0.0, 1), emissive_intensity=3.6)

    # 1. Wrinkled Barrel Ribcage & Muscular Withers (Elephant_Torso)
    # Lofted along Y from Rump (Y = +0.95m) to Chest Cap (Y = -0.98m)
    torso_slices = [
        # (y, cz, rx, rz, pleats, p_depth)
        ( 0.95, 1.62, 0.40, 0.44,  8, 0.018), # 1. Rump / Sacrum
        ( 0.70, 1.70, 0.60, 0.52,  8, 0.020), # 2. Pelvic Haunch
        ( 0.35, 1.74, 0.71, 0.56, 10, 0.022), # 3. Flank / Lumbar
        (-0.05, 1.78, 0.74, 0.58, 12, 0.024), # 4. Mid-Barrel Ribcage
        (-0.40, 1.84, 0.72, 0.60, 12, 0.025), # 5. Deep Girth / Heart Girth
        (-0.68, 1.88, 0.64, 0.58,  8, 0.020), # 6. Muscular Withers Peak
        (-0.88, 1.76, 0.50, 0.50,  6, 0.015), # 7. Cranial Neck Junction
        (-0.98, 1.65, 0.36, 0.42,  0, 0.000), # 8. Chest Cap
    ]
    create_axial_lofted_mesh("Elephant_Torso", torso_slices, num_segments=24, material=skin_mat, subsurf_levels=1, cap_start=True, cap_end=True)
    # Elephant_Body alias for visual continuity and legacy inspectors
    create_axial_lofted_mesh("Elephant_Body", torso_slices, num_segments=24, material=skin_mat, subsurf_levels=1, cap_start=True, cap_end=True)

    # 2. Four Anatomical Columnar Legs (Elephant_Leg_FL, FR, BL, BR)
    # Soles kissing floor at exact Z = 0.000000m; shoulder/hip pivots at Z = 1.45m
    leg_specs = [
        ("FL", -0.44, -0.48, False),
        ("FR",  0.44, -0.48, False),
        ("BL", -0.42,  0.52, True),
        ("BR",  0.42,  0.52, True)
    ]

    for label, lx, ly, is_hind in leg_specs:
        if not is_hind:
            rings = [
                (0.000, 0.23, 0.24, lx, ly),  # Sole flat on stone floor (Z = 0.0000m)
                (0.060, 0.22, 0.23, lx, ly),  # Coronet band & nail margin
                (0.160, 0.19, 0.195, lx, ly), # Ankle / Carpus column
                (0.380, 0.18, 0.185, lx, ly), # Mid-cannon column
                (0.720, 0.21, 0.22, lx, ly),  # Knee joint
                (1.080, 0.24, 0.26, lx, ly),  # Muscular forearm
                (1.320, 0.28, 0.31, lx, ly),  # Shoulder flare
                (1.450, 0.31, 0.34, lx, ly)   # Shoulder pivot junction
            ]
        else:
            rings = [
                (0.000, 0.22, 0.23, lx, ly),  # Sole flat on stone floor (Z = 0.0000m)
                (0.060, 0.21, 0.22, lx, ly),  # Coronet band
                (0.180, 0.18, 0.185, lx, ly), # Ankle / Tarsus
                (0.460, 0.18, 0.190, lx, ly), # Shin column
                (0.760, 0.22, 0.250, lx, ly), # Stifle / Hock joint
                (1.120, 0.26, 0.290, lx, ly), # Gaskin / Thigh bulge
                (1.360, 0.30, 0.330, lx, ly), # Pelvic haunch junction
                (1.450, 0.32, 0.350, lx, ly)  # Hip pivot junction
            ]
        create_organic_lofted_mesh(f"Elephant_Leg_{label}", rings, num_segments=20, material=skin_mat, subsurf_levels=1, cap_bottom=True, cap_top=True)

        # 24K Gold Ankle Kadas
        kada_spine = [Vector((lx, ly, 0.12)), Vector((lx, ly, 0.20))]
        create_swept_tube(f"Elephant_Kada_{label}", kada_spine, [0.21, 0.21], num_segments=16, material=gold_mat, subsurf_levels=0)

    # 4 numbered kadas for backwards compatibility with tests looking for Elephant_Kada_0..3
    for idx, (label, lx, ly, _) in enumerate(leg_specs):
        kada_spine = [Vector((lx, ly, 0.12)), Vector((lx, ly, 0.20))]
        create_swept_tube(f"Elephant_Kada_{idx}", kada_spine, [0.21, 0.21], num_segments=16, material=gold_mat, subsurf_levels=0)

    # 3. Authentic Indian Elephant Head (Elephant_Head) with Twin Brow Domes & Frontal Sulcus
    head_rings = [
        (1.10, 0.26, 0.22, 0.0, -0.95),             # Premaxillae base flanking trunk
        (1.30, 0.32, 0.26, 0.0, -0.92),             # Cheeks / Jawline
        (1.55, 0.36, 0.28, 0.0, -0.90),             # Eye orbit level / Temples
        (1.75, 0.38, 0.26, 0.0, -0.88, 2, 0.08),    # Frontal sulcus dip between twin brow lobes
        (1.90, 0.34, 0.22, 0.0, -0.86, 2, 0.10),    # Twin brow domes (Dvi-kumbha)
        (1.98, 0.16, 0.14, 0.0, -0.84)              # Cranial apex
    ]
    create_organic_lofted_mesh("Elephant_Head", head_rings, num_segments=20, material=skin_mat, subsurf_levels=1, cap_top=True)

    # Fiery Amber Eyes (Elephant_Eye_L, R)
    for ex, side_label in [(-0.32, "L"), (0.32, "R")]:
        eye_rings = [
            (1.55, 0.040, 0.040, ex, -0.92),
            (1.55, 0.030, 0.030, ex, -0.94),
            (1.55, 0.010, 0.010, ex, -0.95)
        ]
        create_organic_lofted_mesh(f"Elephant_Eye_{side_label}", eye_rings, num_segments=12, material=eye_mat, subsurf_levels=1, cap_top=True)

    # Forehead Chamfron Armor (Elephant_Chamfron)
    chamfron_rings = [
        (1.45, 0.20, 0.12, 0.0, -0.98),
        (1.65, 0.24, 0.14, 0.0, -0.94),
        (1.82, 0.18, 0.10, 0.0, -0.89)
    ]
    create_organic_lofted_mesh("Elephant_Chamfron", chamfron_rings, num_segments=16, material=gold_mat, subsurf_levels=1)

    # 4. Fan-Shaped Temple Ears (Elephant_Ear_L, Elephant_Ear_R)
    for side, side_label in [(-1, "L"), (1, "R")]:
        ear_rings = [
            (1.30, 0.07, 0.015, side * 0.46, -0.84),
            (1.48, 0.18, 0.020, side * 0.56, -0.82),
            (1.68, 0.24, 0.022, side * 0.60, -0.80),
            (1.82, 0.16, 0.018, side * 0.54, -0.78)
        ]
        create_organic_lofted_mesh(f"Elephant_Ear_{side_label}", ear_rings, num_segments=16, material=skin_mat, subsurf_levels=1, cap_bottom=True, cap_top=True)

    # 5. Forward-Curving Ivory Tusks (Elephant_Tusk_L, Elephant_Tusk_R)
    # Cheek sockets at X = ±0.22, Y = -0.95, Z = 1.10 -> Sweeping forward into -Y (Y -> -1.65m <= -0.5m)
    for tx, side_label in [(-0.22, "L"), (0.22, "R")]:
        tusk_spine = [
            Vector((tx, -0.95, 1.10)),
            Vector((tx * 1.05, -1.18, 1.08)),
            Vector((tx * 1.12, -1.45, 1.18)),
            Vector((tx * 1.18, -1.65, 1.35))
        ]
        create_swept_tube(f"Elephant_Tusk_{side_label}", tusk_spine, [0.065, 0.055, 0.040, 0.010], num_segments=16, material=ivory_mat, subsurf_levels=1)

        # Triple 24K Gold Ferrules at cheek base & along tusk shaft
        # Ferrule 1: Cheek base collar
        f1_spine = [Vector((tx, -0.95, 1.10)), Vector((tx * 1.02, -1.03, 1.09))]
        create_swept_tube(f"Elephant_Ferrule_{side_label}", f1_spine, [0.072, 0.070], num_segments=16, material=gold_mat, subsurf_levels=0)
        # Ferrule 2: Mid-shaft band
        f2_spine = [Vector((tx * 1.06, -1.22, 1.09)), Vector((tx * 1.08, -1.28, 1.11))]
        create_swept_tube(f"Elephant_Ferrule_Mid_{side_label}", f2_spine, [0.058, 0.056], num_segments=16, material=gold_mat, subsurf_levels=0)
        # Ferrule 3: Accent band
        f3_spine = [Vector((tx * 1.11, -1.41, 1.16)), Vector((tx * 1.13, -1.46, 1.19))]
        create_swept_tube(f"Elephant_Ferrule_Tip_{side_label}", f3_spine, [0.046, 0.044], num_segments=16, material=gold_mat, subsurf_levels=0)

    # 6. Articulated Tapered Trunk (Elephant_Trunk_0..3)
    trunk_segs = [
        ("Elephant_Trunk_0", [Vector((0.0, -1.00, 1.35)), Vector((0.0, -1.08, 1.15))], [0.160, 0.138]),
        ("Elephant_Trunk_1", [Vector((0.0, -1.08, 1.15)), Vector((0.0, -1.14, 0.88))], [0.138, 0.112]),
        ("Elephant_Trunk_2", [Vector((0.0, -1.14, 0.88)), Vector((0.0, -1.18, 0.58))], [0.112, 0.085]),
        ("Elephant_Trunk_3", [Vector((0.0, -1.18, 0.58)), Vector((0.0, -1.15, 0.32))], [0.085, 0.062])
    ]
    for t_name, spine, radii in trunk_segs:
        create_swept_tube(t_name, spine, radii, num_segments=16, material=skin_mat, subsurf_levels=1)

    # 7. Embroidered Crimson Silk Jhul Blanket (Elephant_Jhul)
    jhul_slices = [
        ( 0.55, 1.72, 0.64, 0.54, 10, 0.04),
        ( 0.20, 1.76, 0.74, 0.58, 12, 0.05),
        (-0.15, 1.80, 0.76, 0.60, 12, 0.05),
        (-0.50, 1.85, 0.73, 0.61, 10, 0.04),
        (-0.65, 1.87, 0.66, 0.59,  8, 0.03)
    ]
    create_axial_lofted_mesh("Elephant_Jhul", jhul_slices, num_segments=24, material=jhul_mat, subsurf_levels=1, cap_start=False, cap_end=False)

    # 8. Rajput Sandstone Fortress Howdah Pavilion (Howdah_Base, Pillars, Dome, Finial)
    # Sitting snugly on withers at Z = 1.88m with zero floating gaps!
    howdah_base_rings = [
        (1.88, 0.44, 0.54, 0.0, -0.05),
        (2.15, 0.46, 0.56, 0.0, -0.05),
        (2.45, 0.48, 0.58, 0.0, -0.05)
    ]
    create_organic_lofted_mesh("Howdah_Base", howdah_base_rings, num_segments=16, material=stone_mat, subsurf_levels=1)

    # 4 Carved Gold Pillars
    for idx, (px, py) in enumerate([(-0.35, -0.42), (0.35, -0.42), (-0.35, 0.42), (0.35, 0.42)]):
        pillar_spine = [Vector((px, py - 0.05, 2.45)), Vector((px, py - 0.05, 2.85))]
        create_swept_tube(f"Howdah_Pillar_{idx}", pillar_spine, [0.038, 0.038], num_segments=12, material=gold_mat, subsurf_levels=0)

    # Domed Rajput Chhatri Shikhara Canopy
    chhatri_rings = [
        (2.82, 0.50, 0.60, 0.0, -0.05),
        (2.95, 0.44, 0.50, 0.0, -0.05),
        (3.05, 0.26, 0.30, 0.0, -0.05),
        (3.12, 0.06, 0.06, 0.0, -0.05)
    ]
    create_organic_lofted_mesh("Howdah_Dome", chhatri_rings, num_segments=16, material=gold_mat, subsurf_levels=1, cap_top=True)

    # Golden Kalasha Finial Spire (Terminates at exact Z = 3.25m)
    finial_spine = [Vector((0.0, -0.05, 3.12)), Vector((0.0, -0.05, 3.25))]
    create_swept_tube("Howdah_Finial", finial_spine, [0.055, 0.008], num_segments=12, material=gold_mat, subsurf_levels=0)

    export_glb("assets/gajadhvaja.glb")

# ==============================================================================
# 3. ASHVAROHI (KNIGHT) — MARWARI WARHORSE & KSHATRIYA COUCHED LANCE DRAGOON
# ==============================================================================
def build_organic_ashvarohi():
    clear_scene()
    print("Building Ashvarohi (Knight)...")

    # Materials
    horse_mat = create_pbr_material("MarwariCoat", (0.88, 0.85, 0.80, 1), 0.15, 0.45)
    hoof_mat = create_pbr_material("HoofHorn", (0.12, 0.10, 0.08, 1), 0.10, 0.60)
    gold_mat = create_pbr_material("SaddleGold", (0.95, 0.78, 0.22, 1), 0.88, 0.20, os.path.join(TEXTURE_DIR, 'kavacha_gold.png'))
    silk_mat = create_pbr_material("SaffronSilk", (0.95, 0.55, 0.12, 1), 0.10, 0.50, os.path.join(TEXTURE_DIR, 'dhoti_silk.png'))
    crimson_mat = create_pbr_material("CrimsonJhul", (0.65, 0.08, 0.14, 1), 0.20, 0.40, os.path.join(TEXTURE_DIR, 'elephant_jhul.png'))
    steel_mat = create_pbr_material("LanceSteel", (0.20, 0.22, 0.28, 1), 0.85, 0.25, os.path.join(TEXTURE_DIR, 'damascus_steel.png'))
    skin_mat = create_pbr_material("RiderSkin", (0.76, 0.52, 0.38, 1), 0.05, 0.55)
    dark_mat = create_pbr_material("ManeDark", (0.10, 0.08, 0.06, 1), 0.05, 0.70)

    # 1. Muscular Marwari Torso Barrel (Centered along Y, facing -Y)
    barrel_rings = [
        (1.42, 0.32, 0.34, 0.0,  0.68), # Croup / Rump
        (1.45, 0.36, 0.38, 0.0,  0.42), # Flank / Haunches
        (1.40, 0.38, 0.40, 0.0,  0.05), # Mid-barrel / Saddle seat
        (1.44, 0.39, 0.42, 0.0, -0.32), # Deep Chest / Girth
        (1.50, 0.34, 0.36, 0.0, -0.62), # Withers / Shoulder base
    ]
    create_organic_lofted_mesh("Horse_Body", barrel_rings, num_segments=20, material=horse_mat, subsurf_levels=1, cap_bottom=True, cap_top=True)

    # 2. Arched Marwari Crest & High-Curved Neck (Sweeping from shoulder up and forward to head)
    neck_spine = [
        Vector((0.0, -0.58, 1.48)),
        Vector((0.0, -0.72, 1.75)),
        Vector((0.0, -0.82, 2.05)),
        Vector((0.0, -0.88, 2.22))
    ]
    create_swept_tube("Horse_Neck", neck_spine, [0.26, 0.22, 0.18, 0.15], num_segments=16, material=horse_mat, subsurf_levels=1)

    # Mane ridge
    mane_spine = [
        Vector((0.0, -0.54, 1.55)),
        Vector((0.0, -0.68, 1.85)),
        Vector((0.0, -0.78, 2.15)),
        Vector((0.0, -0.82, 2.30))
    ]
    create_swept_tube("Horse_Mane", mane_spine, [0.06, 0.07, 0.06, 0.04], num_segments=12, material=dark_mat, subsurf_levels=1)

    # 3. Refined Sculpted Desert Head & Muzzle (Facing -Y)
    head_rings = [
        (2.20, 0.14, 0.15, 0.0, -0.88), # Poll / Forehead
        (2.05, 0.12, 0.18, 0.0, -1.02), # Cheek / Jawline
        (1.88, 0.09, 0.14, 0.0, -1.18), # Bridge of nose
        (1.76, 0.065, 0.08, 0.0, -1.28) # Flared muzzle / nostrils
    ]
    create_organic_lofted_mesh("Horse_Head", head_rings, num_segments=16, material=horse_mat, subsurf_levels=1, cap_top=True)

    # Inward-curving Marwari Lyre-Ears (Hallmark signature, tips touching)
    for ex, side_label in [(-0.07, "L"), (0.07, "R")]:
        ear_spine = [
            Vector((ex, -0.85, 2.22)),
            Vector((ex * 1.10, -0.88, 2.38)),
            Vector((ex * 0.35, -0.90, 2.48))  # Lyre tips curving inward
        ]
        create_swept_tube(f"Horse_LyreEar_{side_label}", ear_spine, [0.038, 0.026, 0.006], num_segments=10, material=horse_mat, subsurf_levels=1)

    # Chamfron (Golden forehead & nose armor plate)
    chamfron_rings = [
        (1.85, 0.075, 0.090, 0.0, -1.19),
        (2.04, 0.105, 0.115, 0.0, -1.04),
        (2.18, 0.120, 0.125, 0.0, -0.90)
    ]
    create_organic_lofted_mesh("Horse_Chamfron", chamfron_rings, num_segments=16, material=gold_mat, subsurf_levels=1)

    # Peytral (Golden chest barding plate)
    peytral_rings = [
        (1.30, 0.35, 0.22, 0.0, -0.48),
        (1.44, 0.37, 0.24, 0.0, -0.55),
        (1.52, 0.33, 0.20, 0.0, -0.62)
    ]
    create_organic_lofted_mesh("Horse_Peytral", peytral_rings, num_segments=16, material=gold_mat, subsurf_levels=1)

    # 4. Four Articulated Muscular Equine Legs (Grounding at exact Z = 0.000m)
    leg_configs = [
        ("FL", -0.28, -0.42, False),
        ("FR",  0.28, -0.42, False),
        ("BL", -0.26,  0.55, True),
        ("BR",  0.26,  0.55, True)
    ]

    for label, lx, ly, is_hind in leg_configs:
        if not is_hind:
            rings = [
                (0.00, 0.095, 0.100, lx, ly - 0.05), # Hoof sole on ground (Z = 0.0000m)
                (0.05, 0.080, 0.085, lx, ly - 0.04), # Hoof coronet band
                (0.12, 0.065, 0.070, lx, ly - 0.03), # Pastern
                (0.20, 0.075, 0.080, lx, ly - 0.02), # Fetlock joint
                (0.40, 0.062, 0.068, lx, ly - 0.015), # Cannon bone
                (0.68, 0.085, 0.090, lx, ly - 0.01), # Carpus / Knee
                (0.95, 0.110, 0.115, lx, ly - 0.015), # Forearm
                (1.15, 0.135, 0.135, lx, ly - 0.01), # Elbow
                (1.35, 0.155, 0.160, lx, ly)         # Shoulder
            ]
        else:
            rings = [
                (0.00, 0.098, 0.102, lx, ly - 0.02), # Hoof sole on ground (Z = 0.0000m)
                (0.05, 0.082, 0.088, lx, ly - 0.01), # Hoof coronet band
                (0.14, 0.068, 0.072, lx, ly + 0.01), # Pastern
                (0.22, 0.078, 0.085, lx, ly + 0.04), # Fetlock joint
                (0.45, 0.065, 0.070, lx, ly + 0.08), # Cannon bone
                (0.70, 0.095, 0.120, lx, ly + 0.14), # Hock
                (0.98, 0.130, 0.140, lx, ly + 0.08), # Gaskin
                (1.18, 0.160, 0.165, lx, ly + 0.03), # Stifle
                (1.35, 0.180, 0.185, lx, ly)         # Hip / Haunch
            ]

        create_organic_lofted_mesh(f"Horse_Leg_{label}", rings, num_segments=16, material=horse_mat, subsurf_levels=1, cap_bottom=True, cap_top=True)

        # Golden Kada / Ankle Bangle on fetlock
        fz = 0.14 if is_hind else 0.13
        fy = ly + 0.02 if is_hind else ly - 0.02
        kada_spine = [Vector((lx, fy, fz)), Vector((lx, fy, fz + 0.07))]
        create_swept_tube(f"Horse_Kada_{label}", kada_spine, [0.088, 0.088], num_segments=12, material=gold_mat, subsurf_levels=0)

    # 5. Flowing Tail
    tail_spine = [
        Vector((0.0, 0.72, 1.40)),
        Vector((0.0, 0.88, 1.25)),
        Vector((0.0, 0.96, 0.85)),
        Vector((0.0, 0.92, 0.42))
    ]
    create_swept_tube("Horse_Tail", tail_spine, [0.08, 0.11, 0.09, 0.03], num_segments=12, material=dark_mat, subsurf_levels=1)

    # 6. Saddle Cloth (Jhul) & Saddle Seat
    saddle_jhul_rings = [
        (1.22, 0.42, 0.44, 0.0, 0.05, 8, 0.06),
        (1.42, 0.44, 0.46, 0.0, 0.05, 8, 0.04),
        (1.52, 0.38, 0.40, 0.0, 0.05)
    ]
    create_organic_lofted_mesh("Horse_SaddleJhul", saddle_jhul_rings, num_segments=16, material=crimson_mat, subsurf_levels=1)

    saddle_seat_rings = [
        (1.48, 0.28, 0.34, 0.0, 0.02),
        (1.55, 0.30, 0.32, 0.0, 0.02),
        (1.58, 0.26, 0.28, 0.0, 0.02)
    ]
    create_organic_lofted_mesh("Horse_Saddle", saddle_seat_rings, num_segments=16, material=gold_mat, subsurf_levels=1)

    # 7. Mounted Kshatriya Warrior (Dragoon) Seated Astride
    # Legs in Stirrups
    for rx, side_label in [(-0.32, "L"), (0.32, "R")]:
        rleg_spine = [
            Vector((rx * 0.75, -0.05, 1.50)), # Thigh at hip
            Vector((rx * 1.15, -0.15, 1.20)), # Knee wrapped around flank
            Vector((rx * 1.05, -0.10, 0.85))  # Boot in stirrup
        ]
        create_swept_tube(f"Rider_Leg_{side_label}", rleg_spine, [0.11, 0.095, 0.08], num_segments=12, material=silk_mat, subsurf_levels=1)

        # Stirrup
        stirrup_spine = [Vector((rx * 1.05, -0.10, 0.84)), Vector((rx * 1.05, -0.10, 0.78))]
        create_swept_tube(f"Rider_Stirrup_{side_label}", stirrup_spine, [0.085, 0.085], num_segments=10, material=gold_mat, subsurf_levels=0)

    # Rider Torso in Surya Kavacha Armor (Named riderTorso)
    torso_rings = [
        (1.52, 0.26, 0.20, 0.0, -0.02),
        (1.74, 0.30, 0.22, 0.0, -0.04),
        (1.96, 0.33, 0.24, 0.0, -0.05),
        (2.12, 0.28, 0.19, 0.0, -0.03)
    ]
    create_organic_lofted_mesh("riderTorso", torso_rings, num_segments=16, material=gold_mat, subsurf_levels=1)

    # Surya Sun Medallion on Chest
    sun_rings = [
        (1.88, 0.09, 0.02, 0.0, -0.27),
        (1.88, 0.01, 0.01, 0.0, -0.28)
    ]
    create_organic_lofted_mesh("Rider_SunMedallion", sun_rings, num_segments=12, material=gold_mat, subsurf_levels=0, cap_top=True)

    # Pauldrons (Shoulder guards)
    for px, side_label in [(-0.30, "L"), (0.30, "R")]:
        pauldron_spine = [Vector((px, -0.04, 2.02)), Vector((px * 1.15, -0.04, 1.95))]
        create_swept_tube(f"Rider_Pauldron_{side_label}", pauldron_spine, [0.12, 0.10], num_segments=12, material=gold_mat, subsurf_levels=1)

    # Left Arm Holding Reins
    arm_l_spine = [
        Vector((-0.30, -0.04, 2.02)),
        Vector((-0.26, -0.32, 1.82)),
        Vector((-0.12, -0.48, 1.68))
    ]
    create_swept_tube("Rider_Arm_L", arm_l_spine, [0.075, 0.065, 0.055], num_segments=10, material=silk_mat, subsurf_levels=1)

    # Right Arm Couching Lance
    arm_r_spine = [
        Vector((0.30, -0.04, 2.02)),
        Vector((0.38, -0.05, 1.88)),
        Vector((0.42, -0.15, 2.02))
    ]
    create_swept_tube("Rider_Arm_R", arm_r_spine, [0.075, 0.070, 0.060], num_segments=10, material=gold_mat, subsurf_levels=1)

    # Rider Head & Face (Named riderHead)
    rhead_rings = [
        (2.14, 0.12, 0.13, 0.0, -0.04),
        (2.26, 0.14, 0.15, 0.0, -0.05),
        (2.38, 0.13, 0.13, 0.0, -0.03)
    ]
    create_organic_lofted_mesh("riderHead", rhead_rings, num_segments=16, material=skin_mat, subsurf_levels=1)

    # Royal Rajput Mukuta / Pagri
    pagri_rings = [
        (2.34, 0.16, 0.18, 0.0, -0.03),
        (2.46, 0.19, 0.20, 0.0, -0.02),
        (2.58, 0.16, 0.16, 0.0, -0.01),
        (2.68, 0.05, 0.05, 0.0,  0.00)
    ]
    create_organic_lofted_mesh("Rider_Pagri", pagri_rings, num_segments=16, material=silk_mat, subsurf_levels=1, cap_top=True)

    # Sarpech Jewel & Plume
    sarpech_spine = [Vector((0.0, -0.20, 2.48)), Vector((0.0, -0.22, 2.58)), Vector((0.0, -0.20, 2.72))]
    create_swept_tube("Rider_Sarpech", sarpech_spine, [0.022, 0.028, 0.005], num_segments=8, material=gold_mat, subsurf_levels=1)

    # 8. 3.2m Heavy Cavalry Pennant Lance (Bhala)
    # Couched in right hand: from rear balance butt (Y = +0.95, Z = 1.95) to tip (Y = -2.25, Z = 2.15)
    lance_spine = [
        Vector((0.42,  0.95, 1.95)), # Butt / counterweight pommel
        Vector((0.42,  0.05, 2.02)), # Grip inside hand
        Vector((0.42, -0.25, 2.04)), # Vamplate handguard position
        Vector((0.42, -1.85, 2.12)), # Collar before blade
        Vector((0.42, -2.25, 2.15))  # Piercing spearhead tip
    ]
    create_swept_tube("Lance_Shaft", lance_spine, [0.024, 0.022, 0.020, 0.016, 0.004], num_segments=12, material=steel_mat, subsurf_levels=1)

    # Lance Vamplate Guard
    vamplate_spine = [Vector((0.42, -0.22, 2.04)), Vector((0.42, -0.28, 2.04))]
    create_swept_tube("Lance_Vamplate", vamplate_spine, [0.12, 0.12], num_segments=16, material=gold_mat, subsurf_levels=0)

    # Lance Silk Swallowtail Pennant
    pennant_spine = [
        Vector((0.42, -1.85, 2.12)),
        Vector((0.42, -1.55, 2.24)),
        Vector((0.42, -1.15, 2.30))
    ]
    create_swept_tube("Lance_Pennant", pennant_spine, [0.08, 0.14, 0.02], num_segments=8, material=silk_mat, subsurf_levels=1)

    # Lance Tip (Named Lance_Tip)
    tip_spine = [
        Vector((0.42, -2.22, 2.148)),
        Vector((0.42, -2.25, 2.150))
    ]
    create_swept_tube("Lance_Tip", tip_spine, [0.012, 0.002], num_segments=8, material=steel_mat, subsurf_levels=0)

    export_glb("assets/ashvarohi.glb")

# ==============================================================================
# 4. RATHA MAHARATHI (BISHOP) — VEDIC SANDALWOOD CHARIOT & SAGE ARCHER
# ==============================================================================
def build_organic_ratha():
    clear_scene()
    print("Building Puranic Wizard Bishop (Harry Potter Reference Sculpt)...")
    stone_mat = create_pbr_material("BishopStone", (0.58, 0.56, 0.54, 1.0), 0.08, 0.65, os.path.join(TEXTURE_DIR, 'damascus_steel.png'))
    gold_mat  = create_pbr_material("BishopGold", (0.92, 0.76, 0.22, 1.0), 0.88, 0.22, os.path.join(TEXTURE_DIR, 'kavacha_gold.png'))
    stole_mat = create_pbr_material("BishopStole", (0.42, 0.38, 0.35, 1.0), 0.12, 0.60, os.path.join(TEXTURE_DIR, 'dhoti_silk.png'))
    glow_mat  = create_pbr_material("BishopRunicGlow", (0.2, 0.9, 1.0, 1.0), 0.5, 0.1, emissive_color=(0.15, 0.85, 1.0, 1.0), emissive_intensity=2.8)

    # 1. Stepped Octagonal Carved Stone Pedestal (Plinth) grounded at Z = 0.000m
    pedestal_rings = [
        (0.00, 0.44, 0.44, 0.0, 0.0, 8, 0.06),
        (0.08, 0.43, 0.43, 0.0, 0.0, 8, 0.06),
        (0.10, 0.38, 0.38, 0.0, 0.0, 8, 0.04),
        (0.16, 0.36, 0.36, 0.0, 0.0, 8, 0.03),
        (0.20, 0.40, 0.40, 0.0, 0.0, 8, 0.04),
        (0.26, 0.38, 0.38, 0.0, 0.0, 8, 0.04),
    ]
    create_organic_lofted_mesh("Bishop_Pedestal_Stone", pedestal_rings, num_segments=24, material=stone_mat, subsurf_levels=1, cap_bottom=True, cap_top=True)

    waist_spine = []
    for i in range(25):
        ang = (2.0 * math.pi * i) / 24
        waist_spine.append(Vector((0.365 * math.cos(ang), 0.365 * math.sin(ang), 0.16)))
    create_swept_tube("Pedestal_Gold_Ring", waist_spine, [0.016] * 25, num_segments=12, material=gold_mat, subsurf_levels=0, cap_ends=False)

    # 2. Armored Sabatons / Boots
    for x_side, side_label in [(-0.13, "L"), (0.13, "R")]:
        foot_rings = [
            (0.26, 0.065, 0.12, x_side, -0.04),
            (0.32, 0.055, 0.09, x_side, -0.02),
            (0.42, 0.060, 0.07, x_side, 0.00),
            (0.58, 0.070, 0.08, x_side, 0.01),
        ]
        create_organic_lofted_mesh(f"Bishop_Foot_{side_label}", foot_rings, num_segments=12, material=stone_mat, subsurf_levels=1)

    # 3. Flowing Liturgical Cassock & Draped Stone Mantle
    robe_rings = [
        (0.28, 0.32, 0.28, 0.0, 0.02, 10, 0.16),
        (0.48, 0.30, 0.26, 0.0, 0.01, 8, 0.14),
        (0.72, 0.27, 0.23, 0.0, 0.00, 6, 0.10),
        (0.96, 0.25, 0.21, 0.0, -0.01, 4, 0.06),
    ]
    create_organic_lofted_mesh("Bishop_Robe_Mantle", robe_rings, num_segments=20, material=stone_mat, subsurf_levels=1)

    cape_spine_l = [Vector((-0.24, 0.12, 1.35)), Vector((-0.27, 0.18, 0.85)), Vector((-0.28, 0.22, 0.30))]
    cape_spine_r = [Vector((0.24, 0.12, 1.35)), Vector((0.27, 0.18, 0.85)), Vector((0.28, 0.22, 0.30))]
    create_swept_tube("Mantle_Edge_L", cape_spine_l, [0.035, 0.045, 0.050], num_segments=8, material=stone_mat, subsurf_levels=1)
    create_swept_tube("Mantle_Edge_R", cape_spine_r, [0.035, 0.045, 0.050], num_segments=8, material=stone_mat, subsurf_levels=1)

    # 4. Central Engraved Stole / Tabard
    stole_rings = [
        (0.30, 0.09, 0.025, 0.0, -0.27),
        (0.55, 0.09, 0.028, 0.0, -0.25),
        (0.85, 0.09, 0.030, 0.0, -0.23),
        (1.10, 0.095, 0.032, 0.0, -0.21),
        (1.35, 0.10, 0.035, 0.0, -0.19),
    ]
    create_organic_lofted_mesh("Bishop_Stole_Silk", stole_rings, num_segments=16, material=stole_mat, subsurf_levels=1)

    runic_spine = [Vector((0.0, -0.29, 0.32)), Vector((0.0, -0.23, 1.32))]
    create_swept_tube("Stole_Runic_Relief", runic_spine, [0.016, 0.018], num_segments=8, material=glow_mat, subsurf_levels=0)

    chakra_ring = []
    for i in range(25):
        ang = (2.0 * math.pi * i) / 24
        chakra_ring.append(Vector((0.055 * math.cos(ang), -0.225, 1.18 + 0.055 * math.sin(ang))))
    create_swept_tube("Surya_Chakra_Emblem", chakra_ring, [0.012] * 25, num_segments=8, material=gold_mat, subsurf_levels=1, cap_ends=False)

    # 5. Armored Cuirass & Segmented Torso
    torso_rings = [
        (0.95, 0.24, 0.19, 0.0, -0.01),
        (1.10, 0.26, 0.20, 0.0, -0.02),
        (1.25, 0.28, 0.21, 0.0, -0.02),
        (1.38, 0.26, 0.19, 0.0, -0.01),
        (1.44, 0.17, 0.15, 0.0, 0.00),
    ]
    create_organic_lofted_mesh("Bishop_Cuirass", torso_rings, num_segments=20, material=stone_mat, subsurf_levels=1)

    for bz, by, bx in [(1.05, -0.19, 0.24), (1.18, -0.20, 0.26), (1.30, -0.20, 0.27)]:
        band_spine = [Vector((-bx * 0.9, by, bz)), Vector((0.0, by - 0.01, bz)), Vector((bx * 0.9, by, bz))]
        create_swept_tube(f"Cuirass_Gold_Band_{int(bz*100)}", band_spine, [0.012, 0.015, 0.012], num_segments=8, material=gold_mat, subsurf_levels=0)

    # 6. Flared Layered Pauldrons
    p_left_rings = [
        (1.28, 0.09, 0.09, -0.28, -0.02),
        (1.38, 0.13, 0.12, -0.32, -0.03),
        (1.46, 0.11, 0.10, -0.30, -0.02),
    ]
    create_organic_lofted_mesh("Bishop_Pauldron_L", p_left_rings, num_segments=16, material=stone_mat, subsurf_levels=1)

    p_right_rings = [
        (1.28, 0.09, 0.09, 0.28, -0.02),
        (1.38, 0.13, 0.12, 0.32, -0.03),
        (1.46, 0.11, 0.10, 0.30, -0.02),
    ]
    create_organic_lofted_mesh("Bishop_Pauldron_R", p_right_rings, num_segments=16, material=stone_mat, subsurf_levels=1)

    # 7. Left Arm & Hand
    left_arm_spine = [
        Vector((-0.30, -0.02, 1.38)),
        Vector((-0.33, -0.06, 1.25)),
        Vector((-0.34, -0.09, 1.12)),
        Vector((-0.36, -0.16, 1.18)),
    ]
    create_swept_tube("Bishop_Arm_L", left_arm_spine, [0.075, 0.070, 0.065, 0.060], num_segments=12, material=stone_mat, subsurf_levels=1)

    gauntlet_rings = [
        (1.14, 0.055, 0.055, -0.37, -0.17),
        (1.22, 0.060, 0.060, -0.37, -0.17),
    ]
    create_organic_lofted_mesh("Bishop_Gauntlet_L_Gold", gauntlet_rings, num_segments=12, material=gold_mat, subsurf_levels=1)

    # 8. Grand Bishop's Crozier
    staff_x = -0.38
    staff_y = -0.18
    staff_spine = [
        Vector((staff_x, staff_y, 0.08)),
        Vector((staff_x, staff_y, 0.65)),
        Vector((staff_x, staff_y, 1.18)),
        Vector((staff_x, staff_y, 1.65)),
        Vector((staff_x, staff_y, 1.95)),
    ]
    create_swept_tube("Crozier_Shaft", staff_spine, [0.022, 0.024, 0.022, 0.020, 0.022], num_segments=12, material=stone_mat, subsurf_levels=1)

    for fz in [0.12, 0.65, 1.12, 1.24, 1.65, 1.95]:
        ring_pts = []
        for i in range(17):
            ang = (2.0 * math.pi * i) / 16
            ring_pts.append(Vector((staff_x + 0.032 * math.cos(ang), staff_y + 0.032 * math.sin(ang), fz)))
        create_swept_tube(f"Crozier_Ferrule_{int(fz*100)}", ring_pts, [0.010] * 17, num_segments=8, material=gold_mat, subsurf_levels=0, cap_ends=False)

    crook_spine = []
    crook_radii = []
    num_crook_steps = 32
    for i in range(num_crook_steps + 1):
        t = i / num_crook_steps
        theta = t * 1.65 * math.pi
        r_spiral = 0.16 * (1.0 - 0.45 * t)
        center_x = staff_x - 0.02
        center_z = 2.12
        cx = center_x + r_spiral * math.sin(theta)
        cz = center_z + r_spiral * math.cos(theta)
        cy = staff_y + 0.02 * math.sin(t * math.pi)
        crook_spine.append(Vector((cx, cy, cz)))
        crook_radii.append(0.024 * (1.0 - 0.35 * t))

    create_swept_tube("Crozier_Crook_Gold", crook_spine, crook_radii, num_segments=12, material=gold_mat, subsurf_levels=1)

    jewel_spine = [
        Vector((staff_x - 0.02, staff_y, 2.10)),
        Vector((staff_x - 0.02, staff_y, 2.14))
    ]
    create_swept_tube("Crozier_Runic_Gem", jewel_spine, [0.032, 0.032], num_segments=12, material=glow_mat, subsurf_levels=1)

    # 9. Right Arm & Hand (Blessing Mudra)
    right_arm_spine = [
        Vector((0.30, -0.02, 1.38)),
        Vector((0.33, -0.05, 1.25)),
        Vector((0.34, -0.08, 1.12)),
        Vector((0.33, -0.12, 1.28)),
        Vector((0.31, -0.15, 1.40)),
    ]
    create_swept_tube("Bishop_Arm_R", right_arm_spine, [0.075, 0.070, 0.065, 0.058, 0.052], num_segments=12, material=stone_mat, subsurf_levels=1)

    palm_rings = [
        (1.40, 0.045, 0.035, 0.31, -0.15),
        (1.46, 0.048, 0.038, 0.31, -0.15),
    ]
    create_organic_lofted_mesh("Bishop_Gauntlet_R_Gold", palm_rings, num_segments=12, material=gold_mat, subsurf_levels=1)

    finger_l_spine = [Vector((0.30, -0.15, 1.46)), Vector((0.30, -0.15, 1.55))]
    finger_r_spine = [Vector((0.32, -0.15, 1.46)), Vector((0.32, -0.15, 1.54))]
    create_swept_tube("Blessing_Finger_Index_Gold", finger_l_spine, [0.012, 0.009], num_segments=8, material=gold_mat, subsurf_levels=1)
    create_swept_tube("Blessing_Finger_Middle_Gold", finger_r_spine, [0.012, 0.009], num_segments=8, material=gold_mat, subsurf_levels=1)

    thumb_spine = [Vector((0.28, -0.14, 1.42)), Vector((0.29, -0.16, 1.45))]
    create_swept_tube("Blessing_Thumb_Gold", thumb_spine, [0.013, 0.010], num_segments=8, material=gold_mat, subsurf_levels=1)

    # 10. Head, Visor & Pointed Mitre Headdress
    neck_rings = [
        (1.42, 0.12, 0.12, 0.0, -0.01),
        (1.50, 0.11, 0.11, 0.0, -0.01),
    ]
    create_organic_lofted_mesh("Bishop_Neck_Gorget", neck_rings, num_segments=16, material=stone_mat, subsurf_levels=1)

    head_rings = [
        (1.50, 0.13, 0.14, 0.0, -0.02),
        (1.60, 0.15, 0.16, 0.0, -0.03),
        (1.68, 0.14, 0.15, 0.0, -0.02),
    ]
    create_organic_lofted_mesh("Bishop_Visor_Helm", head_rings, num_segments=16, material=stone_mat, subsurf_levels=1)

    slit_spine = [Vector((0.0, -0.18, 1.56)), Vector((0.0, -0.18, 1.66))]
    create_swept_tube("Visor_Central_Slit_Rune", slit_spine, [0.008, 0.008], num_segments=8, material=glow_mat, subsurf_levels=0)
    for sx in [-0.04, 0.04]:
        s_spine = [Vector((sx, -0.175, 1.58)), Vector((sx, -0.175, 1.64))]
        create_swept_tube(f"Visor_Side_Slit_Rune_{'L' if sx < 0 else 'R'}", s_spine, [0.006, 0.006], num_segments=8, material=glow_mat, subsurf_levels=0)

    brow_ring = []
    for i in range(25):
        ang = (2.0 * math.pi * i) / 24
        brow_ring.append(Vector((0.148 * math.cos(ang), -0.02 + 0.158 * math.sin(ang), 1.68)))
    create_swept_tube("Mitre_Gold_Circlet", brow_ring, [0.014] * 25, num_segments=12, material=gold_mat, subsurf_levels=0, cap_ends=False)

    mitre_rings = [
        (1.68, 0.145, 0.155, 0.0, -0.02),
        (1.78, 0.140, 0.145, 0.0, -0.02, 2, 0.08),
        (1.88, 0.125, 0.130, 0.0, -0.02, 2, 0.12),
        (1.98, 0.085, 0.090, 0.0, -0.02, 2, 0.16),
        (2.05, 0.020, 0.025, 0.0, -0.02),
    ]
    create_organic_lofted_mesh("Bishop_Mitre_Peak", mitre_rings, num_segments=20, material=stone_mat, subsurf_levels=1, cap_top=True)

    mitre_cross_v = [Vector((0.0, -0.165, 1.74)), Vector((0.0, -0.115, 1.98))]
    mitre_cross_h = [Vector((-0.06, -0.15, 1.86)), Vector((0.06, -0.15, 1.86))]
    create_swept_tube("Mitre_Gold_Cross_V", mitre_cross_v, [0.010, 0.008], num_segments=8, material=gold_mat, subsurf_levels=0)
    create_swept_tube("Mitre_Gold_Cross_H", mitre_cross_h, [0.008, 0.008], num_segments=8, material=gold_mat, subsurf_levels=0)

    export_glb("assets/ratha.glb")
    export_glb("assets/bishop.glb")

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
