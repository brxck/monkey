"""Ground truth for the wire-pass vertex offset ('underground' style): solid + wire vertex arrays per segment.
usage: python under_truth.py -> ../../decomp/under_truth.json"""
import sys, json
sys.path.insert(0, '/Users/brock/dev/monkey/tools/emu')
from monkey_emu import *
import numpy as np
out = {}
for under in (0, 1):
    m = Monkey(); m.force_seed = None; m.call(0x10002FE0, ecx=ENGINE); m.w32(m.e(0x5784), 0); m.wf(m.e(0x24c4), 30.0)
    m.seed = 777; m.force_seed = 4242; m.call(0x10003610, ecx=ENGINE); m.force_seed = None
    m.w32(m.e(0x85e8), 1); m.w32(m.e(0x85ec), under)
    segs = []
    for k in range(30):
        i = gen_segment(m); sb = seg_base(i); n = m.ri32(m.e(0x2f99c))
        solid = np.frombuffer(m.rb(sb + 0x906a4, 32 * n), dtype='<f4').reshape(n, 8)[:, :3]
        wire = np.frombuffer(m.rb(sb + 0x9f6a4, 16 * n), dtype='<f4').reshape(n, 4)[:, :3]
        nodes = np.array(m.rfs(m.e(0x2f9a4), 12 * n)).reshape(n, 12)
        segs.append({'n': i, 'solid': solid.tolist(), 'wire': wire.tolist(), 'node': nodes[:, :6].tolist(),
                     'T': m.rf(m.e(0x7844)), 'D': m.rf(m.e(0x7848)), 'P': m.rf(m.e(0x7860))})
    out[under] = segs
json.dump(out, open('/Users/brock/dev/monkey/decomp/under_truth.json', 'w'))
print('ok')
