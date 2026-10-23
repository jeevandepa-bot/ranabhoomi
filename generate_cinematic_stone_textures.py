import os
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter, sobel, zoom

np.random.seed(42)

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'textures')
os.makedirs(OUT_DIR, exist_ok=True)

def generate_multiscale_noise(width, height, octaves=[(256, 0.40), (128, 0.28), (64, 0.18), (32, 0.10), (16, 0.04)]):
    heightmap = np.zeros((height, width), dtype=np.float32)
    for scale, weight in octaves:
        sub_h = max(2, height // scale)
        sub_w = max(2, width // scale)
        rand_grid = np.random.randn(sub_h, sub_w).astype(np.float32)
        upscaled = zoom(rand_grid, (height / sub_h, width / sub_w), order=1)[:height, :width]
        upscaled = gaussian_filter(upscaled, sigma=scale * 0.18)
        heightmap += upscaled * weight
    h_min, h_max = heightmap.min(), heightmap.max()
    if h_max > h_min:
        heightmap = (heightmap - h_min) / (h_max - h_min)
    return heightmap

def generate_photorealistic_pbr_stone(name_prefix, base_rgb, is_dark=False):
    width, height = 1024, 1024
    print(f"Generating bold cinematic PBR stone set for {name_prefix}...")

    rock_noise = generate_multiscale_noise(width, height)

    crack_img = Image.new('L', (width, height), 0)
    draw_crack = ImageDraw.Draw(crack_img)
    emissive_img = Image.new('L', (width, height), 0)
    draw_emissive = ImageDraw.Draw(emissive_img)

    # Major deep fault fractures
    num_major_faults = 18
    for _ in range(num_major_faults):
        px = np.random.randint(40, width - 40)
        py = np.random.randint(40, height - 40)
        angle = np.random.uniform(0, math.pi * 2)
        num_segs = np.random.randint(10, 24)
        pts = [(px, py)]
        for _ in range(num_segs):
            angle += np.random.uniform(-0.55, 0.55)
            step = np.random.uniform(30, 65)
            px += math.cos(angle) * step
            py += math.sin(angle) * step
            pts.append((px, py))

        for j in range(len(pts) - 1):
            w_main = np.random.randint(12, 22)
            draw_crack.line([pts[j], pts[j+1]], fill=255, width=w_main)
            w_emis = max(4, w_main - 6)
            draw_emissive.line([pts[j], pts[j+1]], fill=240, width=w_emis)

            if np.random.random() < 0.60:
                b_ang = angle + np.random.choice([-0.80, 0.80])
                bx = pts[j][0] + math.cos(b_ang) * np.random.uniform(25, 60)
                by = pts[j][1] + math.sin(b_ang) * np.random.uniform(25, 60)
                w_sub = max(6, w_main - 8)
                draw_crack.line([pts[j], (bx, by)], fill=210, width=w_sub)
                draw_emissive.line([pts[j], (bx, by)], fill=190, width=max(2, w_sub - 4))

    # Secondary hairline fracture network
    for _ in range(35):
        px = np.random.randint(40, width - 40)
        py = np.random.randint(40, height - 40)
        angle = np.random.uniform(0, math.pi * 2)
        pts = [(px, py)]
        for _ in range(np.random.randint(6, 14)):
            angle += np.random.uniform(-0.6, 0.6)
            px += math.cos(angle) * np.random.uniform(20, 45)
            py += math.sin(angle) * np.random.uniform(20, 45)
            pts.append((px, py))
        for j in range(len(pts) - 1):
            draw_crack.line([pts[j], pts[j+1]], fill=180, width=np.random.randint(4, 8))
            if np.random.random() < 0.35:
                draw_emissive.line([pts[j], pts[j+1]], fill=150, width=2)

    crack_mask = np.array(crack_img, dtype=np.float32) / 255.0
    crack_mask = gaussian_filter(crack_mask, sigma=1.2)

    emissive_mask = np.array(emissive_img, dtype=np.float32) / 255.0
    emissive_mask = gaussian_filter(emissive_mask, sigma=2.2)

    # 3. Ancient chiseled bevel border (48 pixels wide)
    bevel = np.ones((height, width), dtype=np.float32)
    border_px = 48
    for y in range(border_px):
        factor = (y / border_px) ** 0.65
        bevel[y, :] *= factor
        bevel[height - 1 - y, :] *= factor
    for x in range(border_px):
        factor = (x / border_px) ** 0.65
        bevel[:, x] *= factor
        bevel[:, width - 1 - x] *= factor

    composite_height = rock_noise * 0.55 + bevel * 0.45 - crack_mask * 0.60
    composite_height = np.clip(composite_height, 0.0, 1.0)

    # Diffuse Map
    base_r, base_g, base_b = base_rgb
    diffuse = np.zeros((height, width, 3), dtype=np.uint8)
    for c, base_val in enumerate([base_r, base_g, base_b]):
        channel = base_val * (0.65 + composite_height * 0.48)
        crack_shade = base_val * 0.12 if is_dark else 24.0
        channel = channel * (1.0 - crack_mask * 0.92) + crack_shade * (crack_mask * 0.92)
        diffuse[:, :, c] = np.clip(channel, 0, 255).astype(np.uint8)

    # Normal Map via Sobel derivatives
    dx = sobel(composite_height, axis=1) * 5.5
    dy = sobel(composite_height, axis=0) * 5.5
    dz = np.ones_like(dx) * 0.65
    norm = np.sqrt(dx*dx + dy*dy + dz*dz)
    nx = (-dx / norm * 0.5 + 0.5) * 255.0
    ny = (-dy / norm * 0.5 + 0.5) * 255.0
    nz = (dz / norm * 0.5 + 0.5) * 255.0
    normal_map = np.stack([nx, ny, nz], axis=2).astype(np.uint8)

    # Roughness Map
    roughness = (0.82 + (1.0 - composite_height) * 0.14 + crack_mask * 0.04) * 255.0
    roughness_map = np.clip(roughness, 0, 255).astype(np.uint8)

    # Emissive Map
    emissive_rgb = np.zeros((height, width, 3), dtype=np.uint8)
    if is_dark:
        emissive_rgb[:, :, 0] = np.clip(emissive_mask * 255.0, 0, 255).astype(np.uint8)
        emissive_rgb[:, :, 1] = np.clip(emissive_mask * 105.0, 0, 255).astype(np.uint8)
        emissive_rgb[:, :, 2] = np.clip(emissive_mask * 15.0, 0, 255).astype(np.uint8)
    else:
        emissive_rgb[:, :, 0] = np.clip(emissive_mask * 250.0, 0, 255).astype(np.uint8)
        emissive_rgb[:, :, 1] = np.clip(emissive_mask * 195.0, 0, 255).astype(np.uint8)
        emissive_rgb[:, :, 2] = np.clip(emissive_mask * 40.0, 0, 255).astype(np.uint8)

    diff_path = os.path.join(OUT_DIR, f'{name_prefix}_diffuse.png')
    norm_path = os.path.join(OUT_DIR, f'{name_prefix}_normal.png')
    rough_path = os.path.join(OUT_DIR, f'{name_prefix}_roughness.png')
    emis_path = os.path.join(OUT_DIR, f'{name_prefix}_emissive.png')

    Image.fromarray(diffuse).save(diff_path)
    Image.fromarray(normal_map).save(norm_path)
    Image.fromarray(roughness_map).save(rough_path)
    Image.fromarray(emissive_rgb).save(emis_path)
    print(f"Saved {name_prefix} PBR set to assets/textures/")

def generate_battlefield_ground_textures():
    width, height = 1024, 1024
    print("Generating seamless battlefield ground textures...")

    # Multi-scale rock and terrain height
    ground_noise = generate_multiscale_noise(width, height, octaves=[(256, 0.45), (128, 0.25), (64, 0.18), (32, 0.12)])

    # Crack network on battlefield earth
    crack_img = Image.new('L', (width, height), 0)
    draw_crack = ImageDraw.Draw(crack_img)
    for _ in range(40):
        px = np.random.randint(0, width)
        py = np.random.randint(0, height)
        angle = np.random.uniform(0, math.pi * 2)
        pts = [(px, py)]
        for _ in range(np.random.randint(8, 16)):
            angle += np.random.uniform(-0.55, 0.55)
            px += math.cos(angle) * np.random.uniform(25, 55)
            py += math.sin(angle) * np.random.uniform(25, 55)
            pts.append((px, py))
        for j in range(len(pts) - 1):
            draw_crack.line([pts[j], pts[j+1]], fill=255, width=np.random.randint(6, 14))

    crack_mask = np.array(crack_img, dtype=np.float32) / 255.0
    crack_mask = gaussian_filter(crack_mask, sigma=1.5)

    comp_height = ground_noise * 0.70 - crack_mask * 0.40
    comp_height = np.clip(comp_height, 0.0, 1.0)

    # Dark charcoal / slate earth albedo
    base_rgb = (28, 32, 38)
    diffuse = np.zeros((height, width, 3), dtype=np.uint8)
    for c, val in enumerate(base_rgb):
        ch = val * (0.65 + comp_height * 0.50)
        ch = ch * (1.0 - crack_mask * 0.85) + (val * 0.15) * (crack_mask * 0.85)
        diffuse[:, :, c] = np.clip(ch, 0, 255).astype(np.uint8)

    dx = sobel(comp_height, axis=1) * 4.5
    dy = sobel(comp_height, axis=0) * 4.5
    dz = np.ones_like(dx) * 0.7
    norm = np.sqrt(dx*dx + dy*dy + dz*dz)
    nx = (-dx / norm * 0.5 + 0.5) * 255.0
    ny = (-dy / norm * 0.5 + 0.5) * 255.0
    nz = (dz / norm * 0.5 + 0.5) * 255.0
    normal_map = np.stack([nx, ny, nz], axis=2).astype(np.uint8)

    roughness = (0.88 + (1.0 - comp_height) * 0.10) * 255.0
    roughness_map = np.clip(roughness, 0, 255).astype(np.uint8)

    Image.fromarray(diffuse).save(os.path.join(OUT_DIR, 'ground_diffuse.png'))
    Image.fromarray(normal_map).save(os.path.join(OUT_DIR, 'ground_normal.png'))
    Image.fromarray(roughness_map).save(os.path.join(OUT_DIR, 'ground_roughness.png'))
    print("Saved ground PBR set to assets/textures/")

def generate_seamless_engraved_runic_grid():
    size = 2048
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    print("Generating seamless engraved runic grid lines...")

    gold_core = (235, 195, 70, 250)
    amber_sub = (250, 168, 25, 220)

    step = size // 8

    for i in range(9):
        pos = i * step
        if pos >= size: pos = size - 1

        for offset, w, alpha in [(-5, 12, 120), (-2, 6, 190), (2, 6, 190), (5, 12, 120)]:
            draw.line([(pos + offset, 0), (pos + offset, size)], fill=(12, 14, 18, alpha), width=w)
            draw.line([(0, pos + offset), (size, pos + offset)], fill=(12, 14, 18, alpha), width=w)

        draw.line([(pos, 0), (pos, size)], fill=gold_core, width=3)
        draw.line([(0, pos), (size, pos)], fill=gold_core, width=3)

    for i in range(9):
        for j in range(9):
            cx = i * step
            cy = j * step
            if cx >= size: cx = size - 1
            if cy >= size: cy = size - 1

            r_outer = 22
            r_inner = 11
            draw.ellipse([cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer], outline=gold_core, width=3)
            draw.ellipse([cx - r_inner, cy - r_inner, cx + r_inner, cy + r_inner], outline=amber_sub, width=2)

            draw.line([(cx - 32, cy), (cx + 32, cy)], fill=gold_core, width=3)
            draw.line([(cx, cy - 32), (cx, cy + 32)], fill=gold_core, width=3)

    for inset in [14, 28]:
        draw.rectangle([inset, inset, size - inset, size - inset], outline=amber_sub, width=3)

    img = img.filter(ImageFilter.GaussianBlur(radius=0.7))
    grid_path = os.path.join(OUT_DIR, 'runic_grid.png')
    img.save(grid_path)
    print("Saved assets/textures/runic_grid.png")

def generate_stormy_sky_panorama():
    width, height = 2048, 1024
    print("Generating dramatic stormy overcast sky dome panorama...")
    
    base_grad = np.zeros((height, width, 3), dtype=np.float32)
    for y in range(height):
        factor = y / float(height)
        if factor < 0.60:
            t = factor / 0.60
            r = 14 * (1 - t) + 28 * t
            g = 18 * (1 - t) + 36 * t
            b = 24 * (1 - t) + 46 * t
        else:
            t = (factor - 0.60) / 0.40
            r = 28 * (1 - t) + 75 * t
            g = 36 * (1 - t) + 90 * t
            b = 46 * (1 - t) + 108 * t
        base_grad[y, :, 0] = r
        base_grad[y, :, 1] = g
        base_grad[y, :, 2] = b

    cloud_noise = generate_multiscale_noise(width, height, octaves=[(512, 0.48), (256, 0.32), (128, 0.16), (64, 0.08)])
    cloud_factor = (cloud_noise - 0.5) * 65.0
    for c in range(3):
        base_grad[:, :, c] = np.clip(base_grad[:, :, c] + cloud_factor, 8, 230)

    sky_img = Image.fromarray(base_grad.astype(np.uint8))
    sky_img = sky_img.filter(ImageFilter.GaussianBlur(radius=3.0))
    sky_path = os.path.join(OUT_DIR, 'storm_sky.png')
    sky_img.save(sky_path)
    print("Saved assets/textures/storm_sky.png")

def generate_seamless_mist_texture():
    width, height = 1024, 1024
    print("Generating seamless volumetric mist texture (soft smoke wisps)...")
    
    sub_h, sub_w = 64, 64
    rand_grid = np.random.randn(sub_h, sub_w).astype(np.float32)
    rand_grid_tiled = np.tile(rand_grid, (3, 3))
    upscaled = zoom(rand_grid_tiled, (height * 3 / (sub_h * 3), width * 3 / (sub_w * 3)), order=1)
    upscaled = gaussian_filter(upscaled, sigma=45.0)
    middle = upscaled[height:height*2, width:width*2]
    m_min, m_max = middle.min(), middle.max()
    norm_mist = (middle - m_min) / (m_max - m_min)

    # Soft smoke alpha (mean ~70, max ~120)
    alpha = (norm_mist ** 2.2) * 120.0
    alpha = np.clip(alpha, 0, 255).astype(np.uint8)

    mist_rgba = np.zeros((height, width, 4), dtype=np.uint8)
    # Slate charcoal smoke
    mist_rgba[:, :, 0] = 70
    mist_rgba[:, :, 1] = 82
    mist_rgba[:, :, 2] = 98
    mist_rgba[:, :, 3] = alpha

    mist_img = Image.fromarray(mist_rgba, mode='RGBA')
    mist_path = os.path.join(OUT_DIR, 'mist_noise.png')
    mist_img.save(mist_path)
    print("Saved assets/textures/mist_noise.png")

if __name__ == '__main__':
    generate_photorealistic_pbr_stone('stone_light', base_rgb=(175, 168, 154), is_dark=False)
    generate_photorealistic_pbr_stone('stone_dark', base_rgb=(42, 45, 52), is_dark=True)
    generate_battlefield_ground_textures()
    generate_seamless_engraved_runic_grid()
    generate_stormy_sky_panorama()
    generate_seamless_mist_texture()

    print("\nALL MILRESTONE 2 PBR STONE & ATMOSPHERE ASSETS GENERATED SUCCESSFULLY!")
