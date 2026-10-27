"""Measure Grok Bot's avatar picker into qml/shapes.js data.

Usage: python3 tools/measure-avatars.py PICKER.png OUT.json [--js qml/shapes.js]

PICKER.png is a phone screenshot of Grok Bot's Avatar > Shape sheet, with the
fourteen shapes in rows of 4, 5 and 5, the large preview above them, and the
colour swatches below. It must already be in sRGB (convert a Display P3
capture first). The picker lays its shapes on a uniform grid, so every outline
and eye is expressed in units of the circle's radius about the centre of its
grid cell, with y growing downward. The teardrop is traced from the large
preview and scaled onto its grid cell for extra detail.

Needs numpy, scipy, scikit-image and Pillow. Authoring only; not installed.
"""
import json, re, sys
import numpy as np
from PIL import Image
from skimage import measure
from scipy.ndimage import gaussian_filter1d

a = np.array(Image.open(sys.argv[1])).astype(float)
S = 1184 / 919
STEM = 61.0

def fractions(reg, white):
    R, B = reg[:, :, 0], reg[:, :, 2]
    t = np.clip((white - R) / (white - STEM), 0, 1)
    w = np.clip((B - STEM * t) / white, 0, 1)
    o = np.clip(1 - w - t, 0, 1)
    return o, t

def area(p):
    x, y = p[:, 1], p[:, 0]
    return 0.5 * (np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))

def poly_moments(p):
    # p: (N,2) as (x, y), closed polygon
    x, y = p[:, 0], p[:, 1]
    x1, y1 = np.roll(x, -1), np.roll(y, -1)
    cr = x * y1 - x1 * y
    A = cr.sum() / 2
    cx = ((x + x1) * cr).sum() / (6 * A)
    cy = ((y + y1) * cr).sum() / (6 * A)
    return A, cx, cy

def capsule_fit(p):
    """Centre, length, width, and major-axis angle of a closed eye outline."""
    A, cx, cy = poly_moments(p)
    q = p - [cx, cy]
    cov = np.cov(q.T)
    ev, vec = np.linalg.eigh(cov)
    major = vec[:, 1]
    if major[1] < 0: major = -major  # point the axis downward
    minor = np.array([-major[1], major[0]])
    L = np.ptp(q @ major)
    Wd = np.ptp(q @ minor)
    ang = np.degrees(np.arctan2(major[1], major[0]))
    return dict(x=cx, y=cy, length=L, width=Wd, angle=ang, area=abs(A))

def outlines(region, white, ox, oy, min_area=800):
    o, t = fractions(region, white)
    body = o + t
    # A stem sits on top of the pumpkin; keep only the part of it that covers
    # the body (inside the body's convex hull) in the body outline.
    from skimage.morphology import convex_hull_image
    blobs = measure.label(o > 0.5)
    hull = np.zeros_like(o, bool)
    for bp in measure.regionprops(blobs):
        if bp.area < min_area: continue
        r0, c0, r1, c1 = bp.bbox
        hull[r0:r1, c0:c1] |= convex_hull_image(blobs[r0:r1, c0:c1] == bp.label)
    body = o + t * hull
    lab = measure.label(body > 0.5)
    found = []
    for p in measure.regionprops(lab):
        if p.area < min_area: continue
        r0, c0, r1, c1 = p.bbox
        pad = 4
        y0, x0 = max(0, r0 - pad), max(0, c0 - pad)
        sub_b = body[y0:r1 + pad, x0:c1 + pad]
        sub_o = o[y0:r1 + pad, x0:c1 + pad]
        sub_t = t[y0:r1 + pad, x0:c1 + pad]
        cons = sorted(measure.find_contours(sub_b, 0.5), key=lambda c: -abs(area(c)))
        outer = cons[0]
        holes = [c for c in cons[1:] if abs(area(c)) > 20]
        stem = None
        if (sub_t > 0.5).sum() > 40:
            sc = sorted(measure.find_contours(sub_t, 0.5), key=lambda c: -abs(area(c)))[0]
            stem = sc
        shift = np.array([y0 + oy, x0 + ox])
        found.append(dict(outer=(outer + shift)[:, ::-1], holes=[(h + shift)[:, ::-1] for h in holes],
                          stem=None if stem is None else (stem + shift)[:, ::-1]))
    return found

grid = outlines(a[int(730 * S):int(1140 * S), int(110 * S):int(820 * S)], 255.0, int(110 * S), int(730 * S))
big = outlines(a[int(410 * S):int(670 * S), int(340 * S):int(590 * S)], 247.0, int(340 * S), int(410 * S))[0]

def bbox_centre(p):
    return (p[:, 0].min() + p[:, 0].max()) / 2, (p[:, 1].min() + p[:, 1].max()) / 2

# Order shapes as the picker shows them: rows of 4, 5, 5.
cents = [bbox_centre(g['outer']) for g in grid]
rows = sorted(set(round(c[1] / (100 * S)) for c in cents))
order = sorted(range(len(grid)), key=lambda i: (round(cents[i][1] / (100 * S)), cents[i][0]))
grid = [grid[i] for i in order]
cents = [cents[i] for i in order]

# Circle: least-squares circle fit gives the unit radius and the first cell.
c = grid[0]['outer']
Am = np.c_[2 * c[:, 0], 2 * c[:, 1], np.ones(len(c))]
bm = (c ** 2).sum(1)
cx0, cy0, k = np.linalg.lstsq(Am, bm, rcond=None)[0]
unit = np.sqrt(k + cx0 ** 2 + cy0 ** 2)
print('circle centre', cx0 / S, cy0 / S, 'radius px', unit, 'display', unit / S)

