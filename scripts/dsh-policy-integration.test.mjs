import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, cp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const resources=resolve('src-tauri/resources/upstream');
const {inspectDsh}=await import(pathToFileURL(join(resources,'inspect-dsh-skills.mjs')).href);
const {prepareSetup,preparePolicy}=await import(pathToFileURL(join(resources,'dsh-policy.mjs')).href);
const {prepareConfiguration}=await import(pathToFileURL(join(resources,'prepare-dsh-change.mjs')).href);
const {configurationState}=await import(pathToFileURL(join(resources,'dsh-configuration.mjs')).href);
const root=await realpath(await mkdtemp(join(tmpdir(),'skills-space-dsh-integration-')));
const envKeys=['HOME','DSH_HOME','DSH_AGENTS_HOME','DSH_BUNDLED_SKILL_DIR'];
const saved=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
const home=join(root,'home'),dshHome=join(home,'.dsh'),projectA=join(root,'project-a'),projectB=join(root,'project-b');
Object.assign(process.env,{HOME:home,DSH_HOME:dshHome,DSH_AGENTS_HOME:join(home,'.agents')});delete process.env.DSH_BUNDLED_SKILL_DIR;
const fixture=join(root,'base'),plugin=join(root,'policy');
const options={installation:'cli'};
async function put(path,text){await mkdir(dirname(path),{recursive:true});await writeFile(path,text);}
async function skill(path,name,body){await put(join(path,name,'SKILL.md'),`---\nname: ${name}\ndescription: Fixture\n---\n${body}\n`);}
async function applyPlan(plan){assert.equal(await readFile(plan.path,'utf8').catch(()=>''),plan.before);await put(plan.path,plan.after);}
try{
  await mkdir(join(projectA,'.git'),{recursive:true});await mkdir(join(projectB,'.git'),{recursive:true});
  await skill(join(home,'.agents/skills'),'shared-demo','SHARED');
  await skill(join(projectA,'.dsh/skills'),'shared-demo','PROJECT');
  await put(join(fixture,'package.json'),JSON.stringify({name:'dsh-policy-fixture',version:'1.0.0',dsh:{bundle:{patch:'./cordis.patch.yml'}}}));
  // Object keys intentionally precede config. Cordis composition may emit the
  // equivalent group/config keys in another order; setup must compare meaning.
  const fsEntry={id:'filesystem',name:'@deepseek-ai/dsh-skill-filesystem',disabled:false,group:false,config:{watch:false}};
  const presets=['standard','ptc'].map(id=>({id:`preset-${id}`,name:'@deepseek-ai/dsh-agent-preset',config:{id,name:id,description:'keep description',plugins:[{...structuredClone(fsEntry),id:`${id}-fs`},{id:`${id}-untouched`,name:'fixture-other',config:{future:'keep'}}]}}));
  await put(join(fixture,'cordis.patch.yml'),JSON.stringify([{insert:presets}]));
  await cp(join(resources,'dsh-skill-policy'),plugin,{recursive:true});
  for(const profile of (process.env.DSH_POLICY_TEST_PROFILE?[process.env.DSH_POLICY_TEST_PROFILE]:['web','desktop','custom','root-only','root-explicit'])){
    // Each lifecycle fixture starts with no user policy; policy sharing across
    // profiles is covered separately by the v2 runtime and union contracts.
    await rm(join(dshHome,'skills-space/skill-policy.json'),{force:true});
    const dir=join(dshHome,'profiles',profile);
    const base=profile.startsWith('root-')?join(root,`base-${profile}`):fixture;
    if(profile.startsWith('root-')){await cp(fixture,base,{recursive:true});await put(join(base,'cordis.patch.yml'),JSON.stringify(profile==='root-explicit'?[]:[{insert:[fsEntry]}]));}
    await put(join(dir,'package.json'),JSON.stringify({name:`fixture-${profile}`,version:'1.0.0',private:true,type:'module',dependencies:{'dsh-policy-fixture':`file:${base}`},dsh:{profile:{bundles:['dsh-policy-fixture']}}}));
    await put(join(dir,'cordis.patch.yml'),profile==='root-explicit'?JSON.stringify([{insert:[fsEntry]}]):'# user configuration\n[]\n');
    // Official CLI installs both local bundles, including the real policy package.
    const command=spawnSync(process.execPath,['--expose-internals',join(resources,'run-dsh-policy-install.mjs'),home,'cli',profile,plugin],{encoding:'utf8',env:process.env,timeout:90000});
    assert.equal(command.status,0,command.stderr+'\n'+command.stdout);
    let before=await inspectDsh(home,dshHome,projectA,{...options,contextKey:`file:${join(dir,'cordis.patch.yml')}`});
    assert.equal(before.policy.canInstall,true,JSON.stringify(before.warnings));
    const skillBytes=await readFile(join(home,'.agents/skills/shared-demo/SKILL.md'),'utf8');
    const setupState=before[configurationState].contexts.get(before.configurations.find(row=>row.path===before.configurationPath).key);
    if(profile==='root-explicit'){
      // A configuration object may arrive with any own-key order. Preserve the
      // exact values and explicitly exercise disabled/group before config.
      const state=setupState,row=state.effective[0];
      state.effective[0]={id:row.id,name:row.name,disabled:row.disabled,group:row.group,config:row.config};
      const api=state.api;
      state.api={...api,composeEntries(layers){
        // Reorder only root own keys, after real Cordis composition. This is
        // semantically identical configuration, not a dropped/changed field.
        return api.composeEntries(layers).map(entry=>Object.fromEntries(Object.entries(entry).reverse()));
      }};
    }
    const setup=await prepareSetup(before);
    // The semantic comparison must still reject an actual unrelated value
    // change returned by composition, rather than dropping its safety check.
    const state=setupState,originalApi=state.api;
    state.api={...originalApi,composeEntries(layers){const result=originalApi.composeEntries(layers);result[0].disabled=true;return result;}};
    try{await assert.rejects(prepareSetup(before),/would change another configuration entry/);}finally{state.api=originalApi;}
    await applyPlan(setup);
    const after=await inspectDsh(home,dshHome,projectA,{...options,contextKey:`file:${join(dir,'cordis.patch.yml')}`});
    assert.equal(after.policy.canSave,true,JSON.stringify(after.policy));
    const shape=skill=>({file:skill.file,name:skill.name,rank:skill.rank,shadowed:skill.shadowed});
    assert.deepEqual(after.skills.map(shape),before.skills.map(shape));
    assert.deepEqual(after.roots.map(row=>row.path),before.roots.map(row=>row.path));
    // Directory edits still target the underlying filesystem settings and keep
    // the companion's runtime/configuration identity intact.
    const editable=after.configurations.find(row=>row.key===after.contextKey);
    assert.ok(editable,JSON.stringify({profile,context:after.contextKey,presets:after.presets,rows:after.configurations}));
    const prepared=await prepareConfiguration(home,dshHome,projectA,{key:editable.key,revision:after.revision,directoryOnly:true,customSkillDirs:[join(root,'extra')],includeDefaultRoots:true,confirmMaterialize:true},options);
    await applyPlan(prepared);
    let changed=await inspectDsh(home,dshHome,projectA,{...options,contextKey:after.contextKey});
    assert.equal(changed.policy.canSave,true);
    assert.deepEqual(changed.configurations.find(row=>row.key===after.contextKey).customSkillDirs,[join(root,'extra')]);
    const restore=await prepareConfiguration(home,dshHome,projectA,{key:after.contextKey,revision:changed.revision,directoryOnly:true,reset:true},options);
    await applyPlan(restore);
    changed=await inspectDsh(home,dshHome,projectA,{...options,contextKey:after.contextKey});
    assert.equal(changed.policy.canSave,true,'directory reset must retain the installed policy wrapper');
    assert.equal(changed.configurations.find(row=>row.key===after.contextKey).policyWrapped,true);
    assert.deepEqual(changed.configurations.find(row=>row.key===after.contextKey).customSkillDirs,[]);
    async function runtimeCall(){
      const child=spawn(process.execPath,['--expose-internals',resolve('scripts/dsh-policy-runtime.test-worker.mjs'),home,dshHome,changed.contextKey,projectA,'shared-demo'],{env:process.env,stdio:['pipe','pipe','pipe']});
      let output='',errors='';child.stderr.on('data',data=>{errors+=data;});
      const observed=await new Promise((yes,no)=>{child.stdout.on('data',data=>{output+=data;const line=output.split('\n').find(line=>line.startsWith('{'));if(line){try{yes(JSON.parse(line));}catch(error){no(error);}}});child.on('exit',code=>{if(!output)no(Error(`Runtime worker exited ${code}: ${errors}`));});});
      return {observed,async close(){child.stdin.end();await new Promise(done=>child.once('exit',done));}};
    }
    const live=await runtimeCall();assert.equal(live.observed.model.allowed,true);assert.equal(live.observed.manual,1);
    const active=await inspectDsh(home,dshHome,projectA,{...options,contextKey:changed.contextKey});assert.equal(active.policy.status,'active',JSON.stringify(active.policy));
    await live.close();
    const stopped=await inspectDsh(home,dshHome,projectA,{...options,contextKey:changed.contextKey});
    assert.notEqual(stopped.policy.status,'active','a dead plugin process acknowledgement cannot claim activation');
    const file=changed.skills.find(skill=>skill.source==='user-agents');
    const policy=await preparePolicy(changed,{revision:changed.policy.revision,configurationRevision:changed.revision,action:'disable',files:[{file:file.file,revision:file.documentRevision}]});
    await applyPlan(policy);
    const disabled=await inspectDsh(home,dshHome,projectA,{...options,contextKey:after.contextKey});
    assert.equal(disabled.skills.find(skill=>skill.file===file.file).policyEnabled,false);
    // Restart a real child process with the saved project policy. The higher-priority project copy is unchanged.
    const blockPlan=await preparePolicy(disabled,{revision:disabled.policy.revision,configurationRevision:disabled.revision,action:'disable',files:disabled.skills.filter(skill=>skill.source==='project-dsh').map(skill=>({file:skill.file,revision:skill.documentRevision}))});await applyPlan(blockPlan);
    const restarted=await runtimeCall();assert.equal(restarted.observed.model.allowed,false);assert.equal(restarted.observed.manual,0);await restarted.close();
    const other=await inspectDsh(home,dshHome,projectB,{...options,contextKey:after.contextKey});
    assert.equal(other.skills.find(skill=>skill.file===file.file).policyEnabled,false,'the same user file has one policy in every project');
    assert.equal(await readFile(join(home,'.agents/skills/shared-demo/SKILL.md'),'utf8'),skillBytes);
    if(!profile.startsWith('root-')){
      const original=before[configurationState].contexts.get(before.contextKey).effective;
      const current=changed[configurationState].contexts.get(after.contextKey).effective;
      for(const preset of current){assert.equal(preset.config.description,'keep description');assert.equal(preset.config.plugins[1].config.future,'keep');}
      assert.equal(original.length,current.length);
    }
  }
  console.log('Original DSH CLI installed local package in web/desktop/custom/root-only/root-explicit isolated profiles; wrapping, directory editing/reset, dead-process acknowledgement, discovery and project policy passed.');
}finally{for(const key of envKeys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}await rm(root,{recursive:true,force:true});}
