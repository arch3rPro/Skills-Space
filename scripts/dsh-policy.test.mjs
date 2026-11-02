import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const resources=resolve('src-tauri/resources/upstream');
const {preparePolicy}=await import(pathToFileURL(join(resources,'dsh-policy.mjs')).href);
const {readPolicy}=await import(pathToFileURL(join(resources,'dsh-skill-policy/state.mjs')).href);

async function fixture(run){
  const root=await realpath(await mkdtemp(join(tmpdir(),'dsh-policy-contract-')));
  try{
    const configuration=join(root,'configuration.yml'),file=join(root,'SKILL.md'),policyFile=join(root,'state/policy.json');
    await writeFile(configuration,'[]\n');await writeFile(file,'original skill bytes\n');await mkdir(join(root,'state'));
    const snapshot={configurationPath:configuration,projectRoot:null,revision:'configuration-v1',policy:{canSave:true,policyFile,revision:(await readPolicy(policyFile)).revision},skills:[{name:'demo',file,documentRevision:'document-v1',canSetPolicy:true,sourceModelInvocable:true,sourceUserInvocable:true}]};
    const request=action=>({revision:snapshot.policy.revision,configurationRevision:snapshot.revision,action,files:[{file,revision:'document-v1'}]});
    await run({root,snapshot,file,policyFile,request});
    assert.equal(await readFile(file,'utf8'),'original skill bytes\n');
    assert.equal(await readFile(configuration,'utf8'),'[]\n');
  }finally{await rm(root,{recursive:true,force:true});}
}

await test('policy preparation rejects policy CAS changes after inspection',()=>fixture(async({snapshot,policyFile,request})=>{
  const stale=request('disable');
  await writeFile(policyFile,JSON.stringify({version:1,rules:[]}));
  await assert.rejects(preparePolicy(snapshot,stale),/policy.*changed|changed.*policy/i);
}));

await test('source-forbidden target modes are rejected rather than storing an unenableable policy',()=>fixture(async({snapshot,request})=>{
  snapshot.skills[0].sourceUserInvocable=false;
  await assert.rejects(preparePolicy(snapshot,request('manual')),/forbid|unavailable|not.*allow/i);
  const prepared=await preparePolicy(snapshot,request('model'));
  const rule=JSON.parse(prepared.after).rules[0];
  assert.equal(rule.disabled,false);assert.equal(rule.modelInvocable,true);
}));

await test('total disable and reenable preserve preferences; last available channel off restores its prior choice on enable',()=>fixture(async({snapshot,policyFile,request})=>{
  async function apply(action){const plan=await preparePolicy(snapshot,request(action));await writeFile(policyFile,plan.after);snapshot.policy.revision=(await readPolicy(policyFile)).revision;return JSON.parse(plan.after).rules[0];}
  let rule=await apply('model-off');assert.equal(rule.modelInvocable,false);assert.equal(rule.userInvocable,true);
  rule=await apply('disable');assert.equal(rule.disabled,true);assert.equal(rule.modelInvocable,false);
  rule=await apply('enable');assert.equal(rule.disabled,false);assert.equal(rule.modelInvocable,false);assert.equal(rule.userInvocable,true);
  rule=await apply('manual-off');assert.equal(rule.disabled,true);
  rule=await apply('enable');assert.equal(rule.disabled,false);assert.equal(rule.modelInvocable,false);assert.equal(rule.userInvocable,true);
}));

await test('equal legacy configuration and project rules collapse read-only, then first write produces file-only v2',()=>fixture(async({snapshot,file,policyFile,request})=>{
  const rules=[null,'/project'].map((project,index)=>({configuration:`/configuration-${index}.yml`,project,file,name:'demo',disabled:false,modelInvocable:false,userInvocable:true}));
  const raw=JSON.stringify({version:1,rules});await writeFile(policyFile,raw);
  const parsed=await readPolicy(policyFile);assert.equal(parsed.rules.length,1);assert.equal(await readFile(policyFile,'utf8'),raw);
  snapshot.policy.revision=parsed.revision;
  const prepared=await preparePolicy(snapshot,request('disable')),data=JSON.parse(prepared.after);
  assert.equal(data.version,2);assert.equal(data.rules.length,1);
  assert.equal('configuration' in data.rules[0],false);assert.equal('project' in data.rules[0],false);
}));

await test('legacy physical aliases deduplicate equal preferences and reject conflicting preferences without choosing a winner',()=>fixture(async({root,file,policyFile})=>{
  const alias=join(root,'alias.md');await symlink(file,alias);
  const rules=[file,alias].map((path,index)=>({configuration:`/configuration-${index}.yml`,project:null,file:path,name:'demo',disabled:false}));
  await writeFile(policyFile,JSON.stringify({version:1,rules}));
  assert.equal((await readPolicy(policyFile)).rules.length,1);
  rules[1].disabled=true;rules.push({...rules[1],configuration:'/configuration-third.yml'});const raw=JSON.stringify({version:1,rules});await writeFile(policyFile,raw);
  await assert.rejects(readPolicy(policyFile),error=>{assert.match(error.message,/conflict/i);assert.deepEqual(error.conflicts,[{file,name:'demo'}]);return true;});
  assert.equal(await readFile(policyFile,'utf8'),raw);
}));

await test('unqualified or undiscovered files cannot be written through an otherwise writable unified policy',()=>fixture(async({snapshot,request})=>{
  snapshot.skills[0].canSetPolicy=false;
  await assert.rejects(preparePolicy(snapshot,request('disable')),/skill changed/i);
  snapshot.skills=[];await assert.rejects(preparePolicy(snapshot,request('disable')),/skill changed/i);
}));
