// Read-only projection and pure policy/configuration preparation. Rust owns
// writes/locks; the original DSH CLI owns package installation.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { configurationState, entries, valueAt, configLocations, yamlDocument, restoreExpressions, providerConfig, privateFile } from './dsh-configuration.mjs';
import { pluginName, pluginVersion, digest, identity, readPolicy, preference, effectivePolicy, statusPath, changePolicyRule } from './dsh-skill-policy/state.mjs';

function processExists(pid){
  if(!Number.isInteger(pid)||pid<1)return false;
  try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}
}

export async function projectPolicy(snapshot,configuration){
  const path=snapshot.configurationPath,policyFile=join(snapshot.dshHome,'skills-space','skill-policy.json');
  let policy;try{policy=await (configuration.policyRead??=readPolicy(policyFile));}catch(error){for(const skill of snapshot.skills)Object.assign(skill,{sourceModelInvocable:skill.modelInvocable,sourceUserInvocable:skill.userInvocable,modelInvocable:false,userInvocable:false,policyEnabled:false,canSetPolicy:false,policyBlocker:'error'});return {status:'error',issue:error.message,migrationConflicts:error.conflicts??[],problemPath:policyFile,policyFile,revision:null,canInstall:false,canSave:false,providerCount:configuration.configurations.filter(row=>row.path===path).length};}
  const providers=configuration.configurations.filter(row=>row.path===path),selected=providers.filter(row=>snapshot.presets?.find(preset=>preset.key===snapshot.presetKey)?.configurationKeys.includes(row.key)??row.key===snapshot.contextKey);
  let installed=false,companionInstalled=false,companionActive=false,companionRunning=false,companionIssue=null,companionPendingReason='reload';
  const anchor=providers[0]?.anchor;
  let api;
  if(path&&anchor)try{
    api=await import((await import('node:url')).pathToFileURL(createRequire(anchor).resolve('@deepseek-ai/dsh-app-boot')).href);
    const dir=api.resolveBundleDir('dsh',pluginName,anchor,dirname(path));
    const pkg=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));
    installed=pkg.version===pluginVersion;for(const file of ['index.mjs','state.mjs'])installed=installed&&digest(await readFile(join(dir,file),'utf8'))===digest(await readFile(new URL('./dsh-skill-policy/'+file,import.meta.url),'utf8'));
  }catch{}
  const canInstall=!!path&&providers.length>0&&providers.every(row=>row.editable)&&!!anchor;
  const wrapped=providers.length>0&&providers.every(row=>row.policyWrapped);
  const key=path?await identity(path):null;
  if(api&&path)try{
    const dir=api.resolveBundleDir('dsh','dsh-skills-space',anchor,dirname(path));
    const pkg=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));
    if(pkg.name==='dsh-skills-space'&&typeof pkg.version==='string'){
      companionInstalled=true;
      const source=await readFile(join(dir,'policy.mjs'),'utf8');
      const status=JSON.parse(await readFile(statusPath(policyFile,key,'dsh-skills-space'),'utf8'));
      companionIssue=typeof status.issue==='string'&&status.issue?status.issue:null;
      companionRunning=processExists(status.pid)&&Date.now()-status.updatedAt<=15000;
      companionPendingReason=companionRunning&&status.revision!==policy.revision?'apply':'reload';
      companionActive=companionRunning&&status.configuration===key&&status.version===pkg.version
        &&status.policyDigest===digest(source)&&status.revision===policy.revision&&!companionIssue;
    }
  }catch{}
  let active=installed&&wrapped&&selected.length>0,issue=null,pendingReason='reload',running=false;
  for(const row of selected){
    if(!row.policyWrapped){active=false;continue;}
    try{const status=JSON.parse(await readFile(statusPath(policyFile,key,row.policyOptions.providerKey),'utf8'));
      const alive=processExists(status.pid);
      if(alive&&Date.now()-status.updatedAt<=15000)running=true;
      // This confirms invocation policy, not evaluated directory settings.
      // Cordis resolves !js values before the plugin receives its filesystem
      // config, so its digest cannot be compared with the static declaration.
      if(alive&&Date.now()-status.updatedAt<=15000&&status.version===pluginVersion&&status.token===row.policyOptions.token&&status.revision!==policy.revision)pendingReason='apply';
      if(!alive||Date.now()-status.updatedAt>15000||status.version!==pluginVersion||status.token!==row.policyOptions.token||status.revision!==policy.revision||status.issue){active=false;if(status.issue)issue=status.issue;}
    }catch{active=false;}
  }
  const effectiveIssue=companionInstalled?companionIssue:issue;
  const state={status:companionInstalled?(companionActive?'active':companionIssue?'error':'pending'):!canInstall&&!wrapped?'unavailable':!installed?'not-installed':!wrapped?'needs-setup':issue?'error':active?'active':'pending',issue:effectiveIssue,problemPath:effectiveIssue?policyFile:null,
    pendingReason:companionInstalled?companionPendingReason:pendingReason,running:companionInstalled?companionRunning:running,
    owner:companionInstalled?'companion':'policy',configuration:path,policyFile,revision:policy.revision,
    canInstall:companionInstalled?false:canInstall,canSave:companionInstalled?companionActive:installed&&wrapped,providerCount:providers.length};
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
    const next=changePolicyRule(skill,previous,request.action);
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
  const expected=structuredClone(state.effective),token=randomUUID(),targets=new Map(),standalone=[];
  for(const row of rows){
    const current=configuration.contexts.get(row.key),item=entries(expected).find(item=>JSON.stringify(item.address)===JSON.stringify(current.item.address));
    if(!item)throw Error('DSH provider changed');
    const options={configuration:await identity(path),policyFile:snapshot.policy.policyFile,runtimeAnchor:row.anchor,providerKey:row.key,token,filesystem:structuredClone(providerConfig(item.row))};
    // A preset config is a complete value in Cordis. Materialize its current
    // effective value once and change only its filesystem entry.
    if(item.owner){item.row.name=pluginName;item.row.config=options;const owner=entries(expected).find(value=>value.row===item.owner);targets.set(owner.row.id,owner.row);}
    else if(item.parents.length){const parent=entries(expected).find(value=>value.row===item.parents[0]);item.row.name=pluginName;item.row.config=options;targets.set(parent.row.id,parent.row);}
    else{
      item.row.disabled=true;
      const wrapper={id:`${item.row.id}-skills-space-policy`,name:pluginName,config:options};
      standalone.push({original:item.row,wrapper});
    }
  }
  for(const target of targets.values()){
    const original=entries(state.effective).find(item=>!item.owner&&item.row.id===target.id)?.row;
    if(!original||!target.id)throw Error('DSH configuration owner is ambiguous');
    const patch={id:target.id,name:target.name,config:target.config,...(target.group?{group:true}:{})};
    doc.add(doc.createNode(patch));
  }
  for(const {original,wrapper} of standalone){
    doc.add(doc.createNode({id:original.id,disabled:true}));
    doc.add(doc.createNode({insert:[wrapper]}));
    expected.push(wrapper);
  }
  restoreExpressions(doc);const after=doc.toString({lineWidth:0});
  const composed=state.api.composeEntries([state.lower,yamlDocument(after).toJS({maxAliasCount:50}),state.homePatches]);
  if(!isDeepStrictEqual(composed,expected))throw Error('DSH setup would change another configuration entry');
  return {path,before:state.raw??'',beforeMissing:state.raw===null,after,lockPath:state.manifestPath};
}

