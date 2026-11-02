import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';import{join,resolve}from'node:path';
import{spawnSync}from'node:child_process';
import{inspectHermes}from'../src-tauri/resources/upstream/inspect-hermes-config.mjs';
const fixture=t=>{const home=mkdtempSync(join(tmpdir(),'hermes-settings-'));t.after(()=>rmSync(home,{recursive:true,force:true}));const agent=join(home,'.hermes');mkdirSync(agent);return{home,agent,project:join(home,'project')};};
const skill=(root,name,description='Fixture')=>{const path=join(root,name);mkdirSync(path,{recursive:true});writeFileSync(join(path,'SKILL.md'),`---\nname: ${name}\ndescription: ${description}\n---\nOriginal\n`);return path;};
const config=(f,s)=>writeFileSync(join(f.agent,'config.yaml'),s);
const prepare=(f,change,project='')=>spawnSync(process.execPath,[resolve('src-tauri/resources/upstream/prepare-hermes-settings.mjs'),f.home,f.agent,project,JSON.stringify(change)],{encoding:'utf8'});
test('project inventory retains untrusted installations and never imports user-owned skills',t=>{
 const f=fixture(t);skill(join(f.agent,'skills'),'global');skill(join(f.project,'.agents/skills'),'project');
 let s=inspectHermes(f.home,f.agent,f.project);assert.equal(s.skills.find(x=>x.name==='project').reason,'noProject');assert.deepEqual(s.skills.filter(x=>x.inScope).map(x=>x.name),['project']);
 mkdirSync(join(f.project,'.git'));s=inspectHermes(f.home,f.agent,f.project);assert.equal(s.skills.find(x=>x.name==='project').reason,'untrusted');
 config(f,`skills:\n  trusted_project_dirs: [${JSON.stringify(f.project)}]\n`);s=inspectHermes(f.home,f.agent,f.project);assert.equal(s.projectTrusted,true);assert.equal(s.skills.find(x=>x.name==='project').reason,'scanUnverified');
});
test('native precedence, same-tier ambiguity and exact load keys remain distinct',t=>{
 const f=fixture(t);skill(join(f.agent,'skills/a'),'same');skill(join(f.agent,'skills/b'),'same','Different');
 const s=inspectHermes(f.home,f.agent);assert(s.skills.every(x=>x.ambiguous));assert.deepEqual(s.skills.map(x=>x.loadName).sort(),['a/same','b/same']);
 const ext=join(f.home,'external');skill(ext,'same');config(f,`skills:\n  external_dirs: [${JSON.stringify(ext)}]\n`);assert(inspectHermes(f.home,f.agent).skills.find(x=>x.origin==='external').shadowed);
});
test('Hub ownership binds name to its exact installation path',t=>{
 const f=fixture(t);skill(join(f.agent,'skills/category'),'hub');mkdirSync(join(f.agent,'skills/.hub'));writeFileSync(join(f.agent,'skills/.hub/lock.json'),JSON.stringify({installed:{hub:{install_path:'category/hub',source:'github'}}}));
 let s=inspectHermes(f.home,f.agent);assert.equal(s.skills[0].origin,'hub');
 skill(join(f.agent,'skills/other'),'hub');s=inspectHermes(f.home,f.agent);assert.equal(s.skills.find(x=>x.relativePath==='other/hub').origin,'local');
});
test('YAML settings edits preserve comments, unknown fields, channel disabling and skill content',t=>{
 const f=fixture(t),path=skill(join(f.agent,'skills'),'one');config(f,'# keep comment\nmodel: private-secret\nskills:\n  platform_disabled:\n    telegram: [one]\n  custom: keep\n');
 const before=readFileSync(join(path,'SKILL.md')),s=inspectHermes(f.home,f.agent);
 const p=prepare(f,{kind:'settings',revision:s.revision,externalDirs:['relative'],createDir:'created',projectDiscovery:false,trustedProjects:[],autoLoad:['one']});assert.equal(p.status,0,p.stderr);
 const content=JSON.parse(p.stdout).content;assert(content.includes('# keep comment'));assert(content.includes('private-secret'));assert(content.includes('telegram'));assert(content.includes('custom: keep'));assert.deepEqual(readFileSync(join(path,'SKILL.md')),before);
 assert.equal(readFileSync(join(f.agent,'config.yaml'),'utf8').includes('auto_load'),false,'preparation itself cannot mutate files');
});
test('enable and preload are independent; essential skill cannot be disabled',t=>{
 const f=fixture(t);skill(join(f.agent,'skills'),'one');skill(join(f.agent,'skills'),'hermes-agent');config(f,'skills:\n  disabled: [hermes-agent, one]\n');let s=inspectHermes(f.home,f.agent);
 const essential=s.skills.find(x=>x.name==='hermes-agent');assert.equal(essential.enabled,true);assert.equal(essential.canToggle,false);
 const disabled=s.skills.find(x=>x.name==='one');assert.equal(disabled.canPreload,true);
 const preload=prepare(f,{kind:'preload',revision:s.revision,file:disabled.file,documentRevision:disabled.documentRevision,enabled:true});assert.equal(preload.status,0,preload.stderr);
 writeFileSync(join(f.agent,'config.yaml'),JSON.parse(preload.stdout).content);s=inspectHermes(f.home,f.agent);assert.equal(s.skills.find(x=>x.name==='one').enabled,false);assert.equal(s.skills.find(x=>x.name==='one').autoLoad,true);
 const row=s.skills.find(x=>x.name==='one');const result=prepare(f,{kind:'toggle',revision:s.revision,file:row.file,documentRevision:row.documentRevision,enabled:true});assert.equal(result.status,0,result.stderr);writeFileSync(join(f.agent,'config.yaml'),JSON.parse(result.stdout).content);
 s=inspectHermes(f.home,f.agent);assert.equal(s.skills.find(x=>x.name==='one').enabled,true);assert.deepEqual(s.autoLoad,['one']);
});
test('stale revisions, non-Git trust and aliased config refuse edits without secret leakage',t=>{
 const f=fixture(t);config(f,'secret: DO_NOT_LEAK\nskills: {}\n');const change={kind:'settings',revision:'stale',externalDirs:[],createDir:'',projectDiscovery:true,trustedProjects:[],autoLoad:[]};let r=prepare(f,change);assert.notEqual(r.status,0);assert(!r.stderr.includes('DO_NOT_LEAK'));
 const s=inspectHermes(f.home,f.agent);r=prepare(f,{...change,revision:s.revision,trustedProjects:[f.project]});assert.notEqual(r.status,0);assert(r.stderr.includes('Trust a Git'));
 config(f,'settings: &shared {}\nskills: *shared\n');r=prepare(f,{...change,revision:inspectHermes(f.home,f.agent).revision});assert.notEqual(r.status,0);
});
test('support directories and symlink cycles do not create duplicate inventory',t=>{
 const f=fixture(t),root=join(f.agent,'skills');skill(root,'one');skill(join(root,'one/references'),'hidden');if(process.platform!=='win32')symlinkSync(root,join(root,'cycle'),'dir');assert.deepEqual(inspectHermes(f.home,f.agent).skills.map(x=>x.name),['one']);
});

