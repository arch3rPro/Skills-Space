// Prepare a YAML edit for Rust's locked, revision-checked atomic write. No filesystem mutation here.
import {readFileSync,lstatSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {isAlias,isMap} from './skills/node_modules/yaml/dist/index.js';
import {hermesConfig,inspectHermes} from './inspect-hermes-config.mjs';
try{
 const[home,hermesHome,project]=process.argv.slice(2),change=JSON.parse(process.argv[5]??readFileSync(0,'utf8'));
 const c=hermesConfig(home,hermesHome);
 if(c.revision!==change.revision)throw Error('Hermes settings changed. Reload before saving.');
 if(existsSync(c.path)&&(lstatSync(c.path).isSymbolicLink()||lstatSync(c.path).nlink!==1))throw Error('Hermes settings must be an independent regular file.');
 const block=c.doc.get('skills',true);if(isAlias(block)||block&&!isMap(block)||isMap(block)&&block.items.some(x=>String(x.key)==='<<'))throw Error('Edit aliased Hermes settings directly.');
 const list=v=>{if(!Array.isArray(v)||v.length>2000||!v.every(x=>typeof x==='string'&&x.trim()&&x.length<=4096&&!/[\x00-\x1f]/.test(x)))throw Error('Invalid Hermes skill settings list.');return[...new Set(v.map(x=>x.trim()))];};
 const set=(k,v)=>c.doc.setIn(['skills',k],v);
 if(change.kind==='settings'){
  if(typeof change.projectDiscovery!=='boolean'||typeof change.createDir!=='string'||change.createDir.length>4096||/[\x00-\x1f]/.test(change.createDir))throw Error('Invalid Hermes skill settings.');
  const trusted=list(change.trustedProjects);
  for(const p of trusted){const expanded=c.expand(p);if(!c.trustedProjects.some(old=>resolve(old)===expanded)&&(!existsSync(join(expanded,'.git'))||expanded===resolve(home)))throw Error('Trust a Git project root, not an arbitrary folder.');}
  set('external_dirs',list(change.externalDirs));set('create_dir',change.createDir.trim());set('project_discovery',change.projectDiscovery);set('trusted_project_dirs',trusted.map(c.expand));set('auto_load',list(change.autoLoad));
 }else if(['toggle','preload','batch'].includes(change.kind)){
  const snapshot=inspectHermes(home,hermesHome,project||null);
  const changes=change.kind==='batch'?change.changes:[change];
  if(!Array.isArray(changes)||!changes.length||changes.length>2000)throw Error('Invalid Hermes skill settings list.');
  const prepared=changes.map(item=>{
   if(!item||!['toggle','preload'].includes(item.kind))throw Error('Unsupported Hermes settings operation.');
   const row=snapshot.skills.find(x=>x.file===item.file&&x.inScope);
   if(!row||item.documentRevision!==row.documentRevision||typeof item.enabled!=='boolean'||!(item.kind==='toggle'?row.canToggle:row.canPreload))throw Error('Hermes skill changed or is not editable. Refresh the list.');
   if(item.kind==='toggle'&&row.name==='hermes-agent')throw Error('This Hermes skill cannot be disabled.');
   return {item,row};
  });
  let disabled=[...c.disabled],autoLoad=[...c.autoLoad];
  for(const {item,row} of prepared){
   const key=row.loadName;
   if(item.kind==='toggle'){disabled=disabled.filter(x=>x!==row.name&&x!==key);if(!item.enabled)disabled.push(key);}
   else{autoLoad=autoLoad.filter(x=>x!==row.name&&x!==key);if(item.enabled)autoLoad.push(key);}
  }
  if(prepared.some(({item})=>item.kind==='toggle'))set('disabled',[...new Set(disabled)]);
  if(prepared.some(({item})=>item.kind==='preload'))set('auto_load',[...new Set(autoLoad)]);
 }else throw Error('Unsupported Hermes settings operation.');
 const content=c.doc.toString();if(Buffer.byteLength(content)>1048576)throw Error('Hermes settings exceed the size limit.');
 process.stdout.write(JSON.stringify({path:c.path,content}));
}catch(e){process.stderr.write(e.message?.startsWith('Hermes')||e.message?.startsWith('This Hermes')||e.message?.startsWith('Trust ')||e.message?.startsWith('Edit aliased')?e.message:'Cannot prepare Hermes settings. Check the configuration.');process.exitCode=1;}
