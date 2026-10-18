// hair geometry + colour vs the emulated original (decomp/hair_truth.json from tools/emu/hair_truth.py)
const { Original } = require('../../web/monkey-orig.js'), d = require('../../decomp/hair_truth.json');
const O = new Original(4242); O.hairIdx = 0;
let worst = 0, mism = 0, total = 0, idxBad = 0;
const segs = {};
for (let f = 0; f < 30; f++) { O.genSegment(); const s = O.ring[(O.n - 1) % 34]; segs[s.n] = s; }
for (const t of d.segs) {
  const s = segs[t.n]; if (!s || t.n < 2) continue;
  const mine = s.mesh.hair, nh = mine.length / 6;
  if (nh !== t.nh) { mism++; continue; }
  for (let i = 0; i < nh; i++) { total++; for (let j = 0; j < 6; j++) worst = Math.max(worst, Math.abs(mine[6 * i + j] - t.hair[i][j])); }
}
console.log('segments with hair count mismatch/unmatched', mism, 'hairs compared', total, 'max abs error', worst.toExponential(2));
let cw = 0;
for (const o of d.tf) { O.T = o.T; O.P = o.P; const h = O.hairColor(), tf = o.tf[o.tf.length - 1]; const t = [(tf >>> 16) & 255, (tf >>> 8) & 255, tf & 255];
  for (let i = 0; i < 3; i++) cw = Math.max(cw, Math.abs(Math.round(h[i] * 255) - t[i])); if ((tf >>> 24) !== 0x58) cw = 99; }
console.log('hair colour max byte error', cw);
process.exit(mism === 0 && worst < 2e-3 && cw <= 1 ? 0 : 1);
