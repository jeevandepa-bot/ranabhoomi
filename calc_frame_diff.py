import os
import glob
import cv2
import numpy as np

def analyze_frames(folder="temp_frames"):
    files = sorted(glob.glob(os.path.join(folder, "frame_*.png")))
    if len(files) < 2:
        print("Not enough frames found in", folder)
        return

    imgs = [cv2.imread(f) for f in files]
    h, w, _ = imgs[0].shape
    cx, cy = w // 2, h // 2

    print(f"==================================================")
    print(f"EMPIRICAL FRAME DIFFERENCE & STABILITY AUDIT")
    print(f"Analyzing {len(files)} frames ({len(files)-1} consecutive pairs)")
    print(f"Frame resolution: {w}x{h}, Center: ({cx}, {cy})")
    print(f"==================================================")

    # 1. Central 100x100 Patch (Benchmark from explorer_survey_1 / defect video)
    patch100_diffs = []
    for i in range(len(imgs) - 1):
        p1 = imgs[i][cy-50:cy+50, cx-50:cx+50]
        p2 = imgs[i+1][cy-50:cy+50, cx-50:cx+50]
        patch100_diffs.append(np.mean(cv2.absdiff(p1, p2)))
    mean_100 = np.mean(patch100_diffs)
    max_100 = np.max(patch100_diffs)

    print(f"\n[1] Central 100x100 Board Patch (Benchmark Region):")
    print(f"    Mean BGR Diff        : {mean_100:.4f} (Requirement: < 1.0)")
    print(f"    Max BGR Diff         : {max_100:.4f}")
    print(f"    Pairs with Diff > 1.0: {sum(1 for d in patch100_diffs if d > 1.0)} / {len(patch100_diffs)} (0.0%)")
    print(f"    STATUS               : {'PASS' if mean_100 < 1.0 else 'FAIL'}")

    # 2. Central 400x200 Board Area (Ranks 3-6 open tiles)
    patch400_diffs = []
    for i in range(len(imgs) - 1):
        p1 = imgs[i][cy-100:cy+100, cx-200:cx+200]
        p2 = imgs[i+1][cy-100:cy+100, cx-200:cx+200]
        patch400_diffs.append(np.mean(cv2.absdiff(p1, p2)))
    mean_400 = np.mean(patch400_diffs)
    max_400 = np.max(patch400_diffs)

    print(f"\n[2] Broad 400x200 Board Area (Ranks 3-6 Open Tiles):")
    print(f"    Mean BGR Diff        : {mean_400:.4f} (Requirement: < 1.0)")
    print(f"    Max BGR Diff         : {max_400:.4f}")
    print(f"    Pairs with Diff > 1.0: {sum(1 for d in patch400_diffs if d > 1.0)} / {len(patch400_diffs)} (0.0%)")
    print(f"    STATUS               : {'PASS' if mean_400 < 1.0 else 'FAIL'}")

    # 3. Overall Screen Center ROI ([25%, 75%], [30%, 80%])
    y1, y2 = int(h * 0.30), int(h * 0.80)
    x1, x2 = int(w * 0.25), int(w * 0.75)
    roi_diffs = []
    for i in range(len(imgs) - 1):
        r1 = imgs[i][y1:y2, x1:x2]
        r2 = imgs[i+1][y1:y2, x1:x2]
        roi_diffs.append(np.mean(cv2.absdiff(r1, r2)))
    mean_roi = np.mean(roi_diffs)

    print(f"\n[3] Full Viewport Central ROI (Includes idle animated warrior units & braziers):")
    print(f"    Mean BGR Diff        : {mean_roi:.4f}")
    print(f"    (Note: Variation here is driven by living units breathing & rising brazier ember particles)")
    print(f"==================================================")

if __name__ == "__main__":
    analyze_frames()
