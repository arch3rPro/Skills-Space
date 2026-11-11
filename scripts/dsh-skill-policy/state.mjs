import { readFile, realpath, access } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
export const pluginName='@skills-space/dsh-skill-policy';
export const pluginVersion='0.2.0';
export const digest=text=>createHash('sha256').update(text).digest('hex');
export async function identity(path){try{return await realpath(path);}catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))return process.platform==='darwin'?resolve(path).replace(/^\/(var|tmp)(?=\/|$)/,'/private/$1'):resolve(path);throw error;}}
export async function projectIdentity(cwd){
  if(!cwd)return null;const start=resolve(cwd);
  for(let current=start;;current=dirname(current)){try{await access(join(current,'.git'));return identity(current);}catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;}if(dirname(current)===current)return identity(start);}
}
export function unifiedRules(data){
  if(![1,2].includes(data?.version)||!Array.isArray(data.rules))throw Error('Invalid DSH skill policy');
  const byFile=new Map(),conflicts=[],conflictKeys=new Set();
  for(const rule of data.rules){
    if(!rule||typeof rule.file!=='string'||!isAbsolute(rule.file)||typeof rule.name!=='string'||typeof rule.disabled!=='boolean'||['modelInvocable','userInvocable'].some(key=>rule[key]!==undefined&&typeof rule[key]!=='boolean'))throw Error('Invalid DSH skill policy');
    if(data.version===1&&(typeof rule.configuration!=='string'||!isAbsolute(rule.configuration)||!(rule.project===null||typeof rule.project==='string'&&isAbsolute(rule.project))))throw Error('Invalid legacy DSH skill policy');
    const next={file:rule.file,name:rule.name,disabled:rule.disabled,modelInvocable:rule.modelInvocable??true,userInvocable:rule.userInvocable??true};
    const key=JSON.stringify([next.file,next.name]),previous=byFile.get(key);
    if(previous&&['disabled','modelInvocable','userInvocable'].some(field=>previous[field]!==next[field])){if(!conflictKeys.has(key)){conflictKeys.add(key);conflicts.push({file:rule.file,name:rule.name});}}
    else byFile.set(key,next);
  }
  if(conflicts.length){const error=Error('Conflicting legacy DSH skill policies');error.conflicts=conflicts;throw error;}
  return [...byFile.values()];
}
export async function readPolicy(path){
  let raw;try{raw=await readFile(path,'utf8');}catch(error){if(error.code==='ENOENT')return {raw:null,revision:digest(''),rules:[],version:2};throw error;}
  const data=JSON.parse(raw);
  if(!Array.isArray(data?.rules))throw Error('Invalid DSH skill policy');
  // Normalize file identities before comparing legacy policies so aliases cannot
  // silently retain different settings for the same physical instruction file.
  const normalized={...data,rules:await Promise.all(data.rules.map(async rule=>({...rule,file:typeof rule?.file==='string'&&isAbsolute(rule.file)?await identity(rule.file):rule?.file})))};
  return {raw,revision:digest(raw),rules:unifiedRules(normalized),version:data.version};
}
export function preference(rules,file,name){return rules.find(rule=>rule.file===file&&rule.name===name)??null;}
export function effectivePolicy(source,rule){return {modelInvocable:!rule?.disabled&&source.modelInvocable&&(rule?.modelInvocable??true),userInvocable:!rule?.disabled&&source.userInvocable&&(rule?.userInvocable??true)};}
export function statusPath(policyFile,configuration,provider){return join(dirname(policyFile),'active',digest(JSON.stringify([configuration,provider]))+'.json');}

// Shared rule transitions for the desktop adapter and companion Host.
export function changePolicyRule(skill, previous, action) {
  const next = { file: skill.file, name: skill.name, disabled: previous?.disabled ?? false,
    modelInvocable: previous?.modelInvocable ?? true, userInvocable: previous?.userInvocable ?? true };
  const available = () => (skill.sourceModelInvocable && next.modelInvocable) || (skill.sourceUserInvocable && next.userInvocable);
  if (action === 'enable') {
    next.disabled = false;
    if (!available()) { next.modelInvocable = true; next.userInvocable = true; }
  } else if (action === 'disable') next.disabled = true;
  else if (['model-on', 'model-off', 'manual-on', 'manual-off'].includes(action)) {
    const model = action.startsWith('model');
    if (action.endsWith('on') && !(model ? skill.sourceModelInvocable : skill.sourceUserInvocable)) throw Error('The skill document forbids this invocation channel.');
    next[model ? 'modelInvocable' : 'userInvocable'] = action.endsWith('on');
    if (!available()) {
      next.disabled = true;
      next.modelInvocable = previous?.modelInvocable ?? true;
      next.userInvocable = previous?.userInvocable ?? true;
    }
  } else if (['both', 'manual', 'model', 'none'].includes(action)) {
    if ((action === 'both' && (!skill.sourceModelInvocable || !skill.sourceUserInvocable)) || (action === 'model' && !skill.sourceModelInvocable) || (action === 'manual' && !skill.sourceUserInvocable)) throw Error('The skill document forbids the requested invocation channel.');
    next.disabled = action === 'none';
    if (action !== 'none') { next.modelInvocable = action !== 'manual'; next.userInvocable = action !== 'model'; }
  } else throw Error('Unknown DSH policy action');
  if (action === 'enable' && !skill.sourceModelInvocable && !skill.sourceUserInvocable) throw Error('The skill document forbids both invocation channels.');
  return next;
}
