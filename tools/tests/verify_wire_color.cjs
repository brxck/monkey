// wireframe-pass colour vs the emulated original (decomp/wire_truth.json from tools/emu/wirecap.py)
const { Original } = require('../../web/monkey-orig.js'), d = require('../../decomp/wire_truth.json');
const O = new Original(1); let worst = 0;
for (const dark of [0, 1]) for (const o of d[dark]) {
  O.T = o.T; O.P = o.P; const w = O.wireColor(!!dark), tf = o.tf[o.tf.length - 1];
  const t = [(tf >>> 16) & 255, (tf >>> 8) & 255, tf & 255];
  for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(Math.round(w[i] * 255) - t[i]));
}
console.log('wire colour max byte error', worst); process.exit(worst <= 1 ? 0 : 1);
