import sys,math,json; sys.path.insert(0,'.')
import numpy as np
from monkey_emu import *
from fakedev import *
def trace(seed=4242, frames=400, bass=0.4):
    m=Monkey(); m.force_seed=None; m.call(0x10002FE0, ecx=ENGINE); m.w32(m.e(0x5784),0); m.wf(m.e(0x24c4),30.0); m.seed=777; m.force_seed=seed; m.call(0x10003610, ecx=ENGINE); m.force_seed=None
    dev=FakeDevice(m,640,480,capture_draw=False)
    out=[]
    for fr in range(frames):
        # synthetic audio features: slowly varying
        for off,base in [(0x10,0.5),(0x14,0.4),(0x18,0.4),(0x1c,0.5),(0x20,0.4),(0x24,0.4),(0x28,0.5),(0x2c,0.4),(0x30,0.4),(0x34,0.5),(0x38,0.4),(0x3c,0.4)]:
            m.wf(m.e(off), base*(0.6+0.4*math.sin(fr*0.07+off)))
        pre7804=m.rf(m.e(0x7804)); pre7850=m.rf(m.e(0x7850)); pre785c=m.rf(m.e(0x785c)); dev.calls.clear(); m.w32(m.e(0x24bc),fr); m.call(0x10003880, ecx=ENGINE, args=(0,))
        W=[np.array(c['mat']).reshape(4,4) for c in dev.calls if c['m']=='SetTransform' and c['a'][0]==256]
        proj=[np.array(c['mat']).reshape(4,4) for c in dev.calls if c['m']=='SetTransform' and c['a'][0]==3]
        D=m.rf(m.e(0x7848)); T=m.rf(m.e(0x7844))
        W0=W[0]; right=W0[:3,0]; up=W0[:3,1]; fwd=W0[:3,2]; t=W0[3,:3]
        eye=-(t[0]*right+t[1]*up+t[2]*fwd)
        f0=int(D); ring={k:{'x':m.rf(seg_base(k)+0xb5eb4),'y':m.rf(seg_base(k)+0xb5eb8),'ang':m.rf(seg_base(k)+0xb5ec4),'bend':m.rf(seg_base(k)+0xb5ec8)} for k in range(max(0,f0),f0+20) if k<m.ri32(m.e(0x7840))}
        out.append({'pre7804':pre7804,'pre7850':pre7850,'pre785c':pre785c,'ring':ring,'fr':fr,'D':D,'T':T,'n':m.ri32(m.e(0x7840)),'speed':m.rf(m.e(0x57a8)),'eye':eye.tolist(),'right':right.tolist(),'up':up.tolist(),'fwd':fwd.tolist(),'fov':[proj[0][0,0],proj[0][1,1]],'W0':W0.tolist(),'Wlast':W[-1].tolist(),
                    's57c4':m.rf(m.e(0x57c4)),'s57b8':m.rf(m.e(0x57b8)),'s57bc':m.rf(m.e(0x57bc)),'s860c':m.rf(m.e(0x860c)),'fps':m.rf(m.e(0x24c4)),'s57a8':m.rf(m.e(0x57a8)),'e10c':m.rf(m.e(0x784c)),'e7850':m.rf(m.e(0x7850)),'z7860':m.rf(m.e(0x7860)),'s7804':m.rf(m.e(0x7804)),'s785c':m.rf(m.e(0x785c))})
    return out
if __name__=='__main__':
    o=trace()
    json.dump(o,open('/Users/brock/dev/monkey/decomp/cam_trace.json','w'))
    for r in o[:3]+o[100:102]+o[-2:]:
        print(r['fr'],'D=%.3f speed=%.3f'%(r['D'],r['speed']),'eye',np.round(r['eye'],4),'fwd',np.round(r['fwd'],4),'up',np.round(r['up'],4),'fov',np.round(r['fov'],3))
