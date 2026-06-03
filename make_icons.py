#!/usr/bin/env python3
"""
Genera le icone PWA per Visit Tracker.
Design: sfondo gradiente blu (indigo → bright blue), location pin bianco.
"""
from PIL import Image, ImageDraw
import math, os

OUT = '/Users/stefanobozzarelli/Desktop/visit-tracker/frontend/public'

# ─── Palette ────────────────────────────────────────────────────────────────
TOP    = (17,  55, 163)   # #1137A3  deep indigo-blue (top)
BOT    = (37,  99, 235)   # #2563EB  bright blue (bottom)
WHITE  = (255, 255, 255)
ALPHA0 = (0, 0, 0, 0)

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

# ─── Core builder ────────────────────────────────────────────────────────────
def make_icon(size: int) -> Image.Image:
    S = size

    # 1. Gradient background
    bg = Image.new('RGB', (S, S))
    bg_d = ImageDraw.Draw(bg)
    for y in range(S):
        bg_d.line([(0, y), (S - 1, y)], fill=lerp(TOP, BOT, y / max(S - 1, 1)))

    # 2. iOS-style rounded-rect mask (corner radius ≈ 22.5 %)
    r = max(int(S * 0.225), 1)
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=255)

    img = Image.new('RGBA', (S, S), ALPHA0)
    img.paste(bg, mask=mask)
    d = ImageDraw.Draw(img)

    # 3. Location-pin geometry (proportional to S)
    cx      = S / 2
    head_cy = S * 0.395          # circle centre Y
    head_r  = S * 0.225          # circle radius
    tip_y   = S * 0.795          # needle tip

    # Triangle tail (drawn first, circle covers the top edge)
    tw = head_r * 0.60           # half-width at triangle base
    ty0 = head_cy + head_r * 0.28
    d.polygon([(cx - tw, ty0), (cx + tw, ty0), (cx, tip_y)], fill=WHITE)

    # Circle head
    d.ellipse([cx - head_r, head_cy - head_r,
               cx + head_r, head_cy + head_r], fill=WHITE)

    # Inner "hole" — filled with the gradient colour at that y
    ir = head_r * 0.47
    hole_color = lerp(TOP, BOT, head_cy / S)
    d.ellipse([cx - ir, head_cy - ir, cx + ir, head_cy + ir], fill=hole_color)

    # ── Tiny checkmark inside the hole (only for sizes ≥ 64 px) ──────────
    if S >= 64:
        lw = max(int(S * 0.038), 2)
        p1 = (cx - ir * 0.52, head_cy + ir * 0.05)
        p2 = (cx - ir * 0.05, head_cy + ir * 0.52)
        p3 = (cx + ir * 0.58, head_cy - ir * 0.42)
        d.line([p1, p2], fill=WHITE, width=lw)
        d.line([p2, p3], fill=WHITE, width=lw)
        # Round the joints
        hl = lw // 2
        for pt in [p1, p2, p3]:
            d.ellipse([pt[0]-hl, pt[1]-hl, pt[0]+hl, pt[1]+hl], fill=WHITE)

    return img

# ─── Sizes ───────────────────────────────────────────────────────────────────
ICONS = [
    # filename, size, save_format, extra_kwargs
    ('icon-512.png',          512, 'PNG',  {}),
    ('icon-192.png',          192, 'PNG',  {}),
    ('apple-touch-icon.png',  180, 'PNG',  {}),   # iPhone Retina
    ('apple-touch-icon-167.png', 167, 'PNG', {}), # iPad Pro
    ('apple-touch-icon-152.png', 152, 'PNG', {}), # iPad
    ('apple-touch-icon-120.png', 120, 'PNG', {}), # iPhone
    ('favicon-32.png',         32, 'PNG',  {}),
    ('favicon-16.png',         16, 'PNG',  {}),
]

os.makedirs(OUT, exist_ok=True)
for fname, sz, fmt, kw in ICONS:
    img = make_icon(sz)
    path = os.path.join(OUT, fname)
    img.save(path, fmt, **kw)
    print(f'  ✓ {fname:35s} {sz}×{sz}')

# Also save a .ico (multi-resolution favicon)
ico_imgs = [make_icon(sz).convert('RGBA') for sz in [16, 32, 48]]
ico_imgs[0].save(
    os.path.join(OUT, 'favicon.ico'),
    format='ICO',
    sizes=[(16,16),(32,32),(48,48)],
    append_images=ico_imgs[1:]
)
print(f'  ✓ {"favicon.ico":35s} 16/32/48')
print('\nDone!')
