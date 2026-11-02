import test from 'node:test';
import assert from 'node:assert/strict';
import {codexToggleSelection,mergeCodexStates,type CodexSkillState,type CodexSnapshot} from './codex.ts';
import {skillCollection,canRemove,removalTargetAgents,type InstalledSkill} from './upstream.ts';
import {canAgentSkillAction,skillAgentState} from './agent-skill-actions.ts';
const state:CodexSkillState={documentPath:'/real/SKILL.md',installationPath:'/link',origin:'standalone',runtimeScope:'user',inScope:true,enabled:true,pluginId:null,canToggle:true,needsConfirmation:false,toggleScope:'user',lifecycleOwner:'skills-cli'};
const skill:InstalledSkill={name:'same',path:'/link',agents:['codex','pi'],source:null,sourceUrl:null,description:'fixture',codexState:state};
test('Codex action context cannot leak to other Agents; native ownership never reaches generic uninstall',()=>{
 assert.equal(canAgentSkillAction(skill,'codex','codex-toggle'),true);
 for(const context of [null,'pi','hermes-agent'])assert.equal(canAgentSkillAction(skill,context,'codex-toggle'),false);
 assert.equal(skillAgentState(skill,'pi').codex,null);
 assert.equal(skillCollection(skill),'managed');
 const plugin:InstalledSkill={...skill,cliManaged:true,codexState:{...state,origin:'plugin',pluginId:'demo@market',canToggle:false,lifecycleOwner:'codex-plugin'}};
 assert.equal(skillCollection(plugin),'agent');assert.equal(canRemove([plugin],['same'],['codex']),false);assert.deepEqual(removalTargetAgents(plugin,'codex'),[]);
 assert.equal(canAgentSkillAction(plugin,'codex','codex-toggle'),false);
});
test('batch targets canonical documents, retains distinct same-name paths, and skips readonly or unknown states',()=>{
 const other={...skill,path:'/other',codexState:{...state,documentPath:'/other/SKILL.md'}};
 const readonly={...skill,codexState:{...state,canToggle:false}};
 const unknown={...skill,codexState:{...state,enabled:null}};
 const selection=codexToggleSelection([skill,{...skill,path:'/second-link'},other,readonly,unknown],false);
 assert.deepEqual(selection.skills.map(s=>s.codexState?.documentPath),['/real/SKILL.md','/other/SKILL.md']);assert.equal(selection.skipped,2);
 assert.equal(codexToggleSelection([skill],true).skills.length,0);
});
test('snapshot merge retains physical link ownership and never treats a missing state as disabled',()=>{
 const inventory={version:'1',agents:[],skills:[skill],warnings:[]};
 const snapshot:CodexSnapshot={rules:[],capabilities:{writeConfig:true,nameRules:true},binary:'/bin/codex',version:'fixture',codexHome:'/home',configPath:'/config',revision:'r',plugins:[],warnings:[],skills:[{name:'same',description:'',state:{...state,installationPath:'/real',enabled:false,inScope:false,lifecycleOwner:'external'}}]};
 const merged=mergeCodexStates(inventory,snapshot)!.skills[0].codexState!;
 assert.equal(merged.installationPath,'/link');assert.equal(merged.lifecycleOwner,'skills-cli');assert.equal(merged.inScope,true);assert.equal(merged.enabled,false);
 const absent=mergeCodexStates(inventory,{...snapshot,skills:[]})!.skills[0].codexState!;
 assert.equal(absent.enabled,null);assert.equal(absent.canToggle,false);
});

test('Codex standard installations keep their own collection even when another Agent treats the directory as native',()=>{
 const shared:InstalledSkill={...skill,cliManaged:false,hermesOrigin:'external',cliAgents:['codex']};
 assert.equal(skillCollection(shared),'agent');
 assert.equal(skillCollection(shared,'codex'),'managed');
});


test('plugin toggles do not inherit installation permissions and missing inventory retains retry intent', async () => {
 const {codexPluginActionAllowed,remainingCodexPlugins} = await import('./codex.ts');
 const plugin = {id:'demo@git',name:'demo',marketplace:'git',version:'1',installed:true,installationKnown:true,enabled:true,components:['skills'],skills:[],sourcePath:'',installedPath:'/cache',canInstall:false,canToggle:true,canUninstall:false,unavailableReason:null,fingerprint:'f'};
 assert.equal(codexPluginActionAllowed(plugin,'disable'),true);
 assert.equal(codexPluginActionAllowed(plugin,'enable'),true);
 assert.equal(codexPluginActionAllowed(plugin,'uninstall'),false);
 const snapshot:CodexSnapshot={rules:[],capabilities:{writeConfig:true,nameRules:true},binary:'',version:'',codexHome:'',configPath:'',revision:'r',skills:[],plugins:[],warnings:['unavailable']};
 assert.deepEqual(remainingCodexPlugins([plugin],0,snapshot),[plugin]);
 assert.deepEqual(remainingCodexPlugins([plugin],1,snapshot),[]);
});




