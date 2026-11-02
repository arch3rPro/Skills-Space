import assert from 'node:assert/strict';
import test from 'node:test';
import { canAgentSkillAction, skillAgentState, type AgentSkillAction } from './agent-skill-actions.ts';
import { mergeDshStates, type DshSnapshot } from './dsh.ts';
import type { InstalledSkill, Inventory } from './upstream.ts';

const managed: InstalledSkill = {
  name:'shared',path:'/shared',agents:['pi','hermes-agent','deepseek-harness'],source:null,sourceUrl:null,description:'fixture',cliManaged:true,shared:true,
  piState:{path:'/shared',file:'/shared/SKILL.md',rulePath:'/shared/SKILL.md',name:'shared',description:'fixture',enabled:true,canToggle:true,reason:null,blockingRules:[],settingsPath:'/pi/settings.json',scope:'global',packageIndex:null,packageSource:null,origin:'directory',manualOnly:false,cliAddressable:true,canSetVisibility:true,canTrash:true},
  hermesState:{path:'/shared',file:'/shared/SKILL.md',name:'shared',description:'fixture',origin:'project',inScope:true,enabled:true,autoLoad:false,canToggle:true,canPreload:true,reason:'untrusted',loadName:null,documentRevision:'revision',cliAddressable:true},
  dshState:{file:'/shared/SKILL.md',source:'user-agents',modelInvocable:true,userInvocable:true,shadowed:false,cliAddressable:true,configured:false,reason:null,canSetInvocation:true,canSetPolicy:true,canTrash:true},
};

test('only the explicitly selected Agent contributes state, including managed and untrusted records',()=>{
  assert.deepEqual(skillAgentState(managed,'pi'),{codex:null,pi:managed.piState,hermes:null,dsh:null});
  assert.deepEqual(skillAgentState(managed,'hermes-agent'),{codex:null,pi:null,hermes:managed.hermesState,dsh:null});
  assert.deepEqual(skillAgentState(managed,'deepseek-harness'),{codex:null,pi:null,hermes:null,dsh:managed.dshState});
  for(const agent of [null,'codex','unknown'])assert.deepEqual(skillAgentState(managed,agent),{codex:null,pi:null,hermes:null,dsh:null});
  assert.equal(skillAgentState({...managed,agents:['pi']},'hermes-agent').hermes,null);
});

test('managed skills allow configuration-only actions but reject every native content mutation',()=>{
  for(const [agent,action] of [['pi','pi-toggle'],['pi','pi-invocation'],['hermes-agent','hermes-toggle'],['hermes-agent','hermes-preload'],['deepseek-harness','dsh-invocation']] as const)assert.equal(canAgentSkillAction(managed,agent,action),true);
  for(const [agent,action] of [['pi','pi-trash'],['deepseek-harness','dsh-trash']] as const)assert.equal(canAgentSkillAction(managed,agent,action),false);
});

test('Agent-specific actions cannot be invoked from another Agent or the all-Agent view',()=>{
  const actions: [string,AgentSkillAction][]=[['pi','pi-toggle'],['pi','pi-invocation'],['hermes-agent','hermes-toggle'],['hermes-agent','hermes-preload'],['deepseek-harness','dsh-invocation']];
  for(const [owner,action] of actions)for(const context of [null,'pi','hermes-agent','deepseek-harness','codex'])if(context!==owner)assert.equal(canAgentSkillAction(managed,context,action),false);
});

test('batch eligibility is evaluated per action, preserving readonly and mixed-ownership restrictions',()=>{
  const nativePi: InstalledSkill={...managed,cliManaged:false,shared:false,agents:['pi'],hermesState:null,dshState:null,piState:{...managed.piState!,cliAddressable:false}};
  const selection=[managed,nativePi];
  assert.equal(selection.every(skill=>canAgentSkillAction(skill,'pi','pi-toggle')),true);
  assert.equal(selection.every(skill=>canAgentSkillAction(skill,'pi','pi-invocation')),true);
  assert.equal(canAgentSkillAction(nativePi,'pi','pi-invocation'),true);
  assert.equal(canAgentSkillAction(nativePi,'pi','pi-trash'),true);
  const readonly={...managed,piState:{...managed.piState!,canToggle:false}};
  assert.equal([managed,readonly].every(skill=>canAgentSkillAction(skill,'pi','pi-toggle')),false);
  assert.equal(canAgentSkillAction({...managed,hermesState:{...managed.hermesState!,canPreload:false}},'hermes-agent','hermes-preload'),false);
});

