const fs=require('fs');const S0='/private/tmp/claude-501/-Users-brock-dev-monkey/b7b78c4a-65b1-4aa4-9437-f02152800d3d/scratchpad/';
const src=fs.readFileSync('/Users/brock/dev/monkey/web/monkey-color-gen.js','utf8');
const colorParams=new Function(src+';return colorParams;')();
const {gain}=require('/Users/brock/dev/monkey/web/monkey-orig.js');
const f32=Math.fround;
const d=JSON.parse(fs.readFileSync('/Users/brock/dev/monkey/decomp/col_truth_4242.json','utf8'));
let bad={};
for(const e of d.slice(1)){
  const sl=e.slots;const S={};S[20]=sl['0x14'];S[0x4c]=sl['0x4c'];
  const E=o=>o===0x7860?e.P:0;
  colorParams(E,S,e.n,f32,gain);
  for(const k of Object.keys(sl)){const key=parseInt(k,16); if(S[key]===undefined) continue; const err=Math.abs(S[key]-sl[k]); if(err>1e-5){bad[k]=(bad[k]||0)+1; if(bad[k]<3)console.log('seg',e.n,'slot',k,'got',S[key],'want',sl[k]);}}
}
console.log('bad slots:',JSON.stringify(bad));