test('rule validation preserves protected resources and removing a path override retains name inheritance', async () => {
 const {codexRuleEditable,codexRuleError,withoutCodexPathRules}=await import('./codex.ts');
 const snapshot:CodexSnapshot={binary:'',version:'',codexHome:'',configPath:'',revision:'r',rules:[],capabilities:{writeConfig:true,nameRules:true},skills:[{name:'system',description:'',state:{...state,origin:'system'}}],plugins:[],warnings:[]};
 assert.equal(codexRuleEditable({name:'system',enabled:true},snapshot),true);
 assert.equal(codexRuleEditable({name:'system',enabled:true},{...snapshot,skills:[{...snapshot.skills[0],state:{...snapshot.skills[0].state,origin:'admin'}}]}),false);
 assert.equal(codexRuleError({path:'/skills/demo',enabled:false},true),'请选择 SKILL.md 的完整路径。');
 assert.equal(codexRuleError({path:'/skills/demo/SKILL.md',enabled:false},true),null);
 assert.ok(codexRuleError({name:'',enabled:true},true));
 const name={name:'demo',enabled:false,custom:'preserved'},path={path:'/skills/demo/SKILL.md',enabled:true};
 assert.deepEqual(withoutCodexPathRules([name,path],path.path),[name]);
 assert.equal(name.enabled,false);
});

test('failed and partial inventory retains plugin identity without granting stale actions; complete recovery replaces it', async()=>{
 const {reconcileCodexSnapshot,unavailableCodexSnapshot}=await import('./codex.ts');
 const plugin={id:'demo@local',name:'demo',marketplace:'local',version:'1',installed:true,installationKnown:true,enabled:true,components:['skills'],skills:[],sourcePath:'/source',installedPath:'/cache',canInstall:false,canToggle:true,canUninstall:true,unavailableReason:null,fingerprint:'f'};
 const previous:CodexSnapshot={contextId:'context-a',binary:'/bin/codex',version:'sample',codexHome:'/custom',configPath:'/custom/config.toml',revision:'r',rules:[{name:'demo',enabled:false}],capabilities:{writeConfig:true,nameRules:true},skills:[{name:'same',description:'',state}],plugins:[plugin],warnings:[],pluginsComplete:true};
 const stale=reconcileCodexSnapshot(previous,{...previous,unavailableReason:'cliMissing',plugins:[],skills:[],rules:[]});
 assert.equal(stale.plugins[0].id,plugin.id);assert.equal(stale.plugins[0].canToggle,false);assert.equal(stale.plugins[0].canUninstall,false);assert.equal(stale.skills[0].state.enabled,null);assert.deepEqual(stale.rules,previous.rules);assert.equal(stale.capabilities.writeConfig,false);
 const partial=reconcileCodexSnapshot(previous,{...previous,plugins:[],pluginsComplete:false});
 assert.equal(partial.plugins.length,1);assert.equal(partial.plugins[0].unavailableReason,'stale');
 assert.equal(reconcileCodexSnapshot(partial,{...previous,plugins:[]}).plugins.length,0);
 assert.deepEqual(reconcileCodexSnapshot(unavailableCodexSnapshot(previous),previous),previous);
});

test('authorization policy does not assert actual authorization',async()=>{
 const {codexPluginAuthMessage}=await import('./codex.ts');
 const plugin={id:'demo@local',name:'demo',marketplace:'local',version:null,installed:true,installationKnown:true,enabled:true,components:['mcpServers'],skills:[],sourcePath:'',installedPath:null,canInstall:false,canToggle:true,canUninstall:false,unavailableReason:null,fingerprint:'f',authPolicy:'ON_INSTALL'};
 assert.equal(codexPluginAuthMessage(plugin,true),null);
 assert.equal(codexPluginAuthMessage({...plugin,installed:false},true),'安装后可能需要连接服务账号。');
 assert.equal(codexPluginAuthMessage({...plugin,components:['skills']},true),null);
});

