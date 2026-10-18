import sys,struct,math,json; sys.path.insert(0,'/Users/brock/dev/monkey/tools/emu')
from monkey_emu import *
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import *
import numpy as np
m=Monkey(); m.force_seed=None; m.call(0x10002FE0, ecx=ENGINE); m.w32(m.e(0x5784),0); m.wf(m.e(0x24c4),30.0); m.seed=777; m.force_seed=4242; m.call(0x10003610, ecx=ENGINE); m.force_seed=None
m.w32(m.e(0x85e0),1); m.w32(m.e(0x85e4),1)
cap={}
SL=[0x4c,0x1c,0x18,0x14,0x20,0x28,0x30,0x34,0x38,0x3c,0x40,0x44,0x48,0x54,0x58,0x5c,0x64,0x78,0x80,0x84,0x88,0x8c,0x90,0xa0,0xa4,0xa8,0xb0,0xb4,0xb8,0x9c,0xbc,0xc0]
def hook(uc,addr,size,ud):
    esi=uc.reg_read(UC_X86_REG_ESI)
    if esi!=ENGINE+0x2f9b0: return
    esp=uc.reg_read(UC_X86_REG_ESP)
    cap['P']=m.rf(m.e(0x7860)); cap['s']={hex(o):m.rf(esp+o) for o in SL}
    cap['x87']=[uc.reg_read(r) for r in ()]
m.mu.hook_add(UC_HOOK_CODE,hook,begin=0x10005ac2,end=0x10005ac2)
out=[]
for k in range(40):
    cap.clear(); i=gen_segment(m)
    n=m.ri32(m.e(0x2f99c)); nodes=np.array(m.rfs(m.e(0x2f9a4),12*n)).reshape(n,12)
    sb=seg_base(i)
    raw=m.rb(sb+0x906a4,32*n); cols=np.frombuffer(raw,dtype='<u4').reshape(n,8)[:,3]
    out.append({'seg':i,'slots':cap['s'],'nodes':nodes.tolist(),'cols':cols.tolist(),'P':cap['P'],'n':i,'phase':[m.rf(m.e(0x7864)),m.rf(m.e(0x7868)),m.rf(m.e(0x786c))]})
json.dump(out,open('/Users/brock/dev/monkey/decomp/col_truth_err_4242.json','w'))
print(out[3]['slots']); print(out[3]['cols'][:4])
