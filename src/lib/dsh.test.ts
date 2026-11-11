import test from 'node:test';
import assert from 'node:assert/strict';
import { canChangeDsh, dshInvocation, invocationPolicy, mergeDshStates, dshPresetText, dshSkillsPath, dshHomeFromSkillsPath, dshCreationUnavailableReason, dshDirectoryStatus, dshSelectConfiguration, dshPresetConfigurations, dshSelectPreset, dshPresetContextKey, dshFileContextKey, dshNativeContext, dshSelectFileContext, dshScopeKey, createDshContextWriter, dshNativePresetChoices, dshDiscoveredSkills, dshBatchEligibility, filterDshSkills, dshMatchesMembership, normalizeDshFilters } from './dsh.ts';
import type { DshConfiguration, DshPreset, DshSkillState, DshSnapshot } from './dsh.ts';
import type { InstalledSkill, Inventory, Target } from './upstream.ts';
const state:DshSkillState={file:'/own/alpha/SKILL.md',source:'user-dsh',modelInvocable:true,userInvocable:true,shadowed:false,cliAddressable:false,configured:false,reason:null,canSetInvocation:true,canSetPolicy:true,canTrash:true};
const skill:InstalledSkill={name:'alpha',path:'/own/alpha',agents:['deepseek-harness'],shared:false,source:null,sourceUrl:null,description:'Fixture',updateable:false,installSource:null,eveLocations:[],cliManaged:false,cliAgents:[],dshState:state};
const settingsRow=(key:string,path:string,preset:string|null,extra:Partial<DshConfiguration>={}):DshConfiguration=>({key,path,profile:'same-profile',preset,provider:'filesystem',entryId:'skills',disabled:false,includeDefaultRoots:true,agentsHome:null,dshHome:null,customSkillDirs:[],watch:false,dynamic:false,editable:true,readOnlyReason:null,...extra});
const declaredPreset=(key:string,path:string,preset:string,extra:Partial<DshPreset>={}):DshPreset=>({key,path,profile:'web',installation:'cli',preset,configurationKeys:[],directoryStatus:'none',disabled:false,...extra});
test('DSH declared preset selection retains minimal and custom presets without a directory provider',()=>{
  const minimal=declaredPreset('minimal-key','/one/cordis.patch.yml','minimal');
  const standard=declaredPreset('standard-key',minimal.path,'standard',{configurationKeys:['provider-one'],directoryStatus:'available'});
  const otherMinimal=declaredPreset('other-minimal','/two/cordis.patch.yml','minimal');
  const custom=declaredPreset('custom-key','/custom/cordis.patch.yml','review',{presetName:'Custom review',presetDescription:'Uses tools without file skill directories'});
  assert.equal(dshSelectPreset([standard,minimal,otherMinimal,custom],minimal,otherMinimal.path),otherMinimal);
  assert.equal(dshSelectPreset([standard,minimal,custom],minimal,custom.path),custom,'A custom declaration remains selectable without a provider');
  assert.equal(dshSelectPreset([standard,minimal,custom],minimal,'/missing/cordis.patch.yml'),undefined);
  assert.equal(dshPresetContextKey(minimal,[settingsRow('host',minimal.path,null),settingsRow('provider-one',minimal.path,'standard')]),minimal.key,'A no-directory preset must not inherit Host or another preset’s provider');
});
test('DSH preset context keys preserve associated legacy provider identity without synthesizing directory capabilities',()=>{
  const first=settingsRow('provider-one','/one/cordis.patch.yml','standard');
  const second=settingsRow('provider-two',first.path,'standard',{entryId:'secondary',provider:'secondary'});
  const unrelated=settingsRow('other',first.path,'review');
  const preset=declaredPreset('standard-key',first.path,'standard',{configurationKeys:[first.key,second.key],directoryStatus:'available'});
  assert.equal(dshPresetContextKey(preset,[unrelated,first,second],second),second.key);
  assert.equal(dshPresetContextKey(preset,[unrelated,first,second]),first.key);
  assert.equal(dshPresetContextKey({...preset,configurationKeys:[],directoryStatus:'none'},[first,second]),preset.key,'Raw provider rows cannot populate a declaration with no association');
});
test('DSH known no-directory and opaque presets have neutral directory and creation explanations',()=>{
  const preset=declaredPreset('minimal-key','/one/cordis.patch.yml','minimal');
  const snapshot:DshSnapshot={dshHome:'/dsh',sharedHome:'/agents',projectRoot:null,canonicalRoot:'/agents/skills',roots:[],skills:[],profiles:['web'],configurations:[],configurationPath:preset.path,presets:[preset],presetKey:preset.key,contextKey:preset.key,warnings:[],installIssue:null,contextIssue:null,runtimeVersion:'0.2.1-rc.3',writableVersion:true,revision:'fixture',runtimeVerified:false};
  assert.match(dshDirectoryStatus(snapshot,false),/This preset has no skill directories/);
  assert.match(dshCreationUnavailableReason(snapshot,false)!,/This preset has no skill directories/);
  const opaque={...snapshot,presets:[{...preset,directoryStatus:'unknown' as const}]};
  assert.match(dshDirectoryStatus(opaque,false),/Could not read this preset/);
  assert.match(dshCreationUnavailableReason(opaque,false)!,/could not be read/);
  assert.notEqual(dshDirectoryStatus(snapshot,true),dshDirectoryStatus(opaque,true),'Unknown declarations cannot be presented as confirmed absence');
});
test('DSH settings file selection retains preset and provider identity without crossing file boundaries',()=>{
  const current=settingsRow('old','/one/cordis.patch.yml','standard',{provider:'secondary',entryId:'second'});
  const wrongFile=settingsRow('wrong-file',current.path,'standard',{provider:'secondary',entryId:'second'});
  const otherPreset=settingsRow('other-preset','/two/cordis.patch.yml','cordis',{provider:'secondary',entryId:'second'});
  const otherProvider=settingsRow('other-provider','/two/cordis.patch.yml','standard');
  const next=settingsRow('next','/two/cordis.patch.yml','standard',{provider:'secondary',entryId:'second',presetName:'My own standard',presetDescription:'Published custom purpose'});
  const rows=[wrongFile,otherPreset,otherProvider,next];
  assert.equal(dshSelectConfiguration(rows,current,next.path),next);
  assert.deepEqual(dshPresetText(dshSelectConfiguration(rows,current,next.path)!,true),{name:'My own standard',description:'Published custom purpose'});
  assert.equal(dshSelectConfiguration(rows,current,'/missing/cordis.patch.yml'),undefined);
  assert.equal(dshSelectConfiguration([],current,next.path),undefined);
});
test('DSH settings fall back within a selected file only when its previous preset is unavailable',()=>{
  const current=settingsRow('old','/one/cordis.patch.yml','standard');
  const disabled=settingsRow('disabled','/two/cordis.patch.yml','cordis',{disabled:true});
  const enabled=settingsRow('enabled',disabled.path,'ptc');
  const originalRows=[current,disabled,enabled];
  assert.equal(dshSelectConfiguration(originalRows,current,disabled.path),enabled);
  assert.equal(dshSelectConfiguration(originalRows,undefined,disabled.path),enabled);
  assert.equal(dshSelectConfiguration([current,disabled],current,disabled.path),disabled,'A disabled provider remains available for configuration management');
  assert.equal(dshSelectConfiguration(originalRows,current,disabled.path,'standard'),undefined,'An explicit missing preset must not silently select another preset');
  assert.deepEqual(originalRows.map(row=>row.key),['old','disabled','enabled'],'Selection does not mutate configuration order');
});
test('DSH settings exclude Host providers from preset selection while retaining a literal null preset id',()=>{
  const current=settingsRow('root','/one/cordis.patch.yml',null);
  const literal=settingsRow('literal',current.path,'null');
  const standard=settingsRow('standard',current.path,'standard');
  const rows=[literal,standard,current];
  assert.equal(dshSelectConfiguration(rows,literal,current.path,null),undefined,'A Host provider is not a selectable Agent preset');
  assert.equal(dshSelectConfiguration(rows,current,current.path,'null'),literal);
  assert.equal(dshSelectConfiguration(rows,current,current.path,'standard'),standard);
  assert.equal(dshSelectConfiguration(rows,current,current.path),literal,'An old Host selection moves to a real preset in the same file');
  assert.equal(dshSelectConfiguration([current],current,current.path),undefined,'A Host-only file must not fabricate a preset fallback');
});
test('DSH preset choices filter null and blank ids without deleting or mutating raw configurations',()=>{
  const host=settingsRow('host','/one/cordis.patch.yml',null);
  const empty=settingsRow('empty',host.path,'');
  const whitespace=settingsRow('space',host.path,' \t');
  const literal=settingsRow('literal',host.path,'null');
  const valid=settingsRow('valid',host.path,'standard');
  const rows=[host,empty,whitespace,literal,valid];
  assert.deepEqual(dshPresetConfigurations(rows),[literal,valid]);
  assert.deepEqual(rows.map(row=>row.key),['host','empty','space','literal','valid']);
  assert.equal(dshSelectConfiguration(rows,host,host.path),literal);
  assert.equal(dshSelectConfiguration([host,settingsRow('elsewhere','/elsewhere/cordis.patch.yml','standard')],host,host.path),undefined,'Root-only file selection cannot move to another file');
});
test('DSH settings retain the selected provider but otherwise prefer an enabled provider of the chosen preset',()=>{
  const current=settingsRow('current','/one/cordis.patch.yml','standard',{provider:'secondary',entryId:'second'});
  const primary=settingsRow('primary',current.path,'ptc');
  const sameProviderDisabled=settingsRow('same-disabled',current.path,'ptc',{provider:'secondary',entryId:'different',disabled:true});
  const sameProviderEnabled=settingsRow('same-enabled',current.path,'ptc',{provider:'secondary',entryId:'another'});
  assert.equal(dshSelectConfiguration([primary,sameProviderDisabled,sameProviderEnabled],current,current.path,'ptc'),sameProviderEnabled);
  const exact=settingsRow('exact',current.path,'ptc',{provider:'secondary',entryId:'second',disabled:true});
  assert.equal(dshSelectConfiguration([primary,sameProviderEnabled,exact],current,current.path,'ptc'),exact,'Management keeps a specifically selected provider even when it is disabled');
});
test('DSH complete skill directories roundtrip to HOME without changing filesystem root identity',()=>{
  for(const [home,path] of [['/home/fixture/.dsh','/home/fixture/.dsh/skills'],['/','/skills'],['C:\\','C:\\skills'],['C:/','C:/skills'],['C:\\Fixture Home\\.dsh','C:\\Fixture Home\\.dsh\\skills'],['\\\\server\\share','\\\\server\\share\\skills']] as const){
    assert.equal(dshSkillsPath(home),path);
    assert.equal(dshHomeFromSkillsPath(path),home);
    assert.equal(dshHomeFromSkillsPath(`  ${path}${path.includes('\\')?'\\':'/'}  `),home);
    assert.equal(dshSkillsPath(dshHomeFromSkillsPath(path)!),path,'Editing the complete path must not append skills twice');
  }
  for(const invalid of ['/home/fixture/.dsh','/skills-extra','/home/skills/nested','C:\\Fixture Home','skills'])assert.equal(dshHomeFromSkillsPath(invalid),null);
});
test('DSH preset display preserves published custom metadata and distinguishes root configuration from a literal null id',()=>{
  for(const zh of [true,false]){
    assert.deepEqual(dshPresetText({preset:'standard',presetName:'My own standard',presetDescription:'Custom task'},zh),{name:'My own standard',description:'Custom task'});
    assert.deepEqual(dshPresetText({preset:'custom',presetDescription:'Published description'},zh),{name:'custom',description:'Published description'});
    assert.deepEqual(dshPresetText({preset:'constructor'},zh),{name:'constructor',description:null},'A valid custom id must not resolve inherited Object properties as built-in copy');
    assert.deepEqual(dshPresetText({preset:'custom',presetName:'   ',presetDescription:'\t '},zh),{name:'custom',description:null});
    assert.deepEqual(dshPresetText({preset:'standard',presetName:'',presetDescription:'   '},zh),dshPresetText({preset:'standard'},zh));
    assert.deepEqual(dshPresetText({preset:'custom',presetName:'  Published name  ',presetDescription:'  Published purpose  '},zh),{name:'  Published name  ',description:'  Published purpose  '});
    assert.deepEqual(dshPresetText({preset:'null'},zh),{name:'null',description:null});
    assert.deepEqual(dshPresetConfigurations([settingsRow('host','/one/cordis.patch.yml',null)]),[],'Host configuration has no Agent preset label');
    assert.notEqual(dshPresetText({preset:'standard'},zh).name,'standard','Upstream localizes unnamed shipped preset ids');
  }
});
test('DSH independent policy permits shared/managed resources while file trash protection remains intact',()=>{
  for(const policy of ['both','manual','model','none'] as const)assert.equal(dshInvocation({...state,...invocationPolicy(policy)}),policy);
  assert.equal(canChangeDsh(skill,'invocation'),true);assert.equal(canChangeDsh(skill,'trash'),true);
  for(const protectedSkill of [{...skill,dshState:{...state,cliAddressable:true,canTrash:false}},{...skill,shared:true},{...skill,cliManaged:true},{...skill,agents:['deepseek-harness','codex']},{...skill,dshState:{...state,canSetInvocation:false,canTrash:false,inScope:false}}]){
    assert.equal(canChangeDsh(protectedSkill,'invocation'),true,'independent policy never edits these source files');
    assert.equal(canChangeDsh(protectedSkill,'trash'),false,'source lifecycle protection is unchanged');
  }
  assert.equal(canChangeDsh({...skill,dshState:{...state,canSetPolicy:false}},'invocation'),false);
});

