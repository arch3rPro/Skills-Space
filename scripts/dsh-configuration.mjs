// DSH configuration inspection. Reuse original app-boot composition; never boot a Profile.
import { readFile, readdir, stat, lstat, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createRequire } from 'node:module';
import { dirname, join, resolve, delimiter, basename, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pluginName } from './dsh-skill-policy/state.mjs';
import { parseDocument, visit, isAlias, Scalar } from './skills/node_modules/yaml/dist/index.js';
export const fingerprint = value => createHash('sha256').update(value).digest('hex');
export const configurationState = Symbol('DSH configuration ownership');
export const writableFields = ['customSkillDirs','includeDefaultRoots','watch','dshHome','agentsHome','watchUsePolling','watchStabilityThresholdMs','watchPollIntervalMs','watchMaxProjects','watchFollowSymlinks'];
export const directoryFields = ['customSkillDirs','includeDefaultRoots','dshHome','agentsHome'];
export const defaults = {customSkillDirs:[],includeDefaultRoots:true,watch:true,dshHome:null,agentsHome:null,watchUsePolling:false,watchStabilityThresholdMs:200,watchPollIntervalMs:100,watchMaxProjects:128,watchFollowSymlinks:true,providerName:'filesystem',bundledSkillDir:null};
const absent = error => ['ENOENT','ENOTDIR'].includes(error.code);
export async function text(path) {
  const info=await stat(path); if(!info.isFile()||info.size>256*1024)throw Error('Inspection size limit exceeded');
  const raw=await readFile(path,'utf8'); if(Buffer.byteLength(raw)>256*1024)throw Error('Inspection size limit exceeded');return raw;
}
export function yamlDocument(raw,expressions=true) {
  const doc=parseDocument(raw,{customTags:expressions?[{tag:'tag:yaml.org,2002:js',resolve:value=>({__jsExpr:value})}]:[]});
  if(doc.errors.length)throw Error('Invalid YAML');return doc;
}
export function expression(value){return !!value&&typeof value==='object'&&('__jsExpr' in value||Object.values(value).some(expression));}
function complex(doc){let found=false;visit(doc,{Node(_key,node){if(isAlias(node)||node.anchor||node.value==='<<')found=true;}});return found;}
function canonical(path){return process.platform==='darwin'?resolve(path).replace(/^\/(var|tmp)(?=\/|$)/,'/private/$1'):resolve(path);}
export async function privateFile(path,missing=false){try{const info=await lstat(path);return info.isFile()&&!info.isSymbolicLink()&&info.nlink===1&&await realpath(path)===canonical(path);}catch(error){return missing&&absent(error)&&await realpath(dirname(path)).catch(()=>null)===canonical(dirname(path));}}
export async function installedRuntime(home, installation = null) {
  // Electron's original filesystem understands the desktop ASAR. Ordinary Node does not.
  if(process.versions.electron && installation !== 'cli'){
    const anchor=join(dirname(process.execPath),'../Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json');
    try{const data=JSON.parse(await text(anchor));if(data.name==='@deepseek-ai/dsh')return {anchor,version:data.version,installation:'desktop'};}catch{}
  }
  if(installation === 'desktop')return {anchor:null,version:null,installation:'desktop'};
  const executables=[...(process.env.PATH??'').split(delimiter).filter(Boolean).map(p=>join(p,'dsh')),join(home,'.local/bin/dsh'),'/opt/homebrew/bin/dsh','/usr/local/bin/dsh'];
  for(const executable of executables){const actual=await realpath(executable).catch(()=>null);if(!actual)continue;let parent=dirname(actual);
    for(let i=0;i<3;i++,parent=dirname(parent))try{const anchor=join(parent,'package.json'),data=JSON.parse(await text(anchor));if(data.name==='@deepseek-ai/dsh')return {anchor,version:data.version,installation:'cli'};}catch{}
  }
  // Desktop ships the original CLI too; a separate npm installation is optional.
  if(process.versions.electron&&installation==='cli'){
    const bundled=await installedRuntime(home,'desktop');
    if(bundled.anchor)return {...bundled,installation:'cli'};
  }
  return {anchor:null,version:null,installation:'cli'};
}
export function normalize(config){const value={};for(const [key,fallback]of Object.entries(defaults))value[key]=config?.[key]??fallback;return value;}
export function validateSettings(config){
  if(!config||typeof config!=='object'||Array.isArray(config))return false;
  for(const key of ['includeDefaultRoots','watch','watchUsePolling','watchFollowSymlinks'])if(config[key]!==undefined&&typeof config[key]!=='boolean')return false;
  for(const key of ['watchStabilityThresholdMs','watchPollIntervalMs','watchMaxProjects'])if(config[key]!==undefined&&(!Number.isSafeInteger(config[key])||config[key]<1))return false;
  for(const key of ['dshHome','agentsHome','bundledSkillDir'])if(config[key]!=null&&(typeof config[key]!=='string'||config[key].includes('\0')||config[key].length>4096))return false;
  if(config.providerName!==undefined&&(typeof config.providerName!=='string'||!config.providerName))return false;
  return config.customSkillDirs===undefined||Array.isArray(config.customSkillDirs)&&config.customSkillDirs.length<=100&&config.customSkillDirs.every(p=>typeof p==='string'&&!p.includes('\0')&&p.length<=4096);
}
export function restoreExpressions(doc){visit(doc,{Scalar(_key,node){if(node.tag==='tag:yaml.org,2002:js'&&typeof node.value?.__jsExpr==='string')node.value=node.value.__jsExpr;},Map(_key,node){if(node.items.length===1&&typeof node.get('__jsExpr')==='string'){const scalar=new Scalar(node.get('__jsExpr'));scalar.tag='tag:yaml.org,2002:js';return scalar;}}});}
export function entries(rows){
  const found=[];
  function walk(list,parents=[],preset=null,owner=null,prefix=[]){
    for(const [index,row] of (list??[]).entries()){
      if(!row||typeof row!=='object')continue;
      const address=[...prefix,index],chain=[...parents,row];
      found.push({row,parents,preset,owner,address});
      if(row.group===true&&Array.isArray(row.config))walk(row.config,chain,preset,owner??(row.name==='@deepseek-ai/dsh-skill-filesystem'&&row.config?.[0]?.name===pluginName?row:null),[...address,'config']);
      if(row.name==='@deepseek-ai/dsh-agent-preset'&&Array.isArray(row.config?.plugins))walk(row.config.plugins,chain,typeof row.config.id==='string'&&row.config.id.trim()?row.config.id:null,row,[...address,'config','plugins']);
    }
  }
  walk(rows);return found;
}
export function valueAt(value,path){for(const key of path??[])value=value?.[key];return value;}
export function entryAt(rows,address){return entries(rows).find(item=>JSON.stringify(item.address)===JSON.stringify(address));}
// Root Cordis identifiers are scoped independently from children of each preset.
export function sameEntry(rows,item){
  if(!item.owner)return entries(rows).find(other=>!other.owner&&other.row.id===item.row.id&&entryName(other.row)===entryName(item.row));
  const parent=entries(rows).find(other=>!other.owner&&other.row.id===item.owner.id&&other.row.name===item.owner.name);
  if(!parent)return undefined;
  const chain=[...item.parents.slice(item.parents.indexOf(item.owner)+1),item.row];
  let list=parent.row.group?parent.row.config:parent.row.config?.plugins,address=parent.row.group?[...parent.address,'config']:[...parent.address,'config','plugins'],row;
  for(const expected of chain){
    if(!Array.isArray(list))return undefined;
    const matches=list.map((row,index)=>({row,index})).filter(value=>value.row?.id===expected.id&&entryName(value.row)===entryName(expected));
    if(matches.length!==1)return undefined;
    const match=matches[0];row=match.row;address=[...address,match.index];
    if(expected!==item.row){if(row.group!==true)return undefined;list=row.config;address=[...address,'config'];}
  }
  return {row,owner:parent.row,address};
}
export function isProvider(row){return !row.group&&(row.name==='@deepseek-ai/dsh-skill-filesystem'||row.name===pluginName);}
export function providerConfig(row){return row?.name===pluginName?row.config?.filesystem??{}:row?.config??{};}
export function setProviderConfig(row,value){if(row.name===pluginName)row.config={...row.config,filesystem:value};else row.config=value;}
const entryName=row=>row.name===pluginName?'@deepseek-ai/dsh-skill-filesystem':row.name;
export function configLocations(patches,id,name){
  const found=[];
  function walk(list,prefix,inserted=false){for(const [i,row]of list.entries()){if(!row||typeof row!=='object')continue;const at=[...prefix,i];if(row.id===id&&(!row.name||row.name===name)&&!row.insert&&Object.hasOwn(row,'config'))found.push(at);if(Array.isArray(row.insert))walk(row.insert,[...at,'insert'],true);if(inserted&&row.group&&Array.isArray(row.config))walk(row.config,[...at,'config'],true);}}
  walk(patches,[]);return found;
}
export function stripConfig(patches,id,name){const clone=structuredClone(patches);for(const at of configLocations(clone,id,name)){let value=clone;for(const key of at)value=value[key];delete value.config;}return clone;}

