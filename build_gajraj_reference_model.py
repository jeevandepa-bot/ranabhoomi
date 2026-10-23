import bpy
import bmesh
import mathutils
import math
import os

TEXTURE_DIR = os.path.abspath("assets/textures")
os.makedirs(TEXTURE_DIR, exist_ok=True)

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def create_pbr_material(name, base_color=(0.8, 0.8, 0.8, 1.0), metallic=0.0, roughness=0.5, emissive_color=None, texture_path=None):
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

    if emissive_color:
        try:
            bsdf.inputs['Emission Color'].default_value = emissive_color
            bsdf.inputs['Emission Strength'].default_value = 2.5
        except Exception:
            pass

    if texture_path and os.path.exists(texture_path):
        tex = nodes.new(type='ShaderNodeTexImage')
        tex.image = bpy.data.images.load(texture_path)
        links.new(bsdf.inputs['Base Color'], tex.outputs['Color'])

    links.new(output.inputs['Surface'], bsdf.outputs['BSDF'])
    return mat

def create_organic_lofted_mesh(name, ring_specs, num_segments=20, material=None, subsurf_levels=1):
    verts = []
    faces = []
    num_rings = len(ring_specs)
    for spec in ring_specs:
        z = spec[0]
        rx = spec[1]
        ry = spec[2]
        ox = spec[3] if len(spec) > 3 else 0.0
        oy = spec[4] if len(spec) > 4 else 0.0
        for i in range(num_segments):
            angle = 2.0 * math.pi * i / num_segments
            vx = ox + rx * math.cos(angle)
            vy = oy + ry * math.sin(angle)
            verts.append((vx, vy, z))
    for r in range(num_rings - 1):
        for s in range(num_segments):
            next_s = (s + 1) % num_segments
            i1 = r * num_segments + s
            i2 = r * num_segments + next_s
            i3 = (r + 1) * num_segments + next_s
            i4 = (r + 1) * num_segments + s
            faces.append((i1, i2, i3, i4))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if material:
        obj.data.materials.append(material)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    if subsurf_levels > 0:
        sub = obj.modifiers.new("Subsurf", type='SUBSURF')
        sub.levels = subsurf_levels
        sub.render_levels = subsurf_levels
    return obj

def ground_all_objects_to_zero():
    min_z = float('inf')
    mesh_objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for obj in mesh_objs:
        for v in obj.data.vertices:
            world_pos = obj.matrix_world @ v.co
            min_z = min(min_z, world_pos.z)
    if min_z != float('inf'):
        offset = -min_z
        for obj in bpy.context.scene.objects:
            if obj.parent is None:
                obj.location.z += offset
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