test('DSH batch eligibility distinguishes source restrictions for each policy action and deduplicates files',()=>{
  const both={...skill,name:'both',dshState:{...state,file:'/both',sourceModelInvocable:true,sourceUserInvocable:true}};
  const model={...skill,name:'model',dshState:{...state,file:'/model',sourceModelInvocable:true,sourceUserInvocable:false}};
  const manual={...skill,name:'manual',dshState:{...state,file:'/manual',sourceModelInvocable:false,sourceUserInvocable:true}};
  const neither={...skill,name:'neither',dshState:{...state,file:'/neither',sourceModelInvocable:false,sourceUserInvocable:false}};
  const input=[both,model,manual,neither,{...both}].map(row=>({...row,dshState:{...row.dshState,hasPolicyOverride:true}}));
  assert.deepEqual(dshBatchEligibility(input,'enable').eligible.map(row=>row.name),['both','model','manual']);
  assert.deepEqual(dshBatchEligibility(input,'both').eligible.map(row=>row.name),['both']);
  assert.deepEqual(dshBatchEligibility(input,'model').eligible.map(row=>row.name),['both','model']);
  assert.deepEqual(dshBatchEligibility(input,'manual').eligible.map(row=>row.name),['both','manual']);
  assert.deepEqual(dshBatchEligibility(input,'disable').eligible.map(row=>row.name),['both','model','manual','neither']);
  assert.equal(dshBatchEligibility(input,'enable').excluded.find(row=>row.skill.name==='neither')?.reason,'source');
  assert.equal(dshBatchEligibility(input,'enable').excluded.slice(-1)[0]?.reason,'duplicate');
});

