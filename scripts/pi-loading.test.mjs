// Explicit renderer tooling stays outside the application, like codex-loading.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const modules=process.env.SKILLS_SPACE_REACT_TEST_MODULES;
test('Pi real component requests across remounts, scope changes, refresh and mutation',{skip:!modules},async t=>{
 const root=process.cwd(),work=await mkdtemp(join(tmpdir(),'skills-space-pi-loading-'));
 const require=createRequire(import.meta.resolve('vite')),{build}=require('esbuild');
 const reactPath=resolve(modules,'react/index.js');
 const React=await import(reactPath),{create,act}=await import(resolve(modules,'react-test-renderer/index.js'));
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const sources=await Promise.all(['src/components/pi-extensions.tsx','src/components/pi-package-detail.tsx'].map(path=>readFile(path,'utf8')));
 const uiNames=[...new Set(sources.flatMap(source=>[...source.matchAll(/import \{([^}]+)\} from '(?:lucide-react|@\/components\/[^']+)'/g)].flatMap(match=>match[1].split(',').map(name=>name.trim()))))].filter(name=>name!=='PiPackageDetail');
 const outfile=join(work,'subject.mjs');
 await build({stdin:{contents:"export {PiExtensions} from './src/components/pi-extensions';export {createPiPackageCache} from './src/lib/pi-package-cache';export {createFilterSession} from './src/lib/filter-session';",resolveDir:root},bundle:true,platform:'node',format:'esm',outfile,jsx:'automatic',plugins:[{name:'pi-loading-fixtures',setup(b){
  b.onResolve({filter:/^react(?:\/.*)?$/},a=>({path:a.path==='react'?reactPath:resolve(modules,a.path+'.js'),external:true}));
  b.onResolve({filter:/^@\/components\/pi-package-detail$/},()=>({path:resolve(root,'src/components/pi-package-detail.tsx')}));
  b.onResolve({filter:/^@tauri-apps\/api\/core$/},()=>({path:'invoke',namespace:'fixture'}));
  b.onResolve({filter:/^@tauri-apps\/plugin-/},()=>({path:'native',namespace:'fixture'}));
  b.onResolve({filter:/^sonner$/},()=>({path:'sonner',namespace:'fixture'}));
  b.onResolve({filter:/^@\/lib\/notifications$/},()=>({path:'notifications',namespace:'fixture'}));
  b.onResolve({filter:/^(?:lucide-react|@\/components\/)/},()=>({path:'ui',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='invoke'?"export const invoke=(command,args)=>command==='upstream_local_directories'?Promise.resolve([]):globalThis.piLoadingInvoke(command,args);":a.path==='native'?'export const open=async()=>null;export const openUrl=async()=>{};':a.path==='sonner'?'export const toast=()=>{};':a.path==='notifications'?"import {useState} from 'react';export const notifySuccess=()=>{};export function useFeedbackError(){const [value,setValue]=useState('');return [value,(...args)=>{globalThis.piLoadingErrors?.push(args);setValue(args[0]);}];}":`import {createElement} from 'react';const view=name=>({children,heading,control,description,metadata,selection,...props})=>createElement('fixture',{...props,component:name},heading,control,description,metadata,selection,children);export const ${uiNames.map(name=>name+`=view('${name}')`).join(',')};`}));
  b.onResolve({filter:/^@\//},a=>{const base=resolve(root,'src',a.path.slice(2));return {path:['.ts','.tsx'].map(ext=>base+ext).find(existsSync)};});
 }}]});
 const {PiExtensions,createPiPackageCache,createFilterSession}=await import(pathToFileURL(outfile));
 const target={host:'local',scope:'global',projectPath:null},project={...target,scope:'project',projectPath:'/fixture'};
 const snapshot=(revision='r',enabled=true)=>({version:'1.4.0',revision,projectTrusted:true,builtins:[],packages:[{id:'pkg',source:'/pkg',scope:'user',kind:'local',path:'/pkg',name:'demo',description:'Description',version:'1',inherited:false,delta:false,canRemove:true,canUpdate:false,resources:[{id:'skill',path:'/pkg/demo/SKILL.md',name:'demo',type:'skills',enabled,override:null}]}]});
 const skill={name:'demo',path:'/pkg/demo',agents:['pi'],description:'Skill description',source:null,sourceUrl:null};
 let calls=[],cache,renderer,lastSummary,busyEvents=[];
 const count=()=>calls.filter(item=>item.action==='list').length;
 const tick=()=>new Promise(r=>setTimeout(r,0));
 const normal=async(command,{request})=>{assert.equal(command,'upstream_pi_packages');calls.push(request);return {snapshot:snapshot(request.action==='list'?'read':'mutated',request.state!=='unload')};};
 function Session({away=false,selected=null,zh=true,active=true,target:scope=target,skills=[skill],states=[],onSkill,disabled=false}) {
  const [sessionCache]=React.useState(()=>createPiPackageCache(async target=>(await globalThis.piLoadingInvoke('upstream_pi_packages',{request:{target,action:'list'}})).snapshot));
  const [sessionFilters]=React.useState(createFilterSession);
  const [skillOpen,setSkillOpen]=React.useState(false);
  cache=sessionCache;
  return away?null:skillOpen?React.createElement('button',{'aria-label':'Back from skill',onClick:()=>setSkillOpen(false)},'Back'):React.createElement(PiExtensions,{key:`${scope.scope}:${scope.projectPath??''}`,filterSession:sessionFilters,cache:sessionCache,skills,states,onSkill:value=>{onSkill?.(value);setSkillOpen(true);},selected,active,target:scope,home:'/home',zh,disabled,onOpenDirectory:()=>{},onSelect:()=>{},onSummary:value=>{lastSummary=value;},onBusy:value=>busyEvents.push(value),onChanged:()=>{},onSettings:()=>{}});
 }
 const mount=async props=>{await act(async()=>{renderer=create(React.createElement(Session,props));await tick();});await act(tick);};
 const update=async props=>{await act(async()=>{renderer.update(React.createElement(Session,props));await tick();});await act(tick);};
 const find=(component,label)=>renderer.root.findAllByType('fixture').find(node=>node.props.component===component&&(!label||node.props['aria-label']===label));
 const unmount=async()=>act(async()=>renderer.unmount());
 const selectedCase=process.env.SKILLS_SPACE_PI_LOADING_CASE;
 const scenario=(name,run)=>t.test(name,{skip:!!selectedCase&&!name.includes(selectedCase)},run);
 try {
 await scenario('menu remount and skill-detail back reuse one native read; locale and filters do not rescan',async()=>{
  calls=[];globalThis.piLoadingInvoke=normal;await mount();assert.equal(count(),1);
  await update({away:true});await update({});assert.equal(count(),1,'menu return');
  await update({selected:'pkg'});
  await act(async()=>renderer.root.findByProps({'aria-label':'查看技能 demo'}).props.onClick());
  await act(async()=>{renderer.root.findByProps({'aria-label':'Back from skill'}).props.onClick();await tick();});
  assert.equal(count(),1,'skill detail back reuses the inventory');
  assert(find('Switch','启用技能 demo'),'single-skill management is available without a mode switch');
  assert(!renderer.root.findAllByType('fixture').some(node=>node.props.component==='Button'&&node.children.some(value=>value==='管理'||value==='查看详情')),'one unified page');
  await update({selected:'pkg',zh:false});assert(find('Switch','Enable skill demo'));await update({});
  await act(async()=>find('Input','搜索扩展包').props.onChange({target:{value:'demo'}}));
  await act(async()=>find('Choice').props.onChange('local'));
  assert.equal(count(),1);await unmount();
 });
 await scenario('initial effects and concurrent remount share pending reads; each new scope reads once and seen scopes reuse',async()=>{
  calls=[];let finish;
  globalThis.piLoadingInvoke=async(command,args)=>{calls.push(args.request);return new Promise(resolve=>{finish=resolve;});};
  await mount();assert.equal(count(),1,'both mount/active effects share read');
  await update({away:true});await update({});assert.equal(count(),1,'remount shares in-flight read');
  await act(async()=>{finish({snapshot:snapshot()});await tick();});
  globalThis.piLoadingInvoke=normal;
  await update({target:project});assert.equal(count(),2);
  await update({target});assert.equal(count(),2);assert.equal(lastSummary.loading,false);
  await unmount();
 });
 await scenario('explicit refresh and failed first-read retry make new actual requests',async()=>{
  calls=[];let fail=true;globalThis.piLoadingInvoke=async(command,args)=>{if(fail){calls.push(args.request);throw Error('fixture failure');}return normal(command,args);};
  await mount();assert.equal(count(),1);assert.equal(lastSummary.count,null);
  fail=false;const retry=renderer.root.findAllByType('fixture').find(node=>node.props.component==='Button'&&node.children.includes('重试'));
  await act(async()=>{await retry.props.onClick();await tick();});assert.equal(count(),2);assert.equal(lastSummary.count,1);
  await act(async()=>{await find('Button','刷新扩展包').props.onClick();await tick();});assert.equal(count(),3);
  fail=true;await act(async()=>{await find('Button','刷新扩展包').props.onClick();await tick();});assert.equal(count(),4);assert.equal(lastSummary.loading,false);
  fail=false;await act(async()=>{await find('Button','刷新扩展包').props.onClick();await tick();});assert.equal(count(),5);assert.equal(lastSummary.count,1);
  await unmount();
 });
 await scenario('native edit invalidation while force-mounted inactive rereads exactly once on activation',async()=>{
  calls=[];globalThis.piLoadingInvoke=normal;await mount();await update({active:false});
  cache.invalidate(target);assert.equal(count(),1);
  await update({active:true});assert.equal(count(),2);assert.equal(lastSummary.loading,false);
  await update({active:false});await update({active:true});assert.equal(count(),2);await unmount();
 });
 await scenario('verified mutation updates current cache, invalidates other scope, and defeats a late refresh without stuck loading',async()=>{
  calls=[];globalThis.piLoadingInvoke=normal;await mount();await update({target:project});await update({target});assert.equal(count(),2);
  let finish;
  globalThis.piLoadingInvoke=async(command,args)=>args.request.action==='list'?(calls.push(args.request),new Promise(resolve=>{finish=resolve;})):normal(command,args);
  await act(async()=>{find('Button','刷新扩展包').props.onClick();await tick();});assert.equal(count(),3);
  await act(async()=>{await find('Switch','启用插件 demo').props.onCheckedChange(false);await tick();});
  assert.equal(calls.filter(item=>item.action==='packages').length,1);assert.equal(cache.peek(target).revision,'mutated');assert.equal(lastSummary.loading,false);
  await act(async()=>{finish({snapshot:snapshot('obsolete')});await tick();});
  assert.equal(cache.peek(target).revision,'mutated');assert.equal(lastSummary.packages[0].resources[0].enabled,false);assert.equal(lastSummary.loading,false);
  await update({away:true});await update({});assert.equal(count(),3,'verified current readback reused');
  globalThis.piLoadingInvoke=normal;await update({target:project});assert.equal(count(),4,'other scope invalidated');await unmount();
 });
 await scenario('failed mutation forces a fresh read and remains retryable',async()=>{
  calls=[];globalThis.piLoadingInvoke=normal;await mount();
  globalThis.piLoadingInvoke=async(command,args)=>{if(args.request.action!=='list'){calls.push(args.request);throw Error('fixture mutation failed');}return normal(command,args);};
  await act(async()=>{await find('Switch','启用插件 demo').props.onCheckedChange(false);await tick();});assert.equal(count(),2);assert.equal(lastSummary.loading,false);
  globalThis.piLoadingInvoke=normal;
  await act(async()=>{await find('Switch','启用插件 demo').props.onCheckedChange(false);await tick();});assert.equal(cache.peek(target).packages[0].resources[0].enabled,false);
  await unmount();
 });
 await scenario('unified-page skill switch uses actual resource action, then remount reuses verified readback',async()=>{
  calls=[];globalThis.piLoadingInvoke=normal;await mount({target:project,selected:'pkg'});assert.equal(count(),1);
  await act(async()=>{find('Switch','启用技能 demo').props.onCheckedChange(false);await tick();});await act(tick);
  const mutation=calls.find(item=>item.action==='resource');assert.equal(mutation.resourceId,'skill');assert.equal(mutation.id,'pkg');assert.equal(mutation.state,'unload');assert.deepEqual(mutation.target,project);
  assert.equal(find('Switch','启用技能 demo').props.checked,false);
  await update({away:true,target:project,selected:'pkg'});await update({target:project,selected:'pkg'});assert.equal(count(),1);assert.equal(find('Switch','启用技能 demo').props.checked,false);
  await unmount();
 });
 await scenario('unified project details restore inherited package settings through the existing scoped action',async()=>{
  calls=[];const overridden=snapshot();overridden.packages[0].inherited=true;overridden.packages[0].resources[0].override='unload';overridden.packages[0].resources[0].enabled=false;
  globalThis.piLoadingInvoke=async(command,args)=>{if(args.request.action==='list'){calls.push(args.request);return {snapshot:overridden};}return normal(command,args);};
  await mount({target:project,selected:'pkg'});
  const restore=renderer.root.findAllByType('fixture').find(node=>node.props.component==='Button'&&node.children.includes('恢复继承设置'));assert(restore);assert.equal(restore.props.disabled,false);
  await act(async()=>{restore.props.onClick();await tick();});await act(tick);
  const action=calls.find(item=>item.action==='packages');assert.deepEqual(action.target,project);assert.deepEqual(action.ids,['pkg']);assert.equal(action.state,'inherit');
  assert(!renderer.root.findAllByType('fixture').some(node=>node.props.component==='Button'&&node.children.includes('恢复继承设置')),'verified inherited readback removes reset control');assert.equal(count(),1);
  await update({away:true,target:project,selected:'pkg'});await update({target:project,selected:'pkg'});assert.equal(count(),1);await unmount();
 });
 await scenario('settings save invalidation refreshes all previously viewed scopes even when editor scope differs',async()=>{
  calls=[];globalThis.piLoadingInvoke=normal;await mount();await update({target:project});assert.equal(count(),2);
  await update({away:true,target:project});cache.invalidate();
  await update({target});assert.equal(count(),3);
  await update({target:project});assert.equal(count(),4);
  await update({target});assert.equal(count(),4);await unmount();
 });
 await scenario('force refresh invalidates other cached scopes so external global edits are not hidden on project return',async()=>{
  calls=[];globalThis.piLoadingInvoke=normal;await mount();await update({target:project});await update({target});assert.equal(count(),2);
  await act(async()=>{await find('Button','刷新扩展包').props.onClick();await tick();});assert.equal(count(),3);
  await update({away:true,target:project});await update({target:project});assert.equal(count(),4,'project must reread after explicit global refresh');
  await update({target});assert.equal(count(),4,'current refreshed global remains reusable');await unmount();
 });
 await scenario('project inherited metadata renders skill count and switch without owned inventory and writes only project resource overrides',async()=>{
  calls=[];globalThis.piLoadingInvoke=normal;
  const state={path:'/pkg/demo',file:'/pkg/demo/SKILL.md',rulePath:'/pkg/demo/SKILL.md',name:'Inherited demo',description:'Original description',enabled:true,canToggle:false,reason:'globalInProject',blockingRules:[],settingsPath:'/home/.pi/agent/settings.json',scope:'global',inScope:false,packageIndex:0,packageSource:'/pkg',origin:'package',manualOnly:false,cliAddressable:false,canTrash:false};
  let opened;
  await mount({target:project,selected:'pkg',skills:[],states:[state],onSkill:value=>{opened=value;}});
  assert(find('Switch','启用技能 Inherited demo'));assert.equal(find('Switch','启用技能 Inherited demo').props.disabled,false);
  assert(renderer.root.findAllByType('h2').some(node=>node.children.includes('技能')&&node.findAllByType('span').some(span=>span.children.includes('1'))));
  await act(async()=>{find('Switch','启用技能 Inherited demo').props.onCheckedChange(false);await tick();});await act(tick);
  const mutation=calls.find(item=>item.action==='resource');assert.deepEqual(mutation.target,project);assert.equal(mutation.resourceId,'skill');assert.equal(mutation.state,'unload');
  await act(async()=>renderer.root.findByProps({'aria-label':'查看技能 Inherited demo'}).props.onClick());
  assert.equal(opened.piState,state);assert.equal(opened.path,state.path);assert.equal(opened.piState.canToggle,false);assert.equal(opened.piState.inScope,false);
  await unmount();
 });
 await scenario('Pi package state filters are mutually exclusive, combine with source and restore scope selections without native reads',async()=>{
  calls=[];
  const pkg=(id,enabled,kind='npm')=>({...snapshot().packages[0],id,name:id,kind,resources:enabled.map((enabled,index)=>({id:`${id}-${index}`,path:`/${id}/${index}`,name:id,type:'skills',enabled,override:null}))});
  const packages=[pkg('fully-enabled',[true,true]),pkg('fully-disabled',[false,false],'git'),pkg('partially-enabled',[true,false]),pkg('empty',[])];
  globalThis.piLoadingInvoke=async(command,{request})=>{calls.push(request);assert.equal(request.action,'list');return {snapshot:{...snapshot(),packages}};};
  await mount();
  const choice=label=>renderer.root.findAllByType('fixture').find(node=>node.props.label===label),state=()=>choice('筛选插件状态'),source=()=>choice('扩展包来源');
  const names=()=>renderer.root.findAllByType('button').map(node=>node.props['aria-label']??'').filter(label=>label.startsWith('查看扩展包详情 ')).sort();
  const choose=async(control,value)=>{await act(async()=>control().props.onChange(value));await act(tick);};
  assert.equal(names().length,4);assert.deepEqual(state().props.options.map(item=>item.value),['all','enabled','disabled','partial']);
  await choose(state,'enabled');assert.deepEqual(names(),['查看扩展包详情 fully-enabled']);
  await choose(state,'disabled');assert.deepEqual(names(),['查看扩展包详情 fully-disabled']);
  await choose(state,'partial');assert.deepEqual(names(),['查看扩展包详情 partially-enabled']);
  await choose(source,'git');assert.deepEqual(names(),[]);const clear=renderer.root.findAllByType('fixture').find(node=>node.children.includes('清除筛选'));
  await act(async()=>clear.props.onClick());assert.equal(state().props.value,'all');assert.equal(source().props.value,'all');assert.equal(names().length,4);assert.equal(count(),1);
  await choose(state,'partial');await update({target:project});assert.equal(state().props.value,'all');assert.equal(names().length,4);assert.equal(count(),2);
  await choose(state,'disabled');await update({target});assert.equal(state().props.value,'partial');assert.deepEqual(names(),['查看扩展包详情 partially-enabled']);await update({target:project});assert.equal(state().props.value,'disabled');assert.deepEqual(names(),['查看扩展包详情 fully-disabled']);assert.equal(count(),2);await unmount();
 });
 await scenario('Pi parent filter session restores global and each project after keyed remounts and Clear only changes its own scope',async()=>{
  calls=[];const scopes=[target,project,{...project,projectPath:'/fixture-b'}],expected=[['npm','enabled','fully'],['git','disabled','off'],['npm','partial','mixed']];
  const pkg=(id,kind,enabled)=>({...snapshot().packages[0],id,name:id,kind,resources:enabled.map((enabled,index)=>({id:`${id}-${index}`,path:`/${id}/${index}`,name:id,type:'skills',enabled,override:null}))});
  const packages=[pkg('fully','npm',[true,true]),pkg('off','git',[false]),pkg('mixed','npm',[true,false])];
  globalThis.piLoadingInvoke=async(command,{request})=>{calls.push(request);assert.equal(request.action,'list');return {snapshot:{...snapshot(),packages}};};
  await mount();
  const choice=label=>renderer.root.findAllByType('fixture').find(node=>node.props.label===label),source=()=>choice('扩展包来源'),state=()=>choice('筛选插件状态'),query=()=>find('Input','搜索扩展包');
  const change=async(node,value)=>{await act(async()=>node.props.onChange(value));await act(tick);};
  const search=async value=>{await act(async()=>query().props.onChange({target:{value}}));await act(tick);};
  for(const [index,scope]of scopes.entries()){await update({target:scope});assert.equal(source().props.value,'all');assert.equal(state().props.value,'all');assert.equal(query().props.value,'');await change(source(),expected[index][0]);await change(state(),expected[index][1]);await search(expected[index][2]);}
  assert.equal(count(),3);
  for(const index of [2,1,0]){const scope=scopes[index];await update({target:scope});assert.equal(source().props.value,expected[index][0]);assert.equal(state().props.value,expected[index][1]);assert.equal(query().props.value,expected[index][2]);await update({away:true,target:scope});await update({target:scope});assert.equal(source().props.value,expected[index][0]);assert.equal(state().props.value,expected[index][1]);assert.equal(query().props.value,expected[index][2]);}
  await search('not-installed');await act(async()=>renderer.root.findAllByType('fixture').find(node=>node.children.includes('清除筛选')).props.onClick());assert.equal(source().props.value,'all');assert.equal(state().props.value,'all');assert.equal(query().props.value,'');
  await update({target:project});assert.equal(source().props.value,'git');assert.equal(state().props.value,'disabled');assert.equal(query().props.value,'off');await update({target:scopes[2]});assert.equal(state().props.value,'partial');assert.equal(query().props.value,'mixed');assert.equal(count(),3,'returning views never makes another native list request');await unmount();
 });
 const updatePackage=(id,extra={})=>({...snapshot().packages[0],id,name:id,source:`npm:${id}`,kind:'npm',canUpdate:true,...extra});
 const updateInventory=(packages,revision='r',extra={})=>({...snapshot(revision),packages,...extra});
 const checked=(pkg,status='available',updateable=true,scope='user')=>({updated:false,error:null,affected:[{source:pkg.source,scope,root:pkg.path,status,installed:'1.0.0',latest:status==='current'?'1.0.0':'2.0.0',updateable,localState:'unchanged',message:''}]});
 const updates=()=>renderer.root.findAllByType('fixture').filter(node=>node.props.component==='Button'&&/^(更新 |Update )/.test(node.props['aria-label']??''));
 const check=async()=>{await act(async()=>{find('Button','检查更新').props.onClick();await tick();});await act(tick);};
 await scenario('toolbar checks deduplicate sources per scope, chain revisions and retain successes after failures',async()=>{
  for(const scope of [target,project]){
   calls=[];globalThis.piLoadingErrors=[];
   const packages=[updatePackage('available-a',{source:'npm:shared'}),updatePackage('available-b',{source:'npm:shared',scope:'project'}),updatePackage('current',{kind:'git',source:'git:current'}),updatePackage('pinned',{source:'npm:pinned@1'}),updatePackage('blocked'),updatePackage('local',{kind:'local',source:'/local',canUpdate:false}),updatePackage('rejected',{kind:'git',source:'git:rejected'}),updatePackage('error-result')];
   let revision=0;
   globalThis.piLoadingInvoke=async(command,{request})=>{
    assert.equal(command,'upstream_pi_packages');calls.push(request);
    if(request.action==='list')return {snapshot:updateInventory(packages)};
    assert.equal(request.action,'check');
    assert.equal(request.revision,revision?`checked-${revision}`:'r');
    const pkg=packages.find(pkg=>pkg.id===request.id);
    if(pkg.id==='rejected')throw Error('fixture network failure');
    const current=updateInventory(packages,`checked-${++revision}`);
    const result=checked(pkg,pkg.id==='pinned'?'pinned':pkg.id==='current'?'current':'available',!['pinned','blocked'].includes(pkg.id),scope.scope==='project'?'project':'user');
    if(pkg.id==='error-result')result.error='fixture rejected result';
    return {snapshot:current,update:result};
   };
   await mount({target:scope});assert.equal(updates().length,0);assert.equal(find('Button','检查更新').props.disabled,false);
   await check();
   const checks=calls.filter(item=>item.action==='check');
   assert.deepEqual(checks.map(item=>item.id),['available-b','current','pinned','blocked','rejected','error-result']);
   assert(checks.every(item=>JSON.stringify(item.target)===JSON.stringify(scope)));
   assert.deepEqual(updates().map(node=>node.props['aria-label']).sort(),['更新 available-a','更新 available-b']);
   assert.equal(find('PiPackageUpdateDialog').props.review,null,'batch checks never open a confirmation automatically');
   assert.equal(calls.filter(item=>item.action==='update').length,0);
   assert.equal(globalThis.piLoadingErrors.length,1);assert.match(globalThis.piLoadingErrors[0][0],/rejected:.*fixture network failure/);assert.match(globalThis.piLoadingErrors[0][0],/error-result:.*fixture rejected result/);
   assert.equal(find('Button','检查更新').props['aria-busy'],false);assert.equal(find('Button','检查更新').props.disabled,false);await unmount();
  }
  delete globalThis.piLoadingErrors;
 });
 await scenario('checked update arrows clear on recheck, then open the existing reviewed update flow only after activation',async()=>{
  calls=[];const pkg=updatePackage('available'),packages=[pkg];let status='available',revision=0,failCheck=false;
  globalThis.piLoadingInvoke=async(command,{request})=>{calls.push(request);if(request.action==='list')return {snapshot:updateInventory(packages)};if(request.action==='check'){if(failCheck)throw Error('fixture recheck failed');return {snapshot:updateInventory(packages,`checked-${++revision}`),update:checked(pkg,status)};}assert.equal(request.action,'update');return {snapshot:updateInventory(packages,'updated'),update:{...checked(pkg,'current'),updated:true}};};
  await mount();await cache.load(project);assert(cache.peek(project));assert.equal(updates().length,0);
  await check();assert.equal(updates().length,1);assert(cache.peek(project),'read-only checks preserve other scope inventories');
  assert.equal(updates()[0].props.variant,'ghost');assert.equal(updates()[0].props.size,'icon-sm');
  assert.equal(updates()[0].findAllByType('fixture').find(node=>node.props.component==='CircleArrowUpIcon').props.className,'text-skill-update');
  failCheck=true;await check();assert.equal(updates().length,0,'a failed recheck must clear the old available arrow');failCheck=false;
  status='current';await check();assert.equal(updates().length,0,'a newer current observation removes the old available result');
  status='available';await check();const beforeCheck=calls.filter(item=>item.action==='check').length;
  await act(async()=>updates()[0].props.onClick());const dialog=find('PiPackageUpdateDialog');assert.equal(dialog.props.review.affected[0].status,'available');
  assert.equal(calls.filter(item=>item.action==='check').length,beforeCheck,'the arrow uses the reviewed check instead of requesting another');
  const expected=dialog.props.review.affected;await act(async()=>{dialog.props.onUpdate();await tick();});await act(tick);
  const mutation=calls.find(item=>item.action==='update');assert.deepEqual(mutation.expected,expected);assert.equal(mutation.id,pkg.id);assert.equal(mutation.revision,'checked-3');assert.deepEqual(mutation.target,target);
  assert.equal(find('PiPackageUpdateDialog').props.review,null);assert.equal(updates().length,0);assert.equal(cache.peek(project),null,'confirmed update invalidates other scopes');await unmount();
 });
 await scenario('single package update retains other arrows on success and failure but clears same-source copies',async()=>{
  for(const fail of [false,true]){
   calls=[];const first=updatePackage('first',{source:'npm:shared'}),copy=updatePackage('copy',{source:'npm:shared',scope:'project',path:'/copy'}),unaffected=updatePackage('unaffected',{source:'npm:shared',scope:'project',path:'/unaffected'}),second=updatePackage('second'),packages=[first,copy,unaffected,second];
   globalThis.piLoadingInvoke=async(command,{request})=>{calls.push(request);if(request.action==='list')return {snapshot:updateInventory(packages)};const pkg=packages.find(item=>item.id===request.id);if(request.action==='check'){const result=checked(pkg);if(pkg.source===first.source)result.affected=[...checked(first).affected,...checked(copy,'available',true,'project').affected,...checked(unaffected,'pinned',false,'project').affected];return {snapshot:updateInventory(packages,'checked'),update:result};}assert.equal(request.action,'update');if(fail)throw Error('fixture update failed');return {snapshot:updateInventory(packages,'updated'),update:{...checked(pkg,'current'),updated:true}};};
   await mount();await check();assert.equal(updates().length,4);await act(async()=>updates().find(node=>node.props['aria-label']==='更新 first').props.onClick());
   await act(async()=>{find('PiPackageUpdateDialog').props.onUpdate();await tick();});await act(tick);
   assert.deepEqual(updates().map(node=>node.props['aria-label']).sort(),['更新 second','更新 unaffected'],'only actual non-pinned scope/root copies lose arrows, including failed update refresh');
   const before=calls.filter(item=>item.action==='check').length;await act(async()=>updates().find(node=>node.props['aria-label']==='更新 second').props.onClick());assert.equal(find('PiPackageUpdateDialog').props.review.affected[0].source,second.source);assert.equal(calls.filter(item=>item.action==='check').length,before,'other card retains usable reviewed result');
   await unmount();
  }
 });
 await scenario('pending checks suppress duplicates and stale scope replies; scope changes and explicit refresh clear arrows',async()=>{
  calls=[];const pkg=updatePackage('available'),packages=[pkg];let finish,pending=true;
  globalThis.piLoadingInvoke=async(command,{request})=>{calls.push(request);if(request.action==='list')return {snapshot:updateInventory(packages)};if(pending)return new Promise(resolve=>{finish=resolve;});return {snapshot:updateInventory(packages,'checked'),update:checked(pkg)};};
  await mount();const start=find('Button','检查更新').props.onClick;
  await act(async()=>{start();start();await tick();});assert.equal(calls.filter(item=>item.action==='check').length,1);assert.equal(find('Button','检查更新').props['aria-busy'],true);assert.equal(find('Button','检查更新').props.disabled,true);assert.equal(find('Button','刷新扩展包').props.disabled,false,'read-only checks leave Refresh available');
  await update({target:project});await act(async()=>{finish({snapshot:updateInventory(packages,'old-global'),update:checked(pkg)});await tick();});await act(tick);
  assert.equal(updates().length,0,'the previous scope check cannot populate project card actions');assert.equal(cache.peek(project).revision,'r');assert.equal(find('Button','检查更新').props['aria-busy'],false);
  pending=false;await check();assert.equal(updates().length,1);
  await act(async()=>{find('Button','刷新扩展包').props.onClick();await tick();});await act(tick);assert.equal(updates().length,0);
  await check();assert.equal(updates().length,1);await update({target});assert.equal(updates().length,0);await unmount();
 });
 await scenario('Pi delayed toolbar and detail checks are local busy; refresh and writes defeat obsolete results and errors',async()=>{
  for(const single of [false,true]){
   calls=[];busyEvents=[];globalThis.piLoadingErrors=[];const pkg=updatePackage('available'),packages=[pkg],requests=[];let finishWrite;
   globalThis.piLoadingInvoke=async(command,{request})=>{calls.push(request);if(request.action==='list')return {snapshot:updateInventory(packages,'fresh')};if(request.action==='check')return new Promise((resolve,reject)=>requests.push({resolve,reject}));if(request.action==='packages')return new Promise(resolve=>{finishWrite=resolve;});throw Error(request.action);};
   await mount(single?{selected:pkg.id}:{});
   const checkButton=()=>renderer.root.findAllByType('fixture').find(node=>node.props.component==='Button'&&(single?node.children.includes('检查更新'):node.props['aria-label']==='检查更新'));
   const start=checkButton().props.onClick;await act(async()=>{start();start();await tick();});assert.equal(requests.length,1);assert.deepEqual(busyEvents,[]);assert.equal(checkButton().props.disabled,true);assert.equal(checkButton().props['aria-busy'],true);
   if(single){assert.equal(find('BackButton').props.disabled,false);assert.equal(find('Switch','启用技能 demo').props.disabled,false);assert.equal(renderer.root.findAllByType('fixture').find(node=>node.props.component==='Button'&&node.children.includes('卸载')).props.disabled,false);await update({});}
   assert.equal(find('Button','刷新扩展包').props.disabled,false);assert.equal(find('Input','搜索扩展包').props.disabled,undefined);
   await act(async()=>{find('Button','刷新扩展包').props.onClick();await tick();});await act(tick);assert.equal(cache.peek(target).revision,'fresh');await check();assert.equal(requests.length,2);
   await act(async()=>{if(single)requests[0].resolve({snapshot:updateInventory(packages,'obsolete'),update:checked(pkg)});else requests[0].reject(Error('obsolete error'));await tick();});await act(tick);assert.equal(find('Button','检查更新').props['aria-busy'],true,'old finally cannot clear a new check');assert.equal(cache.peek(target).revision,'fresh');assert.equal(find('PiPackageUpdateDialog').props.review,null);assert.deepEqual(globalThis.piLoadingErrors,[]);
   await act(async()=>{requests[1].resolve({snapshot:updateInventory(packages,'observed'),update:checked(pkg,'current')});await tick();});assert.equal(find('Button','检查更新').props['aria-busy'],false);assert.deepEqual(busyEvents,[]);
   await check();await act(async()=>{find('Switch','启用插件 available').props.onCheckedChange(false);await tick();});assert.deepEqual(busyEvents,[true]);assert.equal(find('Switch','启用插件 available').props.disabled,true);
   const written=packages.map(item=>({...item,resources:item.resources.map(resource=>({...resource,enabled:false}))}));await act(async()=>{finishWrite({snapshot:updateInventory(written,'written')});await tick();});await act(async()=>{requests[2].resolve({snapshot:updateInventory(packages,'old-write'),update:checked(pkg)});await tick();});assert.equal(cache.peek(target).revision,'written');assert.equal(find('Switch','启用插件 available').props.checked,false);assert.equal(find('PiPackageUpdateDialog').props.review,null);assert.deepEqual(busyEvents,[true,false]);await unmount();
  }
  delete globalThis.piLoadingErrors;
 });
 await scenario('Pi switching scope starts immediately and stale finally cannot clear the active scope check',async()=>{
  calls=[];busyEvents=[];const pkg=updatePackage('available'),packages=[pkg],requests=[];
  globalThis.piLoadingInvoke=async(command,{request})=>{calls.push(request);if(request.action==='list')return {snapshot:updateInventory(packages)};return new Promise((resolve,reject)=>requests.push({resolve,reject}));};
  await mount();await check();await update({target:project});await check();assert.equal(requests.length,2);
  await act(async()=>{requests[0].resolve({snapshot:updateInventory(packages,'old'),update:checked(pkg)});await tick();});assert.equal(find('Button','检查更新').props['aria-busy'],true);assert.equal(cache.peek(project).revision,'r');assert.equal(find('PiPackageUpdateDialog').props.review,null);
  await act(async()=>{requests[1].resolve({snapshot:updateInventory(packages,'project-current'),update:checked(pkg,'current')});await tick();});assert.equal(find('Button','检查更新').props['aria-busy'],false);assert.deepEqual(busyEvents,[]);await unmount();
 });
 await scenario('Pi leave-detail and confirmation intents prevent late single-check modals; cached update remains usable during another check',async()=>{
  for(const intent of ['back','other-detail','remove','add','disabled']){
   calls=[];busyEvents=[];globalThis.piLoadingErrors=[];const pkg=updatePackage('available'),other=updatePackage('other'),packages=[pkg,other];let finish;
   globalThis.piLoadingInvoke=async(command,{request})=>{calls.push(request);if(request.action==='list')return {snapshot:updateInventory(packages)};return new Promise((resolve,reject)=>{finish={resolve,reject};});};
   await mount({selected:pkg.id});await act(async()=>{renderer.root.findAllByType('fixture').find(node=>node.props.component==='Button'&&node.children.includes('检查更新')).props.onClick();await tick();});
   if(intent==='remove')await act(async()=>renderer.root.findAllByType('fixture').find(node=>node.props.component==='Button'&&node.children.includes('卸载')).props.onClick());
   else if(intent==='disabled')await update({selected:pkg.id,disabled:true});
   else {await update(intent==='other-detail'?{selected:other.id}:{});if(intent==='add')await act(async()=>renderer.root.findAllByType('fixture').find(node=>node.props.component==='Button'&&node.children.includes('添加')).props.onClick());}
   await act(async()=>{if(intent==='other-detail')finish.reject(Error('old detail error'));else finish.resolve({snapshot:updateInventory(packages,'late'),update:checked(pkg)});await tick();});assert.deepEqual(globalThis.piLoadingErrors,[]);assert.equal(find('PiPackageUpdateDialog').props.review,null,`${intent} must not get the old check confirmation`);assert.deepEqual(busyEvents,[]);if(['remove','add','disabled'].includes(intent))assert.equal(cache.peek(target).revision,'r');await unmount();
  }
  calls=[];busyEvents=[];const a=updatePackage('a'),b=updatePackage('b'),packages=[a,b];let finishB;
  globalThis.piLoadingInvoke=async(command,{request})=>{calls.push(request);if(request.action==='list')return {snapshot:updateInventory(packages)};if(request.id==='a')return {snapshot:updateInventory(packages),update:checked(a)};return new Promise(resolve=>{finishB=resolve;});};
  await mount();await check();assert.equal(find('Button','检查更新').props['aria-busy'],true);assert.equal(find('Button','更新 a').props.disabled,false);await act(async()=>find('Button','更新 a').props.onClick());assert.equal(find('PiPackageUpdateDialog').props.packageName,'a');await act(async()=>{finishB({snapshot:updateInventory(packages,'late-b'),update:checked(b)});await tick();});assert.equal(find('PiPackageUpdateDialog').props.packageName,'a');assert.deepEqual(busyEvents,[]);await unmount();
 });
 await scenario('non-updatable packages and untrusted projects do not offer an executable bulk check',async()=>{
  for(const state of [updateInventory([updatePackage('local',{kind:'local',canUpdate:false})]),updateInventory([updatePackage('available')],'r',{projectTrusted:false})]){
   calls=[];globalThis.piLoadingInvoke=async(command,{request})=>{calls.push(request);return {snapshot:state};};await mount({target:project});assert.equal(find('Button','检查更新').props.disabled,true);await check();assert.equal(calls.filter(item=>item.action==='check').length,0);assert.equal(updates().length,0);await unmount();
  }
 });
 } finally {await rm(work,{recursive:true,force:true});delete globalThis.piLoadingInvoke;delete globalThis.piLoadingErrors;}
});

test('actual App document reader uses global validation only for inherited Pi reads and leaves project write context intact',async()=>{
 const require=createRequire(import.meta.resolve('vite')),ts=require('typescript');
 const source=await readFile('src/App.tsx','utf8');
 const ast=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let declaration;
 function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='openDetail')declaration=node;ts.forEachChild(node,visit);}
 visit(ast);assert(declaration,'App must expose the actual skill document read path');
 const body=ts.transpileModule(declaration.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const variables=['invoke','activeSkillAgent','target','dshContextKey','documentRequest','setDocumentLoading','setDocument','setDocumentPluginVersion','setDocumentVersion','setDocumentRevision','setDocumentLocalState','setSourceDirectory','setDetail','setError','t','setDocumentReadState','dshNativeBatch','documentIdentity'];
 const makeReader=new Function(...variables,body+';return openDetail;');
 const target={host:'local',scope:'project',projectPath:'/project'};
 const inherited={name:'demo',path:'/global/pkg/skills/demo',piState:{scope:'global',inScope:false,canToggle:false,file:'/global/pkg/skills/demo/SKILL.md'}};
 for(const [agent,skill,expected]of [
  ['pi',inherited,{host:'local',scope:'global',projectPath:null}],
  ['pi',{...inherited,piState:{...inherited.piState,scope:'project',inScope:true}},target],
  ['codex',inherited,target],
 ]){
  const calls=[];const noop=()=>{};
  const reader=makeReader(async(command,args)=>{calls.push({command,args});return {content:'Fixture',version:null,revision:null,localState:null};},agent,target,null,{current:0},...Array(9).fill(noop),(cn)=>cn,noop,false,{current:null});
  await reader(skill);assert.equal(calls.length,1);assert.equal(calls[0].command,'upstream_document');assert.deepEqual(calls[0].args.target,expected);assert.equal(calls[0].args.path,skill.path);
 }
 assert.deepEqual(target,{host:'local',scope:'project',projectPath:'/project'});
 assert.equal(inherited.piState.canToggle,false);
});

test('Pi update confirmation preserves the actual installation scopes and existing action guards',{skip:!modules},async t=>{
 const root=process.cwd(),work=await mkdtemp(join(tmpdir(),'skills-space-pi-update-scope-'));
 const require=createRequire(import.meta.resolve('vite')),{build}=require('esbuild');
 const reactPath=resolve(modules,'react/index.js');
 const React=await import(reactPath),{create,act}=await import(resolve(modules,'react-test-renderer/index.js'));
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const source=await readFile('src/components/pi-package-update-dialog.tsx','utf8');
 const names=[...new Set([...source.matchAll(/import \{([^}]+)\} from "(?:lucide-react|@\/components\/[^\"]+)"/g)].flatMap(match=>match[1].split(',').map(name=>name.trim())))];
 const outfile=join(work,'subject.mjs');
 await build({stdin:{contents:"export {PiPackageUpdateDialog} from './src/components/pi-package-update-dialog';",resolveDir:root},bundle:true,platform:'node',format:'esm',outfile,jsx:'automatic',plugins:[{name:'update-scope-fixtures',setup(b){
  b.onResolve({filter:/^react(?:\/.*)?$/},a=>({path:a.path==='react'?reactPath:resolve(modules,a.path+'.js'),external:true}));
  b.onResolve({filter:/^(?:lucide-react|@\/components\/)/},()=>({path:'ui',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`import {createElement} from 'react';const view=name=>({children,...props})=>createElement('fixture',{...props,component:name},children);export const ${names.map(name=>name+`=view('${name}')`).join(',')};`}));
  b.onResolve({filter:/^@\//},a=>{const base=resolve(root,'src',a.path.slice(2));return {path:['.ts','.tsx'].map(ext=>base+ext).find(existsSync)};});
 }}]});
 const {PiPackageUpdateDialog}=await import(pathToFileURL(outfile));
 const item=(scope,extra={})=>({scope,source:'npm:scope-fixture',root:`/fixture/${scope}/scope-fixture`,status:'available',installed:'1.0.0',latest:'1.1.0',updateable:true,localState:'unverified',message:'',...extra});
 let renderer,updates=0,closes=0;
 const props=(affected,extra={})=>({review:{updated:false,error:null,issues:[],affected},packageName:'Scope fixture',busy:false,zh:true,home:'/fixture',onClose:()=>closes++,onUpdate:()=>updates++,...extra});
 const render=async(affected,extra={})=>act(async()=>{renderer=create(React.createElement(PiPackageUpdateDialog,props(affected,extra)));});
 const close=async()=>act(async()=>renderer.unmount());
 const control=name=>renderer.root.findAllByType('fixture').find(node=>node.props.component===name);
 const text=node=>{const parts=[];const scan=value=>{if(typeof value==='string')parts.push(value);else if(Array.isArray(value))value.forEach(scan);else if(value?.children)scan(value.children);};scan(node);return parts.join('');};
 const description=()=>text(control('AlertDialogDescription'));
 try{
  for(const [scopes,impact]of [
   [['user'],'更新全局安装，影响使用此扩展包的项目。'],
   [['project'],'仅更新当前项目中的安装。'],
   [['user','project'],'同时更新全局和当前项目中的安装。'],
  ])await t.test(`${scopes.join('+')} installations are disclosed before the update`,async()=>{
   await render(scopes.map(scope=>item(scope)));
   assert(description().includes(impact));assert.equal(control('AlertDialogAction').props.disabled,false);
   let prevented=false;await act(async()=>control('AlertDialogAction').props.onClick({preventDefault(){prevented=true;}}));assert(prevented);assert(updates>0);
   assert.equal(renderer.root.findAllByType('dt').length,1,'one source/version row remains grouped');
   const rowText=text(renderer.root.findByType('dt'));
   for(const scope of scopes)assert(rowText.includes(scope==='user'?'全局':'当前项目'));
   await close();
  });
  await t.test('an up-to-date installation stays visible when the same source also updates another scope',async()=>{
   await render([item('project'),item('user',{status:'current',installed:'1.1.0'})]);
   assert(description().includes('同时更新全局和当前项目'));
   assert.equal(renderer.root.findAllByType('dt').length,2);
   const rendered=text(renderer.toJSON());assert(rendered.includes('全局'));assert(rendered.includes('当前项目'));assert(rendered.includes('已是最新版本'));
   assert.equal(control('AlertDialogAction').props.disabled,false);await close();
  });
  await t.test('a pinned installation remains listed but is not described as an installation being updated',async()=>{
   await render([item('project'),item('user',{status:'pinned',installed:'1.0.0',latest:'1.0.0'})]);
   assert(description().includes('仅更新当前项目'));assert(!description().includes('同时更新全局'));
   assert.equal(renderer.root.findAllByType('dt').length,2);assert(text(renderer.toJSON()).includes('全局'));assert(text(renderer.toJSON()).includes('版本已固定，不参与更新。'));
   assert.equal(control('AlertDialogAction').props.disabled,false,'the original runtime skips pinned rows rather than blocking another scope');await close();
  });
  await t.test('English confirmation keeps the consequence and global impact as readable sentences',async()=>{
   await render([item('user')],{zh:false});
   assert(description().includes('local edits. Updates the global installation'));
   assert(text(renderer.root.findByType('dt')).includes('Global'));await close();
  });
  await t.test('busy confirmation cannot close or reapply, and failed operations retain the recheck action',async()=>{
   closes=0;updates=0;await render([item('user')],{busy:true});
   assert.equal(control('AlertDialogAction').props.disabled,true);assert.equal(control('AlertDialogCancel').props.disabled,true);
   await act(async()=>control('AlertDialog').props.onOpenChange(false));assert.equal(closes,0);
   let prevented=false;control('AlertDialogContent').props.onEscapeKeyDown({preventDefault(){prevented=true;}});assert(prevented);
   await close();
   await render([item('project')],{review:{affected:[item('project')],updated:false,error:'fixture error',issues:[]}});
   assert.equal(control('AlertDialogAction').props.disabled,false);assert(text(renderer.toJSON()).includes('重新检查'));
   await act(async()=>control('AlertDialogAction').props.onClick({preventDefault(){}}));assert.equal(updates,1);
   await act(async()=>control('AlertDialog').props.onOpenChange(false));assert.equal(closes,1);await close();
  });
 }finally{await rm(work,{recursive:true,force:true});}
});
