import sys,math,json; sys.path.insert(0,'.')
import numpy as np
from monkey_emu import *
from fakedev import *
m=Monkey(); m.force_seed=None; m.call(0x10002FE0, ecx=ENGINE); m.w32(m.e(0x5784),0); m.wf(m.e(0x24c4),30.0); m.seed=777; m.force_seed=4242; m.call(0x10003610, ecx=ENGINE); m.force_seed=None
dev=FakeDevice(m,640,480,capture_draw=False)
for off,v in [(0x10,0.5),(0x14,0.4),(0x18,0.4),(0x1c,0.5),(0x20,0.4),(0x24,0.4),(0x28,0.5),(0x2c,0.4),(0x30,0.4),(0x34,0.5),(0x38,0.4),(0x3c,0.4)]: m.wf(m.e(off),v)
for fr in range(60):
    dev.calls.clear(); m.w32(m.e(0x24bc),fr); m.call(0x10003880, ecx=ENGINE, args=(0,))
W=[np.array(c['mat']).reshape(4,4) for c in dev.calls if c['m']=='SetTransform' and c['a'][0]==256]
D=m.rf(m.e(0x7848)); cs=int(D)+3
def seg(k):
    sb=seg_base(k); return m.rf(sb+0xb5ec4),m.rf(sb+0xb5ec8),m.rfs(sb+0xb5ecc,4),m.rfs(sb+0xb5edc,4)
def quatmat(q):
    x,y,z,w=q
    return np.array([[1-2*y*y-2*z*z, 2*x*y+2*z*w, 2*x*z-2*y*w],[2*x*y-2*z*w, 1-2*x*x-2*z*z, 2*y*z+2*x*w],[2*x*z+2*y*w, 2*y*z-2*x*w, 1-2*x*x-2*y*y]])
def J(q,transpose,order):
    R=quatmat(q); R=R.T if transpose else R
    M=np.eye(4); M[:3,:3]=R
    Tm=np.eye(4); Tm[3,2]=1.0
    return M@Tm if order=='RT' else Tm@M
best=[]
for qi,qn in ((2,'q1'),(3,'q2')):
    for tr in (0,1):
        for order in ('RT','TR'):
            err=0
            for i in range(33):
                ang,bend,q1,q2=seg(cs+i); q=(q1,q2)[qi-2]
                Jm=J(q,tr,order)
                # W_{i+1} = J W_i
                err=max(err,np.abs(W[i+1]-Jm@W[i]).max())
            best.append((err,qn,tr,order))
for b in sorted(best)[:6]: print('max err %.2e using %s transpose=%d order=%s'%b)
