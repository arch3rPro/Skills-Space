import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync,existsSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {plan,observe,readState,field,npmInstallation,sourceInfo} from '../src-tauri/resources/upstream/pi-invocation-state.mjs';
const exec=promisify(execFile),require=createRequire(new URL('../src-tauri/resources/upstream/skills/package.json',import.meta.url)),tar=require('tar');
const original=process.env.SKILLS_SPACE_PI_TEST_INSTALL;
import {npmReference} from '../src-tauri/resources/upstream/pi-package-driver.mjs';
test('npm checks retrieve only a missing installed-version reference; updates remain available and restore invocation fields',{skip:!original},async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ss-npm-upgrade-'))),home=join(root,'home'),agent=join(home,'.pi/agent');mkdirSync(agent,{recursive:true});
 const packages=new Map();let current='1.0.0',server,archiveRequests=0;
 const dependencyNames=['fixture-pi-support',...Array.from({length:100},(_,index)=>`fixture-pi-dependency-${index}`)];
 const dependencies=Object.fromEntries(dependencyNames.map(name=>[name,'1.0.0']));
 try {
  for(const [name,versions] of [['fixture-pi-skill',['1.0.0','2.0.0']],...dependencyNames.map(name=>[name,['1.0.0']])])for(const version of versions){
   const folder=join(root,`${name}-${version}/package`);mkdirSync(join(folder,'skills/demo'),{recursive:true});
   writeFileSync(join(folder,'package.json'),JSON.stringify({name,version,...(name==='fixture-pi-skill'?{dependencies,pi:{skills:['skills']}}:{})}));
   writeFileSync(join(folder,'support.txt'),`Support ${version}`);
   if(name==='fixture-pi-support')writeFileSync(join(folder,'native.bin'),Buffer.alloc(33*1024*1024));
   if(name==='fixture-pi-skill')writeFileSync(join(folder,'skills/demo/SKILL.md'),`---\nname: demo\ndescription: npm fixture\n${version==='1.0.0'?'disable-model-invocation: true\n':''}---\nVersion ${version}\n`);
   const archive=join(root,`${name}-${version}.tgz`);await tar.c({gzip:true,file:archive,cwd:dirname(folder)},['package']);const bytes=readFileSync(archive);
   packages.set(`${name}@${version}`,{name,version,bytes,integrity:'sha512-'+createHash('sha512').update(bytes).digest('base64'),shasum:createHash('sha1').update(bytes).digest('hex')});
  }
  server=createServer((request,response)=>{
   const path=decodeURIComponent(request.url.split('?')[0]).slice(1);
   const archive=[...packages.values()].find(p=>path===`${p.name}/-/${p.name}-${p.version}.tgz`);
   if(archive){archiveRequests++;response.writeHead(200,{'content-type':'application/octet-stream'});response.end(archive.bytes);return;}
   const entries=[...packages.values()].filter(p=>p.name===path);if(!entries.length){response.writeHead(404);response.end('{}');return;}
   const versions=Object.fromEntries(entries.map(p=>[p.version,{name:p.name,version:p.version,...(p.name==='fixture-pi-skill'?{dependencies}:{}),dist:{tarball:`http://127.0.0.1:${server.address().port}/${p.name}/-/${p.name}-${p.version}.tgz`,integrity:p.integrity,shasum:p.shasum}}]));
   response.setHeader('content-type','application/json');response.end(JSON.stringify({name:path,'dist-tags':{latest:path==='fixture-pi-skill'?current:'1.0.0'},versions}));
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const env={...process.env,HOME:home,USERPROFILE:home,PI_CODING_AGENT_DIR:agent,npm_config_registry:`http://127.0.0.1:${server.address().port}`,npm_config_cache:join(home,'.npm'),npm_config_update_notifier:'false',DISABLE_TELEMETRY:'1'};
  await exec('npm',['install','--prefix',join(agent,'npm'),'fixture-pi-skill@1.0.0','--ignore-scripts','--no-audit','--no-fund'],{env,timeout:60000});
  const piVersion=JSON.parse(readFileSync(join(original,'package.json'),'utf8')).version;const release=join(agent,`install/releases/${piVersion}/node_modules/@earendil-works`);mkdirSync(release,{recursive:true});symlinkSync(original,join(release,'pi-coding-agent'));writeFileSync(join(agent,'install/current-version'),piVersion);writeFileSync(join(agent,'settings.json'),JSON.stringify({packages:['npm:fixture-pi-skill']}));
  const packageRoot=join(agent,'npm/node_modules/fixture-pi-skill'),file=join(packageRoot,'skills/demo/SKILL.md'),item={file,name:'demo',packageRoot,packageSource:'npm:fixture-pi-skill'};
  const driver=async(action,expected)=>{
   const result=await exec(process.execPath,['src-tauri/resources/upstream/pi-package-driver.mjs',action,agent,home,'npm:fixture-pi-skill',...(expected?[JSON.stringify(expected)]:[])],{env,timeout:90000,maxBuffer:4*1024*1024});
   return JSON.parse(result.stdout.trim().split('\n').at(-1));
  };
  const lock=JSON.parse(readFileSync(join(agent,'npm/node_modules/.package-lock.json'),'utf8'));
  const paths=Object.keys(lock.packages).filter(path=>path.startsWith('node_modules/'));
  assert.equal(paths.length,102);assert(paths.indexOf('node_modules/fixture-pi-support')>=100);
  let requests=archiveRequests;
  current='2.0.0';const unverified=await driver('check');assert.equal(unverified.affected[0].status,'available');assert.equal(unverified.affected[0].updateable,true);assert.equal(archiveRequests,requests);assert.equal(unverified.affected[0].localState,'unverified');
  const manager={getNpmCommand:()=>({command:'npm',args:[]}),runCommandCapture:async(command,args,options)=>(await exec(command,args,{...options,env,timeout:60000})).stdout};
  const reference=await npmReference(manager,sourceInfo(item));requests=archiveRequests;assert.equal(reference.version,'1.0.0');assert.equal(reference.files['support.txt'],createHash('sha256').update('Support 1.0.0').digest('hex'));assert(!Object.keys(reference.files).some(path=>path.includes('node_modules')));
  writeFileSync(join(packageRoot,'support.txt'),'User edit before first app record');
  writeFileSync(join(agent,'skills-space-invocation.json'),JSON.stringify({version:1,records:{},installations:{[packageRoot]:reference}}));
  assert.equal(observe(item,{},null,{[packageRoot]:reference}).local,'modified');
  const cached=await driver('check');assert.equal(cached.affected[0].localState,'unverified');assert.equal(cached.affected[0].updateable,true);assert.equal(archiveRequests,requests);
  writeFileSync(join(packageRoot,'support.txt'),'Support 1.0.0');rmSync(join(agent,'skills-space-invocation.json'));
  assert(!existsSync(join(agent,'skills-space-invocation.json')));assert(!existsSync(join(agent,'skills-space-source-cache')));
  // The fixture observed the fresh, successful original npm installation above.
  // Merely checking a pre-existing installation never calls this baseline recorder.
  const state={version:1,records:{},installations:{[join(agent,'npm')]:npmInstallation(join(agent,'npm'))}};
  writeFileSync(join(agent,'skills-space-invocation.json'),JSON.stringify(state));
  let configured=plan(item,state,'auto');writeFileSync(file,configured.after);state.records[file]={...configured.record,phase:'committed'};writeFileSync(join(agent,'skills-space-invocation.json'),JSON.stringify(state));
  assert.equal(observe(item,state.records,null,state.installations).local,'policyOnly');assert.equal(field(readFileSync(file,'utf8')).token,'false');
  const beforeCheck=readFileSync(join(agent,'skills-space-invocation.json'),'utf8'),documentBeforeCheck=readFileSync(file,'utf8');
  const checked=await driver('check');assert.equal(checked.affected[0].status,'available');assert.equal(checked.affected[0].updateable,true,JSON.stringify(checked));assert.equal(archiveRequests,requests);assert.equal(readFileSync(join(agent,'skills-space-invocation.json'),'utf8'),beforeCheck);assert.equal(readFileSync(file,'utf8'),documentBeforeCheck);
  const lockPath=join(agent,'npm/package-lock.json'),lockBefore=readFileSync(lockPath,'utf8');writeFileSync(lockPath,lockBefore+'\n');const changedLock=await driver('check');assert.equal(changedLock.affected[0].status,'available');assert.equal(changedLock.affected[0].updateable,true);assert.equal(archiveRequests,requests);writeFileSync(lockPath,lockBefore);
  const support=join(agent,'npm/node_modules/fixture-pi-support/support.txt');writeFileSync(support,'Local dependency edit');const blocked=await driver('check');assert.equal(archiveRequests,requests);assert.equal(blocked.affected[0].updateable,true);assert.equal(readFileSync(support,'utf8'),'Local dependency edit');assert.equal(JSON.parse(readFileSync(join(packageRoot,'package.json'),'utf8')).version,'1.0.0');
  writeFileSync(support,'Support 1.0.0');
  // Missing history and unrelated local changes do not block explicit updates.
  state.installations={};writeFileSync(join(agent,'skills-space-invocation.json'),JSON.stringify(state));
  const legacy=await driver('check');assert.equal(legacy.affected[0].updateable,true);assert.equal(legacy.affected[0].localState,'unverified');assert.equal(archiveRequests,requests);
  writeFileSync(support,'Changed after review');assert.equal((await driver('check')).affected[0].updateable,true);assert.equal(readFileSync(support,'utf8'),'Changed after review');
  writeFileSync(support,'Support 1.0.0');const updated=await driver('update',legacy.affected);Object.assign(state.installations,updated.installations);writeFileSync(join(agent,'skills-space-invocation.json'),JSON.stringify(state));
  assert(!existsSync(join(agent,'skills-space-update-backups')));assert(!existsSync(join(agent,'skills-space-source-cache')));
  const external=observe(item,state.records,null,state.installations);assert.equal(external.recovery,'pendingRestore');assert.equal(external.source.version,'2.0.0');
  const recovery=plan(item,state,'auto',{recover:true});assert.equal(recovery.record.sourceDefault,null);assert.match(recovery.after,/Version 2.0.0/);writeFileSync(file,recovery.after);state.records[file]={...recovery.record,phase:'committed'};
  const defaults=plan(item,state,'default');assert.equal(field(defaults.after).token,null);assert.match(defaults.after,/Version 2.0.0/);
  // An external owner install has no recorded app baseline for its new version.
  await exec('npm',['install','--prefix',join(agent,'npm'),'fixture-pi-skill@1.0.0','--ignore-scripts','--no-audit','--no-fund'],{env,timeout:60000});
  writeFileSync(file,readFileSync(file,'utf8').replace('Version 1.0.0','External local edit'));
  const externalBytes=readFileSync(file,'utf8'),pending=observe(item,state.records,null,state.installations);
  assert.equal(pending.local,'unverified');assert.equal(pending.recovery,'conflict');
  assert.throws(()=>plan(item,state,'auto',{recover:true}),/blocked/);assert.throws(()=>plan(item,state,'default'),/unverified/);assert.equal(readFileSync(file,'utf8'),externalBytes);
  writeFileSync(join(agent,'skills-space-invocation.json'),JSON.stringify(state));
  const archivesBeforeRecoveryCheck=archiveRequests;
  const referenceCheck=await driver('check');
  assert.equal(referenceCheck.installations[packageRoot].version,'1.0.0');
  assert.equal(archiveRequests,archivesBeforeRecoveryCheck+1);
  assert.equal(readFileSync(file,'utf8'),externalBytes);
  Object.assign(state.installations,referenceCheck.installations);
  writeFileSync(join(agent,'skills-space-invocation.json'),JSON.stringify(state));
  const cachedRecoveryCheck=await driver('check');
  assert.deepEqual(cachedRecoveryCheck.installations,{});
  assert.equal(archiveRequests,archivesBeforeRecoveryCheck+1);
  // Damaged auxiliary history must not block version checks or get overwritten.
  const savedHistory=readFileSync(join(agent,'skills-space-invocation.json'),'utf8');
  writeFileSync(join(agent,'skills-space-invocation.json'),'{broken');
  assert.equal((await driver('check')).affected[0].updateable,true);
  assert.equal(readFileSync(join(agent,'skills-space-invocation.json'),'utf8'),'{broken');
  writeFileSync(join(agent,'skills-space-invocation.json'),savedHistory);
  const child=await exec(process.execPath,['src-tauri/resources/upstream/pi-invocation-state.mjs','recover',agent,JSON.stringify(item),''],{env,timeout:90000,maxBuffer:4*1024*1024});const recovered=JSON.parse(child.stdout);assert.match(recovered.result.after,/External local edit/);state.installations=recovered.state.installations;
  const restored=plan(item,state,'auto',{recover:true});assert.match(restored.after,/External local edit/);assert.equal(field(restored.after).token,'false');assert.equal(readFileSync(file,'utf8'),externalBytes);
  // The new package inventory must also manage a package with no skills through
  // the original installer/remover, including a retained transitive dependency.
  const management=async(request)=>{
   const output=await exec(process.execPath,['src-tauri/resources/upstream/pi-packages.mjs',home,agent,'',JSON.stringify(request)],{env,timeout:90000,maxBuffer:4*1024*1024});
   return JSON.parse(output.stdout.trim().split('\n').at(-1));
  };
  let inventory=(await management({action:'list'})).snapshot;
  const added=await management({action:'install',source:'npm:fixture-pi-support',revision:inventory.revision});
  const settingsPath=join(agent,'settings.json'),settings=JSON.parse(readFileSync(settingsPath));Object.assign(settings,added.changes);writeFileSync(settingsPath,JSON.stringify(settings));
  inventory=(await management({action:'list'})).snapshot;
  const supportPackage=inventory.packages.find(pkg=>pkg.source==='npm:fixture-pi-support');assert(supportPackage);assert.equal(supportPackage.resources.length,0);
  const removed=await management({action:'remove',id:supportPackage.id,revision:inventory.revision});Object.assign(settings,removed.changes);writeFileSync(settingsPath,JSON.stringify(settings));
  inventory=(await management({action:'list'})).snapshot;assert(!inventory.packages.some(pkg=>pkg.id===supportPackage.id));assert(inventory.packages.some(pkg=>pkg.source==='npm:fixture-pi-skill'));
 } finally {if(server)await new Promise(resolve=>server.close(resolve));rmSync(root,{recursive:true,force:true});}
});
