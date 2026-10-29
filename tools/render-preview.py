#!/usr/bin/env python3
"""
High-precision 3x supersampled renderer for Omarchy Grok Bot Desktop Companion.
- Bob uses his real profile.json mark: teardrop ("drop") in orange (#F28B30).
- Pinned bots use their real profile.json marks:
  - Bob: drop / orange (#F28B30)
  - OmaBot: bean (blob) / green (#5BC67A)
  - Poteto: bean (blob) / brown (#A16237)
  - X Desk: bean (blob) / blue (#4E8CFF)
  - Inbox: pill (tablet) / cyan (#22B8CF)
- NO circular halo/outline behind the corner companion mark: the flat silhouette
  sits directly over the desktop with a soft ambient drop shadow.
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKDROPS = [
    os.environ.get("GROKBOT_PREVIEW_BACKDROP", ""),
    "/home/box/agent-data/agents/e0195a7d-f804-4688-9191-e2cf3574a6d1/attachments/eba79041be9d8cb4af9fed7a5b7231395f7bb59d157bb608454d8a2f3c548689.webp",
    "/cursor/stores/bot/grok-bot/agents/e0195a7d-f804-4688-9191-e2cf3574a6d1/attachments/eba79041be9d8cb4af9fed7a5b7231395f7bb59d157bb608454d8a2f3c548689.webp",
]

SCALE = 3
W, H = 1440, 900
SW, SH = W * SCALE, H * SCALE

PALETTE = [
    ("orange",  "#F28B30"),
    ("blue",    "#4E8CFF"),
    ("green",   "#5BC67A"),
    ("yellow",  "#F0B429"),
    ("violet",  "#A864FD"),
    ("magenta", "#EC5399"),
    ("cyan",    "#22B8CF"),
    ("red",     "#F05252"),
    ("black",   "#3F3F46"),
    ("gray",    "#71717A"),
    ("brown",   "#A16237"),
]

SHAPES_25 = [
    ["circle",   "square",   "triangle", "diamond",  "pentagon"],
    ["hexagon",  "octagon",  "heptagon", "pill",     "cloud"],
    ["heart",    "crescent", "star",     "spark",    "burst"],
    ["flower",   "clover",   "sprout",   "drop",     "bean"],
    ["peanut",   "pebble",   "shield",   "ghost",    "bolt"],
]

def S(v):
    return int(round(v * SCALE))

def hex_rgb(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)

def font(size, bold=False, mono=False):
    px = S(size)
    if mono:
        p = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
    else:
        p = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    try:
        return ImageFont.truetype(p, px)
    except Exception:
        return ImageFont.load_default()

def sample_mark_polygon(shape, cx, cy, r):
    pts = []
    n = 160
    s = shape.strip()
    for i in range(n):
        t = (i / n) * math.tau
        c, sn = math.cos(t), math.sin(t)
        if s == "circle":
            x, y = c * 0.94, sn * 0.94
        elif s == "pill":
            p = 3.6
            x = math.copysign(abs(c) ** (2/p), c) * 0.98
            y = math.copysign(abs(sn) ** (2/p), sn) * 0.76
        elif s == "bean":
            rad = 0.88 + 0.10 * math.sin(t - 0.5) + 0.08 * math.cos(2 * t - 0.7) - 0.06 * math.sin(3 * t + 0.4)
            x, y = c * rad * 1.02, sn * rad * 0.95
        elif s == "cloud":
            rad = 0.84 + 0.13 * math.cos(5 * t - 0.3) + 0.04 * math.sin(2 * t)
            x, y = c * rad, sn * rad * 0.92
        elif s == "flower":
            rad = 0.82 + 0.16 * math.cos(6 * t)
            x, y = c * rad, sn * rad
        elif s == "clover":
            rad = 0.81 + 0.18 * math.cos(4 * t)
            x, y = c * rad, sn * rad
        elif s == "star":
            rad = 0.79 + 0.20 * math.cos(5 * t - math.pi/2)
            x, y = c * rad, sn * rad
        elif s == "spark":
            rad = 0.77 + 0.22 * math.cos(4 * t)
            x, y = c * rad, sn * rad
        elif s == "burst":
            rad = 0.83 + 0.15 * math.cos(8 * t)
            x, y = c * rad, sn * rad
        elif s == "peanut":
            rad = 0.84 + 0.16 * math.cos(2 * t - 0.4)
            x, y = c * rad * 1.02, sn * rad * 0.94
        elif s == "pebble":
            rad = 0.89 + 0.08 * math.cos(2 * t + 0.6) + 0.04 * math.sin(3 * t)
            x, y = c * rad * 1.03, sn * rad * 0.91
        elif s == "drop":
            # Authentic plump Grok Bot teardrop: gently tapered crown at top, full rounded belly below
            # t = -pi/2 is top, t = +pi/2 is bottom
            belly = 0.86 + 0.20 * sn - 0.05 * math.cos(2 * t)
            x = c * belly * 0.96
            y = sn * 0.96 + 0.03 * (1.0 - sn * sn)
        elif s == "heart":
            x = 0.88 * (math.sin(t) ** 3)
            y = -0.88 * (0.8125 * math.cos(t) - 0.3125 * math.cos(2*t) - 0.125 * math.cos(3*t) - 0.0625 * math.cos(4*t)) - 0.04
        elif s == "ghost":
            if sn > 0.35:
                wave = 0.07 * math.cos(6 * t)
                x, y = c * 0.86, sn * 0.91 + wave
            else:
                x, y = c * 0.88, sn * 0.93
        elif s == "shield":
            rad = 0.90 - 0.07 * math.cos(4 * t) + 0.05 * sn
            x, y = c * rad * 0.91, sn * rad * 0.95
        elif s == "crescent":
            rad = 0.88 + 0.10 * math.cos(t + 0.6)
            x, y = c * rad, sn * rad
        elif s == "sprout":
            rad = 0.85 + 0.12 * math.sin(2 * t + 0.5) + 0.07 * math.cos(3 * t)
            x, y = c * rad, sn * rad
        elif s == "bolt":
            rad = 0.85 + 0.14 * math.cos(3 * t - 0.8)
            x, y = c * rad * 0.92, sn * rad
        else:
            sides = {"square": 4, "triangle": 3, "diamond": 4, "pentagon": 5, "hexagon": 6, "heptagon": 7, "octagon": 8}.get(s, 6)
            phase = math.pi / 4 if s == "diamond" else 0.0
            ang = t + math.pi / 2 + phase
            sector = math.tau / sides
            local = ((ang + sector / 2) % sector) - sector / 2
            poly_r = math.cos(sector / 2) / math.cos(local)
            rad = (0.70 * poly_r + 0.30 * 1.0) * 0.92
            x, y = math.cos(t) * rad, math.sin(t) * rad
        pts.append((cx + x * r, cy + y * r))
    return pts

def draw_rotated_capsule(draw, cx, cy, w, h, angle_deg, fill):
    pts = []
    hw, hh = w / 2.0, h / 2.0
    r = hw
    straight = max(0.0, hh - r)
    ang = math.radians(angle_deg)
    ca, sa = math.cos(ang), math.sin(ang)
    steps = 48
    for i in range(steps):
        t = (i / steps) * math.tau
        px = math.cos(t) * r
        py = math.sin(t) * r
        if py >= 0:
            py += straight
        else:
            py -= straight
        rx = px * ca - py * sa
        ry = px * sa + py * ca
        pts.append((cx + rx, cy + ry))
    draw.polygon(pts, fill=fill)

def draw_grokbot_mark(draw, shape, color_hex, cx, cy, radius, bg_cutout="#141416", gaze=(0.15, -0.06), tilt_deg=11.0):
    pts = sample_mark_polygon(shape, cx, cy, radius)
    draw.polygon(pts, fill=hex_rgb(color_hex))
    # Teardrop eyes sit slightly lower in the rounded belly
    belly_y_offset = 0.07 * radius if shape.strip() == "drop" else 0.0
    gx = cx + gaze[0] * radius
    gy = cy + belly_y_offset + gaze[1] * radius
    sep = radius * 0.30
    eye_w = max(1.8 * SCALE, radius * 0.165)
    eye_h = max(3.6 * SCALE, radius * 0.43)
    lx = gx - sep * 0.52
    ly = gy + radius * 0.035
    rx = gx + sep * 0.52
    ry = gy - radius * 0.035
    draw_rotated_capsule(draw, lx, ly, eye_w, eye_h, tilt_deg, hex_rgb(bg_cutout))
    draw_rotated_capsule(draw, rx, ry, eye_w, eye_h, tilt_deg, hex_rgb(bg_cutout))

def load_backdrop():
    for path in BACKDROPS:
        if path and os.path.isfile(path):
            bg = Image.open(path).convert("RGBA")
            bg = bg.resize((SW, SH), Image.LANCZOS)
            dim = Image.new("RGBA", (SW, SH), (8, 9, 12, 85))
            return Image.alpha_composite(bg, dim)
    return Image.new("RGBA", (SW, SH), (12, 14, 18, 255))

def build_scene():
    canvas = load_backdrop()
    draw = ImageDraw.Draw(canvas, "RGBA")

    BOB_SHAPE = "drop"
    BOB_HEX = "#F28B30"

    # 1. Top Waybar Grok Bot status pill (top-right, next to system tray)
    wb_x, wb_y, wb_w, wb_h = S(1125), S(6), S(128), S(26)
    draw.rounded_rectangle([wb_x, wb_y, wb_x + wb_w, wb_y + wb_h], radius=S(13), fill=hex_rgb("#141416", 240), outline=hex_rgb("#2c2c30"))
    draw_grokbot_mark(draw, BOB_SHAPE, BOB_HEX, wb_x + S(16), wb_y + S(13), S(8), bg_cutout="#141416", gaze=(0.12, -0.05))
    draw.text((wb_x + S(30), wb_y + S(5)), "Bob · 15 bots", font=font(11, bold=True), fill=hex_rgb("#F4F4F5"))
    draw.ellipse([wb_x + wb_w - S(15), wb_y + S(10), wb_x + wb_w - S(9), wb_y + S(16)], fill=hex_rgb(BOB_HEX))

    # Soft drop shadows for the two panels + silhouette shadow directly under Bob's teardrop
    shadow_layer = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow_layer, "RGBA")
    sx, sy, sw, sh = S(490), S(168), S(416), S(636)
    bx, by, bw, bh = S(926), S(168), S(464), S(548)
    comp_cx, comp_cy = S(1327), S(795)

    sdraw.rounded_rectangle([sx - S(4), sy + S(10), sx + sw + S(4), sy + sh + S(14)], radius=S(24), fill=(0, 0, 0, 175))
    sdraw.rounded_rectangle([bx - S(4), by + S(10), bx + bw + S(4), by + bh + S(14)], radius=S(24), fill=(0, 0, 0, 185))
    # Teardrop-shaped shadow directly behind the floating mark (NO circular ring/halo!)
    shadow_pts = sample_mark_polygon(BOB_SHAPE, comp_cx, comp_cy + S(6), S(38))
    sdraw.polygon(shadow_pts, fill=(0, 0, 0, 155))
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=S(16)))
    canvas = Image.alpha_composite(canvas, shadow_layer)
    draw = ImageDraw.Draw(canvas, "RGBA")

    # =========================================================================
    # 2. GROK BOT COMPANION POPOVER (BubblePanel.qml) — Authentic Grok Bot UI
    # =========================================================================
    draw.rounded_rectangle([bx, by, bx + bw, by + bh], radius=S(22), fill=hex_rgb("#141416", 252), outline=hex_rgb("#27272A"), width=max(1, S(1)))

    # Top Header Bar: Centered Grok Bot Header Pill with Bob's orange teardrop
    pill_w, pill_h = S(156), S(36)
    pill_x = bx + (bw - pill_w) // 2
    pill_y = by + S(16)
    draw.rounded_rectangle([pill_x, pill_y, pill_x + pill_w, pill_y + pill_h], radius=S(18), fill=hex_rgb("#1C1C1F"), outline=hex_rgb("#2E2E32"), width=max(1, S(1)))
    draw_grokbot_mark(draw, BOB_SHAPE, BOB_HEX, pill_x + S(24), pill_y + S(18), S(11), bg_cutout="#1C1C1F", gaze=(0.14, -0.06))
    draw.text((pill_x + S(42), pill_y + S(9)), "Bob", font=font(14, bold=True), fill=hex_rgb("#F4F4F5"))
    draw.text((pill_x + S(74), pill_y + S(10)), "· Main", font=font(12), fill=hex_rgb("#8E8E93"))
    chx, chy = pill_x + pill_w - S(20), pill_y + S(16)
    draw.line([(chx - S(4), chy - S(2)), (chx, chy + S(2)), (chx + S(4), chy - S(2))], fill=hex_rgb("#A1A1AA"), width=S(1.6))

    # Left header button: Appearance / Mark drawer toggle
    btn_l_x, btn_l_y = bx + S(16), pill_y + S(2)
    draw.rounded_rectangle([btn_l_x, btn_l_y, btn_l_x + S(32), btn_l_y + S(32)], radius=S(16), fill=hex_rgb("#232327"), outline=hex_rgb("#3F3F46"), width=max(1, S(1)))
    for idx, dy in enumerate([-6, 0, 6]):
        ly = btn_l_y + S(16) + S(dy)
        draw.line([(btn_l_x + S(9), ly), (btn_l_x + S(23), ly)], fill=hex_rgb("#E4E4E7"), width=S(1.5))
        dot_x = btn_l_x + S(13 if idx != 1 else 19)
        draw.ellipse([dot_x - S(2.2), ly - S(2.2), dot_x + S(2.2), ly + S(2.2)], fill=hex_rgb(BOB_HEX if idx == 1 else "#F4F4F5"))

    # Right header button: Minimize / close
    btn_r_x, btn_r_y = bx + bw - S(48), pill_y + S(2)
    draw.rounded_rectangle([btn_r_x, btn_r_y, btn_r_x + S(32), btn_r_y + S(32)], radius=S(16), fill=hex_rgb("#1C1C1F"), outline=hex_rgb("#2C2C30"), width=max(1, S(1)))
    draw.line([(btn_r_x + S(11), btn_r_y + S(16)), (btn_r_x + S(21), btn_r_y + S(16))], fill=hex_rgb("#A1A1AA"), width=S(1.8))

    # Compact Pinned Teammate Bar (using each bot's real profile.json mark & colour!)
    strip_y = by + S(64)
    pinned = [
        ("Bob",     "drop",  "#F28B30", True),
        ("OmaBot",  "bean",  "#5BC67A", False),
        ("Poteto",  "bean",  "#A16237", False),
        ("X Desk",  "bean",  "#4E8CFF", False),
        ("Inbox",   "pill",  "#22B8CF", False),
        ("+10",     None,    "#71717A", False),
    ]
    px_cur = bx + S(18)
    for name, shp, col, active in pinned:
        tw = S(72) if shp else S(46)
        th = S(28)
        bg_c = "#232327" if active else "#18181B"
        bd_c = "#3F3F46" if active else "#26262A"
        draw.rounded_rectangle([px_cur, strip_y, px_cur + tw, strip_y + th], radius=S(14), fill=hex_rgb(bg_c), outline=hex_rgb(bd_c), width=max(1, S(1)))
        if shp:
            draw_grokbot_mark(draw, shp, col, px_cur + S(14), strip_y + S(14), S(7.5), bg_cutout=bg_c, gaze=(0.14, -0.06))
            draw.text((px_cur + S(26), strip_y + S(6)), name, font=font(11, bold=active), fill=hex_rgb("#F4F4F5" if active else "#A1A1AA"))
        else:
            draw.text((px_cur + S(11), strip_y + S(6)), name, font=font(11, bold=True), fill=hex_rgb("#A1A1AA"))
        px_cur += tw + S(6)

    draw.line([(bx + S(18), by + S(104)), (bx + bw - S(18), by + S(104))], fill=hex_rgb("#222226"), width=max(1, S(1)))

    # Chat Stream Area
    ub_w, ub_h = S(310), S(62)
    ub_x, ub_y = bx + bw - ub_w - S(20), by + S(122)
    draw.rounded_rectangle([ub_x, ub_y, ub_x + ub_w, ub_y + ub_h], radius=S(18), fill=hex_rgb("#232327"), outline=hex_rgb("#2E2E33"), width=max(1, S(1)))
    draw.text((ub_x + S(16), ub_y + S(12)), "Sync my 15 bots and watch Hyprland", font=font(12.5), fill=hex_rgb("#F4F4F5"))
    draw.text((ub_x + S(16), ub_y + S(32)), "workspaces on the active monitor.", font=font(12.5), fill=hex_rgb("#F4F4F5"))

    ay = by + S(204)
    draw.text((bx + S(22), ay), "Synced all 15 bots from your roster. I'm anchored to", font=font(13), fill=hex_rgb("#F4F4F5"))
    draw.text((bx + S(22), ay + S(21)), "Bottom Right on DP-1 and tracking active windows.", font=font(13), fill=hex_rgb("#F4F4F5"))

    # Inline compact status card inside chat
    card_x, card_y, card_w, card_h = bx + S(22), ay + S(54), bw - S(44), S(96)
    draw.rounded_rectangle([card_x, card_y, card_x + card_w, card_y + card_h], radius=S(14), fill=hex_rgb("#19191C"), outline=hex_rgb("#2A2A2E"), width=max(1, S(1)))
    draw.ellipse([card_x + S(16), card_y + S(17), card_x + S(24), card_y + S(25)], fill=hex_rgb(BOB_HEX))
    draw.text((card_x + S(32), card_y + S(12)), "Wayland Layer-Shell · WlrLayershell.Top", font=font(11.5, bold=True), fill=hex_rgb("#E4E4E7"))
    draw.text((card_x + S(32), card_y + S(34)), "Mark: Teardrop (drop) · Orange (#F28B30) · Playful", font=font(11), fill=hex_rgb("#A1A1AA"))
    draw.text((card_x + S(32), card_y + S(54)), "Keybind: Super + Shift + G  ·  Waybar: custom/grokbot", font=font(11, mono=True), fill=hex_rgb("#71717A"))

    # Quick action chips above composer
    chip_y = by + bh - S(104)
    chips = ["Hand screen to OmaBot", "Triage inbox", "Switch to Poteto"]
    cx_pos = bx + S(20)
    for ch in chips:
        cw = S(len(ch) * 6.5 + 24)
        draw.rounded_rectangle([cx_pos, chip_y, cx_pos + cw, chip_y + S(28)], radius=S(14), fill=hex_rgb("#19191C"), outline=hex_rgb("#2A2A2E"), width=max(1, S(1)))
        draw.text((cx_pos + S(12), chip_y + S(6)), ch, font=font(11), fill=hex_rgb("#A1A1AA"))
        cx_pos += cw + S(8)

    # Signature Grok Bot Bottom Composer Bar
    comp_y = by + bh - S(60)
    plus_x = bx + S(18)
    draw.ellipse([plus_x, comp_y, plus_x + S(42), comp_y + S(42)], fill=hex_rgb("#1C1C1F"), outline=hex_rgb("#2C2C30"), width=max(1, S(1)))
    draw.line([(plus_x + S(14), comp_y + S(21)), (plus_x + S(28), comp_y + S(21))], fill=hex_rgb("#D4D4D8"), width=S(1.8))
    draw.line([(plus_x + S(21), comp_y + S(14)), (plus_x + S(21), comp_y + S(28))], fill=hex_rgb("#D4D4D8"), width=S(1.8))

    inp_x = plus_x + S(50)
    inp_w = bw - S(142)
    draw.rounded_rectangle([inp_x, comp_y, inp_x + inp_w, comp_y + S(42)], radius=S(21), fill=hex_rgb("#19191C"), outline=hex_rgb("#2C2C30"), width=max(1, S(1)))
    draw.text((inp_x + S(18), comp_y + S(12)), "Ask Bob", font=font(13.5), fill=hex_rgb("#71717A"))
    mic_x, mic_y = inp_x + inp_w - S(24), comp_y + S(21)
    draw.rounded_rectangle([mic_x - S(3.5), mic_y - S(8), mic_x + S(3.5), mic_y + S(2)], radius=S(3.5), outline=hex_rgb("#A1A1AA"), width=S(1.5))
    draw.arc([mic_x - S(6.5), mic_y - S(5), mic_x + S(6.5), mic_y + S(5)], start=0, end=180, fill=hex_rgb("#A1A1AA"), width=S(1.5))
    draw.line([(mic_x, mic_y + S(5)), (mic_x, mic_y + S(9))], fill=hex_rgb("#A1A1AA"), width=S(1.5))

    vc_x = inp_x + inp_w + S(8)
    draw.ellipse([vc_x, comp_y, vc_x + S(42), comp_y + S(42)], fill=hex_rgb("#232327"), outline=hex_rgb("#3F3F46"), width=max(1, S(1)))
    bars = [5, 11, 16, 9, 5]
    for bi, bh_bar in enumerate(bars):
        bx_bar = vc_x + S(13 + bi * 4)
        by_mid = comp_y + S(21)
        draw.line([(bx_bar, by_mid - S(bh_bar/2)), (bx_bar, by_mid + S(bh_bar/2))], fill=hex_rgb("#F4F4F5"), width=S(1.8))

    # =========================================================================
    # 3. APPEARANCE & BOT SYNC DRAWER (SettingsPanel.qml)
    # =========================================================================
    draw.rounded_rectangle([sx, sy, sx + sw, sy + sh], radius=S(22), fill=hex_rgb("#141416", 252), outline=hex_rgb("#27272A"), width=max(1, S(1)))

    draw.text((sx + S(22), sy + S(20)), "Companion Appearance", font=font(15, bold=True), fill=hex_rgb("#F4F4F5"))
    sync_x = sx + sw - S(138)
    draw.rounded_rectangle([sync_x, sy + S(18), sx + sw - S(20), sy + S(42)], radius=S(12), fill=hex_rgb("#261B14"), outline=hex_rgb("#4A2E1B"), width=max(1, S(1)))
    draw.ellipse([sync_x + S(10), sy + S(27), sync_x + S(16), sy + S(33)], fill=hex_rgb(BOB_HEX))
    draw.text((sync_x + S(22), sy + S(23)), "Synced · Bob", font=font(11, bold=True), fill=hex_rgb(BOB_HEX))

    # Section 1: MARK SILHOUETTE (25 GROK BOT MARKS) — "drop" selected in orange
    draw.text((sx + S(22), sy + S(58)), "MARK SILHOUETTE  ·  25 SHAPES", font=font(10.5, bold=True, mono=True), fill=hex_rgb("#71717A"))

    grid_x, grid_y = sx + S(22), sy + S(80)
    cell_w, cell_h, gap = S(68), S(52), S(8)

    for r_idx, row in enumerate(SHAPES_25):
        for c_idx, shp in enumerate(row):
            tx = grid_x + c_idx * (cell_w + gap)
            ty = grid_y + r_idx * (cell_h + gap)
            is_sel = (shp == BOB_SHAPE)
            tile_bg = "#261B14" if is_sel else "#19191C"
            tile_bd = BOB_HEX if is_sel else "#26262A"
            draw.rounded_rectangle([tx, ty, tx + cell_w, ty + cell_h], radius=S(12), fill=hex_rgb(tile_bg), outline=hex_rgb(tile_bd), width=S(1.8 if is_sel else 1.0))
            mark_col = BOB_HEX if is_sel else "#71717A"
            draw_grokbot_mark(draw, shp, mark_col, tx + cell_w // 2, ty + S(21), S(12.5), bg_cutout=tile_bg, gaze=(0.14, -0.06))
            lbl_col = "#F4F4F5" if is_sel else "#71717A"
            tw_lbl = len(shp) * S(2.8)
            draw.text((tx + cell_w // 2 - tw_lbl, ty + cell_h - S(14)), shp, font=font(8.5, bold=is_sel), fill=hex_rgb(lbl_col))

    # Section 2: COLOUR PALETTE (11 COLOURS) — "orange" selected
    col_sec_y = sy + S(390)
    draw.text((sx + S(22), col_sec_y), "COLOUR  ·  11 ACCENTS", font=font(10.5, bold=True, mono=True), fill=hex_rgb("#71717A"))
    sw_y = col_sec_y + S(24)
    sw_r = S(12)
    sw_step = S(34)
    for idx, (cname, chex) in enumerate(PALETTE):
        cx_sw = sx + S(34) + idx * sw_step
        cy_sw = sw_y + sw_r
        is_c_sel = (cname == "orange")
        if is_c_sel:
            draw.ellipse([cx_sw - sw_r - S(4), cy_sw - sw_r - S(4), cx_sw + sw_r + S(4), cy_sw + sw_r + S(4)], outline=hex_rgb("#F4F4F5"), width=S(2))
        draw.ellipse([cx_sw - sw_r, cy_sw - sw_r, cx_sw + sw_r, cy_sw + sw_r], fill=hex_rgb(chex), outline=hex_rgb("#27272A"), width=S(1))

    # Section 3: MOTION PRESET
    mot_y = sy + S(464)
    draw.text((sx + S(22), mot_y), "IDLE MOTION & RIG", font=font(10.5, bold=True, mono=True), fill=hex_rgb("#71717A"))
    seg_y = mot_y + S(22)
    seg_w = (sw - S(44) - S(16)) // 3
    for idx, (m_id, m_lbl, m_sub) in enumerate([("calm", "Calm", "Breathing"), ("playful", "Playful", "Bob + Gaze"), ("hyper", "Hyper", "Orbit + Hop")]):
        mx = sx + S(22) + idx * (seg_w + S(8))
        act = (m_id == "playful")
        draw.rounded_rectangle([mx, seg_y, mx + seg_w, seg_y + S(44)], radius=S(11), fill=hex_rgb("#232327" if act else "#19191C"), outline=hex_rgb(BOB_HEX if act else "#26262A"), width=S(1.5 if act else 1))
        draw.text((mx + S(12), seg_y + S(8)), m_lbl, font=font(11.5, bold=act), fill=hex_rgb("#F4F4F5" if act else "#A1A1AA"))
        draw.text((mx + S(12), seg_y + S(24)), m_sub, font=font(9.5), fill=hex_rgb(BOB_HEX if act else "#71717A"))

    # Section 4: SCREEN ANCHOR CORNER
    anc_y = sy + S(548)
    draw.text((sx + S(22), anc_y), "DESKTOP ANCHOR", font=font(10.5, bold=True, mono=True), fill=hex_rgb("#71717A"))
    anc_seg_y = anc_y + S(22)
    anc_w = (sw - S(44) - S(24)) // 4
    for idx, (cid, clbl) in enumerate([("br", "Bottom R"), ("bl", "Bottom L"), ("tr", "Top R"), ("tl", "Top L")]):
        ax = sx + S(22) + idx * (anc_w + S(8))
        act = (cid == "br")
        draw.rounded_rectangle([ax, anc_seg_y, ax + anc_w, anc_seg_y + S(36)], radius=S(10), fill=hex_rgb("#232327" if act else "#19191C"), outline=hex_rgb(BOB_HEX if act else "#26262A"), width=S(1.5 if act else 1))
        draw.text((ax + S(14), anc_seg_y + S(10)), clbl, font=font(11, bold=act), fill=hex_rgb("#F4F4F5" if act else "#A1A1AA"))

    # =========================================================================
    # 4. BOTTOM-RIGHT DESKTOP COMPANION CHARACTER (CompanionMark.qml)
    #    NO circle outline or halo around Bob — floats directly on the desktop!
    # =========================================================================
    draw_grokbot_mark(draw, BOB_SHAPE, BOB_HEX, comp_cx, comp_cy, S(38), bg_cutout="#141416", gaze=(-0.14, -0.08), tilt_deg=11.0)

    out = canvas.resize((W, H), Image.LANCZOS).convert("RGB")
    destinations = [os.path.join(ROOT, "preview.png")]
    artifacts = "/opt/cursor/artifacts"
    if os.path.isdir(artifacts):
        destinations.append(os.path.join(artifacts, "preview.png"))
    for dest in destinations:
        out.save(dest, "PNG", optimize=True)
        print("Saved", dest)

if __name__ == "__main__":
    build_scene()
