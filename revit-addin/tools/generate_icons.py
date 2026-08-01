#!/usr/bin/env python3
"""Render the ribbon button icons.

Revit wants a 16x16 (Image) and a 32x32 (LargeImage) bitmap per button. Rather
than commit opaque binaries, the icons are described here as vector shapes and
rasterised with 4x supersampling. Re-run after editing:

    python3 revit-addin/tools/generate_icons.py

Colours are mid-tones on purpose: Revit 2025 ships a light and a dark theme, and
near-black or near-white artwork disappears in one of them.
"""

from __future__ import annotations

import math
import pathlib
import struct
import zlib

SLATE = (100, 116, 139)
AMBER = (245, 158, 11)
SKY = (14, 165, 233)

SUPERSAMPLE = 4

OUT_DIR = pathlib.Path(__file__).resolve().parent.parent / "src" / "CableTrayHanger.Addin" / "Resources" / "Icons"


# --- geometry helpers -------------------------------------------------------
# Every predicate takes a point in the unit square (y grows downwards) and
# reports whether the point is inside the shape.


def rect(x0, y0, x1, y1, radius=0.0):
    def inside(x, y):
        if radius <= 0:
            return x0 <= x <= x1 and y0 <= y <= y1
        cx = min(max(x, x0 + radius), x1 - radius)
        cy = min(max(y, y0 + radius), y1 - radius)
        if x0 <= x <= x1 and cy - radius <= y <= cy + radius:
            return True
        if y0 <= y <= y1 and cx - radius <= x <= cx + radius:
            return True
        return math.hypot(x - cx, y - cy) <= radius

    return inside


def disc(cx, cy, r):
    return lambda x, y: math.hypot(x - cx, y - cy) <= r


def ring(cx, cy, r_inner, r_outer):
    def inside(x, y):
        d = math.hypot(x - cx, y - cy)
        return r_inner <= d <= r_outer

    return inside


def capsule(x0, y0, x1, y1, half_width):
    dx, dy = x1 - x0, y1 - y0
    length_sq = dx * dx + dy * dy

    def inside(x, y):
        if length_sq == 0:
            return math.hypot(x - x0, y - y0) <= half_width
        t = max(0.0, min(1.0, ((x - x0) * dx + (y - y0) * dy) / length_sq))
        return math.hypot(x - (x0 + t * dx), y - (y0 + t * dy)) <= half_width

    return inside