test('independent DSH file operations retain their context, ownership and shared-file protections',()=>{
  const native: InstalledSkill={...managed,cliManaged:false,shared:false,agents:['deepseek-harness'],piState:null,hermesState:null,dshState:{...managed.dshState!,cliAddressable:false}};
  for(const action of ['dsh-invocation','dsh-trash'] as const){
    assert.equal(canAgentSkillAction(native,'deepseek-harness',action),true);
    assert.equal(canAgentSkillAction(native,'pi',action),false);
    assert.equal(canAgentSkillAction({...native,shared:true},'deepseek-harness',action),action==='dsh-invocation');
    assert.equal(canAgentSkillAction({...native,cliManaged:true},'deepseek-harness',action),action==='dsh-invocation');
  }
});


test('managed Pi visibility changes are configuration-only and scoped to Pi',()=>{
 const skill={...managed,piState:{...managed.piState!,canSetVisibility:true}};
 assert.equal(canAgentSkillAction(skill,'pi','pi-invocation'),true);
 for(const context of [null,'codex','deepseek-harness']) assert.equal(canAgentSkillAction(skill,context,'pi-invocation'),false);
 assert.equal(canAgentSkillAction(skill,'pi','pi-trash'),false);
 assert.equal(canAgentSkillAction({...skill,piState:{...skill.piState,canSetVisibility:false}},'pi','pi-invocation'),false);
});

test('DSH managed initial inventory hydrates policy fields omitted by the typed native state',()=>{
  const {canSetPolicy:omitted,...typed}=managed.dshState!;assert.equal(omitted,true);
  const raw={...managed,dshState:typed};
  const full={...managed.dshState!,path:managed.path,name:managed.name,description:'Fixture',documentRevision:'document',inScope:false,sourceModelInvocable:false,sourceUserInvocable:true,modelInvocable:false,userInvocable:true,policyEnabled:true};
  const snapshot:DshSnapshot={dshHome:'/dsh',sharedHome:'/agents',projectRoot:'/repo',canonicalRoot:'/repo/.agents/skills',roots:[],skills:[full],profiles:[],configurations:[],warnings:[],installIssue:null,contextIssue:null,contextKey:'all',runtimeVersion:null,writableVersion:true,revision:'fixture',runtimeVerified:false};
  const inventory:Inventory={version:'1',agents:[],skills:[raw],warnings:[],dsh:snapshot};
  assert.equal(canAgentSkillAction(raw,'deepseek-harness','dsh-invocation'),false,'typed native response alone has no policy qualification');
  const hydrated=mergeDshStates(inventory,snapshot)!.skills[0];
  assert.equal(hydrated.dshState,full);
  assert.equal(hydrated.dshState?.sourceModelInvocable,false);assert.equal(hydrated.dshState?.inScope,false);
  assert.equal(canAgentSkillAction(hydrated,'deepseek-harness','dsh-invocation'),true);
  assert.equal(canAgentSkillAction(hydrated,'deepseek-harness','dsh-trash'),false,'managed/shared file lifecycle remains protected');
  assert.equal(hydrated.piState,raw.piState);assert.equal(hydrated.hermesState,raw.hermesState);
  assert.equal(raw.dshState.canSetInvocation,true);assert.equal(raw.dshState.modelInvocable,true,'hydration does not mutate the original response');
});

test('DSH managed hydration matches inherited records by exact path and name without crossing Agent ownership',()=>{
  const inherited={...managed,dshState:null};
  const otherAgent={...inherited,agents:['pi']};
  const otherName={...inherited,name:'different-name'};
  const otherPath={...inherited,path:'/other/shared'};
  const full={...managed.dshState!,path:managed.path,name:managed.name,description:'Fixture',documentRevision:'document',inScope:false};
  const snapshot:DshSnapshot={dshHome:'/dsh',sharedHome:'/agents',projectRoot:'/repo',canonicalRoot:'/repo/.agents/skills',roots:[],skills:[full],profiles:[],configurations:[],warnings:[],installIssue:null,contextIssue:null,contextKey:'all',runtimeVersion:null,writableVersion:true,revision:'fixture',runtimeVerified:false};
  const inventory:Inventory={version:'1',agents:[],skills:[inherited,otherAgent,otherName,otherPath],warnings:[]};
  const hydrated=mergeDshStates(inventory,snapshot)!.skills;
  assert.equal(hydrated[0].dshState,full);assert.equal(canAgentSkillAction(hydrated[0],'deepseek-harness','dsh-invocation'),true);
  for(const row of hydrated.slice(1))assert.equal(row.dshState,null,'a missing state cannot be guessed from another name, path or Agent');
  for(const context of [null,'pi','hermes-agent','codex'])assert.equal(canAgentSkillAction(hydrated[0],context,'dsh-invocation'),false);
  assert.equal(canAgentSkillAction(hydrated[0],'deepseek-harness','dsh-trash'),false);
});
