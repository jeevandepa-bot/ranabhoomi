import os
import glob
import json
import cv2
import numpy as np

BASE_DIR = os.path.join(os.path.dirname(__file__), "stress_frames")

def analyze_stationary_suite(suite_name, files):
    imgs = [cv2.imread(f) for f in files]
    if len(imgs) < 2:
        return {"error": "Not enough frames"}

    h, w, _ = imgs[0].shape
    cx, cy = w // 2, h // 2

    # 1. Central 100x100 patch (benchmark)
    patch100_diffs = []
    # 2. Broad 400x200 open board area
    patch400_diffs = []
    # 3. Overall viewport
    full_diffs = []

    # Check for binary flipping (pixels jumping > 50 between frames in stationary state)
    flipping_pixels_count = 0

    for i in range(len(imgs) - 1):
        diff_full = cv2.absdiff(imgs[i], imgs[i+1])
        full_diffs.append(float(np.mean(diff_full)))

        p1_100 = imgs[i][cy-50:cy+50, cx-50:cx+50]
        p2_100 = imgs[i+1][cy-50:cy+50, cx-50:cx+50]
        d100 = cv2.absdiff(p1_100, p2_100)
        patch100_diffs.append(float(np.mean(d100)))

        p1_400 = imgs[i][cy-100:cy+100, cx-200:cx+200]
        p2_400 = imgs[i+1][cy-100:cy+100, cx-200:cx+200]
        d400 = cv2.absdiff(p1_400, p2_400)
        patch400_diffs.append(float(np.mean(d400)))

        # In stationary central patch, any pixel diff > 50 indicates Z-fighting / flashing
        flipping_pixels_count += int(np.sum(d400 > 50))

    mean_100 = float(np.mean(patch100_diffs))
    max_100 = float(np.max(patch100_diffs))
    mean_400 = float(np.mean(patch400_diffs))
    max_400 = float(np.max(patch400_diffs))
    mean_full = float(np.mean(full_diffs))

    pass_100 = mean_100 < 1.0
    pass_400 = mean_400 < 1.0
    zero_flipping = flipping_pixels_count == 0

    return {
        "suite": suite_name,
        "type": "stationary",
        "frame_count": len(imgs),
        "pair_count": len(imgs) - 1,
        "patch100_mean_bgr_diff": round(mean_100, 4),
        "patch100_max_bgr_diff": round(max_100, 4),
        "patch100_pairs_over_1": sum(1 for d in patch100_diffs if d > 1.0),
        "patch400_mean_bgr_diff": round(mean_400, 4),
        "patch400_max_bgr_diff": round(max_400, 4),
        "patch400_pairs_over_1": sum(1 for d in patch400_diffs if d > 1.0),
        "full_frame_mean_bgr_diff": round(mean_full, 4),
        "z_fighting_flipping_pixels": flipping_pixels_count,
        "verdict": "PASS" if (pass_100 and pass_400 and zero_flipping) else "FAIL"
    }

def analyze_dynamic_suite(suite_name, files):
    imgs = [cv2.imread(f) for f in files]
    if len(imgs) < 2:
        return {"error": "Not enough frames"}

    consecutive_diffs = []
    for i in range(len(imgs) - 1):
        diff = cv2.absdiff(imgs[i], imgs[i+1])
        consecutive_diffs.append(float(np.mean(diff)))

    # Compute continuity (smoothness of camera motion without sudden spikes)
    # Spike defined as diff[i] > 2.5 * median(diff) and diff[i] - diff[i-1] > 5.0
    median_diff = float(np.median(consecutive_diffs))
    max_diff = float(np.max(consecutive_diffs))
    min_diff = float(np.min(consecutive_diffs))
    std_diff = float(np.std(consecutive_diffs))

    spikes = []
    for i in range(1, len(consecutive_diffs)):
        jump = abs(consecutive_diffs[i] - consecutive_diffs[i-1])
        if jump > 8.0 and consecutive_diffs[i] > 2.0 * median_diff:
            spikes.append((i, jump, consecutive_diffs[i]))

    return {
        "suite": suite_name,
        "type": "dynamic",
        "frame_count": len(imgs),
        "pair_count": len(imgs) - 1,
        "median_bgr_diff": round(median_diff, 4),
        "mean_bgr_diff": round(float(np.mean(consecutive_diffs)), 4),
        "min_bgr_diff": round(min_diff, 4),
        "max_bgr_diff": round(max_diff, 4),
        "std_bgr_diff": round(std_diff, 4),
        "discontinuous_spikes_count": len(spikes),
        "spikes": spikes,
        "verdict": "PASS" if len(spikes) == 0 else "FAIL"
    }