test('failed native inventory retains only native Codex records, not deleted ordinary or other Agent records',async()=>{
 const {reconcileCodexInventory}=await import('./codex.ts');
 const native={...skill,path:'/native',agents:['codex'],codexState:{...state,origin:'plugin' as const,lifecycleOwner:'codex-plugin' as const,canToggle:false}};
 const snapshot:CodexSnapshot={contextId:'context-a',binary:'',version:'',codexHome:'',configPath:'',revision:'r',rules:[],capabilities:{writeConfig:true,nameRules:true},skills:[{name:'same',description:'',state:native.codexState}],plugins:[],warnings:[]};
 const previous={version:'1',agents:[],skills:[native,skill],warnings:[],codex:snapshot};
 const fresh={...previous,skills:[],codex:{...snapshot,skills:[],unavailableReason:'cliMissing'}};
 const result=reconcileCodexInventory(previous,fresh);
 assert.deepEqual(result.skills.map(item=>item.path),['/native']);assert.equal(result.skills[0].codexState?.enabled,null);
 assert.equal(reconcileCodexInventory(null,fresh).skills.length,0);
});

test('Codex skill state filtering keeps unknown distinct and plugin skills editable',async()=>{
 const {filterCodexSkills,codexRuleEditable,codexSkillToggleHint}=await import('./codex.ts');
 const pluginSkill={...skill,codexState:{...state,origin:'plugin' as const,pluginId:'demo@local'}};
 const disabled={...pluginSkill,path:'/disabled',codexState:{...pluginSkill.codexState,enabled:false}};
 const unknown={...pluginSkill,path:'/unknown',codexState:{...pluginSkill.codexState,enabled:null}};
 assert.deepEqual(filterCodexSkills([pluginSkill,disabled,unknown],'demo@local','disabled'),[disabled]);
 assert.deepEqual(filterCodexSkills([pluginSkill,disabled,unknown],'all','unknown'),[unknown]);
 assert.deepEqual(filterCodexSkills([pluginSkill],'local','all'),[]);
 const snapshot:CodexSnapshot={binary:'',version:'',codexHome:'',configPath:'',revision:'',rules:[],capabilities:{writeConfig:true,nameRules:true},plugins:[],warnings:[],skills:[{name:'demo',description:'',state:pluginSkill.codexState}]};
 assert.equal(codexRuleEditable({path:state.documentPath,enabled:false},snapshot),true);
 assert.equal(codexSkillToggleHint(pluginSkill.codexState,[],true),'已启用');
});
test('plugin collections contain native installation evidence, not configuration-only records',async()=>{
 const {installedCodexPluginCount,filterCodexPluginCollection}=await import('./codex.ts');
 const user={id:'user@market',name:'User',marketplace:'market',version:null,installed:true,installationKnown:true,enabled:true,components:[],skills:[],sourcePath:'',installedPath:null,canInstall:false,canToggle:false,canUninstall:false,unavailableReason:'source',fingerprint:'f'};
 const builtin={...user,id:'runtime',builtin:true};
 const available={...user,id:'available',installed:false,canInstall:true};
 const unknown={...user,id:'unknown',installed:false,installationKnown:false};
 const plugins=[user,builtin,available,unknown];
 assert.equal(installedCodexPluginCount(plugins),2);
 assert.deepEqual(filterCodexPluginCollection(plugins,'installed','all'),[user,builtin]);
 assert.deepEqual(filterCodexPluginCollection([...plugins,{...available,id:'blocked',canInstall:false}],'available','all'),[available]);
 assert.deepEqual(filterCodexPluginCollection(plugins,'all','unknown'),[]);
 assert.deepEqual(filterCodexPluginCollection(plugins,'all','all'),[user,builtin,available]);
 assert.deepEqual(filterCodexPluginCollection(plugins,'installed','disabled'),[]);
});

test('Codex presentation names do not change runtime skill or plugin identities',async()=>{
 const {codexSkillDisplayName,codexOrigin}=await import('./codex.ts');
 const pluginSkill={...skill,name:'demo:internal-skill',codexState:{...state,origin:'plugin' as const,pluginId:'demo@market',displayName:'Readable Skill',pluginDisplayName:'Readable Plugin'}};
 assert.equal(codexSkillDisplayName(pluginSkill),'Readable Skill');
 assert.equal(codexOrigin(pluginSkill.codexState,true),'Readable Plugin');
 assert.equal(pluginSkill.name,'demo:internal-skill');
 assert.equal(codexSkillDisplayName({...pluginSkill,codexState:{...pluginSkill.codexState,displayName:null}}),'internal-skill');
 assert.equal(codexOrigin({...pluginSkill.codexState,pluginDisplayName:null},true),'demo@market');
});

 test('visible Codex display names are searchable without changing operation identities', async()=>{
 const {visibleSkills}=await import('./upstream.ts');
 const item={...skill,codexState:{...state,displayName:'Readable Alpha',pluginDisplayName:'Readable Plugin'}};
 const inventory={version:'1',agents:[],skills:[item],warnings:[]};
 assert.deepEqual(visibleSkills(inventory,'readable alpha',''),[item]);
 assert.deepEqual(visibleSkills(inventory,'readable plugin',''),[item]);
 assert.equal(item.name,'same');
 });

