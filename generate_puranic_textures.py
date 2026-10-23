import os
import math
from PIL import Image, ImageDraw, ImageFilter

os.makedirs('assets/textures', exist_ok=True)

def create_gold_kavacha_texture():
    size = (1024, 1024)
    img = Image.new('RGB', size, (212, 175, 55)) # Gold base
    draw = ImageDraw.Draw(img)

    # Subtle radial gradient for metallic curvature
    cx, cy = 512, 512
    for r in range(500, 0, -4):
        val = int(180 + (1.0 - r / 500) * 75)
        gold = (min(255, val + 25), min(255, val), max(0, val - 90))
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=gold, width=4)

    # Concentric Vedic Surya Mandala & Sunburst rays
    num_rays = 32
    for i in range(num_rays):
        angle = (i * 2 * math.pi) / num_rays
        x2 = cx + int(math.cos(angle) * 440)
        y2 = cy + int(math.sin(angle) * 440)
        draw.line([cx, cy, x2, y2], fill=(255, 235, 120), width=3)

    # Ornate geometric borders (triangular saw-tooth Vedic pattern)
    for i in range(48):
        a1 = (i * 2 * math.pi) / 48
        a2 = ((i + 0.5) * 2 * math.pi) / 48
        a3 = ((i + 1) * 2 * math.pi) / 48
        r_inner = 360
        r_outer = 410
        p1 = (cx + math.cos(a1) * r_inner, cy + math.sin(a1) * r_inner)
        p2 = (cx + math.cos(a2) * r_outer, cy + math.sin(a2) * r_outer)
        p3 = (cx + math.cos(a3) * r_inner, cy + math.sin(a3) * r_inner)
        draw.polygon([p1, p2, p3], fill=(255, 215, 0), outline=(180, 130, 20))

    # Center Surya Lotus
    for petal in range(16):
        pa = (petal * 2 * math.pi) / 16
        px = cx + math.cos(pa) * 120
        py = cy + math.sin(pa) * 120
        draw.ellipse([px - 45, py - 45, px + 45, py + 45], fill=(255, 225, 90), outline=(200, 150, 30))

    draw.ellipse([cx - 70, cy - 70, cx + 70, cy + 70], fill=(255, 245, 140), outline=(220, 160, 40), width=4)

    img = img.filter(ImageFilter.SMOOTH_MORE)
    img.save('assets/textures/kavacha_gold.png')
    print('Saved assets/textures/kavacha_gold.png')

def create_elephant_jhul_texture():
    size = (1024, 1024)
    # Royal Crimson silk background
    img = Image.new('RGB', size, (168, 24, 48))
    draw = ImageDraw.Draw(img)

    # Gold zari embroidery grid
    for x in range(0, 1024, 64):
        draw.line([x, 0, x, 1024], fill=(218, 165, 32), width=2)
    for y in range(0, 1024, 64):
        draw.line([0, y, 1024, y], fill=(218, 165, 32), width=2)

    # Floral gold rosettes in each diamond
    for x in range(32, 1024, 64):
        for y in range(32, 1024, 64):
            draw.ellipse([x - 14, y - 14, x + 14, y + 14], fill=(255, 215, 0), outline=(240, 230, 140))
            draw.ellipse([x - 5, y - 5, x + 5, y + 5], fill=(200, 20, 40))

    # Heavy gold brocade border
    border_thick = 70
    draw.rectangle([0, 0, 1024, border_thick], fill=(230, 180, 34))
    draw.rectangle([0, 1024 - border_thick, 1024, 1024], fill=(230, 180, 34))
    draw.rectangle([0, 0, border_thick, 1024], fill=(230, 180, 34))
    draw.rectangle([1024 - border_thick, 0, 1024, 1024], fill=(230, 180, 34))

    # Paisley / teardrop motifs on border
    for bx in range(40, 1024, 60):
        draw.ellipse([bx - 18, 15, bx + 18, 55], fill=(180, 20, 40), outline=(255, 220, 80))
        draw.ellipse([bx - 18, 1024 - 55, bx + 18, 1024 - 15], fill=(180, 20, 40), outline=(255, 220, 80))

    img = img.filter(ImageFilter.SMOOTH)
    img.save('assets/textures/elephant_jhul.png')
    print('Saved assets/textures/elephant_jhul.png')

