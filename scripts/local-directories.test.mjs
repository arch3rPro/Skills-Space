import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const modules=process.env.SKILLS_SPACE_REACT_TEST_MODULES;

test('local directory metadata and actual path links preserve native authority and execution paths',{skip:!modules},async t=>{
 const root=process.cwd(),work=await mkdtemp(join(tmpdir(),'skills-space-directory-links-'));
 const require=createRequire(import.meta.resolve('vite')),{build}=require('esbuild');
 const reactPath=resolve(modules,'react/index.js'),React=await import(reactPath),{create,act}=await import(resolve(modules,'react-test-renderer/index.js'));
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const sources=await Promise.all(['src/components/directory-link.tsx','src/components/pi-package-detail.tsx','src/components/codex-plugin-page.tsx'].map(path=>readFile(path,'utf8')));
 const names=[...new Set(sources.flatMap(source=>[...source.matchAll(/import \{([^}]+)\} from '(?:lucide-react|@\/components\/[^']+)'/g)].flatMap(match=>match[1].split(',').map(name=>name.trim()))))];
 const outfile=join(work,'subject.mjs');
 await build({stdin:{contents:"export {useLocalDirectories} from './src/hooks/use-local-directories';export {DirectoryLink} from './src/components/directory-link';export {PiPackageDetail} from './src/components/pi-package-detail';export {CodexPluginPage} from './src/components/codex-plugin-page';",resolveDir:root},bundle:true,platform:'node',format:'esm',outfile,jsx:'automatic',plugins:[{name:'directory-fixtures',setup(b){
  b.onResolve({filter:/^react(?:\/.*)?$/},a=>({path:a.path==='react'?reactPath:resolve(modules,a.path+'.js'),external:true}));
  b.onResolve({filter:/^@\/components\/directory-link$/},()=>({path:resolve(root,'src/components/directory-link.tsx')}));
  b.onResolve({filter:/^@tauri-apps\/api\/core$/},()=>({path:'invoke',namespace:'fixture'}));
  b.onResolve({filter:/^@tauri-apps\/plugin-opener$/},()=>({path:'opener',namespace:'fixture'}));
  b.onResolve({filter:/^@\/lib\/notifications$/},()=>({path:'notifications',namespace:'fixture'}));
  b.onResolve({filter:/^(?:lucide-react|@\/components\/)/},()=>({path:'ui',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='invoke'?'export const invoke=(...args)=>globalThis.directoryLinkInvoke(...args);':a.path==='opener'?'export const openUrl=async()=>{};':a.path==='notifications'?"import {useState} from 'react';export function useFeedbackError(){return useState('');}":`import {createElement} from 'react';const view=name=>({children,...props})=>createElement('fixture',{...props,component:name},children);export const ${names.map(name=>`${name}=view('${name}')`).join(',')};`}));
  b.onResolve({filter:/^@\//},a=>{const base=resolve(root,'src',a.path.slice(2));return {path:['.ts','.tsx'].map(ext=>base+ext).find(existsSync)};});
 }}]});
 const {useLocalDirectories,DirectoryLink,PiPackageDetail,CodexPluginPage}=await import(pathToFileURL(outfile));
 let renderer,observed,calls=[];
 const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
 const render=async(component,props)=>{await act(async()=>{renderer=create(React.createElement(component,props));await tick();});await act(tick);};
 const update=async(component,props)=>{await act(async()=>{renderer.update(React.createElement(component,props));await tick();});await act(tick);};
 const close=async()=>{await act(async()=>renderer.unmount());renderer=null;};
 const links=()=>renderer.root.findAllByType('button').filter(node=>/^(打开目录|Open folder) /.test(node.props['aria-label']??''));
 function Probe({paths}){observed=useLocalDirectories(paths);return null;}
 const details={description:'Fixture',capabilities:[],category:null,examples:[],skills:[],website:null};
 const pkg={id:'fixture',name:'Fixture',source:'/home/custom/single.ts',scope:'user',kind:'local',path:'/home/custom/single.ts',description:'',version:null,inherited:false,delta:false,canRemove:false,canUpdate:false,resources:[]};
 const piProps={pkg,skills:[],states:[],project:false,home:'/home',zh:true,disabled:false,trusted:true,onBack:()=>{},onRestore:()=>{},onCheck:()=>{},onRemove:()=>{},onSkill:()=>{},onToggle:()=>{},onOpenDirectory:()=>{}};
 const plugin={id:'fixture@market',name:'Fixture',marketplace:'market',version:'1',installed:true,installationKnown:true,enabled:true,components:[],skills:[],sourcePath:'/home/market/source',installedPath:'/home/cache/installed',canInstall:false,canToggle:false,canUninstall:false,canCheckUpdates:false,unavailableReason:null};
 const codexProps={plugin,check:undefined,snapshot:null,home:'/home',zh:true,disabled:false,onBack:()=>{},onAction:()=>{},onCheck:()=>{},onSkill:()=>{},onToggle:()=>{},onOpenDirectory:()=>{}};
 try{
  await t.test('equivalent inline path arrays deduplicate reads and changed, empty or failed paths cannot show a late observation',async()=>{
   calls=[];const pending=[];
   globalThis.directoryLinkInvoke=(command,args)=>{assert.equal(command,'upstream_local_directories');calls.push(args.paths);return new Promise((resolve,reject)=>pending.push({resolve,reject}));};
   await render(Probe,{paths:[null,'/home/one','/home/one',undefined]});assert.deepEqual(calls,[['/home/one']]);assert.deepEqual(observed,[]);
   await update(Probe,{paths:['/home/one']});assert.equal(calls.length,1);
   await update(Probe,{paths:['/home/two']});assert.equal(calls.length,2);assert.deepEqual(observed,[]);
   await act(async()=>{pending[0].resolve([{path:'/home/one',directory:'/home/one'}]);await tick();});assert.deepEqual(observed,[]);
   await act(async()=>{pending[1].resolve([{path:'/home/two',directory:'/home/two'}]);await tick();});assert.deepEqual(observed,[{path:'/home/two',directory:'/home/two'}]);
   await update(Probe,{paths:[]});assert.deepEqual(observed,[]);assert.equal(calls.length,2);
   await update(Probe,{paths:['/home/failed']});await act(async()=>{pending[2].reject(Error('Fixture metadata unavailable'));await tick();});assert.deepEqual(observed,[]);await close();
  });
  await t.test('DirectoryLink abbreviates display HOME while execution uses the exact parent directory',async()=>{
   const opened=[];await render(DirectoryLink,{path:'/home/custom/single.ts',directory:'/home/custom',home:'/home',zh:true,onOpen:path=>opened.push(path)});
   assert.equal(links()[0].props['aria-label'],'打开目录 /home/custom');assert(links()[0].findAllByType('span').some(node=>node.children.includes('~/custom/single.ts')));await act(async()=>links()[0].props.onClick());assert.deepEqual(opened,['/home/custom']);
   await update(DirectoryLink,{path:'/home/custom',home:'/home',zh:false,disabled:true,onOpen:path=>opened.push(path)});assert.equal(links()[0].props['aria-label'],'Open folder /home/custom');assert.equal(links()[0].props.disabled,true);await close();
  });
  await t.test('Pi single-file detail shows its file location and opens the confirmed parent; missing, relative and URI locations add no link or notice',async()=>{
   calls=[];const opened=[];
   globalThis.directoryLinkInvoke=async(command,args)=>{assert.equal(command,'upstream_local_directories');calls.push(args.paths);return args.paths.includes(pkg.path)?[{path:pkg.path,directory:'/home/custom'}]:[];};
   await render(PiPackageDetail,{...piProps,onOpenDirectory:path=>opened.push(path)});assert.equal(links().length,1);assert(links()[0].findAllByType('span').some(node=>node.children.includes('~/custom/single.ts')));await act(async()=>links()[0].props.onClick());assert.deepEqual(opened,['/home/custom']);
   await update(PiPackageDetail,{...piProps,zh:false});assert.equal(calls.length,1,'locale-only rerenders do not repeat metadata');
   for(const path of ['/missing/plugin.ts','relative/plugin.ts','npm:plugin','https://example.com/plugin','']){await update(PiPackageDetail,{...piProps,pkg:{...pkg,path}});assert.equal(links().length,0);assert(!renderer.root.findAllByType('dt').some(node=>node.children.includes('位置')||node.children.includes('Location')));}
   await close();
  });
  await t.test('Codex detail chooses the installed location and an uninstalled local source, with no fabricated link for remote plugins',async()=>{
   calls=[];const opened=[];
   globalThis.directoryLinkInvoke=async(command,args)=>{calls.push({command,args});if(command==='upstream_codex_plugin_details')return details;assert.equal(command,'upstream_local_directories');return args.paths.filter(path=>[plugin.installedPath,plugin.sourcePath].includes(path)).map(path=>({path,directory:path}));};
   await render(CodexPluginPage,{...codexProps,onOpenDirectory:path=>opened.push(path)});assert.equal(links().length,1);await act(async()=>links()[0].props.onClick());assert.deepEqual(opened,[plugin.installedPath]);
   await update(CodexPluginPage,{...codexProps,zh:false});assert.equal(calls.filter(call=>call.command==='upstream_local_directories').length,1);
   await update(CodexPluginPage,{...codexProps,plugin:{...plugin,installed:false,installedPath:null}});assert.equal(links().length,1);assert.equal(links()[0].props['aria-label'],`打开目录 ${plugin.sourcePath}`);
   await update(CodexPluginPage,{...codexProps,plugin:{...plugin,installed:false,installedPath:null,sourcePath:'https://example.com/plugin'}});assert.equal(links().length,0);await close();
  });
 }finally{if(renderer)await act(async()=>renderer.unmount());delete globalThis.directoryLinkInvoke;await rm(work,{recursive:true,force:true});}
});
