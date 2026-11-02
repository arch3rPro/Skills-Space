import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.resolve('vite')),ts=require('typescript');
const source=await readFile('src/App.tsx','utf8');
const ast=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
// Execute the real application handlers, as in pi-loading.test.mjs, with native
// requests controlled at the boundary. This checks transitions rather than source strings.
const handlers={};
function visit(node){if(ts.isFunctionDeclaration(node)&&node.name)handlers[node.name.text]=node.getText(ast);ts.forEachChild(node,visit);}visit(ast);
const skill={name:'fixture',path:'/fixture',piState:{file:'/fixture/SKILL.md',documentRevision:'old'}};
const info={content:'body',version:'2.0',pluginVersion:'3.0',revision:'r2',localState:'clean'};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function fixture(invoke){
 const state={},events=[],documentRequest={current:1};
 const target={host:'local',scope:'global',projectPath:null};
 const env={invoke,activeSkillAgent:'pi',target,dshContextKey:null,dshNativeBatch:false,documentRequest,documentIdentity:{current:JSON.stringify([target,skill.path])},documentVersion:'1',documentRevision:'r1',diffCache:{current:new Map()},detail:skill,acceptInventoryMutation(){},piPackageCache:{invalidate(){}},mergePiSkillStates:()=>null,t:cn=>cn};
 for(const key of ['DocumentLoading','DocumentReadState','Document','DocumentPluginVersion','DocumentVersion','DocumentRevision','DocumentLocalState','SourceDirectory','Detail','Error','Updates','PiSettings','Inventory'])env['set'+key]=value=>{state[key]=typeof value==='function'?value(key==='Updates'?[]:state[key]):value;events.push([key,state[key]]);};
 const names=Object.keys(env),body=['openDetail','diffKey','loadSkillDiff','restoreSkillFile','applyPiState'].map(name=>ts.transpileModule(handlers[name],{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText).join('\n');
 const f=new Function(...names,body+';return {openDetail,loadSkillDiff,restoreSkillFile,applyPiState};')(...names.map(name=>env[name]));
 return {...f,state,events,documentRequest};
}
test('detail pending masks absent/stale versions; success and failure stay distinct; reopening recovers',async()=>{
 for(const result of [info,{...info,version:null,pluginVersion:null}]){
  const pending=deferred(),f=fixture(()=>pending.promise),read=f.openDetail(skill);
  assert.equal(f.state.DocumentReadState,'loading');assert.equal(f.state.DocumentLoading,true);
  pending.resolve(result);await read;assert.equal(f.state.DocumentReadState,'ready');assert.equal(f.state.DocumentVersion,result.version);assert.equal(f.state.DocumentLoading,false);
 }
 let pending=deferred();const f=fixture(()=>pending.promise),read=f.openDetail(skill);
 pending.reject(Error('unreadable'));await read;assert.equal(f.state.DocumentReadState,'error');assert.equal(f.state.DocumentLoading,false);assert(f.state.Error);
 pending=deferred();const retry=f.openDetail(skill);assert.equal(f.state.DocumentReadState,'loading');pending.resolve(info);await retry;assert.equal(f.state.DocumentReadState,'ready');
});
test('late success and error from previous detail cannot replace the selected detail state',async()=>{
 for(const fail of [false,true]){
  const old=deferred(),next=deferred();let n=0;const f=fixture(()=>++n===1?old.promise:next.promise);
  const first=f.openDetail(skill),second=f.openDetail({...skill,path:'/other'});
  fail?old.reject(Error('obsolete')):old.resolve(info);await first;
  assert.equal(f.state.DocumentReadState,'loading');assert.equal(f.state.DocumentVersion,null);assert.equal(f.state.Error,undefined);
  next.resolve({...info,version:'selected'});await second;assert.equal(f.state.DocumentVersion,'selected');
 }
});
test('diff refresh, restore readback and Pi readback expose pending, ready and failure without unloading body',async()=>{
 for(const action of ['refresh','restore','pi'])for(const fail of [false,true]){
  const pending=deferred();const f=fixture(command=>command==='upstream_document'?pending.promise:Promise.resolve(command==='upstream_skill_file_restore'?'r2':{files:[]}));
  const run=action==='refresh'?f.loadSkillDiff(skill,true):action==='restore'?f.restoreSkillFile(skill,{revision:'r1',version:'1',files:[]},'README.md'):f.applyPiState({target:{},skills:[{file:skill.piState.file,documentRevision:'new'}]});
  await Promise.resolve();assert.equal(f.state.DocumentReadState,'loading',action);assert.equal(f.state.DocumentLoading,undefined,'readback must retain rendered body/diff');
  fail?pending.reject(Error('readback failed')):pending.resolve(info);
  if(action==='refresh'&&fail)await assert.rejects(run,/readback failed/);else await run;
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(f.state.DocumentReadState,fail?'error':'ready',action);
  if(!fail){assert.equal(f.state.DocumentPluginVersion,'3.0');assert.equal(f.state.DocumentVersion,'2.0');}
 }
});
test('a Pi mutation response from a previous detail cannot supersede a newly opened detail',async()=>{
 const selected=deferred(),old=deferred(),calls=[];
 const f=fixture((command,args)=>{calls.push(args.path);return args.path==='/other'?selected.promise:old.promise;});
 const read=f.openDetail({...skill,path:'/other',piState:{file:'/other/SKILL.md'}});
 f.applyPiState({target:{},skills:[{file:skill.piState.file,documentRevision:'changed'}]});
 selected.resolve({...info,version:'selected'});await read;
 old.resolve({...info,version:'obsolete'});await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(f.state.Detail.path,'/other');assert.equal(f.state.DocumentVersion,'selected');
 assert.deepEqual(calls,['/other'],'old Pi mutation must not start a document read for its previous detail');
});
test('pending metadata refreshes cannot overwrite another detail opened before readback finishes',async()=>{
 for(const action of ['refresh','restore','pi'])for(const fail of [false,true]){
  const pending=deferred(),f=fixture(command=>command==='upstream_document'?pending.promise:Promise.resolve('r2'));
  const run=action==='refresh'?f.loadSkillDiff(skill,true):action==='restore'?f.restoreSkillFile(skill,{revision:'r1',version:'1',files:[]},'README.md'):f.applyPiState({target:{},skills:[{file:skill.piState.file,documentRevision:'new'}]});
  await Promise.resolve();f.documentRequest.current++;f.state.DocumentReadState='loading';
  fail?pending.reject(Error('obsolete')):pending.resolve(info);
  if(action==='refresh')await assert.rejects(run);else await run;
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(f.state.DocumentReadState,'loading',action);assert.equal(f.state.DocumentVersion,undefined);assert.equal(f.state.Error,undefined);
 }
});
const modules=process.env.SKILLS_SPACE_REACT_TEST_MODULES;
test('real version renderer and Pi confirmation distinguish pending, confirmed absence, and read failure',{skip:!modules},async()=>{
 const work=await mkdtemp(join(tmpdir(),'skills-space-version-')),root=process.cwd(),{build}=require('esbuild');
 const reactPath=resolve(modules,'react/index.js'),React=await import(reactPath),{create,act}=await import(resolve(modules,'react-test-renderer/index.js'));
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const outfile=join(work,'subject.mjs');
 try{
 await build({stdin:{contents:"export {VersionValue} from './src/components/version-value';export {PiPackageUpdateDialog} from './src/components/pi-package-update-dialog';",resolveDir:root},bundle:true,platform:'node',format:'esm',outfile,jsx:'automatic',plugins:[{name:'version-fixture',setup(b){
 b.onResolve({filter:/^react(?:\/.*)?$/},a=>({path:a.path==='react'?reactPath:resolve(modules,a.path+'.js'),external:true}));
 b.onResolve({filter:/^@\/components\/version-value$/},()=>({path:resolve(root,'src/components/version-value.tsx')}));
 b.onResolve({filter:/^(lucide-react|@\/components\/ui\/)/},()=>({path:'ui',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"import {createElement} from 'react';const view=({children,...props})=>createElement('fixture',props,children);export const LoaderCircleIcon=view,Alert=view,AlertDescription=view,AlertDialog=view,AlertDialogContent=view,AlertDialogHeader=view,AlertDialogTitle=view,AlertDialogDescription=view,AlertDialogBody=view,AlertDialogFooter=view,AlertDialogCancel=view,AlertDialogAction=view;"}));
 b.onResolve({filter:/^@\//},a=>({path:['.ts','.tsx'].map(ext=>resolve(root,'src',a.path.slice(2))+ext).find(existsSync)}));
 }}]});
 const {VersionValue,PiPackageUpdateDialog}=await import(pathToFileURL(outfile));let renderer;
 const render=async(component,props)=>{await act(async()=>{renderer=create(React.createElement(component,props));});return JSON.stringify(renderer.toJSON());};
 const close=async()=>act(async()=>renderer.unmount());
 for(const zh of [true,false]){
  let text=await render(VersionValue,{value:'stale',state:'loading',zh});assert(text.includes(zh?'加载中':'Loading'));assert(!text.includes('stale'));assert.equal(renderer.root.findByProps({role:'status'}).findAllByType('fixture').length,1);await close();
  text=await render(VersionValue,{value:null,state:'ready',zh});assert(text.includes(zh?'未知':'Unknown'));await close();
  text=await render(VersionValue,{value:'stale',state:'error',zh});assert(text.includes(zh?'读取失败':'Could not read'));assert(!text.includes('stale'));await close();
 }
 let text=await render(VersionValue,{value:'abcdef01234567890123456789012345',zh:true});assert(text.includes('abcdef0'));assert(!text.includes('abcdef0123'));await close();
 for(const reason of [null,'referenceUnavailable']){
  text=await render(PiPackageUpdateDialog,{zh:true,busy:false,home:'/home',onClose(){},onUpdate(){},review:{affected:[{scope:'user',source:'npm:fixture',root:'/fixture',installed:null,latest:'2',status:'unknown',updateable:false,reason}],updated:false,error:null}});
  assert(text.includes(reason?'读取失败':'未知'));assert(!text.includes('加载中'));await close();
 }
 }finally{await rm(work,{recursive:true,force:true});}
});
