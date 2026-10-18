"""Ground truth for the hair pass: colour (TEXTUREFACTOR) over time, and per-segment hair geometry (root/tip) read from the segment hair arrays.
usage: python hair_truth.py -> ../../decomp/hair_truth.json"""
import sys, json
sys.path.insert(0, '/Users/brock/dev/monkey/tools/emu')
from monkey_emu import *
from fakedev import *
import numpy as np
def setup():
    m = Monkey(); m.force_seed = None; m.call(0x10002FE0, ecx=ENGINE); m.w32(m.e(0x5784), 0); m.wf(m.e(0x24c4), 30.0)
    m.seed = 777; m.force_seed = 4242; m.call(0x10003610, ecx=ENGINE); m.force_seed = None
    return m
out = {'tf': [], 'segs': []}
m = setup(); m.w32(m.e(0x85f0), 1)
dev = FakeDevice(m, 640, 480, capture_draw=False)
for fr in range(2600):
    dev.calls.clear(); m.w32(m.e(0x24bc), fr); m.call(0x10003880, ecx=ENGINE, args=(0,))
    if fr % 20 == 0:
        tf = [c['a'][1] for c in dev.calls if c['m'] == 'SetRenderState' and c['a'][0] == 60]
        out['tf'].append({'fr': fr, 'T': m.rf(m.e(0x7844)), 'P': m.rf(m.e(0x7860)), 'tf': tf, 'idx7800': m.ri32(m.e(0x7800))})
m = setup()
print('7800 initial', m.ri32(m.e(0x7800)), '85f4', m.rf(m.e(0x85f4)), '5788', m.ri32(m.e(0x5788)))
for k in range(30):
    idx0 = m.ri32(m.e(0x7800))
    i = gen_segment(m); sb = seg_base(i); n = m.ri32(m.e(0x2f99c)); nh = m.ri32(sb + 0x8d3a0)
    hair = np.frombuffer(m.rb(sb + 0xa6ea4, 32 * nh), dtype='<f4').reshape(nh, 8)[:, [0, 1, 2, 4, 5, 6]]
    nodes = np.array(m.rfs(m.e(0x2f9a4), 12 * n)).reshape(n, 12)
    solid = np.frombuffer(m.rb(sb + 0x906a4, 32 * n), dtype='<f4').reshape(n, 8)[:, :3]
    out['segs'].append({'n': i, 'idx0': idx0, 'idx1': m.ri32(m.e(0x7800)), 'nh': nh, 'hair': hair.tolist(), 'node': nodes[:, :6].tolist(), 'solid': solid.tolist(),
                        'T': m.rf(m.e(0x7844)), 'D': m.rf(m.e(0x7848)), 'P': m.rf(m.e(0x7860))})
json.dump(out, open('/Users/brock/dev/monkey/decomp/hair_truth.json', 'w'))
print('ok', [s['nh'] for s in out['segs']][:10], [(s['idx0'], s['idx1']) for s in out['segs']][:4])
