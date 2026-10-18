import sys,math,json; sys.path.insert(0,'.')
import numpy as np
from monkey_emu import *
from fakedev import *
from unicorn import UC_HOOK_CODE
def run(seed=4242, frames=300):
    m=Monkey(); m.force_seed=None; m.call(0x10002FE0, ecx=ENGINE); m.w32(m.e(0x5784),0); m.wf(m.e(0x24c4),30.0); m.seed=777; m.force_seed=seed; m.call(0x10003610, ecx=ENGINE); m.force_seed=None
    dev=FakeDevice(m,640,480,capture_draw=False)
    looks=[]
    def hook(uc,addr,size,ud):
        esp=uc.reg_read(UC_X86_REG_ESP); out,eye,at,up=struct.unpack('<4I',uc.mem_read(esp+4,16))
        looks.append({'eye':m.rfs(eye,3),'at':m.rfs(at,3),'up':m.rfs(up,3)})
    m.mu.hook_add(UC_HOOK_CODE,hook,begin=0x100264ba,end=0x100264ba)
    out=[]
    for fr in range(frames):
        for off in (0x10,0x14,0x18,0x1c,0x20,0x24,0x28,0x2c,0x30,0x34,0x38,0x3c): m.wf(m.e(off),0.0)
        looks.clear(); dev.calls.clear(); m.w32(m.e(0x24bc),fr); m.call(0x10003880, ecx=ENGINE, args=(0,))
        W=[c['mat'] for c in dev.calls if c['m']=='SetTransform' and c['a'][0]==256]
        P=[c['mat'] for c in dev.calls if c['m']=='SetTransform' and c['a'][0]==3][0]
        out.append({'fr':fr,'T':m.rf(m.e(0x7844)),'D':m.rf(m.e(0x7848)),'speed':m.rf(m.e(0x57a8)),'n':m.ri32(m.e(0x7840)),'s7804':m.rf(m.e(0x7804)),'s7850':m.rf(m.e(0x7850)),'s785c':m.rf(m.e(0x785c)),
                    'look':looks[0],'proj':P,'W0':W[0],'W17':W[17],'W33':W[33],'style1':m.ri32(m.e(0x7830)),'randcount':len(m.rand_log)})
    return out
if __name__=='__main__':
    seed=int(sys.argv[1]) if len(sys.argv)>1 else 4242
    out=run(seed, int(sys.argv[2]) if len(sys.argv)>2 else 300)
    json.dump(out,open('/Users/brock/dev/monkey/decomp/cam_truth_%d.json'%seed,'w'))
    print('frames',len(out),'last D',out[-1]['D'],'n',out[-1]['n'],'fov',2*math.atan(1/out[-1]['proj'][5]))
