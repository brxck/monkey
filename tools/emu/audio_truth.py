"""Ground truth for the original's audio analysis (FUN_100147a0) and beat detector (FUN_1000b080) on synthetic waveforms.
usage: python audio_truth.py  -> ../../decomp/audio_truth.json
Scenario A: plugin defaults (detector enabled after a quiet warm-up). Scenario B: same audio but the detector state is preset
(re-armed every 120 frames: waiting for a rise, threshold 1.0) so that many beats / state changes occur."""
import sys, json, math, random
sys.path.insert(0, '/Users/brock/dev/monkey/tools/emu')
from monkey_emu import *

BUF = 0x30000000 + 0x1F000000   # inside the mapped heap, above anything the bump allocator reaches
m = Monkey(); m.force_seed = None
m.call(0x10002FE0, ecx=ENGINE); m.wf(m.e(0x24c4), 30.0)
m.call(0x10011E80, ecx=ENGINE + 0x5750, args=(0x240, 0x200))   # FFT object (576 in, 1024-point)


def make_wave(rnd, amp_of, f):
    t0 = f / 30.0
    quiet = f < 90
    g = 0.0 if quiet else 1.0
    L = []; R = []
    for i in range(576):
        t = t0 + i / 44100.0
        beat = (t * 2.0) % 1.0
        bi = int(t * 2.0)
        if bi not in amp_of: amp_of[bi] = rnd.choice([0.0, 0.1, 0.3, 1.0, 1.4]) * (1.0 + 0.5 * (bi // 20))
        kick = g * math.exp(-beat * 9) * math.sin(2 * math.pi * 55 * t) * 90 * amp_of[bi]
        hat = g * (rnd.random() - 0.5) * 40 * math.exp(-((t * 4.0) % 1.0) * 14)
        mid = g * math.sin(2 * math.pi * 440 * t) * 25 * (1 + math.sin(t * 3))
        L.append(int(max(-128, min(127, kick + hat + mid + rnd.gauss(0, 3 if quiet else 6)))))
        R.append(int(max(-128, min(127, kick * 0.8 + hat + mid * 0.5 + rnd.gauss(0, 3 if quiet else 6)))))
    return L, R


def run(preset):
    for o in range(0x10, 0x44, 4): m.w32(m.e(o), 0)
    m.w32(m.e(0x5f54f0), 0); m.w32(m.e(0x5f54f4), 1); m.wf(m.e(0x5f54f8), 5.0); m.wf(m.e(0x5f54fc), 1.3); m.wf(m.e(0x5f5500), 1.3)
    rnd = random.Random(5); amp_of = {}
    out = []
    for f in range(1500):
        L, R = make_wave(rnd, amp_of, f)
        m.mu.mem_write(BUF, bytes((v & 255) for v in L) + bytes((v & 255) for v in R))
        m.call(0x100147A0, ecx=ENGINE, args=(BUF, BUF + 576))
        rec = {'f': f, 'L': L, 'R': R, 'bands': m.rfs(m.e(0x10), 3), 'avgF': m.rfs(m.e(0x1c), 3), 'avg2': m.rfs(m.e(0x28), 3),
               'avgL': m.rfs(m.e(0x34), 3), 'spec': m.rfs(m.e(0x124c), 256)}
        if preset and f >= 90 and (f - 90) % 120 == 0:   # re-arm the detector now and then
            m.w32(m.e(0x5f54f4), 1); m.wf(m.e(0x5f54f8), 1.0); m.wf(m.e(0x5f54fc), 1.3); m.wf(m.e(0x5f5500), 1.5)
        if f >= 90: m.call(0x1000B080, ecx=ENGINE)   # detector enabled after a quiet warm-up
        rec['beat'] = m.ri32(m.e(0x5f54f0))
        rec['st'] = [m.ri32(m.e(0x5f54f4)), m.rf(m.e(0x5f54f8)), m.rf(m.e(0x5f54fc)), m.rf(m.e(0x5f5500))]
        if f % 25: rec['spec'] = rec['spec'][:16]
        out.append(rec)
        m.w32(m.e(0x5f54f0), 0)    # the scene update consumes (clears) the flag
    return out


res = {'A': run(False), 'B': run(True)}
json.dump(res, open('/Users/brock/dev/monkey/decomp/audio_truth.json', 'w'))
for k, v in res.items(): print(k, 'beats at', [o['f'] for o in v if o['beat']][:40])
