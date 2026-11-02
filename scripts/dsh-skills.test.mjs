import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const script = resolve("src-tauri/resources/upstream/inspect-dsh-skills.mjs");
// Qualification is explicit: no assumption about a developer's personal installation.
const testInstall=process.env.SKILLS_SPACE_DSH_TEST_INSTALL;
const desktopElectron=process.env.SKILLS_SPACE_DSH_TEST_DESKTOP;
const originalMinimalPatch=process.env.SKILLS_SPACE_DSH_TEST_MINIMAL_PATCH;
const configurationTest=(name,run)=>test(name,{skip:!testInstall?'Set SKILLS_SPACE_DSH_TEST_INSTALL to an original DSH package root':false},run);
const document = (name, extra = "") => `---\nname: ${name}\ndescription: Fixture\n${extra}---\nBody\n`;
async function fixture(run, withRuntime=true) {
  const home = await realpath(await mkdtemp(join(tmpdir(), "dsh-inspection-")));
  try {
    if(withRuntime&&testInstall){const manifest=JSON.parse(await readFile(join(testInstall,'package.json'),'utf8'));assert.equal(manifest.name,'@deepseek-ai/dsh');const bin=typeof manifest.bin==='string'?manifest.bin:manifest.bin.dsh;await mkdir(join(home,'.local/bin'),{recursive:true});await symlink(join(testInstall,bin),join(home,'.local/bin/dsh'));}
    await run(home);
  } finally { await rm(home, {recursive:true,force:true}); }
}
function entryPatch(body){if(body.startsWith('- insert:'))return body;return '- insert:\n'+body.split('\n').map(line=>'  '+line).join('\n').replace(/(^  - id: skill-filesystem\n)(?!    name:)/gm,"$1    name: '@deepseek-ai/dsh-skill-filesystem'\n");}
async function skill(path, content) { await mkdir(path,{recursive:true}); await writeFile(join(path,"SKILL.md"),content); }

test("DSH missing configuration reader reports one cause instead of declaring every bundle broken", async () => fixture(async home => {
  const runtime = join(home, "fake-cli"), bin = join(home, ".local/bin");
  await mkdir(join(runtime, "bin"), {recursive:true}); await mkdir(bin, {recursive:true});
  await writeFile(join(runtime, "package.json"), JSON.stringify({name:"@deepseek-ai/dsh",version:"0.2.1-rc.3"}));
  await writeFile(join(runtime, "bin/dsh"), "fixture; must never execute");
  await symlink(join(runtime, "bin/dsh"), join(bin, "dsh"));
  for (const name of ["desktop", "web"]) {
    const dir = join(home, ".dsh/profiles", name); await mkdir(dir, {recursive:true});
    await writeFile(join(dir, "package.json"), JSON.stringify({dsh:{profile:{bundles:["@fixture/one","@fixture/two"]}}}));
  }
  const result = spawnSync(process.execPath, [script,home,join(home,".dsh"),""], {encoding:"utf8",env:{HOME:home,USERPROFILE:home,PATH:bin}});
  assert.equal(result.status,0,result.stderr);
  const value=JSON.parse(result.stdout);
  assert.deepEqual(value.warnings,["DSH configuration reader is unavailable for this installation"]);
  assert.deepEqual(value.profiles,["web"]);assert.deepEqual(value.configurations,[]);assert.deepEqual(value.roots,[]);assert.deepEqual(value.skills,[]);assert.equal(value.installIssue,null);
  assert.equal(value.writableVersion,false);
},false));

test("DSH desktop ASAR reader resolves real API with isolated profiles and names genuine bundle failures", {skip: !desktopElectron||!existsSync(desktopElectron)}, async () => fixture(async home => {
  const dir=join(home,".dsh/profiles/desktop"); await mkdir(dir,{recursive:true});
  const names=["@fixture/good","@fixture/missing","@fixture/incompatible","@fixture/unreadable","@fixture/bad-manifest"];
  await writeFile(join(dir,"package.json"),JSON.stringify({dsh:{profile:{bundles:names}}}));
  for(const name of names.filter(name=>name!=="@fixture/missing")) {
    const pkg=join(dir,"node_modules",name); await mkdir(pkg,{recursive:true});
    await writeFile(join(pkg,"package.json"),name.endsWith("bad-manifest")?"{invalid":JSON.stringify({name,version:"1.0.0",...(name.endsWith("incompatible")?{engines:{dsh:">=99.0.0"}}:{}),dsh:{bundle:{patch:["skills.yml"]}}}));
    if(name.endsWith("good")) await writeFile(join(pkg,"skills.yml"),"- insert:\n  - id: fixture-skills\n    name: '@deepseek-ai/dsh-skill-filesystem'\n    config:\n      customSkillDirs: []\n      secret: must-not-disclose\n      watch: !!js 'throw new Error(\"must not execute\")'\n");
  }
  const result=spawnSync(desktopElectron,["--expose-internals",script,home,join(home,".dsh"),""],{encoding:"utf8",env:{HOME:home,USERPROFILE:home,PATH:"/usr/bin:/bin",ELECTRON_RUN_AS_NODE:"1"}});
  assert.equal(result.status,0,result.stderr);
  const value=JSON.parse(result.stdout);
  assert.match(value.runtimeVersion,/^\d+\.\d+/);
  assert.equal(value.writableVersion,true);
  assert.equal(value.configurations.length,1);
  assert.equal(value.configurations[0].editable,false);
  assert.equal(value.configurations[0].resolved,false);
  assert.equal(value.warnings.length,4);
  assert.ok(value.warnings.includes(`DSH ${join(dir,"package.json")}: bundle @fixture/missing could not be resolved`));
  assert.ok(value.warnings.includes(`DSH ${join(dir,"package.json")}: bundle @fixture/unreadable configuration could not be read`));
  assert.ok(value.warnings.includes(`DSH ${join(dir,"package.json")}: bundle @fixture/bad-manifest configuration could not be read`));
  assert.ok(value.warnings.some(warning=>warning.startsWith(`DSH ${join(dir,"package.json")}: bundle @fixture/incompatible is incompatible with runtime `)));
  assert.ok(!result.stdout.includes("must-not-disclose"));
},false));
function inspect(home, project = "", documents) {
  const env = {...process.env, HOME:home, USERPROFILE:home}; delete env.DSH_AGENTS_HOME;
  const result = spawnSync(process.execPath,[script,home,join(home,".dsh"),project,...(documents ? ["validate",JSON.stringify(documents)] : [])],{encoding:"utf8",env});
  assert.equal(result.status,0,result.stderr);
  return JSON.parse(result.stdout);
}
test("DSH accepts single-level bundles, flat files and symlinks, reports invalid documents without writes",async()=>fixture(async home=>{
  const root=join(home,".agents/skills");
  await skill(join(root,"shared"),document("shared"));
  await skill(join(root,"group/nested"),document("nested"));
  await skill(join(root,"invalid"),document("bad_name"));
  await writeFile(join(root,"flat.md"),document("flat","disable-model-invocation: true\n"));
  const external=join(home,"external"); await skill(external,document("linked"));
  await symlink(external,join(root,"linked"));
  const before=await readFile(join(root,"shared/SKILL.md"));
  const value=inspect(home);
  assert.deepEqual(value.skills.map(row=>row.name).sort(),["bad_name","flat","linked","shared"]);
  assert.equal(value.skills.find(row=>row.name==="flat").modelInvocable,false);
  assert.equal(value.skills.find(row=>row.name==="flat").cliAddressable,false);
  assert.equal(value.skills.find(row=>row.name==="shared").cliAddressable,true);
  assert.match(value.skills.find(row=>row.name==="bad_name").reason,/Invalid DSH/);
  assert.deepEqual(await readFile(join(root,"shared/SKILL.md")),before);
}));
test("DSH project roots and same-name precedence retain scope isolation",async()=>fixture(async home=>{
  const project=join(home,"repo"); await mkdir(join(project,".git"),{recursive:true}); await mkdir(join(project,"child"));
  await skill(join(project,".dsh/skills/review"),document("review"));
  await skill(join(project,".agents/skills/review"),document("review"));
  await skill(join(home,".agents/skills/review"),document("review"));
  await skill(join(home,".dsh/skills/review"),document("review"));
  const global=inspect(home);
  assert.equal(global.skills.find(row=>row.source==="user-dsh").shadowed,false);
  assert.equal(global.skills.find(row=>row.source==="user-agents").shadowed,true);
  const value=inspect(home,join(project,"child"));
  assert.equal(value.projectRoot,project); assert.match(value.installIssue,/Git root/);
  assert.equal(value.skills.find(row=>row.source==="project-dsh").shadowed,false);
  assert.equal(value.skills.find(row=>row.source==="project-agents").shadowed,true);
  assert.equal(value.skills.find(row=>row.source==="user-agents").inScope,false);
}));
configurationTest("DSH configuration inspection keeps declarations scoped and does not evaluate code or disclose secrets",async()=>fixture(async home=>{
  const profile=join(home,".dsh/profiles/web");await mkdir(profile,{recursive:true});
  const file=join(profile,"cordis.patch.yml");
  const raw=`- id: preset-standard\n  name: '@deepseek-ai/dsh-agent-preset'\n  config:\n    id: standard\n    plugins:\n      - id: skill-filesystem\n        name: '@deepseek-ai/dsh-skill-filesystem'\n        config:\n          customSkillDirs: [!!js 'throw new Error("never execute")']\n- id: unrelated\n  config:\n    secret: should-not-appear\n`;
  await writeFile(join(profile,"package.json"),JSON.stringify({dsh:{profile:{bundles:[]}}}));
  const original=entryPatch(raw);await writeFile(file,original);
  const value=inspect(home);
  assert.deepEqual(value.profiles,["web"]);
  assert.equal(value.configurations[0].preset,"standard");assert.equal(value.configurations[0].dynamic,true);assert.ok(value.configurations[0].unresolvedFields.includes('customSkillDirs'));
  assert.equal(value.installIssue,null);
  assert.ok(!JSON.stringify(value).includes("should-not-appear"));
  assert.equal(await readFile(file,"utf8"),original);
}));
test("DSH source preflight rejects invalid YAML, names and invocation values",async()=>fixture(async home=>{
  const {metadata}=await import('../src-tauri/resources/upstream/inspect-dsh-skills.mjs');
  for(const model of [true,false])for(const user of [true,false]){
    const value=metadata(document('source',`disable-model-invocation: ${!model}\nuser-invocable: ${user}\n`).replaceAll('\n','\r\n'));
    assert.equal(value.modelInvocable,model);assert.equal(value.userInvocable,user);
  }
  const cases=[document("valid").replaceAll('\n','\r\n'),document("bad_name"),document("name","user-invocable: maybe\n"),document("array","user-invocable: [true]\n"),'---\nname: test\ndescription: Invalid: mapping\n---\n'];
  const result=inspect(home,"",cases.map((content,index)=>({name:String(index),content})));
  assert.equal(result[0].error,null);assert.ok(result.slice(1).every(row=>row.error));
}));