test('DSH explicit channel actions preserve total-disable and source restrictions for both on and off',()=>{
  const both={...skill,name:'both',dshState:{...state,file:'/both',policyEnabled:true,sourceModelInvocable:true,sourceUserInvocable:true}};
  const model={...skill,name:'model',dshState:{...state,file:'/model',policyEnabled:true,modelInvocable:true,userInvocable:false,sourceModelInvocable:true,sourceUserInvocable:false}};
  const manual={...skill,name:'manual',dshState:{...state,file:'/manual',policyEnabled:true,modelInvocable:false,userInvocable:true,sourceModelInvocable:false,sourceUserInvocable:true}};
  const stopped={...both,name:'stopped',dshState:{...both.dshState,file:'/stopped',policyEnabled:false}};
  const inferredStopped={...skill,name:'inferred-stopped',dshState:{...state,file:'/inferred-stopped',modelInvocable:false,userInvocable:false}};
  const unqualified={...both,name:'unqualified',dshState:{...both.dshState,file:'/unqualified',canSetPolicy:false}};
  const input=[both,model,manual,stopped,inferredStopped,unqualified];
  for(const action of ['model-on','model-off','manual-on','manual-off'] as const){
    const result=dshBatchEligibility(input,action);
    assert.deepEqual(result.eligible.map(row=>row.name),action.startsWith('model')?['both','model']:['both','manual']);
    for(const name of ['stopped','inferred-stopped','unqualified'])assert.equal(result.excluded.find(row=>row.skill.name===name)?.reason,'unavailable');
    assert.equal(result.excluded.find(row=>row.skill.name===(action.startsWith('model')?'manual':'model'))?.reason,'source');
  }
  assert.equal(stopped.dshState.policyEnabled,false,'channel eligibility cannot re-enable a disabled skill');
});

