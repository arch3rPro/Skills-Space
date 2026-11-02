// Pure transformations only. Rust owns permission checks, locks, atomic writes and Trash.
import { readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { configurationState, writableFields, directoryFields, validateSettings, configLocations, restoreExpressions, entries, sameEntry, valueAt, expression, providerConfig, setProviderConfig } from './dsh-configuration.mjs';
import { fileURLToPath } from 'node:url';
import { preparePolicy, prepareSetup } from './dsh-policy.mjs';
import { inspectDsh, metadata, fingerprint, yamlDocument, text } from './inspect-dsh-skills.mjs';
export function prepareInvocation(before,modelInvocable,userInvocable) {
  if(typeof modelInvocable!=='boolean'||typeof userInvocable!=='boolean')throw Error('Invalid invocation policy');
  if(Buffer.byteLength(before)>256*1024)throw Error('DSH skill exceeds editing limits');
  metadata(before);
  const match=/^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/.exec(before);
  const document=yamlDocument(match[2],false),edits=[],extra=[];
  const newline=match[1].includes('\r')?'\r\n':'\n';
  for(const [key,value]of [['disable-model-invocation',!modelInvocable],['user-invocable',userInvocable]]){
    const pair=document.contents.items.find(pair=>pair.key?.value===key);
    if(pair){if(!pair.value?.range||pair.value.anchor||typeof pair.value.value==='object')throw Error('Unsupported invocation field');edits.push({start:pair.value.range[0],end:pair.value.range[1],value:String(value)});}
    else extra.push(`${key}: ${value}`);
  }
  let header=match[2];for(const edit of edits.sort((a,b)=>b.start-a.start))header=header.slice(0,edit.start)+edit.value+header.slice(edit.end);
  if(extra.length)header+=newline+extra.join(newline);
  const after=match[1]+header+match[3]+before.slice(match[0].length),checked=metadata(after);
  if(checked.modelInvocable!==modelInvocable||checked.userInvocable!==userInvocable)throw Error('Invocation verification failed');
  return {before,after,revision:fingerprint(before)};
}
export async function prepareConfiguration(home,dshHome,project,request,options={}) {
  const snapshot=await inspectDsh(home,dshHome,project,{...options,contextKey:request.key});
  const row=snapshot.configurations.find(row=>row.key===request.key);
  const state=snapshot[configurationState]?.contexts.get(request.key);
  if(!row?.editable||!state||snapshot.revision!==request.revision)throw Error('DSH configuration is read-only or changed. Read it again.');
  if(request.settings!=null){if(typeof request.settings!=='object'||Array.isArray(request.settings)||Object.keys(request.settings).some(key=>!writableFields.includes(key)))throw Error('Invalid DSH settings field');request={...request,...request.settings};}
  const reset=request.reset===true, restorePreset=request.restorePreset===true;
  const directoryOnly=request.directoryOnly===true;
  const fields=directoryOnly?directoryFields:writableFields;
  if(directoryOnly&&restorePreset)throw Error('Directory settings cannot remove a complete preset override');
  if((reset||restorePreset)&&!row.canRestore)throw Error('No Profile configuration override to restore');
  if(restorePreset&&!state.owner)throw Error('This is not a preset');
  if(state.owner&&!row.hasOverride&&!request.confirmMaterialize)throw Error('Confirm the complete preset override before saving');
  const next=structuredClone(state.config);
  if(reset&&(state.owner||directoryOnly)){
    for(const key of fields){if(Object.hasOwn(state.inheritedConfig,key))next[key]=structuredClone(state.inheritedConfig[key]);else delete next[key];}
  }else if(!reset&&!restorePreset){
    for(const key of fields)if(Object.hasOwn(request,key)&&!row.unresolvedFields.includes(key)&&!row.readOnlyFields.includes(key)){
      const value=request[key];if(value===null&&['dshHome','agentsHome'].includes(key))delete next[key];else next[key]=value;
    }
    if(!validateSettings(Object.fromEntries(Object.entries(next).filter(([key,value])=>(!directoryOnly||directoryFields.includes(key))&&!expression(value)))))throw Error('Invalid DSH skill settings');
    for(const key of ['customSkillDirs','dshHome','agentsHome'])for(const value of Array.isArray(next[key])?next[key]:typeof next[key]==='string'?[next[key]]:[]){if(typeof value==='string'&&!isAbsolute(value)&&value!=='~'&&!value.startsWith('~/'))throw Error('Use an absolute skill directory');}
  }
  const doc=yamlDocument(state.raw??'[]\n');doc.contents.flow=false;
  const locations=configLocations(state.patches,state.targetId,state.targetName);
  const remove=restorePreset||reset&&!state.owner&&!directoryOnly;
  const targetConfig=state.owner?structuredClone(state.owner.config):state.item.row.name==='@skills-space/dsh-skill-policy'?{...state.item.row.config,filesystem:next}:next;
  if(state.owner&&!remove){
    const parent=entries(state.effective).find(item=>item.row===state.owner);
    const relative=state.item.address.slice(parent.address.length+1);
    const child=valueAt(targetConfig,relative);
    if(!child||child.id!==state.id)throw Error('Preset child changed');
    setProviderConfig(child,next);
  }
  if(remove){for(const at of locations)doc.deleteIn([...at,'config']);}
  else if(locations.length){
    const at=locations.at(-1);
    if(state.owner){
      const parent=entries(state.effective).find(item=>item.row===state.owner);
      const relative=state.item.address.slice(parent.address.length+1);
      // Existing complete parent YAML is edited at its child path, preserving comments.
      for(const key of fields)if(!isDeepStrictEqual(next[key],state.config[key])){
        if(Object.hasOwn(next,key))doc.setIn([...at,'config',...relative,'config',...(state.item.row.name==='@skills-space/dsh-skill-policy'?['filesystem']:[]),key],next[key]);
        else doc.deleteIn([...at,'config',...relative,'config',...(state.item.row.name==='@skills-space/dsh-skill-policy'?['filesystem']:[]),key]);
      }
    }else for(const key of fields)if(!isDeepStrictEqual(next[key],state.config[key])){if(Object.hasOwn(next,key))doc.setIn([...at,'config',...(state.item.row.name==='@skills-space/dsh-skill-policy'?['filesystem']:[]),key],next[key]);else doc.deleteIn([...at,'config',...(state.item.row.name==='@skills-space/dsh-skill-policy'?['filesystem']:[]),key]);}
  }else {
    // YAMLSeq.add keeps raw objects; build the AST before restoring expression tags.
    doc.add(doc.createNode({id:state.targetId,name:state.targetName,config:targetConfig}));
  }
  restoreExpressions(doc);
  let after=doc.toString({lineWidth:0});if(state.raw?.includes('\r\n'))after=after.replace(/\n/g,'\r\n');
  const patches=yamlDocument(after).toJS({maxAliasCount:50});
  const composed=state.api.composeEntries([state.lower,patches,state.homePatches]);
  const expected=remove?state.inheritedConfig:next;
  const found=sameEntry(composed,state.item);
  if(!found||!isDeepStrictEqual(providerConfig(found.row),expected))throw Error('DSH settings are overridden by a higher configuration layer');
  const expectedTree=structuredClone(state.effective);
  const target=sameEntry(expectedTree,{...state.item,row:state.owner??state.item.row,owner:null});
  if(!target)throw Error('Preset owner could not be identified');
  if(remove){const inherited=sameEntry(state.inheritedTree,{...state.item,row:state.owner??state.item.row,owner:null});if(inherited)target.row.config=structuredClone(inherited.row.config??{});else delete target.row.config;}
  else target.row.config=targetConfig;
  if(!isDeepStrictEqual(expectedTree,composed))throw Error('DSH edit would change another configuration entry');
  return {before:state.raw??'',beforeMissing:state.raw===null,after,path:state.path,lockPath:state.manifestPath,expectedComposition:fingerprint(JSON.stringify(composed))};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  try{
    const [mode,home,dshHome,project,payload,options]=process.argv.slice(2),request=JSON.parse(payload);
    const result=mode==='policy'||mode==='policy-setup'?(mode==='policy'?await preparePolicy(await inspectDsh(home,dshHome,project||null,{...(options?JSON.parse(options):{}),contextKey:request.contextKey}),request):await prepareSetup(await inspectDsh(home,dshHome,project||null,{...(options?JSON.parse(options):{}),contextKey:request.contextKey}))):mode==='configuration'?await prepareConfiguration(home,dshHome,project||null,request,options?JSON.parse(options):{}):mode==='invocation'?prepareInvocation(readFileSync(request.file,'utf8'),request.modelInvocable,request.userInvocable):null;
    if(!result)throw Error('Unsupported DSH change');console.log(JSON.stringify(result));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