test('DSH declared skill versions preserve metadata priority and numeric spelling without changing discovery or files',async()=>fixture(async home=>{
  const {metadata}=await import('../src-tauri/resources/upstream/inspect-dsh-skills.mjs');
  const cases=[
    ['metadata:\n  version: " 2.3.4 "\nversion: "fallback"\n','2.3.4'],
    ['version: " 3.2.1 "\n','3.2.1'],
    ['metadata:\n  version: 1.0\nversion: 2.0\n','1.0'],
    ['version: 1.0\n','1.0'],
    ['declaredVersion: &declared 1.0\nmetadata:\n  version: *declared\n','1.0'],
    ['shared: &shared {version: 1.0}\nmetadata: *shared\n','1.0'],
    ['declaredVersion: &declared 1.0\nversion: *declared\n','1.0'],
    ['',null],
    ['metadata:\n  version: false\nversion: "fallback"\n','fallback'],
    ['metadata: false\nversion: "fallback"\n','fallback'],
    ['metadata:\n  version: [1, 2]\nversion: {major: 1}\n',null],
    ['version: true\n',null],
    ['version: null\n',null],
    ['version: "   "\n',null],
    ['version: .inf\n',null],
    ['version: .nan\n',null],
  ];
  const root=join(home,'.agents/skills'),before=[];
  for(const [index,[version,expected]]of cases.entries()){
    const name=`version-case-${index}`,raw=document(name,version+'disable-model-invocation: true\nuser-invocable: false\n');
    const parsed=metadata(raw);assert.equal(parsed.version,expected);assert.equal(parsed.name,name);assert.equal(parsed.modelInvocable,false);assert.equal(parsed.userInvocable,false);
    const file=join(root,`${name}.md`);await mkdir(root,{recursive:true});await writeFile(file,raw);before.push([file,raw,name,expected]);
  }
  const snapshot=inspect(home);assert.equal(snapshot.skills.length,cases.length);
  for(const [file,raw,name,expected]of before){const row=snapshot.skills.find(row=>row.name===name);assert.ok(row);assert.equal(row.reason,null);assert.equal(row.version,expected);assert.equal(row.modelInvocable,false);assert.equal(row.userInvocable,false);assert.equal(await readFile(file,'utf8'),raw);}
}));

