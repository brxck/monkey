import json,math,numpy as np
o=json.load(open('/Users/brock/dev/monkey/decomp/cam_trace.json'))
f32=lambda x: float(np.float32(x))
def feats(r):
    D=r['D']; V=f32(D+37.0); i9=int(V); fr=f32(V-i9); cs=int(D)+3
    R={int(k):v for k,v in r['ring'].items()}
    g=lambda k,key: R[cs+k][key]
    L=lambda key,k:(1-fr)*g(k,key)+fr*g(k+1,key)
    A0x=2*L('x',0)-1; A0y=2*L('y',0)-1; TX0=2*L('x',6)-1; TY0=2*L('y',6)-1
    return D,fr,cs,g,L,A0x,A0y,TX0,TY0
errs=[]
for r in o[5:]:
    D,fr,cs,g,L,A0x,A0y,TX0,TY0=feats(r)
    f4=((g(4,'x')-g(9,'x'))*(1-fr)+(g(6,'x')-g(11,'x'))*fr)-(math.cos(g(5,'ang'))*g(5,'bend')*fr+math.cos(g(4,'ang'))*g(4,'bend')*(1-fr))*6.5
    f4b=((g(4,'x')-g(9,'x'))*(1-fr)+(g(6,'x')-g(11,'x'))*fr)-(math.cos(g(5,'ang'))*g(5,'bend')*(1-fr)+math.cos(g(4,'ang'))*g(4,'bend')*fr)*6.5
    errs.append((abs(f4-r['e10c']),abs(f4b-r['e10c'])))
e=np.array(errs); print('f4 max err (variant a, variant b):',e.max(axis=0),' mean',e.mean(axis=0))
# smoothed heading angle E7850
res=[]
prev=0.0
for r in o[5:]:
    D,fr,cs,g,L,A0x,A0y,TX0,TY0=feats(r)
    f4=r['e10c']
    At=math.atan2(2*f4*7.5*(r['s860c']**0.8),1.0)
    s1=(0.86**r['s57a8'])*0.5+0.43
    s2=s1**(14.0/r['fps'])
    new=s2*r['pre7850']+(1-s2)*At
    res.append(abs(new-r['e7850']))
print('E7850 max err',max(res),'mean',np.mean(res))

print('--- per-frame E7850 errors')
rows=[]
for r in o[:400]:
    D,fr,cs,g,L,A0x,A0y,TX0,TY0=feats(r) if r['fr']>=0 else None
    f4=r['e10c']; At=math.atan2(2*f4*7.5*(r['s860c']**0.8),1.0)
    s1=(0.86**r['s57a8'])*0.5+0.43; s2=s1**(14.0/r['fps'])
    new=s2*r['pre7850']+(1-s2)*At
    rows.append((r['fr'],new-r['e7850'],At,r['e7850'],r['pre7850'],s2,r['fps']))
for x in rows[:6]+rows[100:104]+rows[300:304]: print('fr %d err %.5f At %.5f E7850 %.5f pre %.5f s2 %.4f fps %.2f'%x)

print('--- solve actual s2 per frame')
for r in o[3:400:40]:
    f4=r['e10c']; At=math.atan2(2*f4*7.5*(r['s860c']**0.8),1.0)
    if abs(r['pre7850']-At)<1e-3: continue
    s2a=(r['e7850']-At)/(r['pre7850']-At)
    print('fr %d speed %.4f fps %.2f  s2_actual %.5f  mine %.5f   s1_implied %.5f  0.86^speed %.5f  u_implied %.5f'%(r['fr'],r['s57a8'],r['fps'],s2a,((0.86**r['s57a8'])*0.5+0.43)**(22/r['fps']),s2a**(r['fps']/22),0.86**r['s57a8'],(s2a**(r['fps']/22)-0.43)/0.5))

