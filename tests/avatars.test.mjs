import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../qml/openbotavatar.js',import.meta.url),'utf8').replace(/^\.pragma library\n/,''),context);
const definitions = ['rocket','ghost'].map(n=>JSON.parse(fs.readFileSync(new URL('../data/avatars/'+n+'.json',import.meta.url),'utf8')));
test('upstream avatar definitions validate and generate finite native frames',()=>{
 for(const definition of definitions) {
  const checked=context.validateAvatar(definition);
  assert.equal(checked.ok,true, JSON.stringify(checked.errors));
  for(const motion of ['idle','thinking','happy']) for(const x of [-1,0,1]) {
   const frame=context.avatarFrame(checked.value,{motion,gaze:{x,y:x},time:1.5});
   assert.ok(frame.shapes.length>2);
   assert.ok(frame.shapes.length<1000);
   assert.ok(frame.shapes.every(s=>s.matrix.every(Number.isFinite)));
   assert.ok(frame.shapes.filter(s=>s.kind==='eye').length<=2);
  }
 }
});
test('avatar validation rejects executable markup, unknown fields and invalid geometry',()=>{
 const original=definitions[0];
 for(const altered of [ {...original,script:'alert(1)'}, {...original,version:2}, {...original,body:{path:'<svg onload="alert(1)"></svg>'}}, {...original,eyes:{x:NaN,y:30,spacing:10,scale:1}}, {...original,body:{path:'M0 0 L1 1 Z'}}]) {
  assert.equal(context.validateAvatar(altered).ok,false);
 }
});
test('avatar JSON round trips without provider or runtime appearance fields',()=>{
 for(const definition of definitions) {
  const check=context.validateAvatar(JSON.parse(JSON.stringify(definition)));
  assert.equal(check.ok,true);
  assert.deepEqual(Object.keys(check.value).sort(),['body','eyes','id','name','version']);
 }
});
