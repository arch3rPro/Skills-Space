// Read-only projection and pure policy/configuration preparation. Rust owns
// writes/locks; the original DSH CLI owns package installation.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { configurationState, entries, valueAt, configLocations, yamlDocument, restoreExpressions, providerConfig, privateFile } from './dsh-configuration.mjs';
import { pluginName, pluginVersion, digest, identity, readPolicy, preference, effectivePolicy, statusPath } from './dsh-skill-policy/state.mjs';

export async function projectPolicy(snapshot,configuration){
  const path=snapshot.configurationPath,policyFile=join(snapshot.dshHome,'skills-space','skill-policy.json');
  let policy;try{policy=await (configuration.policyRead??=readPolicy(policyFile));}catch(error){for(const skill of snapshot.skills)Object.assign(skill,{sourceModelInvocable:skill.modelInvocable,sourceUserInvocable:skill.userInvocable,modelInvocable:false,userInvocable:false,policyEnabled:false,canSetPolicy:false,policyBlocker:'error'});return {status:'error',issue:error.message,migrationConflicts:error.conflicts??[],problemPath:policyFile,policyFile,revision:null,canInstall:false,canSave:false,providerCount:configuration.configurations.filter(row=>row.path===path).length};}
  const providers=configuration.configurations.filter(row=>row.path===path),selected=providers.filter(row=>snapshot.presets?.find(preset=>preset.key===snapshot.presetKey)?.configurationKeys.includes(row.key)??row.key===snapshot.contextKey);
  let installed=false;
  const anchor=providers[0]?.anchor;
  if(path&&anchor)try{
    const api=await import((await import('node:url')).pathToFileURL(createRequire(anchor).resolve('@deepseek-ai/dsh-app-boot')).href);
    const dir=api.resolveBundleDir('dsh',pluginName,anchor,dirname(path));
    const pkg=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));
    installed=pkg.version===pluginVersion;for(const file of ['index.mjs','state.mjs'])installed=installed&&digest(await readFile(join(dir,file),'utf8'))===digest(await readFile(new URL('./dsh-skill-policy/'+file,import.meta.url),'utf8'));
  }catch{}
  const canInstall=!!path&&providers.length>0&&providers.every(row=>row.editable)&&!!anchor;
  const wrapped=providers.length>0&&providers.every(row=>row.policyWrapped);
  const key=path?await identity(path):null;
  let active=installed&&wrapped&&selected.length>0,issue=null,pendingReason='reload',running=false;
  for(const row of selected){
    if(!row.policyWrapped){active=false;continue;}
    try{const status=JSON.parse(await readFile(statusPath(policyFile,key,row.policyOptions.providerKey),'utf8'));
      let alive=true;try{process.kill(status.pid,0);}catch{alive=false;}
      if(alive&&Date.now()-status.updatedAt<=15000)running=true;
      // This confirms invocation policy, not evaluated directory settings.
      // Cordis resolves !js values before the plugin receives its filesystem
      // config, so its digest cannot be compared with the static declaration.
      if(alive&&Date.now()-status.updatedAt<=15000&&status.version===pluginVersion&&status.token===row.policyOptions.token&&status.revision!==policy.revision)pendingReason='apply';
      if(!alive||Date.now()-status.updatedAt>15000||status.version!==pluginVersion||status.token!==row.policyOptions.token||status.revision!==policy.revision||status.issue){active=false;if(status.issue)issue=status.issue;}
    }catch{active=false;}
  }
  const state={status:!canInstall&&!wrapped?'unavailable':!installed?'not-installed':!wrapped?'needs-setup':issue?'error':active?'active':'pending',issue,problemPath:issue?policyFile:null,pendingReason,running,configuration:path,policyFile,revision:policy.revision,canInstall,canSave:installed&&wrapped,providerCount:providers.length};
  for(const skill of snapshot.skills){
    const source={modelInvocable:skill.sourceModelInvocable??skill.modelInvocable,userInvocable:skill.sourceUserInvocable??skill.userInvocable},rule=preference(policy.rules,skill.file,skill.name),effective=effectivePolicy(source,rule);
    Object.assign(skill,{sourceModelInvocable:source.modelInvocable,sourceUserInvocable:source.userInvocable,...effective,policyEnabled:effective.modelInvocable||effective.userInvocable,policyModelInvocable:rule?.modelInvocable??true,policyUserInvocable:rule?.userInvocable??true,canSetPolicy:state.canSave&&!skill.reason,policyBlocker:state.canSave?null:state.status});
  }
  return state;
}

