// Opt-in hook/component lifecycle checks. Renderer dependencies stay outside
// the application: SKILLS_SPACE_REACT_TEST_MODULES=/path/to/node_modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const modules=process.env.SKILLS_SPACE_REACT_TEST_MODULES;
test('Codex loading lifecycle: locale reuse, concurrent reads, target isolation and explicit refresh',{skip:!modules},async t=>{
 const root=process.cwd(),work=await mkdtemp(join(tmpdir(),'skills-space-loading-'));
 const require=createRequire(import.meta.resolve('vite')),{build}=require('esbuild');
 const reactPath=resolve(modules,'react/index.js');
 const React=await import(reactPath),{create,act}=await import(resolve(modules,'react-test-renderer/index.js'));
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const uiSource=(await Promise.all(['src/components/codex-plugin-directory.tsx','src/components/codex-management.tsx'].map(path=>readFile(path,'utf8')))).join('\n');
 const uiNames=[...new Set([...uiSource.matchAll(/import \{([^}]+)\} from '(?:lucide-react|@\/components\/[^']+)'/g)].flatMap(match=>match[1].split(',').map(name=>name.trim())))];
 const outfile=join(work,'subject.mjs');
 await build({stdin:{contents:"export {useCodexManagement} from './src/hooks/use-codex-management';export {CodexPluginDirectory} from './src/components/codex-plugin-directory';export {CodexManagement} from './src/components/codex-management';",resolveDir:root},bundle:true,platform:'node',format:'esm',outfile,jsx:'automatic',plugins:[{name:'loading-fixtures',setup(b){
  b.onResolve({filter:/^react(?:\/.*)?$/},a=>({path:a.path==='react'?reactPath:resolve(modules,a.path+'.js'),external:true}));
  b.onResolve({filter:/^@\/components\/codex-management$/},()=>({path:resolve(root,'src/components/codex-management.tsx')}));
  b.onResolve({filter:/^@tauri-apps\/api\/core$/},()=>({path:'invoke',namespace:'fixture'}));
  b.onResolve({filter:/^@\/lib\/notifications$/},()=>({path:'notifications',namespace:'fixture'}));
  b.onResolve({filter:/^(?:lucide-react|@\/components\/)/},()=>({path:'ui',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='invoke'?'export const invoke=(...args)=>globalThis.loadingProbeInvoke(...args);':a.path==='notifications'?"import {useState} from 'react';export const notifySuccess=()=>{};export function useFeedbackError(){return useState('');}":`import {createElement} from 'react';const View=({children,...props})=>createElement('fixture',props,children);export const ${uiNames.map(name=>name+'=View').join(',')};`}));
  b.onResolve({filter:/^@\//},a=>{const base=resolve(root,'src',a.path.slice(2));return {path:['.ts','.tsx'].map(ext=>base+ext).find(existsSync)};});
 }}]});
 const {useCodexManagement,CodexPluginDirectory,CodexManagement}=await import(pathToFileURL(outfile));
 const target={host:'local',scope:'global',projectPath:null};
 const snapshot={contextId:'global',catalogRequested:true,pluginsComplete:true,binary:'/codex',version:'fixture',codexHome:'/home',configPath:'/config',revision:'r',skills:[],plugins:[],rules:[],warnings:[],capabilities:{}};
 const response={snapshot:null,publicSections:[],personalSections:[],accountRequired:false,publicError:null,personalError:null};
 let result,calls=[];
 const count=command=>calls.filter(call=>call.command===command).length;
 const tick=()=>new Promise(r=>setTimeout(r,15));
 const normal=async(command,args)=>{calls.push({command,args});if(command==='upstream_codex_account_status')return {state:'ready',attemptId:null};if(command==='upstream_codex_settings')return {...snapshot,contextId:args.target.scope};if(command==='upstream_codex_plugin_directory')return response;throw Error(command);};
 function Probe({management=false,query='',...props}){result=useCodexManagement({active:true,directoryActive:true,target,zh:true,onBusy:()=>{},onSaved:()=>{},...props});return management?React.createElement(CodexManagement,{snapshot:result.snapshot,loading:result.loading,disabled:result.working,project:props.target?.scope==='project',zh:true,checks:result.checks,checkingUpdates:result.checkingUpdates,onCheckAll:result.checkPlugins,onUpdate:result.reviewPluginUpdate,query,source:'all',status:'all',setSource:()=>{},setStatus:()=>{},onOpen:()=>{},onMarkets:()=>{},onAdd:()=>{},onQuery:()=>{},onRefresh:()=>result.load(true),onAction:result.plugin,onBatch:result.pluginBatch}):null;}
 let renderer;
 const selectedCase=process.env.SKILLS_SPACE_CODEX_LOADING_CASE;
 const scenario=(name,run)=>t.test(name,{skip:!!selectedCase&&!name.includes(selectedCase)},run);
 try{
 await scenario('first open scans once; locale changes read metadata only; returning locale and directory reuse results',async()=>{
  calls=[];globalThis.loadingProbeInvoke=normal;
  await act(async()=>{renderer=create(React.createElement(Probe));await tick();});await act(tick);
  assert.equal(count('upstream_codex_settings'),1);assert.equal(count('upstream_codex_account_status'),1);assert.equal(count('upstream_codex_plugin_directory'),1);
  await act(async()=>{renderer.update(React.createElement(Probe,{zh:false}));await tick();});
  assert.equal(count('upstream_codex_settings'),1);assert.equal(count('upstream_codex_account_status'),1);
  assert(calls.filter(call=>call.command==='upstream_codex_plugin_directory').every(call=>call.args.metadataOnly===true));
  await act(async()=>{renderer.update(React.createElement(Probe,{zh:true}));await tick();});
  assert.equal(count('upstream_codex_plugin_directory'),2);
  await act(async()=>{renderer.update(React.createElement(Probe,{directoryActive:false}));});
  await act(async()=>{renderer.update(React.createElement(Probe));await tick();});
  assert.equal(count('upstream_codex_plugin_directory'),2);
  await act(async()=>{await result.loadDirectory();});assert.equal(count('upstream_codex_settings'),2);assert.equal(count('upstream_codex_plugin_directory'),3);
  await act(async()=>renderer.unmount());
 });
 await scenario('equivalent target objects and local inventory arriving during a read do not start a second scan',async()=>{
  calls=[];let finish;
  globalThis.loadingProbeInvoke=async(command,args)=>command==='upstream_codex_settings'?(calls.push({command,args}),new Promise(resolve=>{finish=resolve;})):normal(command,args);
  await act(async()=>{renderer=create(React.createElement(Probe,{directoryActive:false}));await tick();});
  await act(async()=>{renderer.update(React.createElement(Probe,{directoryActive:false,target:{...target},initialSnapshot:{...snapshot,catalogRequested:false}}));});
  assert.equal(count('upstream_codex_settings'),1);
  await act(async()=>{finish(snapshot);await tick();});await act(async()=>renderer.unmount());
 });
 await scenario('a complete incoming snapshot avoids scanning and target changes discard old directory metadata',async()=>{
  calls=[];globalThis.loadingProbeInvoke=normal;
  await act(async()=>{renderer=create(React.createElement(Probe,{initialSnapshot:snapshot}));await tick();});
  assert.equal(count('upstream_codex_settings'),0);
  await act(async()=>{renderer.update(React.createElement(Probe,{target:{...target,scope:'project',projectPath:'/fixture'}}));await tick();});await act(tick);
  assert.equal(result.snapshot.contextId,'project');assert.equal(count('upstream_codex_settings'),1);assert.equal(count('upstream_codex_plugin_directory'),2);
  await act(async()=>renderer.unmount());
 });
 await scenario('directory failures remain retryable rather than cached as success',async()=>{
  calls=[];let fail=true;globalThis.loadingProbeInvoke=async(command,args)=>{if(command==='upstream_codex_plugin_directory'&&fail){calls.push({command,args});throw Error('fixture directory unavailable');}return normal(command,args);};
  await act(async()=>{renderer=create(React.createElement(Probe));await tick();});await act(tick);assert.match(result.directory.publicError,/unavailable/);
  fail=false;await act(async()=>{await result.loadDirectory();});assert.equal(result.directory.publicError,null);
  await act(async()=>renderer.unmount());
 });
 await scenario('general inventory readiness prevents competing startup scans and accepts the verified write snapshot',async()=>{
  calls=[];globalThis.loadingProbeInvoke=normal;
  await act(async()=>{renderer=create(React.createElement(Probe,{inventoryReady:false}));await tick();});
  assert.equal(calls.length,0);
  await act(async()=>{renderer.update(React.createElement(Probe,{inventoryReady:true,initialSnapshot:{...snapshot,catalogRequested:false}}));await tick();});await act(tick);
  assert.equal(count('upstream_codex_settings'),1);assert.equal(count('upstream_codex_plugin_directory'),1);
  const verified=result.snapshot;
  await act(async()=>renderer.update(React.createElement(Probe,{inventoryReady:false,initialSnapshot:verified})));
  await act(async()=>{renderer.update(React.createElement(Probe,{inventoryReady:true,initialSnapshot:verified}));await tick();});
  assert.equal(count('upstream_codex_settings'),1,'The write readback must not trigger another full scan after the general inventory finishes');
  await act(async()=>renderer.unmount());
 });
 await scenario('a late directory reply from another target cannot overwrite the current project',async()=>{
  calls=[];const replies=[];globalThis.loadingProbeInvoke=async(command,args)=>command==='upstream_codex_plugin_directory'?(calls.push({command,args}),new Promise(resolve=>replies.push(resolve))):normal(command,args);
  await act(async()=>{renderer=create(React.createElement(Probe,{initialSnapshot:snapshot}));await tick();});
  await act(async()=>{renderer.update(React.createElement(Probe,{target:{...target,scope:'project',projectPath:'/other'}}));await tick();});await act(tick);
  assert.equal(replies.length,2);
  await act(async()=>{replies[1](response);await tick();});
  await act(async()=>{replies[0]({...response,publicError:'obsolete reply'});await tick();});
  assert.equal(result.directory.snapshot.contextId,'project');assert.equal(result.directory.publicError,null);
  await act(async()=>renderer.unmount());
 });
 await scenario('category reads ignore parent loading flips and reuse the current locale, with explicit refresh available',async()=>{
  let reads=0;const readCategory=async()=>{reads++;return {title:'Service title',description:null,plugins:[],nextPageToken:null};};
  const directory={...response,snapshot,publicSections:[{id:'category',title:'Service title',urlSlug:'productivity',kind:'public',plugins:[]}]};
  const props={canManageMarkets:true,directory,loading:false,disabled:false,zh:true,query:'',view:{tab:'public',section:directory.publicSections[0]},onQuery:()=>{},onBack:()=>{},onRefresh:()=>{},onMarkets:()=>{},onAuthorize:()=>{},onOpen:()=>{},onInstall:()=>{},onAction:()=>{},onView:()=>{},readCategory};
  await act(async()=>{renderer=create(React.createElement(CodexPluginDirectory,props));});await act(tick);assert.equal(reads,1);
  await act(async()=>renderer.update(React.createElement(CodexPluginDirectory,{...props,loading:true})));await act(async()=>renderer.update(React.createElement(CodexPluginDirectory,props)));await act(tick);assert.equal(reads,1);
  await act(async()=>renderer.update(React.createElement(CodexPluginDirectory,{...props,zh:false})));await act(tick);assert.equal(reads,2);
  await act(async()=>renderer.update(React.createElement(CodexPluginDirectory,props)));await act(tick);assert.equal(reads,2);
  const refresh=renderer.root.findAllByType('fixture').find(node=>node.props['aria-label']==='刷新插件目录');await act(async()=>refresh.props.onClick());await act(tick);assert.equal(reads,3);
  await act(async()=>renderer.unmount());
 });
 await scenario('real discovery tab and category navigation leave search ownership to the parent session',async()=>{
  const queries=[],views=[],section={id:'market',title:'Fixture market',urlSlug:null,kind:'market',plugins:[]};
  const directory={...response,snapshot,accountRequired:true,personalSections:[section]};
  const props={canManageMarkets:true,directory,loading:false,disabled:false,zh:true,query:'public-saved',view:{tab:'public',section:null},onQuery:value=>queries.push(value),onView:value=>views.push(value),onBack:()=>{},onRefresh:()=>{},onMarkets:()=>{},onAuthorize:()=>{},onOpen:()=>{},onInstall:()=>{},onAction:()=>{},readCategory:async()=>{throw Error('Navigation must not load an unauthorized directory');}};
  await act(async()=>{renderer=create(React.createElement(CodexPluginDirectory,props));await tick();});
  await act(async()=>renderer.root.findAllByType('fixture').find(node=>node.props.value==='public'&&node.props.onValueChange).props.onValueChange('personal'));
  assert.deepEqual(views.at(-1),{tab:'personal',section:null});assert.deepEqual(queries,[]);
  await act(async()=>renderer.update(React.createElement(CodexPluginDirectory,{...props,query:'personal-saved',view:{tab:'personal',section}})));
  await act(async()=>renderer.root.findAllByType('fixture').find(node=>node.props.label==='返回插件发现').props.onClick());
  assert.deepEqual(views.at(-1),{tab:'personal',section:null});assert.deepEqual(queries,[],'leaving a section must not erase its stored query');await act(async()=>renderer.unmount());
 });
 const plugin=(id,extra={})=>({id,name:id,marketplace:'market',version:'1',installed:true,installationKnown:true,enabled:true,components:['skills'],skills:[],sourcePath:'/source',installedPath:'/installed',canInstall:false,canToggle:true,canUninstall:true,canCheckUpdates:true,unavailableReason:null,fingerprint:'fixture',...extra});
 const fixtures=[plugin('available'),plugin('current'),plugin('blocked',{canCheckUpdates:false}),plugin('uninstalled',{installed:false}),plugin('codex-app-tools@openai-bundled',{marketplace:'openai-bundled',builtin:true}),plugin('unified-computer-use@openai-bundled',{marketplace:'openai-bundled',builtin:true}),plugin('failure'),plugin('after-failure')];
 const full={...snapshot,plugins:fixtures};
 const control=label=>renderer.root.findAllByType('fixture').find(node=>node.props['aria-label']===label);
 const arrows=()=>renderer.root.findAllByType('fixture').filter(node=>String(node.props['aria-label']??'').startsWith('更新 '));
 await scenario('Codex toolbar checks the permitted installed inventory independently of filters and cards only open cached available review',async()=>{
  for(const scope of [target,{...target,scope:'project',projectPath:'/fixture'}]){
   calls=[];let current=false;const initial={...full,contextId:scope.scope};
   globalThis.loadingProbeInvoke=async(command,args)=>{calls.push({command,args});if(command==='upstream_codex_check_plugin'){if(args.pluginId==='failure')throw Error('fixture check failure');return {pluginId:args.pluginId,status:args.pluginId==='current'||current?'current':'available',canUpdate:args.pluginId==='available'&&!current};}if(command==='upstream_codex_update_plugin')return initial;throw Error(command);};
   await act(async()=>{renderer=create(React.createElement(Probe,{management:true,directoryActive:false,target:scope,initialSnapshot:initial}));await tick();});
   assert.equal(arrows().length,0,'cards have no default update action');assert(!renderer.root.findAllByType('fixture').some(node=>String(node.props['aria-label']??'').startsWith('检查更新 ')),'cards have no default per-plugin check action');assert(control('检查更新'));
   await act(async()=>{await result.checkPlugins();await tick();});
   assert.deepEqual(calls.filter(call=>call.command==='upstream_codex_check_plugin').map(call=>call.args.pluginId),['available','current','failure','after-failure']);
   assert(calls.every(call=>JSON.stringify(call.args.target)===JSON.stringify(scope)));assert.equal(arrows().length,1);assert.equal(arrows()[0].props.variant,'ghost');assert.equal(arrows()[0].props.size,'icon-sm');assert(arrows()[0].findAllByType('fixture').some(node=>node.props.className==='text-skill-update'));assert(result.checks['after-failure'],'one failed check must not prevent the next plugin check');assert.equal(result.updateReview,null);assert.match(result.error,/failure.*fixture check failure/);
   assert.equal(result.working,false);assert.equal(result.checkingUpdates,false);assert.equal(calls.filter(call=>call.command==='upstream_codex_update_plugin').length,0);
   const before=calls.length;await act(async()=>arrows()[0].props.onClick());assert.equal(result.updateReview.plugin.id,'available');assert.equal(calls.length,before,'opening the review does not recheck or update');
   await act(async()=>result.setUpdateReview(null));current=true;await act(async()=>{await result.checkPlugins();await tick();});assert.equal(arrows().length,0,'rechecking current clears previous availability');current=false;await act(async()=>{await result.checkPlugins();await tick();});assert.equal(arrows().length,1);await act(async()=>arrows()[0].props.onClick());
   const reviewed=result.updateReview.check;await act(async()=>{await result.updatePlugin();await tick();});const action=calls.find(call=>call.command==='upstream_codex_update_plugin');assert.equal(action.args.reviewed,reviewed);assert.equal(result.updateReview,null);assert.equal(arrows().length,0);
   current=true;await act(async()=>{await result.checkPlugins();await tick();});assert.equal(arrows().length,0,'rechecking current clears previous availability');
   await act(async()=>renderer.update(React.createElement(Probe,{management:true,directoryActive:false,target:scope,initialSnapshot:initial,query:'not-a-visible-plugin'})));const beforeFiltered=calls.filter(call=>call.command==='upstream_codex_check_plugin').length;
   await act(async()=>{await result.checkPlugins();await tick();});assert.equal(calls.filter(call=>call.command==='upstream_codex_check_plugin').length,beforeFiltered+4,'the toolbar checks the inventory even if search hides its cards');
   await act(async()=>renderer.unmount());
  }
 });
 await scenario('single plugin update retains other available card checks on success and failure',async()=>{
  for(const fail of [false,true]){
   calls=[];const first=plugin('first'),second=plugin('second'),initial={...snapshot,plugins:[first,second]};
   globalThis.loadingProbeInvoke=async(command,args)=>{calls.push({command,args});if(command==='upstream_codex_check_plugin')return {pluginId:args.pluginId,status:'available',canUpdate:true};if(command==='upstream_codex_update_plugin'){if(fail)throw Error('fixture update failed');return {...initial,revision:'updated'};}throw Error(command);};
   await act(async()=>{renderer=create(React.createElement(Probe,{management:true,directoryActive:false,initialSnapshot:initial}));await tick();});
   await act(async()=>{await result.checkPlugins();await tick();});assert.equal(arrows().length,2);
   await act(async()=>result.reviewPluginUpdate(first));await act(async()=>{await result.updatePlugin();await tick();});
   assert(result.checks.second?.canUpdate,'updating first must preserve second reviewed check');const arrow=arrows().find(node=>node.props['aria-label']==='更新 second');assert(arrow,'second update arrow remains visible');
   if(!fail)assert.equal(result.checks.first,undefined,'successful first update consumes its own check');
   else assert.match(result.updateReview.error,/fixture update failed/);
   const before=count('upstream_codex_check_plugin');await act(async()=>arrow.props.onClick());assert.equal(result.updateReview.plugin.id,'second');assert.equal(count('upstream_codex_check_plugin'),before,'retained arrow opens existing review');await act(async()=>renderer.unmount());
  }
 });
 await scenario('Codex bulk check suppresses duplicate starts and rejects a previous scope reply',async()=>{
  calls=[];let finish;
  globalThis.loadingProbeInvoke=async(command,args)=>{calls.push({command,args});return new Promise(resolve=>{finish=resolve;});};
  await act(async()=>{renderer=create(React.createElement(Probe,{management:true,directoryActive:false,initialSnapshot:full}));await tick();});
  await act(async()=>{result.checkPlugins();result.checkPlugins();await tick();});assert.equal(count('upstream_codex_check_plugin'),1);assert.equal(control('检查更新').props['aria-busy'],true);assert.equal(control('检查更新').props.disabled,true);assert.equal(control('刷新').props.disabled,false);assert.equal(result.working,false);
  const project={...target,scope:'project',projectPath:'/other'};
  await act(async()=>{renderer.update(React.createElement(Probe,{management:true,directoryActive:false,target:project,initialSnapshot:{...full,contextId:'project'}}));await tick();});
  await act(async()=>{finish({status:'available',canUpdate:true});await tick();});assert.deepEqual(result.checks,{});assert.equal(result.updateReview,null);assert.equal(arrows().length,0);assert.equal(result.checkingUpdates,false);assert.equal(result.working,false);assert.equal(count('upstream_codex_check_plugin'),1,'remaining checks from the old scope stop');
  await act(async()=>renderer.unmount());
 });
 await scenario('read-only Codex checks leave global busy untouched and an old scope finally cannot clear a new single check',async()=>{
  calls=[];const busy=[],pending=[],one={...full,plugins:[fixtures[0]]};
  globalThis.loadingProbeInvoke=(command,args)=>{calls.push({command,args});assert.equal(command,'upstream_codex_check_plugin');return new Promise((resolve,reject)=>pending.push({resolve,reject}));};
  await act(async()=>{renderer=create(React.createElement(Probe,{management:true,directoryActive:false,initialSnapshot:one,onBusy:value=>busy.push(value)}));await tick();});
  await act(async()=>{result.checkPlugins();result.checkPlugins();await tick();});assert.equal(pending.length,1);assert.equal(result.checkingUpdates,true);assert.equal(result.working,false);assert.deepEqual(busy,[]);assert.equal(control('刷新').props.disabled,false);
  const project={...target,scope:'project',projectPath:'/nonblocking'};
  await act(async()=>{renderer.update(React.createElement(Probe,{management:true,directoryActive:false,target:project,initialSnapshot:{...one,contextId:'project'},onBusy:value=>busy.push(value)}));await tick();});
  await act(async()=>{result.checkPlugin(fixtures[0]);result.checkPlugin(fixtures[0]);await tick();});assert.equal(pending.length,2,'the new scope can start before the old check finishes');
  await act(async()=>{pending[0].reject(Error('obsolete error'));await tick();});assert.equal(result.checkingUpdates,true,'old finally must not end the new request');assert.equal(result.error,'');assert.equal(result.updateReview,null);assert.deepEqual(result.checks,{});
  await act(async()=>{pending[1].resolve({status:'available',canUpdate:true});await tick();});assert.equal(result.checkingUpdates,false);assert.equal(result.updateReview.plugin.id,'available');assert.deepEqual(busy,[]);await act(async()=>renderer.unmount());
 });
 await scenario('Codex refresh external revision and actual writes cancel obsolete check results without blocking reads or weakening write busy',async()=>{
  for(const method of ['checkPlugins','checkPlugin']){
   calls=[];const busy=[],pending=[],one={...full,plugins:[fixtures[0]]};let finishWrite;
   globalThis.loadingProbeInvoke=async(command,args)=>{calls.push({command,args});if(command==='upstream_codex_check_plugin')return new Promise((resolve,reject)=>pending.push({resolve,reject}));if(command==='upstream_codex_account_status')return {state:'ready'};if(command==='upstream_codex_settings')return {...one,revision:'refreshed'};if(command==='upstream_codex_plugin')return new Promise(resolve=>{finishWrite=resolve;});throw Error(command);};
   const props={management:true,directoryActive:false,initialSnapshot:one,onBusy:value=>busy.push(value)};
   await act(async()=>{renderer=create(React.createElement(Probe,props));await tick();});
   await act(async()=>{result[method](fixtures[0]);await tick();});await act(async()=>{await result.load(true);await tick();});assert.equal(result.checkingUpdates,false);assert.equal(result.snapshot.revision,'refreshed');
   await act(async()=>{result.checkPlugin(fixtures[0]);await tick();});await act(async()=>{pending[0].resolve({status:'available',canUpdate:true});await tick();});assert.equal(result.checkingUpdates,true);assert.deepEqual(result.checks,{});assert.equal(result.updateReview,null);
   await act(async()=>{renderer.update(React.createElement(Probe,{...props,initialSnapshot:{...one,revision:'external-write'}}));await tick();});assert.equal(result.checkingUpdates,false);await act(async()=>{pending[1].reject(Error('old external error'));await tick();});assert.equal(result.error,'');assert.equal(result.updateReview,null);
   await act(async()=>{result.checkPlugin(fixtures[0]);await tick();});await act(async()=>{result.plugin(fixtures[0],'disable');await tick();});assert.equal(result.checkingUpdates,false,'opening the write confirmation cancels a pending single check');
   await act(async()=>{result.apply();await tick();});assert.equal(result.working,true);assert.deepEqual(busy,[true]);await act(async()=>{pending[2].resolve({status:'available',canUpdate:true});await tick();});assert.equal(result.updateReview,null);assert.equal(result.working,true);
   await act(async()=>{finishWrite({...one,revision:'written',plugins:[{...fixtures[0],enabled:false}]});await tick();});assert.equal(result.working,false);assert.deepEqual(busy,[true,false]);assert.equal(result.snapshot.plugins[0].enabled,false);assert.deepEqual(result.checks,{});await act(async()=>renderer.unmount());
  }
 });
 await scenario('Codex leaving a detail suppresses late single-check review and errors while a cached update cancels another check',async()=>{
  for(const reject of [false,true]){
   calls=[];const requests=[],initial={...full,plugins:[fixtures[0],fixtures[1]]};
   globalThis.loadingProbeInvoke=(command,args)=>{calls.push({command,args});return new Promise((resolve,reject)=>requests.push({resolve,reject}));};
   const props={directoryActive:false,initialSnapshot:initial,detailPluginId:'available'};
   await act(async()=>{renderer=create(React.createElement(Probe,props));await tick();});await act(async()=>{result.checkPlugin(fixtures[0]);await tick();});
   await act(async()=>renderer.update(React.createElement(Probe,{...props,detailPluginId:reject?null:'current'})));
   await act(async()=>{if(reject)requests[0].reject(Error('old detail error'));else requests[0].resolve({status:'available',canUpdate:true});await tick();});assert.equal(result.updateReview,null);assert.equal(result.error,'');assert.equal(result.checkingUpdates,false);
   if(!reject){assert.equal(result.checks.available.canUpdate,true);await act(async()=>{result.checkPlugin(fixtures[1]);await tick();});await act(async()=>result.reviewPluginUpdate(fixtures[0]));assert.equal(result.updateReview.plugin.id,'available');assert.equal(result.checkingUpdates,false);await act(async()=>{requests[1].resolve({status:'available',canUpdate:true});await tick();});assert.equal(result.updateReview.plugin.id,'available');}
   await act(async()=>renderer.unmount());
  }
 });
 }finally{await rm(work,{recursive:true,force:true});delete globalThis.loadingProbeInvoke;}
});

test('Codex unified plugin page preserves scoped actions, permissions, skill navigation and read recovery',{skip:!modules},async t=>{
 const root=process.cwd(),work=await mkdtemp(join(tmpdir(),'skills-space-plugin-page-'));
 const require=createRequire(import.meta.resolve('vite')),{build}=require('esbuild');
 const reactPath=resolve(modules,'react/index.js');
 const React=await import(reactPath),{create,act}=await import(resolve(modules,'react-test-renderer/index.js'));
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const source=await readFile('src/components/codex-plugin-page.tsx','utf8');
 const names=[...new Set([...source.matchAll(/import \{([^}]+)\} from '(?:lucide-react|@\/components\/[^']+)'/g)].flatMap(match=>match[1].split(',').map(name=>name.trim())))];
 const outfile=join(work,'subject.mjs');
 await build({stdin:{contents:"export {CodexPluginPage} from './src/components/codex-plugin-page';",resolveDir:root},bundle:true,platform:'node',format:'esm',outfile,jsx:'automatic',plugins:[{name:'plugin-page-fixtures',setup(b){
  b.onResolve({filter:/^react(?:\/.*)?$/},a=>({path:a.path==='react'?reactPath:resolve(modules,a.path+'.js'),external:true}));
  b.onResolve({filter:/^@tauri-apps\/api\/core$/},()=>({path:'invoke',namespace:'fixture'}));
  b.onResolve({filter:/^@tauri-apps\/plugin-opener$/},()=>({path:'opener',namespace:'fixture'}));
  b.onResolve({filter:/^@\/lib\/notifications$/},()=>({path:'notifications',namespace:'fixture'}));
  b.onResolve({filter:/^(?:lucide-react|@\/components\/)/},()=>({path:'ui',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='invoke'?'export const invoke=(...args)=>globalThis.pluginPageInvoke(...args);':a.path==='opener'?'export const openUrl=async()=>{};':a.path==='notifications'?"import {useState} from 'react';export function useFeedbackError(){return useState('');}":`import {createElement} from 'react';const view=name=>({children,...props})=>createElement('fixture',{...props,component:name},children);export const ${names.map(name=>name+`=view('${name}')`).join(',')};`}));
  b.onResolve({filter:/^@\//},a=>{const base=resolve(root,'src',a.path.slice(2));return {path:['.ts','.tsx'].map(ext=>base+ext).find(existsSync)};});
 }}]});
 const {CodexPluginPage}=await import(pathToFileURL(outfile));
 const plugin={id:'demo@market',name:'Demo plugin',description:'Fallback introduction',author:'Author',marketplace:'market',version:'1.0',installed:true,installationKnown:true,enabled:true,components:['skills'],skills:[],sourcePath:'/home/market/demo',installedPath:'/home/cache/demo',canInstall:false,canToggle:true,canCheckUpdates:true,canUninstall:true,toggleScope:'user',unavailableReason:null};
 const state={displayName:'Writing',documentPath:'/home/cache/demo/skills/write/SKILL.md',installationPath:'/home/cache/demo/skills/write',origin:'plugin',runtimeScope:'user',inScope:true,enabled:true,pluginId:plugin.id,canToggle:true,needsConfirmation:false,toggleScope:'user',lifecycleOwner:'codex-plugin'};
 const skill={name:'demo:write',description:'Writing skill',state};
 const details={description:'Full introduction',capabilities:['Write'],category:'Productivity',examples:['Write a summary'],skills:[],website:null};
 let renderer,calls=[],actions=[],opened=[],toggled=[];
 const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
 const normal=async(command,args)=>{if(command==='upstream_local_directories')return [];calls.push({command,args});assert.equal(command,'upstream_codex_plugin_details');return details;};
 const props=(extra={})=>({plugin,snapshot:{skills:[skill],plugins:[plugin]},check:undefined,home:'/home',zh:true,disabled:false,onOpenDirectory:()=>{},onBack:()=>{},onAction:(item,action)=>actions.push([item,action]),onCheck:item=>actions.push([item,'check']),onSkill:item=>opened.push(item),onToggle:(item,enabled)=>toggled.push([item,enabled]),...extra});
 const mount=async extra=>{await act(async()=>{renderer=create(React.createElement(CodexPluginPage,props(extra)));await tick();});await act(tick);};
 const update=async extra=>{await act(async()=>{renderer.update(React.createElement(CodexPluginPage,props(extra)));await tick();});await act(tick);};
 const control=(component,label)=>renderer.root.findAllByType('fixture').find(node=>node.props.component===component&&(node.props['aria-label']===label||node.children.includes(label)));
 const close=async()=>act(async()=>renderer.unmount());
 try{
 await t.test('installed page exposes real actions and skill controls together with one introduction and About',async()=>{
  calls=[];actions=[];opened=[];toggled=[];globalThis.pluginPageInvoke=normal;await mount();
  assert.equal(calls.length,1);assert.equal(renderer.root.findAllByType('p').filter(node=>node.children.includes('Full introduction')).length,1);
  assert.equal(renderer.root.findAllByType('h2').filter(node=>node.children.includes('关于')).length,1);
  assert(!control('Button','管理'));assert(!control('Button','查看详情'));
  assert(renderer.root.findByProps({'aria-label':'示例'}));
  await act(async()=>control('Button','检查插件更新').props.onClick());await act(async()=>control('Button','卸载').props.onClick());
  assert.deepEqual(actions.map(([,action])=>action),['check','uninstall']);
  await act(async()=>control('Switch','启用技能 Writing').props.onCheckedChange(false));assert.equal(toggled[0][1],false);assert.equal(toggled[0][0].codexState,state);
  await act(async()=>renderer.root.findByProps({'aria-label':'查看技能 Writing'}).props.onClick());await act(async()=>control('Button','查看技能详情 Writing').props.onClick());assert.equal(opened.length,2);assert.equal(opened[0].path,state.installationPath);
  await update({zh:false});assert.equal(calls.length,1,'locale does not refetch unchanged details');assert(control('Button','Check plugin updates'));assert(control('Switch','Enable skill Writing'));
  await update({disabled:true});assert.equal(control('Button','卸载').props.disabled,true);assert.equal(control('Switch','启用技能 Writing').props.disabled,true);await close();
 });
 await t.test('Codex detail check spinner disables only checks and keeps a previously available Update action executable',async()=>{
  globalThis.pluginPageInvoke=normal;await mount({checkingUpdates:true});assert.equal(control('Button','检查插件更新').props.disabled,true);assert.equal(control('Button','检查插件更新').props['aria-busy'],true);assert.equal(control('Button','卸载').props.disabled,false);assert.equal(control('Switch','启用技能 Writing').props.disabled,false);assert.equal(control('BackButton').props.disabled,false);
  await update({checkingUpdates:true,check:{canUpdate:true}});assert.equal(control('Button','更新插件').props.disabled,false);await close();
 });
 await t.test('read-only plugin keeps document navigation but has no fabricated lifecycle or skill-write controls',async()=>{
  globalThis.pluginPageInvoke=normal;await mount({plugin:{...plugin,canToggle:false,canCheckUpdates:false,canUninstall:false},snapshot:{skills:[{...skill,state:{...state,canToggle:false}}],plugins:[]}});
  assert(!control('Button','卸载'));assert(!control('Button','检查插件更新'));assert(!control('Switch','启用技能 Writing'));assert(renderer.root.findByProps({'aria-label':'查看技能 Writing'}));await close();
 });
 await t.test('project inherited plugin skills retain the official-card switch and document navigation',async()=>{
  opened=[];toggled=[];globalThis.pluginPageInvoke=normal;
  const projectPlugin={...plugin,toggleScope:'project',projectEnabled:null,canCheckUpdates:false,canUninstall:false};
  const projectState={...state,canToggle:true,inScope:false};
  await mount({plugin:projectPlugin,snapshot:{skills:[{...skill,state:projectState}],plugins:[projectPlugin]}});
  assert(control('Switch','启用技能 Writing'));assert.equal(control('Switch','启用技能 Writing').props.checked,true);
  const buttons=renderer.root.findAllByType('fixture').filter(node=>node.props.component==='Button');
  assert(!buttons.some(node=>node.children.some(child=>typeof child==='string'&&/全局|Global/.test(child))));
  await act(async()=>control('Switch','启用技能 Writing').props.onCheckedChange(false));assert.equal(toggled.length,1);assert.equal(toggled[0][0].codexState,projectState);assert.equal(toggled[0][1],false);
  await act(async()=>renderer.root.findByProps({'aria-label':'查看技能 Writing'}).props.onClick());assert.equal(opened.length,1);
  await update({plugin:projectPlugin,snapshot:{skills:[{...skill,state:{...projectState,enabled:false}}],plugins:[projectPlugin]}});
  assert.equal(control('Switch','启用技能 Writing').props.checked,false);await close();
 });
 await t.test('uninstalled discovery offers install without installed actions or writable skill controls',async()=>{
  actions=[];await mount({plugin:{...plugin,installed:false,installedPath:null,canInstall:true},snapshot:null});assert(control('Button','安装'));assert(!control('Button','卸载'));assert(!control('Button','检查插件更新'));assert.equal(renderer.root.findAllByType('fixture').filter(node=>node.props.component==='Switch').length,0);
  await act(async()=>control('Button','安装').props.onClick());assert.equal(actions[0][1],'install');await close();
 });
 await t.test('project reset exists only for a writable explicit override and keeps original plugin identity',async()=>{
  actions=[];const projectPlugin={...plugin,toggleScope:'project',projectEnabled:false,canCheckUpdates:false,canUninstall:false};await mount({plugin:projectPlugin});assert(control('Button','恢复继承设置'));
  await act(async()=>control('Button','恢复继承设置').props.onClick());assert.equal(actions[0][0],projectPlugin);assert.equal(actions[0][1],'reset');
  await update({plugin:{...projectPlugin,projectEnabled:null}});assert(!control('Button','恢复继承设置'));
  await update({plugin:{...projectPlugin,canToggle:false}});assert(!control('Button','恢复继承设置'));await close();
 });
 await t.test('detail-read failure retries in the same unified page without losing eligible management actions',async()=>{
  calls=[];let fail=true;globalThis.pluginPageInvoke=async(...args)=>{if(args[0]==='upstream_local_directories')return [];if(fail){calls.push(args);throw Error('fixture read failure');}return normal(...args);};await mount();assert.equal(calls.length,1);assert(control('Button','重试'));assert(control('Button','卸载'));
  fail=false;await act(async()=>{control('Button','重试').props.onClick();await tick();});await act(tick);assert.equal(calls.length,2);assert(!control('Button','重试'));assert.equal(renderer.root.findAllByType('p').filter(node=>node.children.includes('Full introduction')).length,1);await close();
 });
 }finally{await rm(work,{recursive:true,force:true});delete globalThis.pluginPageInvoke;}
});

test('App loading performance keeps actual App, sidebar and Codex hook in the request trace',{skip:!modules},async t=>{
 const root=process.cwd(),work=await mkdtemp(join(tmpdir(),'skills-space-app-loading-'));
 const require=createRequire(import.meta.resolve('vite')),ts=require('typescript'),{build}=require('esbuild');
 const reactPath=resolve(modules,'react/index.js');
 const React=await import(reactPath),{create,act}=await import(resolve(modules,'react-test-renderer/index.js'));
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const imports=new Set(['SkillDocument','UseSkillFlow','useSidebar']);
 for(const file of ['src/App.tsx','src/components/scope-sidebar.tsx']){const source=ts.createSourceFile(file,await readFile(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);for(const node of source.statements)if(ts.isImportDeclaration(node)&&/^(lucide-react|@\/components\/)/.test(node.moduleSpecifier.text))for(const element of node.importClause?.namedBindings?.elements??[])if(!element.isTypeOnly)imports.add((element.propertyName??element.name).text);}
 const outfile=join(work,'subject.mjs');
 await build({stdin:{contents:"export {default as App} from './src/App';export {ScopeSidebar} from './src/components/scope-sidebar';",resolveDir:root},bundle:true,platform:'node',format:'esm',outfile,jsx:'automatic',keepNames:true,plugins:[{name:'actual-app-fixtures',setup(b){
  b.onResolve({filter:/^react(?:\/.*)?$/},a=>({path:a.path==='react'?reactPath:resolve(modules,a.path+'.js'),external:true}));
  b.onResolve({filter:/^@\/components\/directory-link$/},()=>({path:resolve(root,'src/components/directory-link.tsx')}));
  b.onResolve({filter:/^@\/components\/scope-sidebar$/},()=>({path:resolve(root,'src/components/scope-sidebar.tsx')}));
  b.onResolve({filter:/^(?:@\/components\/|lucide-react)/},()=>({path:'ui',namespace:'fixture'}));
  b.onResolve({filter:/^@tauri-apps\//},a=>({path:a.path,namespace:'fixture'}));
  b.onResolve({filter:/^@\/lib\/(?:notifications|window-appearance)$/},a=>({path:a.path,namespace:'fixture'}));
  b.onResolve({filter:/^@\/hooks\/use-window-fullscreen$/},()=>({path:'fullscreen',namespace:'fixture'}));
  b.onResolve({filter:/\.png$/},()=>({path:'image',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='ui'?`import {createElement,forwardRef} from 'react';const view=n=>forwardRef(({children,heading,control,description,metadata,selection,...props},ref)=>createElement('fixture',{...props,ref,component:n},heading,control,description,metadata,selection,children));export const ${[...imports].filter(name=>name!=='useSidebar').map(name=>`${name}=view('${name}')`).join(',')};export const useSidebar=()=>({state:'expanded'});`:a.path.endsWith('/core')?'export const invoke=(...args)=>globalThis.appLoadingInvoke(...args);export class Channel{}':a.path.endsWith('/path')?"export const homeDir=async()=>'/home';":a.path.endsWith('/window')?'export const getCurrentWindow=()=>({onCloseRequested:async()=>()=>{},onFocusChanged:async()=>()=>{}});':a.path.includes('plugin-dialog')?'export const open=async()=>null;':a.path.includes('plugin-opener')?'export const openUrl=async()=>{};':a.path.includes('notifications')?"import {useState} from 'react';export const notifySuccess=()=>{},notifyError=()=>{},useInstallationProgress=()=>{};export function useFeedbackError(){const [value,setValue]=useState('');return [value,(next)=>setValue(next)];}":a.path.includes('window-appearance')?'export const syncWindowAppearance=async()=>{};':a.path==='fullscreen'?'export const useWindowFullscreen=()=>false;':"export default '';"}));
  b.onResolve({filter:/^@\//},a=>{const base=resolve(root,'src',a.path.slice(2));return {path:['.ts','.tsx','.json'].map(ext=>base+ext).find(existsSync)};});
 }}]});
 const previous={document:globalThis.document,window:globalThis.window,localStorage:globalThis.localStorage};
 globalThis.localStorage={getItem:()=>null,setItem(){}};
 globalThis.document={querySelector:()=>null,documentElement:{style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},toggle(){}},dataset:{},lang:''}};
 globalThis.window={document:globalThis.document,matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),setTimeout,clearTimeout};
 const {App,ScopeSidebar}=await import(pathToFileURL(outfile));
 const globalScope={host:'local',scope:'global',projectPath:null},project={host:'local',scope:'project',projectPath:'/home/a'},other={...project,projectPath:'/home/b'};
 const agents=['codex','hermes-agent','deepseek-harness','pi'].map(id=>({id,name:id,path:'/home/.agents/skills',directoryExists:true,detected:true,installationStatus:'confirmed',sharedDirectory:true,additionalPaths:[]}));
 const codexState={documentPath:'/home/.agents/skills/native/SKILL.md',installationPath:'/home/.agents/skills/native',origin:'standalone',runtimeScope:'user',inScope:true,enabled:true,pluginId:null,canToggle:true,needsConfirmation:false,toggleScope:'user',lifecycleOwner:'external'};
 const hermesState={path:'/home/hermes-skill',file:'/home/hermes-skill/SKILL.md',name:'hermes-skill',description:'Fixture',origin:'local',inScope:true,enabled:true,autoLoad:false,canToggle:true,canPreload:true,reason:null,loadName:null,documentRevision:'h1',cliAddressable:false};
 const piState={path:'/home/pi-skill',file:'/home/pi-skill/SKILL.md',rulePath:'/home/pi-skill/SKILL.md',name:'pi-skill',description:'Fixture',enabled:true,canToggle:true,reason:null,blockingRules:[],settingsPath:'/home/.pi/agent/settings.json',scope:'global',inScope:true,packageIndex:null,packageSource:null,origin:'directory',managed:false,manualOnly:false,cliAddressable:false};
 const plugin={id:'fixture@market',name:'Fixture plugin',marketplace:'market',version:'1',installed:true,installationKnown:true,enabled:true,components:['skills'],skills:[],sourcePath:'/fixture/source',installedPath:'/fixture/cache',canInstall:false,canToggle:true,canCheckUpdates:true,canUninstall:true,fingerprint:'fixture',toggleScope:'user'};
 let enabled=true,hermesEnabled=true,piEnabled=true,pluginEnabled=true,projectCount=2,calls=[],unhandled=[],renderer,responder;
 const prefs=()=>({theme:'light',colorTheme:'codex',fontFamily:'system',fontSize:16,language:'zh-CN',installMode:'symlink',projects:Array.from({length:projectCount},(_,i)=>({name:`Project ${i}`,path:`/home/${String.fromCharCode(97+i)}`})),collapsedSections:[],hiddenAgents:[],visibleAgents:[],agentOrder:[]});
 const snap=(target,full=false)=>({contextId:target.projectPath??'global',catalogRequested:full,pluginsComplete:true,binary:'/codex',version:'fixture',codexHome:'/home/.codex',configPath:'/home/.codex/config.toml',revision:enabled?'on':'off',rules:[],capabilities:{writeConfig:true,nameRules:true},skills:[{name:'native',description:'Fixture',state:{...codexState,enabled}}],plugins:[{...plugin,enabled:pluginEnabled}],warnings:[]});
 const pi=target=>({target,path:'/home/.pi/agent/settings.json',revision:piEnabled?'on':'off',entries:[],skillCommands:true,inheritedSkillCommands:true,dependencies:[],skills:[{...piState,enabled:piEnabled}],warnings:[],agentDirectory:'/home/.pi/agent',additionalDirectories:[]});
 const hermes=target=>({target,path:'/home/.hermes/config.yaml',revision:hermesEnabled?'on':'off',hermesHome:'/home/.hermes',externalDirs:[],createDir:'',projectDiscovery:true,trustedProjects:[],disabled:[],autoLoad:[],projectRoot:target.projectPath,projectTrusted:true,skills:[{...hermesState,enabled:hermesEnabled}],warnings:[]});
 const inventory=(target,context=null,version)=>({version:version??`${target.projectPath??'global'}:${context??'default'}`,agents,skills:[{name:'native',path:codexState.installationPath,agents:['codex'],source:null,sourceUrl:null,description:'Fixture',cliManaged:false,codexState:{...codexState,enabled}},{name:'hermes-skill',path:hermesState.path,agents:['hermes-agent'],source:null,sourceUrl:null,description:'Fixture',cliManaged:false,hermesOrigin:'local',hermesState:{...hermesState,enabled:hermesEnabled}},{name:'pi-skill',path:piState.path,agents:['pi'],source:null,sourceUrl:null,description:'Fixture',cliManaged:false,piState:{...piState,enabled:piEnabled}}],warnings:[],codex:snap(target),hermes:hermes(target),pi:pi(target)});
 const normal=async(command,args)=>{
  if(command==='upstream_preferences')return prefs();if(command==='upstream_save_preferences')return args.preferences;
  if(command==='upstream_agents')return agents;
  if(command==='upstream_local_directories')return [];
  if(command==='upstream_open_directory')return true;
  if(command==='upstream_inventory')return inventory(args.target,args.dshContextKey);
  if(command==='upstream_codex_settings')return snap(args.target,true);
  if(command==='upstream_codex_account_status')return {state:'required'};
  if(command==='upstream_codex_toggle'){enabled=args.request.enabled;return snap(args.request.target,true);}
  if(command==='upstream_codex_plugin'){pluginEnabled=args.request.action==='enable';return snap(args.request.target,true);}
  if(command==='upstream_pi_toggle'){piEnabled=args.request.enabled;return pi(args.request.target);}
  if(command==='upstream_pi_settings')return pi(args.target);
  if(command==='upstream_hermes_save'){hermesEnabled=args.change.changes[0].enabled;return hermes(args.target);}
  if(command==='upstream_hermes_settings')return hermes(args.target);
  unhandled.push(command);throw Error(`Unexpected fixture command: ${command}`);
 };
 const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
 const flush=async()=>{await act(tick);await act(tick);};
 const mount=async(count=2)=>{enabled=true;hermesEnabled=true;piEnabled=true;pluginEnabled=true;projectCount=count;calls=[];unhandled=[];responder=normal;globalThis.appLoadingInvoke=(command,args)=>{calls.push({command,args});return responder(command,args);};await act(async()=>{renderer=create(React.createElement(App));await tick();});await flush();};
 const close=async()=>{await act(async()=>renderer.unmount());assert.deepEqual(unhandled,[]);};
 const sidebar=()=>renderer.root.findByType(ScopeSidebar);
 const controls=component=>renderer.root.findAllByType('fixture').filter(node=>node.props.component===component);
 const control=(component,predicate=()=>true)=>controls(component).find(node=>predicate(node.props));
 const count=command=>calls.filter(call=>call.command===command).length;
 const visit=async(scope,agent='codex')=>{await act(async()=>{sidebar().props.onSelect(scope,agent);await tick();});await flush();};
 const tabs=()=>control('Tabs',props=>['managed','agent','plugins'].includes(props.value));
 const tab=async value=>{await act(async()=>{tabs().props.onValueChange(value);await tick();});await flush();};
 const refresh=()=>control('Button',props=>props['aria-label']==='刷新'||props['aria-label']==='Refresh');
 const doRefresh=async()=>{await act(async()=>{refresh().props.onClick();await tick();});await flush();};
 const state=()=>sidebar().props.inventory;
 const pending=()=>refresh()?.props['aria-busy']??false;
 const selectedCase=process.env.SKILLS_SPACE_APP_LOADING_CASE;
 const scenario=(name,run)=>t.test(name,{skip:!!selectedCase&&!name.includes(selectedCase)},run);
 const prepareFilterMatrix=async()=>{
  await mount();
  const managed=agents.filter(agent=>['codex','pi','hermes-agent'].includes(agent.id)).map(agent=>{
   const path=`/home/managed-${agent.id}`;
   return {name:`managed-${agent.id}`,path,agents:[agent.id],source:'owner/repo',sourceUrl:null,sourceType:'git',description:'Fixture',cliManaged:true,cliAgents:[agent.id],...(agent.id==='codex'?{codexState:{...codexState,documentPath:`${path}/SKILL.md`,installationPath:path,lifecycleOwner:'skills-cli'}}:agent.id==='pi'?{piState:{...piState,path,file:`${path}/SKILL.md`,rulePath:`${path}/SKILL.md`,managed:true,cliAddressable:true}}:{hermesOrigin:'local',hermesState:{...hermesState,path,file:`${path}/SKILL.md`}})};
  });
  responder=async(command,args)=>command==='upstream_inventory'?{...inventory(args.target),skills:[...inventory(args.target).skills,...managed]}:command==='upstream_codex_settings'?{...snap(args.target,true),skills:[...snap(args.target,true).skills,...managed.filter(skill=>skill.codexState).map(skill=>({name:skill.name,description:'Fixture',state:skill.codexState}))]}:command==='upstream_codex_plugin_directory'?{snapshot:null,publicSections:[],personalSections:[],accountRequired:false,publicError:null,personalError:null}:normal(command,args);
  await doRefresh();
 };
 try{
  await scenario('Codex pending checks do not lock the App and cached detail Update still opens review while actual writes remain busy',async()=>{
   await mount();const a={...plugin,id:'a@market',name:'A'},b={...plugin,id:'b@market',name:'B'},requests=[];let finishWrite;
   responder=async(command,args)=>{if(command==='upstream_codex_settings')return {...snap(args.target,true),plugins:[a,b]};if(command==='upstream_codex_check_plugin'){if(args.pluginId===a.id)return {status:'available',canUpdate:true};return new Promise((resolve,reject)=>requests.push({resolve,reject}));}if(command==='upstream_codex_plugin')return new Promise(resolve=>{finishWrite=resolve;});return normal(command,args);};
   await visit(globalScope);await tab('plugins');await act(async()=>{control('CodexManagement').props.onCheckAll();await tick();});await flush();assert.equal(requests.length,1);assert.equal(sidebar().props.disabled,false);assert.equal(control('CodexManagement').props.disabled,false);assert.equal(control('CodexManagement').props.checkingUpdates,true);
   await act(async()=>control('CodexManagement').props.onQuery('A'));await flush();assert.equal(control('CodexManagement').props.query,'A');await act(async()=>control('CodexManagement').props.onOpen(a));await flush();assert.equal(control('CodexPluginPage').props.disabled,false);assert.equal(control('CodexPluginPage').props.checkingUpdates,true);assert.equal(control('CodexPluginPage').props.check.canUpdate,true);
   await act(async()=>control('CodexPluginPage').props.onCheck(a));await flush();assert.equal(control('CodexPluginUpdateDialog').props.review.plugin.id,a.id);assert.equal(control('CodexPluginUpdateDialog').props.busy,false);await act(async()=>{requests[0].resolve({status:'available',canUpdate:true});await tick();});await flush();assert.equal(control('CodexPluginUpdateDialog').props.review.plugin.id,a.id);
   await act(async()=>control('CodexPluginUpdateDialog').props.onClose());await act(async()=>control('CodexPluginPage').props.onBack());await flush();await act(async()=>{control('CodexManagement').props.onCheckAll();await tick();});await flush();assert.equal(requests.length,2);
   await act(async()=>control('CodexManagement').props.onAction(a,'disable'));await flush();assert.equal(control('CodexManagement').props.checkingUpdates,false);await act(async()=>{control('CodexConfirmation').props.onApply();await tick();});await flush();assert.equal(sidebar().props.disabled,true,'actual writes still use global busy');
   await act(async()=>{requests[1].reject(Error('obsolete during write'));await tick();});await act(async()=>{finishWrite({...snap(globalScope,true),plugins:[{...a,enabled:false},b]});await tick();});await flush();assert.equal(sidebar().props.disabled,false);assert.equal(control('CodexPluginUpdateDialog').props.review,null);assert.equal(control('CodexManagement').props.snapshot.plugins[0].enabled,false);await close();
  });
  await scenario('plugin header directories use observed global project and custom roots and pass exact opener paths',async()=>{
   await mount();
   const codexHome='/home/Custom Codex Home',globalPi='/home/Custom Pi Agent',projectPi='/home/a/.pi';let missing=false;
   const directories=new Set([`${codexHome}/plugins`,globalPi,projectPi]);
   responder=async(command,args)=>{
    if(command==='upstream_inventory')return {...inventory(args.target),codex:{...inventory(args.target).codex,codexHome},pi:{...pi(args.target),path:`${args.target.scope==='project'?projectPi:globalPi}/settings.json`}};
    if(command==='upstream_codex_settings')return {...snap(args.target,true),codexHome:missing?'/home/missing-codex':codexHome};
    if(command==='upstream_pi_settings')return {...pi(args.target),path:`${args.target.scope==='project'?projectPi:globalPi}/settings.json`};
    if(command==='upstream_local_directories')return args.paths.filter(path=>directories.has(path)).map(path=>({path,directory:path}));
    return normal(command,args);
   };
   await doRefresh();
   const links=()=>renderer.root.findAllByType('button').filter(node=>String(node.props['aria-label']??'').startsWith('打开目录 '));
   for(const [scope,id,expected]of [[globalScope,'codex',`${codexHome}/plugins`],[project,'codex',`${codexHome}/plugins`],[globalScope,'pi',globalPi],[project,'pi',projectPi]]){
    await visit(scope,id);await tab(id==='codex'?'plugins':'pi-packages');assert.equal(links().length,1);assert.equal(links()[0].props['aria-label'],`打开目录 ${expected}`);
    const reads=count('upstream_inventory'),catalogReads=count('upstream_codex_settings'),metadataReads=count('upstream_local_directories');
    await act(async()=>{links()[0].props.onClick();await tick();});await flush();const opened=calls.filter(call=>call.command==='upstream_open_directory').at(-1);assert.deepEqual(opened.args.target,scope);assert.equal(opened.args.path,expected);
    if(id==='codex')await act(async()=>control('CodexManagement').props.onQuery('unchanged-location'));else await act(async()=>control('PiExtensions').props.onSummary({count:1,loading:false}));await flush();
    assert.equal(count('upstream_inventory'),reads);assert.equal(count('upstream_codex_settings'),catalogReads);assert.equal(count('upstream_local_directories'),metadataReads,'same directory rerenders must not repeat metadata');
   }
   await visit(globalScope);await tab('plugins');missing=true;await act(async()=>{control('CodexManagement').props.onRefresh();await tick();});await flush();assert.equal(links().length,0,'unconfirmed local directories have no header entry');
   await close();
  });
  await scenario('cold startup scales with lightweight Agent metadata, not full inventories',async()=>{
   for(const projects of [0,2,6]){await mount(projects);assert.equal(count('upstream_inventory'),1);assert.equal(count('upstream_agents'),projects);assert.equal(count('upstream_codex_settings'),0);await close();}
  });
  await scenario('selecting sidebar Codex automatically loads scope plugin counts without entering the plugin tab',async()=>{
   await mount();
   responder=(command,args)=>command==='upstream_codex_settings'&&args.target.scope==='project'?{...snap(args.target,true),plugins:[{...plugin,id:'project-one@market'},{...plugin,id:'project-two@market'}]}:normal(command,args);
   const visibleCount=()=>control('TabsTrigger',props=>props.value==='plugins').findByType('span').children.join('');
   await visit(globalScope);assert.equal(tabs().props.value,'managed');assert.equal(visibleCount(),'1');
   await visit(project);assert.equal(tabs().props.value,'managed');assert.equal(visibleCount(),'2');
   const reads=count('upstream_inventory'),catalogReads=count('upstream_codex_settings');
   assert.equal(catalogReads,2);await visit(globalScope);assert.equal(visibleCount(),'1');await tab('plugins');await tab('managed');
   await visit(project);assert.equal(visibleCount(),'2');await tab('plugins');
   assert.equal(count('upstream_inventory'),reads);assert.equal(count('upstream_codex_settings'),catalogReads);await close();
  });
  await scenario('actual managed global and project filters combine source and state without reloading and retain each scope and Agent selection',async()=>{
   await mount();
   const managed=[['git','git',true],['local','local',false],['unknown','download',null]].map(([name,sourceType,enabled])=>({name:`managed-${name}`,path:`/home/managed-${name}`,agents:['codex'],source:'owner/repo',sourceUrl:null,sourceType,description:'Fixture',cliManaged:true,cliAgents:['codex'],codexState:{...codexState,documentPath:`/home/managed-${name}/SKILL.md`,installationPath:`/home/managed-${name}`,lifecycleOwner:'skills-cli',enabled}}));
   const unmanagedState={...managed[0],name:'managed-unsupported',path:'/home/unsupported',agents:['claude-code'],cliAgents:['claude-code'],codexState:undefined};
   const full=(target)=>({...snap(target,true),skills:[...snap(target,true).skills,...managed.map(skill=>({name:skill.name,description:skill.description,state:skill.codexState}))]});
   responder=async(command,args)=>command==='upstream_inventory'?{...inventory(args.target),skills:[...inventory(args.target).skills,...managed,unmanagedState]}:command==='upstream_codex_settings'?full(args.target):normal(command,args);
   await doRefresh();
   const source=()=>control('Choice',props=>props.label==='筛选托管技能来源'),status=()=>control('Choice',props=>props.label==='筛选托管技能状态');
   const names=()=>[...new Set(renderer.root.findAllByType('button').map(node=>node.props['aria-label']??'').filter(label=>label.startsWith('查看技能 managed-')))].sort();
   const choose=async(control,value)=>{await act(async()=>control().props.onChange(value));await flush();};
   assert.equal(names().length,4);await choose(status,'enabled');assert.deepEqual(names(),['查看技能 managed-git']);await choose(status,'disabled');assert.deepEqual(names(),['查看技能 managed-local']);await choose(status,'all');
   for(const scope of [globalScope,project]){
    await visit(scope);const reads=count('upstream_inventory'),catalogReads=count('upstream_codex_settings');
    assert.deepEqual(names(),['查看技能 managed-git','查看技能 managed-local','查看技能 managed-unknown']);
    assert.deepEqual(source().props.options.map(item=>item.value),['all','download','git','local']);
    await choose(status,'enabled');assert.deepEqual(names(),['查看技能 managed-git']);
    await choose(status,'disabled');assert.deepEqual(names(),['查看技能 managed-local'],'unknown enablement must be absent from Disabled');
    await choose(source,'git');assert.deepEqual(names(),[]);assert.equal(control('InventoryEmpty').props.kind,'filtered');
    await act(async()=>control('InventoryEmpty').props.onClear());await flush();assert.equal(source().props.value,'all');assert.equal(status().props.value,'all');assert.equal(names().length,3);
    await choose(source,'local');await choose(status,'disabled');assert.deepEqual(names(),['查看技能 managed-local']);
    assert.equal(count('upstream_inventory'),reads);assert.equal(count('upstream_codex_settings'),catalogReads,'filters change presentation only');
    await visit(scope,'pi');assert.equal(source().props.value,'all');assert.equal(status().props.value,'all');
    await visit(scope);assert.equal(source().props.value,'local');assert.equal(status().props.value,'disabled','returning restores the Codex managed filters for this scope');
   }
   await choose(source,'git');await choose(status,'enabled');await visit(globalScope);assert.equal(source().props.value,'local');assert.equal(status().props.value,'disabled');await visit(project);assert.equal(source().props.value,'git');assert.equal(status().props.value,'enabled');
   await close();
  });
  await scenario('Skill Space categories and Settings own their Agent and search filters; clearing isolates context and scope returns restore saved state',async()=>{
   await mount();
   const managed=[['git','git',false],['local','local',true]].map(([name,sourceType,enabled])=>({name:`managed-${name}`,path:`/home/managed-${name}`,agents:['codex'],source:'owner/repo',sourceUrl:null,sourceType,description:'Fixture',cliManaged:true,cliAgents:['codex'],codexState:{...codexState,documentPath:`/home/managed-${name}/SKILL.md`,installationPath:`/home/managed-${name}`,lifecycleOwner:'skills-cli',enabled}}));
   responder=async(command,args)=>command==='upstream_inventory'?{...inventory(args.target),skills:[...inventory(args.target).skills,...managed]}:command==='upstream_codex_settings'?{...snap(args.target,true),skills:[...snap(args.target,true).skills,...managed.map(skill=>({name:skill.name,description:'Fixture',state:skill.codexState}))]}:normal(command,args);
   await doRefresh();
   const agent=()=>control('Choice',props=>props.label==='按 Agent 筛选'),source=()=>control('Choice',props=>props.label==='筛选托管技能来源'),status=()=>control('Choice',props=>props.label==='筛选托管技能状态'),search=()=>control('Input',props=>props['aria-label']==='搜索已安装技能');
   const choose=async(find,value)=>{await act(async()=>find().props.onChange(value));await flush();};
   const query=async value=>{await act(async()=>search().props.onChange({target:{value}}));await flush();};
   const space=async()=>{await act(async()=>control('SidebarMenuButton',props=>props.tooltip==='技能空间').props.onClick());await flush();};
   const reads=count('upstream_inventory'),catalogReads=count('upstream_codex_settings');
   await choose(agent,'codex');await choose(source,'git');await choose(status,'disabled');await query('managed-git');
   await tab('agent');assert.equal(agent().props.value,'all');assert.equal(search().props.value,'');await choose(agent,'pi');await query('pi-skill');
   await tab('managed');assert.equal(agent().props.value,'codex');assert.equal(source().props.value,'git','a native Agent without this source must not invalidate managed source');assert.equal(status().props.value,'disabled');assert.equal(search().props.value,'managed-git');
   await tab('agent');assert.equal(agent().props.value,'pi');assert.equal(search().props.value,'pi-skill');await query('missing-native');assert.equal(control('InventoryEmpty').props.kind,'filtered');
   await act(async()=>control('InventoryEmpty').props.onClear());await flush();assert.equal(agent().props.value,'all');assert.equal(search().props.value,'');
   await tab('managed');assert.equal(agent().props.value,'codex');assert.equal(source().props.value,'git');assert.equal(status().props.value,'disabled');assert.equal(search().props.value,'managed-git');
   await tab('agent');await choose(agent,'pi');await query('pi-skill');await tab('managed');await query('missing-managed');
   await act(async()=>control('InventoryEmpty').props.onClear());await flush();assert.equal(agent().props.value,'all');assert.equal(source().props.value,'all');assert.equal(status().props.value,'all');assert.equal(search().props.value,'');
   await tab('agent');assert.equal(agent().props.value,'pi');assert.equal(search().props.value,'pi-skill');
   await act(async()=>control('Button',props=>props['aria-label']==='设置').props.onClick());await flush();await act(async()=>control('Tabs',props=>props.activationMode==='manual').props.onValueChange('agents'));await flush();
   assert.equal(control('AgentManagement').props.query,'');await act(async()=>control('AgentManagement').props.onQuery('settings-only'));
   await space();assert.equal(search().props.value,'');await tab('agent');assert.equal(agent().props.value,'pi');assert.equal(search().props.value,'pi-skill','Settings search must not replace a saved native query');
   assert.equal(count('upstream_inventory'),reads);assert.equal(count('upstream_codex_settings'),catalogReads,'category filters and Settings search do not reload inventory');
   await visit(project);await space();assert.equal(agent().props.value,'all');assert.equal(search().props.value,'');await tab('agent');assert.equal(agent().props.value,'all');assert.equal(search().props.value,'');
   await visit(globalScope);await space();assert.equal(agent().props.value,'all');await tab('agent');assert.equal(agent().props.value,'pi');assert.equal(search().props.value,'pi-skill','scope return restores the native Agent and its search');
   await close();
  });
  await scenario('sidebar Codex clear actions isolate native and managed source states without changing saved Skill Space Agent filters',async()=>{
   await mount();
   const managed={name:'managed-git',path:'/home/managed-git',agents:['codex'],source:'owner/repo',sourceUrl:null,sourceType:'git',description:'Fixture',cliManaged:true,cliAgents:['codex'],codexState:{...codexState,documentPath:'/home/managed-git/SKILL.md',installationPath:'/home/managed-git',lifecycleOwner:'skills-cli',enabled:true}};
   responder=async(command,args)=>command==='upstream_inventory'?{...inventory(args.target),skills:[...inventory(args.target).skills,managed]}:command==='upstream_codex_settings'?{...snap(args.target,true),skills:[...snap(args.target,true).skills,{name:managed.name,description:'Fixture',state:managed.codexState}]}:normal(command,args);
   await doRefresh();
   const choose=async(find,value)=>{await act(async()=>find().props.onChange(value));await flush();};
   const agent=()=>control('Choice',props=>props.label==='按 Agent 筛选'),source=()=>control('Choice',props=>props.label==='筛选托管技能来源'),status=()=>control('Choice',props=>props.label==='筛选托管技能状态'),nativeStatus=()=>control('Choice',props=>props.label==='筛选技能状态'),nativeSource=()=>control('CodexSkillSourceChoice'),search=()=>control('Input',props=>props['aria-label']==='搜索已安装技能');
   const query=async value=>{await act(async()=>search().props.onChange({target:{value}}));await flush();};
   await choose(agent,'pi');await tab('agent');await choose(agent,'hermes-agent');await visit(globalScope);
   const reads=count('upstream_inventory'),catalogReads=count('upstream_codex_settings');
   await choose(source,'git');await choose(status,'enabled');await query('managed-git');
   await tab('agent');await choose(nativeSource,'local');await choose(nativeStatus,'disabled');await query('missing-native');
   await tab('managed');assert.equal(source().props.value,'git');assert.equal(status().props.value,'enabled');assert.equal(search().props.value,'managed-git');await query('missing-managed');
   await act(async()=>control('InventoryEmpty').props.onClear());await flush();assert.equal(source().props.value,'all');assert.equal(status().props.value,'all');
   await tab('agent');assert.equal(nativeSource().props.value,'local');assert.equal(nativeStatus().props.value,'disabled');assert.equal(search().props.value,'missing-native');
   await tab('managed');await choose(source,'git');await choose(status,'enabled');await query('managed-git');await tab('agent');
   await act(async()=>control('InventoryEmpty').props.onClear());await flush();assert.equal(nativeSource().props.value,'all');assert.equal(nativeStatus().props.value,'all');assert.equal(search().props.value,'');
   await tab('managed');assert.equal(source().props.value,'git');assert.equal(status().props.value,'enabled');assert.equal(search().props.value,'managed-git');
   assert.equal(count('upstream_inventory'),reads);assert.equal(count('upstream_codex_settings'),catalogReads);
   await act(async()=>control('SidebarMenuButton',props=>props.tooltip==='技能空间').props.onClick());await flush();assert.equal(agent().props.value,'pi','an Agent page Clear must not change the saved managed Agent filter');await tab('agent');assert.equal(agent().props.value,'hermes-agent','an Agent page Clear must not change the saved native Agent filter');
   await close();
  });
  await scenario('each global and project Agent remembers managed and native view filters without rereading inventories',async()=>{
   await prepareFilterMatrix();
   const scopes=[globalScope,project,other],ids=['codex','pi','hermes-agent'];
   const query=()=>control('Input',props=>props['aria-label']==='搜索已安装技能'),managedSource=()=>control('Choice',props=>props.label==='筛选托管技能来源'),managedStatus=()=>control('Choice',props=>props.label==='筛选托管技能状态');
   const nativeSource=id=>id==='codex'?control('CodexSkillSourceChoice'):id==='pi'?control('PiSkillSourceChoice'):control('Choice',props=>props.label==='筛选原生来源');
   const nativeStatus=id=>control('Choice',props=>props.label===(id==='pi'?'筛选原生技能':'筛选技能状态'));
   const change=async(node,value)=>{await act(async()=>node.props.onChange(value));await flush();};
   const search=async value=>{await act(async()=>query().props.onChange({target:{value}}));await flush();};
   const label=scope=>scope.projectPath??'global';
   for(const scope of scopes)for(const id of ids){
    await visit(scope,id);assert.equal(query().props.value,'');assert.equal(managedSource().props.value,'all');assert.equal(managedStatus().props.value,'all');
    await change(managedSource(),'git');await change(managedStatus(),'enabled');await search(`managed:${label(scope)}:${id}`);
    await tab('agent');assert.equal(query().props.value,'');assert.equal(nativeSource(id).props.value,'all');assert.equal(nativeStatus(id).props.value,'all');
    await change(nativeSource(id),'local');await change(nativeStatus(id),id==='pi'?'manual':id==='hermes-agent'?'ondemand':'disabled');const sourceSkills=nativeSource(id).props.skills?.map(skill=>skill.path);if(id!=='hermes-agent')assert(sourceSkills.length>0);await search(`native:${label(scope)}:${id}`);if(sourceSkills)assert.deepEqual(nativeSource(id).props.skills.map(skill=>skill.path),sourceSkills,'a zero-result search must not shrink native source choices');
   }
   const reads=count('upstream_inventory'),catalogReads=count('upstream_codex_settings');
   for(const scope of [...scopes].reverse())for(const id of [...ids].reverse()){
    await visit(scope,id);assert.equal(query().props.value,`managed:${label(scope)}:${id}`);assert.equal(managedSource().props.value,'git');assert.equal(managedStatus().props.value,'enabled');
    await tab('agent');assert.equal(query().props.value,`native:${label(scope)}:${id}`);assert.equal(nativeSource(id).props.value,'local');assert.equal(nativeStatus(id).props.value,id==='pi'?'manual':id==='hermes-agent'?'ondemand':'disabled');
   }
   await visit(project);await tab('agent');await act(async()=>control('InventoryEmpty').props.onClear());await flush();assert.equal(query().props.value,'');assert.equal(nativeSource('codex').props.value,'all');assert.equal(nativeStatus('codex').props.value,'all');
   await tab('managed');assert.equal(query().props.value,`managed:${project.projectPath}:codex`);assert.equal(managedSource().props.value,'git');
   await visit(globalScope);await tab('agent');assert.equal(query().props.value,'native:global:codex');assert.equal(nativeStatus('codex').props.value,'disabled');
   assert.equal(count('upstream_inventory'),reads);assert.equal(count('upstream_codex_settings'),catalogReads);await close();
  });
  await scenario('Skill Space Agent dropdown restores each Agent filter record and Clear resets only its current context and destination All view',async()=>{
   await prepareFilterMatrix();const agent=()=>control('Choice',props=>props.label==='按 Agent 筛选'),source=()=>control('Choice',props=>props.label==='筛选托管技能来源'),status=()=>control('Choice',props=>props.label==='筛选托管技能状态'),query=()=>control('Input',props=>props['aria-label']==='搜索已安装技能');
   const change=async(node,value)=>{await act(async()=>node.props.onChange(value));await flush();};
   const search=async value=>{await act(async()=>query().props.onChange({target:{value}}));await flush();};
   const reads=count('upstream_inventory'),catalogReads=count('upstream_codex_settings');
   await change(source(),'git');await change(status(),'disabled');await search('all-saved');
   for(const id of ['codex','pi','hermes-agent']){await change(agent(),id);assert.equal(query().props.value,'');assert.equal(source().props.value,'all');await change(source(),'git');await change(status(),'enabled');await search(`managed-${id}-saved`);}
   for(const id of ['codex','pi','hermes-agent']){await change(agent(),id);assert.equal(query().props.value,`managed-${id}-saved`);assert.equal(source().props.value,'git');assert.equal(status().props.value,'enabled');}
   await tab('agent');assert.equal(agent().props.value,'all');await change(agent(),'pi');await search('native-pi-saved');await tab('managed');assert.equal(agent().props.value,'hermes-agent');assert.equal(query().props.value,'managed-hermes-agent-saved');
   await act(async()=>control('InventoryEmpty').props.onClear());await flush();assert.equal(agent().props.value,'all');assert.equal(query().props.value,'');assert.equal(source().props.value,'all');assert.equal(status().props.value,'all');
   await change(agent(),'codex');assert.equal(query().props.value,'managed-codex-saved');assert.equal(source().props.value,'git');await change(agent(),'hermes-agent');assert.equal(query().props.value,'');assert.equal(source().props.value,'all');
   await tab('agent');assert.equal(agent().props.value,'pi');assert.equal(query().props.value,'native-pi-saved');assert.equal(count('upstream_inventory'),reads);assert.equal(count('upstream_codex_settings'),catalogReads);await close();
  });
  await scenario('Codex plugin and discovery searches and Settings status restore separately for global and each project',async()=>{
   await prepareFilterMatrix();const scopes=[globalScope,project,other],key=scope=>scope.projectPath??'global';
   const pluginView=()=>control('CodexManagement'),directory=()=>control('CodexPluginDirectory');
   const settings=async()=>{await act(async()=>control('Button',props=>props['aria-label']==='设置').props.onClick());await flush();await act(async()=>control('Tabs',props=>props.activationMode==='manual').props.onValueChange('agents'));await flush();};
   const views=[{tab:'public',section:null},{tab:'personal',section:null},{tab:'public',section:{id:'writing',urlSlug:'writing',title:'Writing',kind:'public',plugins:[]}},{tab:'public',section:{id:'coding',urlSlug:'coding',title:'Coding',kind:'public',plugins:[]}}];
   for(const scope of scopes){
    await visit(scope);await tab('plugins');assert.equal(pluginView().props.query,'');await act(async()=>{pluginView().props.onQuery(`plugins:${key(scope)}`);pluginView().props.setSource('market:market');pluginView().props.setStatus('disabled');});await flush();
    await act(async()=>pluginView().props.onAdd());await flush();
    for(const [index,view]of views.entries()){await act(async()=>directory().props.onView(view));await flush();assert.equal(directory().props.query,'');await act(async()=>directory().props.onQuery(`${key(scope)}:directory-${index}`));await flush();}
    for(const [index,view]of views.entries()){await act(async()=>directory().props.onView(view));await flush();assert.equal(directory().props.query,`${key(scope)}:directory-${index}`);}
    await settings();assert.equal(control('AgentManagement').props.query,'');assert.equal(control('AgentManagement').props.status,'all');await act(async()=>{control('AgentManagement').props.onQuery(`settings:${key(scope)}`);control('AgentManagement').props.onStatus(scope.scope==='global'?'confirmed':scope.projectPath===project.projectPath?'configurationOnly':'notFound');});await flush();
   }
   const reads=count('upstream_inventory'),catalogReads=count('upstream_codex_settings');
   for(const scope of [...scopes].reverse()){
    await visit(scope);await tab('plugins');assert.equal(pluginView().props.query,`plugins:${key(scope)}`);assert.equal(pluginView().props.source,'market:market');assert.equal(pluginView().props.status,'disabled');
    await act(async()=>pluginView().props.onAdd());await flush();for(const [index,view]of views.entries()){await act(async()=>directory().props.onView(view));await flush();assert.equal(directory().props.query,`${key(scope)}:directory-${index}`);}
    await settings();assert.equal(control('AgentManagement').props.query,`settings:${key(scope)}`);assert.equal(control('AgentManagement').props.status,scope.scope==='global'?'confirmed':scope.projectPath===project.projectPath?'configurationOnly':'notFound');
   }
   assert.equal(count('upstream_inventory'),reads);assert.equal(count('upstream_codex_settings'),catalogReads);await close();
  });
  await scenario('managed navigation and locale, search and filters reuse actual scope inventories',async()=>{
   await mount();await visit(globalScope);await visit(project);await visit(globalScope);await visit(other);await visit(project);await visit(globalScope);
   assert.equal(count('upstream_inventory'),3);assert.equal(count('upstream_codex_account_status'),3);assert.equal(count('upstream_codex_settings'),3);
   await act(async()=>control('Input',props=>props['aria-label']==='搜索已安装技能').props.onChange({target:{value:'native'}}));
   await tab('agent');await act(async()=>control('Choice',props=>props.label==='筛选技能状态').props.onChange('enabled'));await tab('managed');
   await act(async()=>control('Button',props=>props['aria-label']==='设置').props.onClick());await flush();
   await act(async()=>control('Tabs',props=>props.activationMode==='manual').props.onValueChange('appearance'));
   await act(async()=>{control('AppearanceSettings').props.onChange({language:'en'});await tick();});await flush();await visit(globalScope);
   assert.equal(count('upstream_inventory'),3);assert.equal(count('upstream_codex_settings'),3,'each visited scope reads once; tabs and locale reuse its catalog');await close();
  });
  await scenario('plugin catalog loads once on sidebar entry; plugin tabs and scope returns reuse it',async()=>{
   await mount();await visit(globalScope);await tab('plugins');assert.equal(count('upstream_codex_settings'),1);assert.equal(count('upstream_codex_account_status'),1);
   await tab('managed');await tab('plugins');assert.equal(count('upstream_codex_settings'),1);
   await visit(project);assert.equal(tabs().props.value,'managed');assert.equal(count('upstream_codex_settings'),2);await tab('plugins');assert.equal(count('upstream_codex_settings'),2);
   await tab('managed');assert.equal(count('upstream_codex_settings'),2);await close();
  });
  await scenario('returning to global Codex retains its loaded plugin count after reading project plugins',async()=>{
   await mount();
   responder=(command,args)=>command==='upstream_codex_settings'&&args.target.scope==='project'?{...snap(args.target,true),plugins:[{...plugin,id:'project-one@market'},{...plugin,id:'project-two@market'}]}:normal(command,args);
   await visit(globalScope);await tab('plugins');
   const visibleCount=()=>control('TabsTrigger',props=>props.value==='plugins').findByType('span').children.join('');
   assert.equal(visibleCount(),'1');
   const globalSnapshot=state().codex;
   assert.equal(globalSnapshot.catalogRequested,true);
   await visit(project);await visit(globalScope);
   assert.equal(visibleCount(),'1','visiting only project managed skills preserves the loaded global count');
   assert.equal(state().codex.contextId,globalSnapshot.contextId);
   await visit(project);await tab('plugins');assert.equal(visibleCount(),'2');
   const reads=count('upstream_inventory'),catalogReads=count('upstream_codex_settings');
   await visit(globalScope);
   assert.equal(state().codex.catalogRequested,true,'returning must retain the full global catalog used by the visible count');
   assert.equal(state().codex.plugins.length,globalSnapshot.plugins.length);
   assert.equal(state().codex.contextId,globalSnapshot.contextId);
   assert.equal(visibleCount(),'1','the already loaded count remains visible before re-entering plugins');
   assert.equal(count('upstream_inventory'),reads,'a read-only project catalog must not evict the global inventory');
   await tab('plugins');
   assert.equal(control('CodexManagement').props.snapshot.catalogRequested,true);
   assert.equal(count('upstream_codex_settings'),catalogReads,'returning to loaded plugins must not reread the catalog');
   await visit(globalScope,'pi');await visit(globalScope);assert.equal(visibleCount(),'1');
   await visit(project);assert.equal(visibleCount(),'2');assert.equal(state().codex.contextId,project.projectPath);await tab('plugins');
   assert.equal(count('upstream_codex_settings'),catalogReads);assert.equal(count('upstream_inventory'),reads);
   await close();
  });
  await scenario('a failed first plugin catalog read stops automatic retries and explicit Refresh can recover',async()=>{
   await mount();let attempts=0,fail=true;
   responder=(command,args)=>{if(command==='upstream_codex_settings'&&fail){attempts++;return attempts>3?new Promise(()=>{}):Promise.reject(Error('Fixture catalog unavailable'));}return normal(command,args);};
   await visit(globalScope);await tab('plugins');assert.equal(attempts,1,'a catalog failure must not automatically restart its own failed request');assert.equal(control('CodexManagement').props.loading,false);
   fail=false;await act(async()=>{control('CodexManagement').props.onRefresh();await tick();});await flush();assert.equal(count('upstream_codex_settings'),2);assert.equal(control('CodexManagement').props.snapshot.unavailableReason,undefined);assert.equal(control('CodexManagement').props.loading,false);await close();
  });
  await scenario('an actual unavailable Codex inventory observation replaces previously loaded plugin permissions',async()=>{
   await mount();await visit(globalScope);await tab('plugins');assert.equal(control('CodexManagement').props.snapshot.plugins[0].canToggle,true);
   const catalogReads=count('upstream_codex_settings');await tab('managed');
   const unavailable={contextId:null,binary:'/codex',version:'',codexHome:'/home/.codex',configPath:'/home/.codex/config.toml',revision:'',rules:[],capabilities:{writeConfig:false,writeDefaults:false,nameRules:false,listPlugins:false,listMarketplaces:false,installPlugins:false,uninstallPlugins:false},skills:[],plugins:[],warnings:['Fixture Codex inspection failed'],pluginsComplete:false,catalogRequested:false,unavailableReason:'unavailable'};
   responder=(command,args)=>command==='upstream_inventory'?Promise.resolve({...inventory(args.target),codex:unavailable}):normal(command,args);
   await doRefresh();assert.equal(state().codex.unavailableReason,'unavailable');await tab('plugins');
   assert.equal(control('CodexManagement').props.snapshot.unavailableReason,'unavailable','the hook must accept the current native failure instead of keeping old writable plugin metadata');
   assert.equal(control('CodexManagement').props.snapshot.plugins.some(plugin=>plugin.canToggle||plugin.canUninstall||plugin.canCheckUpdates),false);
   assert.equal(count('upstream_codex_settings'),catalogReads,'unavailable physical observations do not start an automatic catalog retry loop');assert.equal(control('CodexManagement').props.loading,false);
   responder=normal;await act(async()=>{control('CodexManagement').props.onRefresh();await tick();});await flush();assert.equal(count('upstream_codex_settings'),catalogReads+1);assert.equal(control('CodexManagement').props.snapshot.plugins[0].canToggle,true);assert.equal(control('CodexManagement').props.loading,false);await close();
  });
  await scenario('explicit Refresh rereads current scope and invalidates other cached inventories',async()=>{
   await mount();await visit(project);await visit(globalScope);assert.equal(count('upstream_inventory'),2);
   await doRefresh();assert.equal(count('upstream_inventory'),3);assert.equal(pending(),false);
   await visit(project);assert.equal(count('upstream_inventory'),4);await visit(globalScope);assert.equal(count('upstream_inventory'),4);await close();
  });
  await scenario('failed inventory reads remain retryable and do not strand the current spinner',async()=>{
   await mount();let fail=true;responder=(command,args)=>command==='upstream_inventory'&&fail?Promise.reject(Error('Fixture failed')):normal(command,args);
   await visit(project);assert.equal(state(),null);assert.equal(pending(),false);fail=false;await doRefresh();assert.equal(state().version,'/home/a:default');assert.equal(pending(),false);await close();
  });
  await scenario('equivalent pending reads merge while different scope replies cannot overwrite the active scope',async()=>{
   await mount();const replies=new Map();responder=(command,args)=>command==='upstream_inventory'&&args.target.scope==='project'?new Promise(resolve=>replies.set(args.target.projectPath,resolve)):normal(command,args);
   await visit(project);await visit(other);await visit(project);assert.equal(count('upstream_inventory'),3);
   await act(async()=>{replies.get('/home/b')(inventory(other,null,'B'));await tick();});await flush();assert.equal(state(),null);
   await act(async()=>{replies.get('/home/a')(inventory(project,null,'A'));await tick();});await flush();assert.equal(state().version,'A');assert.equal(pending(),false);
   await visit(other);assert.equal(state().version,'B');assert.equal(count('upstream_inventory'),3);await close();
  });
  await scenario('same-key fresh requests share the actual pending native read',async()=>{
   await mount();await visit(globalScope);let finish;responder=(command,args)=>command==='upstream_inventory'?new Promise(resolve=>{finish=resolve;}):normal(command,args);
   const action=refresh().props.onClick;await act(async()=>{action();action();await tick();});assert.equal(count('upstream_inventory'),2);
   await act(async()=>{finish(inventory(globalScope));await tick();});await flush();assert.equal(pending(),false);await close();
  });
  await scenario('DSH context changes use a new inventory key rather than caching the old snapshot under it',async()=>{
   await mount();await act(async()=>control('Button',props=>props['aria-label']==='设置').props.onClick());await flush();
   await act(async()=>control('Tabs',props=>props.activationMode==='manual').props.onValueChange('agents'));
   await act(async()=>control('AgentManagement').props.onOpen('deepseek-harness'));
   await act(async()=>{control('DshManagement').props.onContext(globalScope,'context-two');await tick();});await flush();
   assert(calls.some(call=>call.command==='upstream_inventory'&&call.args.dshContextKey==='context-two'));assert.equal(state().version,'global:context-two');
   await act(async()=>{control('DshManagement').props.onContext(globalScope,null);await tick();});await flush();assert.equal(state().version,'global:default');assert.equal(count('upstream_inventory'),2);await close();
  });
  await scenario('Codex skill writeback updates current state and invalidates other scopes without another current scan',async()=>{
   await mount();await visit(project);await visit(globalScope);await tab('agent');
   await act(async()=>{control('Switch',props=>String(props['aria-label']).includes('native')).props.onCheckedChange(false);await tick();});await flush();
   assert.equal(count('upstream_codex_toggle'),1);assert.equal(count('upstream_inventory'),2);assert.equal(state().skills.find(skill=>skill.name==='native').codexState.enabled,false);
   await visit(project);assert.equal(count('upstream_inventory'),3);assert.equal(state().skills.find(skill=>skill.name==='native').codexState.enabled,false);await close();
  });
  await scenario('Hermes verified writeback defeats a late inventory Refresh without reverting current state',async()=>{
   await mount();await visit(globalScope,'hermes-agent');await tab('agent');let finish;
   assert(control('Switch',props=>String(props['aria-label']).includes('hermes-skill')));
   const stale=inventory(globalScope);responder=(command,args)=>command==='upstream_inventory'?new Promise(resolve=>{finish=resolve;}):normal(command,args);
   await doRefresh();assert.equal(pending(),true);assert(control('LoadingCards'));assert.equal(refresh().props.disabled,true);
   const skillSwitch=control('Switch',props=>String(props['aria-label']).includes('hermes-skill'));
   assert(!!skillSwitch,'the real card remains mounted next to the loading skeleton');assert.equal(skillSwitch.props.disabled,false);
   await act(async()=>{skillSwitch.props.onCheckedChange(false);await tick();});await flush();
   assert.equal(count('upstream_hermes_save'),1);assert.equal(state().skills.find(skill=>skill.name==='hermes-skill').hermesState.enabled,false);
   await act(async()=>{finish(stale);await tick();});await flush();
   assert.equal(state().skills.find(skill=>skill.name==='hermes-skill').hermesState.enabled,false,'a stale inventory must not undo a verified mutation');assert.equal(pending(),false);await close();
  });
  await scenario('a pending catalog is superseded by explicit inventory Refresh and only the new catalog completes',async()=>{
   await mount();const catalogs=[];let finishInventory;
   responder=(command,args)=>command==='upstream_codex_settings'?new Promise(resolve=>catalogs.push(resolve)):command==='upstream_inventory'?new Promise(resolve=>{finishInventory=resolve;}):normal(command,args);
   await visit(globalScope);await tab('plugins');assert.equal(catalogs.length,1);await tab('managed');await doRefresh();await tab('plugins');assert.equal(catalogs.length,1);
   await act(async()=>{catalogs[0]({...snap(globalScope,true),revision:'obsolete'});await tick();});await flush();assert.notEqual(state().codex.revision,'obsolete');
   responder=normal;await act(async()=>{finishInventory(inventory(globalScope,null,'fresh inventory'));await tick();});await flush();
   assert.equal(state().version,'fresh inventory');assert.equal(count('upstream_inventory'),2);assert.equal(count('upstream_codex_settings'),2);assert.equal(control('CodexManagement').props.loading,false);
   await tab('managed');await tab('plugins');assert.equal(count('upstream_codex_settings'),2);await close();
  });
  await scenario('plugin enablement writeback does not trigger a redundant physical inventory read and errors remain retryable',async()=>{
   await mount();await visit(globalScope);await tab('plugins');const fullReads=count('upstream_inventory');let fail=true;
   responder=(command,args)=>command==='upstream_codex_plugin'&&fail?Promise.reject(Error('Fixture plugin write failed')):normal(command,args);
   await act(async()=>control('CodexManagement').props.onAction(control('CodexManagement').props.snapshot.plugins[0],'disable'));await flush();
   await act(async()=>{control('CodexConfirmation').props.onApply();await tick();});await flush();assert.equal(sidebar().props.disabled,false);assert.equal(control('CodexManagement').props.loading,false);assert(control('CodexConfirmation').props.pending);
   fail=false;await act(async()=>{control('CodexConfirmation').props.onApply();await tick();});await flush();
   assert.equal(control('CodexManagement').props.snapshot.plugins[0].enabled,false);assert.equal(control('CodexConfirmation').props.pending,null);assert.equal(count('upstream_inventory'),fullReads);assert.equal(sidebar().props.disabled,false);await close();
  });
  await scenario('sidebar Agent metadata failures retry without loading a project skill inventory',async()=>{
   enabled=true;hermesEnabled=true;piEnabled=true;pluginEnabled=true;projectCount=2;calls=[];unhandled=[];let fail=true;
   responder=(command,args)=>command==='upstream_agents'&&args.target.projectPath==='/home/a'&&fail?Promise.reject(Error('Fixture metadata failed')):normal(command,args);
   globalThis.appLoadingInvoke=(command,args)=>{calls.push({command,args});return responder(command,args);};await act(async()=>{renderer=create(React.createElement(App));await tick();});await flush();
   const retry=controls('Button').find(node=>node.children.includes('智能体列表读取失败，点击重试'));assert(!!retry);assert.equal(count('upstream_inventory'),1);
   fail=false;await act(async()=>{retry.props.onClick();await tick();});await flush();assert.equal(count('upstream_agents'),3);assert.equal(count('upstream_inventory'),1);assert(!controls('Button').some(node=>node.children.includes('智能体列表读取失败，点击重试')));await close();
  });
  await scenario('Pi verified writeback defeats a late inventory Refresh without reverting current state',async()=>{
   await mount();await visit(globalScope,'pi');await tab('agent');let finish;
   const stale=inventory(globalScope);responder=(command,args)=>command==='upstream_inventory'?new Promise(resolve=>{finish=resolve;}):normal(command,args);
   await doRefresh();const skillSwitch=control('Switch',props=>String(props['aria-label']).includes('pi-skill'));assert(!!skillSwitch);assert.equal(skillSwitch.props.disabled,false);
   await act(async()=>{skillSwitch.props.onCheckedChange(false);await tick();});await flush();assert.equal(count('upstream_pi_toggle'),1);assert.equal(state().skills.find(skill=>skill.name==='pi-skill').piState.enabled,false);
   await act(async()=>{finish(stale);await tick();});await flush();assert.equal(state().skills.find(skill=>skill.name==='pi-skill').piState.enabled,false);assert.equal(pending(),false);await close();
  });
 }finally{if(renderer)try{await act(async()=>renderer.unmount());}catch{}for(const[key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}delete globalThis.appLoadingInvoke;await rm(work,{recursive:true,force:true});}
});