test('DSH unified inventory filters preserve physical total and choose shadow state from matching memberships',()=>{
  const a={configurationPath:'/a.yml',presetKey:'a-standard',preset:'standard',contextKey:'a-provider',shadowed:false};
  const b={configurationPath:'/b.yml',presetKey:'b-ptc',preset:'ptc',contextKey:'b-provider',shadowed:true};
  const shared={...skill,dshState:{...state,memberships:[a,b],shadowed:false}};
  const onlyA={...skill,name:'a-only',path:'/a-only',dshState:{...state,file:'/a-only/SKILL.md',memberships:[a]}};
  const onlyB={...skill,name:'b-only',path:'/b-only',dshState:{...state,file:'/b-only/SKILL.md',memberships:[{...b,shadowed:false}]}};
  const inventory=[shared,onlyA,onlyB];
  assert.equal(filterDshSkills(inventory,'all','all').length,3);
  const filtered=filterDshSkills(inventory,'/b.yml','b-ptc');
  assert.deepEqual(filtered.map(row=>row.name),['alpha','b-only']);
  assert.equal(filtered[0].dshState?.shadowed,true);
  assert.equal(filterDshSkills(inventory,'/a.yml','a-standard')[0].dshState?.shadowed,false);
  assert.equal(inventory.length,3,'native total uses the original union, not the filtered card list');
  assert.equal(shared.dshState.shadowed,false,'local filters never mutate the source union');
  assert.equal(dshMatchesMembership([a,b],'/b.yml','a-standard'),false,'cascaded preset cannot leak across configurations');
  const roots=[{path:'/common',memberships:[a,b]},{path:'/a',memberships:[a]},{path:'/b',memberships:[b]}];
  assert.deepEqual(roots.filter(row=>dshMatchesMembership(row.memberships,'/b.yml','b-ptc')).map(row=>row.path),['/common','/b']);
});

test('DSH local filter normalization clears removed or mismatched choices without changing inventory context',()=>{
  const snapshot:DshSnapshot={dshHome:'/dsh',sharedHome:'/agents',projectRoot:null,canonicalRoot:'/agents/skills',roots:[],skills:[],profiles:['a','b'],configurationFiles:[{path:'/a.yml',profile:'a',exists:true},{path:'/b.yml',profile:'b',exists:true}],configurations:[],presets:[declaredPreset('a-standard','/a.yml','standard',{configurationKeys:['a-provider'],directoryStatus:'available'}),declaredPreset('b-standard','/b.yml','standard',{configurationKeys:['b-provider'],directoryStatus:'available'})],warnings:[],installIssue:null,contextIssue:null,contextKey:'all',runtimeVersion:null,writableVersion:true,revision:'fixture',runtimeVerified:false};
  assert.deepEqual(normalizeDshFilters(snapshot,'/removed.yml','a-standard'),{configuration:'all',preset:'all'});
  assert.deepEqual(normalizeDshFilters(snapshot,'/a.yml','removed'),{configuration:'/a.yml',preset:'all'});
  assert.deepEqual(normalizeDshFilters(snapshot,'/a.yml','b-standard'),{configuration:'/a.yml',preset:'all'});
  assert.deepEqual(normalizeDshFilters(snapshot,'/a.yml','a-standard'),{configuration:'/a.yml',preset:'a-standard'});
  assert.equal(snapshot.contextKey,'all');assert.equal(snapshot.configurationFiles?.length,2);
});

test('DSH all-configurations clears hidden preset filtering and reuses existing directory labels',async()=>{
  const {normalizeDshFilters,dshSourceLabel}=await import('./dsh.ts');
  assert.deepEqual(normalizeDshFilters(undefined,'all','stale-preset'),{configuration:'all',preset:'all'});
  for(const source of ['user-dsh','user-agents','configured-dsh','configured-agents'])assert.equal(dshSourceLabel({...state,source},true),'本地目录');
  for(const source of ['project-dsh','project-agents'])assert.equal(dshSourceLabel({...state,source},true),'项目目录');
  assert.equal(dshSourceLabel({...state,source:'custom'},true),'附加目录');
  assert.equal(dshSourceLabel({...state,source:'bundled'},true),'内置');
});

