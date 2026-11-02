import assert from "node:assert/strict";
import test from "node:test";
import { isPiRule, piEntries, piSettingsEntries, filterPiNativeSkills, piConfiguredDirectory, canTrashPiSkill, type PiSkillState } from "./pi.ts";
import { canRemove, removalTargetAgents, type InstalledSkill } from "./upstream.ts";
import { piPackageEnabled, piPackageDisplayName, piPackageSkills, type PiExtensionPackage, type PiResource } from "./pi-packages.ts";

test("package switch reflects any active resource across types without inventing package state", () => {
  const resource: PiResource = {id:"extension",path:"/pkg/demo.js",name:"demo",type:"extensions",enabled:false,override:null};
  const pkg: PiExtensionPackage = {id:"local:/pkg",source:"/pkg",scope:"user",kind:"local",path:"/pkg",name:"demo",description:"",version:null,inherited:false,delta:false,canRemove:true,canUpdate:false,resources:[]};
  assert.equal(piPackageEnabled(pkg),false);
  assert.equal(piPackageEnabled({...pkg,resources:[resource]}),false);
  assert.equal(piPackageEnabled({...pkg,resources:[resource,{...resource,id:"theme",type:"themes",enabled:true}]}),true);
  assert.equal(piPackageEnabled({...pkg,resources:[{...resource,enabled:true}]}),true);
  assert.equal(resource.enabled,false);
});

test("package display names shorten scoped names without changing package identity or source", () => {
  const pkg = {id:"npm:@juicesharp/rpiv-todo",source:"npm:@juicesharp/rpiv-todo@1.0.0",name:"@juicesharp/rpiv-todo"};
  const before = {...pkg};
  assert.equal(piPackageDisplayName(pkg),"rpiv-todo");
  assert.deepEqual(pkg,before);
  for (const name of ["plain-package","@scope","owner/nested/name","","@scope/a/b"]) assert.equal(piPackageDisplayName({name}),name);
});

test("package skill navigation matches real Pi file or directory identity and never same-name resources from another package", () => {
  const resource: PiResource = {id:"skill",path:"/one/skills/demo/SKILL.md",name:"demo",type:"skills",enabled:true,override:null};
  const pkg: PiExtensionPackage = {id:"local:/one",source:"/one",scope:"user",kind:"local",path:"/one",name:"one",description:"",version:null,inherited:false,delta:false,canRemove:true,canUpdate:false,resources:[resource,{...resource,id:"extension",path:"/two/skills/demo/SKILL.md",type:"extensions"}]};
  const base: InstalledSkill = {name:"demo",path:"/one/skills/demo",agents:["pi"],source:null,sourceUrl:null,description:"Real description"};
  const file = {...base,path:"/one/skills/demo/SKILL.md"};
  const windows = {...base,path:"\\one\\skills\\demo\\SKILL.md"};
  const otherPackage = {...base,path:"/two/skills/demo"};
  const otherAgent = {...base,agents:["codex"]};
  assert.deepEqual(piPackageSkills(pkg,[otherPackage,otherAgent,base,file,windows]),[base,file,windows]);
  assert.equal(piPackageSkills(pkg,[base])[0],base);
  const piState = {path:"/one/skills/demo",file:"/one/skills/demo/SKILL.md",rulePath:"/one/skills/demo/SKILL.md",name:"demo",description:"",enabled:true,canToggle:true,reason:null,blockingRules:[],settingsPath:"/settings",scope:"global" as const,packageIndex:0,packageSource:"/one",origin:"package",manualOnly:false,cliAddressable:false};
  const canonicalFile = {...base,path:"/alias/display-directory",piState};
  const wrongFile = {...base,piState:{...piState,file:"/two/skills/demo/SKILL.md"}};
  assert.deepEqual(piPackageSkills(pkg,[canonicalFile,wrongFile]),[canonicalFile]);
  assert.deepEqual(piPackageSkills({...pkg,resources:[{...resource,path:"/one/skills/demo"}]},[file]),[file]);
  assert.deepEqual(piPackageSkills({...pkg,resources:[]},[base]),[]);
});

