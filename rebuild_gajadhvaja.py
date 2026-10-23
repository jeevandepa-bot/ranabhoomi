import bpy
import mathutils
import math
import os

TEXTURE_DIR = os.path.abspath("textures")

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def create_pbr_material(name, base_color, metallic, roughness, texture_path=None):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = base_color
        bsdf.inputs['Metallic'].default_value = metallic
        bsdf.inputs['Roughness'].default_value = roughness
        if texture_path and os.path.exists(texture_path):
            tex_image = nodes.new('ShaderNodeTexImage')
            tex_image.image = bpy.data.images.load(texture_path)
            mat.node_tree.links.new(bsdf.inputs['Base Color'], tex_image.outputs['Color'])
    return mat

def create_organic_lofted_mesh(name, ring_specs, num_segments=16, material=None, subsurf_levels=1):
    verts = []
    faces = []
    num_rings = len(ring_specs)
    for z, rx, ry, ox, oy in ring_specs:
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

def build_gajadhvaja():
    clear_scene()
    skin_mat = create_pbr_material("ElephantSkin", (0.35, 0.34, 0.33, 1), 0.05, 0.85, os.path.join(TEXTURE_DIR, 'elephant_skin.png'))
    jhul_mat = create_pbr_material("ElephantJhul", (0.7, 0.12, 0.2, 1), 0.2, 0.45, os.path.join(TEXTURE_DIR, 'elephant_jhul.png'))
    gold_mat = create_pbr_material("RoyalGold", (0.95, 0.78, 0.22, 1), 0.88, 0.2, os.path.join(TEXTURE_DIR, 'kavacha_gold.png'))
    ivory_mat = create_pbr_material("IvoryTusks", (0.96, 0.94, 0.88, 1), 0.1, 0.25)
    stone_mat = create_pbr_material("HowdahStone", (0.65, 0.48, 0.32, 1), 0.15, 0.75, os.path.join(TEXTURE_DIR, 'sandalwood_chariot.png'))

    elephant_path = os.path.abspath("assets/elephant.glb")
    if os.path.exists(elephant_path):
        bpy.ops.import_scene.gltf(filepath=elephant_path)
        for obj in bpy.context.scene.objects:
            if obj.type == 'MESH':
                obj.name = "Elephant_Body"
                obj.matrix_world = mathutils.Matrix.Identity(4)
                obj.scale = (0.18, 0.18, 0.18)
                bpy.context.view_layer.objects.active = obj
                bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
                obj.data.materials.clear()
                obj.data.materials.append(skin_mat)
                for poly in obj.data.polygons:
                    poly.use_smooth = True

    # Jhul blanket across back
    jhul_rings = [
        (1.22, 0.65, 0.58, 0.0, 0.0),
        (1.45, 0.68, 0.62, 0.0, 0.0),
        (1.50, 0.64, 0.56, 0.0, 0.0)
    ]
    create_organic_lofted_mesh("Elephant_Jhul", jhul_rings, num_segments=20, material=jhul_mat, subsurf_levels=1)

    # Shringar medallion on forehead
    bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=0.03, location=(0, 0.85, 1.38))
    shringar = bpy.context.active_object
    shringar.rotation_euler = (math.pi / 4, 0, 0)
    shringar.data.materials.append(gold_mat)

    # Gold ankle kadas on all 4 feet
    for lx, ly in [(-0.45, 0.55), (0.45, 0.55), (-0.45, -0.55), (0.45, -0.55)]:
        bpy.ops.mesh.primitive_torus_add(major_radius=0.18, minor_radius=0.032, location=(lx, ly, 0.14))
        kada = bpy.context.active_object
        kada.data.materials.append(gold_mat)

    # Upward Curved Ivory Tusks
    for tx in [-0.22, 0.22]:
        tusk_rings = [
            (0.78, 0.055, 0.055, tx, 0.95),
            (0.72, 0.048, 0.048, tx, 1.15),
            (0.85, 0.035, 0.035, tx, 1.35),
            (1.05, 0.012, 0.012, tx * 0.9, 1.50)
        ]
        create_organic_lofted_mesh(f"Elephant_Tusk_{tx}", tusk_rings, num_segments=12, material=ivory_mat, subsurf_levels=1)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.065, depth=0.10, location=(tx, 1.00, 0.75))
        tcuff = bpy.context.active_object
        tcuff.rotation_euler = (-math.pi / 4, 0, 0)
        tcuff.data.materials.append(gold_mat)

    # Rajput Royal Howdah (Pavilion)
    howdah_base_rings = [
        (1.50, 0.46, 0.55, 0.0, 0.0),
        (1.75, 0.48, 0.58, 0.0, 0.0),
        (1.88, 0.50, 0.60, 0.0, 0.0)
    ]
    create_organic_lofted_mesh("Howdah_Base", howdah_base_rings, num_segments=8, material=stone_mat, subsurf_levels=0)

    # 4 Carved Gold Pillars
    for px, py in [(-0.35, -0.42), (0.35, -0.42), (-0.35, 0.42), (0.35, 0.42)]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.035, depth=0.55, location=(px, py, 2.15))
        pillar = bpy.context.active_object
        pillar.data.materials.append(gold_mat)

    # Domed Rajput Chhatri Canopy
    chhatri_rings = [
        (2.42, 0.52, 0.62, 0.0, 0.0),
        (2.62, 0.46, 0.52, 0.0, 0.0),
        (2.78, 0.28, 0.32, 0.0, 0.0),
        (2.90, 0.06, 0.06, 0.0, 0.0)
    ]
    create_organic_lofted_mesh("Howdah_Dome", chhatri_rings, num_segments=16, material=gold_mat, subsurf_levels=1)

    # Golden Finial Spire
    bpy.ops.mesh.primitive_cone_add(radius1=0.08, depth=0.32, location=(0, 0, 3.06))
    finial = bpy.context.active_object
    finial.name = "Howdah_Finial"
    finial.data.materials.append(gold_mat)

    ground_all_objects_to_zero()

    out_path = os.path.abspath("assets/gajadhvaja.glb")
    bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', use_selection=False, export_apply=True)
    print(f"Successfully rebuilt and exported: {out_path}")

build_gajadhvaja()
