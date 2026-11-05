// Versioned application resources. Skill materialization always uses the original skills CLI.
import {readFile,writeFile,mkdir,readdir,lstat,rename,cp,rm,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const bundled=join(fileURLToPath(new URL('.',import.meta.url)),'builtin-skills');
export async function resourcePaths(root,prefix=''){const out=[];for(const entry of await readdir(root,{withFileTypes:true})){if(entry.isSymbolicLink())throw new Error('Skill resources cannot contain symbolic links.');if(entry.isDirectory())out.push(...await resourcePaths(join(root,entry.name),prefix+entry.name+'/'));else if(entry.isFile())out.push(prefix+entry.name);}return out;}
export async function contentHash(root){
  const hash=createHash('sha256');
  async function walk(path,prefix=''){for(const entry of (await readdir(path,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=join(path,entry.name),name=prefix+entry.name;if(entry.isSymbolicLink())throw new Error('Skill resources cannot contain symbolic links.');if(entry.isDirectory())await walk(file,name+'/');else if(entry.isFile()){hash.update(name+'\0');hash.update(await readFile(file));hash.update('\0');}}}
  await walk(root);return hash.digest('hex');
}
async function optional(path,initial){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return initial;throw e;}}
async function atomic(path,value){const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,path);}
function storage(request){return request.builtinHome??join(request.home,'.skills-space','builtin-skills');}
async function definitions(request){return (await optional(join(request.builtins??bundled,'manifest.json'),null)).skills;}
export async function builtinList(request){
  const root=storage(request),lock=await optional(join(root,'lock.json'),{}),rows=[];
  for(const skill of await definitions(request)){
    const current=lock[skill.id]??null;if(current&&!/^[a-z]+-[a-zA-Z0-9.-]+-[a-f0-9]{64}$/.test(current.key))throw new Error('Invalid built-in version record.');
    rows.push({...skill,...current,bundled:!current,directory:current?join(root,'versions',current.key):join(request.builtins??bundled,'skills',skill.name),source:skill.id!=='creator'&&!current?`https://github.com/${skill.repository}`:`https://github.com/${skill.repository}/tree/${current?.revision??skill.revision}/${skill.path}`});
  }
  return rows;
}
export async function builtinResolve(request,id,locked){
  const row=(await builtinList(request)).find(s=>s.id===id);if(!row)throw new Error('Unknown built-in skill.');
  const root=storage(request);await mkdir(join(root,'versions'),{recursive:true,mode:0o700});
  if(locked){if(!/^[a-z]+-[a-zA-Z0-9.-]+-[a-f0-9]{64}$/.test(locked.key)||locked.id!==id)throw new Error('Invalid skill version reference.');const directory=join(root,'versions',locked.key);if(await contentHash(directory)!==locked.hash)throw new Error('The pinned skill resource has changed.');return {...row,...locked,directory};}
  const hash=await contentHash(row.directory),key=`${id}-${row.revision}-${hash}`,directory=join(root,'versions',key);
  if(row.hash&&row.hash!==hash)throw new Error('The built-in skill resource has changed.');
  if(resolve(row.directory)!==resolve(directory)){try{await lstat(directory);}catch(e){if(e.code!=='ENOENT')throw e;await cp(row.directory,directory,{recursive:true,errorOnExist:true,force:false});}}
  if(await contentHash(directory)!==hash)throw new Error('The pinned skill resource has changed.');
  return {...row,key,hash,directory};
}
export async function builtinDocument(request,id){const row=(await builtinList(request)).find(s=>s.id===id);if(!row)throw new Error('Unknown built-in skill.');return {...row,content:await readFile(join(row.directory,'SKILL.md'),'utf8')};}
async function remoteJson(url){const response=await fetch(url,{headers:{Accept:'application/vnd.github+json','User-Agent':'Skills-Space'},signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(response.status===404?'The release source does not contain this skill yet.':`Skill update source returned HTTP ${response.status}.`);return response.json();}
export async function builtinCheck(request){
  const rows=await builtinList(request);let own;
  return Promise.all(rows.map(async row=>{try{
    let candidate=null;
    if(row.id==='creator'){const commits=await remoteJson(`https://api.github.com/repos/${row.repository}/commits?path=${encodeURIComponent(row.path)}&per_page=1`);const revision=commits[0]?.sha;if(!/^[a-f0-9]{40}$/.test(revision))throw new Error('Invalid upstream skill revision.');if(revision!==row.revision)candidate={revision,version:revision.slice(0,7),description:commits[0].commit.message.split('\n')[0]};}
    else {own??=(async()=>{const commits=await remoteJson(`https://api.github.com/repos/${row.repository}/commits?path=scripts%2Fbuiltin-skills%2Fmanifest.json&per_page=1`);if(Array.isArray(commits)&&commits.length===0)return null;const revision=commits[0]?.sha;if(!/^[a-f0-9]{40}$/.test(revision))throw new Error('Invalid published revision.');const file=await remoteJson(`https://api.github.com/repos/${row.repository}/contents/scripts/builtin-skills/manifest.json?ref=${revision}`);return {revision,manifest:JSON.parse(Buffer.from(file.content,'base64').toString('utf8'))};})();const release=await own;if(release){const next=release.manifest.skills?.find(s=>s.id===row.id);if(!next||!/^\d+\.\d+\.\d+$/.test(next.version))throw new Error('Invalid published skill version.');const greater=next.version.split('.').map(Number).reduce((out,n,i)=>out||Math.sign(n-Number(row.version.split('.')[i])),0)>0;if(greater)candidate={revision:release.revision,version:next.version,description:'Published skill update'};}}

    return {id:row.id,candidate,error:null};
  }catch(e){return {id:row.id,candidate:null,error:e.message};}}));
}
export function terminateProcessTree(child){
  if(!child?.pid)return Promise.resolve();
  return new Promise(done=>{
    if(process.platform==='win32'){const killer=spawn('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});killer.once('error',done);killer.once('close',done);return;}
    try{process.kill(-child.pid,'SIGTERM');}catch(e){if(e.code==='ESRCH'){done();return;}}
    setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')process.stderr.write(e.message);}done();},2000);
  });
}
export async function skillPrompt(request,directory,name,{cwd,cancelled=()=>false}={}){
  return new Promise((resolvePrompt,reject)=>{
    const child=spawn(process.execPath,[request.cli,'use',directory,'--skill',name],{cwd,windowsHide:true,detached:process.platform!=='win32',env:{...process.env,DISABLE_TELEMETRY:'1',GIT_TERMINAL_PROMPT:'0'}});
    let out='',err='',settled=false,failure=null;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timeout);clearInterval(watch);error?reject(error):resolvePrompt(value);};
    const cancel=error=>{if(failure||settled)return;failure=error;void terminateProcessTree(child).then(()=>finish(error));};
    const timeout=setTimeout(()=>cancel(new Error('Skill preparation timed out.')),60000);
    const watch=setInterval(()=>{if(cancelled())cancel(new Error('Stopped.'));},200);
    child.stdout.setEncoding('utf8');child.stdout.on('data',c=>{out+=c;});child.stderr.setEncoding('utf8');child.stderr.on('data',c=>{err=(err+c).slice(-12000);});child.once('error',e=>finish(e));child.once('close',code=>{if(!failure)finish(code!==0||!out.trim()?new Error(err||'Original skills use failed.'):null,out);});
  });
}
export async function builtinUpdate(request,id,candidate){
  if(!candidate||!/^[a-f0-9]{40}$/.test(candidate.revision)||typeof candidate.version!=='string'||!/^([a-f0-9]{7}|\d+\.\d+\.\d+)$/.test(candidate.version))throw new Error('Choose a checked skill update.');
  const row=(await builtinList(request)).find(s=>s.id===id);if(!row)throw new Error('Unknown built-in skill.');
  const root=storage(request),stage=join(root,'.download-'+randomUUID());await mkdir(stage,{recursive:true,mode:0o700});
  try{
    const prompt=await skillPrompt(request,`https://github.com/${row.repository}/tree/${candidate.revision}/${row.path}`,row.name,{cwd:stage});
    const downloaded=/Supporting files for this skill were downloaded to:\s*\n([^\n]+)/.exec(prompt)?.[1]?.trim();
    let directory;
    if(downloaded){directory=downloaded;await realpath(directory);}else {const content=/<SKILL.md>\s*\n([\s\S]*?)\n<\/SKILL.md>/.exec(prompt)?.[1];if(!content)throw new Error('Original skills use returned no skill document.');directory=join(stage,row.name);await mkdir(directory);await writeFile(join(directory,'SKILL.md'),content);}
    const hash=await contentHash(directory),key=`${id}-${candidate.revision}-${hash}`;
    await mkdir(join(root,'versions'),{recursive:true,mode:0o700});
    const destination=join(root,'versions',key);try{await lstat(destination);}catch(e){if(e.code!=='ENOENT')throw e;await cp(directory,destination,{recursive:true,errorOnExist:true,force:false});}
    if(await contentHash(destination)!==hash)throw new Error('Downloaded skill verification failed.');
    const lock=await optional(join(root,'lock.json'),{});lock[id]={key,hash,revision:candidate.revision,version:candidate.version};await atomic(join(root,'lock.json'),lock);
    return builtinList(request);
  }finally{await rm(stage,{recursive:true,force:true});}
}