def triangle(p0, p1, p2):
    def sign(a, b, c):
        return (a[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (a[1] - c[1])

    def inside(x, y):
        p = (x, y)
        d0, d1, d2 = sign(p, p0, p1), sign(p, p1, p2), sign(p, p2, p0)
        return not ((d0 < 0 or d1 < 0 or d2 < 0) and (d0 > 0 or d1 > 0 or d2 > 0))

    return inside


def ring_sector(cx, cy, r_inner, r_outer, start_deg, sweep_deg):
    """Arc measured clockwise from 12 o'clock, matching how the arrows read."""

    def inside(x, y):
        d = math.hypot(x - cx, y - cy)
        if not r_inner <= d <= r_outer:
            return False
        angle = math.degrees(math.atan2(x - cx, cy - y)) % 360
        return (angle - start_deg) % 360 <= sweep_deg

    return inside


def union(*shapes):
    return lambda x, y: any(s(x, y) for s in shapes)


# --- rasteriser -------------------------------------------------------------


def render(shapes, size):
    """shapes: list of (predicate, colour or None). None punches a hole."""
    pixels = bytearray()
    step = 1.0 / (size * SUPERSAMPLE)
    samples = SUPERSAMPLE * SUPERSAMPLE

    for py in range(size):
        pixels.append(0)  # PNG per-scanline filter byte: none
        for px in range(size):
            r = g = b = a = 0
            for sy in range(SUPERSAMPLE):
                y = (py * SUPERSAMPLE + sy + 0.5) * step
                for sx in range(SUPERSAMPLE):
                    x = (px * SUPERSAMPLE + sx + 0.5) * step
                    for predicate, colour in reversed(shapes):
                        if predicate(x, y):
                            if colour is not None:
                                r += colour[0]
                                g += colour[1]
                                b += colour[2]
                                a += 255
                            break
            if a == 0:
                pixels.extend((0, 0, 0, 0))
            else:
                covered = a // 255
                # Un-premultiply so partially covered edges keep full colour.
                pixels.extend((r // covered, g // covered, b // covered, a // samples))
    return bytes(pixels)


def write_png(path, raw, size):
    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def read_png_pixels(path):
    """Decode back to the same scanline bytes render() produces.

    The check below compares pixels rather than file bytes: zlib and zlib-ng
    compress identical input differently, so a byte comparison would fail
    across platforms even when the artwork is identical.
    """
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path} is not a PNG")

    offset, idat = 8, b""
    while offset < len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        tag = data[offset + 4 : offset + 8]
        if tag == b"IDAT":
            idat += data[offset + 8 : offset + 8 + length]
        offset += 12 + length

    return zlib.decompress(idat)


# --- icons ------------------------------------------------------------------
# Each builder returns shapes back-to-front. The 16px variants drop detail and
# thicken strokes; at that size thin geometry turns to mush.


def scan_icon(small):
    """Cable tray under a magnifier."""
    rail = 0.075 if small else 0.055
    shapes = [
        # Ladder tray seen from above: two rails plus rungs.
        (rect(0.04, 0.60, 0.96, 0.60 + rail, radius=rail / 2), SLATE),
        (rect(0.04, 0.86 - rail, 0.96, 0.86, radius=rail / 2), SLATE),
    ]
    rungs = (0.22, 0.5, 0.78) if small else (0.16, 0.32, 0.48, 0.64, 0.80)
    for x in rungs:
        shapes.append((rect(x - rail / 2, 0.60, x + rail / 2, 0.86), SLATE))

    # Magnifier. Drawn last so it sits over the tray, with a hole punched
    # around the glass to keep the lens readable.
    cx, cy, r = (0.42, 0.30, 0.30) if small else (0.46, 0.32, 0.25)
    stroke = 0.10 if small else 0.07
    shapes.extend(
        [
            (disc(cx, cy, r + stroke * 0.9), None),
            (ring(cx, cy, r - stroke, r), SKY),
            (
                capsule(
                    cx + r * 0.72,
                    cy + r * 0.72,
                    cx + r * 1.55,
                    cy + r * 1.55,
                    stroke * 0.75,
                ),
                SKY,
            ),
        ]
    )
    return shapes


def sync_icon(small):
    """Hangers dropping from a slab onto a tray."""
    slab = 0.14 if small else 0.11
    rod = 0.045 if small else 0.032
    # Two rods only: a third in the middle would collide with the arrow below.
    rods = (0.22, 0.78) if small else (0.18, 0.82)

    shapes = [(rect(0.04, 0.02, 0.96, 0.02 + slab, radius=0.02), SLATE)]
    for x in rods:
        shapes.append((capsule(x, 0.02 + slab, x, 0.68, rod), AMBER))
        # Clamp where the rod meets the tray.
        shapes.append((rect(x - rod * 2.4, 0.60, x + rod * 2.4, 0.70, radius=0.015), AMBER))
    shapes.append((rect(0.04, 0.70, 0.96, 0.70 + slab, radius=0.02), SLATE))

    # Downward arrow: the config being pushed into the model.
    if not small:
        ax, shaft = 0.5, 0.035
        shapes.extend(
            [
                (capsule(ax, 0.24, ax, 0.44, shaft * 2.6), None),
                (capsule(ax, 0.26, ax, 0.42, shaft), SKY),
                (triangle((ax - 0.085, 0.40), (ax + 0.085, 0.40), (ax, 0.56)), SKY),
            ]
        )
    return shapes


def settings_icon(small):
    """Gear."""
    cx = cy = 0.5
    teeth = 6 if small else 8
    r_body = 0.30 if small else 0.28
    tooth_w = 0.115 if small else 0.085
    tooth_r = 0.46 if small else 0.45

    shapes = [(disc(cx, cy, r_body), SLATE)]
    for i in range(teeth):
        angle = math.tau * i / teeth
        dx, dy = math.sin(angle), -math.cos(angle)
        shapes.append(
            (
                capsule(
                    cx + dx * r_body * 0.6,
                    cy + dy * r_body * 0.6,
                    cx + dx * tooth_r,
                    cy + dy * tooth_r,
                    tooth_w,
                ),
                SLATE,
            )
        )
    shapes.append((disc(cx, cy, 0.13 if small else 0.11), None))
    return shapes


ICONS = {
    "ScanCableTray": scan_icon,
    "SyncHangers": sync_icon,
    "Settings": settings_icon,
}


def main(check_only=False):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stale = []

    for name, builder in ICONS.items():
        for size in (16, 32):
            path = OUT_DIR / f"{name}{size}.png"
            pixels = render(builder(small=size <= 16), size)

            if check_only:
                try:
                    matches = read_png_pixels(path) == pixels
                except (OSError, ValueError, struct.error, zlib.error):
                    # Missing, truncated or otherwise unreadable — same outcome
                    # as a mismatch: the file needs regenerating.
                    matches = False
                if not matches:
                    stale.append(path.name)
                    print(f"STALE  {path.name}")
                else:
                    print(f"ok     {path.name}")
                continue

            write_png(path, pixels, size)
            print(f"wrote {path.name} ({path.stat().st_size} bytes)")

    if stale:
        print(
            f"\n{len(stale)} icon(s) do not match this script. "
            "Run `python3 revit-addin/tools/generate_icons.py` and commit the result."
        )
        return 1

    return 0


if __name__ == "__main__":
    import sys

    raise SystemExit(main(check_only="--check" in sys.argv))
