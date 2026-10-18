import sys,json; sys.path.insert(0,'.')
from monkey_emu import *
m=Monkey(); init_scene(m)
out=[]
for k in range(8):
    i=gen_segment(m); sb=seg_base(i)
    bx,by,br=blobs(m)
    nv=m.ri32(sb+0x8d398); nt=m.ri32(sb+0x8d39c)
    raw=m.rb(sb+0x906a4, nv*32)
    verts=[struct.unpack_from('<3f',raw,32*v) for v in range(nv)]
    idx=list(struct.unpack('<%dH'%(3*nt), m.rb(sb+0x8d3a4, 6*nt)))
    out.append({'seg':i,'bx':bx,'by':by,'br':br,'nv':nv,'nt':nt,'verts':verts[:400],'idx':idx[:1200]})
    print(i,nv,nt,'blob0',round(bx[0],4),round(by[0],4),round(br[0],4),'vert0',[round(x,3) for x in verts[0]])
json.dump(out,open('/Users/brock/dev/monkey/decomp/emu_segs.json','w'))
