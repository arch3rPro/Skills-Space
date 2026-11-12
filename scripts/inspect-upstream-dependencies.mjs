// Original read-only discovery, conflict resolution and dry-run cleanup contracts.
import {readFile,readdir,realpath,stat,lstat,readlink,glob} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {basename,dirname,isAbsolute,join,normalize,posix,relative,resolve,sep} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import { readProjectLock, readUpstream } from './upstream-readonly.mjs';
import {parse} from './skills/node_modules/yaml/dist/index.js';
const upstream = await readUpstream();
const { block, cli, diagnostics, isDiagnostic } = upstream;
const cwd=resolve(process.argv[2]);const options=JSON.parse(process.argv[3]??'{}');
let bytes=0,entries=0,exceeded=false,rejected=false;const observed=new Map();
function limit(){exceeded=true;throw new Error('Dependency discovery exceeds limits.');}
async function boundedRead(file,encoding){
 if((await stat(file)).size>1024*1024)limit();const data=await readFile(file);if((bytes+=data.length)>8*1024*1024)limit();
 if(basename(file)==='package.json'){
  try {const pkg=JSON.parse(data.toString('utf8'));if(!pkg||typeof pkg!=='object'||Array.isArray(pkg))throw new Error();
   for(const field of ['dependencies','devDependencies','optionalDependencies','peerDependencies'])if(pkg[field]!==undefined&&(!pkg[field]||typeof pkg[field]!=='object'||Array.isArray(pkg[field])))throw new Error();
   if(Array.isArray(pkg.skills))for(const entry of pkg.skills){let source=typeof entry==='string'?entry:entry?.source;if(typeof source!=='string')continue;while(source.startsWith('github:')||source.startsWith('gitlab:'))source=source.slice(source.indexOf(':')+1);let url;try{url=new URL(source);}catch{continue;}if(['http:','https:'].includes(url.protocol)&&(url.username||url.password||url.search))throw new Error();}
  }catch{rejected=true;throw new Error('Invalid package manifest or unsupported credential-bearing/query source.');}
 }
 observed.set(resolve(file),data);return encoding?data.toString(encoding):data;
}
async function boundedDirs(...args){const list=await readdir(...args);if((entries+=list.length)>5000)limit();return list;}
async function* boundedGlob(patterns,opts){for await(const file of glob(patterns,opts)){if(++entries>5000||relative(cwd,resolve(cwd,file)).startsWith('..'))limit();yield file;}}
const definitions=JSON.parse(await readFile(new URL('./agents.json',import.meta.url),'utf8'));
const agents=Object.fromEntries(definitions.map(a=>[a.id,{...a,skillsDir:a.projectPath}]));let contract;
const functions = upstream.source() + upstream.metadata() + upstream.discovery()
  + block('const NPM_PREFIX =', 'async function promptForAgentChoice(', cli)
  + block('function isFromRequest(', 'async function runSync(', cli)
  + block('function getLockSource(', 'function getProjectLockSourceUrl(')
  + block('function getProjectLockSource(parsed)', 'function projectLockEntry(');
