r"""
Build Harry Potter Franchise Reference Bishop Model for Royal Ranbhoomi
Target: Blender 4.2.0 LTS (Headless CLI)
Reference: Harry Potter Wizard's Chess Bishop Piece (Sketchfab e95eb1581df145b4910f8130b2aaa977)
Features:
  - Stepped octagonal carved stone plinth/pedestal
  - Flowing liturgical vestments / cassock / draped mantle
  - Central engraved stole / tabard with sacred relief runes and Chakra emblem
  - Segmented stone cuirass & layered shoulder pauldrons
  - Left arm gripping tall fluted Bishop's Crozier staff with curled spiral crook head
  - Right arm raised in liturgical blessing mudra
  - Knight visor helm with tall pointed stone Bishop's Mitre headdress
  - Strict 0-height grounding (Z_min = 0.000000m)
  - Full PBR materials with emissive runic inlays
"""

import bpy
import bmesh
import math
import mathutils
from mathutils import Vector, Matrix, Quaternion
import os

TEXTURE_DIR = os.path.abspath('assets/textures')

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

def create_organic_lofted_mesh(name, rings, num_segments=20, material=None, subsurf_levels=1, cap_bottom=False, cap_top=False):
    """
    rings format: [(z, rx, ry, ox, oy, pleats, p_depth), ...]
    """
    bm = bmesh.new()
    prev_ring = []

    for r_data in rings:
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
    bm = bmesh.new()
    n_pts = len(spine_points)
    if n_pts < 2:
        return None

    tangents = []
    for i in range(n_pts):
        if i == 0:
            t = (spine_points[1] - spine_points[0]).normalized()
        elif i == n_pts - 1:
            t = (spine_points[-1] - spine_points[-2]).normalized()
        else:
            t = (spine_points[i + 1] - spine_points[i - 1]).normalized()
        tangents.append(t)

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
            q = Quaternion(axis, ang)
            ni = q @ frames[-1][0]
            bi = q @ frames[-1][1]
        else:
            ni = frames[-1][0]
            bi = frames[-1][1]
        frames.append((ni.normalized(), bi.normalized()))

    prev_ring = []
    for i in range(n_pts):
        p = spine_points[i]
        r = radii[i] if isinstance(radii, list) else radii
        ni, bi = frames[i]
        curr_ring = []
        for j in range(num_segments):
            ang = (2.0 * math.pi * j) / num_segments
            vx = p.x + r * (math.cos(ang) * ni.x + math.sin(ang) * bi.x)
            vy = p.y + r * (math.cos(ang) * ni.y + math.sin(ang) * bi.y)
            vz = p.z + r * (math.cos(ang) * ni.z + math.sin(ang) * bi.z)
            curr_ring.append(bm.verts.new((vx, vy, vz)))

        if prev_ring:
            for j in range(num_segments):
                bm.faces.new((prev_ring[j], prev_ring[(j + 1) % num_segments], curr_ring[(j + 1) % num_segments], curr_ring[j]))
        elif cap_ends:
            c_v = bm.verts.new(p)
            for j in range(num_segments):
                bm.faces.new((c_v, curr_ring[(j + 1) % num_segments], curr_ring[j]))

        prev_ring = curr_ring

    if cap_ends and prev_ring:
        c_v = bm.verts.new(spine_points[-1])
        for j in range(num_segments):
            bm.faces.new((c_v, prev_ring[j], prev_ring[(j + 1) % num_segments]))

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

def ground_all_objects_to_zero():
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
    print(f"Successfully Exported Grounded Model: {filepath}")