test('DSH policy confirmation follows inherited-file scope rather than ownership or action presentation',async()=>{
  const {dshPolicyNeedsConfirmation}=await import('./dsh.ts');
  const inherited={...skill,shared:true,cliManaged:true,dshState:{...state,inScope:false}};
  const local={...skill,dshState:{...state,inScope:true}};
  const global:Target={host:'local',scope:'global',projectPath:null},project:Target={host:'local',scope:'project',projectPath:'/repo'};
  assert.equal(dshPolicyNeedsConfirmation([inherited],global),false);
  assert.equal(dshPolicyNeedsConfirmation([local],project),false);
  assert.equal(dshPolicyNeedsConfirmation([inherited],project),true);
  assert.equal(dshPolicyNeedsConfirmation([local,inherited],project),true);
  assert.equal(dshPolicyNeedsConfirmation([],project),false);
});

test('DSH policy save feedback reflects when changes apply',async()=>{
  const {dshPolicySaveFeedback}=await import('./dsh.ts');
  const base:NonNullable<DshSnapshot['policy']>={status:'active',issue:null,configuration:null,policyFile:'/policy.json',revision:'v2',canInstall:false,canSave:true,providerCount:1};
  assert.equal(dshPolicySaveFeedback(base,true),'已保存');
  const applying={...base,status:'pending' as const,pendingReason:'apply' as const,running:true};
  const dormant={...base,status:'pending' as const,pendingReason:'reload' as const,running:false};
  const reload={...dormant,running:true};
  assert.equal(dshPolicySaveFeedback(applying,true),'已保存');
  assert.match(dshPolicySaveFeedback(dormant,true),/已保存.*下次/);
  assert.match(dshPolicySaveFeedback(reload,true),/已保存.*重启/);
});
test('DSH readback merges by physical file, preserving selection order and unrelated skill identity',()=>{
  const other={...skill,path:'/other/alpha',dshState:{...state,file:'/other/alpha/SKILL.md'}};const inventory:Inventory={version:'1',agents:[],skills:[other,skill],warnings:[]};
  const snapshot={skills:[{...state,...invocationPolicy('none'),path:skill.path,name:'alpha',description:'Fixture',inScope:true}]} satisfies Pick<DshSnapshot,'skills'>;
  // The merge consumes only skill rows; use a complete snapshot to retain the public contract.
  const complete:DshSnapshot={...snapshot,dshHome:'/dsh',sharedHome:'/agents',projectRoot:null,canonicalRoot:'/agents/skills',roots:[],profiles:[],configurations:[],warnings:[],installIssue:null,contextIssue:null,contextKey:null,runtimeVersion:'0.2.0-rc.2',writableVersion:true,revision:'revision',runtimeVerified:false};
  const merged=mergeDshStates(inventory,complete);assert.equal(merged?.skills[0],other);assert.equal(merged?.skills[1].dshState?.modelInvocable,false);assert.equal(inventory.skills[1].dshState?.modelInvocable,true);
});

test('DSH header directories use the scoped discovery roots including absent paths and no enabled roots',async()=>{
  const {dshSkillDirectories,dshScopeKey,dshDirectoryStatus}=await import('./dsh.ts');
  const roots:DshSnapshot['roots']=[
    {path:'/repo/.dsh/skills',source:'project-dsh',rank:100,contextKey:null,verified:true,inScope:true,exists:false},
    {path:'/extra',source:'custom',rank:300,contextKey:'web',verified:true,inScope:true,exists:true},
    {path:'/home/.dsh/skills',source:'user-dsh',rank:400,contextKey:null,verified:true,inScope:false,exists:true},
  ];
  const snapshot:DshSnapshot={dshHome:'/dsh',sharedHome:'/agents',projectRoot:'/repo',canonicalRoot:'/repo/.agents/skills',roots,skills:[],profiles:[],configurations:[],warnings:[],installIssue:null,contextIssue:null,contextKey:null,runtimeVersion:'0.2.0-rc.2',writableVersion:true,revision:'revision',runtimeVerified:false};
  assert.deepEqual(dshSkillDirectories(snapshot),roots.slice(0,2));
  assert.deepEqual(dshSkillDirectories({...snapshot,roots:[]}),[]);
  assert.deepEqual(dshSkillDirectories(null),[]);
  const noEnabled=dshDirectoryStatus({...snapshot,roots:[]},true);
  const unreadable=dshDirectoryStatus({...snapshot,roots:[],profiles:['web']},true);
  const unselected=dshDirectoryStatus({...snapshot,roots:[],profiles:['web'],configurations:[{key:'web:alpha',path:'/home/profile.yml',profile:'web',preset:'alpha',provider:'filesystem',disabled:false,includeDefaultRoots:true,agentsHome:null,dshHome:null,customSkillDirs:[],watch:true,dynamic:false,editable:true,readOnlyReason:null}]},true);
  assert.notEqual(unreadable,noEnabled,'An unreadable Profile must not be presented as explicitly disabled discovery');
  assert.notEqual(unselected,noEnabled,'A missing selection must not be presented as no enabled roots');
  assert.notEqual(unreadable,unselected,'Unreadable configuration and a required selection are different states');

  assert.notEqual(dshScopeKey({host:'local',scope:'global',projectPath:null}),dshScopeKey({host:'local',scope:'project',projectPath:'/repo'}));
  assert.notEqual(dshScopeKey({host:'local',scope:'project',projectPath:'/one'}),dshScopeKey({host:'local',scope:'project',projectPath:'/two'}));
});

