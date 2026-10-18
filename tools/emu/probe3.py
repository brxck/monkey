import sys; sys.path.insert(0,'.')
from monkey_emu import *
from fakedev import *
import collections
m=Monkey(); init_scene(m)
dev=FakeDevice(m,640,480)
for off,v in [(0x10,0.5),(0x14,0.4),(0x18,0.4),(0x1c,0.5),(0x20,0.4),(0x24,0.4),(0x28,0.5),(0x2c,0.4),(0x30,0.4),(0x34,0.5),(0x38,0.4),(0x3c,0.4)]: m.wf(m.e(off),v)
m.call(0x10003880, ecx=ENGINE, args=(0,))
st=[c for c in dev.calls if c['m']=='SetTransform']
print('transform states in order:',[c['a'][0] for c in st][:8],'... total',len(st))
for c in st:
    if c['a'][0] in (2,3): print('state',c['a'][0],[round(x,4) for x in c['mat']])
rs=[(c['a'][0],c['a'][1]) for c in dev.calls if c['m']=='SetRenderState']
print('first renderstates', rs[:30])
print('draws',sum(1 for c in dev.calls if c['m']=='DrawIndexedPrimitiveUP'))