print('=== eye / roll model')
sin=math.sin
def cam_inputs(r):
    D,fr,cs,g,L,A0x,A0y,TX0,TY0=feats(r)
    T=r['T']; P=r['z7860']; c4=r['s57c4']
    zf=min(r['pre7804']*5.1282053,1.0)
    q2=1/max(0.9*c4,1.0); k2=zf*q2
    RA=0.0227*sin(T*0.0139+41)+0.0216*sin(T*0.0197+98)+0.023*sin(T*0.0179+28)
    RB=0.0226*sin(T*0.0173+73)+0.0207*sin(T*0.0152+23)+0.024*sin(T*0.0129+11)
    q1=1/max(1.2*c4,1.0); k1=zf*q1
    WX=0.21*sin(P*1.2+T*0.0119+11)+0.16*sin(P*3.1+T*0.0137+46)+0.19*sin(P*1.4+T*0.0059+38)
    WY=0.12*sin(P*2.4+T*0.0103+83)+0.17*sin(P*2.7+T*0.0122+29)+0.19*sin(P*1.7+T*0.0069+91)
    EX=A0x+k2*RA; EY=A0y+k2*RB
    TX=TX0+0.6*k1*WX+r['s57b8']; TY=TY0+0.6*k1*WY+r['s57bc']
    return dict(fr=fr,EX=EX,EY=EY,TX=TX,TY=TY,k1=k1,k2=k2,zf=zf)
rows=[]
for r in o[5:]:
    c=cam_inputs(r); eye=r['eye']
    up=np.array(r['up']); roll=math.atan2(up[0],up[1])
    rows.append((r['fr'],eye[0],eye[1],eye[2],c['EX'],c['EY'],c['fr'],roll))
rows=np.array(rows)
print('eye.z vs fr   max err',np.abs(rows[:,3]-rows[:,6]).max())
print('eye.x vs EX   max err',np.abs(rows[:,1]-rows[:,4]).max(),' eye.y vs EY max err',np.abs(rows[:,2]-rows[:,5]).max())
print('roll vs EY    max err',np.abs(rows[:,7]-rows[:,5]).max())
for x in rows[::60][:6]: print('fr %d eye (%.4f %.4f %.4f) EX %.4f EY %.4f  roll %.4f'%(x[0],x[1],x[2],x[3],x[4],x[5],x[7]))

print('=== forward/up model')
def nrm(v): v=np.array(v,float); return v/np.linalg.norm(v)
errs=[];errs2=[]
for r in o[5:]:
    c=cam_inputs(r)
    fw=nrm([c['TX']-c['EX'],c['TY']-c['EY'],6.0])
    errs.append(np.linalg.norm(fw-np.array(r['fwd'])))
    # alternative: target relative to eye with z = 6 - fr
    fw2=nrm([c['TX']-c['EX'],c['TY']-c['EY'],6.0-c['fr']])
    errs2.append(np.linalg.norm(fw2-np.array(r['fwd'])))
print('fwd err (z=6):',max(errs),np.mean(errs),'  (z=6-fr):',max(errs2),np.mean(errs2))
r=o[100]; c=cam_inputs(r); print('sample fr100 trace fwd',np.round(r['fwd'],5),'model',np.round(nrm([c['TX']-c['EX'],c['TY']-c['EY'],6.0]),5))

print('=== look-at target fit')
L=json.load(open('/Users/brock/dev/monkey/decomp/cam_look.json'))
def quatmat(q):  # FUN_10025f88: row-vector rotation matrix (3x3) from quaternion (x,y,z,w)
    x,y,z,w=q
    return np.array([[1-2*y*y-2*z*z, 2*x*y+2*z*w, 2*x*z-2*y*w],[2*x*y-2*z*w, 1-2*x*x-2*z*z, 2*y*z+2*x*w],[2*x*z+2*y*w, 2*y*z-2*x*w, 1-2*x*x-2*y*y]])
def segq(ang,bend,sign):
    phi=ang-1.5707964; sa=math.sin(sign*bend*0.5)
    return (sa*math.cos(phi), sa*math.sin(phi), 0.0, math.cos(bend*0.5))