test("inherited package skill metadata remains visible without project ownership and preserves original permissions", () => {
  const state: PiSkillState = {path:"/global/pkg/skills/demo",file:"/global/pkg/skills/demo/SKILL.md",rulePath:"/global/pkg/skills/demo/SKILL.md",name:"Inherited demo",description:"Original inherited description",enabled:true,canToggle:false,reason:"globalInProject",blockingRules:[],settingsPath:"/home/.pi/agent/settings.json",scope:"global",inScope:false,packageIndex:0,packageSource:"/global/pkg",origin:"package",manualOnly:false,cliAddressable:false,canTrash:false,canSetVisibility:false};
  const resource: PiResource = {id:"skill",path:state.file,name:"demo",type:"skills",enabled:true,override:"inherit"};
  const pkg: PiExtensionPackage = {id:"local:/global/pkg",source:"/global/pkg",scope:"user",kind:"local",path:"/global/pkg",name:"pkg",description:"",version:null,inherited:true,delta:false,canRemove:false,canUpdate:false,resources:[resource]};
  const before = {...state};
  const skills = piPackageSkills(pkg,[],[state,{...state,path:"/other/demo",file:"/other/demo/SKILL.md"}]);
  assert.equal(skills.length,1);assert.equal(skills[0].piState,state);assert.equal(skills[0].name,state.name);assert.equal(skills[0].path,state.path);assert.equal(skills[0].description,state.description);assert.equal(skills[0].source,state.packageSource);
  assert.equal(skills[0].piState?.canToggle,false);assert.equal(skills[0].piState?.inScope,false);assert.equal(skills[0].piState?.canTrash,false);assert.deepEqual(state,before);
  assert.equal(piPackageSkills(pkg,skills,[state]).length,1,'real inventory match takes precedence without duplication');
  const projectDelta: PiExtensionPackage = {...pkg,scope:"project",delta:true,inherited:false};
  assert.deepEqual(piPackageSkills(projectDelta,skills),skills,'project delta retains the resource identity of an inherited global skill');
  const unrelatedPackage = {...projectDelta,id:"another-package",resources:[{...resource,path:"/other/demo/SKILL.md"}]};
  assert.equal([unrelatedPackage,projectDelta].find(item=>piPackageSkills(item,skills).length>0)?.id,projectDelta.id,'owning package lookup follows the resource, even when configuration scopes differ');

  assert.deepEqual(piPackageSkills({...pkg,resources:[]},[],[state]),[]);
});

test("Pi paths remain separate from native rules without rewriting their values", () => {
  assert.equal(isPiRule("../team-skills"),false);
  for(const rule of ["!draft/**","-/tmp/a/SKILL.md","+/tmp/a/SKILL.md","skills/*"]){assert.equal(isPiRule(rule),true);}
  assert.deepEqual(piEntries([" ../team-skills ",""],"!draft/**\n\n-/tmp/a/SKILL.md"),["../team-skills","!draft/**","-/tmp/a/SKILL.md"]);
});
test("read-only settings rules survive unchanged and directory edits retain exact rule strings and order", () => {
  const original=["!/draft/**","../team-skills","+/exact/demo/SKILL.md","~/extra","-unusual/*.md","skills/??","!"];
  const rules=original.filter(isPiRule);
  assert.deepEqual(piSettingsEntries(original,["../team-skills","~/extra"]),original);
  assert.deepEqual(piSettingsEntries(original,["/new"]),["!/draft/**","/new","+/exact/demo/SKILL.md","-unusual/*.md","skills/??","!"]);
  const added=piSettingsEntries(original,["../team-skills","~/extra","/added"]);
  assert.deepEqual(added,[...original,"/added"]);
  assert.deepEqual(piSettingsEntries(original,[]),rules);
  assert.deepEqual(original,["!/draft/**","../team-skills","+/exact/demo/SKILL.md","~/extra","-unusual/*.md","skills/??","!"]);
});
test("Pi extra directory records cannot be passed to upstream removal as Pi targets", () => {
  const skill:InstalledSkill={name:"extra",path:"/extra",agents:["pi"],source:null,sourceUrl:null,description:"",piState:{path:"/extra",file:"/extra/SKILL.md",rulePath:"/extra/SKILL.md",name:"extra",description:"",enabled:false,canToggle:true,reason:null,blockingRules:[],settingsPath:"/settings.json",scope:"global",packageIndex:null,packageSource:null,origin:"configured",manualOnly:false,cliAddressable:false}};
  assert.deepEqual(removalTargetAgents(skill,"pi"),[]);
  assert.equal(canRemove([skill],["extra"],["pi"]),false);
  const shared={...skill,agents:["pi","codex"],cliAgents:["codex"]};
  assert.deepEqual(removalTargetAgents(shared,""),["codex"]);
  assert.equal(canRemove([shared],["extra"],["codex"]),true);
  assert.equal(canRemove([shared],["extra"],["pi"]),false);
});

test("Pi state reconciliation preserves same-name file identity, ordering and other Agent records", async () => {
  const {mergePiSkillStates}=await import("./pi.ts");
  const state={path:"/pi/one",file:"/pi/one/SKILL.md",rulePath:"/pi/one/SKILL.md",name:"demo",description:"",enabled:true,canToggle:true,reason:null,blockingRules:[],settingsPath:"/settings",scope:"global" as const,packageIndex:null,packageSource:null,origin:"directory",manualOnly:false,cliAddressable:false};
  const first:InstalledSkill={name:"demo",path:state.path,agents:["pi"],source:null,sourceUrl:null,description:"",piState:state};
  const other={...first,path:"/other/demo",agents:["codex"],piState:null};
  const same={...first,path:"/pi/two",piState:{...state,path:"/pi/two",file:"/pi/two/SKILL.md"}};
  const inventory={version:"1.7.2",agents:[],warnings:[],skills:[other,first,same]};
  const next=mergePiSkillStates(inventory,[{...state,enabled:false,manualOnly:true}]);
  assert.deepEqual(next?.skills.map(skill=>skill.path),inventory.skills.map(skill=>skill.path));
  assert.equal(next?.skills[0],other);assert.equal(next?.skills[2],same);
  assert.equal(next?.skills[1].piState?.enabled,false);assert.equal(next?.skills[1].piState?.manualOnly,true);
  assert.equal(first.piState?.enabled,true);assert.equal(mergePiSkillStates(null,[state]),null);
  const missing={...first,piState:null};
  assert.equal(mergePiSkillStates({...inventory,skills:[missing]},[state])?.skills[0].piState?.file,state.file);
});

