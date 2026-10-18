import sys; sys.path.insert(0,'.')
from monkey_emu import *
from fakedev import *
m=Monkey(); init_scene(m)
dev=FakeDevice(m,640,480)
# feed plausible audio-analysis values (bass/mid/treb and smoothed), as the audio step would
for off,v in [(0x10,0.5),(0x14,0.4),(0x18,0.4),(0x1c,0.5),(0x20,0.4),(0x24,0.4),(0x28,0.5),(0x2c,0.4),(0x30,0.4),(0x34,0.5),(0x38,0.4),(0x3c,0.4)]: m.wf(m.e(off),v)
m.wf(m.e(0x24c4),30.0)
for fr in range(3):
    dev.calls.clear()
    m.w32(m.e(0x24bc),fr)
    m.call(0x10003880, ecx=ENGINE, args=(0,))
    names=[c['m'] for c in dev.calls]
    import collections
    print('frame',fr,'dist',m.rf(m.e(0x7848)),'segs',m.ri32(m.e(0x7840)),'speed',m.rf(m.e(0x57a8)),dict(collections.Counter(names)))
for c in dev.calls:
    if c['m']=='SetTransform': print(c['a'][0],[round(x,4) for x in c['mat']])
