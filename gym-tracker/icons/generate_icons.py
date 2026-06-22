#!/usr/bin/env python3
"""Genereert app-iconen (PNG) zonder externe libs: een dumbbell op indigo achtergrond."""
import struct, zlib, os

def png(width, height, pixels):
    def chunk(typ, data):
        c = typ + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0
        for x in range(width):
            raw += bytes(pixels[y][x])
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(bytes(raw), 9)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")

def make(size, maskable=False):
    bg = (99, 102, 241, 255)     # indigo
    fg = (255, 255, 255, 255)    # wit
    px = [[list(bg) for _ in range(size)] for _ in range(size)]

    def rect(x0, y0, x1, y1, col):
        for y in range(max(0, int(y0)), min(size, int(y1))):
            for x in range(max(0, int(x0)), min(size, int(x1))):
                px[y][x] = list(col)

    s = size
    cy = s * 0.5
    bar_h = s * 0.10
    rect(s*0.34, cy - bar_h/2, s*0.66, cy + bar_h/2, fg)        # bar
    plate_h = s * 0.34
    rect(s*0.22, cy - plate_h/2, s*0.30, cy + plate_h/2, fg)    # linker binnenplaat
    rect(s*0.14, cy - plate_h*0.36, s*0.22, cy + plate_h*0.36, fg)  # linker buitenplaat
    rect(s*0.70, cy - plate_h/2, s*0.78, cy + plate_h/2, fg)    # rechter binnenplaat
    rect(s*0.78, cy - plate_h*0.36, s*0.86, cy + plate_h*0.36, fg)  # rechter buitenplaat
    return png(size, size, px)

here = os.path.dirname(os.path.abspath(__file__))
for size in (192, 512):
    with open(os.path.join(here, f"icon-{size}.png"), "wb") as f:
        f.write(make(size))
    print(f"icon-{size}.png geschreven")
