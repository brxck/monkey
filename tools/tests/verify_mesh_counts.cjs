const fs=require('fs');
const {MC_EDGES,MC_OFFSETS}=require('/Users/brock/dev/monkey/web/mc-table.js');
const segs=JSON.parse(fs.readFileSync('/Users/brock/dev/monkey/decomp/emu_segs.json'));
const CORNER=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
const EDGE=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
function field(x,y,bx,by,br,off){let F=off;for(let i=0;i<16;i++){const dx=x-bx[i],dy=y-by[i];const f=(dx*dx+dy*dy)/(br[i]*br[i]);if(f<0.5){const t=0.5-f;F+=t*t;}}return F;}
function mc(bx0,by0,br0,bx1,by1,br1,G,iso,off){
  const n=G+1;const v0=new Float64Array(n*n),v1=new Float64Array(n*n);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){v0[j*n+i]=field(i/G,j/G,bx0,by0,br0,off);v1[j*n+i]=field(i/G,j/G,bx1,by1,br1,off);}
  const verts=new Map();let tris=0;
  for(let j=0;j<G;j++)for(let i=0;i<G;i++){
    let idx=0;const cv=[];
    for(let b=0;b<8;b++){const c=CORNER[b];const v=(c[2]?v1:v0)[(j+c[1])*n+(i+c[0])];cv.push(v);if(v>=iso)idx|=1<<b;}
    if(idx===0||idx===255)continue;
    for(let p=MC_OFFSETS[idx];p<MC_OFFSETS[idx+1];p+=3){tris++;
      for(let q=0;q<3;q++){const ed=MC_EDGES[p+q];const [a,b]=EDGE[ed];const ca=CORNER[a],cb=CORNER[b];
        // global edge id
        const ax=i+ca[0],ay=j+ca[1],az=ca[2],bx_=i+cb[0],by_=j+cb[1],bz=cb[2];
        const key=Math.min(((az*n+ay)*n+ax),((bz*n+by_)*n+bx_))+'_'+Math.max(((az*n+ay)*n+ax),((bz*n+by_)*n+bx_));
        verts.set(key,1);}}
  }
  return {nv:verts.size,nt:tris};
}

const zero=new Array(16).fill(0), one=new Array(16).fill(1);
for(let k=0;k<7;k++){
  const s=segs[k], pv=k?segs[k-1]:null;
  // previous layer: previous segment's blobs (segment 0: empty field)
  const run=(off)=>{ if(!pv){ // empty previous layer: F=0
      const bx=s.bx,by=s.by,br=s.br; const n=33; return mcLayers(null,s,off);} return mcLayers(pv,s,off); };
  console.log('seg',s.seg,'orig',s.nv,s.nt,' mine(off .0105)',JSON.stringify(run(0.0105)),' (off 0)',JSON.stringify(run(0)));
}
function mcLayers(pv,s,off){
  const G=32,iso=0.15,n=G+1;const v0=new Float64Array(n*n),v1=new Float64Array(n*n);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){v0[j*n+i]=pv?field(i/G,j/G,pv.bx,pv.by,pv.br,off):0;v1[j*n+i]=field(i/G,j/G,s.bx,s.by,s.br,off);}
  const verts=new Map();let tris=0;
  for(let j=0;j<G;j++)for(let i=0;i<G;i++){let idx=0;
    for(let b=0;b<8;b++){const c=CORNER[b];const v=(c[2]?v1:v0)[(j+c[1])*n+(i+c[0])];if(v>=iso)idx|=1<<b;}
    if(idx===0||idx===255)continue;
    for(let p=MC_OFFSETS[idx];p<MC_OFFSETS[idx+1];p+=3){tris++;
      for(let q=0;q<3;q++){const ed=MC_EDGES[p+q];const [a,b]=EDGE[ed];const ca=CORNER[a],cb=CORNER[b];
        const A=((ca[2])*n+(j+ca[1]))*n+(i+ca[0]),B=((cb[2])*n+(j+cb[1]))*n+(i+cb[0]);
        verts.set(Math.min(A,B)+'_'+Math.max(A,B),1);}}}
  return [verts.size,tris];
}

function meshPos(pv,s){
  const G=32,iso=0.15,n=G+1;const v0=new Float64Array(n*n),v1=new Float64Array(n*n);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){v0[j*n+i]=pv?field(i/G,j/G,pv.bx,pv.by,pv.br,0):0;v1[j*n+i]=field(i/G,j/G,s.bx,s.by,s.br,0);}
  const vs=new Map();
  for(let j=0;j<G;j++)for(let i=0;i<G;i++){let idx=0,cv=[];
    for(let b=0;b<8;b++){const c=CORNER[b];const v=(c[2]?v1:v0)[(j+c[1])*n+(i+c[0])];cv.push(v);if(v>=iso)idx|=1<<b;}
    if(idx===0||idx===255)continue;
    for(let p=MC_OFFSETS[idx];p<MC_OFFSETS[idx+1];p++){const ed=MC_EDGES[p];const [a,b]=EDGE[ed];const ca=CORNER[a],cb=CORNER[b];
      const t=(iso-cv[a])/(cv[b]-cv[a]);
      const x=(i+ca[0]+(cb[0]-ca[0])*t)/G,y=(j+ca[1]+(cb[1]-ca[1])*t)/G,z=ca[2]+(cb[2]-ca[2])*t;
      vs.set(ed+'_'+i+'_'+j,[2*x-1,2*y-1,z]);}}
  return [...vs.values()];
}
for(const k of [1,3]){
  const mine=meshPos(segs[k-1],segs[k]); const orig=segs[k].verts;
  const keyset=(arr,fz)=>new Set(arr.map(v=>[v[0].toFixed(2),v[1].toFixed(2),fz(v[2]).toFixed(2)].join(',')));
  const O=keyset(orig,z=>z);
  for(const [name,fz] of [['z',z=>z],['1-z',z=>1-z]]){
    const M=keyset(mine,fz); let hit=0; for(const m of M) if(O.has(m)) hit++;
    console.log('seg',k,'mapping',name,'mine',M.size,'orig(first400)',O.size,'matches',hit);
  }
}
