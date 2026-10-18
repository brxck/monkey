import sys,math; sys.path.insert(0,'.')
import numpy as np
from monkey_emu import *
from fakedev import *
m=Monkey(); init_scene(m,seed=4242) if False else None
import gen_truth
# set up like gen_truth
m.force_seed=None; m.call(0x10002FE0, ecx=ENGINE); m.w32(m.e(0x5784),0); m.wf(m.e(0x24c4),30.0); m.seed=777; m.force_seed=4242; m.call(0x10003610, ecx=ENGINE); m.force_seed=None
dev=FakeDevice(m,640,480)
for off,v in [(0x10,0.5),(0x14,0.4),(0x18,0.4),(0x1c,0.5),(0x20,0.4),(0x24,0.4),(0x28,0.5),(0x2c,0.4),(0x30,0.4),(0x34,0.5),(0x38,0.4),(0x3c,0.4)]: m.wf(m.e(off),v)
# run a few frames to advance
for fr in range(5):
    dev.calls.clear(); m.w32(m.e(0x24bc),fr); m.call(0x10003880, ecx=ENGINE, args=(0,))
W=[np.array(c['mat']).reshape(4,4) for c in dev.calls if c['m']=='SetTransform' and c['a'][0]==256]
D=m.rf(m.e(0x7848)); n=m.ri32(m.e(0x7840)); print('D',D,'floor',int(D),'segs generated',n,'num world mats',len(W))
f0=int(D)
def seg(j):
    sb=seg_base(j); return {'x':m.rf(sb+0xb5eb4),'y':m.rf(sb+0xb5eb8),'ang':m.rf(sb+0xb5ec4),'bend':m.rf(sb+0xb5ec8),'q1':m.rfs(sb+0xb5ecc,4),'q2':m.rfs(sb+0xb5edc,4)}
np.set_printoptions(precision=5,suppress=True,linewidth=140)
for i in range(0,4):
    A=np.linalg.inv(W[i])@W[i+1]
    s=seg(f0+i)
    print('i',i,'seg',f0+i,'bend',round(s['bend'],5),'ang',round(s['ang'],3),'x,y',round(s['x'],4),round(s['y'],4))
    print(A)
print('W[0]'); print(W[0]); print('W[33]'); print(W[33])

print('=========== J_j = W_{j+1} W_j^-1')
def quat_from_rot(R):
    # R is 3x3 row-vector convention (v' = v R). return axis*angle
    Rm=R.T
    ang=math.acos(max(-1,min(1,(np.trace(Rm)-1)/2)))
    if ang<1e-9: return np.zeros(3)
    ax=np.array([Rm[2,1]-Rm[1,2],Rm[0,2]-Rm[2,0],Rm[1,0]-Rm[0,1]])/(2*math.sin(ang))
    return ax*ang
for i in range(0,6):
    J=W[i+1]@np.linalg.inv(W[i])
    s=seg(f0+i)
    rv=quat_from_rot(J[:3,:3])
    print('j',i,'seg',f0+i,'rotvec',np.round(rv,6),'|rv|',round(float(np.linalg.norm(rv)),6),'trans',np.round(J[3,:3],5),' | seg bend',round(s['bend'],6),'ang',round(s['ang'],4),'q1',np.round(s['q1'],5),'q2',np.round(s['q2'],5),'x,y',round(s['x'],4),round(s['y'],4))

print('=========== full table')
allseg=[seg(j) for j in range(0,n)]
print('seg: idx bend ang  | ',' '.join('%d:%.4f'%(j,allseg[j]['bend']) for j in range(0,n)))
rows=[]
for i in range(33):
    J=W[i+1]@np.linalg.inv(W[i]); rv=quat_from_rot(J[:3,:3])
    rows.append((i,float(np.linalg.norm(rv)),math.atan2(rv[1],rv[0])))
print('J: i |rv| dir  | ',' '.join('%d:%.4f/%.2f'%r for r in rows[:34]))
print('seg ang list', ' '.join('%d:%.2f'%(j,allseg[j]['ang']) for j in range(n)))
