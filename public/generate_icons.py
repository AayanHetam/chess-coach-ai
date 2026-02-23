#!/usr/bin/env python3
"""
Generate all favicon/icon sizes from logo.svg
Requires: pip install Pillow cairosvg
"""
import subprocess, sys, os

# Install cairosvg if needed
try:
    import cairosvg
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "cairosvg", "--break-system-packages", "-q"])
    import cairosvg

from PIL import Image
import io

SVG_PATH = os.path.join(os.path.dirname(__file__), "logo.svg")
OUT_DIR  = os.path.dirname(__file__)

def svg_to_png(size):
    png_bytes = cairosvg.svg2png(url=SVG_PATH, output_width=size, output_height=size)
    return Image.open(io.BytesIO(png_bytes)).convert("RGBA")

sizes = {
    "favicon-16x16.png":        16,
    "favicon-32x32.png":        32,
    "apple-touch-icon.png":     180,
    "android-chrome-192x192.png": 192,
    "android-chrome-512x512.png": 512,
}

for filename, size in sizes.items():
    img = svg_to_png(size)
    out = os.path.join(OUT_DIR, filename)
    img.save(out, "PNG")
    print(f"  ✓ {filename} ({size}x{size})")

# Generate favicon.ico (multi-size: 16, 32, 48)
ico_images = [svg_to_png(s) for s in [16, 32, 48]]
ico_path = os.path.join(OUT_DIR, "favicon.ico")
ico_images[0].save(ico_path, format="ICO", sizes=[(16,16),(32,32),(48,48)],
                   append_images=ico_images[1:])
print(f"  ✓ favicon.ico (16/32/48)")

# Social image: 1200x630 with logo centered on white/gradient bg
social = Image.new("RGBA", (1200, 630), (255, 248, 245, 255))
logo_big = svg_to_png(380)
x = (1200 - 380) // 2
y = (630 - 380) // 2
social.paste(logo_big, (x, y), logo_big)
social.save(os.path.join(OUT_DIR, "social-networks-1200x630.png"), "PNG")
print(f"  ✓ social-networks-1200x630.png")

print("\nAll icons generated successfully!")