function changedPaths(current,inherited,path='',result=[]){
  if(JSON.stringify(current)===JSON.stringify(inherited)||result.length>=100)return result;
  if(!current||!inherited||typeof current!=='object'||typeof inherited!=='object'||Array.isArray(current)!==Array.isArray(inherited)){result.push(path||'config');return result;}
  if(Array.isArray(current)){
    const key=row=>row&&typeof row==='object'&&typeof row.id==='string'?row.id:null;
    if([...current,...inherited].every(row=>key(row))){
      const ids=[...new Set([...current,...inherited].map(key))];
      for(const id of ids)changedPaths(current.find(row=>key(row)===id),inherited.find(row=>key(row)===id),`${path}[${id}]`,result);
      if(JSON.stringify(current.map(key))!==JSON.stringify(inherited.map(key)))result.push(`${path}.order`);
    }else result.push(path);
  }else for(const key of new Set([...Object.keys(current),...Object.keys(inherited)]))changedPaths(current[key],inherited[key],path?`${path}.${key}`:key,result);
  return result.slice(0,100);
}
async function readOneConfiguration(home,dshHome,options={}) {
  const runtime=await installedRuntime(home,options.installation),version=options.runtimeVersion??runtime.version;
  const dependencies=[],warnings=[],profiles=[],configurationFiles=[],presets=[],rows=[],contexts=new Map();let api=null;
  async function dependency(path){if(dependencies.some(d=>d.path===path))return text(path).catch(error=>{if(absent(error))return null;throw error;});if(dependencies.length>=500)throw Error('DSH dependency limit exceeded');try{const raw=await text(path);dependencies.push({path,revision:fingerprint(raw)});return raw;}catch(error){if(!absent(error))throw error;dependencies.push({path,revision:'missing'});return null;}}
  try{if(runtime.anchor){await dependency(runtime.anchor);const modulePath=createRequire(runtime.anchor).resolve('@deepseek-ai/dsh-app-boot');await dependency(modulePath);api=await import(pathToFileURL(modulePath).href);if(typeof api.composeEntries!=='function'||typeof api.resolveBundleDir!=='function')api=null;}}catch{}
  // Verify the original composition contract instead of disabling an entire new release.
  let writableVersion=false;
  if(api)try{const probe=api.composeEntries([[{insert:[{id:'skills-space-probe',name:'probe',config:{a:1,b:2}}]}],[{id:'skills-space-probe',config:{a:3}}]]);writableVersion=JSON.stringify(probe[0]?.config)===JSON.stringify({a:3});}catch{}
  let homePatches=[],homeError=false;
  const homePath=join(dshHome,'cordis.patch.yml');try{const raw=await dependency(homePath);if(raw!==null){homePatches=yamlDocument(raw).toJS({maxAliasCount:50});if(!Array.isArray(homePatches))throw Error('Invalid HOME patch');}}catch{homeError=true;warnings.push('DSH home configuration could not be inspected');}
  const dirs=await readdir(join(dshHome,'profiles'),{withFileTypes:true}).catch(error=>{if(!absent(error))warnings.push('DSH profiles could not be inspected');return [];});
  for(const dir of dirs.sort((a,b)=>a.name.localeCompare(b.name))){
    if(runtime.installation==='desktop'?dir.name!=='desktop':dir.name==='desktop')continue;
    if(!dir.isDirectory()||dir.name==='node_modules'||dir.name.startsWith('.')||dir.name.includes('\\'))continue;
    const profileDir=join(dshHome,'profiles',dir.name),manifestPath=join(profileDir,'package.json'),path=join(profileDir,'cordis.patch.yml');
    let manifest,raw,doc,patches,layers=[],incomplete=false;
    try{const manifestRaw=await dependency(manifestPath);if(!manifestRaw)continue;manifest=JSON.parse(manifestRaw);if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))continue;const bundles=manifest.dsh?.profile?.bundles??[];if(!Array.isArray(bundles))throw Error('Invalid bundle list');profiles.push(dir.name);if(profiles.length>100)throw Error('Too many profiles');
      raw=await dependency(path);configurationFiles.push({path,profile:dir.name,installation:runtime.installation,exists:raw!==null});doc=yamlDocument(raw??'[]\n');patches=doc.toJS({maxAliasCount:50});if(!Array.isArray(patches))throw Error('Invalid profile patches');
      await dependency(join(profileDir,api?.PROFILE_COMPATIBILITY_FILENAME??'compatibility.json'));
      if(!api){if(!warnings.includes('DSH configuration reader is unavailable for this installation'))warnings.push('DSH configuration reader is unavailable for this installation');continue;}
      for(const packageName of bundles){let stage='resolve';try{if(typeof packageName!=='string')throw Error('Invalid bundle name');const packageDir=api.resolveBundleDir('dsh',packageName,runtime.anchor,profileDir),bundlePath=join(packageDir,'package.json');stage='configuration';const bundle=JSON.parse(await dependency(bundlePath));
        const compatibility=api.evaluatePluginCompatibility?.(bundle,api.readProfileVersionExemptions(profileDir),version);if(compatibility&&!compatibility.exempted){incomplete=true;warnings.push(`DSH ${manifestPath}: bundle ${packageName} is incompatible with runtime ${version}`);continue;}
        stage='patches';
        for(const patchPath of api.bundlePatchPaths(packageDir,bundle.dsh.bundle)){await dependency(patchPath);layers.push({path:patchPath,patches:api.loadOverlayPatches('dsh',patchPath)});}
      }catch{incomplete=true;warnings.push(`DSH ${manifestPath}: bundle ${String(packageName)} ${stage==='resolve'?'could not be resolved':'configuration could not be read'}`);}}
      // Inspect the installed schema declaration as data; importing this plugin would register code.
      let supportedFields=[];
      for(const anchor of [runtime.anchor,manifestPath]){
        try{
          const source=await dependency(createRequire(anchor).resolve('@deepseek-ai/dsh-skill-filesystem'));
          const declaration=source?.match(/(?:const|var) Config\s*=\s*(?:z|Schema)\.object\(\{([\s\S]*?)\}\)/)?.[1];
          if(declaration){supportedFields=writableFields.filter(field=>new RegExp('(?:^|[,\\n])\\s*'+field+'\\s*:').test(declaration));break;}
        }catch{}
      }
      const lower=layers.flatMap(l=>l.patches),base=api.composeEntries([lower,patches]),effective=api.composeEntries([lower,patches,homePatches]);
      const flat=entries(effective);
      const identity=item=>JSON.stringify([...item.parents,item.row].map(row=>[row.id,entryName(row),row.group===true]));
      const counts=new Map();for(const item of flat)counts.set(identity(item),(counts.get(identity(item))??0)+1);
      const presetOwners=new Map();
      for(const item of flat.filter(item=>item.row.name==='@deepseek-ai/dsh-agent-preset')){
        const config=item.row.config;
        if(typeof config?.id!=='string'||!config.id.trim())continue;
        const key=runtime.installation+':preset:'+fingerprint(JSON.stringify([manifestPath,config.id,identity(item)])).slice(0,24);
        const preset={key,path,profile:dir.name,installation:runtime.installation,preset:config.id,configurationKeys:[],directoryStatus:Array.isArray(config.plugins)?'none':'unknown',disabled:expression(item.row.disabled)||item.parents.some(parent=>expression(parent.disabled))?null:item.row.disabled===true||item.parents.some(parent=>parent.disabled===true)};
        if(typeof config.name==='string')preset.presetName=config.name;
        if(typeof config.description==='string')preset.presetDescription=config.description;
        if(typeof config.order==='number'&&Number.isFinite(config.order))preset.order=config.order;
        presets.push(preset);presetOwners.set(item.row,preset);
      }
      for(const item of flat.filter(item=>isProvider(item.row))){
        const {row,parents,preset,owner}=item,id=row.id;
        const target=owner??row,targetId=target.id,targetName=target.name;
        const key=runtime.installation+':'+fingerprint(JSON.stringify([manifestPath,preset,identity(item)])).slice(0,24),config=providerConfig(row),dynamic=expression(config)||expression(row.disabled)||parents.some(p=>expression(p.disabled));
        const inheritedTree=api.composeEntries([lower,stripConfig(patches,targetId,targetName)]);
        const lowerRow=sameEntry(inheritedTree,item)?.row??(owner?.group?sameEntry(inheritedTree,{row:owner,owner:null})?.row:null);
        const baseRow=sameEntry(base,item)?.row;
        const shadow=configLocations(homePatches,targetId,targetName).length>0||JSON.stringify(providerConfig(baseRow))!==JSON.stringify(config);
        const disabled=parents.some(p=>p.disabled===true)||row.disabled===true;
        const conditional=expression(row.disabled)||parents.some(p=>expression(p.disabled));
        let reason=!writableVersion||!supportedFields.length?'unsupported-configuration':incomplete?'incomplete-bundles':homeError?'home-overlay':conditional?'dynamic':typeof targetId!=='string'||!targetId||counts.get(identity(item))!==1||flat.filter(e=>!e.owner&&e.row.id===targetId).length!==1?'ambiguous':Object.hasOwn(config,'__jsExpr')?'dynamic':!validateSettings(Object.fromEntries(Object.entries(config).filter(([key,v])=>directoryFields.includes(key)&&!expression(v))))?'unsupported-fields':shadow?'home-overlay':null;
        // Only the target config and its own YAML references restrict edits; unrelated expressions do not.
        if(!reason){const targetPatches=configLocations(patches,targetId,targetName).map(at=>doc.getIn(at,true));if(targetPatches.some(node=>complex(node)))reason='complex-yaml';}
        if(!reason&&(!await privateFile(manifestPath)||!await privateFile(path,true)))reason='linked-configuration';
        const relative = value => typeof value==='string'&&!isAbsolute(value);
        const homeRelative = value => relative(value)&&value!=='~'&&!value.startsWith('~/');
        if(!reason&&((Array.isArray(config.customSkillDirs)?config.customSkillDirs:[]).some(relative)||relative(config.bundledSkillDir)||homeRelative(config.dshHome)||(version==='0.2.0-rc.2'?relative(config.agentsHome):homeRelative(config.agentsHome))))reason='relative-path';
        const own=configLocations(patches,targetId,targetName).length>0,normalized=normalize(config),inherited=normalize(providerConfig(lowerRow));
        // Raw configurations remain private to this process; only known skill settings reach the UI.
        const unresolvedFields=Object.keys(defaults).filter(field=>Object.hasOwn(config,'__jsExpr')||expression(config[field]));
        const safe={};for(const [field,value]of Object.entries(normalized))safe[field]=unresolvedFields.includes(field)?(Array.isArray(defaults[field])?[]:null):value;
        const safeInherited={};for(const [field,value]of Object.entries(inherited))safeInherited[field]=expression(value)?null:value;
        const parentLower=owner?sameEntry(inheritedTree,{...item,row:owner,owner:null})?.row?.config:null;
        const parentChanges=owner&&own?changedPaths(owner.config,parentLower):[];
        const result={key,installation:runtime.installation,runtimeVersion:version,anchor:runtime.anchor,parentPreset:!!owner&&!owner.group,parentChanges,path,openPath:reason==='home-overlay'?homePath:path,openExists:reason==='home-overlay'?homeError||dependencies.some(d=>d.path===homePath&&d.revision!=='missing'):raw!==null,manifestPath,profile:dir.name,preset,provider:typeof config.providerName==='string'?config.providerName:'filesystem',readOnlyFields:writableFields.filter(field=>!supportedFields.includes(field)),policyWrapped:row.name===pluginName,policyOptions:row.name===pluginName?row.config:null,entryId:typeof id==='string'?id:null,unresolvedFields,resolved:!homeError&&!incomplete,disabled:conditional?null:disabled,...safe,dynamic,editable:reason===null,readOnlyReason:reason,hasOverride:own,inherited:safeInherited,source:shadow?'home':own?'profile':'bundle',patchExists:raw!==null,compositionRevision:fingerprint(JSON.stringify(effective)),materializesInheritance:!own&&(!!owner||Object.keys(config).some(k=>!writableFields.includes(k))),canRestore:reason===null&&own&&(!owner||!!lowerRow)};
        result.canRestoreDirectories=result.canRestore&&directoryFields.some(field=>!isDeepStrictEqual(config[field],providerConfig(lowerRow)?.[field]));
        if(typeof owner?.config?.name==='string')result.presetName=owner.config.name;
        if(typeof owner?.config?.description==='string')result.presetDescription=owner.config.description;
        const declaration=presetOwners.get(owner);
        if(declaration){result.presetKey=declaration.key;declaration.configurationKeys.push(key);declaration.directoryStatus='available';}
        rows.push(result);contexts.set(key,{api,id,name:row.name,path,manifestPath,raw,doc,patches,lower,homePatches,effective,config,inheritedConfig:providerConfig(lowerRow),owner,version,item,targetId,targetName,inheritedTree});
      }
    }catch{warnings.push(`${dir.name}: DSH configuration could not be inspected`);}
  }
  dependencies.sort((a,b)=>a.path.localeCompare(b.path));
  presets.sort((a,b)=>a.path.localeCompare(b.path)||((a.order??Infinity)-(b.order??Infinity)||a.preset.localeCompare(b.preset)));
  return {installation:runtime.installation,runtimeVersion:version,writableVersion,profiles,configurationFiles,presets,configurations:rows,contexts,dependencies,warnings,revision:fingerprint(JSON.stringify(dependencies)),homeError,apiAvailable:!!api};
}

export async function readConfiguration(home,dshHome,options={}) {
  const selected=options.contextKey?.split(':')[0];
  const primary=await installedRuntime(home,options.installation??selected);
  const kinds=process.versions.electron?['desktop','cli']:['cli'];
  const values=[];
  for(const installation of kinds){
    const runtime=await installedRuntime(home,installation);
    if(runtime.anchor||installation===primary.installation)values.push(await readOneConfiguration(home,dshHome,{...options,installation}));
  }
  const own=values.find(value=>value.installation===primary.installation)??values[0];
  const dependencies=[...new Map(values.flatMap(value=>value.dependencies).map(value=>[value.path,value])).values()].sort((a,b)=>a.path.localeCompare(b.path));
  return {...own,profiles:[...new Set(values.flatMap(value=>value.profiles))],configurationFiles:values.flatMap(value=>value.configurationFiles),presets:values.flatMap(value=>value.presets),configurations:values.flatMap(value=>value.configurations),contexts:new Map(values.flatMap(value=>[...value.contexts])),warnings:[...new Set(values.flatMap(value=>value.warnings))],dependencies,revision:fingerprint(JSON.stringify(dependencies))};
}
