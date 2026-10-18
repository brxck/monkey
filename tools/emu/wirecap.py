import sys,json; sys.path.insert(0,'/Users/brock/dev/monkey/tools/emu')
from monkey_emu import *
from fakedev import *
res={}
for dark in (0,1):
    m=Monkey(); m.force_seed=None; m.call(0x10002FE0, ecx=ENGINE); m.w32(m.e(0x5784),0); m.wf(m.e(0x24c4),30.0); m.seed=777; m.force_seed=4242; m.call(0x10003610, ecx=ENGINE); m.force_seed=None
    m.w32(m.e(0x85e8),1); m.w32(m.e(0x85dc),dark)
    dev=FakeDevice(m,640,480,capture_draw=False); out=[]
    for fr in range(0,2600):
        dev.calls.clear(); m.w32(m.e(0x24bc),fr); m.call(0x10003880, ecx=ENGINE, args=(0,))
        tf=[c['a'][1] for c in dev.calls if c['m']=='SetRenderState' and c['a'][0]==60]
        if fr%20==0: out.append({'fr':fr,'T':m.rf(m.e(0x7844)),'P':m.rf(m.e(0x7860)),'tf':tf})
        # advance simulation a bit so T moves: the scene update advances T each call
    res[dark]=out
json.dump(res,open('/Users/brock/dev/monkey/decomp/wire_truth.json','w'))
print(res[0][5],res[1][5])