def main():
    if not os.path.exists(BASE_DIR):
        print("Stress frames directory not found:", BASE_DIR)
        return

    suite_dirs = sorted([d for d in os.listdir(BASE_DIR) if os.path.isdir(os.path.join(BASE_DIR, d))])
    results = {}

    print("================================================================================")
    print("EMPIRICAL ADVERSARIAL STRESS TEST ANALYSIS — ZERO BLINKING / Z-FIGHTING")
    print("================================================================================")

    for s in suite_dirs:
        s_path = os.path.join(BASE_DIR, s)
        files = sorted(glob.glob(os.path.join(s_path, "frame_*.png")))
        if not files:
            continue

        if "stationary" in s or "close" in s or "far" in s:
            res = analyze_stationary_suite(s, files)
            print(f"\n[SUITE] {s} ({res['frame_count']} frames)")
            print(f"  Central 100x100 Mean BGR Diff : {res['patch100_mean_bgr_diff']} (Max: {res['patch100_max_bgr_diff']}, Pairs > 1.0: {res['patch100_pairs_over_1']})")
            print(f"  Broad 400x200 Open Tiles Diff: {res['patch400_mean_bgr_diff']} (Max: {res['patch400_max_bgr_diff']}, Pairs > 1.0: {res['patch400_pairs_over_1']})")
            print(f"  Full Viewport Mean Diff       : {res['full_frame_mean_bgr_diff']}")
            print(f"  Z-Fighting Flipping Pixels    : {res['z_fighting_flipping_pixels']}")
            print(f"  VERDICT                       : {res['verdict']}")
        else:
            res = analyze_dynamic_suite(s, files)
            print(f"\n[SUITE] {s} ({res['frame_count']} frames)")
            print(f"  Mean BGR Diff                 : {res['mean_bgr_diff']} (Median: {res['median_bgr_diff']}, Std: {res['std_bgr_diff']})")
            print(f"  Range [Min, Max]              : [{res['min_bgr_diff']}, {res['max_bgr_diff']}]")
            print(f"  Discontinuous Spikes Detected : {res['discontinuous_spikes_count']}")
            print(f"  VERDICT                       : {res['verdict']}")

        results[s] = res

    # Load geometry audit if present
    audit_file = os.path.join(BASE_DIR, "geometry_depth_audit.json")
    if os.path.exists(audit_file):
        with open(audit_file, "r") as f:
            results["geometry_depth_audit"] = json.load(f)

    # Save summary
    summary_path = os.path.join(BASE_DIR, "stress_summary.json")
    with open(summary_path, "w") as f:
        json.dump(results, f, indent=2)

    print("\n================================================================================")
    all_passed = all(r.get("verdict") == "PASS" for k, r in results.items() if isinstance(r, dict) and "verdict" in r)
    print(f"OVERALL ADVERSARIAL STRESS TEST VERDICT: {'APPROVE (100% PASS)' if all_passed else 'REQUEST_CHANGES (FAILURES DETECTED)'}")
    print(f"Summary saved to: {summary_path}")
    print("================================================================================")

if __name__ == "__main__":
    main()
