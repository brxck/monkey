// wire-pass vertex offset (compares the displacement solid-wire) (normal and "underground") vs the emulated original (decomp/under_truth.json from tools/emu/under_truth.py)
const { Original } = require('../../web/monkey-orig.js'), d = require('../../decomp/under_truth.json');
let worst = 0, cnt = 0; const per = [0, 0];
for (const under of [0, 1]) {
  const O = new Original(4242); const segs = {};
  for (let f = 0; f < 30; f++) { O.genSegment(); const s = O.ring[(O.n - 1) % 34]; segs[s.n] = s; }
  for (const t of d[under]) {
    const s = segs[t.n]; if (!s || t.n < 2) continue;
    const m = s.mesh, key = (a, b, c) => [a, b, c].map(x => Math.round(x * 4096)).join(','), idx = new Map();
    for (let k = 0; k < m.pos0.length / 3; k++) idx.set(key((m.pos0[3 * k] + 1) / 2, (m.pos0[3 * k + 1] + 1) / 2, 1 - m.pos0[3 * k + 2]), k);
    for (let i = 0; i < t.node.length; i++) {
      const k = idx.get(key(t.node[i][0], t.node[i][1], t.node[i][2])); if (k === undefined) continue;
      const nx = m.nrm[3 * k], ny = m.nrm[3 * k + 1], nz = m.nrm[3 * k + 2];
      const f = under ? (nz - m.meanNz - 0.21 < 0 ? -3 * m.wireBase : 10 * m.wireBase) : 0.002;
      const w = [m.pos[3 * k] - f * nx, m.pos[3 * k + 1] - f * ny, m.pos[3 * k + 2] - 2 * f * nz];
      for (let j = 0; j < 3; j++) { const e = Math.abs((m.pos[3 * k + j] - w[j]) - (t.solid[i][j] - t.wire[i][j])); worst = Math.max(worst, e); per[under] = Math.max(per[under], e); } cnt++;
    }
  }
}
console.log('per mode', per.map(x => x.toExponential(2)).join(' '), 'compared', cnt, 'wire vertices, max abs error', worst.toExponential(2)); process.exit(worst < 2e-4 ? 0 : 1);
