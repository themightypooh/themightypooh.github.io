# Topographic "INSERT COIN" wallpaper (img/wallpaper-insert-coin.webp). Contour lines of a smooth
# noise field as SVG; the field goes flat under the centre so the lines flow around the coin slot.
#   python3 tools/topo-wallpaper.py topo.svg
#   magick -density 96 topo.svg -font fonts/WavegooRoundsquare.ttf -fill "#6c7280" -gravity center \
#     -pointsize 150 -kerning 10 -annotate +0+150 "INSERT COIN" -pointsize 60 -kerning 16 -annotate +0+270 "PLEASE?" wall.png
import math, random, sys

W, H = 2560, 1440
STEP = 8                       # sample grid in px
GW, GH = W // STEP + 1, H // STEP + 1
random.seed(7)

# value noise with smooth interpolation
P = 64
grid = [[random.random() for _ in range(P)] for _ in range(P)]
def vnoise(x, y):
    xi, yi = math.floor(x), math.floor(y)
    xf, yf = x - xi, y - yi
    u, v = xf * xf * (3 - 2 * xf), yf * yf * (3 - 2 * yf)
    a = grid[yi % P][xi % P]; b = grid[yi % P][(xi + 1) % P]
    c = grid[(yi + 1) % P][xi % P]; d = grid[(yi + 1) % P][(xi + 1) % P]
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v

def field(px, py):
    x, y = px / 640.0, py / 640.0
    # domain warp for the wandering, folded look
    wx = vnoise(x * 1.3 + 11, y * 1.3 + 3) * 1.6
    wy = vnoise(x * 1.3 + 29, y * 1.3 + 17) * 1.6
    x2, y2 = x + wx, y + wy
    f = 0.0; amp = 1.0; fr = 1.0; tot = 0.0
    for _ in range(3):
        f += vnoise(x2 * fr, y2 * fr) * amp; tot += amp; amp *= 0.5; fr *= 2.05
    f /= tot
    # a gentle dome under the centre plate so the lines ring around it
    dx, dy = (px - W / 2) / 760.0, (py - H * 0.46) / 430.0
    f += 0.55 * math.exp(-(dx * dx + dy * dy) * 1.6)
    return f

vals = [[field(i * STEP, j * STEP) for i in range(GW)] for j in range(GH)]

def interp(p1, p2, v1, v2, lvl):
    t = (lvl - v1) / (v2 - v1) if v2 != v1 else 0.5
    return (p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t)

def segments(lvl):
    segs = []
    for j in range(GH - 1):
        for i in range(GW - 1):
            v = (vals[j][i], vals[j][i + 1], vals[j + 1][i + 1], vals[j + 1][i])
            p = ((i * STEP, j * STEP), ((i + 1) * STEP, j * STEP), ((i + 1) * STEP, (j + 1) * STEP), (i * STEP, (j + 1) * STEP))
            idx = sum(1 << k for k in range(4) if v[k] > lvl)
            if idx in (0, 15): continue
            e = []
            for k in range(4):
                a, b = k, (k + 1) % 4
                if (v[a] > lvl) != (v[b] > lvl): e.append(interp(p[a], p[b], v[a], v[b], lvl))
            if len(e) == 2: segs.append((e[0], e[1]))
            elif len(e) == 4: segs += [(e[0], e[1]), (e[2], e[3])]
    return segs

def chains(segs):
    # join segments end to end into polylines
    key = lambda p: (round(p[0], 2), round(p[1], 2))
    ends = {}
    for s in segs:
        for q in (0, 1): ends.setdefault(key(s[q]), []).append(s)
    used = set(); out = []
    for s in segs:
        if id(s) in used: continue
        used.add(id(s)); line = [s[0], s[1]]
        for direction in (1, 0):
            while True:
                tip = line[-1] if direction else line[0]
                nxt = None
                for c in ends.get(key(tip), []):
                    if id(c) not in used: nxt = c; break
                if not nxt: break
                used.add(id(nxt))
                other = nxt[1] if key(nxt[0]) == key(tip) else nxt[0]
                if direction: line.append(other)
                else: line.insert(0, other)
        out.append(line)
    return out

