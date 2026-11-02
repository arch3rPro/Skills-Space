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
