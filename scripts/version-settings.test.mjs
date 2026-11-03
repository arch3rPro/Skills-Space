// Component state flows; shared HTML projection is covered by skill-document.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
const modules=process.env.SKILLS_SPACE_REACT_TEST_MODULES;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const entry=(current,state='current',latest=current,url=null)=>({current,state,latest,url,error:null});
const versions=(app=entry('0.1.0'),cli=entry('1.7.4'))=>({app,cli});
const notes=version=>({latest:version,releases:[version,'0.0.9'].map(v=>({version:v,title:v,url:`https://github.com/arch3rPro/Skills-Space/releases/tag/v${v}`,updatedAt:'',html:`<p>Notes ${v}</p>`}))});
const text=node=>node?.type==='svg'?'':Array.isArray(node)?node.map(text).join(''):typeof node==='string'?node:node?.children?.map(text).join('')??'';
async function harness(initial=versions()){
 const root=process.cwd(),work=await mkdtemp(join(tmpdir(),'version-settings-'));
 const reactPath=resolve(modules,'react/index.js');
 const React=await import(reactPath),{create,act}=await import(resolve(modules,'react-test-renderer/index.js'));
 const {build}=createRequire(import.meta.resolve('vite'))('esbuild');const outfile=join(work,'subject.mjs');
 await build({entryPoints:['src/components/version-settings.tsx'],bundle:true,platform:'node',format:'esm',outfile,jsx:'automatic',loader:{'.png':'dataurl'},logLevel:'silent',banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'version-boundaries',setup(b){
  b.onResolve({filter:/^react(?:\/.*)?$/},a=>({path:a.path==='react'?reactPath:resolve(modules,a.path+'.js'),external:true}));
  const boundaries=new Map([['@tauri-apps/api/core','invoke'],['@tauri-apps/plugin-opener','opener'],['@/lib/notifications','notifications'],['@/components/modal','modal'],['@/components/skill-markdown','html'],['@/lib/website-document','summary']]);
  b.onResolve({filter:/^(?:@tauri-apps\/|@\/lib\/(?:notifications|website-document)$|@\/components\/(?:modal|skill-markdown)$)/},a=>({path:boundaries.get(a.path),namespace:'probe'}));
  b.onLoad({filter:/.*/,namespace:'probe'},a=>({contents:{summary:'export const applicationReleaseSummary=html=>html;',invoke:'export const invoke=(...a)=>globalThis.versionSettingsProbe.invoke(...a);',opener:'export const openUrl=url=>globalThis.versionSettingsProbe.open(url);',notifications:'export const notifyError=(...a)=>globalThis.versionSettingsProbe.errors.push(a);export const notifySuccess=(...a)=>globalThis.versionSettingsProbe.success.push(a);',modal:"import React from 'react';export const Modal=({open,onClose,children})=>open?React.createElement('section',{role:'dialog'},React.createElement('button',{'aria-label':'Close notes',onClick:onClose},'Close'),children):null;",html:"import React from 'react';export const SkillHtml=({html,origin})=>React.createElement('article',{'data-origin':origin},html);"}[a.path]}));
 }}]});
 const {VersionSettings}=await import(pathToFileURL(outfile));let renderer;const calls=[],queue=[],errors=[],success=[],opened=[];
 const probe={calls,queue,errors,success,opened,checkResponse:versions(),invoke(command){calls.push(command);if(command==='application_versions')return initial instanceof Error?Promise.reject(initial):Promise.resolve(initial);if(command==='application_release_notes'){assert(queue.length,'notes response must be explicit');return Promise.resolve(queue.shift());}if(command==='application_check_versions')return Promise.resolve(probe.checkResponse);throw Error('Unexpected native command: '+command);},open(url){opened.push(url);return Promise.resolve();}};
 globalThis.versionSettingsProbe=probe;globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);globalThis.cancelAnimationFrame=clearTimeout;
 const flush=async action=>act(async()=>{if(action)action();await new Promise(r=>setImmediate(r));});
 await flush(()=>{renderer=create(React.createElement(VersionSettings,{zh:true,disabled:false}));});
 const button=label=>renderer.root.findAllByType('button').find(n=>text(n)===label||n.props['aria-label']===label);
 return {probe,renderer,flush,button,click:label=>flush(()=>{const b=button(label);assert(b,`Missing action ${label}`);assert(!b.props.disabled,`Disabled action ${label}`);b.props.onClick({defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}});}),update:zh=>flush(()=>renderer.update(React.createElement(VersionSettings,{zh,disabled:false}))),close:async()=>{await flush(()=>renderer.unmount());delete globalThis.versionSettingsProbe;await rm(work,{recursive:true,force:true});}};
}

