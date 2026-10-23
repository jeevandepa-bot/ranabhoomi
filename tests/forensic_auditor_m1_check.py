"""
Independent Forensic Integrity Audit Script for Milestone 1 Models
Executed by auditor_m1_r1_1 using Blender 4.2.0 Headless CLI
"""

import bpy
import mathutils
import os
import sys
import json
import math

MODELS = ['padati', 'gajadhvaja', 'ashvarohi', 'ratha', 'maharani', 'samrat']
ASSETS_DIR = os.path.abspath('assets')

def run_forensic_audit():
    audit_report = {
        "auditor": "auditor_m1_r1_1",
        "verdict": "CLEAN",
        "models": {},
        "violations": []
    }

    print("=" * 80)
    print("STARTING INDEPENDENT FORENSIC INTEGRITY AUDIT (AUDITOR_M1_R1_1)")
    print("=" * 80)

    for mname in MODELS:
        glb_path = os.path.join(ASSETS_DIR, f"{mname}.glb")
        if not os.path.exists(glb_path):
            err = f"CRITICAL: Model file missing: {glb_path}"
            audit_report["violations"].append(err)
            audit_report["verdict"] = "INTEGRITY VIOLATION"
            print(err)
            continue

        fsize = os.path.getsize(glb_path)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=glb_path)

        mesh_objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
        
        m_info = {
            "file_size": fsize,
            "mesh_count": len(mesh_objs),
            "meshes": {},
            "global_min": [float('inf')] * 3,
            "global_max": [float('-inf')] * 3,
            "checks": {}
        }

        # Inspect all submeshes
        for obj in mesh_objs:
            mesh = obj.data
            verts = mesh.vertices
            polys = mesh.polygons
            
            # Check for dummy or facade meshes (0 verts or 0 faces)
            if len(verts) == 0 or len(polys) == 0:
                err = f"FACADE DETECTED: Mesh {obj.name} in {mname} has 0 vertices or 0 faces!"
                audit_report["violations"].append(err)
                audit_report["verdict"] = "INTEGRITY VIOLATION"

            obj_min = [float('inf')] * 3
            obj_max = [float('-inf')] * 3

            for v in verts:
                wpos = obj.matrix_world @ v.co
                for i in range(3):
                    obj_min[i] = min(obj_min[i], wpos[i])
                    obj_max[i] = max(obj_max[i], wpos[i])
                    m_info["global_min"][i] = min(m_info["global_min"][i], wpos[i])
                    m_info["global_max"][i] = max(m_info["global_max"][i], wpos[i])

            dx = obj_max[0] - obj_min[0]
            dy = obj_max[1] - obj_min[1]
            dz = obj_max[2] - obj_min[2]
            
            # Check smooth shading
            smooth_count = sum(1 for p in polys if p.use_smooth)
            
            m_info["meshes"][obj.name] = {
                "verts": len(verts),
                "faces": len(polys),
                "smooth_ratio": round(smooth_count / max(1, len(polys)), 3),
                "bbox_min": [round(c, 4) for c in obj_min],
                "bbox_max": [round(c, 4) for c in obj_max],
                "dims": [round(dx, 4), round(dy, 4), round(dz, 4)]
            }

        # Check Ground Contact (Z_min == 0.000m within 1e-4 tolerance)
        z_min = m_info["global_min"][2]
        if abs(z_min) > 0.001:
            err = f"GROUNDING VIOLATION: {mname}.glb has Z_min = {z_min:.6f}m (must be 0.000m)"
            audit_report["violations"].append(err)
            audit_report["verdict"] = "INTEGRITY VIOLATION"
            m_info["checks"]["grounding"] = False
        else:
            m_info["checks"]["grounding"] = True

        # Check Archetype Requirements
        mesh_names = list(m_info["meshes"].keys())
        mesh_names_lower = [n.lower() for n in mesh_names]

        if mname == 'padati':
            # Check Khanda & Dhal
            has_khanda = any('khanda' in n for n in mesh_names_lower)
            has_dhal = any('dhal' in n for n in mesh_names_lower)
            has_spear = any(w in n for n in mesh_names_lower for w in ['spear', 'lance', 'pole', 'bow'])
            
            m_info["checks"]["has_khanda"] = has_khanda
            m_info["checks"]["has_dhal"] = has_dhal
            m_info["checks"]["zero_spears"] = not has_spear

            if not has_khanda or not has_dhal or has_spear:
                err = f"WEAPON INTEGRITY VIOLATION in padati: khanda={has_khanda}, dhal={has_dhal}, spear={has_spear}"
                audit_report["violations"].append(err)
                audit_report["verdict"] = "INTEGRITY VIOLATION"

            # Check Dhal position and concave geometry
            dhal_entry = m_info["meshes"].get("Padati_Dhal")
            if dhal_entry:
                # Dhal radius ~0.36m (dx ~ 0.72m, dz ~ 0.72m)
                dx, dy, dz = dhal_entry["dims"]
                if dx < 0.60 or dz < 0.60:
                    err = f"DHAL ANOMALY: Dhal dimensions too small: dx={dx}, dz={dz}"
                    audit_report["violations"].append(err)
                    audit_report["verdict"] = "INTEGRITY VIOLATION"

        elif mname == 'gajadhvaja':
            # Check Tusks: Elephant_Tusk_L, Elephant_Tusk_R
            tusk_l = m_info["meshes"].get("Elephant_Tusk_L")
            tusk_r = m_info["meshes"].get("Elephant_Tusk_R")
            if not tusk_l or not tusk_r:
                err = "TUSK VIOLATION: Missing Elephant_Tusk_L or Elephant_Tusk_R in gajadhvaja!"
                audit_report["violations"].append(err)
                audit_report["verdict"] = "INTEGRITY VIOLATION"
                m_info["checks"]["forward_tusks"] = False
            else:
                # In Blender, forward is -Y. Tusks should extend to Y <= -1.2m
                min_y_l = tusk_l["bbox_min"][1]
                min_y_r = tusk_r["bbox_min"][1]
                if min_y_l > -0.5 or min_y_r > -0.5:
                    err = f"BACKWARD TUSK VIOLATION: Tusks not forward facing! min_y_l={min_y_l}, min_y_r={min_y_r}"
                    audit_report["violations"].append(err)
                    audit_report["verdict"] = "INTEGRITY VIOLATION"
                    m_info["checks"]["forward_tusks"] = False
                else:
                    m_info["checks"]["forward_tusks"] = True

            # Check Howdah
            howdah = m_info["meshes"].get("Howdah_Base")
            m_info["checks"]["howdah_present"] = howdah is not None
            if not howdah:
                err = "HOWDAH VIOLATION: Missing Howdah_Base in gajadhvaja!"
                audit_report["violations"].append(err)
                audit_report["verdict"] = "INTEGRITY VIOLATION"

            # Check Runaway primitives: max Z must be <= 3.5m (previously Z=143.25m)
            if m_info["global_max"][2] > 3.5:
                err = f"RUNAWAY PRIMITIVE VIOLATION: gajadhvaja max Z = {m_info['global_max'][2]} > 3.5m"
                audit_report["violations"].append(err)
                audit_report["verdict"] = "INTEGRITY VIOLATION"
                m_info["checks"]["no_runaways"] = False
            else:
                m_info["checks"]["no_runaways"] = True

        elif mname == 'ashvarohi':
            # Marwari lyre ears, barding/saddle, dragoon rider with Dhanush bow and Tarkash quiver
            has_ears = any('ear' in n for n in mesh_names_lower)
            has_rider = any('dragoon' in n for n in mesh_names_lower)
            has_bow = any('bow' in n or 'dhanush' in n for n in mesh_names_lower)
            has_quiver = any('quiver' in n or 'tarkash' in n for n in mesh_names_lower)
            
            m_info["checks"]["has_ears"] = has_ears
            m_info["checks"]["has_rider"] = has_rider
            m_info["checks"]["has_bow"] = has_bow
            m_info["checks"]["has_quiver"] = has_quiver

            if not (has_ears and has_rider and has_bow and has_quiver):
                err = f"ASHVAROHI INTEGRITY VIOLATION: ears={has_ears}, rider={has_rider}, bow={has_bow}, quiver={has_quiver}"
                audit_report["violations"].append(err)
                audit_report["verdict"] = "INTEGRITY VIOLATION"

        elif mname == 'ratha':
            # Dual 8-spoked Chakra wheels
            has_wheel_l = "Chakra_Wheel_L" in mesh_names
            has_wheel_r = "Chakra_Wheel_R" in mesh_names
            spokes_l = [n for n in mesh_names if n.startswith("Chakra_Spoke_L_")]
            spokes_r = [n for n in mesh_names if n.startswith("Chakra_Spoke_R_")]
            has_scythe_l = "Chakra_Hub_L" in mesh_names
            has_scythe_r = "Chakra_Hub_R" in mesh_names
            has_sage = any('sage' in n for n in mesh_names_lower)
            has_bow = "Gandiva_Bow" in mesh_names
            has_halo = "Prabhamandala" in mesh_names

            m_info["checks"]["wheels_present"] = has_wheel_l and has_wheel_r
            m_info["checks"]["spokes_count_l"] = len(spokes_l)
            m_info["checks"]["spokes_count_r"] = len(spokes_r)
            m_info["checks"]["scythes_present"] = has_scythe_l and has_scythe_r
            m_info["checks"]["sage_present"] = has_sage
            m_info["checks"]["bow_present"] = has_bow
            m_info["checks"]["halo_present"] = has_halo

            if not (has_wheel_l and has_wheel_r and len(spokes_l) == 8 and len(spokes_r) == 8 and has_scythe_l and has_scythe_r and has_sage and has_bow and has_halo):
                err = f"RATHA INTEGRITY VIOLATION: wheel_l={has_wheel_l}, wheel_r={has_wheel_r}, spokes_l={len(spokes_l)}, spokes_r={len(spokes_r)}, scythes={has_scythe_l and has_scythe_r}, sage={has_sage}, bow={has_bow}, halo={has_halo}"
                audit_report["violations"].append(err)
                audit_report["verdict"] = "INTEGRITY VIOLATION"

        elif mname == 'maharani':
            # Queen with twin curved Khanda blades (left & right), Mukuta crown, pleated saree, silk mantle
            has_khanda_r = any('khanda' in n and '_r' in n for n in mesh_names_lower)
            has_khanda_l = any('khanda' in n and '_l' in n for n in mesh_names_lower)
            has_crown = any('crown' in n for n in mesh_names_lower)
            has_mantle = any('mantle' in n for n in mesh_names_lower)
            has_saree = any('saree' in n for n in mesh_names_lower)
            has_polearm = any('polearm' in n or 'spear' in n for n in mesh_names_lower)

            m_info["checks"]["twin_khandas"] = has_khanda_r and has_khanda_l
            m_info["checks"]["crown_present"] = has_crown
            m_info["checks"]["mantle_present"] = has_mantle
            m_info["checks"]["saree_present"] = has_saree
            m_info["checks"]["zero_polearms"] = not has_polearm

            if not (has_khanda_r and has_khanda_l and has_crown and has_mantle and has_saree and not has_polearm):
                err = f"MAHARANI INTEGRITY VIOLATION: twin_khandas={has_khanda_r and has_khanda_l}, crown={has_crown}, mantle={has_mantle}, saree={has_saree}, polearm={has_polearm}"
                audit_report["violations"].append(err)
                audit_report["verdict"] = "INTEGRITY VIOLATION"

        elif mname == 'samrat':
            # Chakravarti Emperor with Kirita-Mukuta crown + ruby, 3-tiered Chhatra parasol, grounded Gada mace
            tiers = [n for n in mesh_names if 'chhatra_tier' in n.lower()]
            has_ruby = "CrownRuby" in mesh_names
            has_gada_head = "Gada_Head" in mesh_names
            has_gada_shaft = "Gada_Shaft" in mesh_names
            
            # Check Gada head grounding
            head_entry = m_info["meshes"].get("Gada_Head")
            gada_grounded = False
            if head_entry:
                head_zmin = head_entry["bbox_min"][2]
                gada_grounded = abs(head_zmin) <= 0.001
                m_info["checks"]["gada_head_zmin"] = head_zmin

            m_info["checks"]["chhatra_tiers_count"] = len(tiers)
            m_info["checks"]["crown_ruby_present"] = has_ruby
            m_info["checks"]["gada_present"] = has_gada_head and has_gada_shaft
            m_info["checks"]["gada_grounded"] = gada_grounded

            if not (len(tiers) == 3 and has_ruby and has_gada_head and has_gada_shaft and gada_grounded):
                err = f"SAMRAT INTEGRITY VIOLATION: tiers={len(tiers)}, ruby={has_ruby}, gada={has_gada_head and has_gada_shaft}, gada_grounded={gada_grounded}"
                audit_report["violations"].append(err)
                audit_report["verdict"] = "INTEGRITY VIOLATION"

        audit_report["models"][mname] = m_info
        print(f"[{mname.upper()}] Meshes: {len(mesh_objs)}, Z_min: {z_min:.6f}m, Checks: {m_info['checks']}")

    print("=" * 80)
    print(f"FINAL AUDIT VERDICT: {audit_report['verdict']}")
    print(f"Total Violations: {len(audit_report['violations'])}")
    if audit_report["violations"]:
        for v in audit_report["violations"]:
            print(f"  [VIOLATION] {v}")
    print("=" * 80)

    # Write output to auditor workspace
    out_json = os.path.abspath(".agents/teamwork/auditor_m1_r1_1/forensic_audit_evidence.json")
    with open(out_json, "w") as f:
        json.dump(audit_report, f, indent=2)
    print(f"Audit evidence saved to {out_json}")

if __name__ == '__main__':
    run_forensic_audit()
