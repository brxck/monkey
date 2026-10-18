"""Ground-truth dump: run the original reset + FUN_10004d30 for many segments with a forced rand seed and a simple time/distance schedule."""
import sys,json; sys.path.insert(0,'.')
from monkey_emu import *

def run(seed, nseg=60, speed=0.45, qual=0):  # speed: per-frame travel
    m=Monkey(); m.force_seed=None
    m.call(0x10002FE0, ecx=ENGINE)
    m.w32(m.e(0x5784), qual); m.wf(m.e(0x24c4),30.0)
    m.seed=777
    # FUN_10003610 = FUN_10001040(...) then FUN_10003f10(); force the seed that FUN_10003f10's srand() installs
    m.force_seed=seed
    m.call(0x10003610, ecx=ENGINE)
    m.force_seed=None
    init={'P':m.rf(m.e(0x7860)),'cp':[m.rf(m.e(0x7864)),m.rf(m.e(0x7868)),m.rf(m.e(0x786c))],'style':[m.ri32(m.e(0x7830)),m.ri32(m.e(0x7834))],
          'base':m.rfs(m.e(0x7b94),16),'rad0':m.rfs(m.e(0x8ca24),16),'Wx':[m.rf(m.e(0x7894+i*0x30)) for i in range(16)],'Wy':[m.rf(m.e(0x7898+i*0x30)) for i in range(16)],
          'rand_log_len':len(m.rand_log), 'pal':[m.rf(m.e(0x57cc)),m.rf(m.e(0x57d0)),m.rf(m.e(0x57d4))]}
    m.rand_log.clear()
    segs=[]
    T=D=0.0
    frame=0
    while len(segs)<nseg:
        # generate while needed (as the frame loop does)
        while m.ri32(m.e(0x7840)) < int(D+37.0) and len(segs)<nseg:
            m.wf(m.e(0x7844),T); m.wf(m.e(0x7848),D)
            n=m.ri32(m.e(0x7840)); mark=len(m.rand_log)
            m.call(0x10004D30, ecx=ENGINE)
            sb=seg_base(n)
            bx,by,br=blobs(m)
            segs.append({'n':n,'T':T,'D':D,'bx':bx,'by':by,'br':br,'s57c4':m.rf(m.e(0x57c4)),'s57c8':m.rf(m.e(0x57c8)),
                'bend':m.rf(sb+0xb5ec8),'ang':m.rf(sb+0xb5ec4),'h':[m.rf(m.e(0x7854)),m.rf(m.e(0x7858))],'cp':[m.rf(m.e(0x7864)),m.rf(m.e(0x7868)),m.rf(m.e(0x786c))],
                'pal':[m.rf(m.e(0x57cc)),m.rf(m.e(0x57d0)),m.rf(m.e(0x57d4))],'nrand':len(m.rand_log)-mark,
                'q1':m.rfs(sb+0xb5ecc,4),'q2':m.rfs(sb+0xb5edc,4),'splx':[m.rfs(m.e(0x7cd4+i*0x48),18) for i in range(16)],'sply':[m.rfs(m.e(0x8154+i*0x48),18) for i in range(16)]})
        T+=speed; D+=speed; frame+=1
    return init,segs

if __name__=='__main__':
    seed=int(sys.argv[1]) if len(sys.argv)>1 else 4242
    nseg=int(sys.argv[2]) if len(sys.argv)>2 else 60
    init,segs=run(seed,nseg)
    json.dump({'seed':seed,'init':init,'segs':segs},open('/Users/brock/dev/monkey/decomp/truth_%d.json'%seed,'w'))
    print('init P',init['P'],'cp',init['cp'],'style',init['style'],'rand calls in init (after reseed)',init['rand_log_len'])
    for s in segs[:3]+segs[-2:]: print(s['n'],'blob0',round(s['bx'][0],4),round(s['by'][0],4),round(s['br'][0],4),'57c4',round(s['s57c4'],3),'bend',round(s['bend'],5),'ang',round(s['ang'],3),'nrand',s['nrand'])
