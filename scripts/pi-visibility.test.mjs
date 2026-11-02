import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,copyFileSync,readFileSync,rmSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {inspectPiSkills} from '../src-tauri/resources/upstream/inspect-pi-skills.mjs';

test('managed visibility survives reinspection without changing shared content or native settings',()=>{
 const root=mkdtempSync(join(tmpdir(),'pi-visibility-'));
 try {
  const home=join(root,'home'),agent=join(home,'.pi/agent'),file=join(home,'.agents/skills/shared/SKILL.md');
  mkdirSync(join(agent,'extensions'),{recursive:true});mkdirSync(join(home,'.agents/skills/shared'),{recursive:true});
  const text='---\nname: shared\ndescription: Shared fixture\n---\nOriginal skill body.\n';writeFileSync(file,text);
  writeFileSync(join(agent,'settings.json'),'{"future":true}');
  copyFileSync('scripts/pi-visibility-extension.mjs',join(agent,'extensions/skills-space-visibility.js'));
  writeFileSync(join(agent,'skills-space-visibility.json'),JSON.stringify({version:1,hiddenSkills:[{file:realpathSync(file),name:'shared'}]}));
  for(let i=0;i<2;i++) {
   const skill=inspectPiSkills(home,agent).skills[0];
   assert.equal(skill.manualOnly,true);assert.equal(skill.canSetVisibility,true);assert.equal(skill.visibilityPending,false);
  }
  assert.equal(readFileSync(file,'utf8'),text);assert.equal(readFileSync(join(agent,'settings.json'),'utf8'),'{"future":true}');
  rmSync(join(agent,'extensions/skills-space-visibility.js'));
  const missing=inspectPiSkills(home,agent).skills[0];assert.equal(missing.manualOnly,false);assert.equal(missing.visibilityPending,true);
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('runtime affects only prompt copies, exact identities and trusted project configuration',async()=>{
 const root=mkdtempSync(join(tmpdir(),'pi-visibility-hook-'));
 try {
  const agent=join(root,'agent'),project=join(root,'project'),globalFile=join(root,'global.md'),projectFile=join(root,'project.md');
  mkdirSync(join(agent,'extensions'),{recursive:true});mkdirSync(join(project,'.pi'),{recursive:true});
  const entry=join(agent,'extensions/skills-space-visibility.mjs');copyFileSync('scripts/pi-visibility-extension.mjs',entry);
  writeFileSync(join(agent,'skills-space-visibility.json'),JSON.stringify({version:1,hiddenSkills:[{file:globalFile,name:'same'}]}));
  writeFileSync(join(project,'.pi/skills-space-visibility.json'),JSON.stringify({version:1,hiddenSkills:[{file:projectFile,name:'same'}]}));
  const extension=await import(pathToFileURL(entry));let hook;extension.default({on:(name,handler)=>{assert.equal(name,'before_agent_start');hook=handler;}});
  const original=[{name:'same',filePath:globalFile,disableModelInvocation:false},{name:'same',filePath:projectFile,disableModelInvocation:false},{name:'author',filePath:join(root,'author.md'),disableModelInvocation:true}];
  const run=trusted=>{const event={systemPromptOptions:{skills:structuredClone(original)}};hook(event,{cwd:project,isProjectTrusted:()=>trusted});return event.systemPromptOptions.skills;};
  assert.deepEqual(run(false).map(skill=>skill.disableModelInvocation),[true,false,true]);
  assert.deepEqual(run(true).map(skill=>skill.disableModelInvocation),[true,true,true]);
  writeFileSync(join(project,'.pi/skills-space-visibility.json'),JSON.stringify({version:1,hiddenSkills:[{file:globalFile,name:'same',hidden:false}]}));
  assert.deepEqual(run(true).map(skill=>skill.disableModelInvocation),[false,false,true]);
  assert.deepEqual(original.map(skill=>skill.disableModelInvocation),[false,false,true]);
  writeFileSync(join(agent,'skills-space-visibility.json'),JSON.stringify({version:1,hiddenSkills:[]}));
  assert.deepEqual(run(false).map(skill=>skill.disableModelInvocation),[false,false,true]);
  assert.throws(()=>hook({},{}),/requires Pi/);
  writeFileSync(join(project,'.pi/skills-space-visibility.json'),'invalid');
  assert.doesNotThrow(()=>run(false));assert.throws(()=>run(true));
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('managed explicit auto overrides source true; absent policy and missing extension preserve source default',()=>{
 const root=mkdtempSync(join(tmpdir(),'pi-managed-default-'));
 try {
  const home=join(root,'home'),agent=join(home,'.pi/agent'),file=join(home,'.agents/skills/authored/SKILL.md');
  mkdirSync(join(agent,'extensions'),{recursive:true});mkdirSync(join(home,'.agents/skills/authored'),{recursive:true});
  const text='---\nname: authored\ndescription: Authored fixture\ndisable-model-invocation: true\n---\nKeep this body.\n';writeFileSync(file,text);
  const lock=join(home,'.agents/.skill-lock.json'),lockText=JSON.stringify({version:3,skills:{authored:{source:'fixture/repo'}}});writeFileSync(lock,lockText);
  const policy=join(agent,'skills-space-visibility.json'),extension=join(agent,'extensions/skills-space-visibility.js');
  let state=inspectPiSkills(home,agent).skills[0];assert(state.managed&&state.manualOnly&&state.canSetVisibility);assert.equal(state.visibilityConfigured,false);
  copyFileSync('scripts/pi-visibility-extension.mjs',extension);
  writeFileSync(policy,JSON.stringify({version:1,hiddenSkills:[{file:realpathSync(file),name:'authored',hidden:false}]}));
  for(let i=0;i<2;i++) {state=inspectPiSkills(home,agent).skills[0];assert.equal(state.manualOnly,false);assert.equal(state.sourceManualOnly,true);assert.equal(state.visibilityPending,false);}
  writeFileSync(join(agent,'skills-space-invocation.json'),JSON.stringify({version:1,records:{[realpathSync(file)]:{phase:'committed'}}}));
  writeFileSync(policy,JSON.stringify({version:1,hiddenSkills:[{file:realpathSync(file),name:'authored',hidden:true}]}));
  state=inspectPiSkills(home,agent).skills[0];assert.equal(state.visibilityHidden,true);assert.equal(state.manualOnly,true);
  writeFileSync(policy,JSON.stringify({version:1,hiddenSkills:[{file:realpathSync(file),name:'authored',hidden:false}]}));
  rmSync(extension);state=inspectPiSkills(home,agent).skills[0];assert.equal(state.manualOnly,true);assert.equal(state.visibilityPending,true);
  copyFileSync('scripts/pi-visibility-extension.mjs',extension);rmSync(policy);assert.equal(inspectPiSkills(home,agent).skills[0].manualOnly,true);
  assert.equal(readFileSync(file,'utf8'),text);assert.equal(readFileSync(lock,'utf8'),lockText);
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('runtime explicit auto overrides source true while native committed fields and loader skills remain intact',async()=>{
 const root=mkdtempSync(join(tmpdir(),'pi-runtime-default-'));
 try {
  const agent=join(root,'agent'),project=join(root,'project');mkdirSync(join(agent,'extensions'),{recursive:true});mkdirSync(join(project,'.pi'),{recursive:true});
  const entry=join(agent,'extensions/skills-space-visibility.mjs');copyFileSync('scripts/pi-visibility-extension.mjs',entry);
  const original=[{name:'authored',filePath:join(project,'.agents/skills/authored/SKILL.md'),disableModelInvocation:true},{name:'native',filePath:join(root,'native.md'),disableModelInvocation:true},{name:'default',filePath:join(root,'default.md'),disableModelInvocation:true}];
  writeFileSync(join(project,'skills-lock.json'),JSON.stringify({version:1,skills:{authored:{source:'fixture/repo'}}}));
  writeFileSync(join(agent,'skills-space-invocation.json'),JSON.stringify({version:1,records:{[original[0].filePath]:{phase:'committed'},[original[1].filePath]:{phase:'committed'}}}));
  const policy=join(agent,'skills-space-visibility.json');writeFileSync(policy,JSON.stringify({version:1,hiddenSkills:original.map(s=>({file:s.filePath,name:s.name,hidden:false}))}));
  let hook;(await import(pathToFileURL(entry))).default({on:(_,handler)=>{hook=handler;}});
  const run=()=>{const event={systemPromptOptions:{skills:structuredClone(original)}};hook(event,{cwd:project,isProjectTrusted:()=>true});return event.systemPromptOptions.skills;};
  assert.deepEqual(run().map(s=>s.disableModelInvocation),[false,true,true]);
  writeFileSync(policy,JSON.stringify({version:1,hiddenSkills:[{file:original[0].filePath,name:'authored',hidden:true}]}));assert.deepEqual(run().map(s=>s.disableModelInvocation),[true,true,true]);
  rmSync(policy);assert.deepEqual(run(),original);assert.deepEqual(original.map(s=>s.disableModelInvocation),[true,true,true]);
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('original Pi prompt discovery and manual command obey the managed override without document writes', {skip:!process.env.SKILLS_SPACE_PI_TEST_INSTALL}, async()=>{
 const install=process.env.SKILLS_SPACE_PI_TEST_INSTALL;
 const {loadSkillsFromDir,formatSkillsForPrompt}=await import(pathToFileURL(join(install,'dist/core/skills.js')));
 const {AgentSession}=await import(pathToFileURL(join(install,'dist/core/agent-session.js')));
 const root=mkdtempSync(join(tmpdir(),'pi-original-prompt-'));
 try {
  const agent=join(root,'agent'),skillDir=join(root,'.agents/skills/authored');mkdirSync(join(agent,'extensions'),{recursive:true});mkdirSync(skillDir,{recursive:true});
  const file=join(skillDir,'SKILL.md'),text='---\nname: authored\ndescription: Original Pi fixture\ndisable-model-invocation: true\n---\nOriginal manual skill body.\n';writeFileSync(file,text);
  writeFileSync(join(root,'skills-lock.json'),JSON.stringify({version:1,skills:{authored:{source:'fixture/repo'}}}));
  const loaded=loadSkillsFromDir({dir:join(root,'.agents/skills'),source:'fixture'}).skills;assert.equal(loaded.length,1);assert.equal(formatSkillsForPrompt(loaded),'');
  const entry=join(agent,'extensions/skills-space-visibility.mjs');copyFileSync('scripts/pi-visibility-extension.mjs',entry);let hook;(await import(pathToFileURL(entry))).default({on:(_,handler)=>{hook=handler;}});
  const policy=join(agent,'skills-space-visibility.json');
  for(const hidden of [false,true]) {
   writeFileSync(policy,JSON.stringify({version:1,hiddenSkills:[{file,name:'authored',hidden}]}));
   const event={systemPromptOptions:{skills:structuredClone(loaded)}};hook(event,{cwd:root,isProjectTrusted:()=>true});assert.equal(formatSkillsForPrompt(event.systemPromptOptions.skills).includes('<name>authored</name>'),!hidden);
   const expanded=AgentSession.prototype._expandSkillCommand.call({resourceLoader:{getSkills:()=>({skills:loaded})}},'/skill:authored supplied arguments');
   assert.match(expanded,/Original manual skill body\./);assert.match(expanded,/supplied arguments/);
  }
  rmSync(policy);const event={systemPromptOptions:{skills:structuredClone(loaded)}};hook(event,{cwd:root,isProjectTrusted:()=>true});assert.equal(formatSkillsForPrompt(event.systemPromptOptions.skills),'');
  assert.equal(loaded[0].disableModelInvocation,true);assert.equal(readFileSync(file,'utf8'),text);
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('runtime global managed override uses the isolated HOME lock and keeps unmanaged source defaults',()=>{
 const root=mkdtempSync(join(tmpdir(),'pi-global-override-'));
 try {
  const home=join(root,'home'),agent=join(home,'.pi/agent'),file=join(home,'.agents/skills/authored/SKILL.md'),nativeFile=join(agent,'skills/native/SKILL.md');
  mkdirSync(join(agent,'extensions'),{recursive:true});mkdirSync(join(home,'.agents/skills/authored'),{recursive:true});
  writeFileSync(join(home,'.agents/.skill-lock.json'),JSON.stringify({version:3,skills:{authored:{source:'fixture/repo'}}}));
  const entry=join(agent,'extensions/skills-space-visibility.mjs');copyFileSync('scripts/pi-visibility-extension.mjs',entry);
  writeFileSync(join(agent,'skills-space-visibility.json'),JSON.stringify({version:1,hiddenSkills:[{file,name:'authored',hidden:false},{file:nativeFile,name:'native',hidden:false}]}));
  const code=`import extension from ${JSON.stringify(pathToFileURL(entry).href)};let hook;extension({on:(_,handler)=>hook=handler});const event={systemPromptOptions:{skills:[{name:'authored',filePath:${JSON.stringify(file)},disableModelInvocation:true},{name:'native',filePath:${JSON.stringify(nativeFile)},disableModelInvocation:true}]}};hook(event,{cwd:${JSON.stringify(home)},isProjectTrusted:()=>false});process.stdout.write(JSON.stringify(event.systemPromptOptions.skills.map(s=>s.disableModelInvocation)));`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,HOME:home,USERPROFILE:home,XDG_STATE_HOME:''},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),[false,true]);
 } finally {rmSync(root,{recursive:true,force:true});}
});
