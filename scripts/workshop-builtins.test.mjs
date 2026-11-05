import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {builtinList,builtinResolve,builtinCheck,builtinUpdate,contentHash,skillPrompt} from './workshop-builtins.mjs';

async function isolated(t){
 const root=await realpath(await mkdtemp(join(tmpdir(),'skills-space-builtins-')));t.after(()=>rm(root,{recursive:true,force:true}));
 const home=join(root,'home'),builtins=join(root,'bundled'),cli=join(root,'original-use.mjs');
 const skills=['creator','evaluator','optimizer'].map(id=>({id,name:'skill-'+id,version:id==='creator'?'a'.repeat(7):'0.1.0',revision:id==='creator'?'a'.repeat(40):'0.1.0',repository:id==='creator'?'anthropics/skills':'arch3rPro/Skills-Space',path:'skills/skill-'+id}));
 await mkdir(home);await mkdir(builtins);await writeFile(join(builtins,'manifest.json'),JSON.stringify({schemaVersion:1,skills}));
 for(const row of skills){const dir=join(builtins,'skills',row.name);await mkdir(join(dir,'references'),{recursive:true});await writeFile(join(dir,'SKILL.md'),'---\nname: '+row.name+'\ndescription: Test skill.\n---\n# Original');await writeFile(join(dir,'references','guide.md'),'Original complete resource');}
 await writeFile(cli,`import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {join} from 'node:path';
 const root=${JSON.stringify(root)},mode=readFileSync(join(root,'mode'),'utf8');
 if(mode==='fail'){process.stderr.write('Download failed');process.exit(1);}
 const dir=join(root,'downloaded',process.argv[5]);mkdirSync(join(dir,'references'),{recursive:true});
 writeFileSync(join(dir,'SKILL.md'),'---\\nname: '+process.argv[5]+'\\ndescription: Updated skill.\\n---\\n# Updated');writeFileSync(join(dir,'references','guide.md'),'Updated complete resource');
 writeFileSync(join(root,'last-use'),JSON.stringify(process.argv.slice(2)));
 process.stdout.write('Supporting files for this skill were downloaded to:\\n'+dir+'\\n');`);
 await writeFile(join(root,'mode'),'normal');return {root,home,builtins,cli};
}
test('built-in updates keep confirmed pins, complete resources and the old lock on retrieval failures',async t=>{
 const request=await isolated(t),initial=await builtinResolve(request,'creator');
 assert.equal(await contentHash(initial.directory),initial.hash);
 const oldPin={id:'creator',key:initial.key,hash:initial.hash,version:initial.version,revision:initial.revision};
 await writeFile(join(initial.directory,'references','guide.md'),'Damaged cached copy');
 await assert.rejects(builtinResolve(request,'creator'),/changed|verification/i);
 await writeFile(join(initial.directory,'references','guide.md'),'Original complete resource');
 const revision='b'.repeat(40),ownRevision='c'.repeat(40),seen=[];
 const oldFetch=globalThis.fetch;t.after(()=>{globalThis.fetch=oldFetch;});
 globalThis.fetch=async url=>{seen.push(url);return {ok:true,json:async()=>url.includes('/contents/')?{content:Buffer.from(JSON.stringify({skills:[{id:'evaluator',version:'0.1.1'},{id:'optimizer',version:'0.1.0'}]})).toString('base64')}:[{sha:url.includes('anthropics')?revision:ownRevision,commit:{message:'Reviewed update\nDetails'}}]};};
 const checks=await builtinCheck(request),candidate=checks.find(row=>row.id==='creator').candidate;
 assert.equal(candidate.revision,revision);assert.equal(checks.find(row=>row.id==='evaluator').candidate.revision,ownRevision);assert.equal(checks.find(row=>row.id==='optimizer').candidate,null);
 assert(seen.some(url=>url.includes('/contents/')&&url.endsWith('ref='+ownRevision)));
 await builtinUpdate(request,'creator',candidate);
 const lockPath=join(request.home,'.skills-space','builtin-skills','lock.json'),lock=await readFile(lockPath,'utf8');
 const current=await builtinResolve(request,'creator');assert.equal(current.revision,revision);assert.notEqual(current.key,oldPin.key);
 assert.equal(await readFile(join(current.directory,'references','guide.md'),'utf8'),'Updated complete resource');
 const use=JSON.parse(await readFile(join(request.root,'last-use'),'utf8'));assert.deepEqual(use,['use',`https://github.com/anthropics/skills/tree/${revision}/skills/skill-creator`,'--skill','skill-creator']);
 const retained=await builtinResolve(request,'creator',oldPin);assert.equal(retained.directory,initial.directory);assert.equal(await contentHash(retained.directory),initial.hash);
 await writeFile(join(request.root,'mode'),'fail');
 await assert.rejects(builtinUpdate(request,'evaluator',{revision:ownRevision,version:'0.1.1'}),/Download failed/);
 assert.equal(await readFile(lockPath,'utf8'),lock);assert.equal((await builtinList(request)).find(row=>row.id==='creator').key,current.key);
 globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('anthropics')?[{sha:revision,commit:{message:'Same fixed version'}}]:[]});
 const unpublished=await builtinCheck(request);assert(unpublished.every(row=>row.error===null&&row.candidate===null));assert.equal(await readFile(lockPath,'utf8'),lock);
 globalThis.fetch=async()=>({ok:false,status:503});const failed=await builtinCheck(request);assert(failed.every(row=>row.error));assert.equal(await readFile(lockPath,'utf8'),lock);
});

test('stopping original skills use ends its owned preparation process tree before returning', {skip:process.platform==='win32'},async t=>{
 const request=await isolated(t),pidPath=join(request.root,'preparation-child'),cli=join(request.root,'waiting-use.mjs');
 await writeFile(cli,`import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';
 const child=spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)\"],{stdio:'ignore'});
 writeFileSync(${JSON.stringify(pidPath)},String(child.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`);
 let cancelled=false;const turn=skillPrompt({...request,cli},request.builtins,'skill-creator',{cwd:request.root,cancelled:()=>cancelled});
 let pid;for(let i=0;i<100;i++){try{pid=Number(await readFile(pidPath,'utf8'));break;}catch(e){if(e.code!=='ENOENT')throw e;}await new Promise(resolve=>setTimeout(resolve,10));}
 assert(pid,'The preparation child must have started');t.after(()=>{try{process.kill(pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}});
 cancelled=true;await assert.rejects(turn,/Stopped/);
 // SIGKILL delivery and OS process-table removal are asynchronous.
 let exited=false;for(let i=0;i<50;i++){try{process.kill(pid,0);}catch(e){if(e.code!=='ESRCH')throw e;exited=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}
 assert(exited,'The owned preparation child must exit after cancellation');
 await assert.rejects(stat(join(request.root,'last-use')),{code:'ENOENT'});
});
