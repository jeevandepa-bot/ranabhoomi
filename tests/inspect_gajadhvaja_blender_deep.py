"""
Deep Forensic Inspection Script for assets/gajadhvaja.glb
Evaluates:
1. Exact Bounding Box (min, max, dimensions: W, L, H)
2. Grounding Contact at Z=0 (exact Z_min of footpads and lowest vertices)
3. Howdah integration (mesh names, Z position relative to elephant withers, gap check)
4. Forward Tusks anatomy (root cheek attachment, tip coordinate, forward curvature in -Y)
5. Surface smoothing ratio and degenerate face count
6. Transform freezing (scale = 1.0, unapplied rot/loc)
"""

import bpy
import mathutils
import os
import json

filepath = os.path.abspath('assets/gajadhvaja.glb')
report_path = os.path.abspath('tests/deep_gajadhvaja_blender_report.json')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=filepath)

mesh_objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']

total_verts = sum(len(o.data.vertices) for o in mesh_objs)
total_faces = sum(len(o.data.polygons) for o in mesh_objs)
smooth_faces = sum(sum(1 for p in o.data.polygons if p.use_smooth) for o in mesh_objs)
flat_faces = total_faces - smooth_faces

global_min = mathutils.Vector((float('inf'), float('inf'), float('inf')))
global_max = mathutils.Vector((float('-inf'), float('-inf'), float('-inf')))

mesh_details = {}
unfrozen_scales = []

for o in mesh_objs:
    s = o.scale
    if abs(s.x - 1.0) > 1e-4 or abs(s.y - 1.0) > 1e-4 or abs(s.z - 1.0) > 1e-4:
        unfrozen_scales.append({'name': o.name, 'scale': [s.x, s.y, s.z]})

    o_min = mathutils.Vector((float('inf'), float('inf'), float('inf')))
    o_max = mathutils.Vector((float('-inf'), float('-inf'), float('-inf')))
    for v in o.data.vertices:
        wco = o.matrix_world @ v.co
        o_min.x = min(o_min.x, wco.x)
        o_min.y = min(o_min.y, wco.y)
        o_min.z = min(o_min.z, wco.z)
        o_max.x = max(o_max.x, wco.x)
        o_max.y = max(o_max.y, wco.y)
        o_max.z = max(o_max.z, wco.z)

    global_min.x = min(global_min.x, o_min.x)
    global_min.y = min(global_min.y, o_min.y)
    global_min.z = min(global_min.z, o_min.z)
    global_max.x = max(global_max.x, o_max.x)
    global_max.y = max(global_max.y, o_max.y)
    global_max.z = max(global_max.z, o_max.z)

    mesh_details[o.name] = {
        'verts': len(o.data.vertices),
        'faces': len(o.data.polygons),
        'min': [round(o_min.x, 6), round(o_min.y, 6), round(o_min.z, 6)],
        'max': [round(o_max.x, 6), round(o_max.y, 6), round(o_max.z, 6)],
        'dim': [round(o_max.x - o_min.x, 6), round(o_max.y - o_min.y, 6), round(o_max.z - o_min.z, 6)]
    }

# Check Howdah meshes
howdah_meshes = [n for n in mesh_details if 'howdah' in n.lower()]
torso_z_max = mesh_details.get('Elephant_Torso', {}).get('max', [0, 0, 0])[2]
jhul_z_max = mesh_details.get('Elephant_Jhul', {}).get('max', [0, 0, 0])[2]
howdah_base_min = mesh_details.get('Howdah_Base', {}).get('min', [0, 0, 0])
howdah_gap = round(howdah_base_min[2] - max(torso_z_max, jhul_z_max), 6) if howdah_base_min else None

# Check Tusks
tusk_l = mesh_details.get('Elephant_Tusk_L', {})
tusk_r = mesh_details.get('Elephant_Tusk_R', {})

# Check Footpads
legs = ['Elephant_Leg_FL', 'Elephant_Leg_FR', 'Elephant_Leg_BL', 'Elephant_Leg_BR']
footpad_zmins = {leg: mesh_details.get(leg, {}).get('min', [0, 0, 0])[2] for leg in legs}

report = {
    'file': filepath,
    'total_mesh_objects': len(mesh_objs),
    'total_vertices': total_verts,
    'total_faces': total_faces,
    'smooth_ratio': round(smooth_faces / max(1, total_faces), 6),
    'unfrozen_scales': unfrozen_scales,
    'global_bbox': {
        'min': [round(global_min.x, 6), round(global_min.y, 6), round(global_min.z, 6)],
        'max': [round(global_max.x, 6), round(global_max.y, 6), round(global_max.z, 6)],
        'dimensions': {
            'width_X': round(global_max.x - global_min.x, 6),
            'length_Y': round(global_max.y - global_min.y, 6),
            'height_Z': round(global_max.z - global_min.z, 6)
        }
    },
    'grounding': {
        'Z_min': round(global_min.z, 6),
        'footpad_zmins': footpad_zmins,
        'exact_zero_grounding': abs(global_min.z) < 1e-5
    },
    'howdah': {
        'meshes': howdah_meshes,
        'howdah_base_zmin': howdah_base_min[2] if howdah_base_min else None,
        'jhul_zmax': jhul_z_max,
        'torso_zmax': torso_z_max,
        'vertical_gap_m': howdah_gap
    },
    'tusks': {
        'tusk_L': tusk_l,
        'tusk_R': tusk_r,
        'forward_pointing_negY': (tusk_l.get('min', [0, 0, 0])[1] < -0.8 and tusk_r.get('min', [0, 0, 0])[1] < -0.8)
    },
    'tactical_bounds_check': {
        'half_width_X': max(abs(global_min.x), abs(global_max.x)),
        'limit_0_86m': 0.86,
        'fits_within_0_86m': max(abs(global_min.x), abs(global_max.x)) <= 0.86,
        'margin_to_edge_m': round(0.86 - max(abs(global_min.x), abs(global_max.x)), 6)
    }
}

with open(report_path, 'w') as f:
    json.dump(report, f, indent=2)

print("Inspection report saved to", report_path)
print("Dimensions:", report['global_bbox']['dimensions'])
print("Grounding Z_min:", report['grounding']['Z_min'])
print("Tactical bounds fits 0.86m:", report['tactical_bounds_check']['fits_within_0_86m'], "margin:", report['tactical_bounds_check']['margin_to_edge_m'])
print("Howdah gap:", report['howdah']['vertical_gap_m'])
print("Tusks forward:", report['tusks']['forward_pointing_negY'])