function serialize(doc,raw){
  const yaml=doc.toString({lineWidth:0});
  return raw?.includes('\r\n')?yaml.replace(/\n/g,'\r\n'):yaml;
}

// Patch lists can contain inserts as well as composed Cordis entries.
function* patchEntries(list,prefix=[]){
  for(const [index,row] of list.entries()){
    if(!row||typeof row!=='object')continue;
    const at=[...prefix,index];
    yield {row,at};
    if(Array.isArray(row.insert))yield* patchEntries(row.insert,[...at,'insert']);
    if(Array.isArray(row.config))yield* patchEntries(row.config,[...at,'config']);
    if(Array.isArray(row.config?.plugins))yield* patchEntries(row.config.plugins,[...at,'config','plugins']);
  }
}

const obsoletePresetTool={id:'tool-subagent-list-agents',name:'@deepseek-ai/dsh-tool-subagent-control/list-agents'};

export function presetRepairPlan(state){
  if(!state)return null;
  try{createRequire(state.anchor).resolve(obsoletePresetTool.name);return null;}catch(error){
    if(!['MODULE_NOT_FOUND','ERR_PACKAGE_PATH_NOT_EXPORTED'].includes(error.code))return null;
  }
  const lower=state.api.composeEntries([state.lower]);
  const originals=new Map(entries(lower).filter(({row})=>row.name==='@deepseek-ai/dsh-agent-preset')
    .map(({row})=>[row.id,row.config]));
  function collect(list,affected){
    const changes=[];
    for(const {row,at} of patchEntries(list)){
      if(row.name!=='@deepseek-ai/dsh-agent-preset'||!Array.isArray(row.config?.plugins))continue;
      const preset=row.config.id,original=originals.get(row.id);
      if(!['standard','ptc','cordis'].includes(preset)||original?.id!==preset||
        (affected&&!affected.has(preset))||
        [...patchEntries(original.plugins??[])].some(item=>item.row.name===obsoletePresetTool.name))continue;
      for(const item of patchEntries(row.config.plugins)){
        if(isDeepStrictEqual(item.row,obsoletePresetTool)){
          changes.push({at:[...at,'config','plugins',...item.at],preset});
        }
      }
    }
    return changes;
  }
  const expected=structuredClone(state.effective);
  const effectiveChanges=collect(expected);
  if(!effectiveChanges.length)return null;
  const presets=new Set(effectiveChanges.map(change=>change.preset));
  const changes=collect(state.patches,presets);
  if(!changes.length)return null;
  const doc=state.doc.clone();
  for(const {at} of changes.reverse())doc.deleteIn(at);
  restoreExpressions(doc);
  const after=serialize(doc,state.raw);
  const saved=yamlDocument(after).toJS({maxAliasCount:50});
  const composed=state.api.composeEntries([state.lower,saved,state.homePatches]);
  for(const {at} of effectiveChanges.reverse())valueAt(expected,at.slice(0,-1)).splice(at.at(-1),1);
  if(!isDeepStrictEqual(composed,expected))return null;
  return {path:state.path,before:state.raw,beforeMissing:false,after,lockPath:state.manifestPath,presets:[...presets]};
}

export async function preparePresetRepair(snapshot){
  const state=snapshot[configurationState].profileStates.get(snapshot.configurationPath);
  const plan=state?presetRepairPlan(state):null;
  if(!plan)throw Error('No obsolete DSH preset entry can be safely repaired.');
  return plan;
}
