#!/usr/bin/env python3
"""Render preview.png from the companion's shape and palette data.

This is an architectural illustration for the repository. It is not a capture
from a running Omarchy desktop.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"


def library(name):
    script = f"""
import fs from 'node:fs'
import vm from 'node:vm'
const src = fs.readFileSync({json.dumps(str(ROOT / name))}, 'utf8').replace(/^\\.pragma library\\s*/, '')
const context = {{}}
vm.createContext(context)
vm.runInContext(src, context)
process.stdout.write(JSON.stringify(context))
"""
    # The libraries assign with var/function, which land on the sandbox global.
    script = script.replace("JSON.stringify(context)", "JSON.stringify({ NAMES: context.NAMES, SHAPES: context.SHAPES, COLORS: context.COLORS, OMARCHY: context.OMARCHY })")
    result = subprocess.run(["node", "--input-type=module", "-e", script], check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT, size)


def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_mark(base, points, cx, cy, radius, fill, outline, eye, pupil, eye_y, spread, gaze=(0.35, -0.15)):
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    poly = [(cx + p[0] * radius, cy + p[1] * radius) for p in points]
    draw.polygon(poly, fill=fill + (255,))
    # Soft inner highlight toward the upper left.
    highlight = Image.new("RGBA", base.size, (0, 0, 0, 0))
    hd = ImageDraw.Draw(highlight)
    hd.ellipse((cx - radius * 0.85, cy - radius * 1.05, cx + radius * 0.35, cy + radius * 0.15), fill=(255, 255, 255, 70))
    mask = Image.new("L", base.size, 0)
    ImageDraw.Draw(mask).polygon(poly, fill=255)
    highlight.putalpha(ImageChops_multiply(highlight.getchannel("A"), mask))
    overlay.alpha_composite(highlight)
    draw = ImageDraw.Draw(overlay)
    draw.line(poly + [poly[0]], fill=outline + (255,), width=max(2, int(radius * 0.045)))
    eye_radius = max(2.0, radius * 0.11)
    center_y = cy + eye_y * radius
    for sign in (-1, 1):
        ex = cx + sign * spread * radius + gaze[0] * radius * 0.04
        ey = center_y + gaze[1] * radius * 0.03
        draw.ellipse((ex - eye_radius, ey - eye_radius * 0.92, ex + eye_radius, ey + eye_radius * 0.92), fill=eye + (255,), outline=outline + (255,))
        pr = eye_radius * 0.38
        px = ex + gaze[0] * eye_radius * 0.45
        py = ey + gaze[1] * eye_radius * 0.35
        draw.ellipse((px - pr, py - pr, px + pr, py + pr), fill=pupil + (255,))
    base.alpha_composite(overlay)


def ImageChops_multiply(a, b):
    from PIL import ImageChops
    return ImageChops.multiply(a, b)


def hex_rgb(value):
    text = value.lstrip("#")
    return tuple(int(text[i:i + 2], 16) for i in (0, 2, 4))


def main():
    shapes = library("qml/shapes.js")
    palette = library("qml/palette.js")
    colors = palette["COLORS"]
    names = shapes["NAMES"]
    width, height = 1280, 800
    image = Image.new("RGBA", (width, height), (18, 20, 28, 255))
    draw = ImageDraw.Draw(image)
    for y in range(height):
        shade = 18 + int(10 * y / height)
        draw.line((0, y, width, y), fill=(shade, shade + 2, shade + 10, 255))

    rounded(draw, (18, 18, width - 18, 52), 12, (14, 16, 22, 255))
    draw.text((36, 26), "Omarchy", font=font(16, True), fill=(232, 230, 224, 255))
    draw.text((width - 150, 26), "Tue  10:41", font=font(15), fill=(196, 198, 206, 255))

    rounded(draw, (48, 92, 760, 560), 16, (28, 32, 44, 255), (255, 255, 255, 28))
    draw.text((72, 112), "Today", font=font(22, True), fill=(236, 234, 228, 255))
    draw.text((72, 152), "Desktop stays put. The companion only catches its own pixels.", font=font(16), fill=(186, 190, 200, 255))
    for i, line in enumerate(("Review the plugin diff", "Morning digest is with Bob", "No purchases waiting")):
        y = 210 + i * 64
        rounded(draw, (72, y, 720, y + 48), 10, (38, 44, 58, 255))
        draw.text((92, y + 14), line, font=font(16), fill=(220, 222, 228, 255))

    card = (70, 250, 620, 760)
    rounded(draw, card, 18, (24, 27, 36, 245), (255, 255, 255, 30))
    draw.text((90, 268), "Appearance & bots", font=font(16, True), fill=(240, 238, 232, 255))
    draw.text((90, 294), "25 shapes  ·  11 colours + Omarchy", font=font(13), fill=(170, 176, 188, 255))

    orange = colors["orange"]
    cell = 52
    left, top = 90, 328
    for index, name in enumerate(names):
        col, row = index % 5, index // 5
        x0 = left + col * (cell + 6)
        y0 = top + row * (cell + 6)
        rounded(draw, (x0, y0, x0 + cell, y0 + cell), 10, (36, 40, 52, 255))
        cx = x0 + cell / 2
        cy = y0 + cell / 2
        shape = shapes["SHAPES"][name]
        draw_mark(
            image, shape["points"], cx, cy, 20,
            hex_rgb(orange["fill"]), hex_rgb(orange["outline"]),
            hex_rgb(orange["eye"]), hex_rgb(orange["pupil"]),
            shape["eyeY"], shape["spread"], gaze=(0.2, 0.05),
        )

    swatches = palette["NAMES"] if "NAMES" in palette else list(colors)
    # NAMES is not exported by the JSON rewrite unless present. Fall back to key order.
    if not isinstance(swatches, list) or not swatches or swatches == names:
        swatches = ["black", "brown", "red", "orange", "yellow", "green", "cyan", "blue", "violet", "magenta", "gray"]
    sx = 92
    sy = 684
    for name in swatches:
        tone = colors[name]
        draw.ellipse((sx, sy, sx + 22, sy + 22), fill=hex_rgb(tone["fill"]) + (255,), outline=(255, 255, 255, 180))
        sx += 30
    draw.ellipse((sx, sy, sx + 22, sy + 22), fill=(122, 162, 247, 255), outline=(255, 255, 255, 220), width=2)
    draw.text((sx + 30, sy + 3), "Omarchy", font=font(13), fill=(206, 214, 230, 255))

    # Companion in the corner.
    hero = shapes["SHAPES"]["teardrop"]
    hx, hy, hr = 1100, 640, 78
    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse((hx - 46, hy + 62, hx + 46, hy + 78), fill=(0, 0, 0, 80))
    image.alpha_composite(shadow)
    draw_mark(
        image, hero["points"], hx, hy, hr,
        hex_rgb(orange["fill"]), hex_rgb(orange["outline"]),
        hex_rgb(orange["eye"]), hex_rgb(orange["pupil"]),
        hero["eyeY"], hero["spread"], gaze=(-0.45, -0.2),
    )

    bubble = (760, 300, 1168, 520)
    rounded(draw, bubble, 18, (32, 36, 48, 245), (255, 255, 255, 36))
    tail = [(1048, 512), (1110, 512), (1092, 575)]
    ImageDraw.Draw(image).polygon(tail, fill=(32, 36, 48, 245))
    draw_mark(
        image, hero["points"], 792, 338, 16,
        hex_rgb(orange["fill"]), hex_rgb(orange["outline"]),
        hex_rgb(orange["eye"]), hex_rgb(orange["pupil"]),
        hero["eyeY"], hero["spread"],
    )
    draw.text((820, 322), "Bob", font=font(16, True), fill=(244, 241, 234, 255))
    draw.text((820, 344), "Morning digest and front door", font=font(12), fill=(176, 182, 194, 255))
    reply = "Calendar is clear until 10.\nThe review queue is the one open pull request."
    draw.multiline_text((784, 378), reply, font=font(15), fill=(236, 234, 228, 255), spacing=4)
    rounded(draw, (784, 456, 1144, 498), 10, (18, 20, 28, 255))
    draw.text((798, 468), "Ask Bob", font=font(14), fill=(150, 156, 168, 255))

    draw.text((36, height - 36), "Architectural preview — not an on-device capture", font=font(13), fill=(140, 146, 160, 255))

    out = ROOT / "preview.png"
    image.convert("RGB").save(out, "PNG", optimize=True)
    print(out)


if __name__ == "__main__":
    sys.exit(main())
