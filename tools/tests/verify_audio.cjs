// Compares the audio analysis + beat detector port with the emulated original (decomp/audio_truth.json, made by tools/emu/audio_truth.py).
const { Original } = require('../../web/monkey-orig.js');
const truth = require('../../decomp/audio_truth.json');
let ok = true;
for (const scn of ['A', 'B']) {
  const O = new Original(1); O.fps = 30;
  let eB = 0, eA = 0, eT = 0, beatMis = 0, stMis = 0, beats = 0, specE = 0;
  for (const t of truth[scn]) {
    O.analyze(t.L);
    if (scn === 'B' && t.f >= 90 && (t.f - 90) % 120 === 0) O.bd = { state: 1, thr: 1, fc: Math.fround(1.3), last: Math.fround(1.5) };
    let beat = false; if (t.f >= 90) beat = O.beatDetect();
    for (let b = 0; b < 3; b++) {
      eB = Math.max(eB, Math.abs(O.band[b] - t.bands[b]) / (Math.abs(t.bands[b]) + 1e-3));
      eA = Math.max(eA, Math.abs(O.avgF[b] - t.avgF[b]) / (Math.abs(t.avgF[b]) + 1e-3), Math.abs(O.avg2[b] - t.avg2[b]) / (Math.abs(t.avg2[b]) + 1e-3));
      eT = Math.max(eT, Math.abs(O.avgL[b] - t.avgL[b]) / (Math.abs(t.avgL[b]) + 1e-3));
    }
    if (beat !== !!t.beat) beatMis++;
    if (O.bd.state !== t.st[0] || Math.abs(O.bd.thr - t.st[1]) > 1e-3 * (1 + Math.abs(t.st[1]))) stMis++;
    if (beat) beats++;
  }
  console.log(scn, 'beats', beats, 'max rel err band', eB.toExponential(2), 'avg', eA.toExponential(2), 'long', eT.toExponential(2), 'beat mismatches', beatMis, 'state mismatches', stMis);
  if (eB > 1e-3 || beatMis || stMis > 0) ok = false;
}
console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