rows=[]
for r,l in zip(o[5:],L[5:]):
    c=cam_inputs(r); look=l['look'][0]
    D,fr,cs,g,Lf,A0x,A0y,TX0,TY0=feats(r)
    at=np.array(look['at']); eye=np.array(look['eye'])
    T=np.array([c['TX'],c['TY'],6.0])
    d={'A':at-T}
    for name,sgn in (('q2',-1),('q1',1)):
        R=quatmat(segq(g(0,'ang'),g(0,'bend'),sgn))
        for rn,Rm in (('R',R),('Rt',R.T)):
            v=T-eye
            d[name+rn]=at-(eye+v@Rm)
            d[name+rn+'_o']=at-(v@Rm)
    rows.append(d)
for k in rows[0]:
    e=np.array([np.linalg.norm(x[k]) for x in rows]); print('%-8s mean err %.2e  max %.2e'%(k,e.mean(),e.max()))

print('=== rotate target about z')
def Rz(a): return np.array([[math.cos(a),math.sin(a),0],[-math.sin(a),math.cos(a),0],[0,0,1]])
res={}
for r,l in zip(o[5:],L[5:]):
    c=cam_inputs(r); look=l['look'][0]; at=np.array(look['at']); eye=np.array(look['eye'])
    Q=r['pre785c']*0 + (r['s785c'] if 's785c' in r else 0) - r['e7850']
    T=np.array([c['TX'],c['TY'],6.0]); v=T-eye
    for nm,a in (('2Q',2*Q),('-2Q',-2*Q),('Q',Q),('-Q',-Q),('0',0)):
        res.setdefault(nm,[]).append(np.linalg.norm(at-(eye+v@Rz(a))))
for k,v in res.items(): print(k,'mean %.2e max %.2e'%(np.mean(v),np.max(v)))
r=o[100]; c=cam_inputs(r); look=L[100]['look'][0]
print('fr100 at',np.round(look['at'],5),'T',np.round([c['TX'],c['TY'],6],5),'eye',np.round(look['eye'],5),'Q',-r['e7850'])

print('=== regress at - T on bend-weighted features')
X=[];Y=[]
for r,l in zip(o[5:],L[5:]):
    c=cam_inputs(r); look=l['look'][0]; at=np.array(look['at']); D,fr,cs,g,Lf,A0x,A0y,TX0,TY0=feats(r)
    T=np.array([c['TX'],c['TY'],6.0]); d=at-T
    b=Lf('bend',0); a=Lf('ang',0)
    bc,bs=b*math.cos(a),b*math.sin(a)
    feats_=[bc,bs,bc*c['EX'],bc*c['EY'],bs*c['EX'],bs*c['EY'],bc*c['TX'],bc*c['TY'],bs*c['TX'],bs*c['TY'],b,b*c['EX'],b*c['EY'],b*c['TX'],b*c['TY']]
    X.append(feats_);Y.append(d)
X=np.array(X);Y=np.array(Y)
for k,name in enumerate('xyz'):
    coef,res,rk,sv=np.linalg.lstsq(X,Y[:,k],rcond=None)
    pred=X@coef
    print(name,'resid rms %.2e (raw rms %.2e)'%(np.sqrt(np.mean((Y[:,k]-pred)**2)),np.sqrt(np.mean(Y[:,k]**2))),'coef',np.round(coef,3))

print('=== base chain matrix C0 = W0 * inv(V)')
def lookat(eye,at,up):
    z=nrm(np.array(at)-np.array(eye)); x=nrm(np.cross(up,z)); y=np.cross(z,x)
    M=np.eye(4); M[:3,0]=x; M[:3,1]=y; M[:3,2]=z; M[3,:3]=[-np.dot(x,eye),-np.dot(y,eye),-np.dot(z,eye)]
    return M
np.set_printoptions(precision=6,suppress=True,linewidth=150)
for k in (6,50,200,300):
    r=o[k]; look=L[k]['look'][0]
    V=lookat(look['eye'],look['at'],look['up']); W0=np.array(r['W0'])
    C0=W0@np.linalg.inv(V)
    print('fr',r['fr'],'frac',round(feats(r)[1],5)); print(C0)
