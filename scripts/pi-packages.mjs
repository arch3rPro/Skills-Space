// Inspect packages without loading their extension entry points. Lifecycle and resource
// selection are delegated to the qualified, unmodified Pi implementation.
import {readFileSync, existsSync, lstatSync} from 'node:fs';
import {basename, dirname, join, resolve} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {originalRuntime} from './pi-package-driver.mjs';
import {readProjectTrust} from './inspect-pi-skills.mjs';
const types=['extensions','skills','prompts','themes'];
const digest=value=>createHash('sha256').update(value).digest('hex');
function read(path) {
  if(!existsSync(path))return null;
  if(lstatSync(path).size>1024*1024)throw Error('Pi configuration or package manifest exceeds the size limit.');
  return readFileSync(path,'utf8');
}
function json(path) {const raw=read(path);let value;try{value=raw===null?{}:JSON.parse(raw.replace(/^\uFEFF/,''));}catch{throw Error('Invalid Pi configuration or package manifest.');}if(!value||Array.isArray(value)||typeof value!=='object')throw Error('Invalid Pi configuration.');return value;}
const sourceOf=p=>typeof p==='string'?p:p.source;
export async function packageContext(home,agent,project='') {
  const runtime=await originalRuntime(agent),cwd=project||home;
  const globalPath=join(agent,'settings.json'),projectPath=join(cwd,'.pi/settings.json');
  const global=json(globalPath),trust=readProjectTrust(home,agent,project,global);
  const local=project&&trust.trusted?json(projectPath):{};
  const rawTexts={global:read(globalPath),project:project?read(projectPath):null};
  const texts={...rawTexts};
  // Pi's own SettingsManager handles field changes in memory; Rust applies only
  // changed resource/package fields under the existing revision/atomic-write guard.
  const {SettingsManager}=await import(pathToFileURL(join(runtime.installed,'dist/core/settings-manager.js')));
  const storage={withLock(scope,fn){const result=fn(texts[scope]??undefined);if(result!==undefined)texts[scope]=result;}};
  const settings=SettingsManager.fromStorage(storage,{projectTrusted:!!project&&trust.trusted});
  if(settings.drainErrors().length)throw Error('Pi settings could not be read.');
  const builtinText=readFileSync(join(runtime.installed,'dist/extensions/index.js'),'utf8');
  const builtins=[...builtinText.matchAll(/\{ name: "([^"]+)",[^\n]+builtin: true \}/g)].map(match=>match[1]);
  if(!builtins.length)throw Error('Unsupported Pi built-in extension declaration.');
  const make=(settingsManager)=>new runtime.DefaultPackageManager({cwd,agentDir:agent,settingsManager,builtinExtensions:builtins});
  const manager=make(settings);
  const globalManager=make({getGlobalSettings:()=>global,getProjectSettings:()=>({}),getNpmCommand:()=>global.npmCommand,isProjectTrusted:()=>false});
  const [globalResources,projectResources]=await Promise.all([globalManager.resolve(async()=> 'skip'),project&&trust.trusted?manager.resolve(async()=> 'skip'):Promise.resolve(null)]);
  const resolved={global:globalResources,project:projectResources??globalResources};
  // Use the same selection implementation as `pi config`; never evaluate a
  // package extension or initialize an Agent session to change loading choices.
  const {ConfigSelectorComponent}=await import(pathToFileURL(join(runtime.installed,'dist/modes/interactive/components/config-selector.js')));
  const selector=new ConfigSelectorComponent(resolved,settings,cwd,agent,()=>{},()=>{},()=>{},24,project?'project':'global',trust.trusted).getResourceList();
  const all=types.flatMap(type=>(project?resolved.project:resolved.global)[type].map(resource=>({...resource,resourceType:type})));
  const configured=manager.listConfiguredPackages();
  const packages=[];
  const candidates=project?configured.filter(p=>p.scope==='project').concat(configured.filter(p=>p.scope==='user')):configured.filter(p=>p.scope==='user');
  const seen=new Set();
  for(const row of candidates) {
    const identity=manager.getPackageIdentity(row.source,row.scope);
    if(seen.has(identity))continue;
    seen.add(identity);
    const ownEntries=row.scope==='project'?local.packages:global.packages;
    const declaration=(ownEntries??[]).find(p=>sourceOf(p)===row.source);
    const delta=typeof declaration==='object'&&declaration.autoload===false;
    const inherited=configured.find(p=>p.scope==='user'&&manager.getPackageIdentity(p.source,p.scope)===identity);
    const root=row.installedPath??(delta?inherited?.installedPath:undefined)??null;
    let manifest={};if(root)try{manifest=json(join(root,'package.json'));}catch{/* File packages have no package manifest. */}
    const resources=all.filter(item=>item.metadata.origin==='package'&&manager.getPackageIdentity(item.metadata.source,item.metadata.scope)===identity);
    const parsed=manager.parseSource(row.source);
    packages.push({id:identity,source:row.source,scope:row.scope,kind:parsed.type,path:root,name:typeof manifest.name==='string'?manifest.name:parsed.name??basename(row.source),description:typeof manifest.description==='string'?manifest.description:'',version:typeof manifest.version==='string'?manifest.version:null,inherited:!!project&&row.scope==='user',delta,canRemove:!project||row.scope==='project'&&!delta,canUpdate:parsed.type!=='local'&&!!root,resources:resources.map(resource)});
  }
  function resource(item) {
    const override=project?selector.getProjectOverrideState(item):null;
    return {id:digest(`${item.resourceType}:${item.path}`),path:item.path,name:(item.path.startsWith('builtin:')?item.path.slice('builtin:'.length):item.resourceType==='skills'&&basename(item.path)==='SKILL.md'?basename(dirname(item.path)):basename(item.path)).replace(/\.(ts|js|md|json)$/,''),type:item.resourceType,enabled:item.enabled,override};
  }
  const builtinResources=all.filter(item=>item.metadata.source==='builtin').map(resource);
  const revision=digest(JSON.stringify({global:read(globalPath),local:project?read(projectPath):null,trust:trust.dependency,version:runtime.version,packages,builtinResources}));
  return {home,agent,project,cwd,runtime,settings,manager,selector,all,texts,rawTexts,globalPath,projectPath,snapshot:{version:runtime.version,revision,projectTrusted:trust.trusted,packages,builtins:builtinResources}};
}
export async function packageOperation(home,agent,project,request) {
  const ctx=await packageContext(home,agent,project);
  if(request.action==='list')return {snapshot:ctx.snapshot};
  if(request.revision!==ctx.snapshot.revision)throw Error('Pi packages or settings changed. Refresh the package list.');
  if(project&&!ctx.snapshot.projectTrusted)throw Error('This project is not trusted. Trust it in Pi settings first.');
  const selected=ctx.snapshot.packages.find(p=>p.id===request.id);
  if(request.action==='install') {
    if(typeof request.source!=='string'||!request.source.trim()||request.source.length>4096||/[\x00-\x1f]/.test(request.source))throw Error('Enter a valid Pi package source.');
    // Local paths entered by users are relative to their selected working directory.
    const parsed=ctx.manager.parseSource(request.source.trim());
    const source=parsed.type==='local'?resolve(ctx.cwd,parsed.path.replace(/^~(?=\/|$)/,home)):request.source.trim();
    await ctx.manager.installAndPersist(source,{local:!!project});
    const installed=ctx.manager.getInstalledPath(source,project?'project':'user');
    if(!installed)throw Error('Pi did not produce an installed package.');
  } else if(request.action==='remove') {
    if(!selected?.canRemove)throw Error('This package is not installed in the selected scope.');
    await ctx.manager.removeAndPersist(selected.kind==='local'?(selected.path??selected.id.slice('local:'.length)):selected.source,{local:!!project});
    if(ctx.manager.listConfiguredPackages().some(p=>p.scope===(project?'project':'user')&&ctx.manager.getPackageIdentity(p.source,p.scope)===selected.id))throw Error('Pi retained the package declaration.');
    if(selected.kind==='git'&&ctx.manager.getInstalledPath(selected.source,project?'project':'user'))throw Error('Pi retained the package installation.');
  } else if(request.action==='builtins') {
    if(!Array.isArray(request.choices)||!request.choices.length||request.choices.length>ctx.snapshot.builtins.length||new Set(request.choices.map(choice=>choice.resourceId)).size!==request.choices.length)throw Error('Choose the built-in extensions to change.');
    for(const choice of request.choices) {
      if(!['inherit','load','unload'].includes(choice.state)||!project&&choice.state==='inherit')throw Error('Invalid built-in extension setting.');
      const item=ctx.all.find(item=>item.metadata.source==='builtin'&&digest(`${item.resourceType}:${item.path}`)===choice.resourceId);
      if(!item)throw Error('The built-in extension is no longer available.');
      if(project)ctx.selector.setProjectResourceOverride(item,choice.state);
      else ctx.selector.toggleTopLevelResource(item,choice.state==='load');
    }
  } else if(request.action==='packages') {
    if(!Array.isArray(request.ids)||!request.ids.length||new Set(request.ids).size!==request.ids.length||!['load','unload','inherit'].includes(request.state)||!project&&request.state==='inherit')throw Error('Choose valid package loading settings.');
    const packages=request.ids.map(id=>ctx.snapshot.packages.find(pkg=>pkg.id===id));
    if(packages.some(pkg=>!pkg?.resources.length))throw Error('The selected package has no available resources.');
    for(const pkg of packages)for(const resource of pkg.resources) {
      const item=ctx.all.find(item=>item.metadata.origin==='package'&&ctx.manager.getPackageIdentity(item.metadata.source,item.metadata.scope)===pkg.id&&digest(`${item.resourceType}:${item.path}`)===resource.id);
      if(!item)throw Error('The resource is no longer in this package.');
      if(project)ctx.selector.setProjectResourceOverride(item,request.state);
      else ctx.selector.togglePackageResource(item,request.state==='load');
    }
  } else if(request.action==='resource') {
    if(!['inherit','load','unload'].includes(request.state))throw Error('Invalid resource loading choice.');
    const item=ctx.all.find(item=>digest(`${item.resourceType}:${item.path}`)===request.resourceId&&(item.metadata.source==='builtin'||selected&&item.metadata.origin==='package'&&ctx.manager.getPackageIdentity(item.metadata.source,item.metadata.scope)===selected.id));
    if(!item)throw Error('The resource is no longer in this package.');
    // Pi's selector converts [] to +/- rules. Preserve the other disabled
    // members explicitly so enabling one resource cannot enable its siblings.
    if(item.metadata.origin==='package') {
      const entries=(project?ctx.settings.getProjectSettings():ctx.settings.getGlobalSettings()).packages??[];
      const entry=entries.find(entry=>typeof entry==='object'&&entry.source===item.metadata.source);
      if(entry?.autoload!==false&&Array.isArray(entry?.[item.resourceType])&&entry[item.resourceType].length===0) {
        for(const sibling of ctx.all.filter(sibling=>sibling.resourceType===item.resourceType&&sibling.metadata.origin==='package'&&sibling.metadata.source===item.metadata.source)) {
          if(project)ctx.selector.setProjectResourceOverride(sibling,'unload');
          else ctx.selector.togglePackageResource(sibling,false);
        }
      }
    }
    if(project)ctx.selector.setProjectResourceOverride(item,request.state);
    else {
      if(request.state==='inherit')throw Error('Global resource selection requires load or unload.');
      if(item.metadata.origin==='package')ctx.selector.togglePackageResource(item,request.state==='load');
      else ctx.selector.toggleTopLevelResource(item,request.state==='load');
    }
  } else throw Error('Unsupported Pi package action.');
  await ctx.settings.flush();
  const errors=ctx.settings.drainErrors();if(errors.length)throw Error('Pi could not prepare package settings.');
  const scope=project?'project':'global';
  const before=json(project?ctx.projectPath:ctx.globalPath),after=JSON.parse(ctx.texts[scope]??'{}');
  const changes={};
  for(const key of ['packages',...types])if(JSON.stringify(before[key])!==JSON.stringify(after[key]))changes[key]=after[key]??null;
  // Verify disk settings again after original filesystem operations, before Rust writes.
  if(read(ctx.globalPath)!==ctx.rawTexts.global || project&&read(ctx.projectPath)!==ctx.rawTexts.project)throw Error('Pi settings changed during the operation. Refresh the package list.');
  return {changes};
}
if(process.argv[1]===fileURLToPath(import.meta.url))try {
 const [home,agent,project,raw]=process.argv.slice(2);
 process.stdout.write(JSON.stringify(await packageOperation(home,agent,project,JSON.parse(raw))));
}catch(error){process.stderr.write(error.message);process.exitCode=1;}