def create_elephant_skin_texture():
    size = (1024, 1024)
    # Wrinkled pachyderm gray
    img = Image.new('RGB', size, (75, 72, 70))
    draw = ImageDraw.Draw(img)

    # Organic wrinkle creases
    import random
    random.seed(42)
    for _ in range(600):
        x1 = random.randint(0, 1024)
        y1 = random.randint(0, 1024)
        x2 = x1 + random.randint(-40, 40)
        y2 = y1 + random.randint(10, 60)
        c = random.randint(50, 68)
        draw.line([x1, y1, x2, y2], fill=(c, c, c), width=random.randint(1, 3))

    # Ceremonial Vermilion Shringar face painting patterns (Red & Saffron paste)
    cx, cy = 512, 450
    # Center forehead tilak & lotus
    draw.polygon([(cx, cy - 140), (cx - 35, cy + 40), (cx + 35, cy + 40)], fill=(225, 45, 30), outline=(255, 200, 40))
    draw.ellipse([cx - 25, cy + 50, cx + 25, cy + 100], fill=(255, 180, 20), outline=(255, 255, 255), width=2)
    # Curved temple swirls
    for sx in [-1, 1]:
        draw.arc([cx + sx * 160 - 70, cy - 40, cx + sx * 160 + 70, cy + 100], start=0, end=180, fill=(240, 50, 40), width=10)
        draw.arc([cx + sx * 220 - 50, cy + 20, cx + sx * 220 + 50, cy + 120], start=180, end=360, fill=(255, 190, 30), width=8)

    img = img.filter(ImageFilter.SMOOTH)
    img.save('assets/textures/elephant_skin.png')
    print('Saved assets/textures/elephant_skin.png')

def create_dhoti_silk_texture():
    size = (1024, 1024)
    # Warm saffron / golden ivory silk
    img = Image.new('RGB', size, (245, 140, 30))
    draw = ImageDraw.Draw(img)

    # Pleated vertical fabric ridges
    for x in range(0, 1024, 16):
        shade = int(220 + math.sin(x * 0.4) * 35)
        color = (min(255, shade + 20), max(0, shade - 90), max(0, shade - 180))
        draw.line([x, 0, x, 1024], fill=color, width=8)

    # Ornate gold Zari border at the bottom
    for y in range(860, 1024):
        draw.line([0, y, 1024, y], fill=(218, 165, 32), width=1)
    for x in range(0, 1024, 32):
        draw.polygon([(x, 940), (x + 16, 880), (x + 32, 940)], fill=(255, 225, 80), outline=(180, 130, 20))

    img = img.filter(ImageFilter.SMOOTH)
    img.save('assets/textures/dhoti_silk.png')
    print('Saved assets/textures/dhoti_silk.png')

def create_damascus_steel_texture():
    size = (1024, 1024)
    img = Image.new('RGB', size, (35, 38, 48))
    draw = ImageDraw.Draw(img)

    # Wootz Damascus flowing wavy patterns
    for y in range(0, 1024, 4):
        points = []
        for x in range(0, 1024, 20):
            wave = math.sin(x * 0.05 + y * 0.02) * 12 + math.cos(x * 0.02 - y * 0.05) * 8
            points.append((x, y + wave))
        c = int(55 + math.sin(y * 0.1) * 35)
        draw.line(points, fill=(c, c + 5, c + 15), width=2)

    img = img.filter(ImageFilter.SMOOTH)
    img.save('assets/textures/damascus_steel.png')
    print('Saved assets/textures/damascus_steel.png')

def create_sandalwood_chariot_texture():
    size = (1024, 1024)
    img = Image.new('RGB', size, (139, 87, 42)) # Sandalwood brown
    draw = ImageDraw.Draw(img)

    # Wood grain lines
    import random
    random.seed(108)
    for _ in range(500):
        x = random.randint(0, 1024)
        y1 = 0
        y2 = 1024
        draw.line([x, y1, x + random.randint(-8, 8), y2], fill=(110, 65, 30), width=random.randint(1, 4))

    # Carved brass inlays & relief bands
    for y in [120, 512, 900]:
        draw.rectangle([0, y - 25, 1024, y + 25], fill=(212, 175, 55), outline=(160, 120, 30))
        for x in range(20, 1024, 50):
            draw.ellipse([x - 15, y - 15, x + 15, y + 15], fill=(255, 220, 80), outline=(130, 90, 20))

    img = img.filter(ImageFilter.SMOOTH)
    img.save('assets/textures/sandalwood_chariot.png')
    print('Saved assets/textures/sandalwood_chariot.png')

if __name__ == '__main__':
    create_gold_kavacha_texture()
    create_elephant_jhul_texture()
    create_elephant_skin_texture()
    create_dhoti_silk_texture()
    create_damascus_steel_texture()
    create_sandalwood_chariot_texture()
    print('All 6 authentic Puranic texture maps generated successfully!')