contract=runInNewContext(functions+'\n({discoverNodeModuleSkills,discoverSkills,matchesSkill,sanitizeName,resolveConflicts,pruneStaleSkills,foreignDestination,isFromRequest,isRemoteInstalled,getProjectLockSource,readLocalLock,filterRemoteRequests,remoteAllowsSkill,requestsLockedSkill,blockedReason,parseSkillMd})',{
 URL,basename,dirname,isAbsolute,join,normalize,posix,relative,resolve,sep,homedir,createHash,parse,agents,diagnostics,isDiagnostic,
 readLocalLock:directory=>readProjectLock(directory,boundedRead,diagnostics),warn(){},
 readFile:boundedRead,readdir:boundedDirs,realpath,stat,lstat,readlink,existsSync,glob:boundedGlob,
 getCanonicalSkillsDir:()=>join(cwd,'.agents/skills'),getCanonicalPath:name=>join(cwd,'.agents/skills',contract.sanitizeName(name)),getInstallPath:(name,id)=>join(cwd,agents[id].projectPath,contract.sanitizeName(name)),
 process:{env:{GH_HOST:process.env.GH_HOST},cwd:()=>cwd},console:{warn(){}},
},{timeout:1000});
let result;
if(options.source){result={skills:await contract.discoverSkills(cwd,options.subpath,{includeInternal:!!options.includeInternal})};if(options.declarers)result.skills=result.skills.filter(skill=>contract.remoteAllowsSkill({declarers:options.declarers},contract.sanitizeName(skill.name),options));}
else {
 result=await contract.discoverNodeModuleSkills(cwd,!!options.recursive);
 if(result.errors.length||result.warnings.length)throw new Error([...result.errors,...result.warnings].map(d=>d.message??String(d)).join('\n'));
 result.skills=result.skills.filter(s=>(!options.include?.length||contract.matchesSkill(s,options.include))&&!(options.exclude?.length&&contract.matchesSkill(s,options.exclude)));
 const lock=await contract.readLocalLock(cwd);const selected=options.agents??[];
 if(selected.length){const conflicts=await contract.resolveConflicts(result.skills,selected,lock.skills,cwd);if(conflicts.skipped.length)throw new Error(conflicts.skipped.map(s=>`${s.skill.name}: ${s.reason}`).join('\n'));result.skills=conflicts.install;}
 const remote=contract.filterRemoteRequests(result.remote,options);
 const pendingRemote=options.remote?remote.filter(r=>!contract.isRemoteInstalled(r,lock,cwd)):[];
 result.remote=pendingRemote.map(r=>({...r,lockSource:contract.getProjectLockSource(r.parsed)}));
 result.cached=[];
 if(options.remote){
  const shipped=new Set(result.skills.map(s=>contract.sanitizeName(s.name)));
  for(const [name,entry] of Object.entries(lock.skills)){
   if(shipped.has(contract.sanitizeName(name))||!remote.some(r=>!pendingRemote.includes(r)&&contract.requestsLockedSkill(r,name,entry)&&contract.remoteAllowsSkill(r,name,options)))continue;
   const path=join(cwd,'.agents/skills',contract.sanitizeName(name));
   const skill=await contract.parseSkillMd(join(path,'SKILL.md'));if(!skill)continue;
   const missing=selected.filter(id=>!existsSync(join(cwd,agents[id].projectPath,contract.sanitizeName(skill.name))));
   if((!selected.length||missing.length)&&!await contract.blockedReason(skill.name,missing,entry,cwd))result.cached.push({name:skill.name,path,agents:missing});
  }
 }
 result.stale=[];
 if(options.cleanup){
  const names=await contract.pruneStaleSkills(cwd,new Set(result.skills.map(s=>contract.sanitizeName(s.name))),(e,name)=>!options.remote||remote.some(r=>contract.requestsLockedSkill(r,name,e)&&contract.remoteAllowsSkill(r,name,options)),lock,true);
  for(const name of names){const key=Object.keys(lock.skills).find(k=>contract.sanitizeName(k)===name);const canonical=join(cwd,'.agents/skills',name);const paths=new Set([canonical,...definitions.map(a=>join(cwd,a.projectPath,name))]);const remove=[],retain=[];for(const path of paths){if(!await lstat(path).catch(()=>null))continue;(await contract.foreignDestination(path,canonical,key?lock.skills[key]:undefined,cwd)?retain:remove).push(path);}result.stale.push({name,key:key??null,remove,retain});}
 }
}
if(rejected)throw new Error('Invalid package manifest or unsupported credential-bearing/query source.');
if(exceeded||result.skills.length>200||result.remote?.length>100||result.stale?.length>200)throw new Error('Dependency discovery exceeds limits.');
const digest=createHash('sha256');for(const [file,data]of [...observed].sort((a,b)=>a[0].localeCompare(b[0])))digest.update(file).update('\0').update(data).update('\0');result.fingerprint=digest.digest('hex');
console.log(JSON.stringify(result));