test('native versions use exact bundled and Hub records without inventing a release',t=>{
 const f=fixture(t);skill(join(f.agent,'skills'),'builtin');skill(join(f.agent,'skills/category'),'hub');skill(join(f.agent,'skills'),'custom');
 writeFileSync(join(f.agent,'skills/.bundled_manifest'),'builtin:1234567890abcdef\ncustom\n');
 mkdirSync(join(f.agent,'skills/.hub'));writeFileSync(join(f.agent,'skills/.hub/lock.json'),JSON.stringify({installed:{hub:{install_path:'category/hub',content_hash:'content-hash',metadata:{source_revision:'source-revision'}}}}));
 let s=inspectHermes(f.home,f.agent);assert.equal(s.skills.find(x=>x.name==='builtin').version,'1234567890abcdef');assert.equal(s.skills.find(x=>x.name==='hub').version,'source-revision');assert.equal(s.skills.find(x=>x.name==='custom').version,null);
 writeFileSync(join(f.agent,'skills/.hub/lock.json'),JSON.stringify({installed:{hub:{install_path:'category/hub',content_hash:'content-hash'}}}));s=inspectHermes(f.home,f.agent);assert.equal(s.skills.find(x=>x.name==='hub').version,'content-hash');
});

test('batch validates every item before preparing one YAML edit and preserves unrelated values',t=>{
 const f=fixture(t);skill(join(f.agent,'skills'),'one');skill(join(f.agent,'skills/category'),'two');
 config(f,'# keep\nskills:\n  custom: retained\n  disabled: [one, category/two]\n');
 const before=readFileSync(join(f.agent,'config.yaml'),'utf8'),s=inspectHermes(f.home,f.agent);
 const changes=s.skills.map(row=>({kind:'toggle',file:row.file,documentRevision:row.documentRevision,enabled:true}));
 let result=prepare(f,{kind:'batch',revision:s.revision,changes:[...changes,{...changes[0],documentRevision:'stale'}]});
 assert.notEqual(result.status,0);assert.equal(result.stdout,'');assert.equal(readFileSync(join(f.agent,'config.yaml'),'utf8'),before);
 result=prepare(f,{kind:'batch',revision:s.revision,changes});assert.equal(result.status,0,result.stderr);
 const content=JSON.parse(result.stdout).content;assert(content.includes('# keep'));assert(content.includes('custom: retained'));
 assert.equal(readFileSync(join(f.agent,'config.yaml'),'utf8'),before);
 writeFileSync(join(f.agent,'config.yaml'),content);let saved=inspectHermes(f.home,f.agent);assert(saved.skills.every(row=>row.enabled));
 result=prepare(f,{kind:'batch',revision:saved.revision,changes:saved.skills.map(row=>({kind:'preload',file:row.file,documentRevision:row.documentRevision,enabled:true}))});assert.equal(result.status,0,result.stderr);
 writeFileSync(join(f.agent,'config.yaml'),JSON.parse(result.stdout).content);saved=inspectHermes(f.home,f.agent);assert(saved.skills.every(row=>row.autoLoad));assert.deepEqual(saved.autoLoad.sort(),s.skills.map(row=>row.loadName).sort());
});
