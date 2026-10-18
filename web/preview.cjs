// Software preview: renders the tunnel to a PNG so we can compare against ../reference/*.jpg without a GPU.
// usage: node preview.cjs out.png [dist=40] [seed=1] [fovDeg=60] [W=640] [H=480]
const fs = require('fs'), zlib = require('zlib');
const { Tunnel, Palette, cameraAt } = require('./monkey-core.js');
const out = process.argv[2] || 'preview.png';
const dist = parseFloat(process.argv[3] || '40'), seed = parseInt(process.argv[4] || '1');
const fovDeg = parseFloat(process.argv[5] || '60'), W = parseInt(process.argv[6] || '640'), H = parseInt(process.argv[7] || '480');
const opt = {}; for (const a of process.argv.slice(8)) { const [k, v] = a.split('='); opt[k] = parseFloat(v); }
const T = new Tunnel(Object.assign({ seed }, opt));
const P = new Palette(); for (let i = 0; i < Math.floor(dist * 6); i++) P.step(0.17);
const fogEnd = opt.fog || 31, look = opt.look || 2.5;
const cam = cameraAt(T, dist, look);
function norm(v) { const l = Math.hypot(...v); return v.map(x => x / l); }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
const fwd = norm(cam.target.map((x, i) => x - cam.eye[i]));
const right = norm(cross([0, 1, 0], fwd)), up = cross(fwd, right);
const f = 1 / Math.tan(fovDeg * Math.PI / 360);
function toView(p) { const d = [p[0] - cam.eye[0], p[1] - cam.eye[1], p[2] - cam.eye[2]]; return [d[0] * right[0] + d[1] * right[1] + d[2] * right[2], d[0] * up[0] + d[1] * up[1] + d[2] * up[2], d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2]]; }
const img = new Uint8Array(W * H * 3), zb = new Float32Array(W * H).fill(1e9);
const fog = P.c.map(Math.round);
for (let i = 0; i < W * H; i++) { img[i * 3] = fog[0]; img[i * 3 + 1] = fog[1]; img[i * 3 + 2] = fog[2]; }
const L1 = norm([-0.3, 0.8, -0.5]), L2 = norm([0.4, -0.7, -0.4]);
const K1 = fog.map(c => 0.55 + 0.45 * c / 255), K2 = fog.map(c => 0.35 + 0.65 * (1 - c / 255)); // key tinted by palette, fill by its complement // light from behind-above the camera (view space, toward the scene is +z)
let ntri = 0;
const t0 = Date.now();
function line(x0, y0, z0, x1, y1, z1, col) {
  const dx = x1 - x0, dy = y1 - y0, n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)));
  for (let s = 0; s <= n; s++) { const t = n ? s / n : 0, x = Math.round(x0 + dx * t), y = Math.round(y0 + dy * t); if (x < 0 || y < 0 || x >= W || y >= H) continue; const z = z0 + (z1 - z0) * t; if (z <= zb[y * W + x] + 0.02) { const o = (y * W + x) * 3; img[o] = col[0]; img[o + 1] = col[1]; img[o + 2] = col[2]; } }
}
const edges = [];
for (let k = Math.max(0, Math.floor(dist) - 2); k < Math.floor(dist) + Math.ceil(fogEnd) + 3; k++) {
  const m = T.buildChunk(k);
  for (let t = 0; t < m.length; t += 9) {
    const v = [toView([m[t], m[t + 1], m[t + 2]]), toView([m[t + 3], m[t + 4], m[t + 5]]), toView([m[t + 6], m[t + 7], m[t + 8]])];
    if (v[0][2] < 0.05 || v[1][2] < 0.05 || v[2][2] < 0.05) continue;
    ntri++;
    const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]], e2 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
    let n = norm(cross(e1, e2)); // flat normal
    const zc = (v[0][2] + v[1][2] + v[2][2]) / 3;
    const zz = (m[t + 2] + m[t + 5] + m[t + 8]) / 3, xx = (m[t] + m[t + 3] + m[t + 6]) / 3, yy = (m[t + 1] + m[t + 4] + m[t + 7]) / 3;
    // pastel base colour (sine waves along the tunnel, see notes)
    const base = [
      177 + 13 * Math.sin(zz * 0.9 + xx * 4), 173 + 12 * Math.sin(zz * 0.7 + yy * 4 + 1), 168 + 11 * Math.sin(zz * 1.1 - xx * 3 + 2)];
    // two coloured lights: palette-tinted key from above, complementary fill from below (approximation)
    const nn = n[2] > 0 ? n.map(x => -x) : n; // face the camera
    const d1 = Math.max(0, nn[0] * L1[0] + nn[1] * L1[1] + nn[2] * L1[2]);
    const d2 = Math.max(0, nn[0] * L2[0] + nn[1] * L2[1] + nn[2] * L2[2]);
    const col0 = base.map((b, i) => Math.min(255, b * (0.22 + 1.1 * d1 * K1[i] + 0.9 * d2 * K2[i])));
    const fg = Math.max(0, Math.min(1, zc / fogEnd));
    const col = col0.map((b, i) => Math.round(b * (1 - fg) + fog[i] * fg));
    const wire = col.map((c, i) => Math.round(c * 0.1 * (1 - fg) + fog[i] * fg));
    const s = v.map(p => [W / 2 + p[0] / p[2] * f * H / 2, H / 2 - p[1] / p[2] * f * H / 2, p[2]]);
    const minx = Math.max(0, Math.floor(Math.min(s[0][0], s[1][0], s[2][0]))), maxx = Math.min(W - 1, Math.ceil(Math.max(s[0][0], s[1][0], s[2][0])));
    const miny = Math.max(0, Math.floor(Math.min(s[0][1], s[1][1], s[2][1]))), maxy = Math.min(H - 1, Math.ceil(Math.max(s[0][1], s[1][1], s[2][1])));
    const d = (s[1][1] - s[2][1]) * (s[0][0] - s[2][0]) + (s[2][0] - s[1][0]) * (s[0][1] - s[2][1]);
    if (Math.abs(d) < 1e-9) continue;
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5, py = y + 0.5;
      const a = ((s[1][1] - s[2][1]) * (px - s[2][0]) + (s[2][0] - s[1][0]) * (py - s[2][1])) / d;
      const b = ((s[2][1] - s[0][1]) * (px - s[2][0]) + (s[0][0] - s[2][0]) * (py - s[2][1])) / d;
      const c = 1 - a - b;
      if (a < 0 || b < 0 || c < 0) continue;
      const z = a * s[0][2] + b * s[1][2] + c * s[2][2];
      if (z < zb[y * W + x]) { zb[y * W + x] = z; const o = (y * W + x) * 3; img[o] = col[0]; img[o + 1] = col[1]; img[o + 2] = col[2]; }
    }
    edges.push(s[0], s[1], s[1], s[2], s[2], s[0], wire);
  }
}
for (let i = 0; i < edges.length; i += 7) { const a = edges[i], b = edges[i + 1]; line(a[0], a[1], a[2], b[0], b[1], b[2], edges[i + 6] || [0, 0, 0]); }
// png
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; Buffer.from(img.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1); }
function crc(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cr]); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', out, 'tris', ntri, 'ms', Date.now() - t0, 'fog', fog.join(','));
