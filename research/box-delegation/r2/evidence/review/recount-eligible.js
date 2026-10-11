const fs = require('fs');
const lines = fs.readFileSync('C:/Users/shout/AppData/Local/Temp/kitchen-r2-review-base41/tree.txt','utf8').trim().split('\n');
const prefixes = ['node_modules/','dist/','.git/','.kitchen/','.runtime/','secrets/','.execution/','docs/legacy/','coverage/','data/','test-results/','playwright-report/','__pycache__/'];
let n=0,b=0,exn=0,exb=0; const per={};
for (const l of lines) {
  const m = l.match(/^\d+ \w+ [0-9a-f]+\s+(\d+|-)\s+(.+)$/); if(!m) continue;
  const size = m[1]==='-'?0:+m[1]; const path = m[2].replace(/^"|"$/g,'');
  const hit = prefixes.find(p=>path.startsWith(p));
  if (hit){ exn++; exb+=size; per[hit]=(per[hit]||0)+1; continue; }
  n++; b+=size;
}
console.log('tracked total:', n+exn, '| excluded:', exn, exb, JSON.stringify(per));
console.log('ELIGIBLE:', n, 'files', b, 'bytes');
const own = require('C:/Users/shout/Desktop/Projects/private-task-mvp/research/box-delegation/r2/evidence/phase3/box.json').files.filter(f=>f.origin!=='generated');
const sb = own.reduce((a,f)=>a+f.bytes,0);
console.log('shipped', own.length, '/', sb, '→ eligible share', (own.length/n*100).toFixed(3)+'% files,', (sb/b*100).toFixed(3)+'% bytes');
