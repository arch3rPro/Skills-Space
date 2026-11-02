import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const modules=process.env.SKILLS_SPACE_REACT_TEST_MODULES;

test('Node download feedback follows language changes without re-subscribing or restarting work',{skip:!modules},async()=>{
 const work=await mkdtemp(join(tmpdir(),'skills-space-node-feedback-'));
 const require=createRequire(import.meta.resolve('vite')),{build}=require('esbuild');
 const reactPath=resolve(modules,'react/index.js'),React=await import(reactPath),{create,act}=await import(resolve(modules,'react-test-renderer/index.js'));
 const calls=[],loading=[],dismissed=[];let listener,stops=0,renderer;
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 globalThis.nodeFeedbackFixture={listen:(name,callback)=>{calls.push(name);listener=callback;return Promise.resolve(()=>{stops++;});},loading:(...args)=>loading.push(args),dismiss:id=>dismissed.push(id)};
 try {
  const outfile=join(work,'subject.mjs');
  await build({entryPoints:[resolve('src/hooks/use-node-runtime-download.ts')],bundle:true,format:'esm',platform:'node',outfile,plugins:[{name:'node-feedback',setup(b){
   b.onResolve({filter:/^react$/},()=>({path:reactPath,external:true}));
   b.onResolve({filter:/^(?:@tauri-apps\/api\/event|sonner)$/},a=>({path:a.path,namespace:'fixture'}));
   b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='sonner'?'export const toast={loading:(...args)=>globalThis.nodeFeedbackFixture.loading(...args),dismiss:(...args)=>globalThis.nodeFeedbackFixture.dismiss(...args)};':'export const listen=(...args)=>globalThis.nodeFeedbackFixture.listen(...args);'}));
  }}]});
  const {useNodeRuntimeDownload}=await import(pathToFileURL(outfile));
  function Probe({zh}){useNodeRuntimeDownload(zh);return React.createElement('span');}
  await act(async()=>{renderer=create(React.createElement(Probe,{zh:true}));});
  assert.deepEqual(calls,['node-runtime-download']);
  await act(async()=>listener({payload:true}));
  assert.equal(loading.at(-1)[0],'正在下载 Node…');
  await act(async()=>renderer.update(React.createElement(Probe,{zh:false})));
  assert.equal(loading.at(-1)[0],'Downloading Node…');
  assert(loading.every(([,options])=>options.id==='node-runtime-download'));
  assert.equal(calls.length,1,'language does not restart native subscriptions');
  const count=loading.length;
  await act(async()=>renderer.update(React.createElement(Probe,{zh:false})));
  assert.equal(loading.length,count,'unchanged language does not repeat progress');
  await act(async()=>listener({payload:false}));
  assert.equal(dismissed.at(-1),'node-runtime-download');
  await act(async()=>renderer.unmount());renderer=null;
  assert.equal(stops,1);
  listener({payload:true});
  assert.equal(loading.length,count,'late events cannot resurrect a closed notification');
 } finally {
  if(renderer)await act(async()=>renderer.unmount());
  delete globalThis.nodeFeedbackFixture;
  await rm(work,{recursive:true,force:true});
 }
});