def build_reference_exact_gajraj():
    clear_scene()

    # Materials for reference fidelity
    marble_mat = create_pbr_material("ElephantMarbleSkin", (0.94, 0.93, 0.90, 1.0), 0.12, 0.22, texture_path=os.path.join(TEXTURE_DIR, "elephant_skin.png"))
    gold_mat = create_pbr_material("RoyalKavachaGold", (0.95, 0.78, 0.22, 1.0), 0.90, 0.18, texture_path=os.path.join(TEXTURE_DIR, "kavacha_gold.png"))
    jhul_mat = create_pbr_material("RoyalJhulSilk", (0.78, 0.65, 0.45, 1.0), 0.25, 0.40, texture_path=os.path.join(TEXTURE_DIR, "elephant_jhul.png"))
    stone_mat = create_pbr_material("CastleSandstone", (0.82, 0.76, 0.68, 1.0), 0.15, 0.65, texture_path=os.path.join(TEXTURE_DIR, "sandalwood_chariot.png"))
    ivory_mat = create_pbr_material("RoyalIvory", (0.96, 0.94, 0.88, 1.0), 0.08, 0.24)
    amber_glow_mat = create_pbr_material("AmberGlow", (1.0, 0.68, 0.12, 1.0), 0.1, 0.1, emissive_color=(1.0, 0.62, 0.08, 1.0))
    rune_mat = create_pbr_material("SanskritRuneGlow", (1.0, 0.82, 0.20, 1.0), 0.2, 0.1, emissive_color=(1.0, 0.75, 0.15, 1.0))

    # STEP 1: IMPORT AND CENTER BASE ELEPHANT FIRST
    elephant_path = os.path.abspath("assets/elephant.glb")
    if os.path.exists(elephant_path):
        bpy.ops.import_scene.gltf(filepath=elephant_path)
        imported_objs = [o for o in bpy.context.selected_objects if o.type == 'MESH']
        for obj in imported_objs:
            obj.name = "Elephant_Body"
            obj.location = (0, 0, 0.18)
            obj.rotation_mode = 'XYZ'
            obj.rotation_euler = (0, 0, 0)
            obj.scale = (0.175, 0.175, 0.175)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            obj.data.materials.clear()
            obj.data.materials.append(marble_mat)
            for poly in obj.data.polygons:
                poly.use_smooth = True

    # STEP 2: ORNATE INSCRIBED STONE PEDESTAL PLINTH
    ped_rings = [
        (0.00, 0.95, 1.15, 0.0, 0.0),
        (0.06, 0.95, 1.15, 0.0, 0.0),
        (0.07, 0.90, 1.10, 0.0, 0.0),
        (0.14, 0.90, 1.10, 0.0, 0.0),
        (0.15, 0.85, 1.05, 0.0, 0.0),
        (0.20, 0.85, 1.05, 0.0, 0.0)
    ]
    create_organic_lofted_mesh("Gajraj_Pedestal_Base", ped_rings, num_segments=24, material=stone_mat, subsurf_levels=0)

    # Gold Beveled Rim on Pedestal
    bpy.ops.mesh.primitive_torus_add(major_radius=0.92, minor_radius=0.022, location=(0, 0, 0.14))
    ped_gold_rim = bpy.context.active_object
    ped_gold_rim.scale = (0.95, 1.12, 1.0)
    ped_gold_rim.data.materials.append(gold_mat)

    # Glowing Circular Sanskrit Rune Disc around base
    bpy.ops.mesh.primitive_cylinder_add(radius=1.12, depth=0.005, location=(0, 0, 0.003))
    rune_disc = bpy.context.active_object
    rune_disc.name = "Gajraj_Sanskrit_Rune_Disc"
    rune_disc.scale = (0.92, 1.12, 1.0)
    rune_disc.data.materials.append(rune_mat)

    # STEP 3: GOLD ANKLE KADAS (ALL 4 LEGS)
    for lx, ly in [(-0.42, 0.52), (0.42, 0.52), (-0.42, -0.52), (0.42, -0.52)]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.17, depth=0.07, location=(lx, ly, 0.28))
        kada = bpy.context.active_object
        kada.data.materials.append(gold_mat)
        bpy.ops.mesh.primitive_torus_add(major_radius=0.175, minor_radius=0.018, location=(lx, ly, 0.315))
        kada_trim = bpy.context.active_object
        kada_trim.data.materials.append(gold_mat)

    # STEP 4: LONG CURVED IVORY TUSKS WITH TRIPLE GOLD BANDS
    for tx in [-0.22, 0.22]:
        tusk_rings = [
            (0.92, 0.056, 0.056, tx, 0.92),
            (0.84, 0.048, 0.048, tx, 1.15),
            (0.94, 0.036, 0.036, tx, 1.38),
            (1.14, 0.012, 0.012, tx * 0.9, 1.56)
        ]
        create_organic_lofted_mesh(f"Gajraj_Tusk_{tx}", tusk_rings, num_segments=14, material=ivory_mat, subsurf_levels=1)

        # 3 Gold Bands along each tusk
        for bz, by, brad in [(0.94, 0.94, 0.062), (0.86, 1.16, 0.052), (0.98, 1.36, 0.040)]:
            bpy.ops.mesh.primitive_torus_add(major_radius=brad, minor_radius=0.012, location=(tx, by, bz))
            cuff = bpy.context.active_object
            cuff.rotation_euler = (-math.pi / 4, 0, 0)
            cuff.data.materials.append(gold_mat)

    # STEP 5: GLOWING FIERY AMBER EYES
    for ex in [-0.28, 0.28]:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.038, location=(ex, 0.72, 1.34))
        eye = bpy.context.active_object
        eye.name = f"Gajraj_Eye_{ex}"
        eye.data.materials.append(amber_glow_mat)

    # STEP 6: ORNATE GOLD CHAMFRON (HEAD ARMOR) & FOREHEAD AMBER GEM
    chamfron_rings = [
        (1.18, 0.24, 0.12, 0.0, 0.82),
        (1.32, 0.28, 0.18, 0.0, 0.80),
        (1.44, 0.32, 0.22, 0.0, 0.72),
        (1.54, 0.26, 0.18, 0.0, 0.58)
    ]
    create_organic_lofted_mesh("Gajraj_Chamfron_Plate", chamfron_rings, num_segments=16, material=gold_mat, subsurf_levels=1)

    # Forehead Amber Cabochon Gem
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.055, location=(0, 0.78, 1.40))
    forehead_gem = bpy.context.active_object
    forehead_gem.name = "Gajraj_Forehead_Gem"
    forehead_gem.data.materials.append(amber_glow_mat)

    # Gold Temple Bells
    for bx in [-0.48, 0.48]:
        bpy.ops.mesh.primitive_cone_add(radius1=0.032, radius2=0.012, depth=0.065, location=(bx, 0.55, 1.22))
        bell = bpy.context.active_object
        bell.data.materials.append(gold_mat)

    # STEP 7: SCALLOPED EMBROIDERED JHUL CAPARISON WITH GOLDEN TASSELS
    jhul_rings = [
        (1.32, 0.65, 0.58, 0.0, 0.0),
        (1.51, 0.68, 0.62, 0.0, 0.0),
        (1.60, 0.64, 0.56, 0.0, 0.0)
    ]
    create_organic_lofted_mesh("Gajraj_Jhul_Blanket", jhul_rings, num_segments=24, material=jhul_mat, subsurf_levels=1)

    for z_rim in [1.32, 1.60]:
        bpy.ops.mesh.primitive_torus_add(major_radius=0.62, minor_radius=0.022, location=(0, 0, z_rim))
        j_rim = bpy.context.active_object
        j_rim.scale = (1.05, 0.95, 1.0)
        j_rim.data.materials.append(gold_mat)

    # Hanging Golden Tassels
    tassel_count = 14
    for i in range(tassel_count):
        t_angle = math.pi * 0.18 + (i / (tassel_count - 1)) * math.pi * 0.64
        for side in [-1, 1]:
            tx = side * (0.64 + math.sin(t_angle * 2) * 0.03)
            ty = math.cos(t_angle) * 0.54
            tz = 1.30

            bpy.ops.mesh.primitive_cylinder_add(radius=0.008, depth=0.08, location=(tx, ty, tz - 0.04))
            cord = bpy.context.active_object
            cord.data.materials.append(gold_mat)

            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.024, location=(tx, ty, tz - 0.085))
            bob = bpy.context.active_object
            bob.scale = (0.8, 0.8, 1.3)
            bob.data.materials.append(gold_mat)

    # Harness Straps
    bpy.ops.mesh.primitive_cylinder_add(radius=0.62, depth=0.045, location=(0, 0.52, 1.12))
    harness_front = bpy.context.active_object
    harness_front.rotation_euler = (math.pi / 3, 0, 0)
    harness_front.scale = (1.0, 0.1, 0.8)
    harness_front.data.materials.append(gold_mat)

    # STEP 8: THE CASTLE FORTRESS TOWER (ROOK BASTION)
    # A: Carved Padded Saddle Mount
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1.64))
    saddle_mount = bpy.context.active_object
    saddle_mount.name = "Castle_Saddle_Mount"
    saddle_mount.scale = (0.76, 0.88, 0.14)
    saddle_mount.data.materials.append(gold_mat)

    # B: Stepped Stone Base with Molded Cornice
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1.78))
    stone_base = bpy.context.active_object
    stone_base.name = "Castle_Stone_Base"
    stone_base.scale = (0.82, 0.94, 0.16)
    stone_base.data.materials.append(stone_mat)

    # Molded Gold Cornice Trim
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1.87))
    cornice = bpy.context.active_object
    cornice.scale = (0.86, 0.98, 0.035)
    cornice.data.materials.append(gold_mat)

    # C: Main Rectangular Stone Bastion Tower
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 2.26))
    bastion_tower = bpy.context.active_object
    bastion_tower.name = "Castle_Bastion_Tower"
    bastion_tower.scale = (0.74, 0.84, 0.76)
    bastion_tower.data.materials.append(stone_mat)

    # 4 Corner Bartizan Turrets
    for bx, by in [(-0.37, -0.42), (0.37, -0.42), (-0.37, 0.42), (0.37, 0.42)]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.11, depth=0.86, location=(bx, by, 2.28))
        bartizan = bpy.context.active_object
        bartizan.data.materials.append(stone_mat)

        bpy.ops.mesh.primitive_torus_add(major_radius=0.115, minor_radius=0.015, location=(bx, by, 2.68))
        bart_ring = bpy.context.active_object
        bart_ring.data.materials.append(gold_mat)

    # Recessed Arched Windows with Golden Inner Glow
    for wy in [-0.425, 0.425]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.075, depth=0.04, location=(0, wy, 2.26))
        win = bpy.context.active_object
        win.rotation_euler = (math.pi / 2, 0, 0)
        win.data.materials.append(amber_glow_mat)

    for wx in [-0.375, 0.375]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.065, depth=0.04, location=(wx, 0, 2.26))
        win_side = bpy.context.active_object
        win_side.rotation_euler = (0, math.pi / 2, 0)
        win_side.data.materials.append(amber_glow_mat)

    # D: Upper Crenellated Battlements
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 2.66))
    upper_deck = bpy.context.active_object
    upper_deck.name = "Castle_Upper_Deck"
    upper_deck.scale = (0.84, 0.94, 0.08)
    upper_deck.data.materials.append(stone_mat)

    # Corner Merlons (Taller)
    for mx, my in [(-0.38, -0.43), (0.38, -0.43), (-0.38, 0.43), (0.38, 0.43)]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(mx, my, 2.78))
        c_merlon = bpy.context.active_object
        c_merlon.scale = (0.16, 0.16, 0.18)
        c_merlon.data.materials.append(stone_mat)

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(mx, my, 2.875))
        m_cap = bpy.context.active_object
        m_cap.scale = (0.17, 0.17, 0.02)
        m_cap.data.materials.append(gold_mat)

    # Intermediate Wall Merlons (North / South)
    for my in [-0.43, 0.43]:
        for mx in [-0.14, 0.14]:
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(mx, my, 2.76))
            w_merlon = bpy.context.active_object
            w_merlon.scale = (0.13, 0.12, 0.15)
            w_merlon.data.materials.append(stone_mat)

    # Intermediate Wall Merlons (East / West)
    for mx in [-0.38, 0.38]:
        for my in [-0.16, 0.16]:
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(mx, my, 2.76))
            w_merlon = bpy.context.active_object
            w_merlon.scale = (0.12, 0.14, 0.15)
            w_merlon.data.materials.append(stone_mat)

    # Center Radiant Golden Kalasha Spire
    bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=0.22, location=(0, 0, 2.80))
    altar = bpy.context.active_object
    altar.data.materials.append(stone_mat)

    bpy.ops.mesh.primitive_cone_add(radius1=0.065, depth=0.18, location=(0, 0, 2.98))
    kalasha = bpy.context.active_object
    kalasha.data.materials.append(gold_mat)

    # Mathematical Grounding: ensure the bottom-most vertex of the pedestal sits at exactly Z = 0.000
    ground_all_objects_to_zero()

    out_path = os.path.abspath("assets/gajadhvaja.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        use_selection=False,
        export_apply=True
    )
    print(f"Successfully generated reference-exact Gajraj: {out_path}")

if __name__ == "__main__":
    build_reference_exact_gajraj()