const options={runtimeVersion:'0.2.0-rc.2'};
async function modules(){return Promise.all([import('../src-tauri/resources/upstream/inspect-dsh-skills.mjs'),import('../src-tauri/resources/upstream/prepare-dsh-change.mjs')]);}
test('DSH default skill context prefers real presets and remembers Host providers only as internal inventory contexts',async()=>{
  const [{selectSkillConfiguration}]=await modules();
  const host={key:'host',path:'/one/cordis.patch.yml',profile:'web',installation:'cli',preset:null,disabled:false};
  const invalid={...host,key:'invalid',preset:' \t'};
  const standard={...host,key:'standard',preset:'standard'};
  const literal={...host,key:'literal',preset:'null'};
  const elsewhere={...standard,key:'elsewhere',path:'/two/cordis.patch.yml'};
  const rows=[host,invalid,standard,literal,elsewhere];
  assert.equal(selectSkillConfiguration(rows,null,'cli'),standard,'A Host entry appearing first is not the default Agent preset');
  assert.equal(selectSkillConfiguration(rows,host.key,'cli'),standard,'Remembered Host context redirects within its own file');
  assert.equal(selectSkillConfiguration(rows,literal.key,'cli'),literal);
  assert.equal(selectSkillConfiguration([host,elsewhere],host.key,'cli'),host,'A Host-only file still supports internal inventory without crossing to another Profile');
  assert.equal(selectSkillConfiguration([host],null,'cli'),host,'Raw Host-only inventory remains available independently of Agent preset selection');
  assert.equal(selectSkillConfiguration(rows,'removed','cli'),null);
  const invalidChild={...host,key:'invalid-child',parentPreset:true};
  assert.equal(selectSkillConfiguration([invalidChild],null,'cli'),null,'A provider inside an invalid preset is not a Host inventory fallback');
  assert.equal(selectSkillConfiguration([invalidChild],invalidChild.key,'cli'),null,'Remembering an invalid child key must not turn it into a Host provider');
});
async function profile(home,name,body,manifest={dsh:{profile:{bundles:[]}}}){
  const path=join(home,'.dsh/profiles',name);await mkdir(path,{recursive:true});
  await writeFile(join(path,'package.json'),JSON.stringify(manifest));await writeFile(join(path,'cordis.patch.yml'),entryPatch(body));return path;
}
const config=directory=>entryPatch(`# preserved\n- id: skill-filesystem\n  name: '@deepseek-ai/dsh-skill-filesystem'\n  config:\n    customSkillDirs: [${JSON.stringify(directory)}]\n    secret: keep-this-value\n    watch: true # keep-comment\n`);
configurationTest('DSH selected contexts isolate roots and same-name precedence; no cross-profile winner',async()=>fixture(async home=>{
  const [{inspectDsh}]=await modules(),a=join(home,'a'),b=join(home,'b');
  await skill(join(a,'same'),document('same','disable-model-invocation: true\nuser-invocable: false\n'));await skill(join(b,'same'),document('same'));
  await profile(home,'a',config(a));await profile(home,'b',config(b));
  const neutral=await inspectDsh(home,join(home,'.dsh'),null,options);assert.equal(neutral.skills.length,1);assert.equal(neutral.contextKey,neutral.configurations[0].key);
  assert.equal(neutral.configurations.length,2);assert.ok(neutral.configurations.every(row=>row.editable));
  for(const row of neutral.configurations){const selected=await inspectDsh(home,join(home,'.dsh'),null,{...options,contextKey:row.key});assert.equal(selected.skills.length,1);assert.equal(selected.skills[0].shadowed,false);assert.equal(selected.skills[0].canSetInvocation,true);assert.equal(selected.skills[0].path,await realpath(join(home,row.profile,'same')));}
}));
configurationTest('DSH configuration preparation preserves unrelated fields and rejects stale writes and keeps dynamic fields while accepting verified new versions',async()=>fixture(async home=>{
  const [{inspectDsh},{prepareConfiguration}]=await modules(),root=join(home,'extra');
  const path=await profile(home,'web',config(root));const original=await readFile(join(path,'cordis.patch.yml'),'utf8');
  const snapshot=await inspectDsh(home,join(home,'.dsh'),null,options),row=snapshot.configurations[0];
  const request={key:row.key,revision:snapshot.revision,customSkillDirs:[join(home,'new')],includeDefaultRoots:false,watch:false};
  const prepared=await prepareConfiguration(home,join(home,'.dsh'),null,request,options);
  assert.match(prepared.after,/# preserved/);assert.match(prepared.after,/secret: keep-this-value/);assert.match(prepared.after,/false # keep-comment/);assert.equal(await readFile(join(path,'cordis.patch.yml'),'utf8'),original);
  await assert.rejects(prepareConfiguration(home,join(home,'.dsh'),null,{...request,revision:'stale'},options));
  const newer=await prepareConfiguration(home,join(home,'.dsh'),null,request,{runtimeVersion:'99.0.0'});assert.match(newer.after,/watch: false/); // Same verified installed schema/composition contract; version is not an all-page gate.
  await writeFile(join(path,'package.json'),JSON.stringify({dsh:{profile:{bundles:['bundle']}}}));assert.equal((await inspectDsh(home,join(home,'.dsh'),null,options)).configurations[0].readOnlyReason,'incomplete-bundles');
  await writeFile(join(path,'package.json'),JSON.stringify({dsh:{profile:{bundles:[]}}}));
  await writeFile(join(path,'cordis.patch.yml'),original.replace('watch: true','watch: !!js throw-never-execute'));const dynamic=await inspectDsh(home,join(home,'.dsh'),null,options);assert.equal(dynamic.configurations[0].editable,true);assert.deepEqual(dynamic.configurations[0].unresolvedFields,['watch']);assert.equal(dynamic.configurations[0].watch,null);
}));
configurationTest('DSH home overlay, duplicate provider, disabled defaults and linked configuration stay bounded',async()=>fixture(async home=>{
  const [{inspectDsh}]=await modules(),root=join(home,'extra');const path=await profile(home,'web',config(root));
  await writeFile(join(home,'.dsh/cordis.patch.yml'),'- id: overlay\n  config: {}\n');let snapshot=await inspectDsh(home,join(home,'.dsh'),null,options);assert.equal(snapshot.configurations[0].readOnlyReason,null);
  await rm(join(home,'.dsh/cordis.patch.yml'));await writeFile(join(path,'cordis.patch.yml'),config(root).replace('watch: true','includeDefaultRoots: false\n      watch: true'));
  snapshot=await inspectDsh(home,join(home,'.dsh'),null,options);const selected=await inspectDsh(home,join(home,'.dsh'),null,{...options,contextKey:snapshot.configurations[0].key});assert.deepEqual(selected.roots.map(root=>root.source),['custom']);assert.equal(selected.installIssue,null);
  await writeFile(join(path,'cordis.patch.yml'),entryPatch('- id: skill-filesystem\n- id: skill-filesystem\n'));snapshot=await inspectDsh(home,join(home,'.dsh'),null,options);assert.ok(snapshot.configurations.every(row=>row.readOnlyReason==='ambiguous'));
  const elsewhere=join(home,'external.yml');await writeFile(elsewhere,config(root));await rm(join(path,'cordis.patch.yml'));await symlink(elsewhere,join(path,'cordis.patch.yml'));assert.equal((await inspectDsh(home,join(home,'.dsh'),null,options)).configurations[0].readOnlyReason,'linked-configuration');
}));

configurationTest('DSH YAML anchors and merges remain read-only instead of rewriting other consumers',async()=>fixture(async home=>{
  const [{inspectDsh},{prepareConfiguration}]=await modules();await profile(home,'web','- id: skill-filesystem\n  config:\n    watch: &shared true\n    unrelated: *shared\n');const snapshot=await inspectDsh(home,join(home,'.dsh'),null,options);assert.equal(snapshot.configurations[0].readOnlyReason,'complex-yaml');await assert.rejects(prepareConfiguration(home,join(home,'.dsh'),null,{key:snapshot.configurations[0].key,revision:snapshot.revision,customSkillDirs:[],watch:false,includeDefaultRoots:true},options));
}));

configurationTest('DSH discovered scope roots match candidates for global, project, custom and disabled defaults',async()=>fixture(async home=>{
  const [{inspectDsh}]=await modules();
  const project=join(home,'repo'),custom=join(home,'extra');
  await mkdir(join(project,'.git'),{recursive:true});
  await skill(join(home,'.dsh/skills/global-native'),document('global-native'));
  await skill(join(home,'.agents/skills/global-shared'),document('global-shared'));
  await skill(join(project,'.dsh/skills/project-native'),document('project-native'));
  await skill(join(project,'.agents/skills/project-shared'),document('project-shared'));
  await skill(join(custom,'extra-native'),document('extra-native'));
  const own=await profile(home,'web',config(custom));
  const global=await inspectDsh(home,join(home,'.dsh'),null,options);
  assert.deepEqual(global.roots.filter(r=>r.inScope).map(r=>r.path),[custom,join(home,'.dsh/skills'),join(home,'.agents/skills')]);
  assert.ok(global.roots.every(r=>r.exists));
  assert.deepEqual(global.skills.filter(s=>s.inScope).map(s=>s.name),['extra-native','global-native','global-shared']);
  const scoped=await inspectDsh(home,join(home,'.dsh'),project,options);
  assert.deepEqual(scoped.roots.filter(r=>r.inScope).map(r=>r.path),[join(project,'.dsh/skills'),join(project,'.agents/skills'),custom]);
  assert.deepEqual(scoped.skills.filter(s=>s.inScope).map(s=>s.name),['project-native','project-shared','extra-native']);
  const key=global.configurations[0].key;
  const selected=await inspectDsh(home,join(home,'.dsh'),project,{...options,contextKey:key});
  assert.ok(selected.roots.some(r=>r.source==='custom'&&r.inScope));
  assert.ok(selected.skills.some(s=>s.name==='extra-native'&&s.inScope));
  await writeFile(join(own,'cordis.patch.yml'),config(custom).replace('watch: true','includeDefaultRoots: false\n      watch: true'));
  for(const scope of [null,project]){
    const disabled=await inspectDsh(home,join(home,'.dsh'),scope,{...options,contextKey:key});
    assert.deepEqual(disabled.roots.map(r=>r.path),[custom]);
    assert.deepEqual(disabled.skills.filter(s=>s.inScope).map(s=>s.name),['extra-native']);
  }
  await writeFile(join(own,'cordis.patch.yml'),config(custom).replace(`customSkillDirs: [${JSON.stringify(custom)}]`,`customSkillDirs: []\n      includeDefaultRoots: false\n      dshHome: ${JSON.stringify(home)}`));
  const empty=await inspectDsh(home,join(home,'.dsh'),project,{...options,contextKey:key});
  assert.deepEqual(empty.roots,[]);assert.deepEqual(empty.skills,[]);
  const stale=await inspectDsh(home,join(home,'.dsh'),project,{...options,contextKey:'removed-context'});
  assert.deepEqual(stale.roots,[]);assert.deepEqual(stale.skills,[]);assert.ok(stale.contextIssue);
}));

async function bundledProfile(home,name,body,patch='[]\n'){
  const path=await profile(home,name,'- insert: []\n',{dsh:{profile:{bundles:['@fixture/skills-layer']}}});
  const bundle=join(path,'node_modules/@fixture/skills-layer');await mkdir(bundle,{recursive:true});
  await writeFile(join(bundle,'package.json'),JSON.stringify({name:'@fixture/skills-layer',version:'1.0.0',dsh:{bundle:{patch:['first.yml','second.yml']}}}));
  await writeFile(join(bundle,'first.yml'),body);await writeFile(join(bundle,'second.yml'),'[]\n');
  if(patch===null)await rm(join(path,'cordis.patch.yml'));else await writeFile(join(path,'cordis.patch.yml'),patch);
  return {path,bundle};
}
test('DSH full declarations include the unmodified official minimal preset without a filesystem provider',{skip:!testInstall||!originalMinimalPatch||!existsSync(originalMinimalPatch)?'Set original DSH runtime and SKILLS_SPACE_DSH_TEST_MINIMAL_PATCH to an official minimal.patch.yml':false},async()=>fixture(async home=>{
  const [{inspectDsh}]=await modules();
  const {yamlDocument}=await import('../src-tauri/resources/upstream/dsh-configuration.mjs');
  const original=await readFile(originalMinimalPatch,'utf8');
  const official=yamlDocument(original).toJS();
  const minimalDeclaration=official.flatMap(patch=>patch.insert??[]).find(row=>row.name==='@deepseek-ai/dsh-agent-preset'&&row.config?.id==='minimal');
  assert.ok(minimalDeclaration,'Use an actual official minimal declaration, not a synthesized id');
  assert.ok(!JSON.stringify(minimalDeclaration).includes('@deepseek-ai/dsh-skill-filesystem'),'Do not inject a filesystem provider into minimal');
  const hostRoot=join(home,'host-native'),presetRoot=join(home,'standard-native');
  await skill(join(hostRoot,'host-skill'),document('host-skill'));await skill(join(presetRoot,'standard-skill'),document('standard-skill'));
  const extra=`
- insert:
  - id: host-skills
    name: '@deepseek-ai/dsh-skill-filesystem'
    config: {includeDefaultRoots: false, customSkillDirs: [${JSON.stringify(hostRoot)}]}
  - id: preset-standard
    name: '@deepseek-ai/dsh-agent-preset'
    config:
      id: standard
      order: 1
      plugins:
        - id: filesystem-primary
          name: '@deepseek-ai/dsh-skill-filesystem'
          config: {includeDefaultRoots: false, customSkillDirs: [${JSON.stringify(presetRoot)}]}
        - id: filesystem-secondary
          name: '@deepseek-ai/dsh-skill-filesystem'
          config: {providerName: secondary, includeDefaultRoots: false, customSkillDirs: []}
  - id: preset-zeta
    name: '@deepseek-ai/dsh-agent-preset'
    config: {id: zeta, name: Custom Zeta, description: No directory provider, order: 2, plugins: []}
  - id: preset-alpha
    name: '@deepseek-ai/dsh-agent-preset'
    config: {id: alpha, name: Custom Alpha, description: Another tool-only preset, order: 2, plugins: []}
  - id: preset-literal-null
    name: '@deepseek-ai/dsh-agent-preset'
    config: {id: 'null', order: 5, plugins: []}
  - id: invalid-missing-id
    name: '@deepseek-ai/dsh-agent-preset'
    config: {plugins: []}
  - id: invalid-blank-id
    name: '@deepseek-ai/dsh-agent-preset'
    config: {id: '  ', plugins: []}
`;
  const {path,bundle}=await bundledProfile(home,'web',original+extra);const patch=join(path,'cordis.patch.yml'),layer=join(bundle,'first.yml');
  const before=await Promise.all([patch,layer].map(file=>readFile(file)));
  const snapshot=await inspectDsh(home,join(home,'.dsh'),null,options);
  assert.deepEqual(snapshot.presets.map(row=>row.preset),['standard','alpha','zeta','minimal','null'],'Use upstream order field and ID tie-break, independent of provider presence');
  assert.ok(snapshot.presets.every(row=>row.preset&&row.preset.trim()));
  const minimal=snapshot.presets.find(row=>row.preset==='minimal'),alpha=snapshot.presets.find(row=>row.preset==='alpha'),standard=snapshot.presets.find(row=>row.preset==='standard');
  assert.equal(minimal.order,minimalDeclaration.config.order);assert.equal(minimal.directoryStatus,'none');assert.deepEqual(minimal.configurationKeys,[]);
  assert.equal(alpha.presetName,'Custom Alpha');assert.equal(alpha.presetDescription,'Another tool-only preset');assert.equal(alpha.directoryStatus,'none');
  assert.equal(standard.directoryStatus,'available');assert.equal(standard.configurationKeys.length,2);
  assert.ok(snapshot.configurations.filter(row=>row.preset==='standard').every(row=>row.presetKey===standard.key));
  assert.ok(snapshot.configurations.every(row=>row.preset!=='minimal'),'Minimal has no fabricated directory configuration');
  for(const preset of [minimal,alpha,snapshot.presets.find(row=>row.preset==='null')]){
    const selected=await inspectDsh(home,join(home,'.dsh'),null,{...options,contextKey:preset.key});
    assert.equal(selected.contextKey,preset.key);assert.equal(selected.presetKey,preset.key);assert.equal(selected.contextIssue,null);assert.equal(selected.configurationPath,patch);assert.deepEqual(selected.roots,[]);assert.deepEqual(selected.skills,[]);
  }
  for(const key of standard.configurationKeys){
    const legacy=await inspectDsh(home,join(home,'.dsh'),null,{...options,contextKey:key});
    assert.equal(legacy.contextKey,key,'Keep the actual legacy provider selection');assert.equal(legacy.presetKey,standard.key);
  }
  assert.deepEqual(await Promise.all([patch,layer].map(file=>readFile(file))),before);
  assert.equal(await readFile(originalMinimalPatch,'utf8'),original,'The official minimal source itself remains unchanged');
}));
configurationTest('DSH no-provider and opaque declarations stay selected without inheriting Host inventory',async()=>fixture(async home=>{
  const [{inspectDsh}]=await modules();const hostRoot=join(home,'host-native');await skill(join(hostRoot,'host-skill'),document('host-skill'));
  const path=await profile(home,'web',`- insert:
  - id: host-skills
    name: '@deepseek-ai/dsh-skill-filesystem'
    config: {includeDefaultRoots: false, customSkillDirs: [${JSON.stringify(hostRoot)}]}
  - id: preset-empty
    name: '@deepseek-ai/dsh-agent-preset'
    config: {id: empty-tools, name: Empty tools, order: 1, plugins: []}
  - id: preset-opaque
    name: '@deepseek-ai/dsh-agent-preset'
    config:
      id: opaque-tools
      order: 2
      plugins: !!js 'throw new Error("must not evaluate preset plugins")'
`);
  const patch=join(path,'cordis.patch.yml'),before=await readFile(patch);
  const snapshot=await inspectDsh(home,join(home,'.dsh'),null,options);
  assert.equal(snapshot.presets.length,2);assert.equal(snapshot.configurations.length,1,'The real Host row remains available as raw configuration');
  const empty=snapshot.presets.find(row=>row.preset==='empty-tools'),opaque=snapshot.presets.find(row=>row.preset==='opaque-tools');
  assert.equal(snapshot.contextKey,empty.key,'The default management target can be a declaration with no directory provider');
  assert.equal(empty.directoryStatus,'none');assert.equal(opaque.directoryStatus,'unknown');
  for(const preset of [empty,opaque]){
    const readback=await inspectDsh(home,join(home,'.dsh'),null,{...options,contextKey:preset.key});
    assert.equal(readback.contextKey,preset.key);assert.equal(readback.contextIssue,null);assert.equal(readback.presetKey,preset.key);assert.deepEqual(readback.roots,[]);assert.deepEqual(readback.skills,[]);
  }
  assert.deepEqual(await readFile(patch),before);
}));
configurationTest('DSH real preset defaults and file discovery retain Host rows and empty Profile bytes',async()=>fixture(async home=>{
  const [{inspectDsh}]=await modules();
  const root=join(home,'host-native'),real=join(home,'preset-native');
  await skill(join(root,'host-skill'),document('host-skill'));await skill(join(real,'preset-skill'),document('preset-skill'));
  const body=`- insert:
  - id: host-skills
    name: '@deepseek-ai/dsh-skill-filesystem'
    config: {includeDefaultRoots: false, customSkillDirs: [${JSON.stringify(root)}]}
  - id: preset-standard
    name: '@deepseek-ai/dsh-agent-preset'
    config:
      id: standard
      plugins:
        - id: skill-filesystem
          name: '@deepseek-ai/dsh-skill-filesystem'
          config: {includeDefaultRoots: false, customSkillDirs: [${JSON.stringify(real)}]}
`;
  const web=await profile(home,'web',body);
  const only=await profile(home,'host-only',config(root));
  const empty=await profile(home,'without-provider','- insert: []\n');
  const missing=await profile(home,'no-patch','- insert: []\n');await rm(join(missing,'cordis.patch.yml'));
  const before=await Promise.all([web,only,empty].map(dir=>readFile(join(dir,'cordis.patch.yml'))));
  const snapshot=await inspectDsh(home,join(home,'.dsh'),null,options);
  const host=snapshot.configurations.find(row=>row.path===join(web,'cordis.patch.yml')&&row.preset===null);
  const preset=snapshot.configurations.find(row=>row.path===join(web,'cordis.patch.yml')&&row.preset==='standard');
  assert.ok(host);assert.ok(preset);assert.equal(snapshot.contextKey,preset.key);assert.equal(snapshot.configurationPath,preset.path);
  assert.deepEqual(snapshot.skills.map(row=>row.name),['preset-skill']);
  const remembered=await inspectDsh(home,join(home,'.dsh'),null,{...options,contextKey:host.key});
  assert.equal(remembered.contextKey,preset.key);assert.deepEqual(remembered.skills.map(row=>row.name),['preset-skill']);
  const rootOnly=snapshot.configurations.find(row=>row.path===join(only,'cordis.patch.yml'));
  const internal=await inspectDsh(home,join(home,'.dsh'),null,{...options,contextKey:rootOnly.key});
  assert.equal(internal.contextKey,rootOnly.key);assert.deepEqual(internal.skills.map(row=>row.name),['host-skill']);
  assert.deepEqual(snapshot.configurationFiles.map(row=>({profile:row.profile,exists:row.exists})),[{profile:'host-only',exists:true},{profile:'no-patch',exists:false},{profile:'web',exists:true},{profile:'without-provider',exists:true}]);
  assert.ok(!snapshot.configurations.some(row=>row.path===join(empty,'cordis.patch.yml')));
  assert.deepEqual(await Promise.all([web,only,empty].map(dir=>readFile(join(dir,'cordis.patch.yml')))),before);
  assert.equal(existsSync(join(missing,'cordis.patch.yml')),false,'Read-only file discovery must not create a missing patch');
}));
configurationTest('DSH preset declarations without a real config id never inherit a plugin entry id',async()=>fixture(async home=>{
  const [{inspectDsh}]=await modules();
  const provider="        - id: skill-filesystem\n          name: '@deepseek-ai/dsh-skill-filesystem'\n          config: {watch: false}\n";
  const body='- insert:\n'+[['missing',null],['blank',"''"],['whitespace',"'   '"],['literal',"'null'"]].map(([entry,id])=>`  - id: preset-${entry}\n    name: '@deepseek-ai/dsh-agent-preset'\n    config:\n${id===null?'':`      id: ${id}\n`}      plugins:\n${provider}`).join('');
  const web=await profile(home,'web',body);const file=join(web,'cordis.patch.yml'),before=await readFile(file);
  const snapshot=await inspectDsh(home,join(home,'.dsh'),null,options);
  assert.equal(snapshot.configurations.length,4);
  assert.deepEqual(snapshot.configurations.map(row=>row.preset),[null,null,null,'null']);
  assert.ok(snapshot.configurations.every(row=>row.parentPreset));
  assert.equal(snapshot.configurations.find(row=>row.key===snapshot.contextKey).preset,'null');
  assert.deepEqual(await readFile(file),before);
}));
test('DSH Desktop bundled CLI discovers web custom and no-provider Profiles without a standalone npm runtime',{skip:!desktopElectron||!existsSync(desktopElectron)?'Set SKILLS_SPACE_DSH_TEST_DESKTOP to an original Desktop Electron executable':false},async()=>fixture(async home=>{
  for(const name of ['desktop','web','custom'])await profile(home,name,"- insert:\n  - id: preset-standard\n    name: '@deepseek-ai/dsh-agent-preset'\n    config:\n      id: standard\n      plugins:\n        - id: skill-filesystem\n          name: '@deepseek-ai/dsh-skill-filesystem'\n          config: {watch: false}\n");
  await profile(home,'without-provider','- insert: []\n');
  const before=await Promise.all(['desktop','web','custom','without-provider'].map(name=>readFile(join(home,'.dsh/profiles',name,'cordis.patch.yml'))));
  const moduleUrl=pathToFileURL(resolve('src-tauri/resources/upstream/dsh-configuration.mjs')).href;
  const source=`import {installedRuntime,readConfiguration} from ${JSON.stringify(moduleUrl)};const home=${JSON.stringify(home)};const runtime=await installedRuntime(home,'cli');const value=await readConfiguration(home,home+'/.dsh');console.log(JSON.stringify({runtime,profiles:value.profiles,files:value.configurationFiles,configurations:value.configurations.map(row=>({profile:row.profile,preset:row.preset})),warnings:value.warnings}));`;
  const result=spawnSync(desktopElectron,['--expose-internals','--input-type=module','--eval',source],{encoding:'utf8',env:{HOME:home,USERPROFILE:home,PATH:'/usr/bin:/bin',ELECTRON_RUN_AS_NODE:'1'}});
  assert.equal(result.status,0,result.stderr);const value=JSON.parse(result.stdout);
  assert.match(value.runtime.anchor,/\.app\/Contents\/Resources\/app\.asar\/dsh\/node_modules\/@deepseek-ai\/dsh\/package\.json$/,'This case must use Desktop bundled runtime, not a fixture/npm installation');
  assert.equal(value.runtime.installation,'cli');assert.deepEqual(value.profiles.sort(),['custom','desktop','web','without-provider']);
  assert.deepEqual(value.files.map(file=>file.profile).sort(),['custom','desktop','web','without-provider']);
  assert.deepEqual(value.configurations.map(row=>row.profile).sort(),['custom','desktop','web']);assert.deepEqual(value.warnings,[]);
  assert.equal(existsSync(join(home,'.local/bin/dsh')),false,'No standalone npm CLI was installed into this scenario');
  assert.deepEqual(await Promise.all(['desktop','web','custom','without-provider'].map(name=>readFile(join(home,'.dsh/profiles',name,'cordis.patch.yml')))),before);
},false));
configurationTest('DSH preset metadata comes from its effective owner without evaluating expressions or confusing root and literal null',async()=>fixture(async home=>{
  const [{inspectDsh}]=await modules();
  const provider="        - id: skill-filesystem\n          name: '@deepseek-ai/dsh-skill-filesystem'\n          config: {watch: true}\n";
  await bundledProfile(home,'web',"- insert:\n  - id: custom-standard\n    name: '@deepseek-ai/dsh-agent-preset'\n    config:\n      id: standard\n      name: My own standard\n      description: Published custom purpose\n      plugins:\n"+provider+"  - id: literal-null\n    name: '@deepseek-ai/dsh-agent-preset'\n    config:\n      id: 'null'\n      name: !!js neverEvaluate()\n      description: Literal null preset\n      plugins:\n"+provider+"  - id: root-provider\n    name: '@deepseek-ai/dsh-skill-filesystem'\n    config: {watch: true, name: Not a preset name}\n");
  const snapshot=await inspectDsh(home,join(home,'.dsh'),null,options);
  const custom=snapshot.configurations.find(row=>row.preset==='standard');
  assert.equal(custom.presetName,'My own standard');assert.equal(custom.presetDescription,'Published custom purpose');
  const literal=snapshot.configurations.find(row=>row.preset==='null');
  assert.equal(literal.presetName,undefined);assert.equal(literal.presetDescription,'Literal null preset');
  const root=snapshot.configurations.find(row=>row.preset===null);
  assert.ok(root);assert.equal(root.presetName,undefined);assert.equal(root.presetDescription,undefined);
  assert.equal(new Set(snapshot.configurations.map(row=>row.key)).size,3);
}));
const providerBundle=`- insert:
  - id: arbitrary-reader
    name: '@deepseek-ai/dsh-skill-filesystem'
    config:
      providerName: native-local
      watch: true
      watchMaxProjects: 23
      unknown: preserve-me
  - id: unrelated-service
    name: '@fixture/unrelated'
    disabled: !!js process.env.DO_NOT_EVALUATE
    config:
      secret: do-not-disclose
`;
configurationTest('DSH bundle composition creates missing Profile override, saves all settings and restores current inheritance',async()=>fixture(async home=>{
  const [{inspectDsh},{prepareConfiguration}]=await modules();
  const {path,bundle}=await bundledProfile(home,'generic',providerBundle,null);
  await mkdir(join(home,'.dsh/profiles/node_modules'),{recursive:true});
  let value=await inspectDsh(home,join(home,'.dsh'),null,options),row=value.configurations[0];
  assert.deepEqual(value.profiles,['generic']);assert.equal(row.entryId,'arbitrary-reader');assert.equal(row.editable,true);assert.equal(row.hasOverride,false);assert.equal(row.patchExists,false);assert.equal(row.watchMaxProjects,23);
  assert.ok(!JSON.stringify(value).includes('do-not-disclose'));
  const before=await readFile(join(bundle,'first.yml'),'utf8');
  const prepared=await prepareConfiguration(home,join(home,'.dsh'),null,{key:row.key,revision:value.revision,customSkillDirs:[join(home,'custom')],includeDefaultRoots:false,watch:false,settings:{dshHome:join(home,'dsh-other'),agentsHome:join(home,'shared-other'),watchUsePolling:true,watchStabilityThresholdMs:450,watchPollIntervalMs:80,watchMaxProjects:37,watchFollowSymlinks:false}},options);
  assert.equal(prepared.beforeMissing,true);assert.match(prepared.after,/unknown: preserve-me/);
  await writeFile(prepared.path,prepared.after);
  value=await inspectDsh(home,join(home,'.dsh'),null,options);row=value.configurations[0];assert.equal(row.watch,false);assert.equal(row.watchMaxProjects,37);assert.equal(row.watchUsePolling,true);assert.equal(row.hasOverride,true);assert.equal(row.canRestore,true);
  assert.equal(await readFile(join(bundle,'first.yml'),'utf8'),before);
  // A new inspector and a changed inherited layer must be visible after reset, not frozen into a default snapshot.
  await writeFile(join(bundle,'second.yml'),"- id: arbitrary-reader\n  config:\n    providerName: native-local\n    watch: true\n    watchMaxProjects: 71\n");
  value=await inspectDsh(home,join(home,'.dsh'),null,options);row=value.configurations[0];assert.equal(row.watchMaxProjects,37);
  const reset=await prepareConfiguration(home,join(home,'.dsh'),null,{key:row.key,revision:value.revision,reset:true},options);await writeFile(reset.path,reset.after);
  value=await inspectDsh(home,join(home,'.dsh'),null,options);row=value.configurations[0];assert.equal(row.watch,true);assert.equal(row.watchMaxProjects,71);assert.equal(row.hasOverride,false);
}));
configurationTest('DSH per-entry eligibility preserves unrelated expressions and HOME rows, but rejects target shadow and stale layers while admitting parent presets',async()=>fixture(async home=>{
  const [{inspectDsh},{prepareConfiguration}]=await modules();const {path,bundle}=await bundledProfile(home,'generic',providerBundle);
  const homePath=join(home,'.dsh/cordis.patch.yml');await writeFile(homePath,'- id: unrelated-service\n  config:\n    any: !!js neverRun()\n');
  let value=await inspectDsh(home,join(home,'.dsh'),null,options),row=value.configurations[0];assert.equal(row.editable,true);
  await writeFile(join(bundle,'second.yml'),'# concurrent external modification\n[]\n');
  await assert.rejects(prepareConfiguration(home,join(home,'.dsh'),null,{key:row.key,revision:value.revision,watch:false},options),/changed/);
  await writeFile(homePath,'- id: arbitrary-reader\n  config:\n    providerName: native-local\n    watch: true\n    watchMaxProjects: 23\n    unknown: preserve-me\n');
  const same=await inspectDsh(home,join(home,'.dsh'),null,options);assert.equal(same.configurations[0].readOnlyReason,'home-overlay');assert.equal(same.configurations[0].openPath,join(home,'.dsh/cordis.patch.yml'));assert.equal(same.configurations[0].openExists,true);
  await writeFile(homePath,'- id: arbitrary-reader\n  config:\n    watch: false\n');
  value=await inspectDsh(home,join(home,'.dsh'),null,options);assert.equal(value.configurations[0].readOnlyReason,'home-overlay');assert.equal(value.configurations[0].watch,false);
  await assert.rejects(prepareConfiguration(home,join(home,'.dsh'),null,{key:row.key,revision:value.revision,watch:true},options),/read-only/);
  await writeFile(homePath,'[]\n');await writeFile(join(bundle,'first.yml'),`- insert:
  - id: parent
    name: '@deepseek-ai/dsh-agent-preset'
    config:
      id: default
      plugins:
        - id: arbitrary-reader
          name: '@deepseek-ai/dsh-skill-filesystem'
          config: { watch: true }
`);
  value=await inspectDsh(home,join(home,'.dsh'),null,options);assert.equal(value.configurations[0].editable,true);assert.equal(value.configurations[0].parentPreset,true);assert.equal(value.configurations[0].preset,'default');
  assert.equal(await readFile(join(path,'cordis.patch.yml'),'utf8'),'[]\n');
}));
configurationTest('DSH true group children are independently writable and invalid advanced values cannot be saved',async()=>fixture(async home=>{
  const [{inspectDsh},{prepareConfiguration}]=await modules();
  const body=`- insert:
  - id: group
    group: true
    config:
      - id: child
        name: '@deepseek-ai/dsh-skill-filesystem'
        config: { watch: true }
      - id: sibling
        name: '@fixture/sibling'
        config: { keep: true }
`;
  await bundledProfile(home,'generic',body);const value=await inspectDsh(home,join(home,'.dsh'),null,options),row=value.configurations[0];assert.equal(row.editable,true);
  for(const invalid of [0,-1,1.5])await assert.rejects(prepareConfiguration(home,join(home,'.dsh'),null,{key:row.key,revision:value.revision,settings:{watchMaxProjects:invalid}},options),/Invalid/);
  await assert.rejects(prepareConfiguration(home,join(home,'.dsh'),null,{key:row.key,revision:value.revision,settings:{providerName:'no'}},options),/Invalid/);
  const prepared=await prepareConfiguration(home,join(home,'.dsh'),null,{key:row.key,revision:value.revision,watch:false},options);await writeFile(prepared.path,prepared.after);
  assert.equal((await inspectDsh(home,join(home,'.dsh'),null,options)).configurations[0].watch,false);
}));

configurationTest('DSH explicit bundled roots survive disabled defaults; relative roots remain unresolved rather than guessed',async()=>fixture(async home=>{
  const [{inspectDsh}]=await modules();const bundled=join(home,'packaged');await skill(join(bundled,'packaged-skill'),document('packaged-skill'));
  const {bundle}=await bundledProfile(home,'generic',`- insert:
  - id: local-reader
    name: '@deepseek-ai/dsh-skill-filesystem'
    config:
      includeDefaultRoots: false
      bundledSkillDir: ${JSON.stringify(bundled)}
`);
  let value=await inspectDsh(home,join(home,'.dsh'),null,options);let selected=await inspectDsh(home,join(home,'.dsh'),null,{...options,contextKey:value.configurations[0].key});assert.deepEqual(selected.roots.map(r=>r.source),['bundled']);assert.equal(selected.skills[0].name,'packaged-skill');assert.equal(selected.skills[0].canTrash,false);
  await writeFile(join(bundle,'first.yml'),`- insert:
  - id: local-reader
    name: '@deepseek-ai/dsh-skill-filesystem'
    config: {customSkillDirs: [relative-root]}
`);
  value=await inspectDsh(home,join(home,'.dsh'),null,options);assert.equal(value.configurations[0].readOnlyReason,'relative-path');selected=await inspectDsh(home,join(home,'.dsh'),null,{...options,contextKey:value.configurations[0].key});assert.deepEqual(selected.roots,[]);
}));

for(const parent of [false,true])configurationTest(`DSH directory-only ${parent?'preset':'top-level'} save and reset preserve raw watch fields including expressions and absence`,async()=>{
  if(!parent)await fixture(async home=>{
    const [{inspectDsh}]=await modules();
    await profile(home,'web',"- id: skill-filesystem\n  config: {watch: false, watchPollIntervalMs: 73}\n");
    const snapshot=await inspectDsh(home,join(home,'.dsh'),null,options),row=snapshot.configurations[0];
    assert.equal(row.hasOverride,true);assert.equal(row.canRestoreDirectories,false,'A watch-only override has no directories to restore');
  });
  for(const watchYaml of [
    'watch: false # keep watch comment\nwatchUsePolling: true\nwatchPollIntervalMs: 73\nwatchStabilityThresholdMs: 919\nwatchMaxProjects: 7\nwatchFollowSymlinks: false\n',
    'watch: !!js neverEvaluateWatch()\nwatchPollIntervalMs: !!js neverEvaluateInterval()\nwatchMaxProjects: 11\n',
    '',
    'watch: false\nwatchMaxProjects: 0\n',
  ])await fixture(async home=>{
    const [{inspectDsh,yamlDocument},{prepareConfiguration}]=await modules();
    const lowerDir=join(home,'lower'),firstDir=join(home,'first'),secondDir=join(home,'second');
    const settings=`customSkillDirs: [${JSON.stringify(lowerDir)}]\nincludeDefaultRoots: true\n${watchYaml}secret: preserve-other-settings\n`;
    const indent=(text,count)=>text.trimEnd().split('\n').map(line=>' '.repeat(count)+line).join('\n')+'\n';
    const provider=`- id: skill-filesystem\n  name: '@deepseek-ai/dsh-skill-filesystem'\n  config:\n${indent(settings,4)}`;
    const body=parent?`- insert:\n  - id: preset-alpha\n    name: '@deepseek-ai/dsh-agent-preset'\n    config:\n      id: alpha\n      prefix: !!js neverEvaluateParent()\n      plugins:\n${indent(provider,8)}        - id: other-tool\n          name: '@fixture/tool'\n          config: {retain: true}\n`:`- insert:\n${indent(provider,2)}`;
    const {path,bundle}=await bundledProfile(home,'web',body,parent?'[]\n':provider);
    const bundleBytes=await readFile(join(bundle,'first.yml'),'utf8');
    const rawProvider=raw=>{
      let found;const walk=value=>{if(!value||typeof value!=='object')return;if(value.id==='skill-filesystem')found=value.config??{};for(const child of Object.values(value))walk(child);};
      walk(yamlDocument(raw).toJS({maxAliasCount:50}));assert.ok(found);return found;
    };
    const watches=config=>Object.fromEntries(Object.entries(config).filter(([key])=>key.startsWith('watch')));
    const expected=watches(rawProvider(body));
    const assertWatchTags=raw=>{
      const doc=yamlDocument(raw),path=parent?[0,'config','plugins',0,'config']:[0,'config'];
      for(const [key,value] of Object.entries(expected))if(value&&typeof value==='object'&&typeof value.__jsExpr==='string')assert.equal(doc.getIn([...path,key],true)?.tag,'tag:yaml.org,2002:js',key+' must remain a tagged expression, not become a literal marker map');
      if(parent)assert.equal(doc.getIn([0,'config','prefix'],true)?.tag,'tag:yaml.org,2002:js','Materializing directories must also preserve expressions outside the skill provider');
    };
    let snapshot=await inspectDsh(home,join(home,'.dsh'),null,options),row=snapshot.configurations[0];
    assert.ok(row,'The directory configuration must remain inspectable');
    assert.equal(row.editable,true,row.readOnlyReason??'Directory fields should be editable');
    assert.equal(row.canRestoreDirectories,false);
    if(watchYaml.includes('watchMaxProjects: 0'))await assert.rejects(prepareConfiguration(home,join(home,'.dsh'),null,{key:row.key,revision:snapshot.revision,customSkillDirs:[firstDir],confirmMaterialize:true},options),/Invalid DSH skill settings/,'The legacy complete-settings API still validates unchanged invalid watch parameters');
    if(parent)await assert.rejects(prepareConfiguration(home,join(home,'.dsh'),null,{key:row.key,revision:snapshot.revision,directoryOnly:true,customSkillDirs:[firstDir]},options),/Confirm/);
    for(const directory of [firstDir,secondDir]){
      const prepared=await prepareConfiguration(home,join(home,'.dsh'),null,{key:row.key,revision:snapshot.revision,directoryOnly:true,customSkillDirs:[directory],includeDefaultRoots:false,watch:true,settings:{watchMaxProjects:999},confirmMaterialize:true},options);
      const raw=rawProvider(prepared.after);assert.deepEqual(watches(raw),expected,'Directory requests must ignore watch inputs and preserve raw values or absence');assert.equal(raw.secret,'preserve-other-settings');
      assertWatchTags(prepared.after);
      if(!parent&&watchYaml.includes('# keep watch comment'))assert.match(prepared.after,/# keep watch comment/);
      await writeFile(prepared.path,prepared.after);snapshot=await inspectDsh(home,join(home,'.dsh'),null,options);row=snapshot.configurations[0];assert.deepEqual(row.customSkillDirs,[directory]);assert.equal(row.canRestoreDirectories,true);
    }
    await assert.rejects(prepareConfiguration(home,join(home,'.dsh'),null,{key:row.key,revision:snapshot.revision,directoryOnly:true,restorePreset:true},options),/cannot remove/);
    const reset=await prepareConfiguration(home,join(home,'.dsh'),null,{key:row.key,revision:snapshot.revision,directoryOnly:true,reset:true},options);
    const raw=rawProvider(reset.after);assert.deepEqual(watches(raw),expected);assert.equal(raw.secret,'preserve-other-settings');
    assertWatchTags(reset.after);
    await writeFile(reset.path,reset.after);const restarted=await inspectDsh(home,join(home,'.dsh'),null,options);assert.deepEqual(restarted.configurations[0].customSkillDirs,[lowerDir]);assert.equal(restarted.configurations[0].hasOverride,true,'Directory reset keeps the other configuration override');assert.equal(restarted.configurations[0].canRestoreDirectories,false,'Restored directory values have no remaining restore action');
    assert.equal(await readFile(join(bundle,'first.yml'),'utf8'),bundleBytes);
    assert.equal(await readFile(join(path,'cordis.patch.yml'),'utf8'),reset.after);
  });
});

configurationTest('DSH duplicate preset children materialize only their owner and distinguish defaults from inheritance',async()=>fixture(async home=>{
  const [{inspectDsh},{prepareConfiguration}]=await modules();
  const preset=name=>`  - id: preset-${name}\n    name: '@deepseek-ai/dsh-agent-preset'\n    config:\n      id: ${name}\n      prefix: !!js neverEvaluate()\n      unknown: {retain: true}\n      plugins:\n        - id: skill-filesystem\n          name: '@deepseek-ai/dsh-skill-filesystem'\n          config: {watch: true, watchMaxProjects: 17}\n        - id: other-tool\n          name: '@fixture/tool'\n          config: {secret: preserve-without-disclosure}\n`;
  const {path,bundle}=await bundledProfile(home,'web','- insert:\n'+preset('alpha')+preset('beta'));
  await profile(home,'other','- id: skill-filesystem\n  config: {watch: true}\n');
  const originalBundle=await readFile(join(bundle,'first.yml'),'utf8'),otherFile=join(home,'.dsh/profiles/other/cordis.patch.yml'),originalOther=await readFile(otherFile,'utf8');
  let snapshot=await inspectDsh(home,join(home,'.dsh'),null,options);let row=snapshot.configurations.find(row=>row.preset==='alpha');const beta=snapshot.configurations.find(row=>row.preset==='beta');
  assert.notEqual(row.key,beta.key);assert.equal(row.editable,true);assert.equal(row.materializesInheritance,true);
  await assert.rejects(prepareConfiguration(home,join(home,'.dsh'),null,{key:row.key,revision:snapshot.revision,watch:false},options),/Confirm/);
  const prepared=await prepareConfiguration(home,join(home,'.dsh'),null,{key:row.key,revision:snapshot.revision,watch:false,confirmMaterialize:true},options);
  assert.match(prepared.after,/neverEvaluate\(\)/);assert.match(prepared.after,/preserve-without-disclosure/);assert.ok(!prepared.after.includes('preset-beta'));
  await writeFile(prepared.path,prepared.after);snapshot=await inspectDsh(home,join(home,'.dsh'),null,{...options,contextKey:row.key});
  assert.equal(snapshot.configurations.find(item=>item.key===row.key).watch,false);assert.equal(snapshot.configurations.find(item=>item.key===beta.key).watch,true);assert.ok(!JSON.stringify(snapshot).includes('preserve-without-disclosure'));
  const request={key:row.key,revision:snapshot.revision,reset:true};const defaults=await prepareConfiguration(home,join(home,'.dsh'),null,request,options);await writeFile(defaults.path,defaults.after);
  snapshot=await inspectDsh(home,join(home,'.dsh'),null,{...options,contextKey:row.key});row=snapshot.configurations.find(item=>item.key===row.key);assert.equal(row.watch,true);assert.equal(row.hasOverride,true);
  const inherited=await prepareConfiguration(home,join(home,'.dsh'),null,{key:row.key,revision:snapshot.revision,restorePreset:true},options);await writeFile(inherited.path,inherited.after);
  const restarted=inspect(home);assert.equal(restarted.configurations.find(item=>item.key===row.key).hasOverride,false);assert.equal(restarted.configurations.find(item=>item.key===beta.key).watch,true);
  assert.equal(await readFile(join(bundle,'first.yml'),'utf8'),originalBundle);assert.equal(await readFile(otherFile,'utf8'),originalOther);
}));

configurationTest('DSH dynamic skill fields preserve expressions while static sibling settings remain writable',async()=>fixture(async home=>{
  const [{inspectDsh},{prepareConfiguration}]=await modules();const p=await profile(home,'web',"- id: skill-filesystem\n  config:\n    watch: !!js neverEvaluate()\n    customSkillDirs: []\n");
  const snapshot=await inspectDsh(home,join(home,'.dsh'),null,options),row=snapshot.configurations[0];assert.equal(row.editable,true);assert.deepEqual(row.unresolvedFields,['watch']);
  const prepared=await prepareConfiguration(home,join(home,'.dsh'),null,{key:row.key,revision:snapshot.revision,watch:false,customSkillDirs:[join(home,'extra')]},options);await writeFile(prepared.path,prepared.after);
  const reread=await inspectDsh(home,join(home,'.dsh'),null,options);assert.equal(reread.configurations[0].watch,null);assert.deepEqual(reread.configurations[0].customSkillDirs,[join(home,'extra')]);assert.match(await readFile(join(p,'cordis.patch.yml'),'utf8'),/neverEvaluate\(\)/);
}));

configurationTest('DSH all-disabled or conditional providers do not become an unselected default inventory',async()=>fixture(async home=>{
  const [{inspectDsh}]=await modules();await skill(join(home,'.dsh/skills/hidden'),document('hidden'));
  const p=await profile(home,'web',"- id: skill-filesystem\n  disabled: true\n  config: {}\n");
  let snapshot=await inspectDsh(home,join(home,'.dsh'),null,options);assert.equal(snapshot.contextKey,null);assert.deepEqual(snapshot.roots,[]);assert.deepEqual(snapshot.skills,[]);
  await writeFile(join(p,'cordis.patch.yml'),entryPatch("- id: skill-filesystem\n  disabled: !!js neverEvaluate()\n  config: {}\n"));
  snapshot=await inspectDsh(home,join(home,'.dsh'),null,options);assert.equal(snapshot.contextKey,null);assert.deepEqual(snapshot.roots,[]);assert.deepEqual(snapshot.skills,[]);assert.equal(snapshot.configurations[0].disabled,null);
}));

configurationTest('DSH preset defaults resolve the same child after an inherited plugin insertion',async()=>fixture(async home=>{
  const [{inspectDsh},{prepareConfiguration}]=await modules();
  const body=`- insert:\n  - id: preset-alpha\n    name: '@deepseek-ai/dsh-agent-preset'\n    config:\n      id: alpha\n      plugins:\n        - id: skill-filesystem\n          name: '@deepseek-ai/dsh-skill-filesystem'\n          config: {watch: true, watchMaxProjects: 17}\n`;
  const {bundle}=await bundledProfile(home,'web',body);let snapshot=await inspectDsh(home,join(home,'.dsh'),null,options);let row=snapshot.configurations[0];
  const prepared=await prepareConfiguration(home,join(home,'.dsh'),null,{key:row.key,revision:snapshot.revision,watch:false,confirmMaterialize:true},options);await writeFile(prepared.path,prepared.after);
  await writeFile(join(bundle,'first.yml'),body.replace('      plugins:\n','      plugins:\n        - id: new-tool\n          name: \'@fixture/tool\'\n          config: {keep: true}\n').replace('watchMaxProjects: 17','watchMaxProjects: 29'));
  snapshot=await inspectDsh(home,join(home,'.dsh'),null,{...options,contextKey:row.key});row=snapshot.configurations[0];assert.equal(row.watch,false);assert.equal(row.canRestore,true);
  const defaults=await prepareConfiguration(home,join(home,'.dsh'),null,{key:row.key,revision:snapshot.revision,reset:true},options);await writeFile(defaults.path,defaults.after);
  snapshot=await inspectDsh(home,join(home,'.dsh'),null,{...options,contextKey:row.key});assert.equal(snapshot.configurations[0].watch,true);assert.equal(snapshot.configurations[0].watchMaxProjects,29);assert.equal(snapshot.configurations[0].hasOverride,true);assert.equal(snapshot.configurations[0].key,row.key);
  const inherited=await prepareConfiguration(home,join(home,'.dsh'),null,{key:row.key,revision:snapshot.revision,restorePreset:true},options);await writeFile(inherited.path,inherited.after);
  const restarted=inspect(home);assert.equal(restarted.configurations[0].key,row.key);assert.equal(restarted.configurations[0].hasOverride,false);assert.equal(restarted.configurations[0].watchMaxProjects,29);
}));

test('DSH Desktop and CLI resolve the same bundle name from their own installation anchors', {skip:!testInstall||!desktopElectron?'Set explicit original CLI and Desktop qualification paths':false},async()=>fixture(async home=>{
  const p=join(home,'.dsh/profiles/web'),local=join(p,'node_modules/@fixture/dual-anchor');await mkdir(local,{recursive:true});
  await writeFile(join(p,'package.json'),JSON.stringify({dsh:{profile:{bundles:['@fixture/dual-anchor']}}}));await writeFile(join(p,'cordis.patch.yml'),'[]\n');
  const manifest={name:'@fixture/dual-anchor',version:'1.0.0',dsh:{bundle:{patch:'layer.yml'}}};
  const body=n=>`- insert:\n  - id: skill-filesystem\n    name: '@deepseek-ai/dsh-skill-filesystem'\n    config: {watchMaxProjects: ${n}}\n`;
  await writeFile(join(local,'package.json'),JSON.stringify(manifest));await writeFile(join(local,'layer.yml'),body(22));
  const dp=join(home,'.dsh/profiles/desktop');await mkdir(join(dp,'node_modules/@fixture/dual-anchor'),{recursive:true});await writeFile(join(dp,'package.json'),JSON.stringify({dsh:{profile:{bundles:['@fixture/dual-anchor']}}}));await writeFile(join(dp,'cordis.patch.yml'),'[]\n');await writeFile(join(dp,'node_modules/@fixture/dual-anchor/package.json'),JSON.stringify(manifest));await writeFile(join(dp,'node_modules/@fixture/dual-anchor/layer.yml'),body(22));
  const cli=join(home,'isolated-original-cli'),original=JSON.parse(await readFile(join(testInstall,'package.json'),'utf8')),bin=original.bin.dsh;await mkdir(join(cli,'lib'),{recursive:true});await writeFile(join(cli,'package.json'),await readFile(join(testInstall,'package.json')));await writeFile(join(cli,bin),await readFile(join(testInstall,bin)));
  const dependencies=join(cli,'node_modules/@deepseek-ai');await mkdir(dependencies,{recursive:true});for(const name of ['dsh-app-boot','dsh-skill-filesystem'])await symlink(resolve(testInstall,'..',name),join(dependencies,name));
  const own=join(cli,'node_modules/@fixture/dual-anchor');await mkdir(own,{recursive:true});await writeFile(join(own,'package.json'),JSON.stringify(manifest));await writeFile(join(own,'layer.yml'),body(99));
  await rm(join(home,'.local/bin/dsh'));await symlink(join(cli,bin),join(home,'.local/bin/dsh'));
  const result=spawnSync(desktopElectron,['--expose-internals',script,home,join(home,'.dsh'),''],{encoding:'utf8',env:{HOME:home,USERPROFILE:home,PATH:'/usr/bin:/bin',ELECTRON_RUN_AS_NODE:'1'}});assert.equal(result.status,0,result.stderr);
  const snapshot=JSON.parse(result.stdout);const desktop=snapshot.configurations.find(row=>row.installation==='desktop'),npm=snapshot.configurations.find(row=>row.installation==='cli');
  assert.ok(desktop?.editable);assert.ok(npm?.editable);assert.equal(desktop.profile,'desktop');assert.equal(npm.profile,'web');assert.equal(snapshot.configurations.length,2);assert.equal(desktop.watchMaxProjects,22);assert.equal(npm.watchMaxProjects,99);assert.notEqual(desktop.key,npm.key);assert.ok(desktop.anchor.includes('app.asar'));assert.equal(npm.anchor,await realpath(join(cli,'package.json')));
}));

configurationTest('DSH duplicate children within one preset are read-only while another preset stays writable',async()=>fixture(async home=>{
  const [{inspectDsh}]=await modules();const provider="        - id: skill-filesystem\n          name: '@deepseek-ai/dsh-skill-filesystem'\n          config: {watch: true}\n";
  await bundledProfile(home,'web',"- insert:\n  - id: preset-a\n    name: '@deepseek-ai/dsh-agent-preset'\n    config:\n      id: alpha\n      plugins:\n"+provider+provider+"  - id: preset-b\n    name: '@deepseek-ai/dsh-agent-preset'\n    config:\n      id: beta\n      plugins:\n"+provider);
  const snapshot=await inspectDsh(home,join(home,'.dsh'),null,options);assert.ok(snapshot.configurations.filter(row=>row.preset==='alpha').every(row=>row.readOnlyReason==='ambiguous'));assert.equal(snapshot.configurations.find(row=>row.preset==='beta').editable,true);
}));

test('DSH environment skill homes treat blank as unset and expand shared-home tilde without guessing bundled cwd',async()=>fixture(async home=>{
  const run=values=>{const env={...process.env,HOME:home,USERPROFILE:home,DSH_AGENTS_HOME:'',DSH_BUNDLED_SKILL_DIR:'',...values};const result=spawnSync(process.execPath,[script,home,join(home,'.dsh'),''],{encoding:'utf8',env});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);};
  assert.equal(run({DSH_AGENTS_HOME:''}).sharedHome,join(home,'.agents'));
  await skill(join(home,'shared-home/skills/shared-home-skill'),document('shared-home-skill'));
  const shared=run({DSH_AGENTS_HOME:'~/shared-home'});assert.equal(shared.sharedHome,join(home,'shared-home'));assert.ok(shared.skills.some(row=>row.name==='shared-home-skill'));
  const bundled=run({DSH_BUNDLED_SKILL_DIR:'~/packaged'});assert.ok(!bundled.roots.some(root=>root.source==='bundled'));
}));

configurationTest('DSH custom shared flat files stay protected and project links retain their declared identity',async()=>fixture(async home=>{
  const [{inspectDsh}]=await modules(),shared=join(home,'.agents/skills'),nested=join(shared,'nested-flat'),project=join(home,'repo');
  await mkdir(nested,{recursive:true});await writeFile(join(shared,'shared-flat.md'),document('shared-flat'));await writeFile(join(nested,'nested-flat.md'),document('nested-flat'));
  await skill(join(home,'.dsh/skills/global-linked'),document('global-linked'));await mkdir(join(project,'.dsh/skills'),{recursive:true});await symlink(join(home,'.dsh/skills/global-linked'),join(project,'.dsh/skills/project-link'));
  await profile(home,'web',`- id: skill-filesystem\n  config:\n    customSkillDirs: [${JSON.stringify(shared)}, ${JSON.stringify(nested)}]\n`);
  const snapshot=await inspectDsh(home,join(home,'.dsh'),project,options);
  for(const name of ['shared-flat','nested-flat']){const row=snapshot.skills.find(row=>row.name===name);assert.ok(row);assert.equal(row.source,'custom');assert.equal(row.canSetInvocation,false);assert.equal(row.canTrash,false);}
  const linked=snapshot.skills.find(row=>row.source==='project-dsh'&&row.name==='global-linked');assert.ok(linked?.inScope);assert.equal(linked.declaredPath,join(await realpath(project),'.dsh/skills/project-link'));assert.equal(linked.file,await realpath(join(home,'.dsh/skills/global-linked/SKILL.md')));assert.equal(linked.canTrash,false);assert.equal(linked.canSetInvocation,false);
}));

configurationTest('DSH custom aliases cannot turn configured shared or bundled skill roots into native writable files',async()=>fixture(async home=>{
  const [{inspectDsh}]=await modules(),shared=join(home,'configured-shared'),bundled=join(home,'bundled');await mkdir(join(shared,'skills'),{recursive:true});await mkdir(bundled,{recursive:true});
  await writeFile(join(shared,'skills/configured-flat.md'),document('configured-flat'));await writeFile(join(bundled,'bundled-flat.md'),document('bundled-flat'));
  await profile(home,'web',`- id: skill-filesystem\n  config:\n    agentsHome: ${JSON.stringify(shared)}\n    bundledSkillDir: ${JSON.stringify(bundled)}\n    customSkillDirs: [${JSON.stringify(join(shared,'skills'))}, ${JSON.stringify(bundled)}]\n`);
  const snapshot=await inspectDsh(home,join(home,'.dsh'),null,options);
  for(const name of ['configured-flat','bundled-flat']){const row=snapshot.skills.find(row=>row.name===name);assert.ok(row);assert.equal(row.source,'custom');assert.equal(row.canSetInvocation,false);assert.equal(row.canTrash,false);}
}));

configurationTest('DSH file-only contexts read their own Host provider or remain empty without crossing to other files',async()=>fixture(async home=>{
  const [{inspectDsh}]=await modules();
  const hostRoot=join(home,'host-native');await skill(join(hostRoot,'host-only'),document('host-only'));
  const host=await profile(home,'host',config(hostRoot));
  const empty=await profile(home,'empty','- insert: []\n');
  await profile(home,'other',`- id: standard\n  name: '@deepseek-ai/dsh-agent-preset'\n  config: {id: standard, plugins: []}\n`);
  const paths=[join(host,'cordis.patch.yml'),join(empty,'cordis.patch.yml')];
  const before=await Promise.all(paths.map(path=>readFile(path,'utf8')));
  for(const path of [...paths,join(home,'.dsh/profiles/missing/cordis.patch.yml')]){
    for(const project of [null,join(home,'project')]){
      for(let refresh=0;refresh<2;refresh++){
        const snapshot=await inspectDsh(home,join(home,'.dsh'),project,{...options,contextKey:`file:${path}`});
        assert.equal(snapshot.configurationPath,path);assert.equal(snapshot.presetKey,null);
        if(path===paths[0]){
          assert.equal(snapshot.contextKey,snapshot.configurations.find(row=>row.path===path).key,'Host-only file retains its own internal provider identity');
          assert.ok(snapshot.roots.some(row=>row.path===hostRoot));assert.deepEqual(snapshot.skills.map(row=>row.name),['host-only']);
        }else{assert.equal(snapshot.contextKey,`file:${path}`);assert.deepEqual(snapshot.roots,[]);assert.deepEqual(snapshot.skills,[]);}
        assert.equal(!!snapshot.contextIssue,!paths.includes(path),'Only an undiscovered file is invalid; an existing Host-only or empty file stays valid');
      }
    }
  }
  assert.deepEqual(await Promise.all(paths.map(path=>readFile(path,'utf8'))),before,'Selection and refresh never write DSH files');
  const emptyPath=paths[1];
  const updated=`- insert:\n  - id: minimal\n    name: '@deepseek-ai/dsh-agent-preset'\n    config: {id: minimal, plugins: []}\n`;
  await writeFile(emptyPath,updated);
  const appeared=await inspectDsh(home,join(home,'.dsh'),null,{...options,contextKey:`file:${emptyPath}`});
  const preset=appeared.presets.find(row=>row.path===emptyPath&&row.preset==='minimal');
  assert.ok(preset);assert.equal(appeared.presetKey,preset.key);assert.equal(appeared.contextKey,preset.key);
  assert.equal(appeared.contextIssue,null);assert.deepEqual(appeared.roots,[]);assert.deepEqual(appeared.skills,[]);
  assert.equal(await readFile(emptyPath,'utf8'),updated,'Discovery of a new declaration is read-only');
}));

configurationTest('DSH project discovery includes inherited user skills as read-only and reports invalid documents',async()=>fixture(async home=>{
  const [{inspectDsh}]=await modules();
  const project=join(home,'repo');await mkdir(join(project,'.git'),{recursive:true});
  const inherited=join(home,'.dsh/skills/inherited');
  await skill(inherited,document('inherited'));
  await skill(join(project,'.dsh/skills/own'),document('own'));
  const bad=join(home,'.dsh/skills/bad');await skill(bad,document('bad_name'));
  const before=await readFile(join(inherited,'SKILL.md'));
  const snapshot=await inspectDsh(home,join(home,'.dsh'),project,options);
  const row=snapshot.skills.find(row=>row.name==='inherited');assert.ok(row);
  assert.equal(row.inScope,false);assert.equal(row.canSetInvocation,false);assert.equal(row.canTrash,false);
  assert.ok(snapshot.skills.some(row=>row.name==='own'&&row.inScope));
  assert.ok(snapshot.warnings.some(warning=>warning.includes('bad/SKILL.md')&&warning.includes('Invalid DSH skill name')));
  assert.deepEqual(await readFile(join(inherited,'SKILL.md')),before);
}));

configurationTest('DSH preset discovery merges readable providers without changing the selected settings provider',async()=>fixture(async home=>{
  const [{inspectDsh}]=await modules();
  const a=join(home,'first'),b=join(home,'second'),hidden=join(home,'disabled');
  await skill(join(a,'same'),document('same'));await skill(join(b,'same'),document('same'));
  await skill(join(b,'secondary-only'),document('secondary-only'));await skill(join(hidden,'disabled-only'),document('disabled-only'));
  const body=`- id: preset-standard\n  name: '@deepseek-ai/dsh-agent-preset'\n  config:\n    id: standard\n    plugins:\n      - id: primary\n        name: '@deepseek-ai/dsh-skill-filesystem'\n        config: {providerName: primary, includeDefaultRoots: false, customSkillDirs: [${JSON.stringify(a)}]}\n      - id: secondary\n        name: '@deepseek-ai/dsh-skill-filesystem'\n        config: {providerName: secondary, includeDefaultRoots: false, customSkillDirs: [${JSON.stringify(b)}, ${JSON.stringify(a)}]}\n      - id: disabled\n        name: '@deepseek-ai/dsh-skill-filesystem'\n        disabled: true\n        config: {providerName: disabled, includeDefaultRoots: false, customSkillDirs: [${JSON.stringify(hidden)}]}\n`;
  const p=await profile(home,'web',body);const file=join(p,'cordis.patch.yml');const before=await readFile(file);
  const initial=await inspectDsh(home,join(home,'.dsh'),null,options);
  const rows=initial.configurations;assert.equal(rows.length,3);
  const primary=rows.find(row=>row.entryId==='primary'),secondary=rows.find(row=>row.entryId==='secondary');assert.ok(primary&&secondary);
  const firstFile=await realpath(join(a,'same/SKILL.md')),secondFile=await realpath(join(b,'same/SKILL.md'));
  for(const selected of [primary,secondary]){
    const snapshot=await inspectDsh(home,join(home,'.dsh'),null,{...options,contextKey:selected.key});
    assert.equal(snapshot.contextKey,selected.key,'Settings continue editing the explicitly chosen provider');
    assert.deepEqual(snapshot.roots.map(row=>row.path),[a,b]);
    assert.deepEqual(snapshot.skills.map(row=>row.name),['same','same','secondary-only']);
    assert.equal(snapshot.skills.find(row=>row.file===firstFile).shadowed,false);
    assert.equal(snapshot.skills.find(row=>row.file===secondFile).shadowed,true);
    assert.equal(snapshot.skills.find(row=>row.name==='secondary-only').canSetInvocation,true);
    assert.equal(new Set(snapshot.skills.map(row=>row.file)).size,3,'Duplicate provider roots do not repeat physical skill files');
  }
  assert.deepEqual(await readFile(file),before);
}));
