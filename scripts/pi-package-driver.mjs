// Delegate package lifecycle to the user's qualified, unmodified Pi installation.
// Never load resource extensions, initialize a session, or execute skill documents.
import { existsSync, readFileSync, realpathSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { readProjectTrust, supportsPiPackageVersion } from './inspect-pi-skills.mjs';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readState, sourceInfo, field } from './pi-invocation-state.mjs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const {t:readTar}=createRequire(new URL('./skills/package.json',import.meta.url))('tar');

// Obtain only the installed package, without installing it or resolving dependencies.
export async function npmReference(manager, source) {
  if(!source.version)throw Error('Installed package version is missing.');
  const temporary=mkdtempSync(join(tmpdir(),'skills-space-pi-reference-'));
  try {
    const command=manager.getNpmCommand();
    const output=await manager.runCommandCapture(command.command,[...command.args,'pack',`${source.identity.slice(4)}@${source.version}`,'--ignore-scripts','--json','--pack-destination',temporary],{cwd:temporary,timeoutMs:60000});
    const packed=JSON.parse(output);
    if(!Array.isArray(packed)||packed.length!==1||packed[0].name!==source.identity.slice(4)||packed[0].version!==source.version||!/^[-a-zA-Z0-9_.]+\.tgz$/.test(packed[0].filename))throw Error('Registry package identity does not match the installed version.');
    const archive=join(temporary,packed[0].filename),bytes=readFileSync(archive);
    const integrity=source.integrity??packed[0].integrity;
    const valid=typeof integrity==='string'&&integrity.split(/\s+/).some(token=>{const match=/^(sha512|sha384|sha256|sha1)-([A-Za-z0-9+/=]+)$/.exec(token);return match && createHash(match[1]).update(bytes).digest('base64')===match[2];});
    if(!valid)throw Error('Registry package integrity differs from the installation lock.');
    const files={},fields={};let invalid=false;
    await readTar({file:archive,onReadEntry(entry){
      const path=entry.path.replace(/^package\//,'');
      if(!entry.path.startsWith('package/')||path.split('/').some(part=>part==='..'||part==='node_modules')||path.startsWith('/')){entry.resume();return;}
      if(entry.type==='Directory'){entry.resume();return;}
      if(entry.type!=='File'||Object.hasOwn(files,path)){invalid=true;entry.resume();return;}
      const hash=createHash('sha256'),chunks=[];
      entry.on('data',chunk=>{hash.update(chunk);if(path.endsWith('.md')&&entry.size<=256*1024)chunks.push(chunk);});
      entry.on('end',()=>{files[path]=hash.digest('hex');if(chunks.length)try{fields[path]=field(Buffer.concat(chunks).toString('utf8')).token;}catch{}});
    }});
    if(invalid||!files['package.json'])throw Error('Package reference contains unsupported file entries.');
    return {kind:'npm-reference',identity:source.identity,version:source.version,integrity,files,fields};
  } finally {rmSync(temporary,{recursive:true,force:true});}
}
export async function originalRuntime(agent) {
  const version=readFileSync(join(agent,'install/current-version'),'utf8').trim();
  if(!supportsPiPackageVersion(version))throw Error('Package operations require a qualified managed Pi installation, version 1.3.0 or newer.');
  const installed=realpathSync(join(agent,'install/releases',version,'node_modules/@earendil-works/pi-coding-agent'));
  const metadata=JSON.parse(readFileSync(join(installed,'package.json'),'utf8'));
  if(metadata.version!==version || metadata.name!=='@earendil-works/pi-coding-agent')throw Error('Pi installation identity changed.');
  const {DefaultPackageManager}=await import(pathToFileURL(join(installed,'dist/core/package-manager.js')));
  if(typeof DefaultPackageManager!=='function')throw Error('Package operations require a qualified Pi package manager interface.');
  return {installed,version,DefaultPackageManager};
}
async function originalManager(agent,cwd,home=homedir()) {
  const {installed,DefaultPackageManager}=await originalRuntime(agent);
  const {gt}=createRequire(join(installed,'package.json'))('semver');
  const read=path=>existsSync(path)?JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,'')):{};
  const global=read(join(agent,'settings.json'));
  const trusted=readProjectTrust(home,agent,cwd,global).trusted;
  const project=trusted?read(join(cwd,'.pi/settings.json')):{};
  const manager=new DefaultPackageManager({cwd,agentDir:agent,settingsManager:{getGlobalSettings:()=>global,getProjectSettings:()=>project,isProjectTrusted:()=>trusted,getNpmCommand:()=>global.npmCommand}});
  return {manager,global,project,trusted,gt};
}
export async function prepareNpmReference(agent,cwd,item,state) {
  const installations=state.installations??{},source=sourceInfo(item,installations);
  if(source.kind!=='npm'||source.reliable)return;
  const {manager}=await originalManager(agent,cwd);
  const reference=await npmReference(manager,source);
  state.installations={...installations,[source.root]:reference};
}
export async function packagePlan(agent,cwd,source,{resolveReferences=false,checkVersions=true}={}) {
  const {manager,global,project,gt}=await originalManager(agent,cwd);
  let state;
  try {state=readState(agent);} catch {state={version:1,records:{}};} // Auxiliary history never blocks version discovery or replaces a damaged journal.
  const identity=manager.getPackageIdentity(source),records=state.records,installations=state.installations??{},affected=[],references={};
  for(const [scope,settings] of [['user',global],['project',project]])for(const entry of settings.packages??[]) {
    const value=typeof entry==='string'?entry:entry.source;
    if(manager.getPackageIdentity(value,scope)!==identity)continue;
    const parsed=manager.parseSource(value);
    if(parsed.type==='local')throw Error('Local directories are updated by their original owner.');
    const root=parsed.type==='git'?manager.getGitInstallPath(parsed,scope):manager.getNpmInstallPath(parsed,scope);
    // Package checks inspect identity/version metadata, not the whole package or dependencies.
    const item={file:join(root,'package.json'),packageRoot:root,packageSource:value};
    let observedState={source:sourceInfo(item,installations),local:'unverified'};
    if(parsed.type==='git' && manager.getPackageIdentity('git:'+execFileSync('git',['-C',root,'config','--get','remote.origin.url'],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}).trim())!==manager.getPackageIdentity(value,scope))throw Error('Configured Git package and installed origin differ. Review the source before updating.');
    if(parsed.type==='npm' && observedState.source.identity!==`npm:${parsed.name}`)throw Error('Configured npm package and installed identity differ. Review the source before updating.');
    let latest=null,status='unknown',message='',reason=null;
    if(resolveReferences && parsed.type==='npm' && !observedState.source.reliable && Object.values(records).some(record=>record.source?.root===observedState.source.root && (!checkVersions || record.source.version!==observedState.source.version))) {
      try {
        const reference=await npmReference(manager,observedState.source);
        installations[observedState.source.root]=reference;references[observedState.source.root]=reference;
        observedState={source:sourceInfo(item,installations),local:'unverified'};
      }catch(error){reason='referenceUnavailable';message=error.message;}
    }
    if(!checkVersions){latest=observedState.source.version;status=latest?'current':'unknown';}
    else if(parsed.type==='npm') {
      if(parsed.pinned){status='pinned';latest=observedState.source.version;}
      else {latest=await manager.getLatestNpmVersion(parsed.version?parsed.spec:parsed.name,parsed.range);status=!observedState.source.version?'unknown':gt(latest,observedState.source.version)?'available':'current';}
      // Keep a failed installed-version lookup separate from latest-version status.
    }else {
      if(parsed.ref) {
        const remote=execFileSync('git',['-C',root,'ls-remote','origin',parsed.ref,`${parsed.ref}^{}`],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']});
        const heads=remote.trim().split('\n').filter(Boolean);latest=heads.find(line=>line.endsWith('^{}'))?.split(/\s/)[0]??heads[0]?.split(/\s/)[0];
        if(!latest && /^[a-f0-9]{40}$/.test(parsed.ref))latest=parsed.ref;
        if(!latest)throw Error('Configured Git ref could not be resolved.');
      }else latest=(await manager.getRemoteGitHead(root)).trim();
      status=latest===observedState.source.version?'current':'available';
    }
    const incomplete=parsed.type==='git'&&existsSync(manager.getGitUpdateMarkerPath(root));
    if(incomplete){status='available';reason='incompleteUpdate';message='The previous package update did not finish.';}
    // Original Pi skips pinned npm entries while updating other matching scopes.
    const updateable=['available','current','pinned'].includes(status);
    affected.push({scope,source:value,root,status,latest,installed:observedState.source.version,localState:observedState.local,updateable,message,reason});
  }
  if(!affected.length)throw Error('Package is no longer configured.');
  return {manager,affected,state,references};
}
if(process.argv[1]===fileURLToPath(import.meta.url))try {
  const [action,agent,cwd,source,expected]=process.argv.slice(2);
  if(action==='reference') {
    const state=readState(agent);await prepareNpmReference(agent,cwd,JSON.parse(source),state);process.stdout.write(JSON.stringify({installations:state.installations??{}}));
  } else if(action==='paths') {
    const {manager,global,project}=await originalManager(agent,cwd,source);
    const paths={};
    for(const [scope,settings] of [['global',global],['project',project]])for(const [index,entry] of (settings.packages??[]).entries()) {
      const value=typeof entry==='string'?entry:entry?.source;
      if(typeof value!=='string')continue;
      try { paths[`${scope}:${index}`]={path:manager.getInstalledPath(value,scope==='global'?'user':'project')}; } catch { /* Existing scanner reports missing/unsupported sources. */ }
    }
    process.stdout.write(JSON.stringify(paths));
  } else {
  const {manager,affected,references}=await packagePlan(agent,cwd,source,{resolveReferences:action==='check'});
  if(action==='update') {
    const signature=items=>items.map(({scope,source,root,installed,latest})=>({scope,source,root,installed,latest}));
    if(!isDeepStrictEqual(signature(affected),signature(JSON.parse(expected))))throw Error('Package versions or scopes changed. Check and review again.');
    if(affected.some(item=>!item.updateable))throw Error('Package version is pinned or unavailable.');
    await manager.update(source);
    // Verification is returned independently from config recovery, which Rust performs afterward.
    const afterPlan=await packagePlan(agent,cwd,source,{resolveReferences:true,checkVersions:false}),after=afterPlan.affected;
    if(after.some(item=>item.status!=='current' || item.installed!==affected.find(before=>before.scope===item.scope && before.root===item.root)?.latest))throw Error('Pi finished, but the selected source version could not be verified. Refresh before retrying.');
    process.stdout.write(JSON.stringify({affected:after,installations:afterPlan.references}));
  }else if(action==='check')process.stdout.write(JSON.stringify({affected,installations:references}));
  else throw Error('Unsupported package operation.');
  }
}catch(error){process.stderr.write(error.message);process.exitCode=1;}
