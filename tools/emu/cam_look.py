import sys,math,json; sys.path.insert(0,'.')
import numpy as np
from monkey_emu import *
from fakedev import *
from unicorn import UC_HOOK_CODE
def trace(seed=4242, frames=400):
    m=Monkey(); m.force_seed=None; m.call(0x10002FE0, ecx=ENGINE); m.w32(m.e(0x5784),0); m.wf(m.e(0x24c4),30.0); m.seed=777; m.force_seed=seed; m.call(0x10003610, ecx=ENGINE); m.force_seed=None
    dev=FakeDevice(m,640,480,capture_draw=False)
    looks=[]
    def hook(uc,addr,size,ud):
        esp=uc.reg_read(UC_X86_REG_ESP)
        out,eye,at,up=struct.unpack('<4I',uc.mem_read(esp+4,16))
        looks.append({'eye':m.rfs(eye,3),'at':m.rfs(at,3),'up':m.rfs(up,3)})
    m.mu.hook_add(UC_HOOK_CODE,hook,begin=0x100264ba,end=0x100264ba)
    res=[]
    for fr in range(frames):
        for off,base in [(0x10,0.5),(0x14,0.4),(0x18,0.4),(0x1c,0.5),(0x20,0.4),(0x24,0.4),(0x28,0.5),(0x2c,0.4),(0x30,0.4),(0x34,0.5),(0x38,0.4),(0x3c,0.4)]:
            m.wf(m.e(off), base*(0.6+0.4*math.sin(fr*0.07+off)))
        looks.clear(); dev.calls.clear(); m.w32(m.e(0x24bc),fr); m.call(0x10003880, ecx=ENGINE, args=(0,))
        res.append({'fr':fr,'look':list(looks)})
    return res
if __name__=='__main__':
    r=trace()
    json.dump(r,open('/Users/brock/dev/monkey/decomp/cam_look.json','w'))
    print('lookAt calls per frame:',set(len(x['look']) for x in r))
    for x in r[:2]+r[100:102]: print(x['fr'],json.dumps(x['look'][0],default=float)[:300])
