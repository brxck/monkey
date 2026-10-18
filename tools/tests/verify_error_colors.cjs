const {Original}=require('/Users/brock/dev/monkey/web/monkey-orig.js');
const d=JSON.parse(require('fs').readFileSync('/Users/brock/dev/monkey/decomp/col_truth_err_4242.json','utf8'));
const O=new Original(4242); O.errors=1; O.flat=1;
const segs={};for(let f=0;f<40;f++){O.genSegment();const s=O.ring[(O.n-1)%34];segs[s.n]=s;}
let tot=0,worst=0,miss=0,hist={};
for(const e of d.slice(0,36)){
  const s=segs[e.n];if(!s){console.log('no seg',e.n);continue;}
  const p=s.mesh.pos0,col=s.mesh.col;let n=0,err=0,m=0;
  const key=(a,b,c)=>[a,b,c].map(x=>Math.round(x*4096)).join(',');const mine=new Map();
  for(let k=0;k<p.length/3;k++)mine.set(key((p[3*k]+1)/2,(p[3*k+1]+1)/2,1-p[3*k+2]),k);
  for(let i=0;i<e.nodes.length;i++){const nd=e.nodes[i];const c=e.cols[i];const t=[(c>>>16)&255,(c>>>8)&255,c&255];
    const k=mine.get(key(nd[0],nd[1],nd[2]));if(k===undefined){m++;continue;}
    const mm=[col[3*k],col[3*k+1],col[3*k+2]];
    const er=Math.max(Math.abs(mm[0]-t[0]),Math.abs(mm[1]-t[1]),Math.abs(mm[2]-t[2]));err=Math.max(err,er);n++;hist[er]=(hist[er]||0)+1;}
  tot+=n;miss+=m;worst=Math.max(worst,err);
  if(err>1)console.log('seg',e.n,'matched',n,'unmatched',m,'maxerr',err);
}
console.log('total matched',tot,'unmatched',miss,'worst',worst,JSON.stringify(hist));