export async function preparePolicy(snapshot,request){
  if(!snapshot.policy?.canSave||snapshot.policy.revision!==request.revision||snapshot.revision!==request.configurationRevision)throw Error('DSH policy or configuration changed. Refresh before saving.');
  const policy=await readPolicy(snapshot.policy.policyFile);if(policy.revision!==request.revision)throw Error('DSH policy changed after inspection. Refresh before saving.');
  for(const requested of request.files){
    const skill=snapshot.skills.find(skill=>skill.file===requested.file&&!skill.reason);
    if(!skill||skill.canSetPolicy!==true||skill.documentRevision!==requested.revision)throw Error('DSH skill changed. Refresh before saving.');
    const previous=preference(policy.rules,skill.file,skill.name);
    let next={file:skill.file,name:skill.name,disabled:previous?.disabled??false,modelInvocable:previous?.modelInvocable??true,userInvocable:previous?.userInvocable??true};
    const action=request.action;
    if(action==='enable'){next.disabled=false;if(!(skill.sourceModelInvocable&&next.modelInvocable)&&!(skill.sourceUserInvocable&&next.userInvocable)){next.modelInvocable=true;next.userInvocable=true;}}
    else if(action==='disable')next.disabled=true;
    else if(['model-on','model-off','manual-on','manual-off'].includes(action)){
      const model=action.startsWith('model');if(action.endsWith('on')&&!(model?skill.sourceModelInvocable:skill.sourceUserInvocable))throw Error('The skill document forbids this invocation channel.');
      next[model?'modelInvocable':'userInvocable']=action.endsWith('on');
      if(!(skill.sourceModelInvocable&&next.modelInvocable)&&!(skill.sourceUserInvocable&&next.userInvocable)){next.disabled=true;next.modelInvocable=previous?.modelInvocable??true;next.userInvocable=previous?.userInvocable??true;}
    }else if(['both','manual','model','none'].includes(action)){if(action==='both'&&(!skill.sourceModelInvocable||!skill.sourceUserInvocable)||action==='model'&&!skill.sourceModelInvocable||action==='manual'&&!skill.sourceUserInvocable)throw Error('The skill document forbids the requested invocation channel.');next.disabled=action==='none';if(action!=='none'){next.modelInvocable=action!=='manual';next.userInvocable=action!=='model';}}
    else throw Error('Unknown DSH policy action');
    if(action==='enable'&&!skill.sourceModelInvocable&&!skill.sourceUserInvocable)throw Error('The skill document forbids both invocation channels.');
    policy.rules=policy.rules.filter(rule=>!(rule.file===skill.file&&rule.name===skill.name));
    policy.rules.push(next);
  }
  const path=snapshot.policy.policyFile;
  return {path,before:policy.raw??'',beforeMissing:policy.raw===null,after:JSON.stringify({version:2,rules:policy.rules},null,2)+'\n',lockPath:path};
}

export async function prepareSetup(snapshot){
  const configuration=snapshot[configurationState],path=snapshot.configurationPath;
  const rows=configuration.configurations.filter(row=>row.path===path);
  if(!snapshot.policy.canInstall)throw Error('This DSH configuration cannot be wrapped safely.');
  const state=configuration.contexts.get(rows[0].key),doc=yamlDocument(state.raw??'[]\n');
  const expected=structuredClone(state.effective),token=randomUUID(),targets=new Map();
  for(const row of rows){
    const current=configuration.contexts.get(row.key),item=entries(expected).find(item=>JSON.stringify(item.address)===JSON.stringify(current.item.address));
    if(!item)throw Error('DSH provider changed');
    const options={configuration:await identity(path),policyFile:snapshot.policy.policyFile,runtimeAnchor:row.anchor,providerKey:row.key,token,filesystem:structuredClone(providerConfig(item.row))};
    // A preset config is a complete value in Cordis. Materialize its current
    // effective value once and change only its filesystem entry.
    if(item.owner){item.row.name=pluginName;item.row.config=options;const owner=entries(expected).find(value=>value.row===item.owner);targets.set(owner.row.id,owner.row);}
    else if(item.parents.length){const parent=entries(expected).find(value=>value.row===item.parents[0]);item.row.name=pluginName;item.row.config=options;targets.set(parent.row.id,parent.row);}
    else{const originalName=item.row.name;item.row.group=true;item.row.config=[{id:`${item.row.id}-skills-space-policy`,name:pluginName,config:options}];item.row.name=originalName;targets.set(item.row.id,item.row);}
  }
  for(const target of targets.values()){
    const original=entries(state.effective).find(item=>!item.owner&&item.row.id===target.id)?.row;
    if(!original||!target.id)throw Error('DSH configuration owner is ambiguous');
    const patch={id:target.id,name:original.name,config:target.config,...(target.group?{group:true}:{})};
    doc.add(doc.createNode(patch));
  }
  restoreExpressions(doc);const after=doc.toString({lineWidth:0});
  const composed=state.api.composeEntries([state.lower,yamlDocument(after).toJS({maxAliasCount:50}),state.homePatches]);
  if(!isDeepStrictEqual(composed,expected))throw Error('DSH setup would change another configuration entry');
  return {path,before:state.raw??'',beforeMissing:state.raw===null,after,lockPath:state.manifestPath};
}