import {codexCheckLabel,type CodexPluginCheck} from './codex.ts';
test('local plugin checks distinguish equality, version identifiers, content changes and failure',()=>{
 const checked:CodexPluginCheck={unmappedRules:[],affectedRules:[],installedPath:null,pluginId:'p@m',revision:'r',candidateComponents:['skills'],candidateSkillCount:2,installedVersion:'local',candidateVersion:'other',currentContentFingerprint:'a',candidateContentFingerprint:'b',baselineContentFingerprint:null,sourcePath:'/source',status:'versionChanged',reason:null,localState:'unknown',canUpdate:true,recovery:false};
 assert.equal(codexCheckLabel(undefined,true),'尚未检查');
 assert.equal(codexCheckLabel(checked,true),'来源版本不同');
 assert.equal(codexCheckLabel({...checked,status:'contentChanged'},true),'内容变化，版本未变');
 assert.equal(codexCheckLabel({...checked,status:'current'},true),'已是最新内容');
 for(const status of ['removed','unavailable','recovery','failed'])assert.doesNotMatch(codexCheckLabel({...checked,status},true),/最新|一致/);
});

test('update check capability is independent of uninstall and authorization',async()=>{
 const {codexPluginCheckLabel,codexPluginRestriction}=await import('./codex.ts');
 const p={id:'github@remote',name:'GitHub',marketplace:'remote',version:'1',installed:true,installationKnown:true,enabled:true,components:['apps'],skills:[],sourcePath:'',installedPath:null,canInstall:false,canToggle:false,canUninstall:true,unavailableReason:null,fingerprint:'f'};
 assert.equal(codexPluginCheckLabel(p,undefined,true),null);
 assert.equal(codexPluginCheckLabel({...p,canCheckUpdates:true},undefined,true),'尚未检查');
 assert.equal(codexPluginCheckLabel({...p,installed:false},undefined,true),null);
 assert.match(codexPluginRestriction('remoteToggle',true)??'',/Codex 的插件页/);
});

test('local or failed refresh cannot replay remote records from another workspace',async()=>{
 const {reconcileCodexSnapshot}=await import('./codex.ts');
 const p={id:'github@remote',name:'GitHub',marketplace:'remote',version:'1',installed:true,installationKnown:true,enabled:true,components:[],skills:[],sourcePath:'',installedPath:null,canInstall:false,canToggle:false,canUninstall:true,canCheckUpdates:false,catalogEntry:true,unavailableReason:null,fingerprint:'f'};
 const previous:CodexSnapshot={contextId:'context-a',binary:'',version:'',codexHome:'',configPath:'',revision:'r',rules:[],capabilities:{writeConfig:true,nameRules:true},skills:[],plugins:[p],warnings:[],pluginsComplete:true,catalogRequested:true};
 const local={...previous,plugins:[],pluginsComplete:false,catalogRequested:false};
 assert.deepEqual(reconcileCodexSnapshot(previous,local).plugins,[]);
 assert.deepEqual(reconcileCodexSnapshot(previous,{...local,catalogRequested:true}).plugins,[]);
 assert.deepEqual(reconcileCodexSnapshot(previous,{...local,revision:'changed'}).plugins,[]);
});

test('native source filters distinguish local, built-in and plugin display identity',async()=>{
 const {filterCodexSkills,codexSkillSourceOptions,codexSkillToggleHint}=await import('./codex.ts');
 const builtin={...skill,codexState:{...state,origin:'system' as const}};
 const plugin={...skill,codexState:{...state,origin:'plugin' as const,pluginId:'raw@market',pluginDisplayName:'Readable plugin'}};
 const unloaded={...plugin,codexState:{...plugin.codexState,enabled:null,canToggle:false,runtimeScope:'unloaded'}};
 const rows=[skill,builtin,plugin,unloaded];
 assert.deepEqual(filterCodexSkills(rows,'local','all'),[skill]);
 assert.deepEqual(filterCodexSkills(rows,'builtin','all'),[builtin]);
 assert.deepEqual(filterCodexSkills(rows,'raw@market','unloaded'),[unloaded]);
 assert.deepEqual(codexSkillSourceOptions(rows,true).slice(-1)[0],{value:'raw@market',label:'Readable plugin',pluginId:'raw@market',icon:null});
 assert.match(codexSkillToggleHint(unloaded.codexState,[],true),/读取失败/);
});