# Grid: columns at a uniform pitch, rows of 4 then 5 then 5, all centred.
layout = [(0, k) for k in range(4)] + [(1, k) for k in range(5)] + [(2, k) for k in range(5)]
symmetric = [0, 2, 3, 6, 8, 11, 12]  # circle, squircle, sparkle, flower, tablet, burst, hex
X, Y = [], []
for i in symmetric:
    r, k = layout[i]
    col = k - (1.5 if r == 0 else 2.0)
    X.append([1, col, 0, 0]); Y.append(cents[i][0])
    X.append([0, 0, 1, r]); Y.append(cents[i][1])
X = np.array(X, float); Y = np.array(Y, float)
ox_, pitch_x, oy_, pitch_y = np.linalg.lstsq(X, Y, rcond=None)[0]
print('grid centre x', ox_ / S, 'pitch', pitch_x / S, pitch_y / S, 'row0 y', oy_ / S)
def cell(i):
    r, k = layout[i]
    col = k - (1.5 if r == 0 else 2.0)
    return ox_ + col * pitch_x, oy_ + r * pitch_y
# Pin the circle cell to its fitted centre.
dx0, dy0 = cx0 - cell(0)[0], cy0 - cell(0)[1]
print('circle cell residual px', dx0, dy0)

def resample(p, n):
    p = np.vstack([p, p[:1]])
    seg = np.hypot(*np.diff(p, axis=0).T)
    s = np.r_[0, np.cumsum(seg)]
    u = np.linspace(0, s[-1], n, endpoint=False)
    return np.c_[np.interp(u, s, p[:, 0]), np.interp(u, s, p[:, 1])]

def smooth(p, sigma):
    return np.c_[gaussian_filter1d(p[:, 0], sigma, mode='wrap'), gaussian_filter1d(p[:, 1], sigma, mode='wrap')]

def normalise(p, ccx, ccy):
    return (p - [ccx, ccy]) / unit

def orient(p):
    # clockwise on screen (y down) means positive shoelace area in (x, y)
    x, y = p[:, 0], p[:, 1]
    if (np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))) < 0: p = p[::-1]
    top = np.argmin(p[:, 1] + 1e-6 * p[:, 0])
    return np.roll(p, -top, axis=0)

N = 120
names = ['circle', 'cloud', 'squircle', 'sparkle', 'blob', 'pebble', 'flower', 'teardrop', 'tablet',
         'wedge', 'gem', 'burst', 'hex', 'pumpkin']
out = {'unit_px': unit, 'pitch_px': pitch_x, 'shapes': {}}

# High-resolution teardrop from the large preview, mapped onto the grid one.
gi = names.index('teardrop')
g_out = resample(grid[gi]['outer'], 400)
b_out = resample(big['outer'], 400)
scale = np.sqrt(abs(area(b_out[:, ::-1]))) and np.sqrt(abs(area(g_out[:, ::-1])) / abs(area(b_out[:, ::-1])))
gc = g_out.mean(0); bc = b_out.mean(0)
def big_to_grid(p): return (p - bc) * scale + gc
print('big->grid scale', scale)

for i, name in enumerate(names):
    g = grid[i]
    ccx, ccy = cell(i)
    ccx += dx0 * 0; ccy += dy0 * 0
    outer = g['outer']; holes = g['holes']
    if name == 'teardrop':
        outer = big_to_grid(big['outer']); holes = [big_to_grid(h) for h in big['holes']]
    sig = 1.2 if name != 'teardrop' else 2.4
    pts = orient(normalise(resample(smooth(resample(outer, 720), sig * 6), N), ccx, ccy))
    eyes = sorted([capsule_fit(normalise(h, ccx, ccy)) for h in holes], key=lambda e: e['x'])
    entry = dict(points=[[round(v, 4) for v in q] for q in pts], eyes=[{k: round(float(v), 4) for k, v in e.items()} for e in eyes])
    if g['stem'] is not None and name == 'pumpkin':
        st = orient(normalise(resample(smooth(resample(g['stem'], 240), 3), 24), ccx, ccy))
        entry['stem'] = [[round(v, 4) for v in q] for q in st]
    out['shapes'][name] = entry
    ext = np.abs(pts).max(0)
    print('%-9s extent %.3f %.3f  eyes %s' % (name, ext[0], ext[1], ' '.join('(%.3f,%.3f L%.3f W%.3f %.0f°)' % (e['x'], e['y'], e['length'], e['width'], e['angle']) for e in eyes)))
json.dump(out, open(sys.argv[2], 'w'), indent=1)

if len(sys.argv) > 4 and sys.argv[3] == '--js':
    def flat(pts):
        return '[' + ', '.join('%.4f, %.4f' % (p[0], p[1]) for p in pts) + ']'
    lines = ['// BEGIN MEASURED SHAPES (tools/measure-avatars.py)', 'var MEASURED = {']
    for name in names:
        e = out['shapes'][name]
        eyes = ', '.join('{ x: %.4f, y: %.4f, length: %.4f, width: %.4f, angle: %.2f }' % (v['x'], v['y'], v['length'], v['width'], v['angle']) for v in e['eyes'])
        lines.append('  %s: {' % name)
        lines.append('    points: %s,' % flat(e['points']))
        lines.append('    eyes: [%s]%s' % (eyes, ',' if 'stem' in e else ''))
        if 'stem' in e: lines.append('    stem: %s' % flat(e['stem']))
        lines.append('  },')
    lines[-1] = lines[-1].rstrip(',')
    lines += ['}', '// END MEASURED SHAPES']
    target = open(sys.argv[4]).read()
    block = '\n'.join(lines)
    target = re.sub(r'// BEGIN MEASURED SHAPES.*?// END MEASURED SHAPES', lambda m: block, target, flags=re.S)
    open(sys.argv[4], 'w').write(target)
