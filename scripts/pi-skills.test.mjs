import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync,readFileSync,readdirSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {inspectPiSkills,readProjectTrust} from '../src-tauri/resources/upstream/inspect-pi-skills.mjs';
function fixture(t){const root=mkdtempSync(join(tmpdir(),'pi-skills-contract-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const home=join(root,'home');mkdirSync(home,{recursive:true});const agent=join(home,'.pi/agent');settings(agent,{defaultProjectTrust:'always'});return {root,home,agent};}
function skill(root,name){const path=join(root,name);mkdirSync(path,{recursive:true});const file=join(path,'SKILL.md');writeFileSync(file,`---\nname: ${name}\ndescription: Fixture\n---\nUnchanged\n`);return file;}
function settings(agent,data){mkdirSync(agent,{recursive:true});writeFileSync(join(agent,'settings.json'),JSON.stringify({...((agent.endsWith(join('.pi','agent')) && data.defaultProjectTrust===undefined)?{defaultProjectTrust:'always'}:{}),...data}));}
test('Pi native exact and glob overrides take precedence without changing skill files',t=>{
 const f=fixture(t),file=skill(join(f.home,'.agents/skills'),'alpha'),original=readFileSync(file);
 settings(f.agent,{skills:['!alpha',`+${file}`,`-${file}`]});let s=inspectPiSkills(f.home,f.agent);assert.equal(s.skills[0].enabled,false);assert.deepEqual(s.skills[0].blockingRules,[`-${file}`]);assert.equal(s.skills[0].cliAddressable,true);
 settings(f.agent,{skills:['!alpha',`+${file}`]});s=inspectPiSkills(f.home,f.agent);assert.equal(s.skills[0].enabled,true);assert.deepEqual(readFileSync(file),original);
});
test('custom Pi root, relative and home paths, nested skills, ignores and cycles',t=>{
 const f=fixture(t),custom=join(f.root,'custom-agent');skill(join(f.root,'extra'),'nested');skill(join(custom,'skills'),'own');skill(join(custom,'skills'),'ignored');writeFileSync(join(custom,'skills/.fdignore'),'ignored/\n');
 if(process.platform!=='win32')symlinkSync(join(custom,'skills'),join(custom,'skills/cycle'));
 settings(custom,{skills:['../extra']});const s=inspectPiSkills(f.home,custom);assert.deepEqual(s.skills.map(x=>x.name).sort(),['nested','own']);assert(s.skills.every(x=>!x.cliAddressable));
});
test('project filters do not pretend to override global resource discovery',t=>{
 const f=fixture(t),project=join(f.root,'project');skill(join(f.home,'.agents/skills'),'global');skill(join(project,'.agents/skills'),'local');mkdirSync(join(project,'.git'));
 settings(join(project,'.pi'),{skills:['!local','!global']});const s=inspectPiSkills(f.home,f.agent,project);
 assert.equal(s.skills.find(x=>x.name==='local').enabled,false);assert.equal(s.skills.find(x=>x.name==='global').enabled,true);assert.equal(s.skills.find(x=>x.name==='global').reason,'globalInProject');
});
test('a project without Git inherits HOME skills without owning their installations',t=>{
 const f=fixture(t),project=join(f.home,'work/project');
 const global=skill(join(f.home,'.agents/skills'),'global');
 skill(join(project,'.agents/skills'),'local');
 const s=inspectPiSkills(f.home,f.agent,project), inherited=s.skills.find(x=>x.name==='global');
 assert.equal(inherited.enabled,true);
 assert.equal(inherited.scope,'global');
 assert.equal(inherited.file,realpathSync(global));
 assert.equal(inherited.inScope,false);
 assert.equal(inherited.cliAddressable,false);
 assert.equal(inherited.canTrash,false);
 assert.deepEqual(s.skills.filter(x=>x.inScope).map(x=>x.name),['local']);
 assert.equal(s.skills.find(x=>x.name==='local').cliAddressable,true);
 assert.equal(inspectPiSkills(f.home,f.agent).skills.find(x=>x.name==='global').inScope,true);
 settings(f.agent,{skills:['!global']});
 settings(join(project,'.pi'),{skills:['+global']});
 const excluded=inspectPiSkills(f.home,f.agent,project).skills.find(x=>x.name==='global');
 assert.equal(excluded.enabled,false);assert.equal(excluded.scope,'global');assert.equal(excluded.inScope,false);
});
test('ancestor skills retain Pi priority but are not current-project CLI targets',t=>{
 const f=fixture(t),parent=join(f.home,'workspace'),project=join(parent,'child');
 skill(join(parent,'.agents/skills'),'ancestor');
 skill(join(f.home,'.agents/skills'),'ancestor');
 skill(join(project,'.agents/skills'),'own');mkdirSync(join(parent,'.git'));
 const s=inspectPiSkills(f.home,f.agent,project), inherited=s.skills.filter(x=>x.name==='ancestor');
 assert.equal(inherited.find(x=>!x.reason).file,realpathSync(join(parent,'.agents/skills/ancestor/SKILL.md')));
 assert.equal(inherited.find(x=>x.reason==='shadowed').scope,'global');
 assert(inherited.every(x=>!x.inScope&&!x.cliAddressable&&!x.canTrash));
 assert.deepEqual(s.skills.filter(x=>x.inScope).map(x=>x.name),['own']);
});
test('a project-owned link to global content remains a project installation',t=>{
 const f=fixture(t),project=join(f.home,'work/project');
 const global=skill(join(f.home,'.agents/skills'),'linked');
 mkdirSync(join(project,'.agents/skills'),{recursive:true});
 symlinkSync(join(f.home,'.agents/skills/linked'),join(project,'.agents/skills/linked'),'dir');
 const row=inspectPiSkills(f.home,f.agent,project).skills.find(x=>x.file===realpathSync(global));
 assert.equal(row.inScope,true);assert.equal(row.cliAddressable,true);assert.equal(row.canTrash,false);
});
test('package empty skills selection differs from missing selection',t=>{
 const f=fixture(t),pkg=join(f.agent,'pkg');skill(join(pkg,'skills'),'alpha');skill(join(pkg,'skills'),'beta');settings(f.agent,{packages:[{source:'./pkg',skills:[]}]});
 assert(inspectPiSkills(f.home,f.agent).skills.every(s=>!s.enabled));settings(f.agent,{packages:['./pkg']});assert(inspectPiSkills(f.home,f.agent).skills.every(s=>s.enabled));
});
test('invalid settings does not expose unrelated secret values',t=>{
 const f=fixture(t);mkdirSync(f.agent,{recursive:true});writeFileSync(join(f.agent,'settings.json'),'{"private":"SECRET_DO_NOT_LOG",broken');assert.throws(()=>inspectPiSkills(f.home,f.agent),error=>!error.message.includes('SECRET_DO_NOT_LOG')&&error.message.includes('Invalid Pi settings'));
});
test('project package delta preserves the global package and applies only explicit matches',t=>{
 const f=fixture(t),project=join(f.root,'project'),pkg=join(f.agent,'npm/node_modules/fixture');skill(join(pkg,'skills'),'alpha');skill(join(pkg,'skills'),'beta');
 writeFileSync(join(pkg,'package.json'),JSON.stringify({pi:{extensions:['extension.js']}}));
 settings(f.agent,{packages:[{source:'npm:fixture',skills:['skills/**']}]});settings(join(project,'.pi'),{packages:[{source:'npm:fixture',autoload:false,skills:['!alpha']}]});mkdirSync(join(project,'.git'));
 const s=inspectPiSkills(f.home,f.agent,project);assert.equal(s.skills.length,2);assert.equal(s.skills.find(x=>x.name==='alpha').enabled,false);assert.equal(s.skills.find(x=>x.name==='alpha').reason,'packageDelta');assert.equal(s.skills.find(x=>x.name==='beta').enabled,true);
});
test('command completion inheritance and external invocation eligibility do not rewrite skill files',t=>{
 const f=fixture(t),own=skill(join(f.agent,'skills'),'private'),shared=skill(join(f.home,'.agents/skills'),'shared');
 settings(f.agent,{enableSkillCommands:false});
 let s=inspectPiSkills(f.home,f.agent);assert.equal(s.skillCommands,false);assert.equal(s.skills.find(x=>x.name==='private').canSetVisibility,true);assert.equal(s.skills.find(x=>x.name==='shared').canSetVisibility,true);
 const project=join(f.root,'project');mkdirSync(project);s=inspectPiSkills(f.home,f.agent,project);assert.equal(s.skillCommands,null);assert.equal(s.inheritedSkillCommands,false);
 settings(join(project,'.pi'),{enableSkillCommands:true});assert.equal(inspectPiSkills(f.home,f.agent,project).skillCommands,true);
});

test('empty package manifests stay empty for source objects, while explicit filters retain Pi convention fallback',t=>{
 const f=fixture(t),pkg=join(f.agent,'pkg');skill(join(pkg,'skills'),'alpha');writeFileSync(join(pkg,'package.json'),JSON.stringify({pi:{skills:[]}}));
 for(const entry of ['./pkg',{source:'./pkg'}]){settings(f.agent,{packages:[entry]});assert.deepEqual(inspectPiSkills(f.home,f.agent).skills,[]);}
 settings(f.agent,{packages:[{source:'./pkg',skills:['skills/**']}]});assert.equal(inspectPiSkills(f.home,f.agent).skills[0].enabled,true);
});
test('project Git package identity overrides equivalent global transport syntax',t=>{
 const f=fixture(t),project=join(f.root,'project');mkdirSync(join(project,'.git'),{recursive:true});
 const globalPkg=join(f.agent,'git/github.com/fixture/repo'),localPkg=join(project,'.pi/git/github.com/fixture/repo');
 skill(join(globalPkg,'skills'),'global-only');skill(join(localPkg,'skills'),'project-only');
 settings(f.agent,{packages:['git:https://github.com/fixture/repo.git']});settings(join(project,'.pi'),{packages:['https://github.com/fixture/repo']});
 assert.deepEqual(inspectPiSkills(f.home,f.agent,project).skills.map(x=>x.name),['project-only']);
});
test('same-name discovery preserves filesystem order rather than locale order',t=>{
 const f=fixture(t);for(const dir of ['B','a']){const file=skill(join(f.agent,'skills'),dir);writeFileSync(file,'---\nname: same\ndescription: Fixture\n---\nBody');}
 const order=readdirSync(join(f.agent,'skills'));const s=inspectPiSkills(f.home,f.agent);
 assert.equal(s.skills.find(x=>!x.reason)?.file,realpathSync(join(f.agent,'skills',order[0],'SKILL.md')));
 assert.equal(s.skills.filter(x=>x.reason==='shadowed').length,1);
});
test('invalid descriptions cannot claim a name ahead of valid lower-precedence skills',t=>{
 const f=fixture(t),project=join(f.root,'project');mkdirSync(join(project,'.git'),{recursive:true});const valid=skill(join(f.agent,'skills'),'same'),bad=skill(join(project,'.pi/skills'),'same');
 for(const metadata of ['name: same','name: same\ndescription: 123','name: same\ndescription: ""','name: same\ndescription: "  "']){
  writeFileSync(bad,`---\n${metadata}\n---\nBody`);const s=inspectPiSkills(f.home,f.agent,project);assert.deepEqual(s.skills.map(x=>x.file),[realpathSync(valid)]);assert.notEqual(s.skills[0].reason,'shadowed');assert.equal(s.warnings.length,1);
 }
 writeFileSync(bad,'# No metadata\nBody');assert.deepEqual(inspectPiSkills(f.home,f.agent,project).skills.map(x=>x.file),[realpathSync(valid)]);
});
test('empty skill names use the parent directory identity',t=>{
 const f=fixture(t),file=skill(join(f.agent,'skills'),'alpha');writeFileSync(file,'---\nname: ""\ndescription: Fixture\n---\nBody');assert.equal(inspectPiSkills(f.home,f.agent).skills[0].name,'alpha');
});
test('a configured alias without a CLI installation record remains native',t=>{
 if(process.platform==='win32'){t.skip('requires symlinks');return;}
 const f=fixture(t),packageRoot=join(f.agent,'package'),file=skill(join(packageRoot,'skills'),'aliased');
 mkdirSync(join(f.home,'.agents/skills'),{recursive:true});symlinkSync(join(packageRoot,'skills/aliased'),join(f.home,'.agents/skills/aliased'));
 writeFileSync(join(packageRoot,'package.json'),JSON.stringify({pi:{skills:['skills']}}));const configured=join(f.agent,'configured-alias');symlinkSync(join(packageRoot,'skills'),configured);settings(f.agent,{packages:['./package'],skills:[configured]});
 const state=inspectPiSkills(f.home,f.agent).skills.find(item=>item.file===realpathSync(file));
 assert.equal(state.origin,'configured');assert.equal(state.managed,false);assert(state.lifecycle);
});

test('native BOM documents retain a revision of the actual bytes used by atomic field writes',t=>{
 const f=fixture(t),file=skill(join(f.agent,'skills'),'bom');writeFileSync(file,'\uFEFF'+readFileSync(file,'utf8'));const bytes=readFileSync(file);
 const state=inspectPiSkills(f.home,f.agent).skills.find(item=>item.name==='bom');assert.equal(state.documentRevision,createHash('sha256').update(bytes).digest('hex'));assert.equal(state.canSetVisibility,true);
});

test('contradictory native preferences in global and project scopes require an explicit physical-file choice',t=>{
 const f=fixture(t),file=skill(join(f.agent,'skills'),'physical'),project=join(f.home,'project');mkdirSync(join(project,'.git'),{recursive:true});settings(join(project,'.pi'),{skills:[file]});
 writeFileSync(join(f.agent,'skills-space-visibility.json'),JSON.stringify({version:1,hiddenSkills:[{file:realpathSync(file),name:'physical',hidden:true}]}));
 writeFileSync(join(project,'.pi/skills-space-visibility.json'),JSON.stringify({version:1,hiddenSkills:[{file:realpathSync(file),name:'physical',hidden:false}]}));
 const original=readFileSync(file),state=inspectPiSkills(f.home,f.agent,project).skills.find(item=>item.name==='physical');
 assert.equal(state.managed,false);assert.equal(state.lifecycle.recovery,'conflict');assert.equal(state.canSetVisibility,true);assert.deepEqual(readFileSync(file),original);
});

test('Pi menu capabilities respect source ownership, qualified runtime and unknown external defaults',t=>{
 const f=fixture(t),local=skill(join(f.agent,'local-package/skills'),'local');
 const npmRoot=join(f.agent,'npm/node_modules/fixture'),npm=skill(join(npmRoot,'skills'),'npm');
 writeFileSync(join(npmRoot,'package.json'),JSON.stringify({name:'fixture',version:'2.0.0'}));
 mkdirSync(join(f.agent,'npm/node_modules'),{recursive:true});writeFileSync(join(f.agent,'npm/node_modules/.package-lock.json'),JSON.stringify({packages:{'node_modules/fixture':{version:'2.0.0',integrity:'fixture'}}}));
 settings(f.agent,{packages:['./local-package','npm:fixture']});
 let snapshot=inspectPiSkills(f.home,f.agent);assert(snapshot.skills.every(item=>!item.canCheckPackage));
 const release=join(f.agent,'install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent');mkdirSync(release,{recursive:true});
 writeFileSync(join(release,'package.json'),JSON.stringify({name:'@earendil-works/pi-coding-agent',version:'1.3.0'}));writeFileSync(join(f.agent,'install/current-version'),'1.3.0');
 snapshot=inspectPiSkills(f.home,f.agent);assert.equal(snapshot.skills.find(item=>item.file===realpathSync(local)).canCheckPackage,false);assert.equal(snapshot.skills.find(item=>item.file===realpathSync(npm)).canCheckPackage,true);
 const actual=realpathSync(npm);writeFileSync(join(f.agent,'skills-space-invocation.json'),JSON.stringify({version:1,records:{[actual]:{source:{kind:'npm',root:realpathSync(npmRoot),identity:'npm:fixture',version:'1.0.0'},mode:'auto',phase:'committed',applied:'false',appliedLine:'disable-model-invocation: false'}}}));
 snapshot=inspectPiSkills(f.home,f.agent);const changed=snapshot.skills.find(item=>item.file===actual);assert.equal(changed.canSetVisibility,true);assert.equal(changed.canRestoreDefault,true);assert.equal(changed.lifecycle.recovery,'conflict');assert.equal(changed.canRecoverInvocation,false);
 writeFileSync(npm,readFileSync(npm,'utf8').replace('---\n','---\ndisable-model-invocation: false\n'));
 const recoverable=inspectPiSkills(f.home,f.agent).skills.find(item=>item.file===actual);assert.equal(recoverable.lifecycle.recovery,'pendingRestore');assert.equal(recoverable.canRecoverInvocation,true);
 writeFileSync(join(f.agent,'install/current-version'),'1.4.0');assert(inspectPiSkills(f.home,f.agent).skills.every(item=>!item.canCheckPackage));
 rmSync(join(f.agent,'install/current-version'));mkdirSync(join(f.agent,'install/current-version'));assert(inspectPiSkills(f.home,f.agent).skills.every(item=>!item.canCheckPackage));
});


test('trust follows remembered nearest parents and Pi defaults without writing the store',t=>{
 const f=fixture(t),project=join(f.root,'parent/project');skill(join(project,'.pi/skills'),'local');
 settings(f.agent,{defaultProjectTrust:'ask'});
 assert.equal(inspectPiSkills(f.home,f.agent,project).skills.some(s=>s.name==='local'),false);
 writeFileSync(join(f.agent,'trust.json'),JSON.stringify({[realpathSync(join(f.root,'parent'))]:true}));
 let state=inspectPiSkills(f.home,f.agent,project);assert.equal(state.skills.find(s=>s.name==='local').enabled,true);
 const trusted=readFileSync(join(f.agent,'trust.json'));
 writeFileSync(join(f.agent,'trust.json'),JSON.stringify({[realpathSync(join(f.root,'parent'))]:true,[realpathSync(project)]:false}));
 assert.equal(inspectPiSkills(f.home,f.agent,project).skills.some(s=>s.name==='local'),false);
 writeFileSync(join(f.agent,'trust.json'),trusted);inspectPiSkills(f.home,f.agent,project);assert.deepEqual(readFileSync(join(f.agent,'trust.json')),trusted);
 rmSync(join(f.agent,'trust.json'));settings(f.agent,{defaultProjectTrust:'never'});assert.equal(readProjectTrust(f.home,f.agent,project,{defaultProjectTrust:'never'}).trusted,false);
});
test('an enabled symlink alias is not consumed by its disabled physical peer',t=>{
 const f=fixture(t);skill(join(f.agent,'skills'),'a');symlinkSync(join(f.agent,'skills/a'),join(f.agent,'skills/z'),'dir');settings(f.agent,{skills:['-skills/a']});
 const rows=inspectPiSkills(f.home,f.agent).skills;assert.equal(rows.length,1);assert.equal(rows[0].enabled,true);assert.equal(relative(join(f.agent,'skills'),rows[0].rulePath),join('z','SKILL.md'));
});
test('CR frontmatter matches Pi recognition and keeps the byte revision',t=>{
 const f=fixture(t),file=skill(join(f.agent,'skills'),'cr');writeFileSync(file,'---\rname: cr\rdescription: Fixture\r---\rBody');
 const state=inspectPiSkills(f.home,f.agent).skills[0];assert.equal(state.name,'cr');assert.equal(state.managed,false);assert.equal(state.documentRevision,createHash('sha256').update(readFileSync(file)).digest('hex'));
});
test('only recorded installations use external visibility, including configured aliases',t=>{
 const f=fixture(t),file=skill(join(f.home,'.agents/skills'),'manual');settings(f.agent,{skills:[join(f.home,'.agents/skills/manual')]});
 assert.equal(inspectPiSkills(f.home,f.agent).skills[0].managed,false);
 writeFileSync(join(f.home,'.agents/.skill-lock.json'),JSON.stringify({version:3,skills:{manual:{source:'fixture/repo'}}}));
 const state=inspectPiSkills(f.home,f.agent).skills[0];assert.equal(state.managed,true);assert.equal(state.lifecycle,null);assert.equal(state.file,realpathSync(file));
});
test('additional directory metadata resolves typed relative and home paths',t=>{
 const f=fixture(t);settings(f.agent,{skills:['../extra','~/team','!draft/**']});
 assert.deepEqual(inspectPiSkills(f.home,f.agent).additionalDirectories,[join(f.agent,'../extra'),join(f.home,'team')]);
});
test('SSH package sources use the same physical checkout as Pi',t=>{
 const f=fixture(t),pkg=join(f.agent,'git/example.com/team/repo');skill(join(pkg,'skills'),'ssh');settings(f.agent,{packages:['ssh://git@example.com/team/repo.git']});
 const state=inspectPiSkills(f.home,f.agent).skills[0];assert.equal(state.name,'ssh');assert.equal(state.packageRoot,realpathSync(pkg));
});

test('qualified original Pi resolves legacy npm and SSH paths without package lifecycle writes',{skip:!process.env.SKILLS_SPACE_PI_TEST_INSTALL},t=>{
 const f=fixture(t),original=process.env.SKILLS_SPACE_PI_TEST_INSTALL;
 const version=JSON.parse(readFileSync(join(original,'package.json'),'utf8')).version;const release=join(f.agent,`install/releases/${version}/node_modules/@earendil-works`);mkdirSync(release,{recursive:true});symlinkSync(original,join(release,'pi-coding-agent'),'dir');writeFileSync(join(f.agent,'install/current-version'),version);
 const legacy=join(f.root,'global-node-modules');skill(join(legacy,'fixture/skills'),'legacy');
 const npm=join(f.root,'npm-root.cjs');writeFileSync(npm,`if(process.argv.slice(2).join(' ')==='root -g')process.stdout.write(${JSON.stringify(legacy)});else process.exit(1);`);
 const ssh=join(f.agent,'git/example.com/team/repo');skill(join(ssh,'skills'),'ssh');
 settings(f.agent,{npmCommand:[process.execPath,npm],packages:['npm:fixture','ssh://git@example.com/team/repo.git']});
 const before=readFileSync(join(f.agent,'settings.json')),snapshot=inspectPiSkills(f.home,f.agent);
 assert.deepEqual(snapshot.skills.map(s=>s.name).sort(),['legacy','ssh']);assert.equal(snapshot.skills.find(s=>s.name==='legacy').packageRoot,realpathSync(join(legacy,'fixture')));
 assert.deepEqual(readFileSync(join(f.agent,'settings.json')),before);assert(!snapshot.warnings.some(w=>w.includes('paths could not')));
});

test('management lists untrusted project resources without granting runtime trust',t=>{
 const f=fixture(t),project=join(f.root,'untrusted');
 const file=skill(join(project,'.pi/skills'),'local');
 settings(f.agent,{defaultProjectTrust:'ask'});
 const original=readFileSync(file);
 assert.equal(inspectPiSkills(f.home,f.agent,project).skills.some(s=>s.name==='local'),false);
 const management=inspectPiSkills(f.home,f.agent,project,true);
 assert.equal(management.projectTrusted,false);
 assert.equal(management.projectTrustDecision,false);
 const row=management.skills.find(s=>s.name==='local');
 assert.equal(row.inScope,true);assert.equal(row.canToggle,true);assert.equal(row.canSetVisibility,true);
 assert.deepEqual(readFileSync(file),original);
 assert.equal(readdirSync(f.agent).includes('trust.json'),false);
});

test('management preserves a disabled project link while runtime retains the global alias',t=>{
 const f=fixture(t),project=join(f.root,'linked');
 const file=skill(join(f.home,'.agents/skills'),'linked');
 const alias=join(project,'.agents/skills/linked');mkdirSync(join(project,'.agents/skills'),{recursive:true});symlinkSync(join(f.home,'.agents/skills/linked'),alias,'dir');
 settings(join(project,'.pi'),{skills:[`-${join(alias,'SKILL.md')}`]});
 const runtime=inspectPiSkills(f.home,f.agent,project).skills.find(s=>s.file===realpathSync(file));assert.equal(runtime.enabled,true);assert.equal(runtime.inScope,false);
 const managed=inspectPiSkills(f.home,f.agent,project,true).skills.find(s=>s.file===realpathSync(file));assert.equal(managed.enabled,false);assert.equal(managed.inScope,true);assert.equal(managed.canToggle,true);
});