test('Node direct actions preserve selection, pending guards and runtime description',{skip:!modules},async()=>{
 const work=await mkdtemp(join(tmpdir(),'skills-space-node-actions-'));
 const require=createRequire(import.meta.resolve('vite')),{build}=require('esbuild');
 const reactPath=resolve(modules,'react/index.js'),React=await import(reactPath),{create,act}=await import(resolve(modules,'react-test-renderer/index.js'));
 const source=await readFile('src/components/node-runtime-settings.tsx','utf8');
 const names=[...new Set([...source.matchAll(/import \{([^}]+)\} from "(?:lucide-react|@\/components\/[^"']+)"/g)].flatMap(match=>match[1].split(',').map(name=>name.trim())))];
 const base={path:'/fixture/home/runtime/bin/node',version:'v25.9.0',source:'system',state:'ready',selectedPath:null,minimumVersion:'22.20.0'};
 const calls=[],notices=[];let renderer,complete,pick=null;
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 globalThis.nodeActionsFixture={invoke:async(command,args)=>{
  calls.push({command,args});
  if(command==='application_node_status')return base;
  if(command==='application_node_detect')return new Promise(resolve=>{complete=resolve;});
  if(command==='application_node_select')return args.path?{...base,path:args.path,source:'custom',selectedPath:args.path}:base;
  throw Error('Unexpected command '+command);
 },open:async()=>pick,notice:message=>notices.push(message)};
 try{
  const outfile=join(work,'subject.mjs');
  await build({entryPoints:[resolve('src/components/node-runtime-settings.tsx')],bundle:true,format:'esm',platform:'node',outfile,jsx:'automatic',banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'node-actions',setup(b){
   b.onResolve({filter:/^\//},a=>a.path===reactPath?{path:a.path,external:true}:undefined);
   b.onResolve({filter:/^react(?:\/.*)?$/},a=>({path:a.path==='react'?reactPath:resolve(modules,a.path+'.js'),external:true}));
   b.onResolve({filter:/^(?:@tauri-apps\/|@\/lib\/notifications)/},a=>({path:a.path,namespace:'native-fixture'}));
   b.onResolve({filter:/^(?:lucide-react|@\/components\/)/},()=>({path:'ui',namespace:'native-fixture'}));
   b.onLoad({filter:/.*/,namespace:'native-fixture'},a=>({contents:a.path.endsWith('/core')?'export const invoke=(...args)=>globalThis.nodeActionsFixture.invoke(...args);':a.path.endsWith('/event')?'export const listen=async()=>()=>{};':a.path.endsWith('plugin-dialog')?'export const open=(...args)=>globalThis.nodeActionsFixture.open(...args);':a.path==='@/lib/notifications'?'export const notifySuccess=message=>globalThis.nodeActionsFixture.notice(message);export const notifyError=message=>globalThis.nodeActionsFixture.notice(message);':`import React from ${JSON.stringify(reactPath)};${names.map(name=>`export const ${name}=({children,...props})=>React.createElement(${JSON.stringify(name==='Button'?'button':name)},props,children);`).join('')}`}));
  }}]});
  const {NodeRuntimeSettings}=await import(pathToFileURL(outfile));
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
  const text=node=>{const read=value=>typeof value==='string'?value:Array.isArray(value)?value.map(read).join(''):value?.props?read(value.props.children):'';return read(node.props.children);};
  const button=label=>renderer.root.findAllByType('button').find(node=>text(node)===label);
  const status=()=>text(renderer.root.findByType('CardDescription'));
  await act(async()=>{renderer=create(React.createElement(NodeRuntimeSettings,{zh:true,disabled:false,home:'/fixture/home'}));await tick();});
  assert.equal(button('恢复自动检测'),undefined,'automatic selection offers no reset');
  assert.equal(status(),'Node · v25.9.0 · ~/runtime/bin/node','runtime description contains Node, version and HOME-abbreviated path');
  assert.equal(text(renderer.root.findByType('CardTitle')),'运行环境');
  assert.equal(renderer.root.findAllByType('HelpPopover').length,0,'runtime policy help is removed');
  await act(async()=>button('重新检测').props.onClick());
  assert.match(status(),/正在设置 Node/,'pending operation remains visible');
  assert.equal(button('选择文件').props.disabled,true);
  const before=calls.length;
  await act(async()=>button('重新检测').props.onClick());
  assert.equal(calls.length,before,'pending guard prevents repeated operations');
  await act(async()=>{complete({...base,path:'/fixture/home/fallback/node',selectedPath:'/fixture/home/custom/node'});await tick();});
  assert.equal(status(),'Node · v25.9.0 · ~/fallback/node','description reports the active runtime path');
  await act(async()=>{button('恢复自动检测').props.onClick();await tick();});
  assert.deepEqual(calls.at(-1),{command:'application_node_select',args:{path:null}},'reset retains the native null-selection command');
  assert.equal(button('恢复自动检测'),undefined);
  const beforeCancel=calls.length;
  await act(async()=>{button('选择文件').props.onClick();await tick();});
  assert.equal(calls.length,beforeCancel,'cancelled picker changes no selection');
  pick='/fixture/home/chosen/node';
  await act(async()=>{button('选择文件').props.onClick();await tick();});
  assert.deepEqual(calls.at(-1),{command:'application_node_select',args:{path:pick}});
  assert(button('恢复自动检测'),'explicit selection exposes reset');
  await act(async()=>renderer.update(React.createElement(NodeRuntimeSettings,{zh:true,disabled:true,home:'/fixture/home'})));
  const beforeDisabled=calls.length;
  await act(async()=>button('恢复自动检测').props.onClick());
  assert.equal(calls.length,beforeDisabled,'disabled parent blocks mutation');
 }finally{
  if(renderer)await act(async()=>renderer.unmount());
  delete globalThis.nodeActionsFixture;
  await rm(work,{recursive:true,force:true});
 }
});