test('context changes never inherit another account, root or executable inventory',async()=>{
 const {reconcileCodexSnapshot}=await import('./codex.ts');
 const previous:CodexSnapshot={contextId:'account-a',binary:'/bin/codex',version:'1',codexHome:'/a',configPath:'/a/config.toml',revision:'same',rules:[{name:'a',enabled:false}],capabilities:{writeConfig:true,nameRules:true},skills:[],plugins:[],warnings:[]};
 for(const change of [{contextId:'account-b'},{contextId:null},{codexHome:'/b'},{binary:'/different/codex'},{configPath:'/b/config.toml'},{version:'2'}]){
  const incoming={...previous,...change,unavailableReason:'unavailable',rules:[]};
  assert.deepEqual(reconcileCodexSnapshot(previous,incoming),incoming);
 }
});
test('installed count deduplicates identities; update-capable components survive hide filter',async()=>{
 const {installedCodexPluginCount,visibleCodexPlugins,filterCodexPluginCollection}=await import('./codex.ts');
 const plugin={id:'built@market',name:'Built',marketplace:'market',version:'1',installed:true,installationKnown:true,enabled:true,builtin:true,components:[],skills:[],sourcePath:'/source',installedPath:'/cache',canInstall:false,canToggle:false,canUninstall:false,canCheckUpdates:true,unavailableReason:null,fingerprint:'f'};
 assert.equal(installedCodexPluginCount([plugin,plugin,{...plugin,installed:false}]),1);
 assert.deepEqual(visibleCodexPlugins([plugin],''),[plugin]);
 assert.deepEqual(filterCodexPluginCollection([{...plugin,installed:false}],'all','all'),[]);
 assert.deepEqual(filterCodexPluginCollection([plugin],'installed','disabled'),[]);
});

test('plugin pages retain independent native state and use local metadata only for missing skill previews', async () => {
 const {codexPluginSkills}=await import('./codex.ts');
 const plugin={id:'demo@local',name:'Demo',marketplace:'local',version:'1',installed:true,installationKnown:true,enabled:false,components:['skills'],skills:[],sourcePath:'/source',installedPath:'/cache',canInstall:false,canToggle:true,canUninstall:true,unavailableReason:null,fingerprint:'f'};
 const snapshot:CodexSnapshot={rules:[],capabilities:{writeConfig:true,nameRules:true},binary:'',version:'',codexHome:'',configPath:'',revision:'r',plugins:[plugin],warnings:[],skills:[{name:'demo:same',description:'native',state:{...state,pluginId:plugin.id,documentPath:'/cache/a/SKILL.md',installationPath:'/cache/a',enabled:true}}]};
 const details={description:'',category:null,website:null,capabilities:[],examples:[],skills:[{name:'same',displayName:'First',description:'preview',path:'/cache/a',icon:null},{name:'same',displayName:'Second',description:'second',path:'/cache/b',icon:null}]};
 const result=codexPluginSkills(plugin,snapshot,details);
 assert.equal(result.length,2);assert.equal(result[0].description,'native');assert.equal(result[0].codexState?.enabled,true);assert.equal(result[0].codexState?.canToggle,true);
 assert.equal(result[1].codexState?.displayName,'Second');assert.equal(result[1].codexState?.enabled,null);assert.equal(result[1].codexState?.canToggle,false);
 assert.equal(codexToggleSelection(result,false).skills.length,1);
 const available=codexPluginSkills({...plugin,installed:false},null,details);
 assert.equal(available.length,2);assert.equal(codexToggleSelection(available,true).skills.length,0);
});


test('plugin search retains restricted, unintegrated and unknown actions without changing permissions',async()=>{
 const {visibleCodexPlugins,filterCodexPluginCollection,codexPluginRestriction,codexPluginStateLabel}=await import('./codex.ts');
 const base={id:'p@m',name:'Plugin',marketplace:'m',version:null,installed:true,installationKnown:true,enabled:true,components:[],skills:[],sourcePath:'',installedPath:null,canInstall:false,canToggle:false,canUninstall:false,unavailableReason:null,fingerprint:'f'};
 const restricted={...base,id:'restricted@m',permissions:{install:'notApplicable' as const,toggle:'restricted' as const,uninstall:'restricted' as const,checkUpdates:'notApplicable' as const}};
 const remote={...base,id:'remote@m',permissions:{...restricted.permissions,toggle:'notIntegrated' as const}};
 const unknown={...base,id:'unknown@m',installed:false,installationKnown:false,permissions:{...restricted.permissions,toggle:'unknown' as const}};
 const available={...remote,id:'available@m',installed:false,installPolicy:'AVAILABLE',permissions:{...remote.permissions,install:'notIntegrated' as const}};
 const rows=[restricted,remote,unknown,available];
 assert.deepEqual(visibleCodexPlugins(rows,''),rows);
 assert.deepEqual(visibleCodexPlugins(rows,'PLUGIN'),rows);
 assert.deepEqual(visibleCodexPlugins(rows,'m'),rows);
 assert.deepEqual(visibleCodexPlugins(rows,'restricted'),[restricted]);
 assert.deepEqual(filterCodexPluginCollection([available],'available','all'),[available]);
 assert.deepEqual(filterCodexPluginCollection([available],'all','all'),[available]);
 assert.equal(codexPluginRestriction('unrecognized',true),null);
 assert.equal(codexPluginStateLabel({...base,enabledKnown:false},true),'待确认');
 assert.deepEqual(filterCodexPluginCollection([{...base,enabled:false,enabledKnown:false}],'installed','disabled'),[]);
});