def smooth_path(pts):
    if len(pts) < 3: return "M%.1f %.1f L%.1f %.1f" % (pts[0] + pts[-1])
    d = "M%.1f %.1f" % pts[0]
    for k in range(1, len(pts) - 1):
        mx, my = (pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2
        d += " Q%.1f %.1f %.1f %.1f" % (pts[k][0], pts[k][1], mx, my)
    d += " L%.1f %.1f" % pts[-1]
    return d

lo = min(min(r) for r in vals); hi = max(max(r) for r in vals)
# flatten the field under the plate so no contour crosses it: lines flow around it instead
flat = lo + (hi - lo) * 0.5
def plate_mask(px, py):
    hx, hy, r = 720.0, 400.0, 200.0       # stadium half size and corner, centred under the plate
    qx = max(abs(px - W / 2) - hx + r, 0.0); qy = max(abs(py - (H * 0.47)) - hy + r, 0.0)
    d = math.hypot(qx, qy) - r            # < 0 inside
    t = min(1.0, max(0.0, (60.0 - d) / 140.0))
    return t * t * (3 - 2 * t)
for j in range(GH):
    for i in range(GW):
        m = plate_mask(i * STEP, j * STEP)
        vals[j][i] = vals[j][i] * (1 - m) + flat * m
levels = [lo + (hi - lo) * (k + 0.5) / 20 for k in range(20)]
paths = []
for n, lvl in enumerate(levels):
    for line in chains(segments(lvl)):
        if len(line) < 4: continue
        w = 4.2 if n % 5 == 0 else 3.0
        paths.append('<path d="%s" stroke-width="%.1f"/>' % (smooth_path(line), w))


cx, cy = W / 2, H * 0.46
INK, BG = "#6c7280", "#2d323d"
def star(x, y, ro, ri):
    pts = []
    for k in range(10):
        r = ro if k % 2 == 0 else ri
        t = -math.pi / 2 + k * math.pi / 5
        pts.append("%.1f,%.1f" % (x + math.cos(t) * r, y + math.sin(t) * r))
    return " ".join(pts)
dx, dy = cx - 75, cy - 165            # coin door, top left
kx, ky = cx, dy - 84                  # the token, dropping straight into the slot
plate = [
 # coin door: a bevelled plate with a recessed slot
 '<rect x="%d" y="%d" width="150" height="220" rx="26" fill="none" stroke="%s" stroke-width="12"/>' % (dx, dy, INK),
 '<rect x="%d" y="%d" width="114" height="184" rx="14" fill="none" stroke="%s" stroke-width="4"/>' % (dx + 18, dy + 18, INK),
 '<rect x="%d" y="%d" width="34" height="132" rx="17" fill="%s"/>' % (cx - 17, dy + 44, INK),
 '<rect x="%d" y="%d" width="10" height="108" rx="5" fill="%s"/>' % (cx - 5, dy + 56, BG),
 # the token: turning edge-on as it drops, its rim showing on one side
 '<g transform="translate(%d %d) scale(0.62 1)">' % (kx, ky),
 '<circle cx="24" cy="0" r="58" fill="%s"/>' % INK,
 '<circle cx="0" cy="0" r="58" fill="%s" stroke="%s" stroke-width="11"/>' % (BG, INK),
 '<circle cx="0" cy="0" r="40" fill="none" stroke="%s" stroke-width="5"/>' % INK,
 '<polygon points="%s" fill="%s"/>' % (star(0, 2, 27, 12), INK),
 '</g>',
 # speed lines either side
 '<path d="M%d %d v-34 M%d %d v-22 M%d %d v-34 M%d %d v-22" stroke="%s" stroke-width="8" stroke-linecap="round"/>'
   % (kx - 66, ky + 6, kx - 88, ky + 26, kx + 74, ky + 6, kx + 96, ky + 26, INK),
]

svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">' % (W, H, W, H),
       '<rect width="100%" height="100%" fill="#2d323d"/>',
       '<g fill="none" stroke="#5d6370" stroke-linecap="round" stroke-linejoin="round">'] + paths + ['</g>'] + plate + ['</svg>']
open(sys.argv[1], "w").write("\n".join(svg))
print(len(paths), "paths")
