#!/usr/bin/env python3
"""Genera le icone PNG della PWA (croce medica bianca su sfondo teal).
Pure Python, nessuna dipendenza esterna."""
import struct
import zlib

BG = (13, 148, 136)      # teal-600
FG = (255, 255, 255)     # bianco


def make_png(size, path):
    # Sfondo pieno (adatto alle icone "maskable")
    px = [[BG for _ in range(size)] for _ in range(size)]

    # Croce medica centrata
    arm = size * 22 // 100          # metà spessore del braccio
    length = size * 34 // 100       # metà lunghezza del braccio
    c = size // 2
    for y in range(size):
        for x in range(size):
            dx = abs(x - c)
            dy = abs(y - c)
            horizontal = dx <= length and dy <= arm
            vertical = dy <= length and dx <= arm
            if horizontal or vertical:
                px[y][x] = FG

    # Codifica PNG
    raw = bytearray()
    for row in px:
        raw.append(0)  # filtro "none"
        for (r, g, b) in row:
            raw += bytes((r, g, b))

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", ihdr)
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    print("scritto", path, size, "x", size)


if __name__ == "__main__":
    import os
    here = os.path.join(os.path.dirname(__file__), "icons")
    os.makedirs(here, exist_ok=True)
    make_png(192, os.path.join(here, "icon-192.png"))
    make_png(512, os.path.join(here, "icon-512.png"))
    make_png(180, os.path.join(here, "apple-touch-icon.png"))