test('plugin skill presentation distinguishes unknown, loading, failed, tool-only and incomplete installations',async()=>{
 const {codexPluginSkillDisplay}=await import('./codex.ts');
 const plugin={id:'demo@local',name:'Demo',marketplace:'local',version:'1',installed:true,installationKnown:true,enabled:true,components:['mcpServers'],skills:[],sourcePath:'/source',installedPath:'/cache',canInstall:false,canToggle:true,canUninstall:true,unavailableReason:null,fingerprint:'f'};
 assert.deepEqual(codexPluginSkillDisplay(plugin,0,false,true,false),{show:true,count:null,state:'loading'});
 assert.equal(codexPluginSkillDisplay(plugin,0,false,false,false).state,'unread');
 assert.equal(codexPluginSkillDisplay(plugin,0,false,false,true).state,'error');
 assert.equal(codexPluginSkillDisplay({...plugin,skillInventory:{complete:true,missingFromInstallation:null}},0,true,false,false).show,false);
 assert.deepEqual(codexPluginSkillDisplay({...plugin,skillInventory:{complete:true,missingFromInstallation:1}},0,true,false,false),{show:false,count:null,state:'empty'});
 assert.equal(codexPluginSkillDisplay(plugin,2,true,false,false).count,2);
});

test('same-version source previews deduplicate loaded skills and never acquire invocation rights',async()=>{
 const {codexPluginSkills}=await import('./codex.ts');
 const plugin={id:'demo@local',name:'Demo',marketplace:'local',version:'1',installed:true,installationKnown:true,enabled:true,components:['skills'],skills:[],sourcePath:'/source',installedPath:'/cache',canInstall:false,canToggle:true,canUninstall:true,unavailableReason:null,fingerprint:'f'};
 const snapshot:CodexSnapshot={rules:[],capabilities:{writeConfig:true,nameRules:true},binary:'',version:'',codexHome:'',configPath:'',revision:'r',plugins:[plugin],warnings:[],skills:[{name:'demo:one',description:'native',state:{...state,pluginId:plugin.id,documentPath:'/cache/skills/one/SKILL.md',installationPath:'/cache/skills/one'}}]};
 const details={description:'',category:null,website:null,capabilities:[],examples:[],skills:[{name:'one',displayName:'One',description:'source',path:'/source/skills/one',icon:null},{name:'two',displayName:'Two',description:'source',path:'/source/skills/two',icon:null}]};
 const skills=codexPluginSkills(plugin,snapshot,details);
 assert.equal(skills.length,2);assert.equal(skills[0].path,'/cache/skills/one');assert.equal(skills[0].codexState?.canToggle,true);
 assert.equal(skills[1].path,'/source/skills/two');assert.equal(skills[1].codexState?.enabled,null);assert.equal(skills[1].codexState?.canToggle,false);
});

test('plugin management and add pages separate native installations and retain source identity',async()=>{
 const {filterCodexPluginPage,codexPluginSources,codexPluginSourceKey,installedCodexPluginCount}=await import('./codex.ts');
 const base={id:'installed@market',name:'Installed',marketplace:'market',version:'1',installed:true,installationKnown:true,enabled:true,components:[],skills:[],sourcePath:'/market/plugin',installedPath:'/cache/plugin',canInstall:false,canToggle:true,canUninstall:true,unavailableReason:null,fingerprint:'f',sourceOrigin:'user'};
 const plugins=[base,{...base,id:'available@market',installed:false,canInstall:true,category:'Engineering'}, {...base,id:'config@market',installed:false,installationKnown:false}, {...base,id:'app@openai-bundled',marketplace:'openai-bundled',sourceOrigin:'app'}, {...base,id:'runtime@openai-primary-runtime',marketplace:'openai-primary-runtime',sourceOrigin:'runtime'}, {...base,id:'github@remote',remote:true,sourceOrigin:'account'}];
 assert.deepEqual(filterCodexPluginPage(plugins,false,'all','all').map(p=>p.id),[plugins[0].id,...plugins.slice(3).map(p=>p.id)]);
 assert.deepEqual(filterCodexPluginPage(plugins,true,'all','all').map(p=>p.id),['available@market']);
 assert.deepEqual(filterCodexPluginPage(plugins,true,'market:market','all','Engineering').map(p=>p.id),['available@market']);
 assert.equal(filterCodexPluginPage(plugins,false,'app','disabled').length,0);
 assert.equal(installedCodexPluginCount(plugins),4);
 assert.deepEqual(codexPluginSources(plugins,true).map(p=>p.value).sort(),['all','account','app','market:market','runtime'].sort());
 assert.equal(codexPluginSourceKey({...base,marketplace:'openai-bundled'}),'market:openai-bundled');
 const installed={...plugins[1],installed:true,canInstall:false};
 assert.equal(filterCodexPluginPage([installed],true,'all','all').length,0);
 assert.deepEqual(filterCodexPluginPage([installed],false,'all','all'),[installed]);
});


