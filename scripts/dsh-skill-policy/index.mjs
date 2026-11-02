import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { isAbsolute, dirname } from 'node:path';
import { watchFile, unwatchFile } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { identity, readPolicy, preference, effectivePolicy, statusPath, digest, pluginVersion } from './state.mjs';
export const name='skills-space-skill-policy';
export const inject=['skills'];
export async function apply(ctx,config){
  if(!config||!['policyFile','configuration','runtimeAnchor'].every(key=>typeof config[key]==='string'&&isAbsolute(config[key])))throw Error('Policy, configuration and original runtime paths must be absolute');
  const {FileSystemSkillProvider}=await import(pathToFileURL(createRequire(config.runtimeAnchor).resolve('@deepseek-ai/dsh-skill-filesystem')).href);
  const configuration=await identity(config.configuration),file=statusPath(config.policyFile,configuration,config.providerKey??'filesystem');
  let original,stopWatching,stopped=false,publishing=Promise.resolve();
  function publish(revision,issue=null){
    publishing=publishing.then(async()=>{if(stopped)return;await mkdir(dirname(file),{recursive:true});const value={pid:process.pid,updatedAt:Date.now(),configuration,version:pluginVersion,revision,issue,token:config.token??null,filesystem:digest(JSON.stringify(config.filesystem??{}))};const temp=`${file}.${process.pid}.tmp`;await writeFile(temp,JSON.stringify(value));await rename(temp,file);}).catch(error=>ctx.logger.warn(`Skill policy status: ${error.message}`));return publishing;
  }
  async function policyFor(options){
    try{const policy=await readPolicy(config.policyFile);await publish(policy.revision);return async skill=>effectivePolicy(skill.invocation,preference(policy.rules,await identity(skill.path),skill.name));}
    catch(error){ctx.logger.warn(`DSH skill policy: ${error.message}`);await publish(null,error.message);return async()=>({modelInvocable:false,userInvocable:false});}
  }
  ctx.skills.registerProvider(control=>{
    original=new FileSystemSkillProvider(ctx,control,config.filesystem??{});
    async function changed(){control.invalidate();await policyFor({});ctx.emit('commands/change');for(const session of ctx.get('sessions')?.list?.()??[]){const preset=session.header?.agentPreset;if(preset)ctx.emit('agent-preset/selected',session.id??session.header?.id,preset);}}
    const onChange=()=>{void changed().catch(error=>ctx.logger.warn(error.message));};
    watchFile(config.policyFile,{persistent:false,interval:200},onChange);
    const timer=setInterval(()=>{void policyFor({}).catch(error=>ctx.logger.warn(error.message));},5000);timer.unref();
    stopWatching=()=>{unwatchFile(config.policyFile,onChange);clearInterval(timer);};
    return {
      name:original.name,
      async list(options){const observed=await original.list(options),policy=await policyFor(options),candidates=Array.isArray(observed)?observed:observed.candidates;const restricted=await Promise.all(candidates.map(async skill=>({...skill,invocation:await policy(skill)})));return Array.isArray(observed)?restricted:{...observed,candidates:restricted};},
      async get(candidate,options){const skill=await original.get(candidate,options);if(!skill)return undefined;const policy=await policyFor(options);return {...skill,invocation:await policy(skill)};},
    };
  });
  ctx.effect(function*(){yield async()=>{stopped=true;stopWatching();await original.dispose();await publishing;};},'skills-space skill policy');
  ctx.on('fs/observed',(target,_observation,actor)=>{if(actor&&['write','edit'].includes(actor.name))original.observeHostMutation(target.displayPath);});
  await policyFor({});
}
export default {name,inject,apply};
