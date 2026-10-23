import cv2
import os

video_path = r"C:\Users\Jeevan\Downloads\Warrior_chess_pawn_attacking_enemy_20261023175127.mp4"
if not os.path.exists(video_path):
    print("Video file not found at:", video_path)
    exit(1)

cap = cv2.VideoCapture(video_path)
fps = cap.get(cv2.CAP_PROP_FPS)
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
duration = total_frames / fps if fps > 0 else 0
print(f"Video opened: FPS={fps}, Frames={total_frames}, Duration={duration:.2f}s")

output_dir = r"c:\Users\Jeevan\Downloads\ranabhoomi\pawn_video_frames"
os.makedirs(output_dir, exist_ok=True)

# Sample 10 frames across the video
step = max(1, total_frames // 10)
for idx in range(0, total_frames, step):
    cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
    ret, frame = cap.read()
    if ret:
        out_name = os.path.join(output_dir, f"frame_{idx:04d}_{idx/fps:.2f}s.png")
        cv2.imwrite(out_name, frame)
        print(f"Saved {out_name}")

cap.release()
