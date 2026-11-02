import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync,realpathSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {packageOperation} from '../src-tauri/resources/upstream/pi-packages.mjs';
const original=process.env.SKILLS_SPACE_PI_TEST_INSTALL;
function fixture() {
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ss-pi-packages-'))),home=join(root,'home'),agent=join(home,'.pi/agent'),project=join(root,'project'),source=join(root,'package');
 for(const path of [agent,join(project,'.pi'),join(source,'extensions'),join(source,'skills/demo')])mkdirSync(path,{recursive:true});
 const metadata=JSON.parse(readFileSync(join(original,'package.json'),'utf8'));
 const release=join(agent,'install/releases',metadata.version,'node_modules/@earendil-works');mkdirSync(release,{recursive:true});
 symlinkSync(original,join(release,'pi-coding-agent'));writeFileSync(join(agent,'install/current-version'),metadata.version);
 writeFileSync(join(source,'package.json'),JSON.stringify({name:'fixture-pi-package',version:'1.0.0',description:'Package fixture',pi:{extensions:['extensions'],skills:['skills']}}));
 writeFileSync(join(source,'extensions/never-load.js'),'throw new Error("PACKAGE CODE MUST NOT EXECUTE");');
 writeFileSync(join(source,'skills/demo/SKILL.md'),'---\nname: demo\ndescription: Fixture skill\n---\nDemo');
 const global=join(agent,'settings.json'),local=join(project,'.pi/settings.json');
 writeFileSync(global,JSON.stringify({packages:[source],model:'preserve-model',custom:{keep:true}}));
 writeFileSync(local,JSON.stringify({customProject:'preserve'}));writeFileSync(join(agent,'trust.json'),JSON.stringify({[project]:true}));
 const list=async scope=>(await packageOperation(home,agent,scope,{action:'list'})).snapshot;
 async function change(scope,operation) {const snapshot=await list(scope);const result=await packageOperation(home,agent,scope,{revision:snapshot.revision,...operation});const path=scope?local:global;const settings=JSON.parse(readFileSync(path));for(const [key,value]of Object.entries(result.changes)){if(value===null)delete settings[key];else settings[key]=value;}writeFileSync(path,JSON.stringify(settings));return list(scope);}
 return {root,home,agent,project,source,global,local,list,change,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
test('original Pi inventory includes packages with no skills, builtins and missing sources without loading or writes',{skip:!original},async()=>{
 const f=fixture();try {
  const manifest=join(f.source,'package.json');writeFileSync(manifest,JSON.stringify({name:'extensions-only',pi:{extensions:['extensions'],skills:[]}}));
  const data=JSON.parse(readFileSync(f.global));data.packages.push('npm:fixture-do-not-download');writeFileSync(f.global,JSON.stringify(data));const before=readFileSync(f.global,'utf8');
  const snapshot=await f.list('');assert.equal(snapshot.packages.length,2);assert.equal(snapshot.packages[0].resources.filter(r=>r.type==='skills').length,0);assert(snapshot.packages[0].resources.some(r=>r.type==='extensions'));assert.equal(snapshot.builtins.length,4);assert.equal(readFileSync(f.global,'utf8'),before);assert(!existsSync(join(f.agent,'npm')));assert(!existsSync(f.global+'.lock'));
 }finally{f.cleanup();}
});
test('original resource selector retains global settings and supports project load/unload/inherit',{skip:!original},async()=>{
 const f=fixture();try {
  let snapshot=await f.list('');const pkg=snapshot.packages[0],resource=pkg.resources.find(r=>r.type==='extensions');assert(resource?.enabled);
  snapshot=await f.change('',{action:'resource',id:pkg.id,resourceId:resource.id,state:'unload'});assert.equal(snapshot.packages[0].resources.find(r=>r.id===resource.id).enabled,false);
  snapshot=await f.change(f.project,{action:'resource',id:pkg.id,resourceId:resource.id,state:'load'});assert.equal(snapshot.packages[0].resources.find(r=>r.id===resource.id).override,'load');assert(snapshot.packages[0].resources.find(r=>r.id===resource.id).enabled);
  snapshot=await f.change(f.project,{action:'resource',id:pkg.id,resourceId:resource.id,state:'inherit'});assert.equal(snapshot.packages[0].resources.find(r=>r.id===resource.id).override,'inherit');assert.equal(snapshot.packages[0].resources.find(r=>r.id===resource.id).enabled,false);
  const builtin=snapshot.builtins[0];snapshot=await f.change(f.project,{action:'resource',resourceId:builtin.id,state:'unload'});assert.equal(snapshot.builtins.find(r=>r.id===builtin.id).enabled,false);
  assert.equal(JSON.parse(readFileSync(f.global)).model,'preserve-model');assert.deepEqual(JSON.parse(readFileSync(f.global)).custom,{keep:true});assert.equal(JSON.parse(readFileSync(f.local)).customProject,'preserve');assert.equal(readFileSync(join(f.source,'extensions/never-load.js'),'utf8'),'throw new Error("PACKAGE CODE MUST NOT EXECUTE");');
 }finally{f.cleanup();}
});
test('original local install/remove preserves source; stale changes and untrusted project writes reject',{skip:!original},async()=>{
 const f=fixture();try {
  let snapshot=await f.change(f.project,{action:'install',source:f.source});assert.equal(snapshot.packages[0].scope,'project');assert(snapshot.packages[0].canRemove);
  snapshot=await f.change(f.project,{action:'remove',id:snapshot.packages[0].id});assert(snapshot.packages[0].inherited);assert(existsSync(join(f.source,'package.json')));
  const stale=await f.list('');writeFileSync(f.global,readFileSync(f.global,'utf8')+'\n');await assert.rejects(packageOperation(f.home,f.agent,'',{action:'remove',id:stale.packages[0].id,revision:stale.revision}),/changed/);
  writeFileSync(join(f.agent,'trust.json'),JSON.stringify({[f.project]:false}));snapshot=await f.list(f.project);assert.equal(snapshot.projectTrusted,false);await assert.rejects(packageOperation(f.home,f.agent,f.project,{action:'install',source:f.source,revision:snapshot.revision}),/not trusted/);
  writeFileSync(f.global,'{\"private\":\"must-not-appear\",broken');await assert.rejects(f.list(''),error=>error.message==='Invalid Pi configuration or package manifest.'&&!error.message.includes('must-not-appear'));
 }finally{f.cleanup();}
});

test('enabling one resource from an empty type selection preserves disabled siblings in both scopes',{skip:!original},async()=>{
 const f=fixture();try {
  writeFileSync(join(f.source,'extensions/second.js'),'throw Error("Do not run");');
  for(const scope of ['',f.project]) {
   const path=scope?f.local:f.global;const data=JSON.parse(readFileSync(path));data.packages=[{source:f.source,extensions:[],skills:[]}];writeFileSync(path,JSON.stringify(data));
   let snapshot=await f.list(scope);const pkg=snapshot.packages[0],items=pkg.resources.filter(r=>r.type==='extensions');assert.equal(items.length,2);assert(items.every(r=>!r.enabled));
   snapshot=await f.change(scope,{action:'resource',id:pkg.id,resourceId:items[0].id,state:'load'});
   assert(snapshot.packages[0].resources.find(r=>r.id===items[0].id).enabled);assert.equal(snapshot.packages[0].resources.find(r=>r.id===items[1].id).enabled,false);assert(snapshot.packages[0].resources.filter(r=>r.type==='skills').every(r=>!r.enabled));
  }
 }finally{f.cleanup();}
});

test('built-in Agent settings prepare one bounded change without writing or changing packages',{skip:!original},async()=>{
 const f=fixture();try {
  const before=readFileSync(f.global,'utf8'),snapshot=await f.list('');
  const choices=snapshot.builtins.slice(0,2).map(item=>({resourceId:item.id,state:'unload'}));
  const prepared=await packageOperation(f.home,f.agent,'',{action:'builtins',revision:snapshot.revision,choices});
  assert.equal(readFileSync(f.global,'utf8'),before);assert.deepEqual(Object.keys(prepared.changes),['extensions']);
  const after=await f.change('',{action:'builtins',choices});assert(after.builtins.slice(0,2).every(item=>!item.enabled));assert(after.builtins.slice(2).every(item=>item.enabled));assert.equal(after.packages.length,snapshot.packages.length);
  const resource=snapshot.packages[0].resources[0];await assert.rejects(packageOperation(f.home,f.agent,'',{action:'builtins',revision:after.revision,choices:[{resourceId:resource.id,state:'unload'}]}),/no longer available/);
 }finally{f.cleanup();}
});

function addResourceTypes(f) {
 for(const type of ['prompts','themes'])mkdirSync(join(f.source,type),{recursive:true});
 writeFileSync(join(f.source,'prompts/demo.md'),'A fixture prompt');
 writeFileSync(join(f.source,'themes/demo.json'),'{}');
 const path=join(f.source,'package.json'),manifest=JSON.parse(readFileSync(path));
 manifest.pi.prompts=['prompts'];manifest.pi.themes=['themes'];writeFileSync(path,JSON.stringify(manifest));
}
test('whole-package loading covers every resource type, mixed state and project inherit without changing global settings',{skip:!original},async()=>{
 const f=fixture();try {
  addResourceTypes(f);
  let snapshot=await f.list('');const pkg=snapshot.packages[0];
  assert.deepEqual(new Set(pkg.resources.map(item=>item.type)),new Set(['extensions','skills','prompts','themes']));
  snapshot=await f.change('',{action:'resource',id:pkg.id,resourceId:pkg.resources.find(item=>item.type==='skills').id,state:'unload'});
  assert(snapshot.packages[0].resources.some(item=>item.enabled));assert(snapshot.packages[0].resources.some(item=>!item.enabled));
  snapshot=await f.change('',{action:'packages',ids:[pkg.id],state:'unload'});assert(snapshot.packages[0].resources.every(item=>!item.enabled));
  const before=readFileSync(f.global,'utf8');
  snapshot=await f.change(f.project,{action:'packages',ids:[pkg.id],state:'load'});assert(snapshot.packages[0].resources.every(item=>item.enabled&&item.override==='load'));assert.equal(readFileSync(f.global,'utf8'),before);
  snapshot=await f.change(f.project,{action:'packages',ids:[pkg.id],state:'inherit'});assert.equal(snapshot.packages.length,1);assert(snapshot.packages[0].resources.every(item=>!item.enabled&&item.override==='inherit'));assert.equal(readFileSync(f.global,'utf8'),before);
  snapshot=await f.change('',{action:'packages',ids:[pkg.id],state:'load'});assert(snapshot.packages[0].resources.every(item=>item.enabled));
  assert.equal(JSON.parse(readFileSync(f.global)).model,'preserve-model');assert.equal(JSON.parse(readFileSync(f.local)).customProject,'preserve');
 }finally{f.cleanup();}
});
test('whole-package batch prepares all valid packages and rejects invalid selections before any settings write',{skip:!original},async()=>{
 const f=fixture();try {
  addResourceTypes(f);
  const second=join(f.root,'second');mkdirSync(join(second,'extensions'),{recursive:true});writeFileSync(join(second,'package.json'),JSON.stringify({name:'second-fixture',pi:{extensions:['extensions']}}));writeFileSync(join(second,'extensions/never-load.js'),'throw Error("Do not execute");');
  const data=JSON.parse(readFileSync(f.global));data.packages.push(second);writeFileSync(f.global,JSON.stringify(data));
  let snapshot=await f.list('');const ids=snapshot.packages.map(item=>item.id);assert.equal(ids.length,2);
  const before=readFileSync(f.global,'utf8'),localBefore=readFileSync(f.local,'utf8');
  for(const scope of ['',f.project]) {
   const current=await f.list(scope);
   for(const invalid of [[],[ids[0],ids[0]],[ids[0],'missing-package']])await assert.rejects(packageOperation(f.home,f.agent,scope,{action:'packages',ids:invalid,state:'unload',revision:current.revision}));
   assert.equal(readFileSync(f.global,'utf8'),before);assert.equal(readFileSync(f.local,'utf8'),localBefore);
  }
  const prepared=await packageOperation(f.home,f.agent,'',{action:'packages',ids,state:'unload',revision:snapshot.revision});assert.deepEqual(Object.keys(prepared.changes),['packages']);assert.equal(readFileSync(f.global,'utf8'),before);
  snapshot=await f.change('',{action:'packages',ids,state:'unload'});assert(snapshot.packages.every(pkg=>pkg.resources.length&&pkg.resources.every(item=>!item.enabled)));assert(snapshot.builtins.every(item=>item.enabled));
  snapshot=await f.change('',{action:'packages',ids:[ids[0]],state:'load'});assert(snapshot.packages.find(pkg=>pkg.id===ids[0]).resources.every(item=>item.enabled));assert(snapshot.packages.find(pkg=>pkg.id===ids[1]).resources.every(item=>!item.enabled));
  const current=await f.list('');await assert.rejects(packageOperation(f.home,f.agent,'',{action:'packages',ids,state:'inherit',revision:current.revision}),/valid package/);
 }finally{f.cleanup();}
});