test('plugin source choices group official providers before plain marketplace names',async()=>{
 const {codexPluginSources}=await import('./codex.ts');
 const base={id:'p@m',name:'p',marketplace:'m',version:null,installed:true,installationKnown:true,enabled:true,components:[],skills:[],sourcePath:'',installedPath:null,canInstall:false,canToggle:false,canUninstall:false,unavailableReason:null,fingerprint:'f'};
 const options=codexPluginSources([{...base,marketplace:'mattpocock',sourceOrigin:'user'},{...base,sourceOrigin:'runtime'},{...base,remote:true},{...base,sourceOrigin:'app'}],true);
 assert.deepEqual(options,[{value:'all',label:'全部来源'},{value:'app',label:'应用内置'},{value:'runtime',label:'运行环境'},{value:'account',label:'官方插件'},{value:'market:mattpocock',label:'mattpocock'}]);
 const pluginSkill={...skill,codexState:{...state,origin:'plugin' as const,pluginId:base.id,pluginDisplayName:'Old name'}};
 const {codexSkillSourceOptions}=await import('./codex.ts');
 assert.deepEqual(codexSkillSourceOptions([pluginSkill,pluginSkill],true,[{...base,name:'Display name',icon:'https://example.invalid/icon.png'}]).filter(option=>option.pluginId),[{value:base.id,label:'Display name',pluginId:base.id,icon:'https://example.invalid/icon.png'}]);
 assert.equal(codexPluginSources([{...base,marketplace:'arkspace-dev',marketplaceDisplayName:'ArkSpace',sourceOrigin:'user'}],true)[1].label,'ArkSpace');
});


test('directory search reuses installed identity and authority without treating display names as identity',async()=>{
 const {codexDirectoryPagePlugins}=await import('./codex.ts');
 const installed={id:'native@market',remotePluginId:'real-remote',name:'Old title',marketplace:'market',version:'1',installed:true,installationKnown:true,enabled:false,components:[],skills:[],sourcePath:'',installedPath:null,canInstall:false,canToggle:true,canUninstall:true,unavailableReason:null,fingerprint:'native'};
 const entry={...installed,id:'catalog:real-remote',name:'Public title',installed:false,enabled:true,canInstall:true,canToggle:false,fingerprint:'public:real-remote'};
 const snapshot:CodexSnapshot={binary:'codex',version:'fixture',codexHome:'/fixture',configPath:'/fixture/config.toml',revision:'r',rules:[],capabilities:{writeConfig:true,nameRules:true,listPlugins:true,listMarketplaces:true,installPlugins:true,uninstallPlugins:true},skills:[],plugins:[installed],warnings:[]};
 const [joined]=codexDirectoryPagePlugins([entry],snapshot);
 assert.equal(joined.id,installed.id);assert.equal(joined.enabled,false);assert.equal(joined.canInstall,false);assert.equal(joined.fingerprint,'native');assert.equal(joined.name,'Public title');
 assert.equal(codexDirectoryPagePlugins([{...entry,remotePluginId:'other'}],snapshot)[0].id,entry.id);
 assert.equal(codexDirectoryPagePlugins([entry],null)[0].installed,false);
});


test('project override reset and App-managed notices follow exact scope and provider identity',async()=>{
 const {codexPluginActionAllowed,codexAppManagedPlugin}=await import('./codex.ts');
 const base={id:'codex-app-tools@openai-bundled',name:'Tools',marketplace:'openai-bundled',version:'1',installed:true,installationKnown:true,enabled:false,components:[],skills:[],sourcePath:'',installedPath:null,canInstall:false,canToggle:true,canUninstall:false,unavailableReason:null,fingerprint:'f',toggleScope:'project',projectEnabled:false};
 assert.equal(codexPluginActionAllowed(base,'reset'),true);
 assert.equal(codexPluginActionAllowed({...base,projectEnabled:null},'reset'),false);
 assert.equal(codexPluginActionAllowed({...base,toggleScope:'account'},'reset'),false);
 assert.equal(codexPluginActionAllowed({...base,canToggle:false},'reset'),false);
 assert.equal(codexAppManagedPlugin({...base,builtin:true}),true);
 assert.equal(codexAppManagedPlugin({...base,builtin:false}),false);
 assert.equal(codexAppManagedPlugin({...base,builtin:true,id:'other@openai-bundled'}),false);
});