test('DSH batch eligibility is action-specific, preserves unavailable reasons and executes a physical file once',async()=>{
  const {dshBatchEligibility}=await import('./dsh.ts');
  const trashOnly={...skill,name:'trash-only',path:'/own/trash',dshState:{...state,file:'/own/trash/SKILL.md',canSetInvocation:false,canSetPolicy:false}};
  const managed={...skill,name:'managed',cliManaged:true};
  const alias={...skill,path:'/alias/alpha'};
  const invocation=dshBatchEligibility([skill,trashOnly,managed,alias],'invocation');
  assert.deepEqual(invocation.eligible,[skill]);assert.deepEqual(invocation.excluded.map(item=>item.reason),['unavailable','duplicate','duplicate']);
  const removal=dshBatchEligibility([skill,trashOnly,managed,alias],'trash');
  assert.deepEqual(removal.eligible,[skill,trashOnly]);assert.deepEqual(removal.excluded.map(item=>item.reason),['unavailable','duplicate']);
  assert.equal(dshBatchEligibility([{...skill,agents:['pi']}],'trash').eligible.length,0);
});

test('DSH creation explains provider, configuration and directory restrictions without disabling a valid independent root',()=>{
  const row:DshSnapshot['configurations'][number]={key:'web:alpha',path:'/home/profile.yml',profile:'web',preset:'alpha',provider:'filesystem',disabled:false,includeDefaultRoots:false,agentsHome:null,dshHome:null,customSkillDirs:[],watch:true,dynamic:false,editable:true,readOnlyReason:null};
  const base:DshSnapshot={dshHome:'/dsh',sharedHome:'/agents',projectRoot:null,canonicalRoot:'/agents/skills',roots:[],skills:[],profiles:['web'],configurations:[row],contextKey:row.key,warnings:[],installIssue:null,contextIssue:null,runtimeVersion:'0.2.1-rc.3',writableVersion:true,revision:'revision',runtimeVerified:false};
  const disabled={...base,configurations:[{...row,disabled:true}]};
  const unknown={...base,configurations:[{...row,disabled:null}]};
  assert.match(dshCreationUnavailableReason(disabled,false)!,/provider is disabled/);
  assert.equal(dshDirectoryStatus(disabled,false),'Skill directory configurations are disabled');
  assert.equal(dshDirectoryStatus(unknown,false),'The skill directory configuration state is unknown');
  assert.match(dshCreationUnavailableReason({...base,contextKey:null},false)!,/Choose a readable/);
  assert.match(dshCreationUnavailableReason(unknown,false)!,/cannot be determined/);
  assert.match(dshCreationUnavailableReason({...base,configurations:[{...row,unresolvedFields:['dshHome']}]},false)!,/cannot be determined/);
  assert.match(dshCreationUnavailableReason(base,false)!,/No skill directories are enabled/);
  const root={path:'/agents/skills',source:'user-agents',rank:400,contextKey:row.key,verified:true,inScope:true,exists:true,canCreate:false};
  assert.match(dshCreationUnavailableReason({...base,roots:[root]},false)!,/Shared and packaged/);
  assert.match(dshCreationUnavailableReason({...base,roots:[{...root,source:'custom'}]},false)!,/do not support independent creation/);
  assert.equal(dshCreationUnavailableReason({...base,roots:[{...root,source:'custom',canCreate:true}]},false),null);
  assert.notEqual(dshCreationUnavailableReason({...base,roots:[{...root,source:'custom',canCreate:true,inScope:false}]},false),null,'A writable root belonging to another scope must not enable creation');
});

test('DSH native file selection preserves same-name preset and empty or missing file identity',()=>{
  const first=settingsRow('first-provider','/one/cordis.patch.yml','standard');
  const second=settingsRow('second-provider','/two/cordis.patch.yml','standard');
  const one=declaredPreset('one-standard',first.path,'standard',{configurationKeys:[first.key],directoryStatus:'available'});
  const two=declaredPreset('two-standard',second.path,'standard',{configurationKeys:[second.key],directoryStatus:'available'});
  const earlier=declaredPreset('two-minimal',second.path,'minimal');
  const snapshot:DshSnapshot={dshHome:'/dsh',sharedHome:'/agents',projectRoot:null,canonicalRoot:'/agents/skills',roots:[],skills:[],profiles:['one','two','empty'],configurationFiles:[{path:'/empty/cordis.patch.yml',profile:'empty',exists:true}],configurations:[first,second],configurationPath:first.path,presets:[one,earlier,two],presetKey:one.key,contextKey:first.key,warnings:[],installIssue:null,contextIssue:null,runtimeVersion:null,writableVersion:true,revision:'fixture',runtimeVerified:false};
  assert.equal(dshSelectFileContext(snapshot,second.path),second.key,'A same-name preset stays selected in the requested file, despite another preset appearing first');
  for(const path of ['/empty/cordis.patch.yml','/removed/cordis.patch.yml']){
    const key=dshSelectFileContext(snapshot,path);
    assert.equal(key,dshFileContextKey(path));
    const readback={...snapshot,configurationPath:path,presetKey:null,contextKey:key};
    assert.deepEqual(dshNativeContext(readback),{preset:undefined,configuration:undefined,path});
    assert.equal(dshSelectFileContext(readback,path),key,'A refresh keeps a file-only context rather than inventing a preset');
  }
  assert.equal(snapshot.contextKey,first.key,'Choosing a file does not mutate the previous snapshot');
});


