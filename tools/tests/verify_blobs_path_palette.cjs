const fs=require('fs');
const {Original}=require('/Users/brock/dev/monkey/web/monkey-orig.js');
const seed=+process.argv[2]||4242;
const truth=JSON.parse(fs.readFileSync('/Users/brock/dev/monkey/decomp/truth_'+seed+'.json'));
const o=new Original(seed);
const I=truth.init;
function mx(a,b){let m=0;for(let i=0;i<a.length;i++)m=Math.max(m,Math.abs(a[i]-b[i]));return m;}
console.log('INIT  P',o.P,I.P,'| cp',o.cp.map(x=>+x.toFixed(3)),I.cp.map(x=>+x.toFixed(3)),'| style',o.style1,o.style2,I.style);
console.log('      base max diff',mx(o.base,I.base),' Wx diff',mx(o.W.map(w=>w[0]),I.Wx),' Wy diff',mx(o.W.map(w=>w[1]),I.Wy));
let palw=0;let worst={bx:0,by:0,br:0,c4:0,c8:0,bend:0,ang:0,h:0};
let firstBad=-1;
for(const s of truth.segs){
  o.T=s.T;o.D=s.D;o.n=s.n; const c0=o.rng.count; o.stepBlobs(); o.stepPath(); o.stepPalette(); o.n++; const used=o.rng.count-c0; if(used!==s.nrand&&!global.rr){global.rr=1;console.log('RAND COUNT differs at seg',s.n,'mine',used,'orig',s.nrand);}
  const d={bx:mx(o.bx,s.bx),by:mx(o.by,s.by),br:mx(o.br,s.br),c4:Math.abs(o.s57c4-s.s57c4),c8:Math.abs(o.s57c8-s.s57c8),bend:Math.abs(o.bend-s.bend),ang:Math.abs(o.ang-s.ang),h:Math.max(Math.abs(o.h[0]-s.h[0]),Math.abs(o.h[1]-s.h[1]))};
  for(const k in d) worst[k]=Math.max(worst[k],d[k]); palw=Math.max(palw,mx(o.pal,s.pal));
  if(firstBad<0 && (d.bx>1e-3||d.by>1e-3||d.br>1e-3)){firstBad=s.n;console.log('first mismatch at seg',s.n,JSON.stringify(d));}
  if(s.n<3||s.n%20==0) console.log('seg',s.n,JSON.stringify(Object.fromEntries(Object.entries(d).map(([k,v])=>[k,+v.toExponential(2)]))));
}
console.log('PAL worst',palw);console.log('WORST over',truth.segs.length,'segments',JSON.stringify(Object.fromEntries(Object.entries(worst).map(([k,v])=>[k,+v.toExponential(2)]))));
