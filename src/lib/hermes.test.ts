import assert from 'node:assert/strict';
import test from 'node:test';
import {hermesCardNotice,hermesInspectionWarnings,filterHermesSkills,hermesActionSkills,hermesSelection} from './hermes.ts';

test('cards retain actionable blockers without routine runtime-verification notices',()=>{
 for(const reason of ['scanUnverified','conditional','disabled',null])assert.equal(hermesCardNotice({reason}),false);
 for(const reason of ['untrusted','discoveryDisabled','ambiguous','shadowed'])assert.equal(hermesCardNotice({reason}),true);
});
test('inspection issues retain localized causes and paths without exposing unknown diagnostics',()=>{
 assert.deepEqual(hermesInspectionWarnings(['Invalid Hermes skill: /fixture/home/skills/one','Hermes Hub records could not be inspected.','Hermes skill inspection limit exceeded.'],'/fixture/home',true),[
  '技能文件无法解析 · ~/skills/one','无法读取 Hermes Hub 来源记录','目录内容过多，部分技能未读取',
 ]);
 assert.deepEqual(hermesInspectionWarnings(['Unexpected diagnostic PRIVATE_VALUE'],'/fixture/home',true),['部分技能未能读取，请检查目录和配置']);
 assert.deepEqual(hermesInspectionWarnings(['Cannot inspect Hermes skill directory: /fixture/home/skills'],'/fixture/home',false),['Cannot read skill directory · ~/skills']);
});




test('load filters exclude disabled skills even when preload remains configured',()=>{
 const base={path:'/demo',file:'/demo/SKILL.md',name:'demo',description:'fixture',origin:'local',inScope:true,enabled:true,autoLoad:false,canToggle:true,canPreload:true,reason:null,loadName:'demo',documentRevision:'revision',cliAddressable:true};
 const rows=[{name:'demand',hermesState:base},{name:'preload',hermesState:{...base,autoLoad:true}},{name:'disabled',hermesState:{...base,enabled:false,autoLoad:true,origin:'builtin'}}].map(row=>({...row,path:base.path,description:'fixture',agents:['hermes-agent'],source:null,sourceUrl:null}));
 assert.deepEqual(filterHermesSkills(rows,'ondemand','all').map(s=>s.name),['demand']);
 assert.deepEqual(filterHermesSkills(rows,'preload','all').map(s=>s.name),['preload']);
 assert.deepEqual(filterHermesSkills(rows,'disabled','builtin').map(s=>s.name),['disabled']);
 assert.equal(filterHermesSkills(rows,'enabled','all').length,2);
});

test('bulk mode changes submit only editable changed items',()=>{
 const state={path:'/demo',file:'/demo/SKILL.md',name:'demo',description:'fixture',origin:'local',inScope:true,enabled:false,autoLoad:false,canToggle:true,canPreload:false,reason:'disabled',loadName:'demo',documentRevision:'revision',cliAddressable:true};
 const row={name:'already-demand',path:'/demo',description:'fixture',agents:['hermes-agent'],source:null,sourceUrl:null,hermesState:state};
 const preloaded={...row,name:'preloaded',hermesState:{...state,autoLoad:true,canPreload:true}};
 const selection=[row,preloaded];
 assert.deepEqual(hermesActionSkills(selection,'preload',false),[preloaded]);
 assert.deepEqual(hermesActionSkills(selection,'preload',true),[],'an uneditable target is never submitted');
 assert.equal(hermesActionSkills(selection,'toggle',false).length,0);
 assert.deepEqual(hermesActionSkills(selection,'toggle',true),selection);
 assert.equal(row.hermesState.autoLoad,false);assert.equal(preloaded.hermesState.autoLoad,true);
});

test('essential skills do not block editable selected skills or get disabled by bulk actions',()=>{
 const state={path:'/native',file:'/native/SKILL.md',name:'native',description:'fixture',origin:'builtin',inScope:true,enabled:true,autoLoad:false,canToggle:true,canPreload:true,reason:null,loadName:'native',documentRevision:'revision',cliAddressable:false};
 const normal={name:'native',path:state.path,description:'fixture',agents:['hermes-agent'],source:null,sourceUrl:null,hermesOrigin:'builtin' as const,hermesState:state};
 const essential={...normal,name:'hermes-agent',hermesState:{...state,name:'hermes-agent',canToggle:false}};
 assert.deepEqual(hermesActionSkills([essential,normal],'toggle',false),[normal]);
 assert.deepEqual(hermesActionSkills([essential,normal],'preload',true),[essential,normal]);
 assert.equal(essential.hermesState.enabled,true);
});
test('managed name selection and native file selection stay separate across matching names and filters',()=>{
 const state={path:'/native',file:'/native/SKILL.md',name:'same',description:'fixture',origin:'builtin',inScope:true,enabled:true,autoLoad:false,canToggle:true,canPreload:true,reason:null,loadName:'same',documentRevision:'revision',cliAddressable:false};
 const native={name:'same',path:state.path,description:'fixture',agents:['hermes-agent'],source:null,sourceUrl:null,hermesOrigin:'builtin' as const,hermesState:state};
 const managed={...native,path:'/managed',cliManaged:true,hermesOrigin:null,hermesState:{...state,path:'/managed',file:'/managed/SKILL.md',origin:'local',cliAddressable:true}};
 const rows=[native,managed,{...managed,name:'outside-search'}];
 assert.deepEqual(hermesSelection(rows,['same','outside-search'],'managed'),[managed,rows[2]]);
 assert.deepEqual(hermesSelection(rows,['same','/native/SKILL.md'],'agent'),[native]);
 assert.deepEqual(hermesSelection(rows,['same'],'agent'),[]);
});