test('DSH selection writer serializes deferred saves and persists the final merged scope map',async()=>{
  const global=dshScopeKey({host:'local',scope:'global',projectPath:null});
  const project=dshScopeKey({host:'local',scope:'project',projectPath:'/repo'});
  const started:Record<string,string|null>[]=[];
  const release:(()=>void)[]=[];
  let stored='';
  const write=createDshContextWriter(async contexts=>{
    started.push(contexts);
    await new Promise<void>(resolve=>release.push(resolve));
    stored=JSON.stringify(contexts);
  });
  const first={[global]:'global-old',settings:'settings'};
  const second={...first,[project]:dshFileContextKey('/empty/cordis.patch.yml')};
  const latest={...second,[global]:'global-new'};
  const saves=[write(first),write(second),write(latest)];
  await Promise.resolve();assert.deepEqual(started,[first]);
  release[0]();await saves[0];await Promise.resolve();assert.deepEqual(started,[first,second]);
  release[1]();await saves[1];await Promise.resolve();assert.deepEqual(started,[first,second,latest]);
  release[2]();await saves[2];
  assert.deepEqual(JSON.parse(stored),latest,'Late earlier writes cannot replace the latest global selection or erase the project choice');
});
test('DSH selection writer reports a rejected save and still accepts the next selection',async()=>{
  const failure=new Error('disk write failed');let calls=0;
  const stored:Record<string,string|null>[]=[];
  const write=createDshContextWriter(async contexts=>{if(++calls===1)throw failure;stored.push(contexts);});
  const first=write({global:'first'});
  const next=write({global:'next',settings:'kept'});
  await assert.rejects(first,error=>error===failure);
  await next;
  assert.deepEqual(stored,[{global:'next',settings:'kept'}]);
});

test('DSH native preset choices hide confirmed no-directory declarations while retaining unknown and disabled providers',()=>{
  const none=declaredPreset('none','/one/cordis.patch.yml','minimal');
  const disabled=declaredPreset('disabled','/two/cordis.patch.yml','standard',{directoryStatus:'available',disabled:true,configurationKeys:['disabled-provider']});
  const unknown=declaredPreset('unknown',disabled.path,'opaque',{directoryStatus:'unknown',disabled:null});
  const hiddenTarget=declaredPreset('hidden-target',disabled.path,'minimal');
  const declarations=[none,hiddenTarget,disabled,unknown];
  const eligible=dshNativePresetChoices(declarations);
  assert.deepEqual(eligible,[disabled,unknown],'Confirmed absence is excluded; disabled and unresolved capabilities remain inspectable');
  const snapshot:DshSnapshot={dshHome:'/dsh',sharedHome:'/agents',projectRoot:null,canonicalRoot:'/agents/skills',roots:[],skills:[],profiles:['one','two'],configurations:[],configurationPath:none.path,presets:declarations,presetKey:none.key,contextKey:none.key,warnings:[],installIssue:null,contextIssue:null,runtimeVersion:null,writableVersion:true,revision:'fixture',runtimeVerified:false};
  assert.equal(dshSelectFileContext(snapshot,disabled.path,eligible),disabled.key,'Target file fallback skips its confirmed no-directory declaration');
  assert.equal(dshSelectFileContext(snapshot,'/empty/cordis.patch.yml',eligible),dshFileContextKey('/empty/cordis.patch.yml'));
  const sameId=declaredPreset('target-minimal',disabled.path,'minimal',{directoryStatus:'available'});
  const expanded={...snapshot,presets:[...declarations,sameId]};
  assert.equal(dshSelectFileContext(expanded,disabled.path,dshNativePresetChoices(expanded.presets)),sameId.key,'A hidden current declaration still supplies its ID for matching an eligible declaration in the target file');
  assert.deepEqual(declarations,[none,hiddenTarget,disabled,unknown],'Filtering preserves the complete declarations used by Settings');
});

