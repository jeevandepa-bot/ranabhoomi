import os
import glob
import cv2
import numpy as np

BASE_DIR = os.path.join(os.path.dirname(__file__), "pure_board_frames")

def main():
    if not os.path.exists(BASE_DIR):
        print("Directory not found:", BASE_DIR)
        return

    subdirs = sorted([d for d in os.listdir(BASE_DIR) if os.path.isdir(os.path.join(BASE_DIR, d))])
    print("================================================================================")
    print("PURE BOARD SURFACE RENDERING STABILITY AUDIT")
    print("Testing board tiles, dais plinth, dais rim with ember particles isolated")
    print("================================================================================")

    for sub in subdirs:
        files = sorted(glob.glob(os.path.join(BASE_DIR, sub, "frame_*.png")))
        if len(files) < 2:
            continue

        imgs = [cv2.imread(f) for f in files]
        h, w, _ = imgs[0].shape
        cx, cy = w // 2, h // 2

        # Define ROIs based on camera angle
        if "5deg" in sub or "10deg" in sub:
            # At 5-10 deg grazing angle, the board and dais plinth are in the lower field [550:650, 400:1520]
            roi_y1, roi_y2 = int(h * 0.52), int(h * 0.62)
            roi_x1, roi_x2 = int(w * 0.22), int(w * 0.78)
            roi_desc = "Foreground Dais Plinth & Front Tile Rims"
        elif "15deg" in sub:
            roi_y1, roi_y2 = int(h * 0.50), int(h * 0.64)
            roi_x1, roi_x2 = int(w * 0.22), int(w * 0.78)
            roi_desc = "Front & Mid Dais Plinth / Open Board Rim"
        elif "85deg" in sub:
            roi_y1, roi_y2 = int(h * 0.35), int(h * 0.65)
            roi_x1, roi_x2 = int(w * 0.35), int(w * 0.65)
            roi_desc = "Central Top-Down Board Tiles (Ranks 3-6)"
        elif "zoom_close" in sub:
            roi_y1, roi_y2 = int(h * 0.40), int(h * 0.60)
            roi_x1, roi_x2 = int(w * 0.40), int(w * 0.60)
            roi_desc = "Close-up Open Tiles"
        elif "zoom_far" in sub:
            roi_y1, roi_y2 = int(h * 0.42), int(h * 0.58)
            roi_x1, roi_x2 = int(w * 0.40), int(w * 0.60)
            roi_desc = "Distant Board Surface"
        else: # default 33deg
            roi_y1, roi_y2 = int(h * 0.40), int(h * 0.60)
            roi_x1, roi_x2 = int(w * 0.35), int(w * 0.65)
            roi_desc = "Standard Benchmark Open Tiles (Ranks 3-6)"

        roi_diffs = []
        max_pixel_diff = 0
        flipping_pixel_count = 0

        # Central 100x100 benchmark
        c100_diffs = []

        for i in range(len(imgs) - 1):
            r1 = imgs[i][roi_y1:roi_y2, roi_x1:roi_x2]
            r2 = imgs[i+1][roi_y1:roi_y2, roi_x1:roi_x2]
            d = cv2.absdiff(r1, r2)
            roi_diffs.append(float(np.mean(d)))
            max_pixel_diff = max(max_pixel_diff, int(np.max(d)))
            flipping_pixel_count += int(np.sum(d > 20))

            p1 = imgs[i][cy-50:cy+50, cx-50:cx+50]
            p2 = imgs[i+1][cy-50:cy+50, cx-50:cx+50]
            c100_diffs.append(float(np.mean(cv2.absdiff(p1, p2))))

        mean_roi = float(np.mean(roi_diffs))
        max_roi = float(np.max(roi_diffs))
        mean_c100 = float(np.mean(c100_diffs))

        pass_status = (mean_roi < 1.0) and (flipping_pixel_count == 0)

        print(f"\n[ANGLE] {sub} ({len(imgs)} frames)")
        print(f"  Target Board ROI              : [{roi_y1}:{roi_y2}, {roi_x1}:{roi_x2}] — {roi_desc}")
        print(f"  Board ROI Mean BGR Diff       : {mean_roi:.4f} (Requirement: < 1.0)")
        print(f"  Board ROI Max BGR Diff        : {max_roi:.4f}")
        print(f"  Max Individual Pixel Delta    : {max_pixel_diff} (Z-fighting flip > 20: {flipping_pixel_count})")
        if "default" in sub or "85deg" in sub or "close" in sub or "far" in sub:
            print(f"  Center 100x100 Patch Mean Diff: {mean_c100:.4f}")
        print(f"  STATUS                        : {'PASS (SOLID & STABLE)' if pass_status else 'FAIL'}")

    print("\n================================================================================")

if __name__ == "__main__":
    main()
