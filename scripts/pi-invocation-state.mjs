// Read-only planning. Rust validates revisions and commits journal/document writes.
import { readFileSync, readdirSync, statSync, lstatSync, realpathSync, existsSync, openSync, readSync, closeSync, readlinkSync } from 'node:fs';
import { dirname, basename, join, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseDocument, isMap, isScalar } from './skills/node_modules/yaml/dist/index.js';
export const stateName = 'skills-space-invocation.json';
const realpathIfPresent=path=>existsSync(path)?realpathSync(path):resolve(path);
export const digest = value => createHash('sha256').update(value).digest('hex');
const key = 'disable-model-invocation';
export function field(text) {
  const match = /^(\uFEFF?---(?:\r\n|\r|\n))([\s\S]*?)((?:\r\n|\r|\n)---(?:(?:\r\n|\r|\n)|$))/.exec(text);
  if (!match || Buffer.byteLength(text)>256*1024) throw Error('Skill requires bounded YAML frontmatter.');
  const doc = parseDocument(match[2].replace(/\r(?!\n)/g,'\n'));
  if (doc.errors.length || !isMap(doc.contents)) throw Error('Unsupported skill frontmatter.');
  const pair = doc.contents.items.find(pair=>pair.key?.value===key);
  if (pair && (!isScalar(pair.value) || pair.value.anchor || pair.value.tag || !pair.value.range || !pair.key.range)) throw Error('Invocation field must be a scalar.');
  return {match,pair,token:pair ? match[2].slice(pair.value.range[0],pair.value.range[1]) : null};
}
function fieldLine(text) {
  const {match,pair}=field(text);if(!pair)return null;
  const start=Math.max(match[2].lastIndexOf('\n',pair.key.range[0]-1),match[2].lastIndexOf('\r',pair.key.range[0]-1))+1,end=match[2].slice(pair.value.range[1]).search(/[\r\n]/)+pair.value.range[1];
  return match[2].slice(start,end<pair.value.range[1]?match[2].length:end);
}
export function patch(text, token) {
  const {match,pair}=field(text); let yaml=match[2];
  const newline=match[1].match(/\r\n|\r|\n/)[0];
  if (pair) {
    if (token !== null) yaml=yaml.slice(0,pair.value.range[0])+token+yaml.slice(pair.value.range[1]);
    else {
      const start=Math.max(yaml.lastIndexOf('\n',pair.key.range[0]-1),yaml.lastIndexOf('\r',pair.key.range[0]-1))+1;
      const rest=yaml.slice(pair.value.range[1]),lineBreak=/\r\n|\r|\n/.exec(rest);
      const end=lineBreak ? pair.value.range[1]+lineBreak.index : -1;
      if (yaml.slice(start,pair.key.range[0]).trim() || /\S/.test(yaml.slice(pair.value.range[1],end<0?yaml.length:end).replace(/\s*#.*$/, ''))) throw Error('Cannot remove a complex invocation field.');
      yaml=yaml.slice(0,start)+yaml.slice(end<0?yaml.length:end+lineBreak[0].length);
      if (newline==='\r\n' && yaml.endsWith('\r')) yaml=yaml.slice(0,-1);
      // The closing delimiter supplies its own leading newline.
      if (yaml.endsWith(newline)) yaml=yaml.slice(0,-newline.length);
    }
  } else if (token!==null) yaml+=`${newline}${key}: ${token}`;
  const after=match[1]+yaml+match[3]+text.slice(match[0].length);
  field(after); return after;
}
export function readState(agent) {
  const path=join(agent,stateName);
  if (!existsSync(path)) return {version:1,records:{}};
  if (statSync(path).size>16*1024*1024) throw Error('Invocation recovery journal exceeds its limit.');
  const data=JSON.parse(readFileSync(path,'utf8'));
  if (data.version!==1 || !data.records || Array.isArray(data.records) || typeof data.records!=='object') throw Error('Invalid invocation recovery journal.');
  // Early development journals used raw Git origin strings. Keep only opaque
  // identities in subsequent writes, so authenticated remotes are never copied.
  for(const record of Object.values(data.records))if(record?.source?.kind==='git' && typeof record.source.identity==='string' && !/^git:[a-f0-9]{64}$/.test(record.source.identity))record.source.identity='git:'+digest(record.source.identity.replace(/^git:/,''));
  return data;
}
function git(root,args) { return execFileSync('git',['--no-optional-locks','-C',root,...args],{encoding:'utf8',timeout:10000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0'}}).trimEnd(); }
function fileDigest(path) {
  const hash=createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024),fd=openSync(path,'r');
  try {let bytes;while((bytes=readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,bytes));return hash.digest('hex');}finally{closeSync(fd);}
}
export function npmMetadata(root) {
  return digest(JSON.stringify(['package.json','package-lock.json','node_modules/.package-lock.json'].map(path=>existsSync(join(root,path))?readFileSync(join(root,path),'utf8'):null)));
}
// Installation evidence only: the caller must have observed a successful original
// install/update. Reading an arbitrary existing tree must never establish trust.
export function npmInstallation(root,records={},installations={}) {
  const metadata=npmMetadata(root),files={},modes={},links={},fields={},overrides={};
  for(const [file,record] of Object.entries(records)) {
    if(!file.startsWith(root+sep)||!existsSync(file)||record.phase!=='committed')continue;
    const source=sourceInfo({file,packageRoot:record.source.root,packageSource:record.source.identity},installations);
    if(source.identity===record.source.identity && sameRevision(source,record.source))overrides[file]=normalize(readFileSync(file,'utf8'),record,source,file,installations);
  }
  function visit(path) {
    const info=lstatSync(path),name=relative(root,path).split(sep).join('/');
    if(info.isSymbolicLink()) {
      const target=readlinkSync(path),resolved=resolve(dirname(path),target);
      if(!resolved.startsWith(root+sep))throw Error('Installed dependency link escapes its npm scope.');
      links[name]=target;
    } else if(info.isDirectory()) {
      for(const child of readdirSync(path).sort())visit(join(path,child));
    } else if(info.isFile()) {
      files[name]=overrides[path]===undefined?fileDigest(path):digest(overrides[path]);modes[name]=info.mode&0o777;
      if(name.endsWith('.md')&&info.size<=256*1024)try{fields[name]=field(overrides[path]??readFileSync(path,'utf8')).token;}catch{/* Non-skill Markdown has no source invocation default. */}
      const after=lstatSync(path);if(info.size!==after.size||info.mtimeMs!==after.mtimeMs)throw Error('Installed file changed during inspection.');
    } else throw Error('Unsupported installed dependency entry.');
  }
  visit(root);if(metadata!==npmMetadata(root))throw Error('npm lock changed during inspection.');
  return {metadata,files,modes,links,fields};
}
export function tree(root, override={}) {
  const map={}; let count=0;
  function visit(path,depth=0) {
    const info=lstatSync(path);
    if (++count>20000 || depth>32 || info.isSymbolicLink()) throw Error('Cannot verify linked or oversized source trees.');
    if(info.isDirectory()) {for(const name of readdirSync(path).sort()) {if(name==='.git'||name==='node_modules')continue;visit(join(path,name),depth+1);}}
    else if(info.isFile()) {map[relative(root,path).split(sep).join('/')||basename(path)]=override[path]===undefined?fileDigest(path):digest(override[path]);}
    else throw Error('Unsupported source file.');
  }
  visit(root); return Object.fromEntries(Object.entries(map).sort(([a],[b])=>a<b?-1:a>b?1:0));
}
export function sourceInfo(item,installations={}) {
  const candidate=item.packageRoot ?? (basename(item.file)==='SKILL.md'?dirname(item.file):item.file);
  const root=existsSync(candidate)?realpathSync(candidate):candidate;
  if(item.packageSource?.startsWith('npm:')) {
    try {
      const manifest=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
      const nodeModulesIndex=root.lastIndexOf(`${sep}node_modules${sep}`);
      const installRoot=nodeModulesIndex>=0?root.slice(0,nodeModulesIndex):dirname(root);
      const lockPath=join(installRoot,'node_modules/.package-lock.json');
      let lock=null;if(existsSync(lockPath))lock=JSON.parse(readFileSync(lockPath,'utf8'));
      const entry=lock?.packages?.[relative(installRoot,root).split(sep).join('/')];
      const identity=`npm:${manifest.name}`,integrity=entry?.version===manifest.version?entry.integrity??null:null;
      const reference=installations[root];
      const reliable=!!integrity && installations[installRoot]?.metadata===npmMetadata(installRoot) || reference?.kind==='npm-reference' && reference.identity===identity && reference.version===manifest.version && (!integrity || reference.integrity===integrity);
      return {kind:'npm',root,installRoot,identity,version:typeof manifest.version==='string'?manifest.version:null,reliable,integrity};
    }catch{return {kind:'npm',root,identity:item.packageSource,version:null,reliable:false};}
  }
  try {
    const cwd=statSync(root).isDirectory()?root:dirname(root);
    const gitRoot=realpathSync(git(cwd,['rev-parse','--show-toplevel']));
    // A user's enclosing project is not an owned package; it remains read-only.
    if (!item.packageSource || realpathSync(root)!==gitRoot) throw Error();
    const origin=git(gitRoot,['config','--get','remote.origin.url']);
    return {kind:'git',root:gitRoot,identity:`git:${digest(origin)}`,version:git(gitRoot,['rev-parse','HEAD']),reliable:true};
  }catch{return {kind:'local',root,identity:`file:${root}`,version:null,reliable:false};}
}
function sourceToken(file,source,fallback,installations={}) {
  if(source.kind==='git') {
    const path=relative(source.root,file).split(sep).join('/');
    // A newly created local skill has no source blob yet. Its original local
    // field is still a valid default; its content state is independent from explicit update eligibility.
    if(!git(source.root,['ls-tree','--name-only','HEAD','--',path]))return fallback;
    const original=execFileSync('git',['-C',source.root,'show',`HEAD:${relative(source.root,file).split(sep).join('/')}`],{encoding:'utf8',timeout:10000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});
    return field(original).token;
  }
  if(source.kind==='npm' && source.reliable) {
    const reference=installations[source.root],baseline=reference?.kind==='npm-reference'&&reference.version===source.version&&(!source.integrity||reference.integrity===source.integrity)?reference:installations[source.installRoot],path=relative(baseline===reference?source.root:source.installRoot,file).split(sep).join('/');
    if(!Object.hasOwn(baseline.fields,path))throw Error('Source field default could not be verified.');
    return baseline.fields[path];
  }
  return fallback;
}
function normalize(text,record,source,file,installations={}) {
  if (!record || field(text).token!==record.applied || fieldLine(text)!==record.appliedLine) return text;
  return patch(text,sourceToken(file,source,record.sourceDefault,installations));
}
export function localState(item,records,installations={}) {
  const source=sourceInfo(item,installations), overrides={};
  for(const [file,record] of Object.entries(records)) {
    if (file!==source.root && !file.startsWith(source.root+sep))continue;
    if (existsSync(file)) overrides[file]=normalize(readFileSync(file,'utf8'),record,source,file,installations);
  }
  if(source.kind==='git') {
    try {
      // A clean worktree may still contain unpublished local commits. Use
      // cached origin/tag refs only; inspection must not fetch into user repos.
      const candidates=[];
      try {
        const value=(item.packageSource??'').replace(/^git:/,'').replace(/^git@([^:]+):/,'https://$1/');
        const url=new URL(/^[a-z]+:\/\//i.test(value)?value:`https://${value}`);
        const at=url.pathname.indexOf('@'),ref=at>=0?url.pathname.slice(at+1):url.hash.slice(1);
        if(ref){
          if(/^[a-f0-9]{40}$/.test(ref))candidates.push(ref);
          else if(ref.startsWith('refs/tags/'))candidates.push(ref);
          else {const branch=ref.replace(/^refs\/heads\//,'');candidates.push(`refs/remotes/origin/${branch}`,`refs/tags/${ref}`);}
        }
      }catch{/* Unknown source refs remain unverified if no cached origin anchor exists. */}
      try {const upstream=git(source.root,['rev-parse','--symbolic-full-name','@{upstream}']);if(upstream.startsWith('refs/remotes/origin/'))candidates.push(upstream);}catch{}
      candidates.push('refs/remotes/origin/HEAD');
      let anchor=null;for(const ref of candidates)try{anchor=git(source.root,['rev-parse','--verify',`${ref}^{commit}`]);break;}catch{}
      if(!anchor)return {source,local:'unverified'};
      const ahead=Number(git(source.root,['rev-list','--count',`${anchor}..HEAD`]));
      if(!Number.isSafeInteger(ahead))return {source,local:'unverified'};
      if(ahead>0)return {source,local:'modified'};
      const indexFlags=git(source.root,['ls-files','-v','-z']).split('\0').filter(Boolean);
      if(indexFlags.some(entry=>/^[a-zS] /.test(entry)))return {source,local:'unverified'};
      // Inspect every tracked and untracked package file, not only SKILL.md.
      let policyDelta=false;
      const changed=git(source.root,['status','--porcelain=v1','--untracked-files=all','--ignored=no','-z']);
      if(changed) {
        const paths=changed.split('\0').filter(Boolean);
        for(const entry of paths) {
          if(!/^[ MARCUD?!]{2} /.test(entry)) return {source,local:'modified'};
          const rel=entry.slice(3),file=join(source.root,rel);
          if(!overrides[file] || entry.slice(0,2)!==' M')return {source,local:'modified'};
          const mode=git(source.root,['ls-files','--stage','--',rel]).split(' ')[0];
          if((mode==='100755')!==!!(statSync(file).mode&0o100))return {source,local:'modified'};
          const original=execFileSync('git',['-C',source.root,'show',`HEAD:${rel}`],{encoding:'utf8',timeout:10000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});
          if(readFileSync(file,'utf8')!==original) {if(overrides[file]!==original)return {source,local:'modified'};policyDelta=true;}
        }
      }
      tree(source.root); // Reject symlinks and excessive trees even if git calls them clean.
      return {source,local:policyDelta?'policyOnly':'clean'};
    }catch{return {source,local:'unverified'};}
  }
  if(source.kind==='npm' && source.reliable) {
    try {
      const reference=installations[source.root],baseline=reference?.kind==='npm-reference'&&reference.version===source.version&&(!source.integrity||reference.integrity===source.integrity)?reference:installations[source.installRoot],prefix=baseline===reference?'':relative(source.installRoot,source.root).split(sep).join('/')+'/';
      const files=Object.fromEntries(Object.entries(baseline.files).filter(([path])=>path.startsWith(prefix)&&!path.slice(prefix.length).split('/').includes('node_modules')).map(([path,hash])=>[path.slice(prefix.length),hash]).sort(([a],[b])=>a<b?-1:a>b?1:0));
      const raw=tree(source.root),normalized=tree(source.root,overrides),expected=JSON.stringify(files);
      return {source,local:JSON.stringify(raw)===expected?'clean':JSON.stringify(normalized)===expected?'policyOnly':'modified'};
    }catch{return {source,local:'unverified'};}
  }
  if(source.kind==='npm')return {source,local:'unverified'};
  try {
    const record=records[item.file];
    if(!record?.baseline || record.source.identity!==source.identity || record.source.version!==source.version)return {source,local:'unverified'};
    return {source,local:JSON.stringify(tree(source.root,overrides))===JSON.stringify(record.baseline)?'clean':'modified'};
  }catch{return {source,local:'unverified'};}
}
const sameRevision=(a,b)=>a.version===b.version && (a.integrity??null)===(b.integrity??null);
export function observe(item,records,memo=null,installations={}) {
  const record=records[item.file],cacheKey=item.packageRoot??item.file;
  const observed=memo?.get(cacheKey)??localState(item,records,installations);
  if(observed.source.kind!=='local')memo?.set(cacheKey,observed);
  const token=field(readFileSync(item.file,'utf8')).token;
  let recovery='consistent';
  if(record) {
    if(record.phase==='prepared')recovery=token===record.applied || token===record.sourceDefault?'pendingRestore':'conflict';
    else if(record.source.identity!==observed.source.identity)recovery='conflict';
    else if(!sameRevision(record.source,observed.source)) {
      const sourceDefault=observed.source.reliable?sourceToken(item.file,observed.source,null,installations):null;
      recovery=token===record.applied || observed.source.reliable && token===sourceDefault?'pendingRestore':'conflict';
    }
    else if(token!==record.applied || fieldLine(readFileSync(item.file,'utf8'))!==record.appliedLine)recovery='conflict';
  }
  return {...observed,fieldToken:token,recovery,configured:!!record,mode:record?.mode??'default'};
}
export function plan(item,state,mode,{recover=false,memo=null}={}) {
  const before=readFileSync(item.file,'utf8'), prior=state.records[item.file], observed=observe(item,state.records,memo,state.installations??{});
  if(recover && observed.recovery==='consistent')return null;
  if(recover && (!prior || (observed.recovery==='conflict')))throw Error('Recovery blocked: source identity or local content changed. Review local edits.');
  const changedVersion=prior && !sameRevision(prior.source,observed.source);
  const sourceDefault=(!prior || changedVersion || !prior.source.reliable&&observed.source.reliable)?sourceToken(item.file,observed.source,field(before).token,state.installations??{}):prior.sourceDefault;
  if(!['default','manual','auto'].includes(mode))throw Error('Invalid invocation mode.');
  const sourceDefaultKnown=observed.source.reliable || (prior ? prior.sourceDefaultKnown!==false : state.historyReset!==true);
  if(mode==='default' && !sourceDefaultKnown)throw Error('Source default is unverified after invocation history was lost.');
  if(mode==='default' && changedVersion && observed.source.kind==='npm' && !observed.source.reliable)throw Error('Source default is unverified after an external npm update.');
  const desired=mode==='default'?sourceDefault:mode==='manual'?'true':'false';
  const after=patch(before,desired);
  const overrides={};
  for(const [file,record] of Object.entries(state.records))if((file===observed.source.root || file.startsWith(observed.source.root+sep)) && existsSync(file))overrides[file]=normalize(readFileSync(file,'utf8'),record,observed.source,file,state.installations??{});
  overrides[item.file]=patch(before,sourceDefault);
  let baseline=prior?.baseline??null;
  if(observed.source.kind==='local' && (changedVersion||!prior))try{baseline=tree(observed.source.root,overrides);}catch{/* Unverified update content does not block a bounded, explicit field edit. */}

  const record={...prior,name:item.name,scope:item.scope,settingsPath:item.settingsPath?realpathIfPresent(item.settingsPath):null,source:observed.source,sourceDefault,sourceDefaultKnown,mode,applied:desired,appliedLine:fieldLine(after),baseline,beforeHash:digest(before),afterHash:digest(after),phase:'prepared'};
  return {before,after,record};
}
if (process.argv[1]===fileURLToPath(import.meta.url)) {
  try {
    const [action,agent,itemJson,mode]=process.argv.slice(2),item=JSON.parse(itemJson),state=readState(agent);
    // Only source-default restoration needs an original npm document; ordinary
    // version checks and explicit auto/manual switches never download a package.
    if((action==='recover'||action==='plan'&&mode==='default') && state.records[item.file]) {
      const source=sourceInfo(item,state.installations??{});
      if(source.kind==='npm' && !source.reliable && (!state.records[item.file].source.reliable || !sameRevision(state.records[item.file].source,source))) {
        const result=execFileSync(process.execPath,[fileURLToPath(new URL('./pi-package-driver.mjs',import.meta.url)),'reference',agent,process.cwd(),JSON.stringify(item)],{encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});
        state.installations=JSON.parse(result).installations;
      }
    }
    let result;
    if(action==='plan-batch') {
      const memo=new Map();result=item.map(value=>({file:value.file,...plan(value,state,mode,{memo})}));
      for(const value of result)state.records[value.file]=value.record;
    } else result=action==='plan'?plan(item,state,mode):action==='recover'?plan(item,state,state.records[item.file]?.mode,{recover:true}):observe(item,state.records,null,state.installations??{});
    process.stdout.write(JSON.stringify({state,result}));
  }catch(error){process.stderr.write(error.message);process.exitCode=1;}
}