test('App internal components stay out of ordinary plugin lists, searches, counts and source choices',async()=>{
 const {visibleCodexPlugins,filterCodexPluginPage,installedCodexPluginCount,codexPluginSources}=await import('./codex.ts');
 const base={name:'Tools',marketplace:'openai-bundled',sourceOrigin:'app',builtin:true,version:'1',installed:true,installationKnown:true,enabled:true,components:[],skills:[],sourcePath:'',installedPath:null,canInstall:false,canToggle:true,canUninstall:true,unavailableReason:null,fingerprint:'f'};
 const internal=['codex-app-tools','unified-computer-use'].map(name=>({...base,id:`${name}@openai-bundled`,name}));
 const ordinary=[{...base,id:'other@openai-bundled'},{...base,id:'unified-computer-use@personal',name:'unified-computer-use',marketplace:'personal',sourceOrigin:'user',builtin:false}];
 for(const toggleScope of ['user','project']){
  const plugins=[...internal,...ordinary].map(plugin=>({...plugin,toggleScope}));
  assert.deepEqual(visibleCodexPlugins(plugins,''),plugins.slice(2));
  assert.deepEqual(visibleCodexPlugins(plugins,'codex-app-tools'),[]);
  assert.deepEqual(filterCodexPluginPage(plugins,false,'all','all'),plugins.slice(2));
  assert.equal(installedCodexPluginCount(plugins),2);
  assert.equal(plugins.length,4,'Native records must be retained without deleting or changing plugins');
 }
 assert.deepEqual(filterCodexPluginPage(internal.map(plugin=>({...plugin,installed:false,canInstall:true})),true,'all','all'),[]);
 assert.deepEqual(codexPluginSources(internal,true),[{value:'all',label:'全部来源'}]);
 assert.deepEqual(filterCodexPluginPage([{...internal[0],builtin:false}],false,'all','all').map(plugin=>plugin.id),[internal[0].id]);
});

test('directory metadata joins the current native snapshot without another installation scan',async()=>{
 const {codexDirectoryWithSnapshot}=await import('./codex.ts');
 const base={id:'github@official',remotePluginId:'github',name:'GitHub',marketplace:'official',version:'1',installed:true,installationKnown:true,enabled:false,remote:true,components:[],skills:[],sourcePath:'',installedPath:null,canInstall:false,canToggle:true,canUninstall:true,unavailableReason:null,fingerprint:'fresh'};
 const local={...base,id:'local@market',remotePluginId:null,name:'Local',remote:false,marketplace:'market',marketplaceDisplayName:'My market'};
 const current:CodexSnapshot={contextId:'project',rules:[],capabilities:{writeConfig:true,nameRules:true},binary:'/codex',version:'fixture',codexHome:'/home',configPath:'/config',revision:'r',plugins:[base,local],warnings:[],skills:[]};
 const metadata={snapshot:null,publicSections:[{id:'featured',title:'Service title',urlSlug:'featured',kind:'public' as const,plugins:[{...base,name:'Service display',installed:false,canInstall:true,fingerprint:'public:github'}]}],personalSections:[],accountRequired:false,publicError:null,personalError:null};
 const joined=codexDirectoryWithSnapshot(metadata,current);
 assert.equal(joined.snapshot,current);assert.equal(joined.publicSections[0].title,'Service title');
 assert.equal(joined.publicSections[0].plugins[0].enabled,false);assert.equal(joined.publicSections[0].plugins[0].fingerprint,'fresh');assert.equal(joined.publicSections[0].plugins[0].name,'Service display');
 assert.equal(joined.personalSections[0].title,'My market');assert.deepEqual(joined.personalSections[0].plugins,[local]);
 assert.equal(metadata.publicSections[0].plugins[0].installed,false,'Keep cached metadata independent of installed account state');
});

test('skill-toggle help never substitutes a blanket prohibition for actual permissions',async()=>{
 const {codexSkillToggleHint}=await import('./codex.ts');
 const readonly={...state,canToggle:false};
 assert.equal(codexSkillToggleHint(readonly,[],true),'');
 assert.equal(codexSkillToggleHint(readonly,[],false),'');
 assert.equal(codexSkillToggleHint({...state,inScope:false},[],true),'已启用');
 assert.equal(codexSkillToggleHint({...state,inScope:false},[],false),'Enabled');
});