# ==============================================================================
# HARRY POTTER WIZARD'S CHESS BISHOP SCULPT
# ==============================================================================
def build_harry_potter_puranic_bishop():
    clear_scene()
    print("Building Harry Potter Reference Bishop Model...")

    stone_mat = create_pbr_material("BishopStone", (0.58, 0.56, 0.54, 1.0), 0.08, 0.65, os.path.join(TEXTURE_DIR, 'damascus_steel.png'))
    gold_mat  = create_pbr_material("BishopGold", (0.92, 0.76, 0.22, 1.0), 0.88, 0.22, os.path.join(TEXTURE_DIR, 'kavacha_gold.png'))
    stole_mat = create_pbr_material("BishopStole", (0.42, 0.38, 0.35, 1.0), 0.12, 0.60, os.path.join(TEXTURE_DIR, 'dhoti_silk.png'))
    glow_mat  = create_pbr_material("BishopRunicGlow", (0.2, 0.9, 1.0, 1.0), 0.5, 0.1, emissive_color=(0.15, 0.85, 1.0, 1.0), emissive_intensity=2.8)

    # --------------------------------------------------------------------------
    # 1. Stepped Octagonal Carved Stone Pedestal (Plinth)
    #    8 segments with faceted chamfers, grounded at Z = 0.000m
    # --------------------------------------------------------------------------
    pedestal_rings = [
        # (z, rx, ry, ox, oy, pleats, p_depth)
        (0.00, 0.44, 0.44, 0.0, 0.0, 8, 0.06), # bottom footpad
        (0.08, 0.43, 0.43, 0.0, 0.0, 8, 0.06), # lower plinth step
        (0.10, 0.38, 0.38, 0.0, 0.0, 8, 0.04), # waist inward chamfer
        (0.16, 0.36, 0.36, 0.0, 0.0, 8, 0.03), # toroidal neck
        (0.20, 0.40, 0.40, 0.0, 0.0, 8, 0.04), # upper stepped tier
        (0.26, 0.38, 0.38, 0.0, 0.0, 8, 0.04), # top platform
    ]
    create_organic_lofted_mesh("Bishop_Pedestal_Stone", pedestal_rings, num_segments=24, material=stone_mat, subsurf_levels=1, cap_bottom=True, cap_top=True)

    # Decorative gold trim ring around pedestal waist
    waist_spine = []
    for i in range(25):
        ang = (2.0 * math.pi * i) / 24
        waist_spine.append(Vector((0.365 * math.cos(ang), 0.365 * math.sin(ang), 0.16)))
    create_swept_tube("Pedestal_Gold_Ring", waist_spine, [0.016] * 25, num_segments=12, material=gold_mat, subsurf_levels=0, cap_ends=False)

    # --------------------------------------------------------------------------
    # 2. Armored Sabatons / Boots (Standing on Pedestal)
    # --------------------------------------------------------------------------
    for x_side, side_label in [(-0.13, "L"), (0.13, "R")]:
        foot_rings = [
            (0.26, 0.065, 0.12, x_side, -0.04), # sole on pedestal
            (0.32, 0.055, 0.09, x_side, -0.02), # instep
            (0.42, 0.060, 0.07, x_side, 0.00),  # ankle greave
            (0.58, 0.070, 0.08, x_side, 0.01),  # calf greave
        ]
        create_organic_lofted_mesh(f"Bishop_Foot_{side_label}", foot_rings, num_segments=12, material=stone_mat, subsurf_levels=1)

    # --------------------------------------------------------------------------
    # 3. Flowing Liturgical Cassock & Draped Stone Mantle
    #    Drapes gracefully from hips down to top of pedestal
    # --------------------------------------------------------------------------
    robe_rings = [
        # (z, rx, ry, ox, oy, pleats, p_depth)
        (0.28, 0.32, 0.28, 0.0, 0.02, 10, 0.16), # hem spreading over pedestal
        (0.48, 0.30, 0.26, 0.0, 0.01, 8, 0.14),  # lower calves
        (0.72, 0.27, 0.23, 0.0, 0.00, 6, 0.10),  # knees
        (0.96, 0.25, 0.21, 0.0, -0.01, 4, 0.06), # waist / cincture
    ]
    create_organic_lofted_mesh("Bishop_Robe_Mantle", robe_rings, num_segments=20, material=stone_mat, subsurf_levels=1)

    # Stone Mantle Cape flowing down the back (+Y)
    cape_spine_l = [Vector((-0.24, 0.12, 1.35)), Vector((-0.27, 0.18, 0.85)), Vector((-0.28, 0.22, 0.30))]
    cape_spine_r = [Vector((0.24, 0.12, 1.35)), Vector((0.27, 0.18, 0.85)), Vector((0.28, 0.22, 0.30))]
    create_swept_tube("Mantle_Edge_L", cape_spine_l, [0.035, 0.045, 0.050], num_segments=8, material=stone_mat, subsurf_levels=1)
    create_swept_tube("Mantle_Edge_R", cape_spine_r, [0.035, 0.045, 0.050], num_segments=8, material=stone_mat, subsurf_levels=1)

    # --------------------------------------------------------------------------
    # 4. Central Engraved Stole / Tabard (The Harry Potter Bishop Signature)
    #    Prominent vertical strip running down chest and legs
    # --------------------------------------------------------------------------
    stole_rings = [
        # (z, rx, ry, ox, oy)
        (0.30, 0.09, 0.025, 0.0, -0.27), # lower hem near feet
        (0.55, 0.09, 0.028, 0.0, -0.25),
        (0.85, 0.09, 0.030, 0.0, -0.23),
        (1.10, 0.095, 0.032, 0.0, -0.21),
        (1.35, 0.10, 0.035, 0.0, -0.19), # collar junction
    ]
    create_organic_lofted_mesh("Bishop_Stole_Silk", stole_rings, num_segments=16, material=stole_mat, subsurf_levels=1)

    # Central Sacred Runic Relief Stripe down stole
    runic_spine = [Vector((0.0, -0.29, 0.32)), Vector((0.0, -0.23, 1.32))]
    create_swept_tube("Stole_Runic_Relief", runic_spine, [0.016, 0.018], num_segments=8, material=glow_mat, subsurf_levels=0)

    # Surya Chakra Medallion Emblem on chest of the stole
    chakra_ring = []
    for i in range(25):
        ang = (2.0 * math.pi * i) / 24
        chakra_ring.append(Vector((0.055 * math.cos(ang), -0.225, 1.18 + 0.055 * math.sin(ang))))
    create_swept_tube("Surya_Chakra_Emblem", chakra_ring, [0.012] * 25, num_segments=8, material=gold_mat, subsurf_levels=1, cap_ends=False)

    # --------------------------------------------------------------------------
    # 5. Armored Cuirass & Segmented Torso
    # --------------------------------------------------------------------------
    torso_rings = [
        (0.95, 0.24, 0.19, 0.0, -0.01), # belt / cincture
        (1.10, 0.26, 0.20, 0.0, -0.02), # abdomen
        (1.25, 0.28, 0.21, 0.0, -0.02), # chest / pectorals
        (1.38, 0.26, 0.19, 0.0, -0.01), # upper chest
        (1.44, 0.17, 0.15, 0.0, 0.00),  # neck base / collar
    ]
    create_organic_lofted_mesh("Bishop_Cuirass", torso_rings, num_segments=20, material=stone_mat, subsurf_levels=1)

    # Horizontal Ribbed Plate Bands across cuirass
    for bz, by, bx in [(1.05, -0.19, 0.24), (1.18, -0.20, 0.26), (1.30, -0.20, 0.27)]:
        band_spine = [Vector((-bx * 0.9, by, bz)), Vector((0.0, by - 0.01, bz)), Vector((bx * 0.9, by, bz))]
        create_swept_tube(f"Cuirass_Gold_Band_{int(bz*100)}", band_spine, [0.012, 0.015, 0.012], num_segments=8, material=gold_mat, subsurf_levels=0)

    # --------------------------------------------------------------------------
    # 6. Flared Layered Pauldrons (Shoulder Guards)
    # --------------------------------------------------------------------------
    # Left Pauldron (angled to support Crozier staff)
    p_left_rings = [
        (1.28, 0.09, 0.09, -0.28, -0.02),
        (1.38, 0.13, 0.12, -0.32, -0.03),
        (1.46, 0.11, 0.10, -0.30, -0.02),
    ]
    create_organic_lofted_mesh("Bishop_Pauldron_L", p_left_rings, num_segments=16, material=stone_mat, subsurf_levels=1)

    # Right Pauldron (draped over blessing arm)
    p_right_rings = [
        (1.28, 0.09, 0.09, 0.28, -0.02),
        (1.38, 0.13, 0.12, 0.32, -0.03),
        (1.46, 0.11, 0.10, 0.30, -0.02),
    ]
    create_organic_lofted_mesh("Bishop_Pauldron_R", p_right_rings, num_segments=16, material=stone_mat, subsurf_levels=1)

    # --------------------------------------------------------------------------
    # 7. Left Arm & Hand (Firmly Holding the Crozier Staff)
    # --------------------------------------------------------------------------
    # Upper Arm: shoulder (-0.30, -0.02, 1.38) down to elbow (-0.33, -0.08, 1.12)
    left_arm_spine = [
        Vector((-0.30, -0.02, 1.38)),
        Vector((-0.33, -0.06, 1.25)),
        Vector((-0.34, -0.09, 1.12)), # elbow
        Vector((-0.36, -0.16, 1.18)), # forearm forward to grasp staff
    ]
    create_swept_tube("Bishop_Arm_L", left_arm_spine, [0.075, 0.070, 0.065, 0.060], num_segments=12, material=stone_mat, subsurf_levels=1)

    # Armored Gauntlet gripping Crozier at (-0.38, -0.18, 1.18)
    gauntlet_rings = [
        (1.14, 0.055, 0.055, -0.37, -0.17),
        (1.22, 0.060, 0.060, -0.37, -0.17),
    ]
    create_organic_lofted_mesh("Bishop_Gauntlet_L_Gold", gauntlet_rings, num_segments=12, material=gold_mat, subsurf_levels=1)

    # --------------------------------------------------------------------------
    # 8. The Grand Bishop's Crozier (Staff with Curled Spiral Crook Head)
    #    Staff shaft planted near base, rising to 2.38m high!
    # --------------------------------------------------------------------------
    staff_x = -0.38
    staff_y = -0.18

    # Main vertical fluted shaft from Z = 0.08m to Z = 1.95m
    staff_spine = [
        Vector((staff_x, staff_y, 0.08)),
        Vector((staff_x, staff_y, 0.65)),
        Vector((staff_x, staff_y, 1.18)), # where hand grasps it
        Vector((staff_x, staff_y, 1.65)),
        Vector((staff_x, staff_y, 1.95)), # top ferrule
    ]
    create_swept_tube("Crozier_Shaft", staff_spine, [0.022, 0.024, 0.022, 0.020, 0.022], num_segments=12, material=stone_mat, subsurf_levels=1)

    # 24K Gold Ferrules and Knops along Crozier shaft
    for fz in [0.12, 0.65, 1.12, 1.24, 1.65, 1.95]:
        ring_pts = []
        for i in range(17):
            ang = (2.0 * math.pi * i) / 16
            ring_pts.append(Vector((staff_x + 0.032 * math.cos(ang), staff_y + 0.032 * math.sin(ang), fz)))
        create_swept_tube(f"Crozier_Ferrule_{int(fz*100)}", ring_pts, [0.010] * 17, num_segments=8, material=gold_mat, subsurf_levels=0, cap_ends=False)

    # THE CROOK HEAD: Majestic 360-degree spiral volute curling inward!
    # Starts at (staff_x, staff_y, 1.95), sweeps upward and curls inward
    crook_spine = []
    crook_radii = []
    # Parametric spiral: arch up to apex ~2.35m, then curve around and inward
    num_crook_steps = 32
    for i in range(num_crook_steps + 1):
        t = i / num_crook_steps
        # angle sweeps from 0 to ~1.65 * pi radians
        theta = t * 1.65 * math.pi
        # Spiral radius shrinking as it curls inward
        r_spiral = 0.16 * (1.0 - 0.45 * t)
        # Center of the crook head
        center_x = staff_x - 0.02
        center_z = 2.12
        # Parametric curve in X-Z plane
        cx = center_x + r_spiral * math.sin(theta)
        cz = center_z + r_spiral * math.cos(theta)
        cy = staff_y + 0.02 * math.sin(t * math.pi)
        crook_spine.append(Vector((cx, cy, cz)))
        # Tapering thickness
        crook_radii.append(0.024 * (1.0 - 0.35 * t))

    create_swept_tube("Crozier_Crook_Gold", crook_spine, crook_radii, num_segments=12, material=gold_mat, subsurf_levels=1)

    # Radiant Runic Jewel inside the eye of the Crozier crook
    jewel_spine = [
        Vector((staff_x - 0.02, staff_y, 2.10)),
        Vector((staff_x - 0.02, staff_y, 2.14))
    ]
    create_swept_tube("Crozier_Runic_Gem", jewel_spine, [0.032, 0.032], num_segments=12, material=glow_mat, subsurf_levels=1)

    # --------------------------------------------------------------------------
    # 9. Right Arm & Hand (Raised in Liturgical Blessing Gesture)
    # --------------------------------------------------------------------------
    # Upper arm down/forward: shoulder (0.30, -0.02, 1.38) to elbow (0.34, -0.08, 1.12)
    # Forearm raised upward: elbow (0.34, -0.08, 1.12) to hand (0.32, -0.14, 1.40)
    right_arm_spine = [
        Vector((0.30, -0.02, 1.38)),
        Vector((0.33, -0.05, 1.25)),
        Vector((0.34, -0.08, 1.12)), # elbow
        Vector((0.33, -0.12, 1.28)), # forearm ascending
        Vector((0.31, -0.15, 1.40)), # wrist / hand
    ]
    create_swept_tube("Bishop_Arm_R", right_arm_spine, [0.075, 0.070, 0.065, 0.058, 0.052], num_segments=12, material=stone_mat, subsurf_levels=1)

    # Blessing Gauntlet Palm & Two Extended Fingers (Index + Middle)
    palm_rings = [
        (1.40, 0.045, 0.035, 0.31, -0.15),
        (1.46, 0.048, 0.038, 0.31, -0.15),
    ]
    create_organic_lofted_mesh("Bishop_Gauntlet_R_Gold", palm_rings, num_segments=12, material=gold_mat, subsurf_levels=1)

    # Two extended blessing fingers pointing upward
    finger_l_spine = [Vector((0.30, -0.15, 1.46)), Vector((0.30, -0.15, 1.55))]
    finger_r_spine = [Vector((0.32, -0.15, 1.46)), Vector((0.32, -0.15, 1.54))]
    create_swept_tube("Blessing_Finger_Index_Gold", finger_l_spine, [0.012, 0.009], num_segments=8, material=gold_mat, subsurf_levels=1)
    create_swept_tube("Blessing_Finger_Middle_Gold", finger_r_spine, [0.012, 0.009], num_segments=8, material=gold_mat, subsurf_levels=1)

    # Folded thumb and other fingers
    thumb_spine = [Vector((0.28, -0.14, 1.42)), Vector((0.29, -0.16, 1.45))]
    create_swept_tube("Blessing_Thumb_Gold", thumb_spine, [0.013, 0.010], num_segments=8, material=gold_mat, subsurf_levels=1)

    # --------------------------------------------------------------------------
    # 10. Head, Slotted Knight Visor & Pointed Bishop's Mitre Headdress
    # --------------------------------------------------------------------------
    # Neck & Gorget
    neck_rings = [
        (1.42, 0.12, 0.12, 0.0, -0.01),
        (1.50, 0.11, 0.11, 0.0, -0.01),
    ]
    create_organic_lofted_mesh("Bishop_Neck_Gorget", neck_rings, num_segments=16, material=stone_mat, subsurf_levels=1)

    # Head Helmet with Slotted Visor Face
    head_rings = [
        (1.50, 0.13, 0.14, 0.0, -0.02), # chin / jaw
        (1.60, 0.15, 0.16, 0.0, -0.03), # mid face / cheekbones
        (1.68, 0.14, 0.15, 0.0, -0.02), # brow line
    ]
    create_organic_lofted_mesh("Bishop_Visor_Helm", head_rings, num_segments=16, material=stone_mat, subsurf_levels=1)

    # Visor Vertical Vision Slits (Imposing knightly face opening with runic glow)
    slit_spine = [Vector((0.0, -0.18, 1.56)), Vector((0.0, -0.18, 1.66))]
    create_swept_tube("Visor_Central_Slit_Rune", slit_spine, [0.008, 0.008], num_segments=8, material=glow_mat, subsurf_levels=0)
    for sx in [-0.04, 0.04]:
        s_spine = [Vector((sx, -0.175, 1.58)), Vector((sx, -0.175, 1.64))]
        create_swept_tube(f"Visor_Side_Slit_Rune_{'L' if sx < 0 else 'R'}", s_spine, [0.006, 0.006], num_segments=8, material=glow_mat, subsurf_levels=0)

    # Decorative Gold Circlet / Coronet around brow beneath Mitre
    brow_ring = []
    for i in range(25):
        ang = (2.0 * math.pi * i) / 24
        brow_ring.append(Vector((0.148 * math.cos(ang), -0.02 + 0.158 * math.sin(ang), 1.68)))
    create_swept_tube("Mitre_Gold_Circlet", brow_ring, [0.014] * 25, num_segments=12, material=gold_mat, subsurf_levels=0, cap_ends=False)

    # THE BISHOP'S MITRE: Tall peaked two-cleft ecclesiastical stone headdress
    # Sweeps upward from Z = 1.68m to a majestic peak at Z = 2.05m
    mitre_rings = [
        # (z, rx, ry, ox, oy, pleats, p_depth)
        (1.68, 0.145, 0.155, 0.0, -0.02),
        (1.78, 0.140, 0.145, 0.0, -0.02, 2, 0.08), # two clefts forming
        (1.88, 0.125, 0.130, 0.0, -0.02, 2, 0.12), # prominent front and rear lobes
        (1.98, 0.085, 0.090, 0.0, -0.02, 2, 0.16), # tapering peak
        (2.05, 0.020, 0.025, 0.0, -0.02),          # crowned sharp summit
    ]
    create_organic_lofted_mesh("Bishop_Mitre_Peak", mitre_rings, num_segments=20, material=stone_mat, subsurf_levels=1, cap_top=True)

    # Frontal Mitre Infulae Cross / Sacred Trishula Relief on Mitre
    mitre_cross_v = [Vector((0.0, -0.165, 1.74)), Vector((0.0, -0.115, 1.98))]
    mitre_cross_h = [Vector((-0.06, -0.15, 1.86)), Vector((0.06, -0.15, 1.86))]
    create_swept_tube("Mitre_Gold_Cross_V", mitre_cross_v, [0.010, 0.008], num_segments=8, material=gold_mat, subsurf_levels=0)
    create_swept_tube("Mitre_Gold_Cross_H", mitre_cross_h, [0.008, 0.008], num_segments=8, material=gold_mat, subsurf_levels=0)

    # --------------------------------------------------------------------------
    # Export Models: both assets/ratha.glb (for direct drop-in) and assets/bishop.glb
    # --------------------------------------------------------------------------
    export_glb("assets/ratha.glb")
    export_glb("assets/bishop.glb")
    print("Harry Potter Puranic Bishop Model successfully sculpted & exported to both assets/ratha.glb and assets/bishop.glb!")

if __name__ == '__main__':
    build_harry_potter_puranic_bishop()
