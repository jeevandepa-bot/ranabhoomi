import bpy
import bmesh
import math

bpy.ops.wm.read_factory_settings(use_empty=True)

# Test creating an organic lofted leg with bmesh
bm = bmesh.new()
# Rings: (z, radius, x_offset, y_offset)
rings = [
    (0.00, 0.09, 0.0, 0.04),  # Foot base
    (0.08, 0.065, 0.0, 0.0),   # Ankle
    (0.25, 0.095, 0.0, -0.02), # Calf
    (0.45, 0.08, 0.0, 0.01),  # Knee
    (0.68, 0.12, 0.0, 0.0),   # Mid thigh
    (0.85, 0.14, 0.0, 0.0),   # Hip
]

prev_verts = []
for z, r, ox, oy in rings:
    ring_verts = []
    n = 16
    for i in range(n):
        a = (2 * math.pi * i) / n
        vx = ox + r * math.cos(a)
        vy = oy + r * math.sin(a)
        vz = z
        ring_verts.append(bm.verts.new((vx, vy, vz)))
    if prev_verts:
        for i in range(n):
            v1 = prev_verts[i]
            v2 = prev_verts[(i + 1) % n]
            v3 = ring_verts[(i + 1) % n]
            v4 = ring_verts[i]
            bm.faces.new((v1, v2, v3, v4))
    prev_verts = ring_verts

mesh = bpy.data.meshes.new("TestLeg")
bm.to_mesh(mesh)
bm.free()

obj = bpy.data.objects.new("TestLegObj", mesh)
bpy.context.scene.collection.objects.link(obj)

# Add subdivision surface
subsurf = obj.modifiers.new(name="Subsurf", type='SUBSURF')
subsurf.levels = 2
subsurf.render_levels = 2

# Smooth shade
for f in mesh.polygons:
    f.use_smooth = True

print("Lofted organic leg created successfully with", len(mesh.vertices), "vertices")
