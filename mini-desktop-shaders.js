// GLSL ES 3.00 ports of the wavegoo shaders, kept as close to the Qt originals as possible:
//   BAR_FRAG   <- quickshell/wavegoo/shaders/dots.frag   (the bar's grain wave)
//   FAN_FRAG   <- quickshell/wavegoo/shaders/fan.frag    (the start menu growing out of the bar)
//   GLASS_FRAG <- quickshell/hourglass/shaders/glass.frag
// Differences: uniforms are loose instead of a std140 block, and p comes from gl_FragCoord
// (flipped so y runs down, like qt_TexCoord0 * size). Colours arrive premultiplied, as Qt passes them.
window.MD_SHADERS = (() => {
  const VERT = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

  const COMMON = `#version 300 es
precision highp float;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p) { return vec2(hash(p + 17.3), hash(p * 1.91 + 41.7)); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float smin(float a, float b, float k) {
    if (k <= 0.001) return min(a, b);
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}
`;

  const BAR_FRAG = COMMON + `
uniform vec2 size; uniform vec2 grid; uniform vec4 box;
uniform float barTop, corner, fillet, cell, time, flow, mouseX, hover, wave, simCell, mouseY, gooLive, gooLife;
uniform vec4 gradA, gradB, grainM, grainC, grainY;
uniform vec4 blob0, blob1, blob2, blob3;
uniform sampler2D disp;

vec2 drift(vec2 home) {
    float t = time * 0.5;
    vec2 q = home * 0.01 + vec2(t * 0.5, 0.0);
    vec2 cur = vec2(noise(q + vec2(0.0, t * 0.35)), noise(q + vec2(31.7, -t * 0.3))) - 0.5;
    return cur * 2.4 * flow;
}
float sdBox(vec2 p, vec4 b, float r) {
    vec2 c = vec2(b.x + b.z, b.y + b.w) * 0.5;
    vec2 h = vec2(b.z - b.x, b.w - b.y) * 0.5;
    vec2 q = abs(p - c) - h + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float waveTop(float x, float layer) {
    float roll = sin(x / 130.0 + time * 0.6 + layer * 1.7) * 5.5 + sin(x / 61.0 - time * 0.9 + layer) * 2.4;
    return barTop - 6.0 - wave * roll - layer * 10.0;
}
vec3 grainColor(vec2 id) {
    float h = hash(id + 11.1);
    return h < 0.34 ? grainM.rgb : h < 0.67 ? grainC.rgb : grainY.rgb;
}
float rest(float layer) { return barTop - 6.0 - layer * 10.0; }
float lift(float x, float layer) { return waveTop(x, layer) - rest(layer); }
float liftWeight(float y) { return smoothstep(rest(0.0) - 24.0, rest(0.0), y); }
float blobSdf(vec2 p, vec4 b) {
    if (b.y < 0.0) return 1e5;
    float life = (time - b.y) / gooLife;
    if (life <= 0.0 || life >= 1.0) return 1e5;
    float big = (10.0 + 7.0 * hash(vec2(b.w, 5.0))) * b.z;
    float r = big * smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.5, 1.0, life));
    if (r < 0.5) return 1e5;
    float climb = smoothstep(0.05, 1.0, life);
    float base = b.x;
    r *= (1.0 - smoothstep(35.0, 80.0, abs(base - mouseX))) * hover;
    if (r < 0.5) return 1e5;
    float surf = waveTop(base, 0.0) + 8.0;
    float from = max(mouseY, surf);
    vec2 c = vec2(base, mix(from, surf - 52.0, climb));
    vec2 st = vec2(1.0, 1.0 + 0.35 * sin(3.14159 * climb));
    return (length((p - c) / (st * r)) - 1.0) * r;
}
float goo(vec2 p) {
    if (gooLive < 0.5) return 1e5;
    float d = blobSdf(p, blob0);
    d = smin(d, blobSdf(p, blob1), 10.0);
    d = smin(d, blobSdf(p, blob2), 10.0);
    d = smin(d, blobSdf(p, blob3), 10.0);
    return d;
}
vec2 repel(vec2 c) {
    if (hover < 0.01) return vec2(0.0);
    vec2 v = c - vec2(mouseX, mouseY);
    float l = length(v) + 0.001;
    return v / l * 11.0 * exp(-l * l / (2.0 * 26.0 * 26.0)) * hover;
}
float flatShape(vec2 h, float layer) {
    float bar = rest(layer) - h.y;
    if (layer > 0.0) return bar;
    if (gooLive > 0.5) bar = smin(bar, goo(h + vec2(0.0, lift(h.x, 0.0) * liftWeight(h.y))), 8.0);
    float bx = (box.z - box.x > 1.0 && box.w - box.y > 1.0) ? sdBox(h, box, corner) : 1e5;
    return smin(bar, bx, fillet);
}
vec3 phys(vec2 q) {
    vec4 t = texture(disp, q / (grid * simCell));
    return t.a > 0.5 ? vec3((t.rg * 255.0 - 128.0) / 8.0, t.b) : vec3(0.0);
}
void main() {
    vec2 p = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y);
    if (gooLive < 0.5 && p.y < min(barTop - 6.0, box.y) - 8.0 * wave - 40.0) { fragColor = vec4(0.0); return; }
    vec4 col = vec4(0.0);
    {   // back wave
        vec2 q = p - vec2(0.0, lift(p.x, 1.0)) - drift(p + 50.0);
        vec2 c0 = floor(q / cell);
        float best = 0.0; vec3 bcol = vec3(1.0);
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 id = c0 + vec2(float(i), float(j)) + 1000.0;
            vec2 home = (id - 1000.0 + 0.5 + (hash2(id) - 0.5) * 0.9) * cell;
            float d = flatShape(home, 1.0);
            float prob = d < 0.0 ? 0.7 : (d < 3.0 ? exp(-d / 1.5) * 0.3 : 0.0);
            if (hash(id * 2.11 + 9.7) >= prob) continue;
            vec2 c = home + vec2(0.0, lift(home.x, 1.0)) + drift(home + 50.0);
            float sg = 0.45 + 0.25 * hash(id + 3.3);
            vec2 dv = p - c;
            float bm = exp(-dot(dv, dv) / (2.0 * sg * sg));
            if (bm > best) { best = bm; bcol = grainColor(id); }
        }
        vec3 bc = mix(bcol, vec3(1.0), 0.1);
        float a = best * 0.5;
        col = vec4(bc * a, a) + col * (1.0 - a);
    }
    {   // front wave
        float w = liftWeight(p.y);
        vec2 q = p - vec2(0.0, lift(p.x, 0.0) * w);
        float outGoo = gooLive > 0.5 ? smoothstep(-4.0, 2.0, goo(p)) : 1.0;
        q -= (phys(q).xy + repel(p)) * outGoo + drift(q);
        vec2 c0 = floor(q / cell);
        float best = 0.0, speed = 0.0, glint = 0.0; vec3 gcol = vec3(1.0);
        for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
            vec2 id = c0 + vec2(float(i), float(j));
            if (id.x < 0.0 || id.y < 0.0) continue;
            vec2 home = (id + 0.5 + (hash2(id) - 0.5) * 0.9) * cell;
            float d = flatShape(home, 0.0);
            float prob = d < 0.0 ? 0.92 : (d < 4.0 ? exp(-d / 1.5) * 0.45 : 0.0);
            if (hash(id * 1.37 + 3.1) >= prob) continue;
            vec3 ph = phys(home);
            float inGoo = gooLive > 0.5 ? smoothstep(2.0, -4.0, goo(home + vec2(0.0, lift(home.x, 0.0) * liftWeight(home.y)))) : 0.0;
            ph.xy *= 1.0 - inGoo;
            float spray = 1.0 + 1.5 * clamp(d / 8.0, 0.0, 1.0);
            vec2 c = home + vec2(0.0, lift(home.x, 0.0) * liftWeight(home.y)) + ph.xy + drift(home) * spray;
            c += repel(c) * (1.0 - inGoo);
            float sz = hash(id + 5.1);
            float sg = (0.5 + 0.35 * sz) * (1.0 - 0.3 * clamp(d / 12.0, 0.0, 1.0));
            float fade = (d > 0.0 ? exp(-d / 14.0) : 1.0) * (0.5 + 0.5 * hash(id + 8.8));
            vec2 dv = p - c;
            float m = exp(-dot(dv, dv) / (2.0 * sg * sg)) * fade;
            if (m > best) { best = m; speed = ph.z + inGoo * 0.6; glint = hash(id + 2.2); gcol = grainColor(id); }
        }
        vec3 pc = mix(gcol, vec3(1.0), 0.04 + glint * 0.22 + clamp(speed, 0.0, 1.0) * 0.4);
        float a = best;
        col = vec4(pc * a, a) + col * (1.0 - a);
    }
    fragColor = col;
}`;

  const FAN_FRAG = COMMON + `
uniform vec2 size, offset, screen, origin;
uniform vec4 seams;
uniform float rOut, reveal, time, cell, flow, wave, rimWave, mouseA, hover, barTop, barWinTop, level, growR, zoneTop, hasWall;
uniform vec4 gradA, gradB, grainM, grainC, grainY, backing;
uniform sampler2D wall;
const float QUARTER = 1.5707963;
vec3 grainColor(vec2 id) {
    float h = hash(id + 11.1);
    return h < 0.34 ? grainM.rgb : h < 0.67 ? grainC.rgb : grainY.rgb;
}
vec2 drift(vec2 home) {
    float t = time * 0.5;
    vec2 q = home * 0.01 + vec2(t * 0.5, 0.0);
    vec2 cur = vec2(noise(q + vec2(0.0, t * 0.35)), noise(q + vec2(31.7, -t * 0.3))) - 0.5;
    return cur * 2.4 * flow;
}
float barTopB() { return barTop - barWinTop; }
float barRest(float layer) { return barTopB() - 6.0 - layer * 10.0; }
float barLift(float x, float layer) {
    float roll = sin(x / 130.0 + time * 0.6 + layer * 1.7) * 5.5 + sin(x / 61.0 - time * 0.9 + layer) * 2.4;
    return -wave * roll;
}
float barLiftWeight(float y) { return smoothstep(barRest(0.0) - 24.0, barRest(0.0), y); }
vec2 toD(vec2 b) { return vec2(b.x - origin.x, origin.y - barWinTop - b.y); }
float rimLift(float a) {
    float x = (QUARTER - a) * rOut;
    float roll = sin(x / 130.0 + time * 0.6) * 5.5 + sin(x / 61.0 - time * 0.9) * 2.4;
    float swell = exp(-pow((a - mouseA) * rOut / 95.0, 2.0)) * 15.0 * hover;
    return rimWave * (roll + swell);
}
float bubbly() { return sin(3.14159 * clamp(reveal, 0.0, 1.0)); }
float boil(float s, float span, float seed) {
    float k = bubbly();
    if (k < 0.02) return 0.0;
    float bulge = 0.0;
    for (int i = 0; i < 8; i++) {
        float fi = float(i) + seed;
        float life = fract(time * (0.7 + 0.5 * hash(vec2(fi, 3.0))) + hash(vec2(fi, 7.0)));
        float gen = floor(time * (0.7 + 0.5 * hash(vec2(fi, 3.0))) + hash(vec2(fi, 7.0)));
        float at = span * hash(vec2(fi, gen + 1.0));
        float rad = (16.0 + 30.0 * hash(vec2(fi, gen + 5.0))) * sin(3.14159 * life) * k;
        float dx = s - at;
        bulge = max(bulge, sqrt(max(rad * rad - dx * dx, 0.0)));
    }
    return bulge;
}
float boilSurface(float x) { return boil(x - origin.x, growR, 20.0); }
float surface(float x) {
    if (reveal >= 0.999) return 1e4;
    float roll = sin(x / 130.0 + time * 0.6) * 5.5 + sin(x / 61.0 - time * 0.9) * 2.4;
    float slosh = sin(3.14159 * clamp(reveal, 0.0, 1.0));
    float chop = sin(x / 38.0 - time * 4.0) * 3.0 + sin(x / 97.0 + time * 2.6) * 6.0;
    float surge = (noise(vec2(x / 105.0, time * 0.9)) - 0.5) * 180.0 + (noise(vec2(x / 41.0, time * 1.7 + 9.0)) - 0.5) * 50.0;
    return level + roll * (1.6 + 2.5 * slosh) + (chop + surge) * slosh + boilSurface(x);
}
float growAt(float a) {
    float k = bubbly();
    if (k < 0.001) return growR;
    float lumps = (noise(vec2(a * 3.0, time * 1.4)) - 0.5) * 90.0 * k;
    return growR + lumps + boil((QUARTER - a) * growR, QUARTER * growR, 0.0);
}
float discFlat(vec2 b, float layer) {
    vec2 d = toD(b);
    float r = length(d);
    return max(max(r - growAt(atan(d.y, d.x)) + layer * 10.0, d.y - surface(b.x)), -d.x - 60.0);
}
float barFlat(vec2 b, float layer) { return barRest(layer) - b.y; }
float filletK() {
    float v = clamp(reveal, 0.0, 1.0);
    return (46.0 + 90.0 * (1.0 - v)) * smoothstep(0.0, 0.25, v);
}
float shapeFlat(vec2 b, float layer) { return smin(barFlat(b, layer), discFlat(b, layer), filletK()); }
float nearBar(float y) { return 1.0 - smoothstep(0.0, 70.0, barRest(0.0) - y); }
float lane(float r) {
    float mid = (seams.w + 3.0 + rOut - 16.0) * 0.5;
    return 0.95 * (1.0 - smoothstep(8.0, 30.0, abs(r - mid)));
}
float rimWeight(vec2 b) {
    vec2 d = toD(b);
    return smoothstep(rOut - 34.0, rOut - 6.0, length(d)) * (1.0 - nearBar(b.y));
}
float wallMask(vec2 b) {
    float sd = shapeFlat(b, 0.0);
    float excess = barFlat(b, 0.0) - sd;
    float zone = 1.0 - smoothstep(zoneTop - barWinTop - 1.0, zoneTop - barWinTop + 1.0, b.y);
    return hasWall * smoothstep(2.0, -2.0, sd) * smoothstep(1.0, 10.0, excess) * zone * nearBar(b.y - 30.0);
}
vec2 place(vec2 home, float layer, bool front) {
    vec2 d = toD(home);
    float r = max(length(d), 0.001);
    vec2 u = vec2(d.x, -d.y) / r;
    float bw = front ? barLiftWeight(home.y) : 1.0;
    vec2 c = home + vec2(0.0, barLift(home.x, layer) * bw * nearBar(home.y));
    c += u * rimLift(atan(d.y, d.x)) * rimWeight(home);
    return c;
}
void main() {
    vec2 p = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y) + offset;
    vec2 b = p - vec2(0.0, barWinTop);
    if (shapeFlat(b, 0.0) > 55.0) { fragColor = vec4(0.0); return; }
    vec2 d = toD(b);
    float r = max(length(d), 0.001);
    float a = atan(d.y, d.x);
    vec2 u = vec2(d.x, -d.y) / r;
    float discReal = max(max(r - growAt(a) - rimLift(a), d.y - surface(b.x)), -d.x - 60.0);
    float inside = smoothstep(4.0, -22.0, discReal) * (1.0 - nearBar(b.y + 10.0));
    float wm = wallMask(b);
    vec4 col = wm > 0.0 ? vec4(texture(wall, p / screen).rgb, 1.0) * wm : vec4(0.0);
    col = backing * inside + col * (1.0 - backing.a * inside);
    {
        vec2 q = b - vec2(0.0, barLift(b.x, 1.0) * nearBar(b.y)) - u * rimLift(a) * rimWeight(b) - drift(b + 50.0);
        vec2 c0 = floor(q / cell);
        float best = 0.0; vec3 bcol = vec3(1.0);
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 id = c0 + vec2(float(i), float(j)) + 1000.0;
            vec2 home = (id - 1000.0 + 0.5 + (hash2(id) - 0.5) * 0.9) * cell;
            float sd = shapeFlat(home, 1.0);
            float edge = -discFlat(home, 1.0);
            float menuP = 0.7 * exp(-max(edge - 14.0, 0.0) / 8.0) * (1.0 - lane(length(toD(home))));
            float prob = sd < 0.0 ? mix(menuP, 0.7, nearBar(home.y)) : (sd < 3.0 ? exp(-sd / 1.5) * 0.3 : 0.0);
            float bf = barFlat(home, 1.0);
            float barP = bf < 0.0 ? 0.7 : (bf < 3.0 ? exp(-bf / 1.5) * 0.3 : 0.0);
            float roll = hash(id * 2.11 + 9.7);
            if (prob < 0.005 || roll >= prob || (roll < barP && wallMask(home) < 0.5)) continue;
            vec2 c = place(home, 1.0, false) + drift(home + 50.0);
            float sg = 0.45 + 0.25 * hash(id + 3.3);
            vec2 dv = b - c;
            float bm = exp(-dot(dv, dv) / (2.0 * sg * sg));
            if (bm > best) { best = bm; bcol = grainColor(id); }
        }
        vec3 bc = mix(bcol, vec3(1.0), 0.1);
        float al = best * 0.5;
        col = vec4(bc * al, al) + col * (1.0 - al);
    }
    {
        vec2 q = b - vec2(0.0, barLift(b.x, 0.0) * barLiftWeight(b.y) * nearBar(b.y)) - u * rimLift(a) * rimWeight(b);
        q -= drift(q);
        vec2 c0 = floor(q / cell);
        float best = 0.0, glint = 0.0; vec3 gcol = vec3(1.0);
        for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
            vec2 id = c0 + vec2(float(i), float(j));
            vec2 home = (id + 0.5 + (hash2(id) - 0.5) * 0.9) * cell;
            float sd = shapeFlat(home, 0.0);
            if (sd > 4.0) continue;
            float hr = length(toD(home));
            float prob;
            if (sd < 0.0) {
                float edge = -discFlat(home, 0.0);
                float menuP = edge < 0.0 ? 0.92 : (0.22 + 0.7 * exp(-max(edge - 14.0, 0.0) / 14.0)) * (1.0 - lane(hr));
                prob = mix(menuP, 0.92, nearBar(home.y));
            } else prob = exp(-sd / 1.5) * 0.45;
            float bf = barFlat(home, 0.0);
            float barP = bf < 0.0 ? 0.92 : (bf < 4.0 ? exp(-bf / 1.5) * 0.45 : 0.0);
            float roll = hash(id * 1.37 + 3.1);
            if (prob < 0.005 || roll >= prob || (roll < barP && wallMask(home) < 0.5)) continue;
            float spray = 1.0 + 1.5 * clamp(sd / 8.0, 0.0, 1.0);
            vec2 c = place(home, 0.0, true) + drift(home) * spray;
            float sz = hash(id + 5.1);
            float sg = (0.5 + 0.35 * sz) * (1.0 - 0.3 * clamp(sd / 12.0, 0.0, 1.0));
            float fade = (sd > 0.0 ? exp(-sd / 14.0) : 1.0) * (0.5 + 0.5 * hash(id + 8.8));
            vec2 dv = b - c;
            float m = exp(-dot(dv, dv) / (2.0 * sg * sg)) * fade;
            if (m > best) { best = m; glint = hash(id + 2.2); gcol = grainColor(id); }
        }
        vec3 pc = mix(gcol, vec3(1.0), 0.04 + glint * 0.22);
        float al = best;
        col = vec4(pc * al, al) + col * (1.0 - al);
    }
    fragColor = col;
}`;

  const GLASS_FRAG = COMMON + `
uniform vec2 size;
uniform float neckY, neckLen, neckW, bulbH, bulbR, cell, pitch, time, topY, dip, crater, topShift, botY, heap, heapR;
uniform float stream, flowFrom, flowTo, flash, dim, hover;
uniform vec4 gradA, gradB, grainM, grainC, grainY, rim;
float hash1(float n) { return fract(sin(n * 91.345 + 7.13) * 43758.5453); }
vec3 grainColor(float h) { return h < 0.34 ? grainM.rgb : h < 0.67 ? grainC.rgb : grainY.rgb; }
float profile(float u) {
    u = clamp(u, 0.0, 1.0);
    const float a = 0.62;
    float s = u < a ? 1.0 - (1.0 - u / a) * (1.0 - u / a) : sqrt(max(0.0, 1.0 - pow((u - a) / 0.63, 2.0)));
    return neckW + (bulbR - neckW) * s;
}
float halfWidth(float y) { return profile((abs(y - neckY) - neckLen) / bulbH); }
float glassTop() { return neckY - neckLen - bulbH; }
float glassBot() { return neckY + neckLen + bulbH; }
float glassSdf(vec2 p) {
    float dx = abs(p.x - size.x * 0.5);
    float hw = halfWidth(p.y);
    float sl = (halfWidth(p.y + 1.0) - halfWidth(p.y - 1.0)) * 0.5;
    float d = (dx - hw) / sqrt(1.0 + sl * sl);
    return max(d, abs(p.y - neckY) - (neckLen + bulbH));
}
float sdBox(vec2 p, vec2 c, vec2 h, float r) {
    vec2 q = abs(p - c) - h + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float frameSdf(vec2 p) {
    float cx = size.x * 0.5;
    float pw = bulbR + 18.0;
    float plate = 7.0;
    float t = sdBox(p, vec2(cx, glassTop() - plate), vec2(pw, plate), 4.0);
    float b = sdBox(p, vec2(cx, glassBot() + plate), vec2(pw, plate), 4.0);
    float postX = bulbR + 9.0;
    float posts = sdBox(vec2(abs(p.x - cx), p.y), vec2(postX, neckY), vec2(2.0, bulbH + neckLen), 2.0);
    return min(min(t, b), posts);
}
float topSurface(float dx) {
    float c = max(0.0, 1.0 - abs(dx) / max(crater, 1.0));
    return topY + dip * pow(c, 1.25);
}
float botSurface(float dx) {
    float d = sqrt(dx * dx + 9.0);
    return botY - heap * max(0.0, 1.0 - d / max(heapR, 1.0));
}
float sandDepth(vec2 h) {
    float dx = h.x - size.x * 0.5;
    float wall = halfWidth(h.y) - abs(dx) - 0.6;
    if (wall < 0.0 || abs(h.y - neckY) > neckLen + bulbH - 1.0) return -1e3;
    if (h.y < neckY) {
        if (topY >= neckY - neckLen - 0.5) return -1e3;
        if (h.y > neckY - neckLen) return stream > 0.5 ? 1.0 : -1e3;
        return h.y - topSurface(dx);
    }
    if (h.y < neckY + neckLen) return -1e3;
    return h.y - botSurface(dx);
}
float splat(vec2 d, float sg) { return exp(-dot(d, d) / (2.0 * sg * sg)); }
void main() {
    vec2 p = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y);
    float cx = size.x * 0.5;
    float gy = clamp((p.y - glassTop() + 14.0) / (glassBot() - glassTop() + 28.0), 0.0, 1.0);
    vec3 liquid = mix(gradA.rgb, gradB.rgb, gy);
    vec4 col = vec4(0.0);
    {
        vec2 c = (floor(p / pitch) + 0.5) * pitch;
        vec2 o = abs(p - c);
        float dotM = (1.0 - smoothstep(0.55, 1.05, max(o.x, o.y)));
        float fr = frameSdf(c);
        float g = abs(glassSdf(c));
        float fa = fr < 0.0 ? 0.9 : 0.0;
        vec3 fc = mix(liquid, vec3(1.0), fr > -pitch * 1.2 && fr < 0.0 ? 0.25 : 0.0);
        float ga = g < pitch * 0.5 ? rim.a * (1.0 + 0.6 * hover) + flash * 0.6 : 0.0;
        vec3 gc = mix(rim.rgb, liquid, 0.35);
        float dx = p.x - cx;
        float hw = halfWidth(c.y);
        float side = -dx / max(hw, 1.0);
        float glint = (side > 0.6 && side < 0.68 && abs(c.y - neckY) > neckLen + bulbH * 0.25 && abs(c.y - neckY) < neckLen + bulbH * 0.8) ? 0.10 : 0.0;
        float a = max(fa, max(ga, glint)) * dotM;
        vec3 cc = fa > 0.0 ? fc : (ga > 0.0 ? gc : vec3(1.0));
        col = vec4(cc * a, a);
    }
    {
        bool top = p.y < neckY;
        float shift = top ? topShift : 0.0;
        vec2 q = p - vec2(0.0, shift);
        vec2 c0 = floor(q / cell);
        float best = 0.0, glint = 0.0; vec3 gcol = vec3(1.0);
        for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
            vec2 id = c0 + vec2(float(i), float(j)) + 500.0;
            vec2 home = (id - 500.0 + 0.5 + (hash2(id) - 0.5) * 0.9) * cell + vec2(0.0, shift);
            if ((home.y < neckY) != top) continue;
            float d = sandDepth(home);
            float prob = d > 0.0 ? 0.93 : (d > -4.0 ? exp(d / 1.4) * 0.45 : 0.0);
            if (hash(id * 1.37 + 3.1) >= prob) continue;
            float sg = 0.55 + 0.35 * hash(id + 5.1);
            float fade = (d > 0.0 ? 1.0 : exp(d / 3.0)) * (0.55 + 0.45 * hash(id + 8.8));
            float m = splat(p - home, sg) * fade;
            if (m > best) { best = m; glint = hash(id + 2.2); gcol = grainColor(hash(id + 11.1)); }
        }
        vec3 pc = mix(gcol, vec3(1.0), 0.04 + glint * 0.22 + flash * 0.7);
        float a = best * (1.0 - 0.3 * dim);
        col = vec4(pc * a, a) + col * (1.0 - a);
    }
    if (stream > 0.01) {
        const float k = 1300.0;
        const float sp = 1.0 / 70.0;
        float y0 = neckY - neckLen;
        float land = botSurface(0.0);
        if (abs(p.x - cx) < 8.0 && p.y > y0 - 2.0 && p.y < land + 3.0) {
            float age = sqrt(max(0.0, p.y - y0) / k);
            float best = 0.0; vec3 gcol = vec3(1.0);
            for (int lane = 0; lane < 2; lane++) {
                float off = float(lane) * 0.5;
                float jc = floor((time - age) / sp - off);
                for (int n = -3; n <= 3; n++) {
                    float j = jc + float(n);
                    float a = time - (j + off) * sp;
                    if (a < 0.0) continue;
                    float born = time - a;
                    if (born < flowFrom || born > flowTo) continue;
                    float y = y0 + k * a * a;
                    if (y > land + 1.0) continue;
                    float jid = j * 2.0 + float(lane);
                    float x = cx + (hash1(jid) - 0.5) * (1.6 + a * 9.0);
                    float m = splat(p - vec2(x, y), 0.55 + 0.3 * hash1(jid + 3.0));
                    if (m > best) { best = m; gcol = grainColor(hash1(jid + 9.0)); }
                }
            }
            vec3 pc = mix(gcol, vec3(1.0), 0.15 + flash * 0.7);
            float a = best * stream * (1.0 - 0.3 * dim);
            col = vec4(pc * a, a) + col * (1.0 - a);
        }
    }
    fragColor = col;
}`;

  return { VERT, BAR_FRAG, FAN_FRAG, GLASS_FRAG };
})();
