import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,realpathSync,chmodSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {field,patch,plan,observe,digest,localState} from '../src-tauri/resources/upstream/pi-invocation-state.mjs';
const body=(token=null,text='Body')=>`---\n# Preserve comments\nname: demo\ndescription: Demo\n${token===null?'':`disable-model-invocation: ${token}\n`}future: keep\n---\n${text}\n`;
function fixture(git=false) {
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ss-invocation-'))),pkg=join(root,'pkg'),file=join(pkg,'skills/demo/SKILL.md');mkdirSync(dirname(file),{recursive:true});writeFileSync(file,body());writeFileSync(join(pkg,'support.txt'),'original');
 const run=(...args)=>execFileSync('git',['-C',pkg,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 if(git){run('init','-b','main');run('config','user.email','fixture@example.invalid');run('config','user.name','Fixture');run('remote','add','origin','https://fixture.invalid/repo');run('add','.');run('commit','-m','v1');run('update-ref','refs/remotes/origin/main','HEAD');run('branch','--set-upstream-to','origin/main','main');}
 return {root,pkg,file,run,item:{file,packageRoot:git?pkg:null,packageSource:git?'git:https://fixture.invalid/repo':null,name:'demo'},state:{version:1,records:{}}};
}
function apply(f,mode){const result=plan(f.item,f.state,mode);writeFileSync(f.file,result.after);f.state.records[f.file]={...result.record,phase:'committed'};return result;}
test('automatic false, manual true and absent/false/true/quoted defaults preserve body and unrelated YAML',()=>{
 for(const original of [null,'false','true','"true"']) {
  const before=body(original);assert.equal(field(before).token,original);
  const manual=patch(before,'true'),automatic=patch(manual,'false');
  assert.equal(field(automatic).token,'false');assert.equal(patch(automatic,original),before);
  const bom='\uFEFF'+before;assert.equal(patch(patch(bom,'false'),original),bom);
  const crlf=before.replaceAll('\n','\r\n');assert.equal(patch(patch(crlf,'false'),original),crlf);
 }
 assert.throws(()=>patch('---\nname: a\ndisable-model-invocation: [true]\n---\n','false'));
 assert.throws(()=>patch('---\ndisable-model-invocation: true\ndisable-model-invocation: false\n---\n','true'));
});
test('local edits survive explicit toggles and source-default restore; patch provenance is exact',()=>{
 const f=fixture();try {
  apply(f,'manual');writeFileSync(f.file,readFileSync(f.file,'utf8').replace('Body','My local body'));
  apply(f,'auto');assert.match(readFileSync(f.file,'utf8'),/My local body/);assert.equal(field(readFileSync(f.file,'utf8')).token,'false');
  apply(f,'default');assert.match(readFileSync(f.file,'utf8'),/My local body/);assert.equal(field(readFileSync(f.file,'utf8')).token,null);
  writeFileSync(f.file,patch(readFileSync(f.file,'utf8'),'true'));assert.equal(observe(f.item,f.state.records).recovery,'conflict');
  assert.throws(()=>plan(f.item,f.state,'auto',{recover:true}),/blocked/);apply(f,'auto');assert.equal(observe(f.item,f.state.records).recovery,'consistent');
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('Git upgrades restore only policy into new content and capture each new source default',()=>{
 const f=fixture(true);try {
  const v1=localState(f.item,f.state.records).source.version;
  apply(f,'manual');assert.equal(localState(f.item,f.state.records).local,'policyOnly');
  writeFileSync(f.file,body('true','Version 2'));f.run('add','.');f.run('commit','-m','v2');f.run('update-ref','refs/remotes/origin/main','HEAD');
  const observed=observe(f.item,f.state.records);assert.notEqual(observed.source.version,v1);assert.equal(observed.recovery,'pendingRestore');
  const recovery=plan(f.item,f.state,'manual',{recover:true});assert.match(recovery.after,/Version 2/);assert.equal(recovery.record.sourceDefault,'true');
  writeFileSync(f.file,recovery.after);f.state.records[f.file]={...recovery.record,phase:'committed'};
  apply(f,'auto');assert.equal(localState(f.item,f.state.records).local,'policyOnly');apply(f,'default');assert.equal(field(readFileSync(f.file,'utf8')).token,'true');
  writeFileSync(f.file,body(null,'Version 3'));f.run('add','.');f.run('commit','-m','v3');f.run('update-ref','refs/remotes/origin/main','HEAD');
  const v3=plan(f.item,f.state,'auto',{recover:true});assert.equal(v3.record.sourceDefault,null);assert.match(v3.after,/Version 3/);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('supporting-file changes remain distinct from true invocation-field conflicts',()=>{
 const f=fixture(true);try {
  apply(f,'manual');const version=observe(f.item,f.state.records).source.version;
  writeFileSync(join(f.pkg,'support.txt'),'local');assert.equal(localState(f.item,f.state.records).local,'modified');assert.equal(observe(f.item,f.state.records).source.version,version);
  rmSync(join(f.pkg,'support.txt'));assert.equal(localState(f.item,f.state.records).local,'modified');writeFileSync(join(f.pkg,'support.txt'),'original');writeFileSync(join(f.pkg,'untracked.txt'),'local');assert.equal(localState(f.item,f.state.records).local,'modified');
  rmSync(join(f.pkg,'untracked.txt'));writeFileSync(f.file,patch(readFileSync(f.file,'utf8'),'false'));assert.equal(observe(f.item,f.state.records).recovery,'conflict');
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('editing field formatting or adding comments cannot masquerade as the application patch',()=>{
 const f=fixture(true);try {
  apply(f,'manual');writeFileSync(f.file,readFileSync(f.file,'utf8').replace('disable-model-invocation: true','disable-model-invocation: true # my edit'));
  assert.equal(observe(f.item,f.state.records).recovery,'conflict');assert.equal(localState(f.item,f.state.records).local,'modified');
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('prepared journal retries preserve body edits and reject changes to the invocation field',()=>{
 const f=fixture();try {
  const p=plan(f.item,f.state,'manual');f.state.records[f.file]=p.record;
  assert.equal(observe(f.item,f.state.records).recovery,'pendingRestore');
  assert.equal(plan(f.item,f.state,'manual',{recover:true}).after,p.after);
  writeFileSync(f.file,p.after);assert.equal(plan(f.item,f.state,'manual',{recover:true}).after,p.after);
  writeFileSync(f.file,p.after+'local change');assert.match(plan(f.item,f.state,'manual',{recover:true}).after,/local change/);writeFileSync(f.file,patch(p.after,'false'));assert.throws(()=>plan(f.item,f.state,'manual',{recover:true}),/blocked/);
  assert.equal(digest(p.after),p.record.afterHash);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});

test('Git recovery identities never persist credentials from an authenticated origin',()=>{
 const f=fixture(true);try {
  f.run('remote','set-url','origin','https://fixture-user:fixture-secret@fixture.invalid/repo');const applied=apply(f,'manual');
  const record=JSON.stringify(applied.record);assert(!record.includes('fixture-secret'));assert(!record.includes('fixture-user'));assert.match(applied.record.source.identity,/^git:[a-f0-9]{64}$/);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});

test('unpublished supporting-file commits do not block field-only configuration recovery',()=>{
 const f=fixture(true);try {
  apply(f,'manual');writeFileSync(join(f.pkg,'support.txt'),'Committed local customization');f.run('add','.');f.run('commit','-m','local only');
  assert.equal(f.run('status','--porcelain').trim(),'');assert.equal(localState(f.item,f.state.records).local,'modified');
  assert.equal(observe(f.item,f.state.records).recovery,'pendingRestore');assert.equal(field(plan(f.item,f.state,'manual',{recover:true}).after).token,'true');
  assert.equal(readFileSync(join(f.pkg,'support.txt'),'utf8'),'Committed local customization');
 }finally{rmSync(f.root,{recursive:true,force:true});}
});

test('index-hidden edits and executable-mode changes cannot be normalized as app metadata',{skip:process.platform==='win32'},()=>{
 const f=fixture(true);try {
  const saved=apply(f,'manual').after;f.run('update-index','--assume-unchanged','skills/demo/SKILL.md');writeFileSync(f.file,saved.replace('Body','Hidden local edit'));
  assert.equal(localState(f.item,f.state.records).local,'unverified');assert.match(readFileSync(f.file,'utf8'),/Hidden local edit/);
  f.run('update-index','--no-assume-unchanged','skills/demo/SKILL.md');writeFileSync(f.file,saved);chmodSync(f.file,0o755);
  assert.equal(localState(f.item,f.state.records).local,'modified');assert.equal(field(readFileSync(f.file,'utf8')).token,'true');
 }finally{rmSync(f.root,{recursive:true,force:true});}
});

test('new untracked package skills can configure fields without authorizing content overwrite',()=>{
 const f=fixture(true);try {
  const file=join(f.pkg,'skills/new-local/SKILL.md');mkdirSync(dirname(file),{recursive:true});writeFileSync(file,body(null,'Local untracked skill').replace('name: demo','name: new-local'));const original=readFileSync(file,'utf8');
  f.item={...f.item,file,name:'new-local'};f.file=file;apply(f,'manual');assert.equal(field(readFileSync(file,'utf8')).token,'true');assert.equal(localState(f.item,f.state.records).local,'modified');
  apply(f,'default');assert.equal(readFileSync(file,'utf8'),original);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('unverifiable supporting trees do not block explicit native field edits',{skip:process.platform==='win32'},()=>{
 const f=fixture();try {
  symlinkSync(join(f.root,'not-owned'),join(dirname(f.file),'linked-support'));const original=readFileSync(f.file,'utf8');
  const changed=apply(f,'manual');assert.equal(changed.record.baseline,null);assert.equal(field(readFileSync(f.file,'utf8')).token,'true');assert.equal(localState(f.item,f.state.records).local,'unverified');
  apply(f,'default');assert.equal(readFileSync(f.file,'utf8'),original);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});


test('CR-only documents preserve all unrelated bytes through true, false and default',()=>{
 const original='---\rname: cr\rdescription: Fixture\r---\rBody\r';
 const manual=patch(original,'true');assert.equal(field(manual).token,'true');
 const automatic=patch(manual,'false');assert.equal(field(automatic).token,'false');
 assert.equal(patch(automatic,null),original);
});

test('upgrade field recovery preserves unrelated user edits while retaining true field conflicts',()=>{
 const f=fixture(true);try {
  apply(f,'auto');writeFileSync(f.file,body('true','Version 2'));f.run('add','.');f.run('commit','-m','v2');f.run('update-ref','refs/remotes/origin/main','HEAD');
  writeFileSync(f.file,readFileSync(f.file,'utf8')+'\nUser notes\n');writeFileSync(join(f.pkg,'support.txt'),'User supporting edit');
  const recovery=plan(f.item,f.state,'auto',{recover:true});assert.match(recovery.after,/User notes/);assert.equal(field(recovery.after).token,'false');assert.equal(readFileSync(join(f.pkg,'support.txt'),'utf8'),'User supporting edit');
 }finally{rmSync(f.root,{recursive:true,force:true});}
});


test('local content edits require a matching recorded source and return to clean after restoration',()=>{
 const f=fixture();try {
  apply(f,'manual');
  assert.equal(localState(f.item,f.state.records).local,'clean');
  const original=readFileSync(f.file,'utf8');
  writeFileSync(f.file,original.replace('Body','Edited body'));
  assert.equal(localState(f.item,f.state.records).local,'modified');
  writeFileSync(f.file,original);
  assert.equal(localState(f.item,f.state.records).local,'clean');
  f.state.records[f.file].source.identity='file:another-source';
  assert.equal(localState(f.item,f.state.records).local,'unverified');
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