test('DSH discovery view contains managed and inherited files while excluding undiscovered and invalid rows',()=>{
  const managed={...skill,name:'managed',path:'/shared/managed',cliManaged:true,source:'owner/repo',agents:['pi'],dshState:{...state,file:'/shared/managed/SKILL.md'}};
  const inherited={...state,file:'/home/inherited/SKILL.md',path:'/home/inherited',name:'inherited',description:'Inherited',inScope:false};
  const own={...state,path:skill.path,name:skill.name,description:'Own',inScope:true};
  const shared={...managed.dshState,path:managed.path,name:'managed',description:'Managed',inScope:true};
  const invalid={...own,file:'/bad/SKILL.md',path:'/bad',name:'bad',reason:'Invalid DSH skill name'};
  const snapshot:DshSnapshot={dshHome:'/dsh',sharedHome:'/agents',projectRoot:'/repo',canonicalRoot:'/repo/.agents/skills',roots:[],skills:[shared,inherited,own,{...own,declaredPath:'/alias'},invalid],profiles:[],configurations:[],warnings:[],installIssue:null,contextIssue:null,contextKey:null,runtimeVersion:null,writableVersion:true,revision:'fixture',runtimeVerified:false};
  const inventory:Inventory={version:'1',agents:[],skills:[managed,skill,{...skill,name:'undiscovered',path:'/not-discovered'}],warnings:[],dsh:snapshot};
  const found=dshDiscoveredSkills(inventory);
  assert.deepEqual(found.map(row=>row.name),['managed','inherited','alpha']);
  assert.equal(found[0].cliManaged,true);assert.equal(found[0].source,'owner/repo');assert.deepEqual(found[0].agents,['pi','deepseek-harness']);
  assert.equal(found[1].dshState?.inScope,false);
  assert.deepEqual(dshBatchEligibility(found,'invocation').eligible.map(row=>row.name),['managed','inherited','alpha'],'Independent policy can configure protected discovered files without writing their source');
  assert.deepEqual(dshBatchEligibility(found,'trash').eligible.map(row=>row.name),['alpha'],'Discovery membership cannot grant file mutation rights');
  assert.equal(inventory.skills[0],managed);assert.equal(inventory.skills.length,3);
  assert.deepEqual(dshDiscoveredSkills({...inventory,dsh:{...snapshot,contextIssue:'stale'}}),[]);
  assert.deepEqual(dshDiscoveredSkills({...inventory,dsh:undefined}),[]);
});
test('DSH discovery projection preserves same-name physical files and snapshot readback removes stale discovery',()=>{
  const row={...state,path:skill.path,name:'same',description:'First',inScope:true};
  const other={...row,path:'/second',file:'/second/SKILL.md',description:'Second',shadowed:true};
  const snapshot:DshSnapshot={dshHome:'/dsh',sharedHome:'/agents',projectRoot:null,canonicalRoot:'/agents/skills',roots:[],skills:[row,other],profiles:[],configurations:[],warnings:[],installIssue:null,contextIssue:null,contextKey:null,runtimeVersion:null,writableVersion:true,revision:'fixture',runtimeVerified:false};
  const inventory:Inventory={version:'1',agents:[],skills:[skill],warnings:[],dsh:snapshot};
  const initial=dshDiscoveredSkills(inventory);assert.equal(initial.length,2);assert.equal(initial[1].dshState?.shadowed,true);
  const next={...snapshot,skills:[{...other,modelInvocable:false}],revision:'new'};
  const merged=mergeDshStates(inventory,next)!;
  assert.equal(merged.dsh,next);assert.deepEqual(dshDiscoveredSkills(merged).map(row=>row.path),['/second']);
  assert.equal(dshDiscoveredSkills(merged)[0].dshState?.modelInvocable,false);
  assert.equal(inventory.dsh,snapshot,'Readback does not mutate the prior inventory or another Agent’s source rows');
});
test('DSH physical discovery aggregates ownership protections across duplicate inventory records',()=>{
  const physical={...state,path:skill.path,name:skill.name,description:'Own',inScope:true};
  const snapshot:DshSnapshot={dshHome:'/dsh',sharedHome:'/agents',projectRoot:null,canonicalRoot:'/agents/skills',roots:[],skills:[physical],profiles:[],configurations:[],warnings:[],installIssue:null,contextIssue:null,contextKey:null,runtimeVersion:null,writableVersion:true,revision:'fixture',runtimeVerified:false};
  const owned={...skill,cliManaged:true,agents:['pi'],dshState:{...state}};
  for(const records of [[owned,skill],[skill,owned]]){
    const result=dshDiscoveredSkills({version:'1',agents:[],skills:records,warnings:[],dsh:snapshot});
    assert.equal(result.length,1);
    assert.equal(canChangeDsh(result[0],'invocation'),true);
    assert.equal(canChangeDsh(result[0],'trash'),false);
    assert.ok(result[0].agents.includes('pi'));
  }
});

test('DSH native directory status reflects all providers rather than the remembered settings provider',()=>{
  const first=settingsRow('first','/one/cordis.patch.yml','standard',{disabled:true});
  const active=settingsRow('active',first.path,'standard',{includeDefaultRoots:false,customSkillDirs:[]});
  const preset=declaredPreset('preset',first.path,'standard',{directoryStatus:'available',configurationKeys:[first.key,active.key]});
  const snapshot:DshSnapshot={dshHome:'/dsh',sharedHome:'/agents',projectRoot:null,canonicalRoot:'/agents/skills',roots:[],skills:[],profiles:['web'],configurations:[first,active],presets:[preset],presetKey:preset.key,contextKey:first.key,warnings:[],installIssue:null,contextIssue:null,runtimeVersion:null,writableVersion:true,revision:'fixture',runtimeVerified:false};
  assert.equal(dshDirectoryStatus(snapshot,false),'No skill directories enabled','Remembering a disabled provider does not make the entire preset disabled');
  assert.equal(dshDirectoryStatus({...snapshot,configurations:[first,{...active,disabled:true}]},false),'Skill directory configurations are disabled');
  assert.equal(dshDirectoryStatus({...snapshot,configurations:[first,{...active,disabled:null}]},false),'The skill directory configuration state is unknown');
  assert.equal(dshDirectoryStatus({...snapshot,configurations:[first,{...active,unresolvedFields:['customSkillDirs']}]},false),'Cannot determine skill directories');
});