test('release notes load lazily, retry, cache by latest version and discard superseded reads',{skip:!modules},async()=>{
 const h=await harness();try{
  const {probe,renderer,flush}=h;assert.equal(probe.calls.filter(x=>x==='application_versions').length,1);await h.update(false);assert.equal(probe.calls.length,1);
  const failed=deferred();probe.queue.push(failed.promise);await h.click('Release notes');assert.equal(renderer.root.findAllByProps({role:'status'}).some(n=>n.props['aria-label']==='Reading release notes'),true);
  await h.click('Close notes');await h.click('Release notes');assert.equal(probe.calls.filter(x=>x==='application_release_notes').length,1);
  await flush(()=>failed.reject(Error('offline')));assert(h.button('Retry'));
  probe.queue.push({latest:null,releases:[]});await h.click('Retry');assert(text(renderer.toJSON()).includes('No release notes yet'));
  await h.click('Close notes');await h.click('Release notes');assert.equal(probe.calls.filter(x=>x==='application_release_notes').length,2);await h.click('Close notes');
  probe.checkResponse=versions(entry('0.1.0','available','0.2.0','https://github.com/arch3rPro/Skills-Space/releases/latest'));await h.click('Check updates');probe.queue.push(notes('0.2.0'));await h.click('Release notes');
  let toggles=renderer.root.findAllByType('button').filter(n=>n.props['aria-expanded']!==undefined);assert.equal(toggles.length,2);assert.equal(toggles[0].props['aria-expanded'],true);assert.equal(toggles[1].props['aria-expanded'],false);
  await flush(()=>toggles[1].props.onClick({defaultPrevented:false}));assert.equal(renderer.root.findAllByType('button').filter(n=>n.props['aria-expanded']!==undefined)[1].props['aria-expanded'],true);
  await h.click('Close notes');await h.click('Release notes');assert.equal(probe.calls.filter(x=>x==='application_release_notes').length,3);await h.click('Close notes');
  probe.checkResponse=versions(entry('0.1.0','available','0.3.0'));await h.click('Check updates');const old=deferred();probe.queue.push(old.promise);await h.click('Release notes');await h.click('Close notes');
  probe.checkResponse=versions(entry('0.1.0','available','0.4.0'));await h.click('Check updates');const current=deferred();probe.queue.push(current.promise);await h.click('Release notes');
  await flush(()=>old.resolve(notes('0.3.0')));assert.equal(renderer.root.findAllByProps({role:'status'}).some(n=>n.props['aria-label']==='Reading release notes'),true,'superseded completion must not replace the pending latest read');
  await h.click('Close notes');await h.click('Release notes');assert.equal(probe.calls.filter(x=>x==='application_release_notes').length,5,'old finally must not clear the newer pending request');
  await flush(()=>current.resolve(notes('0.4.0')));assert(text(renderer.toJSON()).includes('v0.4.0'));assert(!text(renderer.toJSON()).includes('v0.3.0'));
  await h.click('Close notes');const checking=deferred();probe.checkResponse=checking.promise;await h.click('Check updates');await h.click('Release notes');assert(text(renderer.toJSON()).includes('v0.4.0'));const refreshed=deferred();probe.queue.push(refreshed.promise);await flush(()=>checking.resolve(versions(entry('0.1.0','available','0.5.0'))));assert.equal(probe.calls.filter(x=>x==='application_release_notes').length,6,'new latest refreshes an already open dialog');await flush(()=>refreshed.resolve(notes('0.5.0')));assert(text(renderer.toJSON()).includes('v0.5.0'));
 }finally{await h.close();}
});

test('version check retries app failures, keeps CLI informational and opens in-app help',{skip:!modules},async()=>{
 const h=await harness(Error('initial read failed'));try{
  const {probe,renderer,flush}=h;assert(text(renderer.toJSON()).includes('版本读取失败'));const pending=deferred();probe.checkResponse=pending.promise;await h.click('检查更新');await h.update(false);assert.equal(probe.calls.filter(x=>x==='application_versions').length,1);
  await flush(()=>pending.resolve(versions({...entry('0.1.0','failed',null),error:'network'},entry('1.7.4','available','1.7.6'))));assert(text(renderer.toJSON()).includes('skills CLI v1.7.4'));assert(!text(renderer.toJSON()).includes('1.7.6'));assert(text(renderer.toJSON()).includes('v0.1.0'));assert.match(probe.errors.at(-1)[0],/Skills Space/);assert.doesNotMatch(probe.errors.at(-1)[0],/skills CLI/);assert.equal(probe.errors.at(-1)[1],false);assert(!text(renderer.toJSON()).includes('Could not read versions'));
  probe.checkResponse=versions(entry('0.1.0','available','0.2.0','https://github.com/arch3rPro/Skills-Space/releases/latest'));await h.click('Check updates');assert.match(probe.success.at(-1)[0],/0\.2\.0/);await h.click('Download update');await h.click('Help');assert.equal(renderer.root.findAllByProps({role:'dialog'}).length,1);for(const label of ['Quick start','Skill Space','Skill Store','Global and projects','Agent-native skills','Updates and removal','Settings'])assert(text(renderer.toJSON()).includes(label),label);assert.equal(probe.opened.length,1,'help stays inside the application');await h.click('Close notes');await h.click('Report issue');await h.click('GitHub');assert.deepEqual(probe.opened,['https://github.com/arch3rPro/Skills-Space/releases/latest','https://github.com/arch3rPro/Skills-Space/issues/new','https://github.com/arch3rPro/Skills-Space']);
  probe.checkResponse=versions(entry('0.1.0'),{...entry('1.7.4','failed',null),error:'service'});await h.click('Check updates');assert.match(probe.success.at(-1)[0],/Skills Space is up to date/);assert.equal(probe.errors.length,1,'CLI metadata must not produce an update-check error');assert(!h.button('Download update'));assert(probe.calls.every(c=>['application_versions','application_check_versions'].includes(c)),'checking must not request any mutation');
 }finally{await h.close();}
});