test('native filtering combines status and exact package identity without changing source rows',()=>{
 const base={name:'example',description:'',path:'/example',agents:['pi'],shared:false,source:null,sourceUrl:null,sourceType:null,pluginName:null,issue:null,updateable:false,installSource:null,cliManaged:false,cliAgents:[],eveLocations:[],hermesOrigin:null};
 const state={path:base.path,file:'/example/SKILL.md',rulePath:'/example/SKILL.md',name:'example',description:'',enabled:true,canToggle:true,reason:null,blockingRules:[],settingsPath:'/settings.json',scope:'global' as const,packageIndex:null,packageSource:null,origin:'directory',manualOnly:false,cliAddressable:false,canTrash:true};
 const local={...base,piState:state};const a={...base,name:'a',piState:{...state,enabled:false,manualOnly:true,packageIndex:0,packageSource:'npm:one',origin:'package',canTrash:false}};const b={...a,name:'b',piState:{...a.piState,enabled:true,packageSource:'npm:two'}};
 const rows=[local,a,b];assert.deepEqual(filterPiNativeSkills(rows,'disabled','all'),[a]);assert.deepEqual(filterPiNativeSkills(rows,'manual','package:npm:two'),[b]);assert.deepEqual(filterPiNativeSkills(rows,'all','local'),[local]);assert.deepEqual(filterPiNativeSkills(rows,'auto','package:npm:two'),[]);assert.equal(rows.length,3);
 assert.equal(canTrashPiSkill({...local,piState:{...state,cliAddressable:true}}),false);assert.equal(canTrashPiSkill(local),true);assert.equal(canTrashPiSkill(a),false);assert.equal(canTrashPiSkill({...local,shared:true}),false);assert.equal(canTrashPiSkill({...local,agents:['pi','codex']}),false);
});


test("configured directory metadata uses the nearest containing path without prefix collisions",()=>{
 assert.equal(piConfiguredDirectory("/extra/team/demo/SKILL.md",["/extra","/extra/team"]),"/extra/team");
 assert.equal(piConfiguredDirectory("/extra-other/demo/SKILL.md",["/extra"]),null);
 assert.equal(piConfiguredDirectory(undefined,["/extra"]),null);
});


test("package review never treats local edits or missing history as update blockers", async () => {
  const { piPackageBlocker } = await import("./pi.ts");
  const item = {scope:"user",source:"npm:demo",root:"/npm/demo",status:"available",latest:"2.0.0",installed:"1.0.0",localState:"unverified",updateable:true,message:""};
  assert.equal(piPackageBlocker(item,true),null);
  assert.equal(piPackageBlocker({...item,localState:"modified"},true),null);
  assert.equal(piPackageBlocker({...item,reason:"ignoredFiles"},true),null);
  assert.match(piPackageBlocker({...item,updateable:false,status:"pinned"},true)!,/固定版本/);
  assert.match(piPackageBlocker({...item,updateable:false,reason:"incompleteUpdate"},true)!,/更新未完成/);
});

test("batch invocation filters no-ops and read-only rows per action", async()=>{
 const {piActionSkills}=await import("./pi.ts");
 const state={path:"/a",file:"/a/SKILL.md",rulePath:"/a/SKILL.md",name:"a",description:"",enabled:true,canToggle:true,canSetVisibility:true,reason:null,blockingRules:[],settingsPath:"/settings",scope:"project" as const,packageIndex:null,packageSource:null,origin:"directory",manualOnly:false,cliAddressable:false};
 const first:InstalledSkill={name:"a",path:state.path,agents:["pi"],source:null,sourceUrl:null,description:"",piState:state};
 const manual={...first,name:"b",piState:{...state,manualOnly:true,enabled:false}};
 const readonly={...first,name:"c",piState:{...state,canToggle:false,canSetVisibility:false}};
 const rows=[first,manual,readonly];
 assert.deepEqual(piActionSkills(rows,"auto"),[manual]);
 assert.deepEqual(piActionSkills(rows,"manual"),[first]);
 assert.deepEqual(piActionSkills(rows,"enable"),[manual]);
 assert.deepEqual(piActionSkills(rows,"disable"),[first]);
});
