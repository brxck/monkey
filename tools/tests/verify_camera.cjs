const fs=require('fs');const {Original}=require('/Users/brock/dev/monkey/web/monkey-orig.js');
const seed=+process.argv[2]||4242; const tr=JSON.parse(fs.readFileSync('/Users/brock/dev/monkey/decomp/cam_truth_'+seed+'.json'));
const o=new Original(seed);
const mx=(a,b)=>{let m=0;for(let i=0;i<a.length;i++)m=Math.max(m,Math.abs(a[i]-b[i]));return m;};
let worst={D:0,speed:0,eye:0,at:0,up:0,fov:0,W0:0,W17:0,W33:0}, first=-1;
for(const t of tr){
  const c=o.frame(false);
  const d={D:Math.abs(o.D-t.D),speed:Math.abs(o.s57a8-t.speed),eye:mx(c.eye,t.look.eye),at:mx(c.at,t.look.at),up:mx(c.up,t.look.up),
    fov:Math.abs(c.fovY-2*Math.atan(1/t.proj[5])), W0:mx(c.W[0],t.W0),W17:mx(c.W[17],t.W17),W33:mx(c.W[33],t.W33)};
  for(const k in d) worst[k]=Math.max(worst[k],d[k]);
  if(first<0&&(d.eye>2e-3||d.at>5e-3||d.W33>5e-2)){first=t.fr;console.log('first big diff at frame',t.fr,JSON.stringify(d));}
  if(t.fr%60==0) console.log('fr',t.fr,JSON.stringify(Object.fromEntries(Object.entries(d).map(([k,v])=>[k,+v.toExponential(1)]))));
}
console.log('WORST',JSON.stringify(Object.fromEntries(Object.entries(worst).map(([k,v])=>[k,+v.toExponential(2)]))));
