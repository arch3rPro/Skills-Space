// Read-only DSH declarations and skill inspection. Never boot plugins or evaluate expressions.
import { readFile, readdir, realpath, stat, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, isAbsolute, delimiter, basename, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fingerprint, text, yamlDocument, readConfiguration, configurationState } from './dsh-configuration.mjs';
import { projectPolicy } from './dsh-policy.mjs';
import { isAlias } from './skills/node_modules/yaml/dist/index.js';
export { fingerprint, text, yamlDocument };
const absent = error => ['ENOENT','ENOTDIR'].includes(error.code);
const canonical = async path => {try{return await realpath(path);}catch(error){const absolute=resolve(path),parent=dirname(absolute);if(!absent(error)||parent===absolute)return systemPath(absolute);return join(await canonical(parent),basename(absolute));}};
const systemPath = path => process.platform === 'darwin' ? resolve(path).replace(/^\/(var|tmp)(?=\/|$)/,'/private/$1') : resolve(path);
function boolean(data,key) {
  if(data[key]===undefined)return true;
  const value=data[key];
  if(typeof value==='boolean')return value;
  if(typeof value!=='string'&&value!==0&&value!==1)throw Error('Invalid invocation policy');
  const label=String(value).toLowerCase();
  if(['true','yes','on','1'].includes(label))return true;
  if(['false','no','off','0'].includes(label))return false;
  throw Error('Invalid invocation policy');
}
export function metadata(raw) {
  const match=raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if(!match)throw Error('Missing YAML frontmatter');
  const document=yamlDocument(match[1],false),data=document.toJS({maxAliasCount:50});
  if(!data||typeof data.name!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.name))throw Error('Invalid DSH skill name');
  if(typeof data.description!=='string'||!data.description.length)throw Error('Missing description');
  for(const key of ['disableModelInvocation','modelInvocable','userInvocable'])if(key in data)throw Error('Invalid invocation key');
  let version=null;
  const metadataNode=document.get('metadata',true);
  const metadataMap=isAlias(metadataNode)?metadataNode.resolve(document):metadataNode;
  for(const [node,value] of [[metadataMap?.get?.('version',true),data.metadata?.version],[document.get('version',true),data.version]]){
    const scalar=isAlias(node)?node.resolve(document):node;
    const label=typeof value==='string'?value:typeof value==='number'&&Number.isFinite(value)?scalar?.source:null;
    if(typeof label==='string'&&label.trim()){version=label.trim();break;}
  }
  const invocationEditable=!document.contents.items.some(pair=>['disable-model-invocation','user-invocable'].includes(pair.key?.value)&&pair.value?.anchor);
  return {name:data.name,description:data.description,version,invocationEditable,modelInvocable:data['disable-model-invocation']===undefined||!boolean(data,'disable-model-invocation'),userInvocable:boolean(data,'user-invocable')};
}
async function privatePath(path) {
  try { const info=await lstat(path);return info.isFile()&&!info.isSymbolicLink()&&info.nlink===1&&await realpath(path)===systemPath(path); }catch{return false;}
}
export function selectSkillConfiguration(configurations,contextKey,installation){
  if(contextKey?.startsWith('file:')){const sameFile=configurations.filter(row=>row.path===contextKey.slice(5));return sameFile.find(row=>row.disabled===false)??sameFile[0]??null;}
  const presets=configurations.filter(row=>typeof row.preset==='string'&&row.preset.trim().length>0);
  const requested=contextKey?configurations.find(row=>row.key===contextKey):null;
  if(contextKey){
    if(!requested)return null;
    if(presets.includes(requested))return requested;
    const sameFile=presets.filter(row=>row.path===requested.path);
    // A Host-only file still owns real skills; it is not an Agent preset.
    return sameFile.find(row=>row.disabled===false)??sameFile[0]??(requested.preset===null&&requested.parentPreset!==true?requested:null);
  }
  const preferred=presets.length?presets:configurations.filter(row=>row.preset===null&&row.parentPreset!==true);
  return preferred.find(row=>row.installation===installation&&row.disabled===false&&row.profile===(installation==='desktop'?'desktop':'web'))??preferred.find(row=>row.disabled===false)??(presets.length?presets[0]:null)??null;
}
export function selectDeclaredPreset(presets,configurations,contextKey,installation){
  if(contextKey?.startsWith('file:')){
    const sameFile=presets.filter(preset=>preset.path===contextKey.slice(5));
    return sameFile.find(preset=>preset.disabled===false)??sameFile[0]??null;
  }
  if(contextKey){
    const selected=presets.find(preset=>preset.key===contextKey||preset.configurationKeys.includes(contextKey));
    if(selected)return selected;
    const previous=configurations.find(row=>row.key===contextKey);
    if(!previous||previous.preset!==null||previous.parentPreset===true)return null;
    const sameFile=presets.filter(preset=>preset.path===previous.path);
    return sameFile.find(preset=>preset.disabled===false)??sameFile[0]??null;
  }
  return presets.find(preset=>preset.installation===installation&&preset.disabled===false&&preset.profile===(installation==='desktop'?'desktop':'web'))??presets.find(preset=>preset.disabled===false)??presets[0]??null;
}
export async function inspectDsh(home,dshHome,project=null,options={}) {
  home=resolve(home);dshHome=resolve(dshHome);
  const configuration=await readConfiguration(home,dshHome,options);
  if(options.contextKey==='all')return inspectAll(home,dshHome,project,options,configuration);
  return inspectContext(home,dshHome,project,options,configuration);
}
async function inspectContext(home,dshHome,project,options,configuration){
  const {warnings,dependencies,configurations,configurationFiles,presets,profiles,writableVersion}=configuration;
  const version=configuration.runtimeVersion;
  let projectRoot=project?resolve(project):null;
  if(projectRoot){let cursor=projectRoot;while(true){if(await stat(join(cursor,'.git')).catch(()=>null)){projectRoot=cursor;break;}const parent=dirname(cursor);if(parent===cursor)break;cursor=parent;}}
  const sharedValue=process.env.DSH_AGENTS_HOME?.trim()||join(home,'.agents');
  const sharedHome=resolve(sharedValue==='~'?home:sharedValue.startsWith('~/')?join(home,sharedValue.slice(2)):sharedValue);
  const canonicalRoot=join(project||home,'.agents/skills');
  const defaults=[];
  if(projectRoot)defaults.push({path:join(projectRoot,'.dsh/skills'),source:'project-dsh',rank:100},{path:join(projectRoot,'.agents/skills'),source:'project-agents',rank:200});
  defaults.push({path:join(dshHome,'skills'),source:'user-dsh',rank:400},{path:join(sharedHome,'skills'),source:'user-agents',rank:500});
  const requestedFile=options.contextKey?.startsWith('file:')?options.contextKey.slice(5):null;
  const preset=options.providerOnly?null:selectDeclaredPreset(presets,configurations,options.contextKey,configuration.installation);
  const providers=preset?configurations.filter(row=>preset.configurationKeys.includes(row.key)):[];
  const selected=options.providerOnly?configurations.find(row=>row.key===options.contextKey):preset?(providers.find(row=>row.key===options.contextKey)??providers.find(row=>row.disabled===false)??providers[0]??null):selectSkillConfiguration(configurations,options.contextKey,configuration.installation);
  const requested=options.contextKey?configurations.find(row=>row.key===options.contextKey):null;
  const configurationPath=requestedFile??preset?.path??selected?.path??requested?.path??configurationFiles.find(file=>file.installation===configuration.installation&&file.profile===(configuration.installation==='desktop'?'desktop':'web'))?.path??configurationFiles[0]?.path??null;
  const contextIssue=requestedFile?configurationFiles.some(file=>file.path===requestedFile)?null:'Selected DSH configuration changed. Read it again.':options.contextKey&&!requested&&!preset?'Selected DSH configuration changed. Read it again.':null;
  let roots=contextIssue||profiles.length>0&&!selected?[]:defaults.map(root=>({...root,contextKey:null,verified:profiles.length===0}));
  // A preset can mount several filesystem providers. The native inventory is
  // the preset's complete discovery set; provider identity still selects settings edits.
  if(selected||preset){
    roots=[];
    for(const provider of preset?providers:selected?[selected]:[]){
      if(provider.resolved===false||provider.disabled!==false||['includeDefaultRoots','customSkillDirs','dshHome','agentsHome','bundledSkillDir'].some(key=>provider.unresolvedFields?.includes(key))||['incomplete-bundles','relative-path'].includes(provider.readOnlyReason))continue;
      let providerRoots=[];
      if(provider.includeDefaultRoots!==false)providerRoots.push(...defaults.map(root=>({...root,contextKey:provider.key,verified:provider.editable})));
      for(const value of provider.customSkillDirs)if(isAbsolute(value))providerRoots.push({path:resolve(value),source:'custom',rank:300,contextKey:provider.key,verified:provider.editable});
      for(const [field,source,rank]of [['dshHome','configured-dsh',400],['agentsHome','configured-agents',500]])if(provider.includeDefaultRoots!==false&&provider[field]&&(isAbsolute(provider[field])||provider[field].startsWith('~/')||provider[field]==='~')){
        providerRoots=providerRoots.filter(root=>root.source!==(field==='dshHome'?'user-dsh':'user-agents'));
        providerRoots.push({path:join(provider[field]==='~'?home:provider[field].startsWith('~/')?join(home,provider[field].slice(2)):provider[field],'skills'),source,rank,contextKey:provider.key,verified:provider.editable});
      }
      const bundled=provider.bundledSkillDir??(provider.includeDefaultRoots!==false?process.env.DSH_BUNDLED_SKILL_DIR:null);
      if(bundled&&isAbsolute(bundled))providerRoots.push({path:bundled,source:'bundled',rank:600,contextKey:provider.key,verified:provider.editable});
      else if(bundled!=null)warnings.push('DSH bundled skill directory is relative; its launch directory is unknown');
      roots.push(...providerRoots);
    }
  }
  const expand = value => value==='~'?home:value?.startsWith('~/')?join(home,value.slice(2)):value;
  for(const root of roots)root.path=expand(root.path);
  const sharedRoots=await Promise.all([canonicalRoot,join(sharedHome,'skills'),...roots.filter(root=>['configured-agents','bundled'].includes(root.source)).map(root=>root.path)].map(canonical));
  const skills=[],seen=new Set();let scanned=0;
  for(const root of roots.sort((a,b)=>a.rank-b.rank)){
    root.inScope=!project||root.source.startsWith('project')||['custom','bundled'].includes(root.source);
    root.exists=(await stat(root.path).catch(()=>null))?.isDirectory()??false;
    const physicalRoot=await canonical(root.path);
    root.canCreate=root.inScope&&['user-dsh','project-dsh','configured-dsh','custom'].includes(root.source)&&physicalRoot===systemPath(root.path)&&!sharedRoots.some(shared=>physicalRoot===shared||physicalRoot.startsWith(shared+sep));
    if(seen.has(root.path))continue;seen.add(root.path);
    try{
      for(const entry of(await readdir(root.path,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
        if(++scanned>10000||skills.length>=2000)throw Error('Skill inspection limit exceeded');
        if(root.source==='user-dsh'&&entry.name==='.system')continue;
        const path=join(root.path,entry.name),info=await stat(path).catch(()=>null);
        const file=info?.isDirectory()?join(path,'SKILL.md'):info?.isFile()&&entry.name.endsWith('.md')?path:null;if(!file)continue;
        try{
          const raw=await text(file),actual=await realpath(path),actualFile=await realpath(file);let parsed;
          try{parsed=metadata(raw);}catch(error){parsed={name:entry.name.replace(/\.md$/,''),description:'',modelInvocable:false,userInvocable:false,reason:error.message};try{const m=raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);const data=m?yamlDocument(m[1]).toJS({maxAliasCount:50}):{};if(typeof data?.name==='string')parsed.name=data.name.replace(/[\x00-\x1f\x7f]/g,'').slice(0,255);if(typeof data?.description==='string')parsed.description=data.description;}catch{}}
          if(parsed.reason)warnings.push(`${file}: ${parsed.reason}`);
          const inScope=root.inScope;
          const native=['user-dsh','project-dsh','configured-dsh','custom'].includes(root.source)&&inScope&&root.rank!==600;
          const rootActual=await canonical(root.path);
          const sharedRoot=sharedRoots.some(shared=>rootActual===shared||rootActual.startsWith(shared+sep)||actualFile===shared||actualFile.startsWith(shared+sep));
          const privateFile=native&&!sharedRoot&&rootActual===systemPath(root.path)&&await privatePath(file)&&actual===systemPath(path)&&!basename(actual).startsWith('.')&&!relative(rootActual,actualFile).split(sep).includes('.system');
          skills.push({...parsed,declaredPath:systemPath(path),path:actual,file:actualFile,source:root.source,rank:root.rank,contextKey:root.contextKey,cliAddressable:root.path===canonicalRoot&&info.isDirectory()&&parsed.name===entry.name,shadowed:false,configured:root.source.startsWith('configured')||root.source==='custom',inScope,reason:parsed.reason??null,documentRevision:fingerprint(raw),canSetInvocation:privateFile&&!parsed.reason&&parsed.invocationEditable!==false,canTrash:privateFile,physicalRoot:rootActual});
        }catch(error){if(!absent(error))warnings.push(`${file}: skill could not be inspected`);}
      }
    }catch(error){if(!absent(error))warnings.push(`${root.path}: skill directory could not be inspected`);}
  }
  const winners=new Map();for(const skill of skills)if(!skill.reason){const winner=winners.get(skill.name);if(winner)skill.shadowed=winner.path!==skill.path;else winners.set(skill.name,skill);}
  const canonicalActual=await canonical(canonicalRoot),sharedActual=await canonical(join(sharedHome,'skills'));
  // Profile discovery/editability does not change the original CLI's shared installation target.
  const installIssue=project&&projectRoot!==resolve(project)?'DSH resolves this project to a parent Git root. Choose the repository root before installing for DSH.':!project&&sharedActual!==canonicalActual?'DSH uses a different shared root. The original CLI installs to ~/.agents/skills.':null;
  dependencies.sort((a,b)=>a.path.localeCompare(b.path));
  const revision=fingerprint(JSON.stringify(dependencies));
  const snapshot={dshHome,sharedHome,projectRoot,canonicalRoot,roots:roots.filter((r,i,a)=>a.findIndex(v=>v.path===r.path)===i),profiles,configurationFiles,configurationPath,presets,presetKey:preset?.key??null,configurations,skills,warnings,installIssue,contextIssue,contextKey:selected?.key??preset?.key??(requestedFile?options.contextKey:null),runtimeVersion:selected?.runtimeVersion??version,writableVersion,dependencies,revision,runtimeVerified:false};
  Object.defineProperty(snapshot,configurationState,{value:configuration});
  snapshot.policy=await projectPolicy(snapshot,configuration);
  return snapshot;
}
async function inspectAll(home,dshHome,project,options,configuration){
  const requests=[...configuration.presets.filter(preset=>preset.directoryStatus!=='none').map(preset=>({contextKey:preset.key})),...configuration.configurations.filter(row=>row.preset===null&&!row.parentPreset).map(row=>({contextKey:row.key,providerOnly:true}))];
  const snapshots=[];
  for(const request of requests)snapshots.push(await inspectContext(home,dshHome,project,{...options,...request},configuration));
  if(!snapshots.length)snapshots.push(await inspectContext(home,dshHome,project,{...options,contextKey:null},configuration));
  const skills=new Map(),roots=new Map(),contexts=[],policies=new Map();
  for(const snapshot of snapshots){
    const preset=snapshot.presets.find(row=>row.key===snapshot.presetKey);
    const membership={configurationPath:snapshot.configurationPath,presetKey:preset?.key??null,preset:preset?.preset??null,contextKey:snapshot.contextKey};
    contexts.push({...membership,policy:snapshot.policy});
    if(snapshot.configurationPath){const group=policies.get(snapshot.configurationPath)??[];group.push(snapshot.policy);policies.set(snapshot.configurationPath,group);}
    for(const root of snapshot.roots){const existing=roots.get(root.path);if(existing)existing.memberships.push(membership);else roots.set(root.path,{...root,memberships:[membership]});}
    for(const skill of snapshot.skills){
      const owner={...membership,shadowed:skill.shadowed};
      const existing=skills.get(skill.file);
      if(existing){existing.memberships.push(owner);existing.shadowed=existing.shadowed&&skill.shadowed;existing.canTrash=existing.canTrash&&skill.canTrash;existing.canSetPolicy=existing.canSetPolicy||skill.canSetPolicy;existing.inScope=existing.inScope||skill.inScope;}
      else skills.set(skill.file,{...skill,memberships:[owner]});
    }
  }
  const policyConfigurations=[...policies].map(([path,values])=>{
    const base=values[0],live=values.filter(row=>row.running);
    const failure=values.find(row=>row.status==='error');
    const policy={...base,...(failure??{}),running:live.length>0,status:failure?'error':base.canSave?(live.length&&live.every(row=>row.status==='active')?'active':'pending'):base.status,pendingReason:values.some(row=>row.running&&row.pendingReason==='reload')?'reload':values.some(row=>row.pendingReason==='apply')?'apply':'reload'};
    return {...policy,path,profile:configuration.configurationFiles.find(row=>row.path===path)?.profile??''};
  });
  const base=snapshots[0],values=policyConfigurations,live=values.filter(row=>row.running);
  const error=values.find(row=>row.status==='error');
  const unavailable=values.find(row=>row.status==='unavailable'&&row.providerCount>0);
  const missing=values.some(row=>['not-installed','needs-setup'].includes(row.status));
  const policy={...base.policy,configuration:unavailable?.path??null,configurations:values,canInstall:values.some(row=>row.canInstall&&['not-installed','needs-setup'].includes(row.status)),canSave:values.some(row=>row.canSave),providerCount:values.reduce((sum,row)=>sum+(row.providerCount??0),0),status:error?'error':missing?'not-installed':unavailable?'unavailable':(live.length?live.some(row=>row.status==='pending'):values.some(row=>row.status==='pending'))?'pending':live.some(row=>row.status==='active')?'active':'unavailable',running:live.length>0,pendingReason:!live.length||live.some(row=>row.status==='pending'&&row.pendingReason==='reload')?'reload':'apply',...(error?{issue:error.issue,migrationConflicts:error.migrationConflicts,problemPath:error.problemPath}:{} )};
  const snapshot={...base,aggregate:true,contextKey:'all',configurationPath:null,presetKey:null,contextIssue:null,contexts,policy,skills:[...skills.values()],roots:[...roots.values()],warnings:[...new Set(snapshots.flatMap(row=>row.warnings))]};
  Object.defineProperty(snapshot,configurationState,{value:configuration});
  return snapshot;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  try{
    const [home,dshHome,project,mode,payload]=process.argv.slice(2);
    if(!isAbsolute(home)||!isAbsolute(dshHome)||project&&!isAbsolute(project))throw Error('DSH inspection requires absolute paths');
    if(mode==='validate'){const documents=JSON.parse(payload);if(!Array.isArray(documents)||documents.length>2000)throw Error('Too many skills');console.log(JSON.stringify(documents.map(item=>{try{metadata(item.content);return {name:item.name,error:null};}catch(error){return {name:item.name,error:error.message};}})));}
    else console.log(JSON.stringify(await inspectDsh(home,dshHome,project||null,payload?JSON.parse(payload):{})));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
