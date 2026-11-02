import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp,mkdir,writeFile,readFile,realpath,rm,cp } from 'node:fs/promises';
import { dirname,join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const resources=resolve('src-tauri/resources/upstream');
const {inspectDsh}=await import(pathToFileURL(join(resources,'inspect-dsh-skills.mjs')).href);
const {prepareSetup,preparePolicy}=await import(pathToFileURL(join(resources,'dsh-policy.mjs')).href);
const {identity,statusPath,digest,pluginVersion}=await import(pathToFileURL(join(resources,'dsh-skill-policy/state.mjs')).href);
const root=await realpath(await mkdtemp(join(tmpdir(),'dsh-unified-'))),home=join(root,'home'),dshHome=join(home,'.dsh');
const saved=Object.fromEntries(['HOME','DSH_HOME','DSH_AGENTS_HOME','DSH_BUNDLED_SKILL_DIR'].map(key=>[key,process.env[key]]));
Object.assign(process.env,{HOME:home,DSH_HOME:dshHome,DSH_AGENTS_HOME:join(home,'.agents')});delete process.env.DSH_BUNDLED_SKILL_DIR;
const a=join(root,'a'),b=join(root,'b'),c=join(root,'c'),configPaths=[];
async function put(path,text){await mkdir(dirname(path),{recursive:true});await writeFile(path,text);}
async function skill(dir,name){await put(join(dir,name,'SKILL.md'),`---\nname: ${name}\ndescription: Fixture\n---\n${dir}\n`);}
const read=(contextKey='all')=>inspectDsh(home,dshHome,null,{installation:'cli',contextKey});
try{
  await skill(join(home,'.agents/skills'),'shared-demo');await skill(join(home,'.agents/skills'),'duplicate');
  await skill(a,'only-a');await skill(a,'duplicate');await skill(b,'only-b');await skill(c,'only-c');
  for(const [profile,specs]of [['one',[['standard',a],['ptc',b]]],['two',[['standard',c]]]]){
    const dir=join(dshHome,'profiles',profile),path=join(dir,'cordis.patch.yml');configPaths.push(path);
    await put(join(dir,'package.json'),JSON.stringify({name:`fixture-${profile}`,private:true,dsh:{profile:{bundles:[]}}}));
    await put(path,JSON.stringify([{insert:specs.map(([preset,custom])=>({id:`preset-${preset}`,name:'@deepseek-ai/dsh-agent-preset',config:{id:preset,name:preset,plugins:[{id:'filesystem',name:'@deepseek-ai/dsh-skill-filesystem',config:{watch:false,customSkillDirs:[custom]}}]}}))}]));
  }
  let all=await read();
  await test('unified scan includes each configuration-only directory and physical file once with complete shadow memberships',async()=>{
    assert.equal(all.contextKey,'all');assert.equal(all.aggregate,true);assert.equal(all.contexts.length,3);
    assert.equal(all.skills.length,6);assert.equal(new Set(all.skills.map(row=>row.file)).size,6);
    const common=all.skills.find(row=>row.name==='shared-demo');assert.equal(common.memberships.length,3);
    const copies=all.skills.filter(row=>row.name==='duplicate');assert.equal(copies.length,2);
    const user=copies.find(row=>row.source==='user-agents');
    assert.equal(user.memberships.find(row=>row.configurationPath===configPaths[0]&&row.preset==='standard').shadowed,true);
    assert.equal(user.memberships.find(row=>row.configurationPath===configPaths[0]&&row.preset==='ptc').shadowed,false);
    assert.equal(user.memberships.find(row=>row.configurationPath===configPaths[1]).shadowed,false);assert.equal(user.shadowed,false);
    for(const path of configPaths){const scoped=await read(`file:${path}`);assert.equal(scoped.aggregate,undefined,'settings retain their single-file reader');}
    assert.deepEqual(all.skills.map(row=>row.name).sort(),['duplicate','duplicate','only-a','only-b','only-c','shared-demo']);
  });

  async function wrap(path){
    const dir=dirname(path);await cp(join(resources,'dsh-skill-policy'),join(dir,'node_modules/@skills-space/dsh-skill-policy'),{recursive:true});
    const snapshot=await read(`file:${path}`),plan=await prepareSetup(snapshot);await put(plan.path,plan.after);
  }
  await wrap(configPaths[0]);all=await read();
  await test('partial setup preserves all inventory and exposes only qualified file policy while reporting missing configurations',()=>{
    assert.equal(all.skills.length,6);assert.equal(all.policy.status,'not-installed');assert.equal(all.policy.canInstall,true);
    assert.equal(all.skills.find(row=>row.name==='only-a').canSetPolicy,true);
    assert.equal(all.skills.find(row=>row.name==='only-c').canSetPolicy,false);
    assert.equal(all.skills.find(row=>row.name==='shared-demo').canSetPolicy,true);
  });
  await wrap(configPaths[1]);all=await read();
  await test('file-only save is visible in every membership and a genuine live acknowledgement error survives aggregation',async()=>{
    const selected=all.skills.find(row=>row.name==='shared-demo');
    const plan=await preparePolicy(all,{revision:all.policy.revision,configurationRevision:all.revision,action:'disable',files:[{file:selected.file,revision:selected.documentRevision}]});
    await put(plan.path,plan.after);all=await read();
    assert.equal(JSON.parse(plan.after).version,2);assert.equal(all.skills.find(row=>row.file===selected.file).policyEnabled,false);
    for(const path of configPaths){const scoped=await read(`file:${path}`);assert.equal(scoped.skills.find(row=>row.file===selected.file).policyEnabled,false);}
    assert.equal(all.policy.status,'pending');assert.equal(all.policy.running,false,'no confirmation must not claim an active plugin');
    for(const row of all.configurations.filter(row=>row.path===configPaths[0])){const options=row.policyOptions,file=statusPath(all.policy.policyFile,await identity(row.path),options.providerKey);await put(file,JSON.stringify({pid:process.pid,updatedAt:Date.now(),configuration:await identity(row.path),version:pluginVersion,revision:all.policy.revision,issue:null,token:options.token,filesystem:digest(JSON.stringify(options.filesystem??{}))}));}
    assert.equal((await read()).policy.status,'active','a fully connected but dormant second configuration does not block the running configuration');
    for(const row of all.configurations.filter(row=>row.path===configPaths[1])){const options=row.policyOptions,file=statusPath(all.policy.policyFile,await identity(row.path),options.providerKey);await put(file,JSON.stringify({pid:process.pid,updatedAt:Date.now(),configuration:await identity(row.path),version:pluginVersion,revision:all.policy.revision,issue:null,token:options.token,filesystem:digest(JSON.stringify(options.filesystem??{}))}));}
    assert.equal((await read()).policy.status,'active');
    const row=all.configurations[0],file=statusPath(all.policy.policyFile,await identity(row.path),row.policyOptions.providerKey),status=JSON.parse(await readFile(file,'utf8'));status.issue='Fixture runtime policy error';await put(file,JSON.stringify(status));
    const broken=await read();assert.equal(broken.policy.status,'error');assert.match(broken.policy.issue,/Fixture runtime policy error/);
    assert.equal(broken.skills.length,6,'activation errors do not erase discovered files');
  });
  await test('invocation activation accepts evaluated directory digest differences but rejects invalid policy acknowledgements',async()=>{
    const snapshot=await read(),rows=snapshot.configurations;
    const evaluatedDigest=digest(JSON.stringify({customSkillDirs:['/runtime-resolved-directory'],watch:false}));
    assert.notEqual(evaluatedDigest,digest(JSON.stringify(rows[0].policyOptions.filesystem??{})),
      'the fixture deliberately represents declaration versus runtime evaluation, not equal directory settings');
    async function acknowledge(changes={}){
      for(const row of rows){const options=row.policyOptions;await put(statusPath(snapshot.policy.policyFile,await identity(row.path),options.providerKey),JSON.stringify({pid:process.pid,updatedAt:Date.now(),configuration:await identity(row.path),version:pluginVersion,revision:snapshot.policy.revision,issue:null,token:options.token,filesystem:evaluatedDigest,...changes}));}
      return read();
    }
    const ready=await acknowledge();assert.equal(ready.policy.status,'active');assert.equal(ready.runtimeVerified,false,
      'invocation confirmation does not claim runtime directory verification');
    const badToken=await acknowledge({token:'wrong-plugin-attachment'});assert.equal(badToken.policy.status,'pending');assert.equal(badToken.policy.pendingReason,'reload');
    const changedPolicy=await acknowledge({revision:'older-policy-revision'});assert.equal(changedPolicy.policy.status,'pending');assert.equal(changedPolicy.policy.pendingReason,'apply',
      'a live matching plugin can apply a new policy regardless of filesystem digest differences');
    assert.equal((await acknowledge({version:'0.0.0'})).policy.status,'pending');
    const stale=await acknowledge({updatedAt:Date.now()-60000});assert.equal(stale.policy.status,'pending');assert.equal(stale.policy.running,false);
    const exited=spawnSync(process.execPath,['-e','process.exit(0)'],{env:process.env});assert.equal(exited.status,0);assert.ok(exited.pid);
    const dead=await acknowledge({pid:exited.pid});assert.equal(dead.policy.status,'pending');assert.equal(dead.policy.running,false);
    const failed=await acknowledge({issue:'Fixture invocation policy failure'});assert.equal(failed.policy.status,'error');assert.match(failed.policy.issue,/Fixture invocation policy failure/);
    assert.equal((await acknowledge()).policy.status,'active');
  });
}finally{for(const[key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}await rm(root,{recursive:true,force:true});}
