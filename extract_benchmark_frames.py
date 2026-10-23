import cv2
import os

video_path = r"C:\Users\Jeevan\Downloads\Chess_pieces_fighting_battlefield_20261021222458.mp4"
if not os.path.exists(video_path):
    print("Video file not found at:", video_path)
    exit(1)

cap = cv2.VideoCapture(video_path)
fps = cap.get(cv2.CAP_PROP_FPS)
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
print(f"Video opened: FPS={fps}, Frames={total_frames}")

for target_frame, name in [(10, "benchmark_frame_1.png"), (total_frames // 2, "benchmark_frame_mid.png"), (total_frames - 20, "benchmark_frame_end.png")]:
    cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
    ret, frame = cap.read()
    if ret:
        cv2.imwrite(name, frame)
        print(f"Saved {name}")
    else:
        print(f"Failed to read frame {target_frame}")

cap.release()
